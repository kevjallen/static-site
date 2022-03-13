import {
  StaticSiteAppStageProps,
} from 'cdk-libraries/lib/static-site-app-stage';
import { ApplicationConfigStackProps } from 'cdk-libraries/lib/app-config-stack';
import {
  configRestApiOptions, siteProps, primaryEnv,
} from './common';

export const productionSiteStageProps: StaticSiteAppStageProps = {
  siteProps: {
    ...siteProps,
    domainName: 'site.kevjallen.com',
    hostedZoneId: 'Z07530401SXAC0E7PID8T',
  },
};

export const productionConfigStackProps: ApplicationConfigStackProps = {
  appName: 'static-site-production',
  envName: 'Production',
  layerVersionArn: primaryEnv.configLayerVersionArn,
  restApiOptions: configRestApiOptions,
  restApiPrefix: 'static-site-production',
};
