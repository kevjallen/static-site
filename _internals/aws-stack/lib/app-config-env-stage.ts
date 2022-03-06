import {
  Stage, StageProps, Tags,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ApplicationConfigStack, ApplicationConfigStackProps } from './app-config-stack';

export interface ApplicationConfigEnvStageProps extends StageProps {
  configProps: ApplicationConfigStackProps

  configFailoverProps?: ApplicationConfigStackProps
  version?: string
}

export class ApplicationConfigEnvStage extends Stage {
  public readonly envApiIdExport: string;

  public readonly flagsApiIdExport: string;

  public readonly envApiFailoverIdExport: string | undefined;

  public readonly flagsApiFailoverIdExport: string | undefined;

  constructor(scope: Construct, id: string, props: ApplicationConfigEnvStageProps) {
    super(scope, id, props);

    const config = new ApplicationConfigStack(
      this,
      'Config',
      props.configProps,
    );

    this.envApiIdExport = config.envApiIdExport;
    this.flagsApiIdExport = config.flagsApiIdExport;

    if (props.configFailoverProps) {
      const configFailover = new ApplicationConfigStack(
        this,
        'ConfigFailover',
        props.configFailoverProps,
      );

      this.envApiFailoverIdExport = configFailover.envApiIdExport;
      this.flagsApiFailoverIdExport = configFailover.flagsApiIdExport;
    }

    if (props?.version) {
      Tags.of(this).add('version', props.version);
    }
  }
}
