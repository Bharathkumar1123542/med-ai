#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { FrontendStack } from '../lib/frontend-stack';
import { ApiStack } from '../lib/api-stack';

const app = new cdk.App();

const env: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: 'ap-south-1',
};

const frontendStack = new FrontendStack(app, 'MedAiFrontendStack', { env });

const apiStack = new ApiStack(app, 'MedAiApiStack', {
  env,
  // allowedOrigin is the CloudFront https URL exposed by FrontendStack
  allowedOrigin: frontendStack.cloudfrontDomain,
});

// ApiStack CORS depends on the CloudFront domain being known first
apiStack.addStackDependency(frontendStack);
