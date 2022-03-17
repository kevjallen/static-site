#!/usr/bin/env node

import { App, Environment } from 'aws-cdk-lib';
import { Source, FilterGroup, EventAction } from 'aws-cdk-lib/aws-codebuild';
import { ApplicationConfigDeployStackProps } from 'cdk-libraries/lib/app-config-deploy-stack';
import StaticSiteAppStage from 'cdk-libraries/lib/static-site-app-stage';
import StaticSiteDeployStage from 'cdk-libraries/lib/static-site-deploy-stage';
import StaticSiteBuildStage from '../lib/build-stage';
import { siteArtifactsPrefix, sourceRepo } from '../lib/common';
import previewStageProps from '../lib/env-preview';
import productionStageProps from '../lib/env-production';
import StaticSitePipelineStack from '../lib/pipeline-stack';

const app = new App();

const mainAccountId = app.node.tryGetContext('mainAccountId');

const sourceConnectionArn = app.node.tryGetContext('sourceConnectionArn');

const version = app.node.tryGetContext('version');

const automationEnv: Required<Environment> = {
  account: mainAccountId,
  region: 'us-east-2',
};

const buildPipeline = new StaticSitePipelineStack(
  app,
  'StaticSiteBuildPipeline',
  {
    env: automationEnv,
    pipelineName: 'static-site-build',
    sourceConnectionArn,
    version,
  },
);

const artifactsBucketParamName = 'static-site-artifacts-bucket';

const releasesBucketParamName = 'static-site-releases-bucket';

const buildStage = new StaticSiteBuildStage(app, 'StaticSite-Build', {
  artifactsBucketParamName,
  releasesBucketParamName,
  env: automationEnv,
  sourceConnectionArn,
  version,
});
buildPipeline.addStage(buildStage);

const platformPipeline = new StaticSitePipelineStack(
  app,
  'StaticSitePlatformPipeline',
  {
    env: automationEnv,
    sourceConnectionArn,
    pipelineName: 'static-site-platform',
    version,
  },
);

const previewStage = new StaticSiteAppStage(app, 'StaticSite-Preview', {
  ...previewStageProps,
  env: {
    ...previewStageProps.env,
    account: mainAccountId,
  },
  version,
});
platformPipeline.addStage(previewStage);

const productionStage = new StaticSiteAppStage(app, 'StaticSite-Production', {
  ...productionStageProps,
  env: {
    ...productionStageProps.env,
    account: mainAccountId,
  },
  version,
});
platformPipeline.addAutoDisableStage(productionStage, 'Production');

platformPipeline.buildPipeline();

const deployPipeline = new StaticSitePipelineStack(
  app,
  'StaticSiteDeployPipeline',
  {
    env: automationEnv,
    pipelineName: 'static-site-deploy',
    sourceConnectionArn,
  },
);

const previewPathToConfig = '_internals/static-site-config/env/preview.json';

const previewConfigDeployProps: Partial<ApplicationConfigDeployStackProps> = {
  pathToConfig: previewPathToConfig,
  source: Source.gitHub({
    owner: sourceRepo.split('/')[0],
    repo: sourceRepo.split('/')[1],
    webhookFilters: [
      FilterGroup.inEventOf(EventAction.PUSH).andFilePathIs(
        previewPathToConfig,
      ),
    ],
  }),
};

const previewConfigDeploySource: Source = Source.gitHub({
  owner: sourceRepo.split('/')[0],
  repo: sourceRepo.split('/')[1],
  webhookFilters: !previewConfigDeployProps.pathToConfig ? [] : [
    FilterGroup.inEventOf(EventAction.PUSH).andFilePathIs(
      previewConfigDeployProps.pathToConfig,
    )
  ],
});

const previewDeployStage = new StaticSiteDeployStage(
  app,
  'StaticSite-PreviewDeploy',
  {
    artifactsBucketParamName,
    artifactsBucketEnv: {
      account: buildStage.account,
      region: buildStage.region,
    },
    artifactsPrefix: siteArtifactsPrefix,
    configDeployProps: !previewStage.configStack ? undefined : {
      ...previewConfigDeployProps as ApplicationConfigDeployStackProps,
      applicationId: previewStage.configStack.applicationId,
      deployEnvironmentId: previewStage.configStack.environmentId,
      configProfileId: previewStage.configStack.envConfigProfileId,
      source: previewConfigDeploySource,
    },
    configFailoverDeployProps: !previewStage.configFailoverStack ? undefined : {
      ...previewConfigDeployProps as ApplicationConfigDeployStackProps,
      applicationId: previewStage.configFailoverStack.applicationId,
      deployEnvironmentId: previewStage.configFailoverStack.environmentId,
      configProfileId: previewStage.configFailoverStack.envConfigProfileId,
      env: previewStageProps.configFailoverProps?.env,
      source: previewConfigDeploySource,
    },
    env: {
      account: previewStage.account,
      region: previewStage.region,
    },
    failoverBucketParamName: previewStageProps.siteFailoverBucketParamName,
    failoverBucketEnv: previewStageProps.siteFailoverEnv,
    projectName: 'static-site-preview-deploy',
    siteBucketName: previewStage.siteBucketName,
    siteDistributionId: previewStage.distributionId,
  },
);
deployPipeline.addAutoDisableStage(previewDeployStage, 'Dependencies');
