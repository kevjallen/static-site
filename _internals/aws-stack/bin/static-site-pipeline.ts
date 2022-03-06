#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { ManualApprovalStep } from 'aws-cdk-lib/pipelines';
import { PipelineStack } from '../lib/pipeline-stack';
import { StaticSiteAppStage } from '../lib/static-site-app-stage';
import { ApplicationConfigStage } from '../lib/app-config-stage';
import commonSiteProps from './common-site-props';

const app = new cdk.App();

const cdkAppPath = '_internals/aws-stack';

const primaryEnv = {
  account: app.node.tryGetContext('mainAccountId'),
  description: 'Ohio',
  region: 'us-east-2',
};

const secondaryEnv = {
  account: app.node.tryGetContext('mainAccountId'),
  description: 'Virginia',
  region: 'us-east-1',
};

const configEnvs = [
  primaryEnv,
  secondaryEnv,
];

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

configEnvs.map((configEnv) => setupWave.addStage(
  new ApplicationConfigStage(
    app,
    `StaticSite-Config-${configEnv.description}`,
    {
      appDescription: 'static-site runtime configuration',
      appName: 'static-site',
      env: configEnv,
    },
  ),
));

const previewStage = new StaticSiteAppStage(app, 'StaticSite-Preview', {
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

const productionStage = new StaticSiteAppStage(app, 'StaticSite-Production', {
  siteFailoverRegion: secondaryEnv.region,
  siteProps: {
    ...commonSiteProps,
    domainName: 'site.kevjallen.com',
    hostedZoneId: 'Z07530401SXAC0E7PID8T',
  },
  version: stack.version,
  env: primaryEnv,
});
stack.pipeline.addStage(productionStage, {
  pre: [new ManualApprovalStep('ManualApproval')],
});

stack.buildPipeline();
