import {
  Stack, Stage, StageProps, Tags,
} from 'aws-cdk-lib';
import { CfnApplication, CfnConfigurationProfile } from 'aws-cdk-lib/aws-appconfig';
import { Construct } from 'constructs';

export interface ApplicationConfigSetupStageProps extends StageProps {
  appName: string

  appDescription?: string
  version?: string
}

export class ApplicationConfigSetupStage extends Stage {
  constructor(scope: Construct, id: string, props: ApplicationConfigSetupStageProps) {
    super(scope, id, props);

    const stack = new Stack(this, 'Config');

    const application = new CfnApplication(stack, 'Application', {
      name: props.appName,
      description: props.appDescription,
    });

    new CfnConfigurationProfile(stack, 'FlagsProfile', {
      applicationId: application.ref,
      locationUri: 'hosted',
      name: 'Flags',
      type: 'AWS.AppConfig.FeatureFlags',
    });

    if (props?.version) {
      Tags.of(this).add('version', props.version);
    }
  }
}
