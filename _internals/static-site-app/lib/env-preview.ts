import {
  StaticSiteAppStageProps,
} from 'cdk-libraries/lib/static-site-app-stage';
import { ApplicationConfigStackProps } from 'cdk-libraries/lib/app-config-stack';
import {
  configRestApiOptions, siteProps, primaryEnv, secondaryEnv,
} from './common';

export const previewSiteStageProps: StaticSiteAppStageProps = {
  env: {
    ...primaryEnv,
  },
  siteFailoverEnv: {
    ...secondaryEnv,
  },
  siteProps: {
    ...siteProps,
    domainName: 'site.kevjallen.com',
    hostedZoneId: 'Z07530401SXAC0E7PID8T',
    responseBehaviors: {
      ...siteProps.responseBehaviors,
      customHeaders: [
        {
          header: 'X-Robots-Tag',
          override: false,
          value: 'noindex',
        },
      ],
    },
    subdomain: 'preview',
  },
};

export const previewConfigStackProps: ApplicationConfigStackProps = {
  appName: 'static-site-preview',
  env: {
    ...primaryEnv,
  },
  envName: 'Preview',
  layerVersionArn: primaryEnv.configLayerVersionArn,
  restApiOptions: configRestApiOptions,
  restApiPrefix: 'static-site-preview',
};
