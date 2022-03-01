import { Duration } from 'aws-cdk-lib';
import { HeadersFrameOption, HeadersReferrerPolicy } from 'aws-cdk-lib/aws-cloudfront';
import { StaticSiteStackProps } from '../lib/static-site-stack';

const commonSiteProps: StaticSiteStackProps = {
  responseBehaviors: {
    securityHeaders: {
      contentTypeOptions: {
        override: false,
      },
      frameOptions: {
        frameOption: HeadersFrameOption.DENY,
        override: false,
      },
      referrerPolicy: {
        referrerPolicy: HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
        override: false,
      },
      strictTransportSecurity: {
        accessControlMaxAge: Duration.seconds(600),
        includeSubdomains: true,
        override: false,
      },
      xssProtection: {
        modeBlock: true,
        override: false,
        protection: true,
      },
    },
  },
};
export default commonSiteProps;
