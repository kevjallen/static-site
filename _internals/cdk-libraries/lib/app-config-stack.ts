import {
  Stack, StackProps,
} from 'aws-cdk-lib';
import { LambdaRestApi, StageOptions } from 'aws-cdk-lib/aws-apigateway';
import { CfnConfigurationProfile, CfnEnvironment } from 'aws-cdk-lib/aws-appconfig';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import {
  Code, Function, LayerVersion, Runtime,
} from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

export interface ApplicationConfigStackProps extends StackProps {
  appId: string
  envName: string
  envProfileName: string
  layerVersionArn: string
  restApiPrefix: string

  flagsProfileName?: string
  restApiOptions?: StageOptions
}

export default class ApplicationConfigStack extends Stack {
  public readonly envApi: LambdaRestApi;

  public readonly flagsApi: LambdaRestApi;

  constructor(scope: Construct, id: string, props: ApplicationConfigStackProps) {
    super(scope, id, props);

    const { appId } = props;

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

    const functionCode = Code.fromAsset(`${__dirname}/lambda`);

    const functionHandler = 'config.handler';

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

    this.envApi = new LambdaRestApi(
      this,
      `${props.restApiPrefix}-env-config-api`,
      {
        handler: envFunction,
        deployOptions: props.restApiOptions,
      },
    );

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

    this.flagsApi = new LambdaRestApi(
      this,
      `${props.restApiPrefix}-flags-config-api`,
      {
        handler: flagsFunction,
        deployOptions: props.restApiOptions,
      },
    );
  }
}