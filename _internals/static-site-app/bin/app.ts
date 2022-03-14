#!/usr/bin/env node

import { App, StageProps } from 'aws-cdk-lib';
import StaticSiteAppStage from 'cdk-libraries/lib/static-site-app-stage';
import previewStageProps from '../lib/env-preview';
import productionStageProps from '../lib/env-production';
import StaticSitePipeline from '../lib/static-site-pipeline';

const app = new App();

const mainAccountId = app.node.tryGetContext('mainAccountId');

const sourceConnectionArn = app.node.tryGetContext('sourceConnectionArn');

const version = app.node.tryGetContext('version');

const platform = new StaticSitePipeline(app, 'StaticSitePlatformPipeline', {
  env: {
    account: mainAccountId,
    region: 'us-east-2',
  },
  sourceConnectionArn,
  pipelineName: 'static-site-platform',
  version,
});

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
platform.addStage(previewStage);

const productionStage = new StaticSiteAppStage(app, 'StaticSite-Production', {
  ...stageProps,
  ...productionStageProps,
  env: {
    ...stageProps.env,
    ...productionStageProps.env,
  },
});
platform.addAutoDisableStage(productionStage, 'Production');

platform.buildPipeline();
