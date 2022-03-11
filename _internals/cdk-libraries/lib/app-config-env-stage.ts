import {
  Stage, StageProps, Tags,
} from 'aws-cdk-lib';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import ApplicationConfigStack, { ApplicationConfigStackProps } from './app-config-stack';

export interface ApplicationConfigEnvStageProps extends StageProps {
  configProps: ApplicationConfigStackProps

  configFailoverProps?: Partial<ApplicationConfigStackProps>
  version?: string
}

export default class ApplicationConfigEnvStage extends Stage {
  public readonly envApiId: string;

  public readonly flagsApiId: string;

  public readonly envApiIdFailoverParameterName: string | undefined;

  public readonly flagsApiIdFailoverParameterName: string | undefined;

  constructor(scope: Construct, id: string, props: ApplicationConfigEnvStageProps) {
    super(scope, id, props);

    const config = new ApplicationConfigStack(
      this,
      'Main',
      props.configProps,
    );

    this.envApiId = config.envApiIdExport;
    this.flagsApiId = config.flagsApiIdExport;

    if (props.configFailoverProps) {
      const configFailoverProps = {
        ...props.configProps,
        ...props.configFailoverProps,
      };

      const configFailover = new ApplicationConfigStack(
        this,
        'Failover',
        configFailoverProps,
      );

      this.envApiIdFailoverParameterName = `/${
        props.configFailoverProps.restApiPrefix}/envApiFailoverId`;

      new StringParameter(configFailover, 'EnvApiFailoverParameter', {
        parameterName: this.envApiIdFailoverParameterName,
        stringValue: configFailover.envApiId,
      });

      this.flagsApiIdFailoverParameterName = `/${
        props.configFailoverProps.restApiPrefix}/flagsApiFailoverId`;

      new StringParameter(configFailover, 'FlagsApiFailoverParameter', {
        parameterName: this.flagsApiIdFailoverParameterName,
        stringValue: configFailover.flagsApiId,
      });
    }

    if (props?.version) {
      Tags.of(this).add('version', props.version);
    }
  }
}
