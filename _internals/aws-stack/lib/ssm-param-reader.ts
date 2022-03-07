import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { AwsCustomResource, AwsSdkCall } from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

export interface SSMParameterReaderProps {
  account: string
  parameterName: string
  region: string
}

export default class SSMParameterReader extends AwsCustomResource {
  constructor(scope: Construct, name: string, props: SSMParameterReaderProps) {
    const { account, parameterName, region } = props;

    const ssmAwsSdkCall: AwsSdkCall = {
      service: 'SSM',
      action: 'getParameter',
      parameters: {
        Name: props.parameterName,
      },
      region: props.region,
      physicalResourceId: {
        id: `GetParameter-${Date.now().toString()}`,
      },
    };

    super(scope, name, {
      onUpdate: ssmAwsSdkCall,
      policy: {
        statements: [
          new PolicyStatement({
            resources: [
              `arn:aws:ssm:${region}:${account}:parameter/${parameterName}`,
            ],
            actions: ['ssm:GetParameter'],
          }),
        ],
      },
    });
  }

  public getParameterValue(): string {
    return this.getResponseField('Parameter.Value').toString();
  }
}
