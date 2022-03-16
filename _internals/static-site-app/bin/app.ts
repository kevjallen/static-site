#!/usr/bin/env node

import { App, Environment } from 'aws-cdk-lib';
import StaticSiteAppStage from 'cdk-libraries/lib/static-site-app-stage';
import StaticSiteDeployStage from 'cdk-libraries/lib/static-site-deploy-stage';
import StaticSiteBuildStage from '../lib/build-stage';
import { siteArtifactsPrefix } from '../lib/common';
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

const buildStage = new StaticSiteBuildStage(app, 'StaticSite-Build', {
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

const previewDeployStage = new StaticSiteDeployStage(
  app,
  'StaticSite-PreviewDeploy',
  {
    artifactsBucketName: buildStage.artifactsBucketName,
    artifactsPrefix: siteArtifactsPrefix,
    env: {
      account: previewStage.account,
      region: previewStage.region,
    },
    failoverBucketName: previewStage.failoverBucketName,
    failoverBucketEnv: previewStageProps.siteFailoverEnv,
    siteBucketName: previewStage.siteBucketName,
    siteDistributionId: previewStage.distributionId,
  },
);
deployPipeline.addStage(previewDeployStage);
