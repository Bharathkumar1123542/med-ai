#!/usr/bin/env bash
# Deploy med-ai to AWS Elastic Beanstalk (Docker platform).
#
# Run this from the repo root (same folder as package.json), after copying
# Dockerfile, nginx.conf and .ebignore there from this bundle.
#
# Prereqs (one-time, on whatever machine runs this — your laptop via Claude
# Code, or AWS CloudShell):
#   - AWS CLI v2, configured: `aws configure` (or already logged in to CloudShell)
#   - Node.js 18+ and npm
#   - EB CLI: pip install awsebcli --upgrade --user
#       (hit "externally managed environment"? add --break-system-packages,
#        or use: pipx install awsebcli)
#   - A real .env.production in the repo root with your actual keys
#     (copy .env.example -> .env.production and fill it in). Vite bakes
#     these into the client bundle at build time, so they must exist
#     *before* `npm run build` runs below.
#
# Usage:
#   chmod +x deploy.sh
#   ./deploy.sh
#
# Re-running this script later redeploys new code to the same environment.

set -euo pipefail

APP_NAME="${APP_NAME:-med-ai}"
ENV_NAME="${ENV_NAME:-med-ai-prod}"
REGION="${AWS_REGION:-ap-south-1}"

echo "=== [1/5] Confirming AWS identity (this is your proof-of-connection) ==="
aws sts get-caller-identity

echo
echo "=== [2/5] Building the frontend (Vite) ==="
if [ ! -f .env.production ]; then
  echo "ERROR: .env.production not found. Copy .env.example to .env.production" >&2
  echo "       and fill in your real Supabase/Gemini/Groq/ElevenLabs keys first." >&2
  exit 1
fi
npm ci
npm run build

echo
echo "=== [3/5] Initializing Elastic Beanstalk application (safe to re-run) ==="
eb init "$APP_NAME" --platform docker --region "$REGION"

echo
echo "=== [4/5] Creating or updating the environment ==="
if eb status "$ENV_NAME" >/dev/null 2>&1; then
  echo "Environment '$ENV_NAME' already exists — deploying new version..."
  eb deploy "$ENV_NAME"
else
  echo "Creating new single-instance environment '$ENV_NAME'..."
  eb create "$ENV_NAME" --single --instance-type t3.micro --timeout 20
fi

echo
echo "=== [5/5] Current status and public URL ==="
eb status "$ENV_NAME"

echo
echo "Done. Look for the 'CNAME' line above — that's your public URL"
echo "(prefix it with http:// to open it, e.g. http://<cname>)."
