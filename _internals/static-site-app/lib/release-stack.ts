import { Stack, StackProps } from 'aws-cdk-lib';
import {
  BuildSpec, Project, Source,
} from 'aws-cdk-lib/aws-codebuild';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Bucket, IBucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { siteArtifactsPrefix, sourceRepo } from './common';

export interface StaticSiteReleaseStackProps extends StackProps {
  artifactsBucketName: string
}

export default class StaticSiteReleaseStack extends Stack {
  public readonly releasesBucket: IBucket;

  constructor(scope: Construct, id: string, props: StaticSiteReleaseStackProps) {
    super(scope, id, props);

    const artifactsBucket = Bucket.fromBucketName(
      this,
      'ArtifactsBucket',
      props.artifactsBucketName,
    );

    this.releasesBucket = new Bucket(this, 'ReleaseBucket');

    const artifactsPath = artifactsBucket.s3UrlForObject(siteArtifactsPrefix);

    const releasePath = this.releasesBucket.s3UrlForObject(siteArtifactsPrefix);

    const siteReleaseProject = new Project(this, 'SiteRelease', {
      environmentVariables: {
        ARTIFACTS_PATH: { value: artifactsPath },
        RELEASE_PATH: { value: releasePath },
      },
      buildSpec: BuildSpec.fromObject({
        phases: {
          build: {
            commands: [
              'npx semantic-release',
              'VERSION=$(git tag --points-at)',
              'COMMIT=$(git rev-parse HEAD)',
              'aws s3 cp "$ARTIFACTS_PATH/$COMMIT" artifact.zip',
              'aws s3 cp artifact.zip "$RELEASE_PATH/$VERSION"',
            ],
          },
        },
      }),
      projectName: 'static-site-release-site',
      source: Source.gitHub({
        owner: sourceRepo.split('/')[0],
        repo: sourceRepo.split('/')[1],
      }),
    });

    siteReleaseProject.addToRolePolicy(new PolicyStatement({
      actions: [
        's3:GetObject',
        's3:ListBucket',
      ],
      resources: [
        artifactsBucket.bucketArn,
        artifactsBucket.arnForObjects(`${siteArtifactsPrefix}/*`),
      ],
    }));

    siteReleaseProject.addToRolePolicy(new PolicyStatement({
      actions: [
        's3:GetObject',
        's3:ListBucket',
        's3:PutObject',
      ],
      resources: [
        this.releasesBucket.bucketArn,
        this.releasesBucket.arnForObjects(`${siteArtifactsPrefix}/*`),
      ],
    }));
  }
}
