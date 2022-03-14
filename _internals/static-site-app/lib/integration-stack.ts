import { Stack, StackProps } from 'aws-cdk-lib';
import {
  BuildSpec, EventAction, FilterGroup, LinuxBuildImage,
  mergeBuildSpecs, Project, ProjectProps, Source,
} from 'aws-cdk-lib/aws-codebuild';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { Construct } from 'constructs';
import {
  cdkAppPath, cdkLibPath, domainName, sourceRepo,
} from './common';

export interface StaticSiteIntegrationStackProps extends StackProps {
  env: {
    account: string
    region?: string
  },
  sourceConnectionArn: string
}

export default class StaticSiteIntegrationStack extends Stack {
  constructor(scope: Construct, id: string, props: StaticSiteIntegrationStackProps) {
    super(scope, id, props);

    const buildImageRepo = Repository.fromRepositoryName(
      this,
      'BuildImageRepository',
      'ubuntu-build',
    );

    const buildImage = LinuxBuildImage.fromEcrRepository(buildImageRepo, 'v1.1.2');

    const integrationProjectProps: ProjectProps = {
      environment: {
        buildImage,
      },
      source: Source.gitHub({
        owner: sourceRepo.split('/')[0],
        repo: sourceRepo.split('/')[1],
        webhookFilters: [
          FilterGroup.inEventOf(EventAction.PULL_REQUEST_CREATED),
          FilterGroup.inEventOf(EventAction.PULL_REQUEST_REOPENED),
          FilterGroup.inEventOf(EventAction.PULL_REQUEST_UPDATED),
        ],
      }),
    };

    const integrationPartialBuildSpec = BuildSpec.fromObject({
      env: {
        shell: 'bash',
        variables: {
          ASDF_SCRIPT: '/root/.asdf/asdf.sh',
          GIT_AUTHOR_EMAIL: `codebuild@${domainName}`,
          GIT_AUTHOR_NAME: 'codebuild',
        },
      },
      phases: {
        install: {
          commands: [
            '. $ASDF_SCRIPT && asdf install',
          ],
        },
        pre_build: {
          commands: [
            'git checkout $CODEBUILD_WEBHOOK_BASE_REF',
            'git merge --no-commit --no-ff $CODEBUILD_RESOLVED_SOURCE_VERSION',
          ],
        },
      },
    });

    new Project(this, 'AppBuild', {
      ...integrationProjectProps,
      buildSpec: mergeBuildSpecs(integrationPartialBuildSpec, BuildSpec.fromObject({
        phases: {
          build: {
            commands: [
              'bundle install',
              'JEKYLL_ENV=production',
              'bundle exec jekyll build --config _config.yml,_build.yml',
            ],
          },
        },
      })),
      projectName: 'static-site-app-build',
    });

    new Project(this, 'PipelineBuild', {
      ...integrationProjectProps,
      buildSpec: mergeBuildSpecs(integrationPartialBuildSpec, BuildSpec.fromObject({
        env: {
          variables: {
            ACCOUNT_ID: props.env.account,
            SOURCE_CONNECTION_ARN: props.sourceConnectionArn,
          },
        },
        phases: {
          build: {
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
              'npm run cdk synth'
              + ' -c mainAccountId=$ACCOUNT_ID'
              + ' -c sourceConnectionArn=$SOURCE_CONNECTION_ARN',
            ],
          },
        },
      })),
      projectName: 'static-site-pipeline-build',
    });
  }
}
