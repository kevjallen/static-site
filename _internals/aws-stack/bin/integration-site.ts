#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { StaticSiteStack } from '../lib/static-site-stack';
import integrationSiteProps from './integration';

const app = new cdk.App();

const integrationSubdomain = app.node.tryGetContext('subdomain');

new StaticSiteStack(app, `Integration-StaticSite-${integrationSubdomain}`, {
  ...integrationSiteProps,
  subdomain: integrationSubdomain,
});
