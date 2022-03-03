# Static Site

This repository demonstrates CI/CD for a static website using the AWS CDK (TypeScript).


## Bootstrapping AWS

The target AWS account/region pair must be bootstrapped for use with the CDK.

The cdk bootstrap command will grant admin rights to CloudFormation by default.
- Use the `--cloudformation-execution-policies` flag to assign lesser permissions.


## Deploying this project

The default stack will deploy a self-mutating continuous delivery pipeline to AWS.

After being manully deployed once, it will update itself during its normal execution.

There is also an integration project which deploys transient sites for E2E testing.

Override the app in your CDK command to target the (optional) integration project.
- `cdk deploy --app='npx ts-node --prefer-ts-exts bin/integration.ts'`

In this example, the integration project runs on code changes to pull requests.
