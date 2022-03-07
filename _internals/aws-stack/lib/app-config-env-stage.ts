import {
  PhysicalName,
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
  public readonly envApiId: string;

  public readonly flagsApiId: string;

  public readonly envApiIdFailoverParameterName: string | undefined;

  public readonly flagsApiIdFailoverParameterName: string | undefined;

  constructor(scope: Construct, id: string, props: ApplicationConfigEnvStageProps) {
    super(scope, id, props);

    const config = new ApplicationConfigStack(
      this,
      'Provider',
      props.configProps,
    );
    this.envApiId = config.envApiId;
    this.flagsApiId = config.envApiId;

    if (props.configFailoverProps) {
      const configFailover = new ApplicationConfigStack(
        this,
        'ProviderFailover',
        props.configFailoverProps,
      );

      const envApiIdFailoverParameter = new StringParameter(
        configFailover,
        'EnvApiFailoverParameter',
        {
          parameterName: PhysicalName.GENERATE_IF_NEEDED,
          simpleName: true,
          stringValue: configFailover.envApiId,
        },
      );
      this.envApiIdFailoverParameterName = configFailover.exportValue(
        envApiIdFailoverParameter.parameterName,
      );

      const flagsApiIdFailoverParameter = new StringParameter(
        configFailover,
        'FlagsApiFailoverParameter',
        {
          parameterName: PhysicalName.GENERATE_IF_NEEDED,
          simpleName: true,
          stringValue: configFailover.flagsApiId,
        },
      );
      this.flagsApiIdFailoverParameterName = configFailover.exportValue(
        flagsApiIdFailoverParameter.parameterName,
      );
    }

    if (props?.version) {
      Tags.of(this).add('version', props.version);
    }
  }
}
