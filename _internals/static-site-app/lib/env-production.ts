import { 
  StaticSiteAppStageProps 
} from 'cdk-libraries/lib/static-site-app-stage';
import { 
  ApplicationConfigEnvStageProps 
} from 'cdk-libraries/lib/app-config-env-stage';
import {
  configRestApiOptions, siteProps, primaryEnv, secondaryEnv,
} from './common';

export const productionSiteStageProps: StaticSiteAppStageProps = {
  siteFailoverEnv: secondaryEnv,
  siteProps: {
    ...siteProps,
    domainName: 'site.kevjallen.com',
    hostedZoneId: 'Z07530401SXAC0E7PID8T',
  },
};

export function getProductionConfigStageProps(
  primaryAppId: string,
  secondaryAppId?: string,
): ApplicationConfigEnvStageProps {
  return {
    configFailoverProps: {
      appId: secondaryAppId,
      env: secondaryEnv,
      layerVersionArn: secondaryEnv.configLayerVersionArn,
    },
    configProps: {
      appId: primaryAppId,
      envName: 'Production',
      envProfileName: 'Production',
      layerVersionArn: primaryEnv.configLayerVersionArn,
      restApiOptions: configRestApiOptions,
      restApiPrefix: 'static-site-production',
    },
    env: primaryEnv,
  };
}
