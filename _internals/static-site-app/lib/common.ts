#!/usr/bin/env node
import { Duration, Environment } from 'aws-cdk-lib';
import { StageOptions } from 'aws-cdk-lib/aws-apigateway';
import {
  CachePolicyProps, HeadersFrameOption, HeadersReferrerPolicy,
} from 'aws-cdk-lib/aws-cloudfront';
import { ApplicationConfigStackProps } from 'cdk-libraries/lib/app-config-stack';
import { StaticSiteStackProps } from 'cdk-libraries/lib/static-site-stack';

export type StaticSiteEnvironment = Environment & {
  region: string,
  configLayerVersionArn: string,
};

export const cdkAppPath = '_internals/static-site-app';

export const cdkLibPath = '_internals/cdk-libraries';

export const domainName = 'site.kevjallen.com';

export const sourceRepo = 'kevjallen/static-site';

export const primaryEnv: StaticSiteEnvironment = {
  region: 'us-east-2',
  configLayerVersionArn:
    'arn:aws:lambda:us-east-2:728743619870:layer:AWS-AppConfig-Extension:47',
};

export const secondaryEnv: StaticSiteEnvironment = {
  region: 'us-east-1',
  configLayerVersionArn:
    'arn:aws:lambda:us-east-1:027255383542:layer:AWS-AppConfig-Extension:61',
};

export const siteArtifactsPrefix = 'Site';

export const configCachePolicyProps: CachePolicyProps = {
  defaultTtl: Duration.minutes(5),
};

export const configFailoverProps: Partial<ApplicationConfigStackProps> = {
  env: secondaryEnv,
  layerVersionArn: secondaryEnv.configLayerVersionArn,
};

export const configRestApiOptions: StageOptions = {
  stageName: 'api',
};

export const siteProps: StaticSiteStackProps = {
  domainName,
  forceDestroy: true,
  hostedZoneId: 'Z07530401SXAC0E7PID8T',
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
