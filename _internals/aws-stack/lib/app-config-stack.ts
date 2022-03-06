import { Stack, StackProps } from 'aws-cdk-lib';
import { LambdaRestApi } from 'aws-cdk-lib/aws-apigateway';
import { CfnConfigurationProfile, CfnEnvironment } from 'aws-cdk-lib/aws-appconfig';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import {
  Code, Function, LayerVersion, Runtime,
} from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { readFileSync } from 'fs';

export interface AppConfigStackProps extends StackProps {
  applicationId: string
  configProfileName: string
  environmentName: string
  restApiName: string
}

export class AppConfigStack extends Stack {
  public readonly apiDomain: string;

  constructor(scope: Construct, id: string, props: AppConfigStackProps) {
    super(scope, id, props);

    new CfnConfigurationProfile(this, 'ConfigProfile', {
      applicationId: props.applicationId,
      locationUri: 'hosted',
      name: props.configProfileName,
      type: 'AWS.Freeform',
    });

    new CfnEnvironment(this, 'ConfigEnvironment', {
      applicationId: props.applicationId,
      name: props.environmentName,
    });

    const configFunction = new Function(this, 'ConfigFunction', {
      runtime: Runtime.PYTHON_3_9,
      code: Code.fromInline(readFileSync('lib/lambda/config.py').toString()),
      environment: {
        CONFIG_APP: props.applicationId,
        CONFIG_ENV: props.environmentName,
        CONFIG_NAME: props.configProfileName,
      },
      handler: 'index.handler',
      layers: [
        LayerVersion.fromLayerVersionArn(
          this,
          'AppConfigLayer',
          'arn:aws:lambda:us-east-2:728743619870:layer:AWS-AppConfig-Extension:47',
        ),
      ],
    });
    configFunction.addToRolePolicy(new PolicyStatement({
      actions: [
        'appconfig:StartConfigurationSession',
        'appconfig:GetLatestConfiguration',
      ],
      resources: [
        `arn:aws:appconfig:${this.region}:${this.account}`
          + `:application/${props.applicationId}`,
      ],
    }));

    const configApi = new LambdaRestApi(this, props.restApiName, {
      handler: configFunction,
    });

    this.apiDomain = `${configApi.restApiId}.execute-api.${this.region}.amazonaws.com`;
  }
}
