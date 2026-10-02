import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';

const sm = new SecretsManagerClient({ region: process.env.AWS_REGION });

let cachedGroqKey: string | undefined;

async function getGroqKey(): Promise<string> {
  if (cachedGroqKey) return cachedGroqKey;
  const cmd = new GetSecretValueCommand({
    SecretId: process.env.GROQ_SECRET_ARN!,
  });
  const res = await sm.send(cmd);
  if (!res.SecretString) {
    throw new Error('GROQ secret exists but has no string value — check Secrets Manager');
  }
  cachedGroqKey = res.SecretString;
  return cachedGroqKey;
}

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

/**
 * POST /transcribe
 *
 * Accepts multipart/form-data with fields:
 *   file:     audio/webm blob
 *   model:    (optional) defaults to whisper-large-v3
 *   language: (optional) defaults to en
 *
 * API Gateway HTTP API base64-encodes binary request bodies automatically
 * when Content-Type is not application/json. We reconstruct the raw buffer
 * and forward it verbatim to GROQ — no re-encoding needed.
 *
 * Success response (200):
 *   { text: string }
 *
 * Error responses:
 *   400 — wrong Content-Type or empty body
 *   502 — GROQ returned an error or an unexpected payload
 */
export const handler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  try {
    // ── Validate Content-Type ─────────────────────────────────────────────────
    const contentType =
      event.headers['content-type'] ??
      event.headers['Content-Type'] ??
      '';

    if (!contentType.toLowerCase().includes('multipart/form-data')) {
      return json(400, {
        error: 'Content-Type must be multipart/form-data',
      });
    }

    if (!event.body) {
      return json(400, { error: 'Request body is empty' });
    }

    // ── Reconstruct raw binary body ───────────────────────────────────────────
    // API Gateway sets isBase64Encoded=true for binary (non-JSON) request bodies
    const rawBody: Buffer = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64')
      : Buffer.from(event.body, 'utf-8');

    // ── Forward to GROQ verbatim ──────────────────────────────────────────────
    const apiKey = await getGroqKey();

    const upstream = await fetch(
      'https://api.groq.com/openai/v1/audio/transcriptions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          // Forward the exact Content-Type including the boundary parameter
          'Content-Type': contentType,
        },
        // Node 20 fetch accepts Buffer as BodyInit
        body: rawBody as unknown as BodyInit,
      },
    );

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => '');
      console.error('GROQ upstream error', upstream.status, errText);
      return json(502, {
        error: 'upstream_call_failed',
        detail: `GROQ returned HTTP ${upstream.status}`,
      });
    }

    const data = (await upstream.json()) as { text?: unknown };

    if (typeof data.text !== 'string') {
      console.error('GROQ response missing text field', JSON.stringify(data).slice(0, 500));
      return json(502, { error: 'upstream_empty_response' });
    }

    return json(200, { text: data.text });
  } catch (err) {
    console.error('transcribe unhandled error', err);
    return json(502, { error: 'upstream_call_failed' });
  }
};
