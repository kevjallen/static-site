import ApplicationConfigEnvStage, {
  ApplicationConfigEnvStageProps 
} from 'cdk-libraries/lib/app-config-env-stage';
import StaticSiteAppStage, { 
  StaticSiteAppStageProps 
} from 'cdk-libraries/lib/static-site-app-stage'
import { Construct } from 'constructs';
import { version } from 'os';
import { commonSiteProps, commonConfigRestApiOptions, primaryEnv, secondaryEnv } from '../common';

export default function createPreviewSiteStage(
  scope: Construct, 
  props?: Partial<StaticSiteAppStageProps>
): StaticSiteAppStage {
  return new StaticSiteAppStage(
    scope, 
    'StaticSite-Preview-Site', 
    {
      siteFailoverEnv: {
        ...secondaryEnv,
        ...props?.siteFailoverEnv,
      },
      siteProps: {
        ...commonSiteProps,
        ...props?.siteProps,
        domainName: 'site.kevjallen.com',
        hostedZoneId: 'Z07530401SXAC0E7PID8T',
        responseBehaviors: {
          ...commonSiteProps.responseBehaviors,
          ...props?.siteProps?.responseBehaviors,
          customHeaders: [{
            header: 'X-Robots-Tag',
            override: false,
            value: 'noindex',
          }],
        },
        subdomain: 'preview',
      },
      version: props?.version,
      env: {
        ...primaryEnv,
        ...props?.env,
      }
    }
  );
}

export function createPreviewConfigStage(
  scope: Construct,
  appId: string,
  props: Partial<ApplicationConfigEnvStageProps>
): ApplicationConfigEnvStage {
  return new ApplicationConfigEnvStage(
    scope, 
    'StaticSite-Preview-Config', 
    {
      configFailoverProps: {
        env: {
          ...secondaryEnv,
          ...props.configFailoverProps?.env
        },
        layerVersionArn: secondaryEnv.configLayerVersionArn,
        ...props.configFailoverProps,
      },
      configProps: {
        appId,
        envName: 'Preview',
        envProfileName: 'Preview',
        layerVersionArn: primaryEnv.configLayerVersionArn,
        restApiPrefix: 'static-site-preview',
        restApiOptions: commonConfigRestApiOptions,
        ...props.configProps
      },
      env: {
        ...primaryEnv,
        ...props?.env,
      },
      version: props.version,
    }
  );
}
