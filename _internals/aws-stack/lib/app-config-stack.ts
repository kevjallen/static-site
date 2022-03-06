import {
  Stack, StackProps,
} from 'aws-cdk-lib';
import { LambdaRestApi } from 'aws-cdk-lib/aws-apigateway';
import { CfnConfigurationProfile, CfnEnvironment } from 'aws-cdk-lib/aws-appconfig';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import {
  Code, Function, LayerVersion, Runtime,
} from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { readFileSync } from 'fs';

export interface ApplicationConfigStackProps extends StackProps {
  appIdExport: string
  envName: string
  envProfileName: string
  layerVersionArn: string
  restApiPrefix: string

  flagsProfileName?: string
}

export class ApplicationConfigStack extends Stack {
  public readonly envApiId: string;

  public readonly envApiIdExport: string;

  public readonly flagsApiId: string;

  public readonly flagsApiIdExport: string;

  constructor(scope: Construct, id: string, props: ApplicationConfigStackProps) {
    super(scope, id, props);

    const appId = props.appIdExport;

    const env = new CfnEnvironment(this, 'Environment', {
      applicationId: appId,
      name: props.envName,
    });

    new CfnConfigurationProfile(this, 'Profile', {
      applicationId: appId,
      locationUri: 'hosted',
      name: props.envProfileName,
      type: 'AWS.Freeform',
    });

    const functionCode = Code.fromInline(
      readFileSync('lib/lambda/config.py').toString(),
    );

    const functionHandler = 'index.handler';

    const functionLayers = [
      LayerVersion.fromLayerVersionArn(
        this,
        'AppConfigLayer',
        props.layerVersionArn,
      ),
    ];

    const functionPolicy = new PolicyStatement({
      actions: [
        'appconfig:StartConfigurationSession',
        'appconfig:GetLatestConfiguration',
      ],
      resources: [
        `arn:aws:appconfig:${this.region}:${this.account}:`
          + `application/${appId}/`
          + `environment/${env.ref}/*`,
      ],
    });

    const functionRuntime = Runtime.PYTHON_3_9;

    const envFunction = new Function(this, 'EnvFunction', {
      runtime: functionRuntime,
      code: functionCode,
      environment: {
        CONFIG_APP: appId,
        CONFIG_ENV: props.envName,
        CONFIG_NAME: props.envProfileName,
      },
      handler: functionHandler,
      layers: functionLayers,

    });
    envFunction.addToRolePolicy(functionPolicy);

    const envApi = new LambdaRestApi(
      this,
      `${props.restApiPrefix}-env-config-api`,
      { handler: envFunction },
    );

    this.envApiId = envApi.restApiId;
    this.envApiIdExport = this.exportValue(envApi.restApiId);

    const flagsFunction = new Function(this, 'FlagsFunction', {
      runtime: functionRuntime,
      code: functionCode,
      environment: {
        CONFIG_APP: appId,
        CONFIG_ENV: props.envName,
        CONFIG_NAME: props.flagsProfileName || 'Flags',
      },
      handler: functionHandler,
      layers: functionLayers,
    });
    flagsFunction.addToRolePolicy(functionPolicy);

    const flagsApi = new LambdaRestApi(
      this,
      `${props.restApiPrefix}-flags-config-api`,
      { handler: flagsFunction },
    );

    this.flagsApiId = flagsApi.restApiId;
    this.flagsApiIdExport = this.exportValue(flagsApi.restApiId);
  }
}
