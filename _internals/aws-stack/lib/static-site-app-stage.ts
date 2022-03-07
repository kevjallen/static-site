import {
  Duration,
  PhysicalName, Stack, Stage, StageProps, Tags,
} from 'aws-cdk-lib';
import { CachePolicy, ICachePolicy } from 'aws-cdk-lib/aws-cloudfront';
import { Bucket, IBucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import {
  AppGwOriginProps, AppGwFailoverOriginProps, StaticSiteStack,
  StaticSiteStackProps, getBucketProps,
} from './static-site-stack';

export interface StaticSiteAppStageProps extends StageProps {
  configDefaultTtl?: Duration
  envConfigOriginProps?: AppGwOriginProps
  envConfigFailoverOriginProps?: AppGwFailoverOriginProps
  flagsConfigOriginProps?: AppGwOriginProps
  flagsConfigFailoverOriginProps?: AppGwFailoverOriginProps
  siteFailoverRegion?: string
  siteProps?: StaticSiteStackProps
  version?: string
}

export class StaticSiteAppStage extends Stage {
  constructor(scope: Construct, id: string, props?: StaticSiteAppStageProps) {
    super(scope, id, props);

    let failoverBucket: IBucket | undefined;
    if (props?.siteFailoverRegion) {
      const siteFailover = new Stack(this, 'Failover', {
        env: { region: props.siteFailoverRegion },
      });
      failoverBucket = new Bucket(siteFailover, 'SiteBucket', {
        ...getBucketProps(props.siteProps),
        bucketName: PhysicalName.GENERATE_IF_NEEDED,
      });
    }

    const site = new StaticSiteStack(this, 'Main', {
      ...props?.siteProps,
      failoverBucket: !failoverBucket ? undefined : {
        bucketName: failoverBucket.bucketName,
        bucketRegion: failoverBucket.stack.region,
      },
    });

    let configCachePolicy: ICachePolicy | undefined;
    if (props?.envConfigOriginProps || props?.flagsConfigOriginProps) {
      configCachePolicy = new CachePolicy(site, 'ConfigCachePolicy', {
        defaultTtl: props.configDefaultTtl,
      });
    }

    if (props?.envConfigOriginProps) {
      if (props.envConfigFailoverOriginProps) {
        site.addAppGwOriginGroup(
          '/config',
          {
            primaryOriginProps: props.envConfigOriginProps,
            failoverOriginProps: props.envConfigFailoverOriginProps,
            cachePolicy: configCachePolicy,
          },
        );
      } else {
        site.addAppGwOrigin(
          '/config',
          {
            originProps: props.envConfigOriginProps,
            cachePolicy: configCachePolicy,
          },
        );
      }
    }

    if (props?.flagsConfigOriginProps) {
      if (props.flagsConfigFailoverOriginProps) {
        site.addAppGwOriginGroup(
          '/flags',
          {
            primaryOriginProps: props.flagsConfigOriginProps,
            failoverOriginProps: props.flagsConfigFailoverOriginProps,
            cachePolicy: configCachePolicy,
          },
        );
      } else {
        site.addAppGwOrigin(
          '/flags',
          {
            originProps: props.flagsConfigOriginProps,
            cachePolicy: configCachePolicy,
          },
        );
      }
    }

    if (props?.version) {
      Tags.of(this).add('version', props.version);
    }
  }
}
