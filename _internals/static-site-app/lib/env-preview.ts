import { 
  StaticSiteAppStageProps 
} from 'cdk-libraries/lib/static-site-app-stage';
import { 
  ApplicationConfigEnvStageProps 
} from 'cdk-libraries/lib/app-config-env-stage';
import {
  configRestApiOptions, siteProps, primaryEnv, secondaryEnv,
} from './common';

export const previewSiteStageProps: StaticSiteAppStageProps = {
  env: primaryEnv,
  siteFailoverEnv: secondaryEnv,
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

export function getPreviewConfigStageProps(
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
      envName: 'Preview',
      envProfileName: 'Preview',
      layerVersionArn: primaryEnv.configLayerVersionArn,
      restApiOptions: configRestApiOptions,
      restApiPrefix: 'static-site-preview',
    },
    env: primaryEnv,
  };
}
