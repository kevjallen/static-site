import {
  StaticSiteAppStageProps,
} from 'cdk-libraries/lib/static-site-app-stage';
import {
  configRestApiOptions, siteProps, primaryEnv, secondaryEnv,
  configCachePolicyProps, configFailoverProps,
} from './common';

const previewStageProps: StaticSiteAppStageProps = {
  configCachePolicyProps,
  configFailoverProps,
  configProps: {
    appName: 'static-site-preview',
    envName: 'Preview',
    layerVersionArn: primaryEnv.configLayerVersionArn,
    restApiOptions: configRestApiOptions,
    restApiPrefix: 'static-site-preview',
  },
  env: primaryEnv,
  siteFailoverEnv: secondaryEnv,
  siteProps: {
    ...siteProps,
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
export default previewStageProps;
