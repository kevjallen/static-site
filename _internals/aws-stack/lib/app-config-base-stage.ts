import {
  Stack, Stage, StageProps, Tags,
} from 'aws-cdk-lib';
import { CfnApplication, CfnConfigurationProfile } from 'aws-cdk-lib/aws-appconfig';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

export interface ApplicationConfigBaseStageProps extends StageProps {
  appName: string

  appDescription?: string
  flagsProfileName?: string
  version?: string
}

export class ApplicationConfigBaseStage extends Stage {
  public readonly configAppIdParameterName: string;

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

    this.configAppIdParameterName = `${props.appName}-config-app-id`;

    new StringParameter(stack, 'ConfigAppIdParameter', {
      parameterName: this.configAppIdParameterName,
      stringValue: app.ref,
    });

    if (props?.version) {
      Tags.of(this).add('version', props.version);
    }
  }
}
