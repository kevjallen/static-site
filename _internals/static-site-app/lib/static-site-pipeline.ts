import {
  Arn, Stack, StackProps, Stage,
} from 'aws-cdk-lib';
import {
  BuildSpec, LinuxBuildImage,
} from 'aws-cdk-lib/aws-codebuild';
import { CfnPipeline } from 'aws-cdk-lib/aws-codepipeline';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import {
  AddStageOpts,
  CodeBuildStep, CodePipeline, CodePipelineSource,
} from 'aws-cdk-lib/pipelines';
import { Construct } from 'constructs';
import {
  cdkAppPath, cdkLibPath, sourceRepo,
} from './common';

export interface StageDisabledReason {
  disabledReason: string
  stageName: string
}

export interface StaticSitePipelineProps extends StackProps {
  env: {
    account: string
    region?: string
  },
  pipelineName: string
  sourceConnectionArn: string
  version?: string
}

export default class StaticSitePipeline extends Stack {
  public readonly pipeline: CodePipeline;

  private readonly autoDisableStages: StageDisabledReason[];

  private readonly pipelineName: string;

  constructor(scope: Construct, id: string, props: StaticSitePipelineProps) {
    super(scope, id, props);

    this.autoDisableStages = [];

    this.pipelineName = props.pipelineName;

    const buildImageRepo = Repository.fromRepositoryName(
      this,
      'BuildImageRepository',
      'ubuntu-build',
    );

    const buildImage = LinuxBuildImage.fromEcrRepository(buildImageRepo, 'v1.1.2');

    this.pipeline = new CodePipeline(this, 'Pipeline', {
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

  addAutoDisableStage(stage: Stage, reason: string, options?: AddStageOpts) {
    this.pipeline.addStage(stage, {
      pre: [
        new CodeBuildStep('DisableTransition', {
          commands: [
            'aws codepipeline disable-stage-transition'
            + ` --pipeline-name ${this.pipelineName}`
            + ` --stage-name ${stage.stageName}`
            + ' --transition-type Inbound'
            + ' --reason "Production"',
          ],
          rolePolicyStatements: [
            new PolicyStatement({
              actions: [
                'codepipeline:EnableStageTransition',
                'codepipeline:DisableStageTransition',
              ],
              resources: [
                Arn.format({
                  account: this.account,
                  partition: 'aws',
                  region: this.region,
                  resource: this.pipelineName,
                  resourceName: stage.stageName,
                  service: 'codepipeline',
                }),
              ],
            }),
          ],
        }),
        ...(options?.pre ? options.pre : []),
      ],
      ...options,
    });
    this.autoDisableStages.push({
      disabledReason: reason,
      stageName: stage.stageName,
    });
  }

  buildPipeline() {
    this.pipeline.buildPipeline();

    const cfnPipeline = this.pipeline.pipeline.node.findChild(
      'Resource',
    ) as CfnPipeline;

    cfnPipeline.addPropertyOverride('DisableInboundStageTransitions', [
      ...this.autoDisableStages.map(
        (item) => ({
          Reason: item.disabledReason,
          StageName: item.stageName,
        }),
      ),
    ]);
  }
}
