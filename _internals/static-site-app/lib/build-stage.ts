import { Stage, StageProps, Tags } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import StaticSiteArtifactsStack from './artifacts-stack';
import StaticSiteIntegrationStack from './integration-stack';

export interface StaticSiteBuildStageProps extends StageProps {
  env: {
    account: string
    region?: string
  }
  sourceConnectionArn: string
  version?: string
}

export default class StaticSiteBuildStage extends Stage {
  constructor(scope: Construct, id: string, props: StaticSiteBuildStageProps) {
    super(scope, id, props);

    new StaticSiteIntegrationStack(this, 'Integration', {
      env: props.env,
      sourceConnectionArn: props.sourceConnectionArn,
    });

    new StaticSiteArtifactsStack(this, 'Artifacts');

    if (props?.version) {
      Tags.of(this).add('version', props.version);
    }
  }
}