import {
  AwsCustomResource, AwsCustomResourcePolicy, AwsSdkCall, PhysicalResourceId,
} from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

export interface SSMParameterReaderProps {
  account: string
  parameterName: string
  region: string
}

export default class SSMParameterReader extends AwsCustomResource {
  constructor(scope: Construct, name: string, props: SSMParameterReaderProps) {
    const { /* account, */ parameterName, region } = props;

    const ssmAwsSdkCall: AwsSdkCall = {
      service: 'SSM',
      action: 'getParameter',
      parameters: {
        Name: parameterName,
      },
      region,
      physicalResourceId: PhysicalResourceId.of(Date.now().toString()),
    };

    super(scope, name, {
      onUpdate: ssmAwsSdkCall,
      policy: AwsCustomResourcePolicy.fromSdkCalls({
        resources: AwsCustomResourcePolicy.ANY_RESOURCE,
      }),
    });
  }

  public getParameterValue(): string {
    return this.getResponseField('Parameter.Value').toString();
  }
}
