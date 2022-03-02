import { Stage, StageProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { StaticSiteStack, StaticSiteStackProps } from './static-site-stack';

export interface StaticSiteAppStageProps extends StageProps {
  siteProps?: StaticSiteStackProps
}

export class StaticSiteAppStage extends Stage {
  constructor(scope: Construct, id: string, props?: StaticSiteAppStageProps) {
    super(scope, id, props);

    new StaticSiteStack(this, 'Site', props?.siteProps);
  }
}
