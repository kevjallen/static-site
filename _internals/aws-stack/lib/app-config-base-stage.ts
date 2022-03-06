import {
  Stack, Stage, StageProps, Tags,
} from 'aws-cdk-lib';
import { CfnApplication, CfnConfigurationProfile } from 'aws-cdk-lib/aws-appconfig';
import { Construct } from 'constructs';

export interface ApplicationConfigBaseStageProps extends StageProps {
  appName: string

  appDescription?: string
  flagsProfileName?: string
  version?: string
}

export class ApplicationConfigBaseStage extends Stage {
  public readonly appIdExport: string;

  constructor(scope: Construct, id: string, props: ApplicationConfigBaseStageProps) {
    super(scope, id, props);

    const stack = new Stack(this, 'Flags');

    const app = new CfnApplication(stack, 'Application', {
      name: props.appName,
      description: props.appDescription,
    });

    new CfnConfigurationProfile(stack, 'FlagsProfile', {
      applicationId: app.ref,
      locationUri: 'hosted',
      name: props.flagsProfileName || 'Flags',
      type: 'AWS.AppConfig.FeatureFlags',
    });

    this.appIdExport = stack.exportValue(app.ref);

    if (props?.version) {
      Tags.of(this).add('version', props.version);
    }
  }
}
