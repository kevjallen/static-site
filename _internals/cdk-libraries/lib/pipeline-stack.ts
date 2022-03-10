import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CodePipeline, CodePipelineSource, CodeBuildStep } from 'aws-cdk-lib/pipelines';
import { BuildSpec, IBuildImage, LinuxBuildImage } from 'aws-cdk-lib/aws-codebuild';
import { Repository } from 'aws-cdk-lib/aws-ecr';

export interface PipelineStackProps extends StackProps {
  sourceConnectionArn: string
  sourceRepo: string
  synthCommands: string[]

  buildImageFromEcr?: string
  crossAccountKeys?: boolean
  installCommands?: string[]
  pipelineName?: string
  publishAssetsInParallel?: boolean
  sourceRepoBranch?: string
  synthCommandShell?: string
  synthEnv?: Record<string, string>
  synthOutputDir?: string
  triggerOnPush?: boolean
}

export default class PipelineStack extends Stack {
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

    const sourceBranch = props.sourceRepoBranch || 'master';

    this.pipeline = new CodePipeline(this, 'CodePipeline', {
      crossAccountKeys: props.crossAccountKeys === true,
      pipelineName: props.pipelineName,
      publishAssetsInParallel: props.publishAssetsInParallel === true,
      synth: new CodeBuildStep('Synthesize', {
        buildEnvironment: {
          buildImage,
        },
        commands: props.synthCommands,
        env: props.synthEnv,
        input: CodePipelineSource.connection(props.sourceRepo, sourceBranch, {
          codeBuildCloneOutput: true,
          connectionArn: props.sourceConnectionArn,
          triggerOnPush: props.triggerOnPush,
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

    this.version = this.node.tryGetContext('version');
  }
}
