import {
  Arn,
  Environment, Stack, Stage, StageProps,
} from 'aws-cdk-lib';
import { BuildSpec, Project } from 'aws-cdk-lib/aws-codebuild';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface StaticSiteDeployStageProps extends StageProps {
  artifactsBucketName: string
  artifactsBucketEnv?: Environment
  artifactsPrefix?: string
  deployPrefix?: string
  invalidationPath?: string
  projectName?: string
  siteBucketName: string
  siteBucketEnv?: Environment
  siteDistributionId: string
}

export default class StaticSiteDeployStage extends Stage {
  constructor(scope: Construct, id: string, props: StaticSiteDeployStageProps) {
    super(scope, id, props);

    const deployStack = new Stack(this, 'SiteDeploy');

    const artifactsBucket = Bucket.fromBucketAttributes(
      deployStack,
      'ArtifactsBucket',
      {
        ...props.artifactsBucketEnv,
        bucketName: props.artifactsBucketName,
      },
    );

    const siteBucket = Bucket.fromBucketAttributes(
      deployStack,
      'SiteBucket',
      {
        ...props.siteBucketEnv,
        bucketName: props.siteBucketName,
      },
    );

    const artifactsPath = artifactsBucket.s3UrlForObject(props.artifactsPrefix);

    const deployPath = artifactsBucket.s3UrlForObject(props.deployPrefix);

    const deployProject = new Project(deployStack, 'DeployProject', {
      environmentVariables: {
        ARTIFACTS_PATH: { value: artifactsPath },
        DEPLOY_PATH: { value: deployPath },
        DISTRIBUTION_ID: { value: props.siteDistributionId },
        INVALIDATION_PATH: { value: props.invalidationPath || '/*' },
        VERSION: { value: 'latest' },
      },
      buildSpec: BuildSpec.fromObject({
        version: 0.2,
        phases: {
          build: {
            commands: [
              'if [ "$VERSION" -eq "latest" ]; then'
                + ' VERSION=$(aws s3 ls "$ARTIFACTS_PATH/"'
                + ' | sort | tail -n 1 | awk \'{print $4}\'); fi',
              'aws s3 cp "$ARTIFACTS_PATH/$VERSION" artifact.zip',
              'unzip artifact.zip -d artifact',
              'aws s3 rm --recursive "$DEPLOY_PATH/"',
              'aws s3 sync artifact "$DEPLOY_PATH/"',
              'INVALIDATION=$(aws cloudfront create-invalidation'
                + ' --distribution-id "$DISTRIBUTION_ID"'
                + ' --path "$INVALIDATION_PATH"'
                + ' | jq -r \'.Invalidation.Id\')',
              'aws cloudfront wait invalidation-completed'
                + ' --distribution-id "$DISTRIBUTION_ID"'
                + ' --id "$INVALIDATION"',
            ],
          },
        },
      }),
      projectName: props.projectName,
    });

    deployProject.addToRolePolicy(new PolicyStatement({
      actions: [
        'cloudfront:CreateInvalidation',
        'cloudfront:GetInvalidation',
        'cloudfront:ListInvalidations',
      ],
      resources: [
        Arn.format({
          account: this.account,
          partition: 'aws',
          region: '',
          resource: 'distribution',
          resourceName: props.siteDistributionId,
          service: 'cloudfront',
        }),
      ],
    }));

    siteBucket.addToResourcePolicy(new PolicyStatement({
      actions: [
        's3:DeleteObject',
        's3:GetObject',
        's3:ListBucket',
        's3:PutObject',
      ],
      principals: [deployProject.grantPrincipal],
      resources: [
        siteBucket.bucketArn,
        siteBucket.arnForObjects(deployPath),
        siteBucket.arnForObjects(`${deployPath}/*`),
      ],
    }));
  }
}
