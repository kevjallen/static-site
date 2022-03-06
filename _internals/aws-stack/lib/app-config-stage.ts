import {
  Stack, Stage, StageProps, Tags,
} from 'aws-cdk-lib';
import { CfnApplication, CfnConfigurationProfile } from 'aws-cdk-lib/aws-appconfig';
import { Construct } from 'constructs';

export interface ApplicationConfigStageProps extends StageProps {
  appName: string

  appDescription?: string
  flagsProfileName?: string
  version?: string
}

export class ApplicationConfigStage extends Stage {
  constructor(scope: Construct, id: string, props: ApplicationConfigStageProps) {
    super(scope, id, props);

    const stack = new Stack(this, 'Flags');

    const application = new CfnApplication(stack, 'Application', {
      name: props.appName,
      description: props.appDescription,
    });

    new CfnConfigurationProfile(stack, 'FlagsProfile', {
      applicationId: application.ref,
      locationUri: 'hosted',
      name: props.flagsProfileName || 'Flags',
      type: 'AWS.AppConfig.FeatureFlags',
    });

    if (props?.version) {
      Tags.of(this).add('version', props.version);
    }
  }
}
