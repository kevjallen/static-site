import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { StaticSiteStack } from '../lib/static-site-stack';

describe('StaticSiteStack', () => {
  let template: Template;
  beforeAll(() => {
    const app = new cdk.App();
    const stack = new StaticSiteStack(app, 'StaticSiteStack', {});
    template = Template.fromStack(stack);
  });
  test('block all public access on bucket(s)', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });
});
