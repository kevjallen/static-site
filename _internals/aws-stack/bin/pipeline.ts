#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { ManualApprovalStep } from 'aws-cdk-lib/pipelines';
import { PipelineStack } from '../lib/pipeline-stack';
import { StaticSiteAppStage } from '../lib/static-site-app-stage';
import commonSiteProps from './common-site-props';

const app = new cdk.App();

const cdkAppPath = '_internals/aws-stack';

const account = process.env.CDK_DEPLOY_ACCOUNT || process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEPLOY_REGION || process.env.CDK_DEFAULT_REGION;

const sourceConnectionId = 'bad4ffec-6d29-4b6a-bf2a-c4718648d78e';
const sourceRepo = 'kevjallen/static-site';

const stack = new PipelineStack(app, 'StaticSitePipeline', {
  sourceConnectionArn:
    `arn:aws:codestar-connections:${region}:${account}:connection/${sourceConnectionId}`,
  sourceRepo,
  synthCommands: [
    'bundle install',
    'bundle exec jekyll build',
    `cd ${cdkAppPath}`,
    'npm install',
    'npm run lint',
    'npm run test',
    'npm run cdk synth',
    `npx semantic-release --repositoryUrl https://github.com/${sourceRepo}.git`,
  ],
  buildImageFromEcr: 'ubuntu-build:v1.1.2',
  gitHubTokenSecretName: 'github-token',
  installCommands: [
    '. $ASDF_SCRIPT && asdf install',
  ],
  pipelineName: 'static-site',
  synthCommandShell: 'bash',
  synthEnv: {
    ASDF_SCRIPT: '/root/.asdf/asdf.sh',
  },
  synthOutputDir: `${cdkAppPath}/cdk.out`,
});

const previewStage = new StaticSiteAppStage(app, 'StaticSite-Preview', {
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
});
stack.pipeline.addStage(previewStage);

const productionStage = new StaticSiteAppStage(app, 'StaticSite-Production', {
  siteProps: {
    ...commonSiteProps,
    domainName: 'site.kevjallen.com',
    hostedZoneId: 'Z07530401SXAC0E7PID8T',
  },
});
stack.pipeline.addStage(productionStage, {
  pre: [new ManualApprovalStep('ManualApproval')],
});

stack.buildPipeline();
