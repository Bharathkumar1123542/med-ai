# 🏥 MedAI — Frontend Deployment Guide (AWS CloudShell)

> **Stack**: React 18 + Vite + TypeScript  
> **Hosting**: Amazon S3 (private) + CloudFront (CDN)  
> **IaC**: AWS CDK v2 — `MedAiFrontendStack`  
> **Region**: `ap-south-1` (Mumbai)

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Open AWS CloudShell](#2-open-aws-cloudshell)
3. [Clone the Repository](#3-clone-the-repository)
4. [Configure Environment Variables](#4-configure-environment-variables)
5. [Install Dependencies & Build](#5-install-dependencies--build)
6. [First-Time CDK Deployment](#6-first-time-cdk-deployment)
7. [Subsequent Deployments (Code Updates)](#7-subsequent-deployments-code-updates)
8. [Verify the Deployment](#8-verify-the-deployment)
9. [CloudFront Cache Invalidation](#9-cloudfront-cache-invalidation)
10. [Rollback Procedure](#10-rollback-procedure)
11. [Tear Down / Destroy Stack](#11-tear-down--destroy-stack)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Prerequisites

| Requirement | Details |
|---|---|
| AWS Account | Admin or PowerUser IAM permissions |
| CDK Bootstrap | Run once per account/region (Step 6.1) |
| Node.js | Installed in CloudShell (pre-installed, v18+) |
| Git | Pre-installed in CloudShell |
| Env vars | Supabase URL & Anon Key ready |

> **AWS CloudShell** already has the AWS CLI and Node.js installed — no local setup needed.

---

## 2. Open AWS CloudShell

1. Log in to the **AWS Management Console** → `https://console.aws.amazon.com`
2. Set the region to **Asia Pacific (Mumbai) `ap-south-1`** using the top-right region selector
3. Click the **CloudShell** icon (`>_`) in the navigation bar  
   *(or go to: `Services → CloudShell`)*
4. Wait for the shell to initialize (~30 seconds)

```bash
# Verify your identity and region
aws sts get-caller-identity
aws configure get region          # should print: ap-south-1
```

---

## 3. Clone the Repository

```bash
# Clone your med-ai repository
git clone https://github.com/<YOUR_GITHUB_USERNAME>/med-ai.git
cd med-ai

# Verify you're on the correct branch
git branch
git log --oneline -5
```

> Replace `<YOUR_GITHUB_USERNAME>` with your actual GitHub username.  
> If the repo is private, authenticate via a Personal Access Token (PAT):
> ```bash
> git clone https://<PAT>@github.com/<YOUR_GITHUB_USERNAME>/med-ai.git
> ```

---

## 4. Configure Environment Variables

The React build uses Vite's `VITE_` prefix convention. Create the `.env` file before building.

```bash
# Copy the example env file
cp .env.example .env

# Edit the file (use nano or vim)
nano .env
```

Set the following variables inside `.env`:

```dotenv
# ── Supabase ──────────────────────────────────────────────────────────────────
VITE_SUPABASE_URL=https://<YOUR_PROJECT_REF>.supabase.co
VITE_SUPABASE_ANON_KEY=<YOUR_SUPABASE_ANON_KEY>

# ── API Gateway (filled AFTER backend deployment) ─────────────────────────────
VITE_API_BASE_URL=https://<API_GATEWAY_ID>.execute-api.ap-south-1.amazonaws.com/prod
```

Save and exit (`Ctrl+X → Y → Enter` in nano).

```bash
# Verify env vars are set
grep VITE_ .env
```

---

## 5. Install Dependencies & Build

```bash
# ── Root (frontend) dependencies ──────────────────────────────────────────────
npm ci

# ── Production build (outputs to ./dist) ──────────────────────────────────────
npm run build

# Verify the build output exists
ls -lh dist/
# Expected output:
#   index.html
#   assets/  (JS, CSS, images)
```

> **Tip**: The `dist/` folder is what gets uploaded to S3. A successful build should show no TypeScript errors.

---

## 6. First-Time CDK Deployment

### 6.1 Bootstrap CDK (once per AWS account/region)

```bash
cd infra

# Install CDK dependencies
npm ci

# Bootstrap CDK in ap-south-1 (only needed once per account)
npx cdk bootstrap aws://$(aws sts get-caller-identity --query Account --output text)/ap-south-1
```

Expected output:
```
✅  Environment aws://123456789012/ap-south-1 bootstrapped.
```

### 6.2 Synthesize (Dry Run)

```bash
# Preview the CloudFormation template without deploying
npx cdk synth MedAiFrontendStack
```

### 6.3 Deploy the Frontend Stack

```bash
# Deploy S3 bucket + CloudFront distribution + upload dist/
npx cdk deploy MedAiFrontendStack --require-approval never
```

> This will:
> - Create a **private S3 bucket** (`MedAiS3Bucket`)
> - Create a **CloudFront distribution** with OAC
> - Upload the `dist/` build to S3
> - Output the **CloudFront URL**

### 6.4 Capture Stack Outputs

```bash
# Get all stack outputs in table format
aws cloudformation describe-stacks \
  --stack-name MedAiFrontendStack \
  --region ap-south-1 \
  --query "Stacks[0].Outputs" \
  --output table
```

| Output Key | Description |
|---|---|
| `CloudFrontURL` | Public HTTPS URL — share this as the app URL |
| `S3BucketName` | S3 bucket name — used for future `aws s3 sync` |
| `DistributionId` | CloudFront distribution ID — used for cache invalidation |

```bash
# Save outputs to shell variables for convenience
CLOUDFRONT_URL=$(aws cloudformation describe-stacks \
  --stack-name MedAiFrontendStack --region ap-south-1 \
  --query "Stacks[0].Outputs[?OutputKey=='CloudFrontURL'].OutputValue" \
  --output text)

S3_BUCKET=$(aws cloudformation describe-stacks \
  --stack-name MedAiFrontendStack --region ap-south-1 \
  --query "Stacks[0].Outputs[?OutputKey=='S3BucketName'].OutputValue" \
  --output text)

DISTRIBUTION_ID=$(aws cloudformation describe-stacks \
  --stack-name MedAiFrontendStack --region ap-south-1 \
  --query "Stacks[0].Outputs[?OutputKey=='DistributionId'].OutputValue" \
  --output text)

echo "CloudFront URL  : $CLOUDFRONT_URL"
echo "S3 Bucket       : $S3_BUCKET"
echo "Distribution ID : $DISTRIBUTION_ID"
```

---

## 7. Subsequent Deployments (Code Updates)

When you push new frontend code, use the fast `aws s3 sync` path instead of re-running `cdk deploy`.

```bash
# ── Step 1: Pull latest changes ───────────────────────────────────────────────
cd ~/med-ai
git pull origin main

# ── Step 2: Update env vars if needed ─────────────────────────────────────────
# nano .env   (only if environment variables changed)

# ── Step 3: Rebuild the app ───────────────────────────────────────────────────
npm run build

# ── Step 4: Sync dist/ to S3 (--delete removes old files) ────────────────────
aws s3 sync dist/ s3://$S3_BUCKET --delete --region ap-south-1

# ── Step 5: Invalidate CloudFront cache ──────────────────────────────────────
aws cloudfront create-invalidation \
  --distribution-id $DISTRIBUTION_ID \
  --paths "/*"
```

> After invalidation, the new version is live at your `$CLOUDFRONT_URL` within **~30 seconds**.

---

## 8. Verify the Deployment

```bash
# Check CloudFront URL is accessible (HTTP 200)
curl -o /dev/null -s -w "HTTP Status: %{http_code}\n" $CLOUDFRONT_URL

# Check S3 bucket has files
aws s3 ls s3://$S3_BUCKET --recursive --human-readable --summarize | tail -5

# Check CloudFront distribution status (should be "Deployed")
aws cloudfront get-distribution \
  --id $DISTRIBUTION_ID \
  --query "Distribution.Status" \
  --output text
```

---

## 9. CloudFront Cache Invalidation

Run this anytime you want to force all edge nodes to serve fresh content:

```bash
# Invalidate all paths (/* costs 1 free invalidation per month, then $0.005/path)
INVALIDATION_ID=$(aws cloudfront create-invalidation \
  --distribution-id $DISTRIBUTION_ID \
  --paths "/*" \
  --query "Invalidation.Id" \
  --output text)

echo "Invalidation ID: $INVALIDATION_ID"

# Monitor invalidation status
aws cloudfront get-invalidation \
  --distribution-id $DISTRIBUTION_ID \
  --id $INVALIDATION_ID \
  --query "Invalidation.Status" \
  --output text
# Returns "InProgress" then "Completed"
```

---

## 10. Rollback Procedure

### Option A — Re-deploy a previous Git commit

```bash
cd ~/med-ai

# List recent commits and find a known-good one
git log --oneline -10

# Checkout the previous commit
git checkout <COMMIT_HASH>

# Rebuild and sync
npm run build
aws s3 sync dist/ s3://$S3_BUCKET --delete --region ap-south-1
aws cloudfront create-invalidation --distribution-id $DISTRIBUTION_ID --paths "/*"

# Return to main branch when done
git checkout main
```

### Option B — Restore from S3 Versioning *(if enabled)*

```bash
# List object versions for index.html
aws s3api list-object-versions \
  --bucket $S3_BUCKET \
  --prefix index.html \
  --query "Versions[*].{ID:VersionId,Modified:LastModified}" \
  --output table
```

---

## 11. Tear Down / Destroy Stack

> ⚠️ **Warning**: This permanently deletes the S3 bucket and all its contents. Use with caution.

```bash
cd ~/med-ai/infra

# Destroy the frontend stack (removes S3 bucket + CloudFront distribution)
npx cdk destroy MedAiFrontendStack --force
```

---

## 12. Troubleshooting

### ❌ `cdk: command not found`

```bash
cd ~/med-ai/infra && npm ci
npx cdk --version   # Use npx prefix instead of global cdk
```

### ❌ Build fails with TypeScript errors

```bash
cd ~/med-ai
npx tsc --noEmit    # Check type errors
npm run lint        # Check lint errors
```

### ❌ `dist/ not found` warning during `cdk deploy`

```bash
# Build the frontend BEFORE running cdk deploy
cd ~/med-ai && npm run build
cd infra && npx cdk deploy MedAiFrontendStack --require-approval never
```

### ❌ S3 sync — AccessDenied

```bash
# Verify your IAM identity has s3:PutObject on the bucket
aws sts get-caller-identity
aws s3 ls s3://$S3_BUCKET   # Should list files without error
```

### ❌ CloudFront still serving old content after S3 sync

```bash
# Force a cache invalidation
aws cloudfront create-invalidation \
  --distribution-id $DISTRIBUTION_ID \
  --paths "/*"
# Wait ~30–60 seconds, then hard-refresh your browser (Ctrl+Shift+R)
```

### ❌ `VITE_API_BASE_URL` not set / API calls failing in browser

```bash
# Verify the env var was embedded in the Vite build
grep -r "execute-api" dist/assets/*.js | head -3
# If missing, update .env and rebuild: npm run build
```

### ❌ CloudFront distribution stuck in "InProgress" state

```bash
# Just wait — initial distribution creation takes 5–15 minutes
watch -n 30 "aws cloudfront get-distribution \
  --id $DISTRIBUTION_ID \
  --query 'Distribution.Status' --output text"
```

---

## Quick Reference — Deployment Cheatsheet

```bash
# ─── First-time setup (run once) ─────────────────────────────────────────────
git clone https://github.com/<USER>/med-ai.git && cd med-ai
cp .env.example .env && nano .env          # set VITE_* variables
npm ci && npm run build
cd infra && npm ci
npx cdk bootstrap aws://$(aws sts get-caller-identity --query Account --output text)/ap-south-1
npx cdk deploy MedAiFrontendStack --require-approval never

# ─── Capture outputs ─────────────────────────────────────────────────────────
S3_BUCKET=$(aws cloudformation describe-stacks --stack-name MedAiFrontendStack \
  --region ap-south-1 \
  --query "Stacks[0].Outputs[?OutputKey=='S3BucketName'].OutputValue" --output text)
DISTRIBUTION_ID=$(aws cloudformation describe-stacks --stack-name MedAiFrontendStack \
  --region ap-south-1 \
  --query "Stacks[0].Outputs[?OutputKey=='DistributionId'].OutputValue" --output text)

# ─── Subsequent updates (fast path) ──────────────────────────────────────────
cd ~/med-ai && git pull origin main && npm run build
aws s3 sync dist/ s3://$S3_BUCKET --delete --region ap-south-1
aws cloudfront create-invalidation --distribution-id $DISTRIBUTION_ID --paths "/*"

# ─── Verify ──────────────────────────────────────────────────────────────────
CLOUDFRONT_URL=$(aws cloudformation describe-stacks --stack-name MedAiFrontendStack \
  --region ap-south-1 \
  --query "Stacks[0].Outputs[?OutputKey=='CloudFrontURL'].OutputValue" --output text)
curl -I $CLOUDFRONT_URL
```

---

*Last updated: October 2026 | Region: `ap-south-1` (Mumbai)*
