import { Stack, StackProps, Stage } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CodePipeline, CodePipelineSource, CodeBuildStep } from 'aws-cdk-lib/pipelines';
import { BuildSpec, IBuildImage, LinuxBuildImage } from 'aws-cdk-lib/aws-codebuild';
import { Repository } from 'aws-cdk-lib/aws-ecr';

export interface PipelineStackProps extends StackProps {
  sourceConnectionArn: string
  sourceRepo: string
  synthCommands: string[]

  appStages?: Stage[]
  buildImage?: string
  installCommands?: string[]
  pipelineName?: string
  sourceBranch?: string
  synthCommandShell?: string
  synthEnv?: Record<string, string>
  synthOutputDir?: string
}

export class PipelineStack extends Stack {
  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);

    const sourceBranch = props.sourceBranch || 'master';

    let buildImage: IBuildImage;
    if (props.buildImage) {
      const [imageName, imageTag] = props.buildImage.split(':');
      buildImage = LinuxBuildImage.fromEcrRepository(
        Repository.fromRepositoryName(this, 'BuildImageRepository', imageName),
        imageTag,
      );
    } else {
      buildImage = LinuxBuildImage.STANDARD_5_0;
    }

    const pipeline = new CodePipeline(this, 'Pipeline', {
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
    props.appStages?.forEach((stage) => { pipeline.addStage(stage); });
  }
}
