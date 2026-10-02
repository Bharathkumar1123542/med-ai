import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import * as path from 'path';

interface ApiStackProps extends cdk.StackProps {
  /**
   * The CloudFront HTTPS URL from FrontendStack — used to scope the CORS
   * allow-list so only your own SPA can call the API.
   * Example: "https://d1234abc.cloudfront.net"
   */
  allowedOrigin: string;
}

export class ApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    // ── Secret references ─────────────────────────────────────────────────────
    // fromSecretNameV2 references secrets that ALREADY EXIST in Secrets Manager.
    // CDK does NOT create the actual secret values here — you create them once
    // via the AWS CLI before running `cdk deploy` (see runbook Step 1).
    //
    // Secrets Manager cost: $0.40/secret/month (3 secrets = $1.20/month).
    // Alternatives: SSM Parameter Store SecureString is free (standard tier),
    // but Secrets Manager is chosen here because it supports automatic rotation
    // when you need to cycle provider keys later.
    const geminiSecret = secretsmanager.Secret.fromSecretNameV2(
      this, 'GeminiSecret', 'medai/gemini-api-key'
    );
    const groqSecret = secretsmanager.Secret.fromSecretNameV2(
      this, 'GroqSecret', 'medai/groq-api-key'
    );
    const elevenLabsSecret = secretsmanager.Secret.fromSecretNameV2(
      this, 'ElevenLabsSecret', 'medai/elevenlabs-api-key'
    );

    // ── Shared Lambda environment ─────────────────────────────────────────────
    // We inject the SECRET ARN (a pointer), never the secret value itself.
    // Lambda reads the actual key at runtime via GetSecretValue.
    const baseEnv = {
      NODE_OPTIONS: '--enable-source-maps',
    };

    // ── Lambda: POST /diagnose-image (Gemini) ─────────────────────────────────
    const diagnoseImageFn = new lambdaNodejs.NodejsFunction(this, 'DiagnoseImageFn', {
      functionName: 'medai-diagnose-image',
      entry: path.join(__dirname, '../lambda/diagnose-image/handler.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(60), // Gemini can be slow on large images
      memorySize: 512,
      environment: {
        ...baseEnv,
        GEMINI_SECRET_ARN: geminiSecret.secretArn,
      },
      bundling: {
        minify: true,
        sourceMap: true,
        // Node 20.x Lambda runtime ships AWS SDK v3 — mark as external so
        // esbuild doesn't try to bundle it. Keeps the zip < 1 MB.
        externalModules: ['@aws-sdk/*'],
      },
    });
    geminiSecret.grantRead(diagnoseImageFn);

    // ── Lambda: POST /transcribe (GROQ Whisper) ───────────────────────────────
    const transcribeFn = new lambdaNodejs.NodejsFunction(this, 'TranscribeFn', {
      functionName: 'medai-transcribe',
      entry: path.join(__dirname, '../lambda/transcribe/handler.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
      environment: {
        ...baseEnv,
        GROQ_SECRET_ARN: groqSecret.secretArn,
      },
      bundling: {
        minify: true,
        sourceMap: true,
        externalModules: ['@aws-sdk/*'],
      },
    });
    groqSecret.grantRead(transcribeFn);

    // ── Lambda: POST /synthesize-speech (ElevenLabs) ──────────────────────────
    const synthesizeSpeechFn = new lambdaNodejs.NodejsFunction(this, 'SynthesizeSpeechFn', {
      functionName: 'medai-synthesize-speech',
      entry: path.join(__dirname, '../lambda/synthesize-speech/handler.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        ...baseEnv,
        ELEVENLABS_SECRET_ARN: elevenLabsSecret.secretArn,
      },
      bundling: {
        minify: true,
        sourceMap: true,
        externalModules: ['@aws-sdk/*'],
      },
    });
    elevenLabsSecret.grantRead(synthesizeSpeechFn);

    // ── API Gateway HTTP API (v2) ─────────────────────────────────────────────
    // HTTP API is chosen over REST API: ~70% cheaper ($1/M vs $3.50/M requests),
    // sufficient for this use-case (no API keys, usage plans, or WAF needed).
    const httpApi = new apigatewayv2.HttpApi(this, 'MedAiHttpApi', {
      apiName: 'medai-api',
      description: 'MedAI serverless proxy — Gemini / GROQ / ElevenLabs',
      corsPreflight: {
        // Only the CloudFront domain is allowed — not '*'
        allowOrigins: [props.allowedOrigin],
        allowMethods: [apigatewayv2.CorsHttpMethod.POST, apigatewayv2.CorsHttpMethod.OPTIONS],
        allowHeaders: ['Content-Type', 'Authorization'],
        maxAge: cdk.Duration.hours(1),
      },
    });

    httpApi.addRoutes({
      path: '/diagnose-image',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: new apigatewayv2Integrations.HttpLambdaIntegration(
        'DiagnoseImageIntegration',
        diagnoseImageFn,
      ),
    });

    httpApi.addRoutes({
      path: '/transcribe',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: new apigatewayv2Integrations.HttpLambdaIntegration(
        'TranscribeIntegration',
        transcribeFn,
      ),
    });

    httpApi.addRoutes({
      path: '/synthesize-speech',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: new apigatewayv2Integrations.HttpLambdaIntegration(
        'SynthesizeSpeechIntegration',
        synthesizeSpeechFn,
      ),
    });

    // ── Outputs ───────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: httpApi.apiEndpoint,
      description: 'API Gateway base URL — set as VITE_API_BASE_URL in CI build step',
      exportName: 'MedAiApiEndpoint',
    });
  }
}
