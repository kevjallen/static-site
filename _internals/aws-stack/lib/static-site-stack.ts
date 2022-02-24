import {
  CfnOutput, RemovalPolicy, Stack, StackProps,
} from 'aws-cdk-lib';

import { Construct } from 'constructs';

import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as deploy from 'aws-cdk-lib/aws-s3-deployment';

interface StaticSiteStackBaseProps extends StackProps {
  forceDestroy?: boolean
  responseBehaviors?: {
    customHeaders?: cloudfront.ResponseCustomHeader[]
    securityHeaders?: cloudfront.ResponseSecurityHeadersBehavior
  }
  siteContentsPath?: string
}

export type StaticSiteStackProps = StaticSiteStackBaseProps & (
  | { domainName?: undefined, subdomain?: undefined } & (
    | { certificateArn?: undefined, hostedZoneId?: undefined }
  )
  | { domainName: string, subdomain?: string } & (
    | { certificateArn: string, hostedZoneId?: string }
    | { hostedZoneId: string, certificateArn?: string }
  )
);

export class StaticSiteStack extends Stack {
  constructor(scope: Construct, id: string, props?: StaticSiteStackProps) {
    super(scope, id, props);

    const siteDomain = [props?.subdomain, props?.domainName].join('.');

    if (props?.domainName) {
      new CfnOutput(this, 'SiteDomain', { value: siteDomain });
    }

    let zone: route53.IHostedZone | undefined;
    if (props?.hostedZoneId) {
      zone = route53.HostedZone.fromHostedZoneAttributes(this, 'Zone', {
        hostedZoneId: props?.hostedZoneId,
        zoneName: props?.domainName,
      });
    }

    let certificate : acm.ICertificate | undefined;
    if (props?.certificateArn) {
      certificate = acm.Certificate.fromCertificateArn(
        this,
        'SiteCertificate',
        props?.certificateArn,
      );
    }

    if (zone && !certificate) {
      certificate = new acm.DnsValidatedCertificate(this, 'SiteCertificate', {
        domainName: siteDomain,
        region: 'us-east-1',
        hostedZone: zone,
      });
    }

    const oai = new cloudfront.OriginAccessIdentity(this, 'SiteOAI');
    const oaiS3CanonicalUserId = oai.cloudFrontOriginAccessIdentityS3CanonicalUserId;

    const bucket = new s3.Bucket(this, 'SiteBucket', {
      autoDeleteObjects: props?.forceDestroy,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: props?.forceDestroy ? RemovalPolicy.DESTROY : undefined,
    });
    bucket.addToResourcePolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: [bucket.arnForObjects('*')],
      principals: [new iam.CanonicalUserPrincipal(oaiS3CanonicalUserId)],
    }));
    new CfnOutput(this, 'BucketName', { value: bucket.bucketName });

    let headers: cloudfront.IResponseHeadersPolicy | undefined;
    if (props?.responseBehaviors) {
      headers = new cloudfront.ResponseHeadersPolicy(this, 'SiteHeaders', {
        customHeadersBehavior: {
          customHeaders: props?.responseBehaviors?.customHeaders || [],
        },
        securityHeadersBehavior: props?.responseBehaviors?.securityHeaders,
      });
    }

    const distribution = new cloudfront.Distribution(this, 'SiteDistribution', {
      certificate,
      defaultBehavior: {
        origin: new origins.S3Origin(bucket, { originAccessIdentity: oai }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy: headers || undefined,
      },
      defaultRootObject: 'index.html',
      domainNames: siteDomain ? [siteDomain] : undefined,
    });
    new CfnOutput(this, 'DistributionId', { value: distribution.distributionId });

    if (zone) {
      const target = new targets.CloudFrontTarget(distribution);
      new route53.ARecord(this, 'SiteAliasRecord', {
        recordName: siteDomain,
        target: route53.RecordTarget.fromAlias(target),
        zone,
      });
    }

    if (props?.siteContentsPath) {
      new deploy.BucketDeployment(this, 'SiteDeployment', {
        destinationBucket: bucket,
        distribution,
        distributionPaths: ['/*'],
        sources: [deploy.Source.asset(props?.siteContentsPath)],
      });
    }
  }
}
