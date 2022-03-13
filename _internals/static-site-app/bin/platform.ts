#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { Arn, Stack } from 'aws-cdk-lib';
import { BuildSpec, LinuxBuildImage } from 'aws-cdk-lib/aws-codebuild';
import { CfnPipeline } from 'aws-cdk-lib/aws-codepipeline';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import {
  CodeBuildStep, CodePipeline, CodePipelineSource,
} from 'aws-cdk-lib/pipelines';
import StaticSiteAppStage from 'cdk-libraries/lib/static-site-app-stage';
import {
  cdkAppPath, cdkLibPath, primaryEnv, secondaryEnv, sourceRepo,
} from '../lib/common';
import {
  previewConfigStackProps, previewSiteStageProps,
} from '../lib/env-preview';
import {
  productionConfigStackProps, productionSiteStageProps,
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
  crossAccountKeys: false,
  pipelineName,
  publishAssetsInParallel: false,
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
      + ' -c sourceConnectionArn=$SOURCE_CONNECTION_ARN'
      + ' -c version=$CODEBUILD_RESOLVED_SOURCE_VERSION',
    ],
    env: {
      ACCOUNT_ID: mainAccountId,
      ASDF_SCRIPT: '/root/.asdf/asdf.sh',
      CONFIG_ENABLED: configEnabled ? 'true' : 'false',
      SOURCE_CONNECTION_ARN: app.node.tryGetContext('sourceConnectionArn'),
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

const previewStage = new StaticSiteAppStage(app, 'StaticSite-Preview', {
  ...stageProps,
  ...previewSiteStageProps,
  configFailoverProps: !configEnabled ? undefined : {
    env: {
      ...stageProps.env,
      ...secondaryEnv,
    },
    layerVersionArn: secondaryEnv.configLayerVersionArn,
  },
  configProps: !configEnabled ? undefined : previewConfigStackProps,
  env: {
    ...stageProps.env,
    ...primaryEnv,
  },
  siteFailoverEnv: {
    ...stageProps.env,
    ...secondaryEnv,
  },
});

const productionStage = new StaticSiteAppStage(app, 'StaticSite-Production', {
  ...stageProps,
  ...productionSiteStageProps,
  configFailoverProps: !configEnabled ? undefined : {
    env: {
      ...stageProps.env,
      ...secondaryEnv,
    },
    layerVersionArn: secondaryEnv.configLayerVersionArn,
  },
  configProps: !configEnabled ? undefined : productionConfigStackProps,
  env: {
    ...stageProps.env,
    ...primaryEnv,
  },
  siteFailoverEnv: {
    ...stageProps.env,
    ...secondaryEnv,
  },
});

pipeline.addStage(previewStage);

pipeline.addStage(productionStage, {
  pre: [
    new CodeBuildStep('DisableTransition', {
      commands: [
        'aws codepipeline disable-stage-transition'
        + ` --pipeline-name ${pipelineName}`
        + ` --stage-name ${productionStage.stageName}`
        + ' --transition-type Inbound'
        + ' --reason "Production"',
      ],
      rolePolicyStatements: [
        new PolicyStatement({
          actions: [
            'codepipeline:EnableStageTransition',
            'codepipeline:DisableStageTransition',
          ],
          resources: [
            Arn.format({
              account: pipelineStack.account,
              partition: 'aws',
              region: pipelineStack.region,
              resource: pipelineName,
              resourceName: productionStage.stageName,
              service: 'codepipeline',
            }),
          ],
        }),
      ],
    }),
  ],
});

pipeline.buildPipeline();

const cfnPipeline = pipeline.pipeline.node.findChild('Resource') as CfnPipeline;

cfnPipeline.addPropertyOverride('DisableInboundStageTransitions', [
  {
    StageName: productionStage.stageName,
    Reason: 'Production',
  },
]);
