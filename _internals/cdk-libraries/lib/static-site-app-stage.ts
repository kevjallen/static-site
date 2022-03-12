import {
  Environment,
  PhysicalName,
  RemovalPolicy, Stack, Stage, StageProps, Tags,
} from 'aws-cdk-lib';
import { BlockPublicAccess, Bucket, IBucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { StaticSiteStack, StaticSiteStackProps } from './static-site-stack';

export interface StaticSiteAppStageProps extends StageProps {
  siteFailoverEnv?: Environment
  siteProps?: Omit<StaticSiteStackProps, 'failoverBucket'>
  version?: string
}

export default class StaticSiteAppStage extends Stage {
  public readonly siteStack: StaticSiteStack;

  public readonly siteFailover: Stack | undefined;

  constructor(scope: Construct, id: string, props?: StaticSiteAppStageProps) {
    super(scope, id, props);

    let failoverBucket: IBucket | undefined;
    if (props?.siteFailoverEnv) {
      this.siteFailover = new Stack(this, 'Failover', {
        env: props.siteFailoverEnv,
      });
      failoverBucket = new Bucket(this.siteFailover, 'SiteBucket', {
        autoDeleteObjects: props.siteProps?.forceDestroy,
        blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
        bucketName: PhysicalName.GENERATE_IF_NEEDED,
        removalPolicy: props.siteProps?.forceDestroy ? RemovalPolicy.DESTROY : undefined,
      });
    }

    this.siteStack = new StaticSiteStack(this, 'Main', {
      ...props?.siteProps as StaticSiteStackProps,
      failoverBucket: !failoverBucket ? undefined : {
        account: failoverBucket.stack.account,
        bucketName: failoverBucket.bucketName,
        region: failoverBucket.stack.region,
      },
    });

    if (props?.version) {
      Tags.of(this).add('version', props.version);
    }
  }
}
