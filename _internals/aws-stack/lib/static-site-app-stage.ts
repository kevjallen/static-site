import {
  PhysicalName, Stack, Stage, StageProps, Tags,
} from 'aws-cdk-lib';
import { HttpOrigin, OriginGroup } from 'aws-cdk-lib/aws-cloudfront-origins';
import { Bucket, IBucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import {
  ApplicationConfigStack, ApplicationConfigStackProps,
} from './app-config-stack';
import {
  StaticSiteStack, StaticSiteStackProps, getBucketProps,
} from './static-site-stack';

export interface StaticSiteAppStageProps extends StageProps {
  configFailoverProps?: ApplicationConfigStackProps
  configProps?: ApplicationConfigStackProps
  siteFailoverRegion?: string
  siteProps?: StaticSiteStackProps
  version?: string
}

export class StaticSiteAppStage extends Stage {
  constructor(scope: Construct, id: string, props?: StaticSiteAppStageProps) {
    super(scope, id, props);

    let failoverBucket: IBucket | undefined;
    if (props?.siteFailoverRegion) {
      const failoverStack = new Stack(this, 'SiteFailover', {
        env: { region: props.siteFailoverRegion },
      });
      failoverBucket = new Bucket(failoverStack, 'SiteBucket', {
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

    if (props?.configProps) {
      const configStack = new ApplicationConfigStack(
        this,
        'Config',
        props.configProps,
      );
      const primaryEnvConfigOrigin = new HttpOrigin(configStack.envApiDomain);
      const primaryFlagsConfigOrigin = new HttpOrigin(configStack.flagsApiDomain);

      let envConfigOriginGroup: OriginGroup | undefined;
      let flagsConfigOriginGroup: OriginGroup | undefined;
      if (props.configFailoverProps) {
        const configFailoverStack = new ApplicationConfigStack(
          this,
          'ConfigFailover',
          props.configFailoverProps,
        );
        const failoverEnvConfigOrigin = new HttpOrigin(
          configFailoverStack.envApiDomain,
        );
        const failoverFlagsConfigOrigin = new HttpOrigin(
          configFailoverStack.flagsApiDomain,
        );
        envConfigOriginGroup = new OriginGroup({
          primaryOrigin: primaryEnvConfigOrigin,
          fallbackOrigin: failoverEnvConfigOrigin,
        });
        flagsConfigOriginGroup = new OriginGroup({
          primaryOrigin: primaryFlagsConfigOrigin,
          fallbackOrigin: failoverFlagsConfigOrigin,
        });
      }

      site.addOrigin('/config', envConfigOriginGroup || primaryEnvConfigOrigin);
      site.addOrigin('/flags', flagsConfigOriginGroup || primaryFlagsConfigOrigin);
    }

    if (props?.version) {
      Tags.of(this).add('version', props.version);
    }
  }
}
