import {
  PhysicalName, Stack, Stage, StageProps, Tags,
} from 'aws-cdk-lib';
import { Bucket, IBucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import {
  AppGwOriginProps, StaticSiteStack, StaticSiteStackProps, getBucketProps,
} from './static-site-stack';

export interface StaticSiteAppStageProps extends StageProps {
  envConfigOriginProps?: AppGwOriginProps
  envConfigFailoverOriginProps?: AppGwOriginProps
  flagsConfigOriginProps?: AppGwOriginProps
  flagsConfigFailoverOriginProps?: AppGwOriginProps
  siteFailoverRegion?: string
  siteProps?: StaticSiteStackProps
  version?: string
}

export class StaticSiteAppStage extends Stage {
  constructor(scope: Construct, id: string, props?: StaticSiteAppStageProps) {
    super(scope, id, props);

    let failoverBucket: IBucket | undefined;
    if (props?.siteFailoverRegion) {
      const siteFailover = new Stack(this, 'SiteFailover', {
        env: { region: props.siteFailoverRegion },
      });

      failoverBucket = new Bucket(siteFailover, 'SiteBucket', {
        ...getBucketProps(props.siteProps),
        bucketName: PhysicalName.GENERATE_IF_NEEDED,
      });
    }

    const site = new StaticSiteStack(this, 'Site', {
      ...props?.siteProps,
      failoverBucket: !failoverBucket ? undefined : {
        bucketName: failoverBucket.bucketName,
        bucketRegion: failoverBucket.stack.region,
      },
    });

    if (props?.envConfigOriginProps) {
      if (props.envConfigFailoverOriginProps) {
        site.addAppGwOriginGroupFromExports(
          '/config',
          props.envConfigOriginProps,
          props.envConfigFailoverOriginProps,
        );
      } else {
        site.addAppGwOriginFromExport(
          '/config',
          props.envConfigOriginProps,
        );
      }
    }

    if (props?.version) {
      Tags.of(this).add('version', props.version);
    }
  }
}
