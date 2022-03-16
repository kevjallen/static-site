import {
  StaticSiteAppStageProps,
} from 'cdk-libraries/lib/static-site-app-stage';
import {
  configRestApiOptions, siteProps, primaryEnv, secondaryEnv,
  configCachePolicyProps, configFailoverProps,
} from './common';

const productionStageProps: StaticSiteAppStageProps = {
  configCachePolicyProps,
  configFailoverProps,
  configProps: {
    appName: 'static-site-production',
    envName: 'Production',
    layerVersionArn: primaryEnv.configLayerVersionArn,
    restApiOptions: configRestApiOptions,
    restApiPrefix: 'static-site-production',
  },
  env: primaryEnv,
  siteFailoverEnv: secondaryEnv,
  siteFailoverBucketParamName:
    'static-site-production-site-failover-bucket-name',
  siteProps,
};
export default productionStageProps;
