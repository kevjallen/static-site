#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { PipelineStack } from '../lib/pipeline-stack';
import { StaticSiteAppStage } from '../lib/static-site-app-stage';
import commonSiteProps from './common-site-props';

const app = new cdk.App();
const cdkAppPath = '_internals/aws-stack';

const sourceConnectionId = 'bad4ffec-6d29-4b6a-bf2a-c4718648d78e';

const account = process.env.CDK_DEPLOY_ACCOUNT || process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEPLOY_REGION || process.env.CDK_DEFAULT_REGION;

const integrationSubdomain = Math.random().toString(36).slice(2);
const integrationStageName = `Integration-${integrationSubdomain}`;
const integrationStage = new StaticSiteAppStage(app, integrationStageName, {
  ...commonSiteProps,
});

new PipelineStack(app, 'StaticSitePipeline', {
  sourceConnectionArn:
    `arn:aws:codestar-connections:${region}:${account}:connection/${sourceConnectionId}`,
  sourceRepo: 'kevjallen/static-site',
  synthCommands: [
    'bundle install',
    'bundle exec jekyll build',
    `cd ${cdkAppPath}`,
    'npm install',
    'npm run lint',
    'npm run test',
    'npm run cdk synth',
  ],
  buildImageFromEcr: 'ubuntu-build:v1.1.2',
  installCommands: [
    '. $ASDF_SCRIPT && asdf install',
  ],
  integrationStage,
  pipelineName: 'static-site',
  sourceRepoBranch: 'cdk-pipelines',
  synthCommandShell: 'bash',
  synthEnv: {
    ASDF_SCRIPT: '/root/.asdf/asdf.sh',
  },
  synthOutputDir: `${cdkAppPath}/cdk.out`,
});
