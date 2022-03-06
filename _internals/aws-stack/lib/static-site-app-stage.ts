import {
  PhysicalName, Stack, Stage, StageProps, Tags,
} from 'aws-cdk-lib';
import { Bucket, IBucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { StaticSiteStack, StaticSiteStackProps, getBucketProps } from './static-site-stack';

export interface StaticSiteAppStageProps extends StageProps {
  siteFailoverRegion?: string
  siteProps?: StaticSiteStackProps
  version?: string
}

export class StaticSiteAppStage extends Stage {
  constructor(scope: Construct, id: string, props?: StaticSiteAppStageProps) {
    super(scope, id, props);

    let failoverBucket: IBucket | undefined;
    if (props?.siteFailoverRegion) {
      const failoverStack = new Stack(this, 'Failover', {
        env: { region: props.siteFailoverRegion },
      });
      failoverBucket = new Bucket(failoverStack, 'SiteBucket', {
        ...getBucketProps(props.siteProps),
        bucketName: PhysicalName.GENERATE_IF_NEEDED,
      });
    }

    new StaticSiteStack(this, 'Site', {
      ...props?.siteProps,
      failoverBucket: !failoverBucket ? undefined : {
        bucketName: failoverBucket.bucketName,
        bucketRegion: failoverBucket.stack.region,
      },
    });

    if (props?.version) {
      Tags.of(this).add('version', props.version);
    }
  }
}
