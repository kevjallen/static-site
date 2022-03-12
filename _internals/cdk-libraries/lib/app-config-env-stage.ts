import {
  Stage, StageProps, Tags,
} from 'aws-cdk-lib';
import { AddBehaviorOptions } from 'aws-cdk-lib/aws-cloudfront';
import { HttpOrigin, OriginGroup } from 'aws-cdk-lib/aws-cloudfront-origins';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { StaticSiteStack } from '.';
import ApplicationConfigStack, {
  ApplicationConfigStackProps,
} from './app-config-stack';
import SSMParameterReader from './ssm-param-reader';

export interface ApplicationConfigEnvStageProps extends StageProps {
  configProps: ApplicationConfigStackProps

  configFailoverProps?: Partial<ApplicationConfigStackProps>
  version?: string
}

export default class ApplicationConfigEnvStage extends Stage {
  private readonly configStack: ApplicationConfigStack;

  private readonly configFailoverStack: ApplicationConfigStack;

  public readonly envApiId: string;

  public readonly envApiStageName: string | undefined;

  public readonly envApiFailoverIdParameterName: string | undefined;

  public readonly flagsApiId: string;

  public readonly flagsApiStageName: string | undefined;

  public readonly flagsApiFailoverIdParameterName: string | undefined;

  constructor(scope: Construct, id: string, props: ApplicationConfigEnvStageProps) {
    super(scope, id, props);

    this.envApiStageName = props.configProps.restApiOptions?.stageName
      || props.configFailoverProps?.restApiOptions?.stageName;
    this.flagsApiStageName = props.configProps.restApiOptions?.stageName
      || props.configFailoverProps?.restApiOptions?.stageName;

    this.configStack = new ApplicationConfigStack(
      this,
      'Main',
      props.configProps,
    );

    this.envApiId = this.configStack.exportValue(
      this.configStack.envApi.restApiId,
    );
    this.flagsApiId = this.configStack.exportValue(
      this.configStack.flagsApi.restApiId,
    );

    if (props.configFailoverProps) {
      const configFailoverProps = {
        ...props.configProps,
        ...props.configFailoverProps,
      };

      this.configFailoverStack = new ApplicationConfigStack(
        this,
        'Failover',
        configFailoverProps,
      );

      this.envApiFailoverIdParameterName = `/${
        props.configFailoverProps.restApiPrefix}/envApiFailoverId`;

      new StringParameter(this.configFailoverStack, 'EnvApiFailoverParameter', {
        parameterName: this.envApiFailoverIdParameterName,
        stringValue: this.configFailoverStack.envApi.restApiId,
      });

      this.flagsApiFailoverIdParameterName = `/${
        props.configFailoverProps.restApiPrefix}/flagsApiFailoverId`;

      new StringParameter(this.configFailoverStack, 'FlagsApiFailoverParameter', {
        parameterName: this.flagsApiFailoverIdParameterName,
        stringValue: this.configFailoverStack.flagsApi.restApiId,
      });
    }

    if (props?.version) {
      Tags.of(this).add('version', props.version);
    }
  }

  addConfigOriginsToSite(siteStack: StaticSiteStack, options?: AddBehaviorOptions) {
    const primaryEnvApiOrigin = new HttpOrigin(`${
      this.envApiId
    }.execute-api.${this.configStack.region}.amazonaws.com`, {
      originPath: `/${this.envApiStageName}`,
    });
    const primaryflagsApiOrigin = new HttpOrigin(`${
      this.flagsApiId
    }.execute-api.${this.configStack.region}.amazonaws.com`, {
      originPath: `/${this.flagsApiStageName}`,
    });
    if (
      this.envApiFailoverIdParameterName
      && this.flagsApiFailoverIdParameterName
    ) {
      const envApiFailoverIdReader = new SSMParameterReader(
        siteStack,
        'EnvApiFailoverIdReader',
        {
          parameterName: this.envApiFailoverIdParameterName,
          region: this.configFailoverStack.region,
        },
      );
      const secondaryEnvApiOrigin = new HttpOrigin(`${
        envApiFailoverIdReader.getParameterValue()
      }.execute-api.${this.configFailoverStack.region}.amazonaws.com`, {
        originPath: `/${this.envApiStageName}`,
      });
      siteStack.addOriginGroup(
        '/config',
        new OriginGroup({
          primaryOrigin: primaryEnvApiOrigin,
          fallbackOrigin: secondaryEnvApiOrigin,
        }),
        options,
      );
      const flagsApiFailoverIdReader = new SSMParameterReader(
        siteStack,
        'FlagsApiFailoverIdReader',
        {
          parameterName: this.flagsApiFailoverIdParameterName,
          region: this.configFailoverStack.region,
        },
      );
      const secondaryFlagsApiOrigin = new HttpOrigin(`${
        flagsApiFailoverIdReader.getParameterValue()
      }.execute-api.${this.configFailoverStack.region}.amazonaws.com`, {
        originPath: `/${this.flagsApiStageName}`,
      });
      siteStack.addOriginGroup(
        '/flags',
        new OriginGroup({
          primaryOrigin: primaryflagsApiOrigin,
          fallbackOrigin: secondaryFlagsApiOrigin,
        }),
        options,
      );
    } else {
      siteStack.addHttpOrigin(
        '/config',
        primaryEnvApiOrigin,
        options,
      );
      siteStack.addHttpOrigin(
        '/flags',
        primaryflagsApiOrigin,
        options,
      );
    }
  }
}
