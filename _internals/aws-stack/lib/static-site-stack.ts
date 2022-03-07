import {
  CfnOutput, RemovalPolicy, Stack, StackProps,
} from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import { ICachePolicy, OriginProps } from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import { HttpOrigin, OriginGroup } from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';
import SSMParameterReader from './ssm-param-reader';

export interface FailoverBucketProps {
  bucketName: string
  bucketRegion: string
}

export interface AppGwOriginProps extends OriginProps {
  apiId: string
  apiRegion: string
}

export interface AddAppGwOriginOptions {
  originProps: AppGwOriginProps

  cachePolicy?: ICachePolicy
}

export interface AppGwFailoverOriginProps extends OriginProps {
  apiIdParameterName: string
  apiRegion: string
  parameterReaderId: string
}

export interface AddAppGwOriginGroupOptions {
  primaryOriginProps: AppGwOriginProps
  failoverOriginProps: AppGwFailoverOriginProps

  cachePolicy?: ICachePolicy
}

interface StaticSiteStackBaseProps extends StackProps {
  failoverBucket?: FailoverBucketProps
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

export function getBucketProps(siteProps?: StaticSiteStackProps) {
  return {
    autoDeleteObjects: siteProps?.forceDestroy,
    blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    removalPolicy: siteProps?.forceDestroy ? RemovalPolicy.DESTROY : undefined,
  };
}

export class StaticSiteStack extends Stack {
  private readonly headers: cloudfront.ResponseHeadersPolicy | undefined;

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
      ...getBucketProps(props),
    });
    siteBucket.addToResourcePolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: [siteBucket.arnForObjects('*')],
      principals: [new iam.CanonicalUserPrincipal(oaiS3CanonicalUserId)],
    }));
    new CfnOutput(this, 'BucketName', { value: siteBucket.bucketName });

    if (props?.responseBehaviors) {
      this.headers = new cloudfront.ResponseHeadersPolicy(this, 'SiteHeaders', {
        customHeadersBehavior: {
          customHeaders: props?.responseBehaviors?.customHeaders || [],
        },
        securityHeadersBehavior: props?.responseBehaviors?.securityHeaders,
      });
    }

    const primaryOrigin = new origins.S3Origin(siteBucket, {
      originAccessIdentity: oai,
    });

    let originGroup: origins.OriginGroup | undefined;
    if (props?.failoverBucket) {
      const failoverBucket = s3.Bucket.fromBucketAttributes(
        this,
        'FailoverSiteBucket',
        {
          bucketName: props.failoverBucket.bucketName,
          region: props.failoverBucket.bucketRegion,
        },
      );

      const fallbackOrigin = new origins.S3Origin(failoverBucket, {
        originAccessIdentity: oai,
      });

      originGroup = new origins.OriginGroup({
        primaryOrigin,
        fallbackOrigin,
      });

      if (props?.siteContentsPath) {
        new deploy.BucketDeployment(this, 'FailoverSiteDeployment', {
          destinationBucket: failoverBucket,
          sources: [deploy.Source.asset(props.siteContentsPath)],
        });
      }
    }

    this.distribution = new cloudfront.Distribution(this, 'SiteDistribution', {
      certificate,
      defaultBehavior: {
        origin: originGroup || primaryOrigin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy: this.headers,
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

  addAppGwOrigin(
    pathPattern: string,
    options: AddAppGwOriginOptions,
  ) {
    this.distribution.addBehavior(
      pathPattern,
      new HttpOrigin(
        `${options.originProps.apiId}.execute-api`
          + `.${options.originProps.apiRegion}.amazonaws.com`,
        options.originProps,
      ),
      {
        responseHeadersPolicy: this.headers,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: options.cachePolicy,
      },
    );
  }

  addAppGwOriginGroup(
    pathPattern: string,
    options: AddAppGwOriginGroupOptions,
  ) {
    const fallbackApiIdReader = new SSMParameterReader(
      this,
      options.failoverOriginProps.parameterReaderId,
      {
        account: this.account,
        parameterName: options.failoverOriginProps.apiIdParameterName,
        region: options.failoverOriginProps.apiRegion,
      },
    );

    this.distribution.addBehavior(
      pathPattern,
      new OriginGroup({
        primaryOrigin: new HttpOrigin(
          `${options.primaryOriginProps.apiId}.execute-api`
            + `.${options.primaryOriginProps.apiRegion}.amazonaws.com`,
          options.primaryOriginProps,
        ),
        fallbackOrigin: new HttpOrigin(
          `${fallbackApiIdReader.getParameterValue()}.execute-api`
            + `.${options.failoverOriginProps.apiRegion}.amazonaws.com`,
          options.failoverOriginProps,
        ),
      }),
      {
        responseHeadersPolicy: this.headers,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
    );
  }
}
