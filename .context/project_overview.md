# Project Overview — MedAI Diagnosis

This document describes what MedAI Diagnosis is for, who it is for, what it currently does, what it deliberately does not do, and what stands between the current codebase and a defensible production launch. For technical implementation detail, see [`Architecture.md`](./Architecture.md). For setup instructions, see [`README.md`](./README.md).

---

## 1. Problem statement

Preliminary interpretation of a medical image (an X-ray, a skin photo, a scan) and a first-pass answer to "what might this be, and what should I do next" is often gated behind an appointment, a wait, or geography. MedAI Diagnosis targets that gap: a user uploads an image, optionally describes their concern by voice instead of typing, and receives an immediate AI-generated preliminary read — in text, spoken aloud, and as a downloadable report — while making unmistakably clear that this is not a diagnosis from a licensed clinician.

The product's two explicit differentiators, reflected directly in the codebase and landing page copy, are:

- **Voice as a first-class input and output modality**, not a bolt-on — intended to lower the barrier for users who find typing symptoms difficult or unnatural, or who are in a context (e.g., a phone camera and a spoken question) where voice is the faster path.
- **A persistent record per diagnosis** — not a one-off chat response — with follow-up notes, status tracking, and an exportable/printable report, so a single AI interaction becomes part of an ongoing (if informal) record.

## 2. Target users

The in-app copy ("Sign in to your healthcare professional account", "Join our healthcare professional network") and landing-page feature list ("Perfect for remote healthcare scenarios") position the product toward:

- **Community health workers and remote/rural clinic staff** performing preliminary triage before escalating to a physician.
- **Individual healthcare professionals** who want a quick, documented second opinion on an image, with a record they can export.

**Important caveat:** this positioning is marketing copy and UX framing only. There is currently **no technical enforcement** of a "healthcare professional" role — see §5 and §7. Any person who can complete email/password sign-up has full, identical access to create, view, and delete diagnoses. Product and engineering should treat "healthcare professional" as an intended audience to design and message for, not a security boundary that exists today.

## 3. Core value proposition

| For the user | Through this mechanism |
|---|---|
| Get a fast preliminary read on a medical image | Two independent AI pipelines (Gemini for text-based flow, GROQ Llama 4 Scout for voice flow), both returning a diagnosis, confidence score, and explanation within the same request/response cycle |
| Describe a concern naturally instead of typing it | Browser microphone capture → GROQ Whisper transcription → the transcript is fed directly into the vision+text prompt |
| Hear the response, not just read it | ElevenLabs text-to-speech, with automatic fallback to the browser's built-in Web Speech API if no ElevenLabs key is configured or the call fails |
| Keep a record instead of losing the exchange | Every completed diagnosis is persisted to Postgres (`diagnoses` table) with the source image in Supabase Storage |
| Track what happened after the AI's first read | A `follow_ups` table lets the user add dated notes with a status (pending / in progress / resolved) against any diagnosis |
| Hand the result to someone else | `DiagnosisDetail` renders a formatted report that can be exported to PDF (`jspdf` + `html2canvas`) or sent to the browser's native print dialog |

## 4. Feature inventory

This is a precise mapping of what exists in the code today — not an aspirational feature list.

### 4.1 Authentication
- Email/password sign-up and sign-in via Supabase Auth (`src/contexts/AuthContext.tsx`).
- Full name captured at sign-up and stored in Supabase `user_metadata`.
- Session persistence and change detection via `supabase.auth.onAuthStateChange`.
- Route protection via `ProtectedRoute` — unauthenticated users are redirected to `/login`, with the originally requested location preserved in router state.
- No password reset flow, no email verification handling in the UI, no social/OAuth login, no multi-factor authentication.

### 4.2 Dashboard (`/dashboard`)
- Four stat cards: total diagnoses, diagnoses created in the last 7 days, average confidence score across the user's diagnoses, and count of pending follow-ups.
- Entry points into both diagnosis flows.
- A list of the user's 10 most recent diagnoses, each showing patient name, diagnosis text, date, confidence badge (color-coded: green ≥80%, yellow ≥60%, red <60%), and a pending-follow-up count badge.
- Inline delete (native `window.confirm()` dialog) directly from the list, which removes the diagnosis's follow-ups, then the diagnosis row, then logs an audit entry.

### 4.3 Traditional Diagnosis (`/diagnose`)
1. User enters a patient name and uploads one image (JPEG/PNG/GIF/BMP/TIFF via drag-and-drop or file picker).
2. On submit, the image is base64-encoded and sent to the Google Gemini API (`gemini-1.5-flash:generateContent`) with a structured prompt requesting diagnosis, observations, confidence (0–1), and recommendations as JSON.
3. The image is uploaded to the `medical-images` Supabase Storage bucket under a `{user_id}/{timestamp}-{filename}` path.
4. A row is inserted into `diagnoses`; a row is inserted into `audit_logs` with action `diagnosis_created`.
5. User is redirected to the diagnosis detail page.
6. If Gemini's response cannot be parsed as JSON, the app falls back to a default confidence of `0.75` and uses the raw text as the explanation, rather than surfacing a parsing error to the user.

