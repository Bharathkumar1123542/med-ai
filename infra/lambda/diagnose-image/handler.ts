import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';

const sm = new SecretsManagerClient({ region: process.env.AWS_REGION });

/**
 * Cache the API key for the lifetime of this Lambda execution environment.
 * Warm invocations skip the Secrets Manager network call (~5–10 ms saved).
 * The cache is invalidated automatically when the container is recycled
 * (typically after idle periods), which is fine for this use-case.
 */
let cachedGeminiKey: string | undefined;

async function getGeminiKey(): Promise<string> {
  if (cachedGeminiKey) return cachedGeminiKey;
  const cmd = new GetSecretValueCommand({
    SecretId: process.env.GEMINI_SECRET_ARN!,
  });
  const res = await sm.send(cmd);
  if (!res.SecretString) {
    throw new Error('Gemini secret exists but has no string value — check Secrets Manager');
  }
  cachedGeminiKey = res.SecretString;
  return cachedGeminiKey;
}

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

/**
 * POST /diagnose-image
 *
 * Request body (JSON):
 *   { imageBase64: string, mimeType?: string }
 *
 * Success response (200):
 *   { diagnosis: string, observations: string, confidence: number, recommendations: string }
 *
 * Error responses:
 *   400 — bad request (missing/invalid fields)
 *   422 — upstream responded but payload was not parseable as expected JSON
 *   502 — upstream call failed or returned an error
 */
export const handler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  try {
    // ── Parse and validate request ────────────────────────────────────────────
    const body = JSON.parse(event.body ?? '{}') as {
      imageBase64?: string;
      mimeType?: string;
    };

    if (!body.imageBase64 || typeof body.imageBase64 !== 'string') {
      return json(400, { error: 'imageBase64 is required and must be a string' });
    }
    // Lightweight base64 sanity check — not a full validation, just avoids
    // obviously bad values that would waste a Gemini API call
    if (!/^[A-Za-z0-9+/=\n\r]+$/.test(body.imageBase64)) {
      return json(400, { error: 'imageBase64 contains invalid characters' });
    }

    const mimeType = body.mimeType ?? 'image/jpeg';

    // ── Call Gemini ──────────────────────────────────────────────────────────
    const apiKey = await getGeminiKey();

    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `As a medical AI assistant, analyze this medical image and provide:
1. A preliminary diagnosis or findings
2. Key observations
3. Confidence level (0-1)
4. Recommendations for further evaluation

Format your response as a JSON object with these exact fields:
- diagnosis: string
- observations: string
- confidence: number (0-1)
- recommendations: string

Important: This is for educational/assistant purposes only and does not replace professional medical consultation.`,
                },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: body.imageBase64,
                  },
                },
              ],
            },
          ],
        }),
      },
    );

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => '');
      console.error('Gemini upstream error', upstream.status, errText);
      return json(502, {
        error: 'upstream_call_failed',
        detail: `Gemini returned HTTP ${upstream.status}`,
      });
    }

    const data = (await upstream.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const textContent = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textContent) {
      console.error('Gemini returned empty content', JSON.stringify(data).slice(0, 500));
      return json(502, { error: 'upstream_empty_response' });
    }

    // ── Parse the structured JSON from Gemini's text output ──────────────────
    // Constraint from Architecture.md §9: do NOT silently invent a confidence
    // number on parse failure — return a distinguishable error instead.
    const jsonMatch = textContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('Gemini response not JSON-parseable:', textContent.slice(0, 500));
      return json(422, {
        error: 'provider_response_unparseable',
        detail: 'Gemini did not return a JSON object in its response; please retry',
      });
    }

    let parsed: {
      diagnosis?: unknown;
      observations?: unknown;
      confidence?: unknown;
      recommendations?: unknown;
    };
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      return json(422, {
        error: 'provider_response_unparseable',
        detail: 'Gemini JSON was malformed; please retry',
      });
    }

    if (typeof parsed.confidence !== 'number') {
      return json(422, {
        error: 'provider_response_missing_confidence',
        detail: 'Gemini response did not include a numeric confidence field',
      });
    }

    return json(200, {
      diagnosis: typeof parsed.diagnosis === 'string' ? parsed.diagnosis : '',
      observations: typeof parsed.observations === 'string' ? parsed.observations : '',
      confidence: parsed.confidence,
      recommendations: typeof parsed.recommendations === 'string' ? parsed.recommendations : '',
    });
  } catch (err) {
    console.error('diagnose-image unhandled error', err);
    return json(502, { error: 'upstream_call_failed' });
  }
};
