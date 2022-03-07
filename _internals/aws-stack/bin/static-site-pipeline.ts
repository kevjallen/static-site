#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { ManualApprovalStep } from 'aws-cdk-lib/pipelines';
import { Duration } from 'aws-cdk-lib';
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
    'export JEKYLL_ENV=production',
    'bundle exec jekyll build --config _config.yml,_build.yml',
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
  `StaticSite-Common-Config-${primaryEnv.description}`,
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
  `StaticSite-Common-Config-${secondaryEnv.description}`,
  {
    appDescription: 'static-site runtime configuration',
    appName: 'static-site',
    env: secondaryEnv,
    version: stack.version,
  },
);
setupWave.addStage(secondaryConfigStage);

const previewConfigProps = {
  envName: 'Preview',
  envProfileName: 'Preview',
  restApiPrefix: 'static-site-preview',
};

const previewConfigStage = new ApplicationConfigEnvStage(
  app,
  'StaticSite-Preview-Config',
  {
    configProps: {
      ...previewConfigProps,
      appId: primaryConfigStage.appId,
      layerVersionArn: primaryEnv.appConfigLambdaLayer,
    },
    configFailoverProps: {
      ...previewConfigProps,
      appId: secondaryConfigStage.appId,
      layerVersionArn: secondaryEnv.appConfigLambdaLayer,
      env: secondaryEnv,
    },
    version: stack.version,
    env: primaryEnv,
  },
);
stack.pipeline.addStage(previewConfigStage);

const previewStage = new StaticSiteAppStage(app, 'StaticSite-Preview-Site', {
  configDefaultTtl: Duration.minutes(5),
  envConfigOriginProps: {
    apiId: previewConfigStage.envApiId,
    apiRegion: primaryEnv.region,
  },
  envConfigFailoverOriginProps:
    !previewConfigStage.envApiIdFailoverParameterName ? undefined : {
      apiIdParameterName: previewConfigStage.envApiIdFailoverParameterName,
      apiRegion: secondaryEnv.region,
      parameterReaderId: 'EnvConfigFailoverApiIdReader',
    },
  flagsConfigOriginProps: {
    apiId: previewConfigStage.flagsApiId,
    apiRegion: primaryEnv.region,
  },
  flagsConfigFailoverOriginProps:
    !previewConfigStage.flagsApiIdFailoverParameterName ? undefined : {
      apiIdParameterName: previewConfigStage.flagsApiIdFailoverParameterName,
      apiRegion: secondaryEnv.region,
      parameterReaderId: 'FlagsConfigFailoverApiIdReader',
    },
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
stack.pipeline.addStage(previewStage);

const productionConfigProps = {
  envName: 'Production',
  envProfileName: 'Production',
  restApiPrefix: 'static-site-production',
};

const productionConfigStage = new ApplicationConfigEnvStage(
  app,
  'StaticSite-Production-Config',
  {
    configProps: {
      ...productionConfigProps,
      appId: primaryConfigStage.appId,
      layerVersionArn: primaryEnv.appConfigLambdaLayer,
    },
    configFailoverProps: {
      ...productionConfigProps,
      appId: secondaryConfigStage.appId,
      layerVersionArn: secondaryEnv.appConfigLambdaLayer,
      env: secondaryEnv,
    },
    version: stack.version,
    env: primaryEnv,
  },
);
stack.pipeline.addStage(productionConfigStage, {
  pre: [new ManualApprovalStep('ManualApproval')],
});

const productionStage = new StaticSiteAppStage(app, 'StaticSite-Production-Site', {
  configDefaultTtl: Duration.minutes(5),
  envConfigOriginProps: {
    apiId: productionConfigStage.envApiId,
    apiRegion: primaryEnv.region,
  },
  envConfigFailoverOriginProps:
    !productionConfigStage.envApiIdFailoverParameterName ? undefined : {
      apiIdParameterName: productionConfigStage.envApiIdFailoverParameterName,
      apiRegion: secondaryEnv.region,
      parameterReaderId: 'EnvConfigFailoverApiIdReader',
    },
  flagsConfigOriginProps: {
    apiId: productionConfigStage.flagsApiId,
    apiRegion: primaryEnv.region,
  },
  flagsConfigFailoverOriginProps:
    !productionConfigStage.flagsApiIdFailoverParameterName ? undefined : {
      apiIdParameterName: productionConfigStage.flagsApiIdFailoverParameterName,
      apiRegion: secondaryEnv.region,
      parameterReaderId: 'FlagsConfigFailoverApiIdReader',
    },
  siteFailoverRegion: secondaryEnv.region,
  siteProps: {
    ...commonSiteProps,
    domainName: 'site.kevjallen.com',
    hostedZoneId: 'Z07530401SXAC0E7PID8T',
  },
  version: stack.version,
  env: primaryEnv,
});
stack.pipeline.addStage(productionStage);

stack.buildPipeline();
