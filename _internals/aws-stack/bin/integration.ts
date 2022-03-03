#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import { IntegrationStack } from '../lib/integration-stack';
import { StaticSiteStackProps } from '../lib/static-site-stack';
import commonSiteProps from './common-site-props';

const integrationSiteProps: StaticSiteStackProps = {
  ...commonSiteProps,
  domainName: 'int.site.kevjallen.com',
  hostedZoneId: 'Z0752470RYN8FJ23G0OE',
};
export default integrationSiteProps;

const app = new cdk.App();

const cdkProjectPath = '_internals/aws-stack';

new IntegrationStack(app, 'StaticSiteIntegrationPipeline', {
  buildImageFromEcr: 'ubuntu-build:v1.1.2',
  cleanUpCommands: [
    `cd ${cdkProjectPath}`,
    'npm install',
    // destroy live integration site
    'npm run cdk destroy -- --force --app="$INTEGRATION_SITE_APP"'
      + ' -c subdomain="$CODEBUILD_RESOLVED_SOURCE_VERSION"',
  ],
  gitHubRepoFullName: 'kevjallen/static-site',
  installCommands: [
    '. $ASDF_SCRIPT && asdf install',
  ],
  integrationCommands: [
    'git config --global user.name "codebuild"',
    `git config --global user.email "codebuild@${integrationSiteProps.domainName}"`,
    // simulate merge into trunk branch
    'git checkout $CODEBUILD_WEBHOOK_BASE_REF',
    'git merge --no-commit --no-ff $CODEBUILD_RESOLVED_SOURCE_VERSION',
    // build site
    'bundle install',
    'bundle exec jekyll build',
    // CDK integration
    `cd ${cdkProjectPath}`,
    'npm install',
    'npm run lint',
    'npm run test',
    'npm run cdk synth',
    // deploy and test live integration site
    'npm run cdk deploy -- --app="$INTEGRATION_SITE_APP"'
      + ' -c subdomain="$CODEBUILD_RESOLVED_SOURCE_VERSION"',
    'curl -sf "https://$CODEBUILD_RESOLVED_SOURCE_VERSION'
      + `.${integrationSiteProps.domainName}"`,
  ],
  integrationCommandShell: 'bash',
  integrationVars: {
    ASDF_SCRIPT: '/root/.asdf/asdf.sh',
    INTEGRATION_SITE_APP: 'npx ts-node --prefer-ts-exts bin/integration-site.ts',
  },
  projectName: 'static-site-integration',
  webhookFilters: [
    codebuild.FilterGroup.inEventOf(
      codebuild.EventAction.PULL_REQUEST_CREATED,
      codebuild.EventAction.PULL_REQUEST_REOPENED,
      codebuild.EventAction.PULL_REQUEST_UPDATED,
    ),
  ],
});
