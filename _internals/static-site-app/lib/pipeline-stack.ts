import {
  Arn, Stack, StackProps, Stage,
} from 'aws-cdk-lib';
import { BuildSpec, LinuxBuildImage } from 'aws-cdk-lib/aws-codebuild';
import { CfnPipeline } from 'aws-cdk-lib/aws-codepipeline';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import {
  AddStageOpts, CodeBuildStep, CodePipeline,
  CodePipelineSource, Step, WaveOptions,
} from 'aws-cdk-lib/pipelines';
import { Construct } from 'constructs';
import {
  cdkAppPath, cdkLibPath, sourceRepo,
} from './common';

export interface StageDisabledReason {
  disabledReason: string
  stageName: string
}

export interface StaticSitePipelineStackProps extends StackProps {
  env: {
    account: string
    region?: string
  },
  pipelineName: string
  sourceConnectionArn: string
  version?: string
}

export default class StaticSitePipelineStack extends Stack {
  private readonly disabled: StageDisabledReason[];

  private readonly pipeline: CodePipeline;

  private readonly pipelineName: string;

  constructor(scope: Construct, id: string, props: StaticSitePipelineStackProps) {
    super(scope, id, props);

    this.disabled = [];

    this.pipelineName = props.pipelineName;

    const buildImageRepo = Repository.fromRepositoryName(
      this,
      'BuildImageRepository',
      'ubuntu-build',
    );

    const buildImage = LinuxBuildImage.fromEcrRepository(buildImageRepo, 'v1.1.2');

    this.pipeline = new CodePipeline(this, 'Pipeline', {
      crossAccountKeys: false,
      pipelineName: this.pipelineName,
      publishAssetsInParallel: false,
      synth: new CodeBuildStep('Synthesize', {
        buildEnvironment: {
          buildImage,
        },
        commands: [
          `cd ${cdkLibPath}`,
          'npm install',
          'npm run lint',
          'npm run test',
          'npm run build',
          'LIB_ARCHIVE=$PWD/$(npm pack)',
          `cd $CODEBUILD_SRC_DIR/${cdkAppPath}`,
          'npm install $LIB_ARCHIVE',
          'npm install',
          'npm run lint',
          'npm run build',
          `npm run cdk synth -- ${this.stackName}`
          + ' -c mainAccountId=$ACCOUNT_ID'
          + ' -c sourceConnectionArn=$SOURCE_CONNECTION_ARN'
          + ' -c version=$CODEBUILD_RESOLVED_SOURCE_VERSION',
        ],
        env: {
          ACCOUNT_ID: props.env.account,
          ASDF_SCRIPT: '/root/.asdf/asdf.sh',
          SOURCE_CONNECTION_ARN: props.sourceConnectionArn,
        },
        input: CodePipelineSource.connection(sourceRepo, 'master', {
          connectionArn: props.sourceConnectionArn,
          codeBuildCloneOutput: true,
          triggerOnPush: false,
        }),
        installCommands: [
          '. $ASDF_SCRIPT && asdf install',
        ],
        partialBuildSpec: BuildSpec.fromObject({
          env: {
            shell: 'bash',
          },
        }),
        primaryOutputDirectory: `${cdkAppPath}/cdk.out`,
        projectName: `${this.pipelineName}-synth`,
      }),
    });
  }

  private getAutoDisableStep(stageName: string, reason: string): Step {
    return new CodeBuildStep('DisableTransition', {
      commands: [
        'aws codepipeline disable-stage-transition'
        + ` --pipeline-name ${this.pipelineName}`
        + ` --stage-name ${stageName}`
        + ' --transition-type Inbound'
        + ` --reason "${reason}"`,
      ],
      rolePolicyStatements: [
        new PolicyStatement({
          actions: [
            'codepipeline:DisableStageTransition',
          ],
          resources: [
            Arn.format({
              account: this.account,
              partition: 'aws',
              region: this.region,
              resource: this.pipelineName,
              resourceName: stageName,
              service: 'codepipeline',
            }),
          ],
        }),
      ],
    });
  }

  addAutoDisableStage(stage: Stage, reason: string, options?: AddStageOpts) {
    this.disabled.push({
      disabledReason: reason,
      stageName: stage.stageName,
    });
    return this.pipeline.addStage(stage, {
      pre: [
        this.getAutoDisableStep(stage.stageName, reason),
        ...(options?.pre || []),
      ],
      ...options,
    });
  }

  addAutoDisableWave(id: string, reason: string, options?: WaveOptions) {
    this.disabled.push({
      disabledReason: reason,
      stageName: id,
    });
    return this.pipeline.addWave(id, {
      pre: [
        this.getAutoDisableStep(id, reason),
        ...(options?.pre || []),
      ],
      ...options,
    });
  }

  addStage(stage: Stage, options?: AddStageOpts) {
    return this.pipeline.addStage(stage, options);
  }

  addWave(id: string, options?: WaveOptions) {
    return this.pipeline.addWave(id, options);
  }

  buildPipeline() {
    this.pipeline.buildPipeline();

    const cfnPipeline = this.pipeline.pipeline.node.findChild(
      'Resource',
    ) as CfnPipeline;

    cfnPipeline.addPropertyOverride('DisableInboundStageTransitions', [
      ...this.disabled.map(
        (item) => ({
          Reason: item.disabledReason,
          StageName: item.stageName,
        }),
      ),
    ]);
  }
}
