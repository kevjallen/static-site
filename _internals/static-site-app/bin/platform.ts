#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { Stack } from 'aws-cdk-lib';
import { BuildSpec, LinuxBuildImage } from 'aws-cdk-lib/aws-codebuild';
import { CfnPipeline } from 'aws-cdk-lib/aws-codepipeline';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import {
  CodeBuildStep, CodePipeline, CodePipelineSource, ShellStep,
} from 'aws-cdk-lib/pipelines';
import ApplicationConfigBaseStage from 'cdk-libraries/lib/app-config-base-stage';
import ApplicationConfigEnvStage from 'cdk-libraries/lib/app-config-env-stage';
import StaticSiteAppStage from 'cdk-libraries/lib/static-site-app-stage';
import {
  cdkAppPath, cdkLibPath,
  configSetupStageProps, createConfigBehaviorOptions,
  primaryEnv, secondaryEnv, sourceRepo,
} from '../lib/common';
import {
  getPreviewConfigStageProps, previewSiteStageProps,
} from '../lib/env-preview';
import {
  getProductionConfigStageProps, productionSiteStageProps,
} from '../lib/env-production';

const app = new cdk.App();

const configEnabled = app.node.tryGetContext('configEnabled') === true
  || app.node.tryGetContext('configEnabled') === 'true';

const mainAccountId = app.node.tryGetContext('mainAccountId');

const pipelineStack = new Stack(app, 'StaticSitePlatformPipeline', {
  env: {
    account: mainAccountId,
    region: 'us-east-2',
  },
});

const buildImageRepo = Repository.fromRepositoryName(
  pipelineStack,
  'BuildImageRepository',
  'ubuntu-build',
);

const pipelineName = 'static-site-platform';

const pipeline = new CodePipeline(pipelineStack, 'Pipeline', {
  pipelineName,
  synth: new CodeBuildStep('Synthesize', {
    buildEnvironment: {
      buildImage: LinuxBuildImage.fromEcrRepository(buildImageRepo, 'v1.1.2'),
    },
    commands: [
      `cd ${cdkLibPath}`,
      'npm install',
      'npm run lint',
      'npm run test',
      'npm run build',
      'LIB_ARCHIVE=$PWD/$(npm pack)',
      `cd $CODEBUILD_SRC_DIR/${cdkAppPath}`,
      'npm install $LIB_ARCHIVE',
      'npm install',
      'npm run lint',
      'npm run build',
      'npm run cdk synth --'
      + ' -c configEnabled=$CONFIG_ENABLED'
      + ' -c mainAccountId=$ACCOUNT_ID'
      + ' -c version=$CODEBUILD_RESOLVED_SOURCE_VERSION',
    ],
    env: {
      ASDF_SCRIPT: '/root/.asdf/asdf.sh',
      CONFIG_ENABLED: configEnabled ? 'true' : 'false',
      ACCOUNT_ID: mainAccountId,
    },
    input: CodePipelineSource.connection(sourceRepo, 'master', {
      connectionArn: app.node.tryGetContext('sourceConnectionArn'),
      codeBuildCloneOutput: true,
    }),
    installCommands: [
      '. $ASDF_SCRIPT && asdf install',
    ],
    partialBuildSpec: BuildSpec.fromObject({
      env: {
        shell: 'bash',
      },
    }),
    primaryOutputDirectory: `${cdkAppPath}/cdk.out`,
    projectName: 'static-site-platform-synth',
  }),
});

const stageProps: cdk.StageProps & { version?: string } = {
  env: { account: mainAccountId },
  version: app.node.tryGetContext('version'),
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

    const configSetupWave = pipeline.addWave('StaticSite-Common-Config');
    configSetupStages.map((stage) => configSetupWave.addStage(stage));
  }
}

if (previewConfigStage) {
  pipeline.addStage(previewConfigStage);
  previewConfigStage.addConfigOriginsToSite(
    previewStage.siteStack,
    createConfigBehaviorOptions(previewStage.siteStack),
  );
}
pipeline.addStage(previewStage);

if (productionConfigStage) {
  pipeline.addStage(productionConfigStage, {
    post: [
      new ShellStep('DisableTransition', {
        commands: [
          'aws codepipeline disable-stage-transition'
          + ` --pipeline-name ${pipelineName}`
          + ` --stage-name ${productionConfigStage.stageName}`
          + ' --transition-type Inbound'
          + ' --reason "Production"',
        ],
      }),
    ],
  });
  productionConfigStage.addConfigOriginsToSite(
    productionStage.siteStack,
    createConfigBehaviorOptions(productionStage.siteStack),
  );
}
pipeline.addStage(productionStage, {
  post: productionConfigStage ? [] : [
    new ShellStep('DisableTransition', {
      commands: [
        'aws codepipeline disable-stage-transition'
        + ` --pipeline-name ${pipelineName}`
        + ` --stage-name ${productionStage.stageName}`
        + ' --transition-type Inbound'
        + ' --reason "Production"',
      ],
    }),
  ],
});

pipeline.buildPipeline();

const cfnPipeline = pipeline.pipeline.node.findChild('Resource') as CfnPipeline;

cfnPipeline.addPropertyOverride('DisableInboundStageTransitions', [
  {
    StageName: productionConfigStage ? 'StaticSite-Production-Config'
      : 'StaticSite-Production-Site',
    Reason: 'Production',
  },
]);
