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

export default class ApplicationConfigBaseStage extends Stage {
  public readonly appId: string;

  constructor(scope: Construct, id: string, props: ApplicationConfigBaseStageProps) {
    super(scope, id, props);

    const stack = new Stack(this, 'Base');

    const app = new CfnApplication(stack, 'Application', {
      name: props.appName,
      description: props.appDescription,
    });
    this.appId = stack.exportValue(app.ref);

    new CfnConfigurationProfile(stack, 'FlagsProfile', {
      applicationId: app.ref,
      locationUri: 'hosted',
      name: props.flagsProfileName || 'Flags',
      type: 'AWS.AppConfig.FeatureFlags',
    });

    if (props?.version) {
      Tags.of(this).add('version', props.version);
    }
  }
}
