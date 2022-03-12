import { App, Stack } from 'aws-cdk-lib';
import {
  Artifacts,
  BuildSpec, EventAction, FilterGroup, LinuxBuildImage,
  mergeBuildSpecs, Project, ProjectProps, Source,
} from 'aws-cdk-lib/aws-codebuild';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { sourceRepo } from '../lib/common';

const app = new App();

const buildStack = new Stack(app, 'StaticSiteBuild');

const artifactBucket = new Bucket(buildStack, 'ArtifactBucket');

const buildImageRepo = Repository.fromRepositoryName(
  buildStack,
  'BuildImageRepository',
  'ubuntu-build',
);

const [sourceRepoOwner, sourceRepoName] = sourceRepo.split('/');

const projectProps: ProjectProps = {
  artifacts: Artifacts.s3({ bucket: artifactBucket }),
  environment: {
    buildImage: LinuxBuildImage.fromEcrRepository(buildImageRepo, 'v1.1.2'),
  },
  source: Source.gitHub({
    owner: sourceRepoOwner,
    repo: sourceRepoName,
    webhookFilters: [
      FilterGroup.inEventOf(EventAction.PUSH).andBranchIs('master'),
    ],
  }),
};

const partialBuildSpec: BuildSpec = BuildSpec.fromObject({
  env: {
    shell: 'bash',
    variables: {
      ASDF_SCRIPT: '/root/.asdf/asdf.sh',
    },
  },
  phases: {
    install: {
      commands: [
        '. $ASDF_SCRIPT && asdf install',
      ],
    },
  },
});

new Project(buildStack, 'Project', {
  ...projectProps,
  buildSpec: mergeBuildSpecs(partialBuildSpec, BuildSpec.fromObject({
    phases: {
      phases: {
        build: {
          commands: [
            'bundle install',
            'JEKYLL_ENV=production',
            'bundle exec jekyll build --config _config.yml,_build.yml',
          ],
        },
      },
      artifacts: {
        files: [
          '**/*',
        ],
        'base-directory': '_site',
        name: 'app/$CODEBUILD_RESOLVED_SOURCE_VERSION',
      },
    },
  })),
  projectName: 'static-site-app-build',
});
