import {
  CfnOutput, RemovalPolicy, Stack, StackProps,
} from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';

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
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props?: StaticSiteStackProps) {
    super(scope, id, props);

    let siteDomain: string | undefined = props?.domainName;
    if (props?.subdomain && siteDomain) {
      siteDomain = `${props.subdomain}.${siteDomain}`;
    }

    if (siteDomain) {
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

    if (siteDomain && zone && !certificate) {
      certificate = new acm.DnsValidatedCertificate(this, 'SiteCertificate', {
        domainName: siteDomain,
        region: 'us-east-1',
        hostedZone: zone,
      });
    }

    const oai = new cloudfront.OriginAccessIdentity(this, 'SiteOAI');
    const oaiS3CanonicalUserId = oai.cloudFrontOriginAccessIdentityS3CanonicalUserId;

    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      autoDeleteObjects: props?.forceDestroy,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: props?.forceDestroy ? RemovalPolicy.DESTROY : undefined,
    });
    siteBucket.addToResourcePolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: [siteBucket.arnForObjects('*')],
      principals: [new iam.CanonicalUserPrincipal(oaiS3CanonicalUserId)],
    }));
    new CfnOutput(this, 'BucketName', { value: siteBucket.bucketName });

    let headers: cloudfront.IResponseHeadersPolicy | undefined;
    if (props?.responseBehaviors) {
      headers = new cloudfront.ResponseHeadersPolicy(this, 'SiteHeaders', {
        customHeadersBehavior: {
          customHeaders: props?.responseBehaviors?.customHeaders || [],
        },
        securityHeadersBehavior: props?.responseBehaviors?.securityHeaders,
      });
    }

    this.distribution = new cloudfront.Distribution(this, 'SiteDistribution', {
      certificate,
      defaultBehavior: {
        origin: new origins.S3Origin(siteBucket, { originAccessIdentity: oai }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy: headers,
      },
      defaultRootObject: 'index.html',
      domainNames: siteDomain ? [siteDomain] : undefined,
    });
    new CfnOutput(this, 'DistributionId', { value: this.distribution.distributionId });

    if (zone) {
      const target = new targets.CloudFrontTarget(this.distribution);
      new route53.ARecord(this, 'SiteAliasRecord', {
        recordName: siteDomain,
        target: route53.RecordTarget.fromAlias(target),
        zone,
      });
    }

    if (props?.siteContentsPath) {
      new deploy.BucketDeployment(this, 'SiteDeployment', {
        destinationBucket: siteBucket,
        distribution: this.distribution,
        distributionPaths: ['/*'],
        sources: [deploy.Source.asset(props.siteContentsPath)],
      });
    }
  }
}
