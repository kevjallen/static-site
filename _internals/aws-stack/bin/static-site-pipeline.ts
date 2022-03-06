#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { ManualApprovalStep } from 'aws-cdk-lib/pipelines';
import { PipelineStack } from '../lib/pipeline-stack';
import { StaticSiteAppStage } from '../lib/static-site-app-stage';
import { ApplicationConfigBaseStage } from '../lib/app-config-base-stage';
import commonSiteProps from './common-site-props';
import { ApplicationConfigEnvStage } from '../lib/app-config-env-stage';

const app = new cdk.App();

const cdkAppPath = '_internals/aws-stack';

const primaryEnv = {
  account: app.node.tryGetContext('mainAccountId'),
  appConfigLambdaLayer:
    'arn:aws:lambda:us-east-2:728743619870:layer:AWS-AppConfig-Extension:47',
  description: 'Ohio',
  region: 'us-east-2',
};

const secondaryEnv = {
  account: app.node.tryGetContext('mainAccountId'),
  appConfigLambdaLayer:
    'arn:aws:lambda:us-east-1:027255383542:layer:AWS-AppConfig-Extension:61',
  description: 'Virginia',
  region: 'us-east-1',
};

const sourceConnectionId = 'bad4ffec-6d29-4b6a-bf2a-c4718648d78e';

const sourceRepo = 'kevjallen/static-site';

const stack = new PipelineStack(app, 'StaticSitePipeline', {
  sourceConnectionArn:
    `arn:aws:codestar-connections:${primaryEnv.region}:${primaryEnv.account}`
    + `:connection/${sourceConnectionId}`,
  sourceRepo,
  synthCommands: [
    'bundle install',
    'bundle exec jekyll build',
    `cd ${cdkAppPath}`,
    'npm install',
    'npm run lint',
    'npm run test',
    'npm run cdk synth -- --output=$(mktemp -d) -c mainAccountId=$ACCOUNT_ID --quiet',
    `git remote set-url origin https://$GITHUB_TOKEN@github.com/${sourceRepo}.git`,
    'npx semantic-release && VERSION=$(git tag --points-at)',
    'if [ -z "$VERSION" ]; then VERSION=$CODEBUILD_RESOLVED_SOURCE_VERSION; fi',
    'npm run cdk synth -- -c version=$VERSION -c mainAccountId=$ACCOUNT_ID --quiet',
  ],
  buildImageFromEcr: 'ubuntu-build:v1.1.2',
  gitHubTokenSecretName: 'github-token',
  installCommands: [
    '. $ASDF_SCRIPT && asdf install',
  ],
  pipelineName: 'static-site',
  synthCommandShell: 'bash',
  synthEnv: {
    ACCOUNT_ID: primaryEnv.account,
    ASDF_SCRIPT: '/root/.asdf/asdf.sh',
  },
  synthOutputDir: `${cdkAppPath}/cdk.out`,
  env: primaryEnv,
});

const setupWave = stack.pipeline.addWave('StaticSite-Setup');

const primaryConfigStage = new ApplicationConfigBaseStage(
  app,
  `StaticSite-Config-${primaryEnv.description}`,
  {
    appDescription: 'static-site runtime configuration',
    appName: 'static-site',
    env: primaryEnv,
    version: stack.version,
  },
);
setupWave.addStage(primaryConfigStage);

const secondaryConfigStage = new ApplicationConfigBaseStage(
  app,
  `StaticSite-Config-${secondaryEnv.description}`,
  {
    appDescription: 'static-site runtime configuration',
    appName: 'static-site',
    env: secondaryEnv,
    version: stack.version,
  },
);
setupWave.addStage(secondaryConfigStage);

const previewWave = stack.pipeline.addWave('StaticSite-Preview');

const previewConfigProps = {
  envName: 'Preview',
  envProfileName: 'Preview',
  restApiPrefix: 'static-site-preview',
};

const previewConfigStage = new ApplicationConfigEnvStage(
  app,
  'StaticSite-PreviewConfig',
  {
    configProps: {
      ...previewConfigProps,
      configAppIdParameterName: primaryConfigStage.configAppIdParameterName,
      layerVersionArn: primaryEnv.appConfigLambdaLayer,
    },
    configFailoverProps: {
      ...previewConfigProps,
      configAppIdParameterName: secondaryConfigStage.configAppIdParameterName,
      layerVersionArn: secondaryEnv.appConfigLambdaLayer,
      env: secondaryEnv,
    },
    version: stack.version,
    env: primaryEnv,
  },
);
previewWave.addStage(previewConfigStage);

const previewStage = new StaticSiteAppStage(app, 'StaticSite-PreviewSite', {
  configFailoverRegion: secondaryEnv.region,
  envConfigDomainParameterName: previewConfigStage.envDomainParameterName,
  flagsConfigDomainParameterName: previewConfigStage.flagsDomainParameterName,
  siteFailoverRegion: secondaryEnv.region,
  siteProps: {
    ...commonSiteProps,
    domainName: 'site.kevjallen.com',
    hostedZoneId: 'Z07530401SXAC0E7PID8T',
    responseBehaviors: {
      ...commonSiteProps.responseBehaviors,
      customHeaders: [{
        header: 'X-Robots-Tag',
        override: false,
        value: 'noindex',
      }],
    },
    subdomain: 'preview',
  },
  version: stack.version,
  env: primaryEnv,
});
previewWave.addStage(previewStage);

const productionWave = stack.pipeline.addWave('StaticSite-Production', {
  pre: [new ManualApprovalStep('ManualApproval')],
});

const productionConfigProps = {
  envName: 'Production',
  envProfileName: 'Production',
  restApiPrefix: 'static-site-production',
};

const productionConfigStage = new ApplicationConfigEnvStage(
  app,
  'StaticSite-ProductionConfig',
  {
    configProps: {
      ...productionConfigProps,
      configAppIdParameterName: primaryConfigStage.configAppIdParameterName,
      layerVersionArn: primaryEnv.appConfigLambdaLayer,
    },
    configFailoverProps: {
      ...productionConfigProps,
      configAppIdParameterName: primaryConfigStage.configAppIdParameterName,
      layerVersionArn: secondaryEnv.appConfigLambdaLayer,
      env: secondaryEnv,
    },
    version: stack.version,
    env: primaryEnv,
  },
);
productionWave.addStage(productionConfigStage);

const productionStage = new StaticSiteAppStage(app, 'StaticSite-ProductionSite', {
  configFailoverRegion: secondaryEnv.region,
  envConfigDomainParameterName: productionConfigStage.envDomainParameterName,
  flagsConfigDomainParameterName: productionConfigStage.flagsDomainParameterName,
  siteFailoverRegion: secondaryEnv.region,
  siteProps: {
    ...commonSiteProps,
    domainName: 'site.kevjallen.com',
    hostedZoneId: 'Z07530401SXAC0E7PID8T',
  },
  version: stack.version,
  env: primaryEnv,
});
productionWave.addStage(productionStage);

stack.buildPipeline();
