import { Stage, StageProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { StaticSiteStack, StaticSiteStackProps } from './static-site-stack';

export type StaticSiteAppStageProps = StaticSiteStackProps & StageProps

export class StaticSiteAppStage extends Stage {
  constructor(scope: Construct, id: string, props?: StaticSiteAppStageProps) {
    super(scope, id, props);

    new StaticSiteStack(this, 'StaticSiteStack', props);
  }
}
