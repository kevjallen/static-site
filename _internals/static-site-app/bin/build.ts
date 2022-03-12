import { App, NestedStack, Stack } from "aws-cdk-lib";
import { Project } from "aws-cdk-lib/aws-codebuild";
import { Bucket } from "aws-cdk-lib/aws-s3";

const app = new App();

const buildStack = new Stack(app, 'StaticSiteBuild');

const artifactBucket = new Bucket(buildStack, 'ArtifactBucket');

const appBuildStack = new NestedStack(buildStack, 'AppBuild');

const appBuildProject = new Project(appBuildStack, 'Project', {
  projectName: 'static-site-app-build',
  buildSpec: 
});
