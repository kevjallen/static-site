import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CodePipeline, CodePipelineSource, CodeBuildStep } from 'aws-cdk-lib/pipelines';
import { BuildSpec, IBuildImage, LinuxBuildImage } from 'aws-cdk-lib/aws-codebuild';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { ISecret, Secret } from 'aws-cdk-lib/aws-secretsmanager';

export function importBuildImageFromName(
  scope: Construct,
  repoImportId: string,
  imageName: string,
): IBuildImage {
  const [imageRepoName, imageTag] = imageName.split(':');
  const imageRepo = Repository.fromRepositoryName(
    scope,
    repoImportId,
    imageRepoName,
  );
  return LinuxBuildImage.fromEcrRepository(imageRepo, imageTag);
}

export interface PipelineStackProps extends StackProps {
  sourceConnectionArn: string
  sourceRepo: string
  synthCommands: string[]

  buildImageFromEcr?: string
  gitHubTokenSecretName?: string
  installCommands?: string[]
  pipelineName?: string
  sourceRepoBranch?: string
  synthCommandShell?: string
  synthEnv?: Record<string, string>
  synthOutputDir?: string
}

export class PipelineStack extends Stack {
  public readonly gitHubToken: ISecret | undefined;

  public readonly pipeline: CodePipeline;

  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);

    let buildImage: IBuildImage | undefined;
    if (props.buildImageFromEcr) {
      buildImage = importBuildImageFromName(
        this,
        'BuildImageRepo',
        props.buildImageFromEcr,
      );
    }

    const sourceBranch = props.sourceRepoBranch || 'master';

    if (props.gitHubTokenSecretName) {
      this.gitHubToken = Secret.fromSecretNameV2(
        this,
        'GitHubToken',
        props.gitHubTokenSecretName,
      );
    }

    this.pipeline = new CodePipeline(this, 'CodePipeline', {
      pipelineName: props.pipelineName,
      synth: new CodeBuildStep('Synthesize', {
        buildEnvironment: {
          buildImage,
        },
        commands: props.synthCommands,
        env: props.synthEnv,
        input: CodePipelineSource.connection(props.sourceRepo, sourceBranch, {
          connectionArn: props.sourceConnectionArn,
        }),
        installCommands: props.installCommands,
        partialBuildSpec: BuildSpec.fromObject({
          env: {
            shell: props.synthCommandShell,
            'secrets-manager': {
              GITHUB_TOKEN: this.gitHubToken?.secretArn,
            },
          },
        }),
        primaryOutputDirectory: props.synthOutputDir,
        projectName: props.pipelineName ? `${props.pipelineName}-synth` : undefined,
      }),
    });
  }

  public buildPipeline() {
    this.pipeline.buildPipeline();
    if (this.gitHubToken) {
      this.gitHubToken.grantRead(this.pipeline.synthProject);
    }
  }
}
