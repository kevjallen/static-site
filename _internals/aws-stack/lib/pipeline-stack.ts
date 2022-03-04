import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CodePipeline, CodePipelineSource, CodeBuildStep } from 'aws-cdk-lib/pipelines';
import { BuildSpec, IBuildImage, LinuxBuildImage } from 'aws-cdk-lib/aws-codebuild';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { ISecret, Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';

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
  private readonly gitHubToken: ISecret | undefined;

  public readonly pipeline: CodePipeline;

  public readonly version: string | undefined;

  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);

    let buildImage: IBuildImage | undefined;
    if (props.buildImageFromEcr) {
      const [imageRepoName, imageTag] = props.buildImageFromEcr.split(':');
      const imageRepo = Repository.fromRepositoryName(
        this,
        'BuildImageRepo',
        imageRepoName,
      );
      buildImage = LinuxBuildImage.fromEcrRepository(imageRepo, imageTag);
    }

    if (props.gitHubTokenSecretName) {
      this.gitHubToken = Secret.fromSecretNameV2(
        this,
        'GitHubToken',
        props.gitHubTokenSecretName,
      );
    }

    const sourceBranch = props.sourceRepoBranch || 'master';

    this.pipeline = new CodePipeline(this, 'CodePipeline', {
      pipelineName: props.pipelineName,
      synth: new CodeBuildStep('Synthesize', {
        buildEnvironment: {
          buildImage,
        },
        commands: props.synthCommands,
        env: props.synthEnv,
        input: CodePipelineSource.connection(props.sourceRepo, sourceBranch, {
          codeBuildCloneOutput: true,
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
        rolePolicyStatements: !this.gitHubToken ? [] : [
          new PolicyStatement({
            resources: [
              this.gitHubToken.secretArn,
            ],
            actions: [
              'secretsmanager:GetResourcePolicy',
              'secretsmanager:GetSecretValue',
              'secretsmanager:DescribeSecret',
              'secretsmanager:ListSecretVersionIds',
            ],
          }),
        ],
      }),
    });

    this.version = this.node.tryGetContext('version');
  }
}
