import { Stack, StackProps, Stage } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CodePipeline, CodePipelineSource, CodeBuildStep } from 'aws-cdk-lib/pipelines';
import { BuildSpec, IBuildImage, LinuxBuildImage } from 'aws-cdk-lib/aws-codebuild';
import { IRepository, Repository } from 'aws-cdk-lib/aws-ecr';

export interface PipelineStackProps extends StackProps {
  sourceConnectionArn: string
  sourceRepo: string
  synthCommands: string[]

  appStages?: Stage[]
  buildImageFromEcr?: string
  installCommands?: string[]
  pipelineName?: string
  sourceRepoBranch?: string
  synthCommandShell?: string
  synthEnv?: Record<string, string>
  synthOutputDir?: string
}

export class PipelineStack extends Stack {
  public readonly pipeline: CodePipeline;

  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);

    const sourceBranch = props.sourceRepoBranch || 'master';

    let buildImage: IBuildImage | undefined;
    let buildImageRepo: IRepository | undefined;
    if (props.buildImageFromEcr) {
      const [imageRepoName, imageTag] = props.buildImageFromEcr.split(':');
      buildImageRepo = Repository.fromRepositoryName(
        this,
        'BuildImageRepository',
        imageRepoName,
      );
      buildImage = LinuxBuildImage.fromEcrRepository(buildImageRepo, imageTag);
    }

    this.pipeline = new CodePipeline(this, 'Pipeline', {
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
          },
        }),
        primaryOutputDirectory: props.synthOutputDir,
        projectName: props.pipelineName ? `${props.pipelineName}-synth` : undefined,
      }),
    });
  }
}
