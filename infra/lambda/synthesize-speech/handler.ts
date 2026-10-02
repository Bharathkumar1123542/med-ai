import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';

const sm = new SecretsManagerClient({ region: process.env.AWS_REGION });

let cachedElevenLabsKey: string | undefined;

async function getElevenLabsKey(): Promise<string> {
  if (cachedElevenLabsKey) return cachedElevenLabsKey;
  const cmd = new GetSecretValueCommand({
    SecretId: process.env.ELEVENLABS_SECRET_ARN!,
  });
  const res = await sm.send(cmd);
  if (!res.SecretString) {
    throw new Error(
      'ElevenLabs secret exists but has no string value — check Secrets Manager',
    );
  }
  cachedElevenLabsKey = res.SecretString;
  return cachedElevenLabsKey;
}

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

/**
 * POST /synthesize-speech
 *
 * Request body (JSON):
 *   { text: string, voiceId?: string }
 *
 * voiceId defaults to "21m00Tcm4TlvDq8ikWAM" (ElevenLabs "Rachel" voice),
 * matching the original client-side implementation.
 *
 * Lambda cannot return a raw binary response through API Gateway HTTP API
 * without configuring a binary media type at the integration level.
 * The simpler path for a hackathon: return the MP3 as base64 inside JSON.
 * The browser decodes it with atob() and creates an object URL.
 *
 * Success response (200):
 *   { audioBase64: string, mimeType: "audio/mpeg" }
 *
 * Error responses:
 *   400 — bad request (missing/empty text, text too long)
 *   502 — ElevenLabs returned an error or an unexpected payload
 */
export const handler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  try {
    // ── Parse and validate request ────────────────────────────────────────────
    const body = JSON.parse(event.body ?? '{}') as {
      text?: string;
      voiceId?: string;
    };

    if (!body.text || typeof body.text !== 'string' || body.text.trim().length === 0) {
      return json(400, { error: 'text is required and must be a non-empty string' });
    }
    if (body.text.length > 5000) {
      return json(400, { error: 'text must not exceed 5000 characters' });
    }

    const voiceId = body.voiceId ?? '21m00Tcm4TlvDq8ikWAM'; // Rachel

    // ── Call ElevenLabs ───────────────────────────────────────────────────────
    const apiKey = await getElevenLabsKey();

    const upstream = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          Accept: 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': apiKey,
        },
        body: JSON.stringify({
          text: body.text,
          model_id: 'eleven_turbo_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      },
    );

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => '');
      console.error('ElevenLabs upstream error', upstream.status, errText);
      return json(502, {
        error: 'upstream_call_failed',
        detail: `ElevenLabs returned HTTP ${upstream.status}`,
      });
    }

    // ── Encode MP3 audio as base64 for JSON transport ─────────────────────────
    const arrayBuffer = await upstream.arrayBuffer();
    if (arrayBuffer.byteLength === 0) {
      console.error('ElevenLabs returned empty audio body');
      return json(502, { error: 'upstream_empty_response' });
    }

    const audioBase64 = Buffer.from(arrayBuffer).toString('base64');

    return json(200, { audioBase64, mimeType: 'audio/mpeg' });
  } catch (err) {
    console.error('synthesize-speech unhandled error', err);
    return json(502, { error: 'upstream_call_failed' });
  }
};
