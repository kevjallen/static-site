#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { CfnApplication } from 'aws-cdk-lib/aws-appconfig';

const app = new cdk.App();

const stack = new cdk.Stack(app, 'StaticSiteConfig');

new CfnApplication(stack, 'Application', {
  name: 'static-site',
  description: 'static site configuration',
});
