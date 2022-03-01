import { Stage, StageProps } from 'aws-cdk-lib';
import { ManualApprovalStep } from 'aws-cdk-lib/pipelines';
import { Construct } from 'constructs';
import { StaticSiteStack, StaticSiteStackProps } from './static-site-stack';

export interface StaticSiteAppStageProps extends StageProps {
  approvalRequired?: boolean
  siteProps?: StaticSiteStackProps
}

export class StaticSiteAppStage extends Stage {
  constructor(scope: Construct, id: string, props?: StaticSiteAppStageProps) {
    super(scope, id, props);

    if (props?.approvalRequired) {
      new ManualApprovalStep('ManualApproval');
    }
    new StaticSiteStack(this, 'StaticSite', props?.siteProps);
  }
}
