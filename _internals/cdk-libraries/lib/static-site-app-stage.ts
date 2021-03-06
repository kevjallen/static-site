import {
  Environment,
  PhysicalName,
  RemovalPolicy, Stack, Stage, StageProps, Tags,
} from 'aws-cdk-lib';
import { CachePolicy, CachePolicyProps } from 'aws-cdk-lib/aws-cloudfront';
import { HttpOrigin, OriginGroup } from 'aws-cdk-lib/aws-cloudfront-origins';
import { BlockPublicAccess, Bucket, IBucket } from 'aws-cdk-lib/aws-s3';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import ApplicationConfigStack, {
  ApplicationConfigStackProps,
} from './app-config-stack';
import SSMParameterReader from './ssm-param-reader';
import {
  StaticSiteStack, StaticSiteStackProps,
} from './static-site-stack';

export interface StaticSiteAppStageProps extends StageProps {
  configCachePolicyProps?: CachePolicyProps
  configFailoverProps?: Partial<ApplicationConfigStackProps>
  configProps?: ApplicationConfigStackProps
  siteFailoverEnv?: Environment
  siteFailoverBucketParamName?: string
  siteProps?: Omit<StaticSiteStackProps, 'failoverBucket'>
  version?: string
}

export default class StaticSiteAppStage extends Stage {
  public readonly distributionId: string;

  public readonly siteBucketName: string;

  public readonly configStack: ApplicationConfigStack | undefined;

  public readonly configFailoverStack: ApplicationConfigStack | undefined;

  constructor(scope: Construct, id: string, props?: StaticSiteAppStageProps) {
    super(scope, id, props);

    let failoverBucket: IBucket | undefined;
    let siteFailoverStack: Stack | undefined;

    if (props?.siteFailoverEnv) {
      siteFailoverStack = new Stack(this, 'SiteFailover', {
        env: props.siteFailoverEnv,
      });
      failoverBucket = new Bucket(siteFailoverStack, 'SiteBucket', {
        autoDeleteObjects: props.siteProps?.forceDestroy,
        blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
        bucketName: PhysicalName.GENERATE_IF_NEEDED,
        removalPolicy: props.siteProps?.forceDestroy
          ? RemovalPolicy.DESTROY : undefined,
      });
      if (props.siteFailoverBucketParamName) {
        new StringParameter(
          siteFailoverStack,
          'SiteFailoverBucketNameParam',
          {
            parameterName: props.siteFailoverBucketParamName,
            stringValue: failoverBucket.bucketName,
          },
        );
      }
    }

    const siteStack = new StaticSiteStack(this, 'Site', {
      ...props?.siteProps as StaticSiteStackProps,
      failoverBucket: !failoverBucket ? undefined : {
        account: failoverBucket.stack.account,
        bucketName: failoverBucket.bucketName,
        region: failoverBucket.stack.region,
      },
    });

    if (props?.configProps) {
      this.configStack = new ApplicationConfigStack(
        this,
        'Config',
        props.configProps,
      );
      const primaryEnvOrigin = new HttpOrigin(
        this.configStack.getEnvApiDomainName(),
        { originPath: `/${props.configProps.restApiOptions?.stageName || 'prod'}` },
      );

      const primaryFlagsOrigin = new HttpOrigin(
        this.configStack.getFlagsApiDomainName(),
        { originPath: `/${props.configProps.restApiOptions?.stageName || 'prod'}` },
      );

      let configCachePolicy: CachePolicy | undefined;

      if (props.configCachePolicyProps) {
        configCachePolicy = new CachePolicy(
          siteStack,
          'ConfigCachePolicy',
          props.configCachePolicyProps,
        );
      }

      if (props.configFailoverProps?.env?.region) {
        this.configFailoverStack = new ApplicationConfigStack(
          this,
          'ConfigFailover',
          {
            ...props.configProps,
            ...props.configFailoverProps,
            env: {
              ...props.configProps.env,
              ...props.configFailoverProps.env,
            },
          },
        );

        const envApiFailoverDomainParamName = `${
          props.configProps.restApiPrefix}-env-config-failover-domain`;

        new StringParameter(this.configFailoverStack, 'EnvApiFailoverDomainParam', {
          parameterName: envApiFailoverDomainParamName,
          stringValue: this.configFailoverStack.getEnvApiDomainName(),
        });

        const flagsApiFailoverDomainParamName = `${
          props.configProps.restApiPrefix}-flags-config-failover-domain`;

        new StringParameter(this.configFailoverStack, 'FlagsApiFailoverDomainParam', {
          parameterName: flagsApiFailoverDomainParamName,
          stringValue: this.configFailoverStack.getFlagsApiDomainName(),
        });

        const envApiFailoverDomainReader = new SSMParameterReader(
          siteStack,
          'EnvApiFailoverDomainReader',
          {
            region: props.configFailoverProps.env.region,
            parameterName: envApiFailoverDomainParamName,
          },
        );

        const flagsApiFailoverDomainReader = new SSMParameterReader(
          siteStack,
          'FlagsApiFailoverDomainReader',
          {
            region: props.configFailoverProps.env.region,
            parameterName: flagsApiFailoverDomainParamName,
          },
        );

        const secondaryEnvOrigin = new HttpOrigin(
          envApiFailoverDomainReader.getParameterValue(),
          { originPath: `/${props.configProps.restApiOptions?.stageName || 'prod'}` },
        );

        const secondaryFlagsOrigin = new HttpOrigin(
          flagsApiFailoverDomainReader.getParameterValue(),
          { originPath: `/${props.configProps.restApiOptions?.stageName || 'prod'}` },
        );

        siteStack.distribution.addBehavior('/config', new OriginGroup({
          primaryOrigin: primaryEnvOrigin,
          fallbackOrigin: secondaryEnvOrigin,
        }), {
          cachePolicy: configCachePolicy,
        });

        siteStack.distribution.addBehavior('/flags', new OriginGroup({
          primaryOrigin: primaryFlagsOrigin,
          fallbackOrigin: secondaryFlagsOrigin,
        }), {
          cachePolicy: configCachePolicy,
        });
      } else {
        siteStack.distribution.addBehavior(
          '/config',
          primaryEnvOrigin,
          { cachePolicy: configCachePolicy },
        );
        siteStack.distribution.addBehavior(
          '/flags',
          primaryFlagsOrigin,
          { cachePolicy: configCachePolicy },
        );
      }
    }

    this.distributionId = siteStack.exportValue(
      siteStack.distribution.distributionId,
    );
    this.siteBucketName = siteStack.exportValue(
      siteStack.siteBucket.bucketName,
    );

    if (props?.version) {
      Tags.of(this).add('version', props.version);
    }
  }
}
