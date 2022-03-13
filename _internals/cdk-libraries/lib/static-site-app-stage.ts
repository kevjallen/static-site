import {
  Environment, PhysicalName,
  RemovalPolicy, Stack, Stage, StageProps, Tags,
} from 'aws-cdk-lib';
import { AddBehaviorOptions } from 'aws-cdk-lib/aws-cloudfront';
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
  configBehaviorOptions?: AddBehaviorOptions
  configFailoverProps?: Partial<ApplicationConfigStackProps>
  configProps?: ApplicationConfigStackProps
  siteFailoverEnv?: Environment
  siteProps?: Omit<StaticSiteStackProps, 'failoverBucket'>
  version?: string
}

export default class StaticSiteAppStage extends Stage {
  public readonly configStack: ApplicationConfigStack | undefined;

  public readonly configFailover: ApplicationConfigStack | undefined;

  public readonly siteStack: StaticSiteStack;

  public readonly siteFailover: Stack | undefined;

  constructor(scope: Construct, id: string, props?: StaticSiteAppStageProps) {
    super(scope, id, props);

    let failoverBucket: IBucket | undefined;
    if (props?.siteFailoverEnv) {
      this.siteFailover = new Stack(this, 'SiteFailover', {
        env: props.siteFailoverEnv,
      });
      failoverBucket = new Bucket(this.siteFailover, 'SiteBucket', {
        autoDeleteObjects: props.siteProps?.forceDestroy,
        blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
        bucketName: PhysicalName.GENERATE_IF_NEEDED,
        removalPolicy: props.siteProps?.forceDestroy
          ? RemovalPolicy.DESTROY : undefined,
      });
    }

    this.siteStack = new StaticSiteStack(this, 'Site', {
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

      if (props.configFailoverProps?.env?.region) {
        this.configFailover = new ApplicationConfigStack(
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

        new StringParameter(this.configFailover, 'EnvApiFailoverDomainParam', {
          parameterName: envApiFailoverDomainParamName,
          stringValue: this.configFailover.getEnvApiDomainName(),
        });

        const flagsApiFailoverDomainParamName = `${
          props.configProps.restApiPrefix}-flags-config-failover-domain`;

        new StringParameter(this.configFailover, 'FlagsApiFailoverDomainParam', {
          parameterName: flagsApiFailoverDomainParamName,
          stringValue: this.configFailover.getFlagsApiDomainName(),
        });

        const envApiFailoverDomainReader = new SSMParameterReader(
          this.siteStack,
          'EnvApiFailoverDomainReader',
          {
            region: props.configFailoverProps.env.region,
            parameterName: envApiFailoverDomainParamName,
          },
        );

        const flagsApiFailoverDomainReader = new SSMParameterReader(
          this.siteStack,
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

        this.siteStack.distribution.addBehavior('/config', new OriginGroup({
          primaryOrigin: primaryEnvOrigin,
          fallbackOrigin: secondaryEnvOrigin,
        }), props.configBehaviorOptions);

        this.siteStack.distribution.addBehavior('/flags', new OriginGroup({
          primaryOrigin: primaryFlagsOrigin,
          fallbackOrigin: secondaryFlagsOrigin,
        }), props.configBehaviorOptions);
      } else {
        this.siteStack.distribution.addBehavior(
          '/config',
          primaryEnvOrigin,
          props.configBehaviorOptions,
        );
        this.siteStack.distribution.addBehavior(
          '/flags',
          primaryFlagsOrigin,
          props.configBehaviorOptions,
        );
      }
    }

    if (props?.version) {
      Tags.of(this).add('version', props.version);
    }
  }
}
