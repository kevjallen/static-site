import {
  Arn, Stack, StackProps,
} from 'aws-cdk-lib';
import { BuildSpec, Project, Source } from 'aws-cdk-lib/aws-codebuild';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface ApplicationConfigDeployStackProps extends StackProps {
  applicationId: string
  configProfileId: string
  configRefreshInterval?: number
  deployEnvironmentId: string
  deployStrategyId?: string
  pathToConfig: string
  projectName?: string
  source: Source
}

export default class ApplicationConfigDeployStack extends Stack {
  constructor(scope: Construct, id: string, props: ApplicationConfigDeployStackProps) {
    super(scope, id, props);

    const configDeployProject = new Project(this, 'ConfigDeployProject', {
      environmentVariables: {
        APPLICATION_ID: { value: props.applicationId },
        CONFIG_PROFILE_ID: { value: props.configProfileId },
        CONFIG_REFRESH_INTERVAL: { value: props.configRefreshInterval || 45 },
        DEPLOY_ENVIRONMENT_ID: { value: props.deployEnvironmentId },
        DEPLOY_STRATEGY_ID: { value: props.deployStrategyId || 'AppConfig.AllAtOnce' },
        PATH_TO_CONFIG: { value: props.pathToConfig },
      },
      buildSpec: BuildSpec.fromObject({
        version: 0.2,
        phases: {
          build: {
            commands: [
              'OLD_VERSION=$(aws appconfig list-hosted-configuration-versions'
                + ' --application-id $APPLICATION_ID'
                + ' --configuration-profile-id $CONFIG_PROFILE_ID'
                + ' | jq -r \'.Items[0].VersionNumber\')',
              'NEW_VERSION=$(aws appconfig create-hosted-configuration-version'
                + ' --application-id $APPLICATION_ID'
                + ' --configuration-profile-id $CONFIG_PROFILE_ID'
                + ' --latest-version-number $OLD_VERSION'
                + ' --content "$(cat "$PATH_TO_CONFIG")"'
                + ' --content-type application/json'
                + ' | jq -r \'.VersionNumber\'',
              'aws appconfig start-deployment'
                + ' --application-id $APPLICATION_ID'
                + ' --configuration-profile-id $CONFIG_PROFILE_ID'
                + ' --configuration-version $NEW_VERSION'
                + ' --deployment-strategy-id $DEPLOY_STRATEGY_ID'
                + ' --environment-id $DEPLOY_ENVIRONMENT_ID',
            ],
          },
        },
      }),
      projectName: props.projectName,
      source: props.source,
    });

    configDeployProject.addToRolePolicy(new PolicyStatement({
      actions: [
        'appconfig:CreateHostedConfigurationVersion',
        'appconfig:ListHostedConfigurationVersions',
        'appconfig:StartDeployment',
      ],
      resources: [
        Arn.format({
          account: this.account,
          partition: 'aws',
          region: this.region,
          service: 'appconfig',
          resource: 'application',
          resourceName: `${props.applicationId}/*`,
        }),
      ],
    }));
  }
}
