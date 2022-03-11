#!/usr/bin/env node
import { Duration, Environment } from 'aws-cdk-lib';
import { StageOptions } from 'aws-cdk-lib/aws-apigateway';
import {
  CachePolicy, HeadersFrameOption, HeadersReferrerPolicy,
} from 'aws-cdk-lib/aws-cloudfront';
import { HttpOrigin, OriginGroup } from 'aws-cdk-lib/aws-cloudfront-origins';
import { ApplicationConfigBaseStageProps } from 'cdk-libraries/lib/app-config-base-stage';
import ApplicationConfigEnvStage from 'cdk-libraries/lib/app-config-env-stage';
import SSMParameterReader from 'cdk-libraries/lib/ssm-param-reader';
import StaticSiteAppStage from 'cdk-libraries/lib/static-site-app-stage';
import { StaticSiteStackProps } from 'cdk-libraries/lib/static-site-stack';

export type StaticSiteEnvironment = Environment & {
  region: string,
  description: string,
  configLayerVersionArn: string,
};

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

export const configSetupStageProps: ApplicationConfigBaseStageProps = {
  appName: 'static-site',
  appDescription: 'static site runtime config',
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

export function addConfigStageOriginsToSite(
  account: string,
  configStage: ApplicationConfigEnvStage,
  siteStage: StaticSiteAppStage,
) {
  const configCachePolicy = new CachePolicy(
    siteStage.siteStack,
    'ConfigCachePolicy',
    {
      defaultTtl: Duration.minutes(5),
    },
  );
  const primaryEnvApiOrigin = new HttpOrigin(`${
    configStage.envApiId
  }.execute-api.${primaryEnv.region}.amazonaws.com`, {
    originPath: `/${configRestApiOptions.stageName}`,
  });
  const primaryflagsApiOrigin = new HttpOrigin(`${
    configStage.flagsApiId
  }.execute-api.${primaryEnv.region}.amazonaws.com`, {
    originPath: `/${configRestApiOptions.stageName}`,
  });
  if (
    configStage.envApiIdFailoverParameterName
    && configStage.flagsApiIdFailoverParameterName
  ) {
    const envApiIdFailoverReader = new SSMParameterReader(
      siteStage.siteStack,
      'EnvApiIdFailoverReader',
      {
        account,
        parameterName: configStage.envApiIdFailoverParameterName,
        region: secondaryEnv.region,
      },
    );
    const secondaryEnvApiOrigin = new HttpOrigin(`${
      envApiIdFailoverReader.getParameterValue()
    }.execute-api.${secondaryEnv.region}.amazonaws.com`, {
      originPath: `/${configRestApiOptions.stageName}`,
    });
    siteStage.addOriginGroup(
      '/config',
      new OriginGroup({
        primaryOrigin: primaryEnvApiOrigin,
        fallbackOrigin: secondaryEnvApiOrigin,
      }),
      {
        cachePolicy: configCachePolicy,
      },
    );
    const flagsApiIdFailoverReader = new SSMParameterReader(
      siteStage.siteStack,
      'FlagsApiIdFailoverReader',
      {
        account,
        parameterName: configStage.flagsApiIdFailoverParameterName,
        region: secondaryEnv.region,
      },
    );
    const secondaryFlagsApiOrigin = new HttpOrigin(`${
      flagsApiIdFailoverReader.getParameterValue()
    }.execute-api.${secondaryEnv.region}.amazonaws.com`, {
      originPath: `/${configRestApiOptions.stageName}`,
    });
    siteStage.addOriginGroup(
      '/flags',
      new OriginGroup({
        primaryOrigin: primaryflagsApiOrigin,
        fallbackOrigin: secondaryFlagsApiOrigin,
      }),
      {
        cachePolicy: configCachePolicy,
      },
    );
  } else {
    siteStage.addHttpOrigin(
      '/config',
      primaryEnvApiOrigin,
      {
        cachePolicy: configCachePolicy,
      },
    );
    siteStage.addHttpOrigin(
      '/flags',
      primaryflagsApiOrigin,
      {
        cachePolicy: configCachePolicy,
      },
    );
  }
}