### 4.4 Voice Diagnosis (`/voice-diagnose`)
1. User enters a patient name, uploads one image, and records a voice question via the browser's `MediaRecorder` API (`src/hooks/useVoiceRecording.ts`).
2. The recording is sent to GROQ's Whisper (`whisper-large-v3`) endpoint for transcription; the transcript is shown back to the user before submission.
3. On submit, the image and transcript are sent together to GROQ's chat completions endpoint using the `meta-llama/llama-4-scout-17b-16e-instruct` vision model, with a prompt requesting a conversational diagnosis, confidence, and explanation as JSON.
4. The explanation text is sent to ElevenLabs (`eleven_turbo_v2`, voice ID `21m00Tcm4TlvDq8ikWAM`) for speech synthesis; if no ElevenLabs key is configured or the request fails, the app falls back to the browser's `SpeechSynthesis` API (which cannot produce a downloadable/storable audio file — see §7).
5. The image is uploaded to Storage, a `diagnoses` row is inserted with an explanation combining the original voice query and the AI's response, and an `audit_logs` row is inserted with action `voice_diagnosis_created`.
6. The user sees a response screen with a text-to-speech player and is auto-redirected to the diagnosis detail page after 10 seconds, or can navigate immediately.

### 4.5 Diagnosis Detail & reporting (`/diagnosis/:id`)
- Full report view: patient info, source image, diagnosis text, confidence badge, explanation, and a standing medical disclaimer.
- **Add Follow-up** modal: free-text notes (≤500 characters) plus a status selector (pending / in progress / resolved); each addition is audit-logged.
- **Delete** (modal-confirmed here, unlike the Dashboard's native-confirm delete): removes follow-ups, the diagnosis row, the Storage object, and logs an audit entry.
- **Download PDF**: renders the report DOM node to canvas (`html2canvas`) and paginates it into a PDF (`jspdf`), named `diagnosis-{patient}-{date}.pdf`.
- **Print**: browser print dialog, scoped via print-only CSS in `index.html` so only the report node is printed.

### 4.6 Audit trail
- `audit_logs` records `diagnosis_created`, `voice_diagnosis_created`, `diagnosis_deleted`, and `follow_up_added` events, each with a `user_id`, an `action` string, a `details` JSON blob, and an `ip_address` field.
- `ip_address` is currently always the literal string `"web-client"` — the app does not capture a real client IP, because there is no server-side component to read it from.

## 5. Non-goals / explicitly out of scope (current state)

Stated plainly so nobody mistakes an absence for an oversight:

- **Not a regulated medical device.** No FDA/CE clearance, no clinical validation study, no claim of diagnostic accuracy is made or implied beyond the in-app disclaimer.
- **No role-based access control.** There is no "clinician" vs. "patient" vs. "admin" distinction — every account is equivalent.
- **No EHR/HIS integration.** Diagnoses live only inside this application's own Supabase project.
- **No multi-user collaboration on a single diagnosis** — records are owned and visible to exactly one user (enforced by Postgres Row Level Security keyed on `auth.uid()`).
- **No mobile application** — this is a responsive web app only.
- **No offline support.**
- **No HIPAA Business Associate Agreement, no SOC 2, no formal data processing agreement** with Supabase, Google, GROQ, or ElevenLabs is implied by this codebase existing — that is an organizational/legal undertaking separate from the code.

## 6. Current product risks worth product-level attention

These are engineering-discovered but product-relevant, because they affect what can honestly be claimed to users or stakeholders:

- **Medical image confidentiality is weaker than the UI implies.** The Storage bucket backing uploaded images is public, with a policy that allows unauthenticated read access to any file in it. A user uploading what may be a sensitive medical image should not be told or allowed to assume it is private. See `Architecture.md §8` for the mechanism and remediation options.
- **AI parsing failures are silently masked as a fixed 75% confidence score** rather than surfaced as "the AI's response could not be parsed." A product decision is needed on whether a degraded/fallback response should be visibly flagged to the end user as lower-trust output.
- **The spoken-response fallback (Web Speech API) cannot be downloaded or re-played from storage** the way an ElevenLabs-generated clip can, so the experience is inconsistent depending on whether an ElevenLabs key happens to be configured and reachable at request time.
- **The disclaimer is the only compliance control.** There is no gating screen, consent capture, or logged acknowledgment that a user has read the medical disclaimer before using the diagnosis flows.

## 7. Suggested next steps (not yet built)

In rough priority order for anyone picking this up next:

1. **Move all third-party AI calls (Gemini, GROQ, ElevenLabs) behind a server-side proxy** — either a real implementation of the currently-dead `server/index.js`, or Supabase Edge Functions — so provider API keys stop shipping to the browser.
2. **Switch the `medical-images` bucket to private** and serve images via short-lived signed URLs instead of the current public-read policy.
3. **Decide the fate of `backend/`** (the Python/Gradio prototype): either integrate it as the basis of the server-side proxy from item 1, or remove it from the repository so it stops looking like a live component to new contributors.
4. **Add automated tests** (none exist today) and a CI pipeline (none exists today) — see `Architecture.md §12` for a recommended starting shape.
5. **Add a LICENSE file** — none exists in the repository currently, which leaves the terms of reuse undefined.
6. **Decide on and implement real role separation** if the "healthcare professional" positioning is meant to be enforced rather than aspirational.
7. **Replace the hardcoded `audit_logs.ip_address` placeholder** with real capture, which requires item 1's server-side component to exist first.

## 8. Recommended metrics to track once this is live

The codebase does not currently emit analytics beyond `audit_logs`, so none of the following exist yet — they are a starting framework for product instrumentation, not reported figures:

- Diagnosis completion rate (started vs. submitted) per flow (Traditional vs. Voice).
- Split between Traditional and Voice flow usage.
- Average and distribution of `confidence_score` over time, and the rate at which responses fall back to the default `0.75` (a proxy for AI-response parsing failure rate).
- Follow-up creation rate per diagnosis and time-to-resolution across the three statuses.
- PDF export / print usage rate on the detail page, as a signal of how often a result is taken outside the app.
