import { Stage, StageProps, Tags } from 'aws-cdk-lib';
import { HttpOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { Construct } from 'constructs';
import { ViewerProtocolPolicy } from 'aws-cdk-lib/aws-cloudfront';
import { AppConfigStack, AppConfigStackProps } from './app-config-stack';
import { StaticSiteStack, StaticSiteStackProps } from './static-site-stack';

export interface StaticSiteAppStageProps extends StageProps {
  appConfigProps?: AppConfigStackProps
  siteProps?: StaticSiteStackProps
  version?: string
}

export class StaticSiteAppStage extends Stage {
  constructor(scope: Construct, id: string, props: StaticSiteAppStageProps) {
    super(scope, id, props);

    let configStack: AppConfigStack | undefined;

    if (props.appConfigProps) {
      configStack = new AppConfigStack(this, 'Config', props.appConfigProps);
    }

    const siteStack = new StaticSiteStack(this, 'Site', props?.siteProps);

    if (configStack) {
      siteStack.distribution.addBehavior(
        '/config',
        new HttpOrigin(configStack.apiDomain),
        {
          viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
      );
    }

    if (props?.version) {
      Tags.of(this).add('version', props.version);
    }
  }
}
