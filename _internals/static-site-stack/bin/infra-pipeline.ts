#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { ManualApprovalStep } from 'aws-cdk-lib/pipelines';
import PipelineStack from 'cdk-libraries/lib/pipeline-stack';
import { createConfigSetupStages } from '../lib/common';
import createPreviewSiteStage from '../lib/stages/preview';
import createProductionSiteStage from '../lib/stages/production';

const app = new cdk.App();

const cdkAppPath = '_internals/static-site-stack';
const cdkLibPath = '_internals/cdk-libraries';

const mainAccountId = app.node.tryGetContext('mainAccountId');

const sourceRepo = 'kevjallen/static-site';

const sourceConnectionArn = app.node.tryGetContext('sourceConnectionArn');

const pipelineEnv: Required<cdk.Environment> = {
  account: mainAccountId,
  region: 'us-east-2',
};

const stack = new PipelineStack(app, 'StaticSiteInfraPipeline', {
  sourceConnectionArn,
  sourceRepo,
  synthCommands: [
    `cd ${cdkLibPath}`,
    'npm install',
    'npm run lint',
    'npm run test',
    'npm run build',
    'npm pack',
    'cd $CODEBUILD_SRC_DIR',
    `cd ${cdkAppPath}`,
    'npm install',
    'npm run lint',
    'npm run test',
    'npm run build',
    'npm run cdk synth -- -c version=$CODEBUILD_RESOLVED_SOURCE_VERSION'
      + ' -c mainAccountId=$ACCOUNT_ID --quiet',
  ],
  buildImageFromEcr: 'ubuntu-build:v1.1.2',
  env: pipelineEnv,
  installCommands: [
    '. $ASDF_SCRIPT && asdf install',
  ],
  pipelineName: 'static-site',
  synthCommandShell: 'bash',
  synthEnv: {
    ACCOUNT_ID: pipelineEnv.account,
    ASDF_SCRIPT: '/root/.asdf/asdf.sh',
  },
  synthOutputDir: `${cdkAppPath}/cdk.out`,
});

const commonStageProps: cdk.StageProps & { version?: string } = {
  env: { account: mainAccountId },
  version: stack.version,
};

const setupWave = stack.pipeline.addWave('StaticSite-Setup');
createConfigSetupStages(app, commonStageProps).map(
  (setupStage) => setupWave.addStage(setupStage),
);

const previewStage = createPreviewSiteStage(app, commonStageProps);
stack.pipeline.addStage(previewStage);

const productionStage = createProductionSiteStage(app, commonStageProps);
stack.pipeline.addStage(productionStage, {
  pre: [new ManualApprovalStep('ManualApproval')],
});
