#!/usr/bin/env node
import { Duration, Environment } from 'aws-cdk-lib';
import { StageOptions } from 'aws-cdk-lib/aws-apigateway';
import { HeadersFrameOption, HeadersReferrerPolicy } from 'aws-cdk-lib/aws-cloudfront';
import ApplicationConfigBaseStage, {
  ApplicationConfigBaseStageProps,
} from 'cdk-libraries/lib/app-config-base-stage';
import { StaticSiteStackProps } from 'cdk-libraries/lib/static-site-stack';
import { Construct } from 'constructs';

export type StaticSiteEnvironment = Environment & {
  description: string,
  configLayerVersionArn: string,
};

export const primaryEnv: StaticSiteEnvironment = {
  region: 'us-east-2',
  description: 'Primary',
  configLayerVersionArn:
    'arn:aws:lambda:us-east-2:728743619870:layer:AWS-AppConfig-Extension:47',
};

export const secondaryEnv: StaticSiteEnvironment = {
  region: 'us-east-1',
  description: 'Secondary',
  configLayerVersionArn:
    'arn:aws:lambda:us-east-1:027255383542:layer:AWS-AppConfig-Extension:61',
};

export const commonConfigProps: ApplicationConfigBaseStageProps = {
  appName: 'static-site',
  appDescription: 'static site runtime config',
};

export const commonConfigRestApiOptions: StageOptions = {
  cacheClusterEnabled: true,
  cacheDataEncrypted: true,
  cachingEnabled: true,
  cacheTtl: Duration.minutes(5),
};

export function createConfigSetupStages(
  scope: Construct,
  props?: Partial<ApplicationConfigBaseStageProps>,
): ApplicationConfigBaseStage[] {
  return [primaryEnv, secondaryEnv].map(
    (configEnv) => new ApplicationConfigBaseStage(
      scope,
      `StaticSite-Common-Config-${configEnv.description}`,
      {
        ...commonConfigProps,
        ...props,
        env: {
          ...configEnv,
          ...props?.env,
        },
      },
    ),
  );
}

export const commonSiteProps: StaticSiteStackProps = {
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
