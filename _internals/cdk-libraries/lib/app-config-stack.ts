import {
  Stack, StackProps,
} from 'aws-cdk-lib';
import { LambdaRestApi, StageOptions } from 'aws-cdk-lib/aws-apigateway';
import { CfnApplication, CfnConfigurationProfile, CfnEnvironment } from 'aws-cdk-lib/aws-appconfig';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import {
  Code, Function, LayerVersion, Runtime,
} from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

export interface ApplicationConfigStackProps extends StackProps {
  appName: string
  envName: string
  layerVersionArn: string
  restApiPrefix: string

  appDescription?: string
  envProfileName?: string
  flagsProfileName?: string
  restApiOptions?: StageOptions
}

export default class ApplicationConfigStack extends Stack {
  public readonly envApi: LambdaRestApi;

  public readonly flagsApi: LambdaRestApi;

  constructor(scope: Construct, id: string, props: ApplicationConfigStackProps) {
    super(scope, id, props);

    const app = new CfnApplication(this, 'Application', {
      name: props.appName,
      description: props.appDescription,
    });

    const env = new CfnEnvironment(this, 'Environment', {
      applicationId: app.ref,
      name: props.envName,
    });

    const flagsProfile = new CfnConfigurationProfile(this, 'FlagsProfile', {
      applicationId: app.ref,
      locationUri: 'hosted',
      name: props.flagsProfileName || 'Flags',
      type: 'AWS.AppConfig.FeatureFlags',
    });

    const envProfile = new CfnConfigurationProfile(this, 'EnvProfile', {
      applicationId: app.ref,
      locationUri: 'hosted',
      name: props.envProfileName || props.envName,
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
          + `application/${app.ref}/`
          + `environment/${env.ref}/*`,
      ],
    });

    const functionRuntime = Runtime.PYTHON_3_9;

    const envFunction = new Function(this, 'EnvFunction', {
      runtime: functionRuntime,
      code: functionCode,
      environment: {
        CONFIG_APP: app.ref,
        CONFIG_ENV: props.envName,
        CONFIG_NAME: envProfile.name,
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
        CONFIG_APP: app.ref,
        CONFIG_ENV: props.envName,
        CONFIG_NAME: flagsProfile.name,
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

  getEnvApiDomainName() {
    if (this.envApi.domainName?.domainName) {
      return this.envApi.domainName?.domainName;
    }
    return `${this.envApi.restApiId}.execute-api.${this.region}.amazonaws.com`;
  }

  getFlagsApiDomainName() {
    if (this.flagsApi.domainName?.domainName) {
      return this.flagsApi.domainName?.domainName;
    }
    return `${this.flagsApi.restApiId}.execute-api.${this.region}.amazonaws.com`;
  }
}
