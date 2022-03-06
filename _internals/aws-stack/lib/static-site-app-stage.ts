import {
  PhysicalName, Stack, Stage, StageProps, Tags,
} from 'aws-cdk-lib';
import { IOrigin } from 'aws-cdk-lib/aws-cloudfront';
import { HttpOrigin, OriginGroup } from 'aws-cdk-lib/aws-cloudfront-origins';
import { Bucket, IBucket } from 'aws-cdk-lib/aws-s3';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import {
  StaticSiteStack, StaticSiteStackProps, getBucketProps,
} from './static-site-stack';

export interface StaticSiteAppStageProps extends StageProps {
  configFailoverRegion?: string
  envConfigDomainParameterName?: string
  flagsConfigDomainParameterName?: string
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

    if (props?.envConfigDomainParameterName) {
      const envConfigParameters = new Stack(
        this,
        'EnvConfigParameters',
      );
      const envConfigDomainParameter = StringParameter.fromStringParameterName(
        envConfigParameters,
        'EnvConfigDomainParameter',
        props.envConfigDomainParameterName,
      );
      const envConfigOrigin = new HttpOrigin(envConfigDomainParameter.stringValue);

      let envConfigOriginFailover: IOrigin | undefined;
      if (props.configFailoverRegion) {
        const envConfigParametersFailover = new Stack(
          this,
          'EnvConfigParametersFailover',
          { env: { region: props.configFailoverRegion } },
        );

        const envConfigDomainParameterFailover = StringParameter.fromStringParameterName(
          envConfigParametersFailover,
          'EnvConfigDomainParameterFailover',
          props.envConfigDomainParameterName,
        );

        envConfigOriginFailover = new HttpOrigin(
          envConfigDomainParameterFailover.stringValue,
        );
      }
      site.distribution.addBehavior(
        '/config',
        !envConfigOriginFailover ? envConfigOrigin : new OriginGroup({
          primaryOrigin: envConfigOrigin,
          fallbackOrigin: envConfigOriginFailover,
        }),
      );
    }

    if (props?.flagsConfigDomainParameterName) {
      const flagsConfigParameters = new Stack(
        this,
        'FlagsConfigParameters',
      );
      const flagsConfigDomainParameter = StringParameter.fromStringParameterName(
        flagsConfigParameters,
        'FlagsConfigDomainParameter',
        props.flagsConfigDomainParameterName,
      );
      const flagsConfigOrigin = new HttpOrigin(flagsConfigDomainParameter.stringValue);

      let flagsConfigOriginFailover: IOrigin | undefined;
      if (props.configFailoverRegion) {
        const flagsConfigParametersFailover = new Stack(
          this,
          'FlagsConfigParametersFailover',
          { env: { region: props.configFailoverRegion } },
        );

        const flagsConfigDomainParameterFailover = StringParameter.fromStringParameterName(
          flagsConfigParametersFailover,
          'FlagsConfigDomainParameterFailover',
          props.flagsConfigDomainParameterName,
        );

        flagsConfigOriginFailover = new HttpOrigin(
          flagsConfigDomainParameterFailover.stringValue,
        );
      }
      site.distribution.addBehavior(
        '/flags',
        !flagsConfigOriginFailover ? flagsConfigOrigin : new OriginGroup({
          primaryOrigin: flagsConfigOrigin,
          fallbackOrigin: flagsConfigOriginFailover,
        }),
      );
    }

    if (props?.version) {
      Tags.of(this).add('version', props.version);
    }
  }
}
