import StaticSiteAppStage, { 
  StaticSiteAppStageProps 
} from 'cdk-libraries/lib/static-site-app-stage'
import { Construct } from 'constructs';
import { commonSiteProps, primaryEnv, secondaryEnv } from '../common';

export default function createProductionSiteStage(
  scope: Construct, 
  props?: Partial<StaticSiteAppStageProps>
): StaticSiteAppStage {
  return new StaticSiteAppStage(
    scope, 
    'StaticSite-Production-Site', 
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
        },
      },
      version: props?.version,
      env: {
        ...primaryEnv,
        ...props?.env,
      }
    }
  );
}

