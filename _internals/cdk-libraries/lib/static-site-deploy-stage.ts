import {
  Arn, Environment, Stack, Stage, StageProps,
} from 'aws-cdk-lib';
import { BuildSpec, Project, Source } from 'aws-cdk-lib/aws-codebuild';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Bucket, IBucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import ApplicationConfigDeployStack, {
  ApplicationConfigDeployStackProps,
} from './app-config-deploy-stack';
import SSMParameterReader from './ssm-param-reader';

export interface StaticSiteDeployStageProps extends StageProps {
  artifactsBucketParamName: string
  artifactsBucketEnv?: Environment
  artifactsPrefix?: string
  configDeployProps?: ApplicationConfigDeployStackProps
  configFailoverDeployProps?: ApplicationConfigDeployStackProps
  deployPrefix?: string
  failoverBucketParamName?: string
  failoverBucketEnv?: Environment
  invalidationPath?: string
  projectName?: string
  siteBucketName: string
  siteBucketEnv?: Environment
  siteDistributionId: string
  source?: Source
}

export default class StaticSiteDeployStage extends Stage {
  constructor(scope: Construct, id: string, props: StaticSiteDeployStageProps) {
    super(scope, id, props);

    const siteDeployStack = new Stack(this, 'Site');

    const artifactsBucketParamReader = new SSMParameterReader(
      siteDeployStack,
      'ArtifactsBucketNameParamReader',
      {
        parameterName: props.artifactsBucketParamName,
        region: props.artifactsBucketEnv?.region || siteDeployStack.region,
      },
    );

    const artifactsBucket = Bucket.fromBucketAttributes(
      siteDeployStack,
      'ArtifactsBucket',
      {
        ...props.artifactsBucketEnv,
        bucketName: artifactsBucketParamReader.getParameterValue(),
      },
    );

    const siteBucket = Bucket.fromBucketAttributes(
      siteDeployStack,
      'SiteBucket',
      {
        ...props.siteBucketEnv,
        bucketName: props.siteBucketName,
      },
    );

    let siteFailoverBucket: IBucket | undefined;

    if (props.failoverBucketParamName) {
      const failoverBucketParamReader = new SSMParameterReader(
        siteDeployStack,
        'SiteFailoverBucketNameParamReader',
        {
          parameterName: props.failoverBucketParamName,
          region: props.failoverBucketEnv?.region || siteDeployStack.region,
        },
      );

      siteFailoverBucket = Bucket.fromBucketAttributes(
        siteDeployStack,
        'SiteFailoverBucket',
        {
          ...props.failoverBucketEnv,
          bucketName: failoverBucketParamReader.getParameterValue(),
        },
      );
    }

    const artifactsPath = artifactsBucket.s3UrlForObject(props.artifactsPrefix);

    const siteDeployPath = siteBucket.s3UrlForObject(props.deployPrefix);

    const failoverDeployPath = siteFailoverBucket?.s3UrlForObject(props.deployPrefix);

    const siteDeployProject = new Project(siteDeployStack, 'DeployProject', {
      environmentVariables: {
        ...(!failoverDeployPath ? {} : {
          FAILOVER_DEPLOY_PATH: { value: failoverDeployPath },
        }),
        ARTIFACTS_PATH: { value: artifactsPath },
        CONFIG_REFRESH_INTERVAL: { value: 45 },
        DISTRIBUTION_ID: { value: props.siteDistributionId },
        INVALIDATION_PATH: { value: props.invalidationPath || '/*' },
        SITE_DEPLOY_PATH: { value: siteDeployPath },
        VERSION: { value: 'latest' },
      },
      buildSpec: BuildSpec.fromObject({
        version: 0.2,
        phases: {
          build: {
            commands: [
              'if [ "$VERSION" = "latest" ]; then'
                + ' VERSION=$(aws s3 ls "$ARTIFACTS_PATH/"'
                + ' | sort | tail -n 1 | awk \'{print $4}\'); fi',
              'aws s3 cp "$ARTIFACTS_PATH/$VERSION" artifact.zip',
              'unzip artifact.zip -d artifact',
              'aws s3 rm --recursive "$SITE_DEPLOY_PATH/"',
              'aws s3 sync artifact "$SITE_DEPLOY_PATH/"',
              'if [ ! -z "$FAILOVER_DEPLOY_PATH" ]; then'
                + ' aws s3 rm --recursive "$FAILOVER_DEPLOY_PATH/";'
                + ' aws s3 sync artifact "$FAILOVER_DEPLOY_PATH/"; fi',
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

    siteDeployProject.addToRolePolicy(new PolicyStatement({
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

    siteDeployProject.addToRolePolicy(new PolicyStatement({
      actions: [
        's3:GetObject',
        's3:ListBucket',
      ],
      resources: [
        artifactsBucket.bucketArn,
        ...(!props.artifactsPrefix ? [
          artifactsBucket.arnForObjects('*'),
        ] : [
          artifactsBucket.arnForObjects(`${props.artifactsPrefix}/*`),
        ]),
      ],
    }));

    siteDeployProject.addToRolePolicy(new PolicyStatement({
      actions: [
        's3:DeleteObject',
        's3:GetObject',
        's3:ListBucket',
        's3:PutObject',
      ],
      resources: [siteBucket, siteFailoverBucket]
        .map((bucket) => (!bucket ? [] : [
          bucket?.bucketArn,
          ...(!props.deployPrefix ? [
            bucket?.arnForObjects('*'),
          ] : [
            bucket?.arnForObjects(`${props.deployPrefix}/*`),
          ]),
        ]))
        .reduce((list, resources) => list.concat(resources)),
    }));

    if (props.configDeployProps) {
      new ApplicationConfigDeployStack(
        this,
        'Config',
        props.configDeployProps,
      );

      if (props.configFailoverDeployProps) {
        new ApplicationConfigDeployStack(
          this,
          'ConfigFailover',
          props.configFailoverDeployProps,
        );
      }
    }
  }
}
