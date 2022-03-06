import {
  Stage, StageProps, Tags,
} from 'aws-cdk-lib';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { ApplicationConfigStack, ApplicationConfigStackProps } from './app-config-stack';

export interface ApplicationConfigEnvStageProps extends StageProps {
    configProps: ApplicationConfigStackProps

    configFailoverProps?: ApplicationConfigStackProps
    version?: string
  }

export class ApplicationConfigEnvStage extends Stage {
  public readonly envDomainParameterName: string;

  public readonly flagsDomainParameterName: string;

  constructor(scope: Construct, id: string, props: ApplicationConfigEnvStageProps) {
    super(scope, id, props);

    const configStack = new ApplicationConfigStack(
      this,
      'Config',
      props.configProps,
    );

    this.envDomainParameterName = `${props.configProps.restApiPrefix
    }-env-config-api-domain`;

    new StringParameter(configStack, 'EnvDomainParameter', {
      parameterName: this.envDomainParameterName,
      stringValue: configStack.envApiDomain,
    });

    this.flagsDomainParameterName = `${props.configProps.restApiPrefix
    }-flags-config-api-domain`;

    new StringParameter(configStack, 'FlagsDomainParameter', {
      parameterName: this.flagsDomainParameterName,
      stringValue: configStack.flagsApiDomain,
    });

    if (props.configFailoverProps) {
      const configFailoverStack = new ApplicationConfigStack(
        this,
        'ConfigFailover',
        props.configFailoverProps,
      );

      new StringParameter(configFailoverStack, 'EnvDomainParameter', {
        parameterName: this.envDomainParameterName,
        stringValue: configFailoverStack.envApiDomain,
      });

      new StringParameter(configFailoverStack, 'FlagsDomainParameter', {
        parameterName: this.flagsDomainParameterName,
        stringValue: configFailoverStack.flagsApiDomain,
      });
    }

    if (props?.version) {
      Tags.of(this).add('version', props.version);
    }
  }
}
