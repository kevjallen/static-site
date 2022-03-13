#!/usr/bin/env node
import { Duration, Environment } from 'aws-cdk-lib';
import { StageOptions } from 'aws-cdk-lib/aws-apigateway';
import {
  AddBehaviorOptions, CachePolicy,
  HeadersFrameOption, HeadersReferrerPolicy,
} from 'aws-cdk-lib/aws-cloudfront';
import { StaticSiteStackProps } from 'cdk-libraries/lib/static-site-stack';
import { Construct } from 'constructs';

export type StaticSiteEnvironment = Environment & {
  region: string,
  description: string,
  configLayerVersionArn: string,
};

export const sourceRepo = 'kevjallen/static-site';

export const cdkAppPath = '_internals/static-site-app';

export const cdkLibPath = '_internals/cdk-libraries';

export const primaryEnv: StaticSiteEnvironment = {
  region: 'us-east-2',
  description: 'Main',
  configLayerVersionArn:
    'arn:aws:lambda:us-east-2:728743619870:layer:AWS-AppConfig-Extension:47',
};

export const secondaryEnv: StaticSiteEnvironment = {
  region: 'us-east-1',
  description: 'Failover',
  configLayerVersionArn:
    'arn:aws:lambda:us-east-1:027255383542:layer:AWS-AppConfig-Extension:61',
};

export const configRestApiOptions: StageOptions = {
  cacheClusterEnabled: true,
  cacheDataEncrypted: true,
  cacheTtl: Duration.minutes(5),
  cachingEnabled: true,
  stageName: 'api',
};

export const siteProps: StaticSiteStackProps = {
  forceDestroy: true,
  responseBehaviors: {
    securityHeaders: {
      contentTypeOptions: {
        override: false,
      },
      frameOptions: {
        frameOption: HeadersFrameOption.DENY,
        override: false,
      },
      referrerPolicy: {
        referrerPolicy: HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
        override: false,
      },
      strictTransportSecurity: {
        accessControlMaxAge: Duration.seconds(31536000),
        includeSubdomains: true,
        override: false,
      },
      xssProtection: {
        modeBlock: true,
        override: false,
        protection: true,
      },
    },
  },
};

export function createConfigBehaviorOptions(scope: Construct): AddBehaviorOptions {
  return {
    cachePolicy: new CachePolicy(scope, 'ConfigCachePolicy', {
      defaultTtl: Duration.minutes(5),
    }),
  };
}
