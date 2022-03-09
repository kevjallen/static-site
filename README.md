# Static Site

This repository demonstrates CI/CD for a static website using the AWS CDK (TypeScript).


## Bootstrapping AWS

The target AWS account/region pair must be bootstrapped for use with the CDK.

The cdk bootstrap command will grant admin rights to CloudFormation by default.
- Use the `--cloudformation-execution-policies` flag to assign lesser permissions.


## Deploying this project

The stack must be manually deployed once from a local machine.

After the initial deployment, it will update itself when new code is pushed.
