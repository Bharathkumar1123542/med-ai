import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';
import * as path from 'path';
import { existsSync } from 'fs';

export class FrontendStack extends cdk.Stack {
  /**
   * The CloudFront HTTPS origin — e.g. https://d1234abc.cloudfront.net
   * Exposed so ApiStack can scope its CORS allow-list to exactly this origin.
   */
  public readonly cloudfrontDomain: string;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ── S3 bucket (private — CloudFront OAC is the only reader) ─────────────
    // Free Tier: 5 GB storage + 20,000 GET requests/month.
    // Block all public access; we rely on Origin Access Control, not bucket policies.
    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // safe to destroy for a hackathon project
      autoDeleteObjects: true,
      versioned: false,
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    // ── Origin Access Control (replaces the deprecated Origin Access Identity) ─
    const oac = new cloudfront.S3OriginAccessControl(this, 'SiteOAC', {
      description: 'MedAI SPA OAC',
    });

    const s3Origin = origins.S3BucketOrigin.withOriginAccessControl(siteBucket, {
      originAccessControl: oac,
    });

    // ── CloudFront distribution ──────────────────────────────────────────────
    // PriceClass_100 covers US/EU/APAC edge nodes including Mumbai (ap-south-1).
    // Free Tier: 1 TB/month egress + 10 M requests/month.
    const distribution = new cloudfront.Distribution(this, 'SiteDistribution', {
      defaultBehavior: {
        origin: s3Origin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
      },
      defaultRootObject: 'index.html',
      // react-router-dom client-side routing: 403/404 from S3 → serve index.html
      errorResponses: [
        {
          httpStatus: 403,
          responsePagePath: '/index.html',
          responseHttpStatus: 200,
          ttl: cdk.Duration.seconds(0),
        },
        {
          httpStatus: 404,
          responsePagePath: '/index.html',
          responseHttpStatus: 200,
          ttl: cdk.Duration.seconds(0),
        },
      ],
      comment: 'MedAI Diagnosis SPA',
    });

    // ── Initial asset deployment ──────────────────────────────────────────────
    // In CI this is replaced by `aws s3 sync dist/ s3://BUCKET --delete` +
    // a CloudFront invalidation for speed. This BucketDeployment handles the
    // first `cdk deploy` where no CI pipeline is running yet.
    //
    // Guard: skip during `cdk synth` dry-runs (where dist/ doesn't exist yet).
    // Always run `npm run build` before `cdk deploy` in manual deploys.
    const distPath = path.join(__dirname, '../../dist');
    if (existsSync(distPath)) {
      new s3deploy.BucketDeployment(this, 'DeploySite', {
        sources: [s3deploy.Source.asset(distPath)],
        destinationBucket: siteBucket,
        distribution,
        distributionPaths: ['/*'],
      });
    } else {
      // Emit a warning but don't fail — CI uses `aws s3 sync` directly
      console.warn(
        '[FrontendStack] dist/ not found — skipping BucketDeployment. ' +
        'Run `npm run build` in the repo root before `cdk deploy`.',
      );
    }

    this.cloudfrontDomain = `https://${distribution.distributionDomainName}`;

    // ── Stack outputs (referenced by CI/CD secrets and ApiStack) ─────────────
    new cdk.CfnOutput(this, 'CloudFrontURL', {
      value: this.cloudfrontDomain,
      description: 'Public HTTPS URL for MedAI SPA',
      exportName: 'MedAiCloudFrontURL',
    });

    new cdk.CfnOutput(this, 'S3BucketName', {
      value: siteBucket.bucketName,
      description: 'S3 bucket name — used by CI aws s3 sync step',
      exportName: 'MedAiS3Bucket',
    });

    new cdk.CfnOutput(this, 'DistributionId', {
      value: distribution.distributionId,
      description: 'CloudFront distribution ID — used by CI invalidation step',
      exportName: 'MedAiDistributionId',
    });
  }
}
