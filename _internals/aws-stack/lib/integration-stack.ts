import { Stack, StackProps } from 'aws-cdk-lib';
import {
  BuildSpec, FilterGroup, IBuildImage, Project, Source,
} from 'aws-cdk-lib/aws-codebuild';
import { Construct } from 'constructs';
import { importBuildImageFromName } from './pipeline-stack';

export interface IntegrationStackProps extends StackProps {
  cleanUpCommands: string[]
  integrationCommands: string[]
  gitHubRepoFullName: string

  integrationCommandShell?: string
  buildImageFromEcr?: string
  integrationVars?: Record<string, string>
  installCommands?: string[]
  projectName?: string
  webhookFilters?: FilterGroup[]
}

export class IntegrationStack extends Stack {
  constructor(scope: Construct, id: string, props: IntegrationStackProps) {
    super(scope, id, props);

    let buildImage: IBuildImage | undefined;
    if (props.buildImageFromEcr) {
      buildImage = importBuildImageFromName(
        this,
        'BuildImageRepo',
        props.buildImageFromEcr,
      );
    }

    const [gitHubRepoOwner, gitHubRepoName] = props.gitHubRepoFullName.split('/');

    new Project(this, 'Project', {
      buildSpec: BuildSpec.fromObject({
        version: '0.2',
        env: {
          shell: props.integrationCommandShell,
          variables: props.integrationVars,
        },
        phases: {
          install: {
            commands: props.installCommands,
          },
          build: {
            commands: [
              'cd $CODEBUILD_SRC_DIR',
              ...props.integrationCommands,
            ],
          },
          post_build: {
            commands: [
              'cd $CODEBUILD_SRC_DIR',
              ...props.cleanUpCommands,
            ],
          },
        },
      }),
      environment: {
        buildImage,
      },
      projectName: props.projectName,
      source: Source.gitHub({
        owner: gitHubRepoOwner,
        repo: gitHubRepoName,
        webhook: !!props.webhookFilters,
        webhookFilters: props.webhookFilters,
      }),
    });
  }
}
