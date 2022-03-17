import { Stage, StageProps, Tags } from 'aws-cdk-lib';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import StaticSiteArtifactsStack from './artifacts-stack';
import StaticSiteIntegrationStack from './integration-stack';
import StaticSiteReleaseStack from './release-stack';

export interface StaticSiteBuildStageProps extends StageProps {
  artifactsBucketParamName: string
  env: {
    account: string
    region?: string
  }
  releasesBucketParamName: string
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

    const artifacts = new StaticSiteArtifactsStack(this, 'Artifacts');

    const release = new StaticSiteReleaseStack(this, 'Release', {
      artifactsBucketName: artifacts.artifactsBucket.bucketName,
    });

    new StringParameter(
      artifacts,
      'ArtifactsBucketParam',
      {
        parameterName: props.artifactsBucketParamName,
        stringValue: artifacts.artifactsBucket.bucketName,
      },
    );

    new StringParameter(
      release,
      'ReleaseBucketParam',
      {
        parameterName: props.releasesBucketParamName,
        stringValue: release.releasesBucket.bucketName,
      },
    );

    if (props?.version) {
      Tags.of(this).add('version', props.version);
    }
  }
}
