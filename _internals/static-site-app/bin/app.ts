#!/usr/bin/env node

import { App, Environment, StageProps } from 'aws-cdk-lib';
import StaticSiteAppStage from 'cdk-libraries/lib/static-site-app-stage';
import StaticSiteBuildStage from '../lib/build-stage';
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

const stageProps: StageProps & { version?: string } = {
  env: { account: mainAccountId },
  version,
};

const previewStage = new StaticSiteAppStage(app, 'StaticSite-Preview', {
  ...stageProps,
  ...previewStageProps,
  env: {
    ...stageProps.env,
    ...previewStageProps.env,
  },
});
platformPipeline.addStage(previewStage);

const productionStage = new StaticSiteAppStage(app, 'StaticSite-Production', {
  ...stageProps,
  ...productionStageProps,
  env: {
    ...stageProps.env,
    ...productionStageProps.env,
  },
});
platformPipeline.addAutoDisableStage(productionStage, 'Production');

platformPipeline.buildPipeline();

const buildPipeline = new StaticSitePipelineStack(app, 'StaticSiteBuildPipeline', {
  env: automationEnv,
  pipelineName: 'static-site-build',
  sourceConnectionArn,
});

const buildStage = new StaticSiteBuildStage(app, 'StaticSite-Build', {
  env: automationEnv,
  sourceConnectionArn,
  version,
});
buildPipeline.addStage(buildStage);
