#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { ManualApprovalStep } from 'aws-cdk-lib/pipelines';
import ApplicationConfigBaseStage from 'cdk-libraries/lib/app-config-base-stage';
import ApplicationConfigEnvStage from 'cdk-libraries/lib/app-config-env-stage';
import PipelineStack from 'cdk-libraries/lib/pipeline-stack';
import StaticSiteAppStage from 'cdk-libraries/lib/static-site-app-stage';
import {
  addConfigStageOriginsToSite, configSetupStageProps, primaryEnv, secondaryEnv,
} from '../lib/common';
import { getPreviewConfigStageProps, previewSiteStageProps } from '../lib/env-preview';
import { getProductionConfigStageProps, productionSiteStageProps } from '../lib/env-production';

const app = new cdk.App();

const cdkAppPath = '_internals/static-site-stack';

const cdkLibPath = '_internals/cdk-libraries';

const configEnabled = app.node.tryGetContext('configEnabled') === true;

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
  sourceRepoBranch: 'refactor',
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
    'npm run build',
    'npm run cdk synth --'
      + ' -c configEnabled=$CONFIG_ENABLED'
      + ' -c mainAccountId=$ACCOUNT_ID'
      + ' -c sourceConnectionArn=$SOURCE_CONNECTION_ARN'
      + ' -c version=$CODEBUILD_RESOLVED_SOURCE_VERSION',
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
    CONFIG_ENABLED: configEnabled ? 'true' : 'false',
    SOURCE_CONNECTION_ARN: sourceConnectionArn,
  },
  synthOutputDir: `${cdkAppPath}/cdk.out`,
});

const stageProps: cdk.StageProps & { version?: string } = {
  env: { account: mainAccountId },
  version: stack.version,
};

const previewStage = new StaticSiteAppStage(app, 'StaticSite-Preview-Site', {
  ...stageProps,
  ...previewSiteStageProps,
  env: {
    ...stageProps.env,
    ...primaryEnv,
  },
  siteFailoverEnv: {
    ...stageProps.env,
    ...secondaryEnv,
  },
});

const productionStage = new StaticSiteAppStage(app, 'StaticSite-Production-Site', {
  ...stageProps,
  ...productionSiteStageProps,
  env: {
    ...stageProps.env,
    ...primaryEnv,
  },
  siteFailoverEnv: {
    ...stageProps.env,
    ...secondaryEnv,
  },
});

let configSetupStages: ApplicationConfigBaseStage[] | undefined;
let previewConfigStage: ApplicationConfigEnvStage | undefined;
let productionConfigStage: ApplicationConfigEnvStage | undefined;

if (configEnabled) {
  configSetupStages = [primaryEnv, secondaryEnv].map(
    (configEnv) => new ApplicationConfigBaseStage(
      app,
      `StaticSite-Common-Config-${configEnv.description}`,
      {
        ...stageProps,
        ...configSetupStageProps,
        env: {
          ...stageProps.env,
          ...configEnv,
        },
      },
    ),
  );

  if (configSetupStages) {
    const primaryAppId = configSetupStages[0].appId;
    const secondaryAppId = configSetupStages.at(1)?.appId;

    previewConfigStage = new ApplicationConfigEnvStage(
      app,
      'StaticSite-Preview-Config',
      getPreviewConfigStageProps(primaryAppId, secondaryAppId),
    );

    productionConfigStage = new ApplicationConfigEnvStage(
      app,
      'StaticSite-Production-Config',
      getProductionConfigStageProps(primaryAppId, secondaryAppId),
    );

    const configSetupWave = stack.pipeline.addWave('StaticSite-Common-Config');
    configSetupStages?.map((stage) => configSetupWave.addStage(stage));
  }
}

if (previewConfigStage) {
  stack.pipeline.addStage(previewConfigStage);
  addConfigStageOriginsToSite(mainAccountId, previewConfigStage, previewStage);
}
stack.pipeline.addStage(previewStage);

if (productionConfigStage) {
  stack.pipeline.addStage(productionConfigStage, {
    pre: [new ManualApprovalStep('ManualApproval')],
  });
  addConfigStageOriginsToSite(mainAccountId, productionConfigStage, productionStage);
}
stack.pipeline.addStage(productionStage, {
  pre: productionConfigStage ? [] : [
    new ManualApprovalStep('ManualApproval'),
  ],
});
