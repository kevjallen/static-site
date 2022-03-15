import { Stack, StackProps } from 'aws-cdk-lib';
import {
  Artifacts, BuildSpec, EventAction, FilterGroup, LinuxBuildImage,
  mergeBuildSpecs, Project, ProjectProps, Source,
} from 'aws-cdk-lib/aws-codebuild';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { Bucket, IBucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { sourceRepo } from './common';

export default class StaticSiteArtifactsStack extends Stack {
  public readonly artifactsBucket: IBucket;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const buildImageRepo = Repository.fromRepositoryName(
      this,
      'BuildImageRepository',
      'ubuntu-build',
    );

    const buildImage = LinuxBuildImage.fromEcrRepository(buildImageRepo, 'v1.1.2');

    const projectProps: ProjectProps = {
      environment: {
        buildImage,
      },
      source: Source.gitHub({
        owner: sourceRepo.split('/')[0],
        repo: sourceRepo.split('/')[1],
        webhookFilters: [
          FilterGroup.inEventOf(EventAction.PUSH).andBranchIs('master'),
        ],
      }),
    };

    const partialBuildSpec = BuildSpec.fromObject({
      version: 0.2,
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

    this.artifactsBucket = new Bucket(this, 'ArtifactsBucket');

    new Project(this, 'SiteArtifactsBuild', {
      ...projectProps,
      artifacts: Artifacts.s3({
        bucket: this.artifactsBucket,
        includeBuildId: false,
      }),
      buildSpec: mergeBuildSpecs(partialBuildSpec, BuildSpec.fromObject({
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
          name: 'Site/$CODEBUILD_RESOLVED_SOURCE_VERSION',
        },
      })),
      projectName: 'static-site-artifacts-build-site',
    });
  }
}
