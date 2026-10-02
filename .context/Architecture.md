# Architecture — MedAI Diagnosis

This is the technical source of truth for the system as it exists in the repository today. It documents the real architecture, including its gaps, rather than an idealized target state. Where the current implementation has a known weakness, this document says so explicitly and states the remediation, rather than describing the ideal and letting the gap go unsaid. Business framing lives in [`project_overview.md`](./project_overview.md); setup steps live in [`README.md`](./README.md).

---

## Contents

1. [System overview](#1-system-overview)
2. [Architecture style](#2-architecture-style)
3. [Component map](#3-component-map)
4. [Data flow](#4-data-flow)
5. [Data model](#5-data-model)
6. [External integrations](#6-external-integrations)
7. [Environment variables](#7-environment-variables)
8. [Security architecture](#8-security-architecture)
9. [Error handling conventions](#9-error-handling-conventions)
10. [Build & deployment](#10-build--deployment)
11. [Scalability considerations](#11-scalability-considerations)
12. [Testing strategy](#12-testing-strategy)
13. [Known gaps & technical debt](#13-known-gaps--technical-debt)
14. [Appendix: full directory tree](#14-appendix-full-directory-tree)

---

## 1. System overview

MedAI Diagnosis is a single-page React application that talks **directly** from the browser to:

- **Supabase** (Postgres database, Auth, and object Storage) — the system of record.
- **Google Gemini**, **GROQ**, and **ElevenLabs** — third-party AI APIs called over HTTPS with API keys present in the client bundle.

There is **no custom application server currently running in production**. A `server` npm script and several server-oriented `devDependencies` (`express`, `cors`, `multer`, `dotenv`) exist in `package.json`, and a separate Python/Gradio prototype exists under `backend/`, but neither is wired into the deployed application — see §3.4 and §13.

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              Browser (SPA)                               │
│                                                                            │
│   React Router ── AuthContext ── ProtectedRoute                          │
│        │                                                                  │
│        ├── LandingPage / LoginForm / RegisterForm                        │
│        ├── Dashboard                                                     │
│        ├── DiagnosisForm ───────────────┐                                │
│        ├── VoiceDiagnosisForm ──────────┼── calls AI APIs directly       │
│        └── DiagnosisDetail              │   (keys embedded in bundle)    │
│                                          │                                │
└──────────────────────────────────────────┼────────────────────────────────┘
                                           │
         ┌─────────────────────────────────┼─────────────────────────────┐
         │                                 │                             │
         ▼                                 ▼                             ▼
 ┌───────────────┐              ┌───────────────────┐          ┌─────────────────┐
 │   Supabase     │              │  Google Gemini API │          │   GROQ API       │
 │ ─────────────  │              │  gemini-1.5-flash   │          │  whisper-large-v3│
 │ Postgres (RLS) │              │  (image diagnosis)  │          │  llama-4-scout   │
 │ Auth           │              └───────────────────┘          └─────────────────┘
 │ Storage        │                                                        │
 │ (medical-      │                                                        ▼
 │  images bucket)│                                             ┌─────────────────┐
 └───────────────┘                                             │  ElevenLabs API  │
                                                                 │  eleven_turbo_v2 │
                                                                 │  (TTS, w/ Web    │
                                                                 │  Speech fallback)│
                                                                 └─────────────────┘

 ┌───────────────────────────────────────────────────────────┐
 │  backend/ — standalone Python + Gradio prototype           │
 │  NOT imported by, called by, or deployed with the SPA above │
 └───────────────────────────────────────────────────────────┘
```

## 2. Architecture style

This is a **client-direct Jamstack-style SPA**: all business logic that would conventionally sit in a backend (calling AI providers, assembling prompts, parsing responses, writing audit logs) instead runs in the browser, and authorization is delegated entirely to Supabase Row Level Security rather than an application-layer permission check. This is a legitimate pattern for an early-stage product and keeps infrastructure minimal, but it has one specific, serious consequence that recurs throughout this document: **any secret the browser needs to call a third party is not actually a secret.** This is addressed in full in §8.

## 3. Component map

| Component | Path | Responsibility |
|---|---|---|
| Route table | `src/App.tsx` | Declares all 8 routes; wraps authenticated routes in `ProtectedRoute`; mounts the global `ToastContainer` |
| Auth context | `src/contexts/AuthContext.tsx` | Wraps the app; exposes `user`, `session`, `loading`, `signIn`, `signUp`, `signOut`; subscribes to `supabase.auth.onAuthStateChange` |
| Route guard | `src/components/ProtectedRoute.tsx` | Renders a spinner while `loading`, redirects to `/login` (preserving `location` in router state) if unauthenticated |
| Supabase client | `src/lib/supabase.ts` | Instantiates the Supabase client from `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`; exports hand-written `Database` types for `diagnoses` and `audit_logs` (note: `follow_ups`, added in a later migration, is **not** represented in this type file — see §13) |
| Landing page | `src/components/Landing/LandingPage.tsx` | Public marketing page; no data calls |
| Auth forms | `src/components/Auth/LoginForm.tsx`, `RegisterForm.tsx` | Email/password forms calling `AuthContext.signIn` / `signUp` |
| Dashboard | `src/components/Dashboard/Dashboard.tsx` | Fetches up to 10 recent `diagnoses` and all `follow_ups` for the user; derives the 4 stat cards client-side; inline delete via native `confirm()` |
| Traditional diagnosis | `src/components/Diagnosis/DiagnosisForm.tsx` | Image upload → Gemini call → Storage upload → `diagnoses` insert → `audit_logs` insert |
| Voice diagnosis | `src/components/Diagnosis/VoiceDiagnosisForm.tsx` | Orchestrates `VoiceRecorder`, `voiceService`, `VoiceResponse`; same persistence pattern as above, plus a spoken response |
| Voice capture | `src/components/Voice/VoiceRecorder.tsx` + `src/hooks/useVoiceRecording.ts` | Wraps `MediaRecorder`/`getUserMedia`; produces a `webm/opus` `Blob` |
| Voice/AI service layer | `src/services/voiceService.ts` | All GROQ (transcription + vision chat) and ElevenLabs/Web Speech calls; the only module that talks to GROQ or ElevenLabs |
| Voice response playback | `src/components/Voice/VoiceResponse.tsx` | Audio player UI; auto-plays the synthesized response unless muted |
| Diagnosis detail | `src/components/Diagnosis/DiagnosisDetail.tsx` | Report rendering, PDF export (`jspdf` + `html2canvas`), print, delete (modal-confirmed), follow-up list |
| Follow-up modal | `src/components/Diagnosis/FollowUpModal.tsx` | Inserts into `follow_ups`; logs `follow_up_added` |
| Delete modal | `src/components/Diagnosis/DeleteConfirmModal.tsx` | Confirmation UI only; deletion logic lives in the parent component |
| Header/nav | `src/components/Layout/Header.tsx` | Top nav, active-route highlighting, sign-out |

### 3.4 The two components that are *not* part of the running system

- **`npm run server`** → `node server/index.js`. **This file does not exist in the repository.** `express`, `cors`, `multer`, and `dotenv` are present in `package.json` `devDependencies` solely in support of this script. Treat this as either an unfinished scaffold or dead weight — see §13 for the decision this forces.
- **`backend/`** — a self-contained Python prototype (`gradio-app.py`, `brain_of_the_doctor.py`, `voice_of_the_patient.py`, `voice_of_the_doctor.py`, its own `requirements.txt`). It reimplements, in Python and independently, a similar vision+voice pipeline (GROQ vision chat, GROQ Whisper or local `speech_recognition`, gTTS/ElevenLabs TTS) behind a local Gradio UI (`iface.launch()`, default `http://127.0.0.1:7860`). It contains hardcoded test strings (e.g., a default `query` and a `gtts_testing.mp3` smoke test executed at import time) consistent with it being an exploratory script, not a service. **It shares no code, no deployment, and no runtime with the React application.** Do not assume a request made in the SPA ever reaches this directory.

## 4. Data flow

### 4.1 Traditional Diagnosis flow (`DiagnosisForm.tsx`)

```
1. User fills patient name + drops an image (react-dropzone; accepts
   .jpeg/.png/.jpg/.gif/.bmp/.tiff; single file only)
2. On submit:
   a. FileReader converts the image to a base64 data URL (client-side, in memory)
   b. POST https://generativelanguage.googleapis.com/v1beta/models/
      gemini-1.5-flash:generateContent?key=<VITE_GEMINI_API_KEY>
      body: { contents: [{ parts: [ {text: <prompt>}, {inline_data: {mime_type, data}} ] }] }
   c. Response text is regex-matched for a {...} JSON block and parsed;
      on parse failure, falls back to:
        diagnosis: first line of raw text
        confidence: 0.75 (fixed default — see §9)
        observations: full raw text
        recommendations: generic "consult a healthcare professional" string
   d. supabase.storage.from('medical-images').upload(
        `${user.id}/${Date.now()}-${file.name}`, file)
   e. supabase.storage.from('medical-images').getPublicUrl(fileName)
   f. INSERT INTO diagnoses (user_id, patient_name, image_url, diagnosis,
      confidence_score, explanation)
   g. INSERT INTO audit_logs (action = 'diagnosis_created', details = {...})
   h. navigate(`/diagnosis/${data.id}`)
```

### 4.2 Voice Diagnosis flow (`VoiceDiagnosisForm.tsx` + `voiceService.ts`)

```
1. User fills patient name, uploads an image, and records audio
   (MediaRecorder, mimeType 'audio/webm;codecs=opus', 100ms timeslice)
2. On recording stop:
   POST https://api.groq.com/openai/v1/audio/transcriptions
   multipart/form-data: { file: <webm blob>, model: 'whisper-large-v3', language: 'en' }
   → transcript shown to the user before they submit
3. On submit:
   a. POST https://api.groq.com/openai/v1/chat/completions
      body: { model: 'meta-llama/llama-4-scout-17b-16e-instruct',
              messages: [{ role: 'user', content: [
                { type: 'text', text: <system prompt + transcript> },
                { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,<img>' } }
              ]}] }
      Response content is regex-matched for a {...} JSON block
      (diagnosis / confidence / explanation); same 0.75-confidence
      fallback behavior as the Traditional flow on parse failure.
   b. POST https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM
      headers: { 'xi-api-key': <VITE_ELEVENLABS_API_KEY> }
      body: { text: <explanation>, model_id: 'eleven_turbo_v2',
              voice_settings: { stability: 0.5, similarity_boost: 0.75 } }
      → audio/mpeg blob → object URL
      On any failure (missing key or request error): falls back to
      window.speechSynthesis (Web Speech API) — this path returns the
      literal string 'web-speech-api' in place of a real audio URL,
      since the Web Speech API produces no retrievable file.
   c. supabase.storage upload + getPublicUrl (identical to §4.1.d–e)
   d. INSERT INTO diagnoses (explanation = `Voice Query: "<transcript>"\n\nAI Response: <explanation>`)
   e. INSERT INTO audit_logs (action = 'voice_diagnosis_created')
   f. UI shows the response screen with audio playback;
      auto-navigates to /diagnosis/:id after 10 seconds
```

### 4.3 Authentication flow

```
1. AuthProvider mounts → supabase.auth.getSession() seeds initial state
   → supabase.auth.onAuthStateChange subscribes for the component's lifetime
2. signIn(email, password) → supabase.auth.signInWithPassword
3. signUp(email, password, fullName) → supabase.auth.signUp with
   options.data.full_name — stored in Supabase user_metadata, not in
   any application table
4. ProtectedRoute reads { user, loading } from context:
     loading   → render a spinner
     !user     → <Navigate to="/login" state={{ from: location }} />
     else      → render children
5. signOut() → supabase.auth.signOut() → navigate('/login')
```

### 4.4 Delete flow (used identically by Dashboard's inline delete and DiagnosisDetail's modal delete)

```
1. DELETE FROM follow_ups WHERE diagnosis_id = :id
2. DELETE FROM diagnoses  WHERE id = :id AND user_id = :auth.uid()
3. (DiagnosisDetail only) storage.from('medical-images').remove([
     `${user.id}/${imagePath}`])  — Dashboard's inline delete does NOT
     remove the storage object, only the DB rows (see §13)
4. INSERT INTO audit_logs (action = 'diagnosis_deleted')
```

## 5. Data model

Three Postgres tables, all with Row Level Security **enabled** and scoped to `auth.uid()`, defined across three migrations in `supabase/migrations/` (apply in this order).

### 5.1 `diagnoses` — `20250610141554_graceful_tree.sql`

| Column | Type | Constraints / default |
|---|---|---|
| `id` | `uuid` | PK, `gen_random_uuid()` |
| `user_id` | `uuid` | FK → `auth.users(id)` ON DELETE CASCADE, NOT NULL |
| `patient_name` | `text` | NOT NULL |
| `image_url` | `text` | NOT NULL |
| `diagnosis` | `text` | NOT NULL |
| `confidence_score` | `real` | NOT NULL, CHECK `0 <= x <= 1` |
| `explanation` | `text` | NOT NULL, default `''` |
| `created_at` | `timestamptz` | default `now()` |
| `updated_at` | `timestamptz` | default `now()`, auto-updated by `update_updated_at_column()` trigger on every UPDATE |

Indexes: `idx_diagnoses_user_id (user_id)`, `idx_diagnoses_created_at (created_at DESC)`.
RLS policies: separate `SELECT`/`INSERT`/`UPDATE`/`DELETE` policies, each `USING (auth.uid() = user_id)` (and matching `WITH CHECK` for INSERT/UPDATE), role `authenticated`.

### 5.2 `audit_logs` — `20250610141554_graceful_tree.sql`

| Column | Type | Constraints / default |
|---|---|---|
| `id` | `uuid` | PK, `gen_random_uuid()` |
| `user_id` | `uuid` | FK → `auth.users(id)` ON DELETE CASCADE, NOT NULL |
| `action` | `text` | NOT NULL |
| `details` | `jsonb` | default `'{}'` |
| `ip_address` | `text` | NOT NULL, default `''` — **always `'web-client'` in practice; see §8.4** |
| `created_at` | `timestamptz` | default `now()` |

Indexes: `idx_audit_logs_user_id`, `idx_audit_logs_created_at (DESC)`.
RLS policies: `SELECT` and `INSERT` only, both `auth.uid() = user_id`, role `authenticated`. There is no `UPDATE`/`DELETE` policy — audit rows are append-only by design, which is correct.

### 5.3 `follow_ups` — `20250626203938_falling_surf.sql`

| Column | Type | Constraints / default |
|---|---|---|
| `id` | `uuid` | PK, `gen_random_uuid()` |
| `diagnosis_id` | `uuid` | FK → `diagnoses(id)` ON DELETE CASCADE, NOT NULL |
| `user_id` | `uuid` | FK → `auth.users(id)` ON DELETE CASCADE, NOT NULL |
| `notes` | `text` | NOT NULL |
| `status` | `follow_up_status` (enum: `pending`, `in_progress`, `resolved`) | default `'pending'`, NOT NULL |
| `created_at` | `timestamptz` | default `now()` |
| `updated_at` | `timestamptz` | default `now()`, auto-updated by the same trigger function as `diagnoses` |

Indexes: `diagnosis_id`, `user_id`, `created_at (DESC)`, `status`.
RLS policies: full `SELECT`/`INSERT`/`UPDATE`/`DELETE` set, each `auth.uid() = user_id`, role `authenticated`.

**Note:** `src/lib/supabase.ts`'s hand-written `Database` interface only declares `diagnoses` and `audit_logs`. `follow_ups` was added in a later migration and was never added to this type file, so all `follow_ups` queries in the codebase are untyped (implicit `any`). See §13.

### 5.4 Storage — `medical-images` bucket (`20250610141822_polished_cliff.sql`)

| Setting | Value |
|---|---|
| `public` | `true` |
| `file_size_limit` | 52,428,800 bytes (50 MB) |
| `allowed_mime_types` | `image/jpeg`, `image/png`, `image/gif`, `image/bmp`, `image/tiff`, `image/webp` |

Storage policies on `storage.objects`, scoped to `bucket_id = 'medical-images'`:

| Policy | Role | Rule |
|---|---|---|
| Authenticated users can upload medical images | `authenticated` | `INSERT` where `(storage.foldername(name))[1] = auth.uid()::text` |
| Users can view their own medical images | `authenticated` | `SELECT` where `(storage.foldername(name))[1] = auth.uid()::text` |
| **Public read access for medical images** | **`public`** | **`SELECT` with no auth condition at all — any file in the bucket** |
| Users can delete their own medical images | `authenticated` | `DELETE` where `(storage.foldername(name))[1] = auth.uid()::text` |

The combination of `public: true` on the bucket and the public `SELECT` policy means **the per-user `SELECT` policy above it is redundant in practice** — anyone with a file's URL can read it, authenticated or not. This is addressed in §8.3.

## 6. External integrations

| Service | Endpoint | Model / resource | Auth | Called from | Fallback on failure |
|---|---|---|---|---|---|
| Supabase | project-specific URL | Postgres + Auth + Storage | Anon key (public by design; protected by RLS) | `src/lib/supabase.ts`, used throughout | None — errors propagate as toasts |
| Google Gemini | `generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent` | `gemini-1.5-flash` | API key as `?key=` query param | `DiagnosisForm.tsx` only | JSON-parse failure → fixed `0.75` confidence + raw text as explanation |
| GROQ (transcription) | `api.groq.com/openai/v1/audio/transcriptions` | `whisper-large-v3` | `Authorization: Bearer` | `voiceService.ts::transcribeAudio` | Throws; caller shows a toast and the user can re-record |
| GROQ (vision chat) | `api.groq.com/openai/v1/chat/completions` | `meta-llama/llama-4-scout-17b-16e-instruct` | `Authorization: Bearer` | `voiceService.ts::analyzeImageWithVoice` | Same JSON-parse fallback pattern as Gemini |
| ElevenLabs | `api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM` | `eleven_turbo_v2`, voice "Rachel" | `xi-api-key` header | `voiceService.ts::generateSpeech` | Falls back to browser `speechSynthesis`; if that API is unavailable, rejects |

All four API keys above (Supabase anon key excepted, by design) are consumed via `import.meta.env.VITE_*`, meaning Vite inlines their literal values into the built JavaScript at `npm run build` time. See §8.1.

## 7. Environment variables

| Variable | Required | Consumer | Secret-safe in this build? |
|---|---|---|---|
| `VITE_SUPABASE_URL` | Yes | `src/lib/supabase.ts` | Yes — intended to be public |
| `VITE_SUPABASE_ANON_KEY` | Yes | `src/lib/supabase.ts` | Yes — intended to be public, protected by RLS |
| `VITE_GEMINI_API_KEY` | Yes (for `/diagnose`) | `DiagnosisForm.tsx` | **No** — shipped in the client bundle |
| `VITE_GROQ_API_KEY` | Yes (for `/voice-diagnose`) | `voiceService.ts` | **No** — shipped in the client bundle |
| `VITE_ELEVENLABS_API_KEY` | No | `voiceService.ts` | **No** — shipped in the client bundle; omitting it is safe (triggers the Web Speech fallback) but does not fix the issue for Gemini/GROQ |
| `PORT` | No | Unused — reserved for the absent `server/index.js` | N/A |
| `NODE_ENV` | No | Unused — reserved for the absent `server/index.js` | N/A |

## 8. Security architecture

This section is written to be read before writing new code against this repository, not after.

### 8.1 Client-exposed AI provider keys (Critical)

**Mechanism:** Vite replaces every `import.meta.env.VITE_*` reference with its literal string value at build time. The resulting `dist/assets/*.js` file — which is public, served to every visitor — contains the Gemini, GROQ, and ElevenLabs keys in plain text. Opening browser dev tools, viewing page source, or downloading the built JS is sufficient to extract them.

**Impact:** Anyone can extract these keys and make requests against the project owner's billing/quota on Gemini, GROQ, and ElevenLabs, independent of this application entirely.

**Remediation:** Introduce a server-side layer that holds these three keys and exposes narrow endpoints the SPA calls instead (e.g., `POST /api/diagnose-image`, `POST /api/transcribe`, `POST /api/synthesize-speech`). Two concrete paths, either acceptable:
- Implement `server/index.js` for real, using the `express`/`cors`/`multer`/`dotenv` packages already present in `devDependencies`, and move the three keys there (un-prefixed, so Vite never sees or inlines them).
- Replace the above with Supabase Edge Functions, keeping all compute inside the same Supabase project.

The Supabase anon key is **not** part of this problem — it is explicitly designed to be public, and the per-table RLS policies in §5 are the actual access control for it.

### 8.2 Row Level Security (solid, keep this pattern)

Every application table (`diagnoses`, `audit_logs`, `follow_ups`) has RLS enabled with policies scoped to `auth.uid() = user_id`. This is correctly implemented and is the right pattern to extend to any new table — see `AGENTS.md` for the concrete convention to follow when adding one.

### 8.3 Public storage bucket (High)

**Mechanism:** `medical-images` is created with `public: true`, and in addition carries an explicit storage policy granting `SELECT` to role `public` (i.e., unauthenticated) with no folder-ownership condition. The per-user `authenticated` `SELECT` policy that sits alongside it is therefore not the operative control.

**Impact:** Any uploaded medical image is readable by anyone who obtains its URL. URLs follow a guessable pattern (`{user_id}/{unix_timestamp}-{original_filename}`), and are also returned directly in `diagnoses.image_url`, which itself is only protected by table-level RLS — meaning the URL is easy to obtain for the owning user, but once obtained, carries no further access control for anyone it's shared with (deliberately or not).

**Remediation:** Switch the bucket to private (`public: false`), drop the public `SELECT` policy, and switch all `getPublicUrl()` calls to `createSignedUrl()` with a short expiry, generated on demand when the image needs to render.

### 8.4 Audit log IP address is a placeholder, not a capture (Medium)

Every `audit_logs` insert in the codebase hardcodes `ip_address: 'web-client'`. There is no mechanism to capture a real client IP from a pure SPA; this requires the server-side component described in §8.1 to exist, since only a server sees the real request IP (or a trusted proxy header).

### 8.5 No role-based access control (Medium, product-level — see `project_overview.md §5`)

Every authenticated user has identical capabilities. If "healthcare professional" is meant to be an enforced role rather than a label, it does not exist as a technical control today.

### 8.6 No rate limiting on AI calls (Medium)

Because the AI provider keys are reachable directly from any browser (§8.1), there is also no application-side rate limiting or abuse protection — a client can issue requests directly against the provider APIs without going through this app's UI flow at all, bounded only by whatever limits the provider itself enforces on the key.

## 9. Error handling conventions

- **User feedback:** `react-toastify`'s `toast.success` / `toast.error` / `toast.warn` is the standard, used consistently across auth, diagnosis creation, follow-ups, and deletes. The one exception is `RegisterForm.tsx`, which uses a native `alert()` for a password-mismatch check — this is an inconsistency with the rest of the codebase's convention, not a different convention.
- **Logging:** `console.error` at every catch block; there is no centralized error reporting/telemetry (e.g., Sentry) configured.
- **Graceful degradation, by design:**
  - ElevenLabs failure → Web Speech API fallback (`voiceService.ts::generateSpeech`).
  - Missing ElevenLabs key → same fallback, without even attempting the ElevenLabs call.
- **Graceful degradation that silently lowers data quality (flag, don't propagate further):**
  - Gemini/GROQ JSON-parse failure → a **fixed** `confidence: 0.75` and the raw model text repackaged as `observations`/`explanation`, with no flag anywhere in the stored record or the UI indicating that the structured response could not be parsed and a default was substituted. Any future AI integration added to this codebase should not repeat this pattern — surface a distinguishable "could not parse structured response" state instead of a fabricated confidence number.

## 10. Build & deployment

- **Build tool:** Vite 5. `npm run build` type-checks nothing by itself (type-checking is enforced via `tsconfig` + editor/CI, not the build script) and outputs static assets to `dist/`.
- **Hosting shape:** The build output is a static SPA with client-side routing (`react-router-dom`'s `BrowserRouter`), so any static host that supports an SPA fallback (rewrite all paths to `index.html`) is sufficient — e.g., Vercel, Netlify, Cloudflare Pages. No server-side rendering is used.
- **No containerization:** no `Dockerfile` or container config exists in the repository.
- **No CI/CD:** no `.github/workflows` or other CI configuration exists in the repository. `npm run lint` and `npm run build` are the only automated gates available, and neither runs automatically today.
- **Database/infra as code:** the three files under `supabase/migrations/` are the only infrastructure-as-code in the repo; there is no CI step applying them automatically to a target Supabase project.

## 11. Scalability considerations

- **Read/write scalability for the app's own data** is effectively Supabase's (managed Postgres + connection pooling), and is not a near-term concern for this application's architecture.
- **The real scaling constraint is the AI provider layer**, both because the current design has no server-side concurrency control, caching, or queueing in front of Gemini/GROQ/ElevenLabs, and because (per §8.1) the keys authorizing those calls are not actually confined to this application's own traffic. Introducing the server-side proxy from §8.1 is also the natural place to add request queueing, response caching (e.g., for repeat/identical image+prompt pairs), and per-user rate limiting.
- **PDF generation (`html2canvas` + `jspdf`) runs entirely client-side** on the user's device and does not create server load, but its performance is bounded by the rendering complexity of the report DOM node and the user's own hardware — this is a non-issue at current report complexity.

## 12. Testing strategy

**Current state: zero automated tests, no test runner configured, no CI.** `npm run lint` is the only automated check in the repository.

Recommended starting shape for whoever adds the first tests:

| Layer | Suggested tool | Priority targets |
|---|---|---|
| Unit — hooks/services | Vitest | `useVoiceRecording`, the JSON-parsing/fallback logic in `DiagnosisForm.tsx` and `voiceService.ts` (this is exactly the kind of silent-fallback logic in §9 that benefits most from a test pinning its current behavior before anyone changes it) |
| Component | Vitest + React Testing Library | `ProtectedRoute` redirect behavior, `FollowUpModal`/`DeleteConfirmModal` form validation |
| Integration | Vitest + a mocked Supabase client | The full insert sequence in each diagnosis flow (Storage upload → table insert → audit log insert), to catch partial-failure states (e.g., Storage upload succeeds but the `diagnoses` insert fails) |
| Policy/RLS | Supabase local dev (`supabase start`) + direct SQL assertions, or `pgTAP` | Confirm a user genuinely cannot read/write another user's `diagnoses`, `follow_ups`, or storage objects — this is the one layer where a regression would be a real data breach, not just a bug |
| End-to-end | Playwright | Sign-up → sign-in → Traditional Diagnosis end-to-end → Voice Diagnosis end-to-end → add follow-up → delete (cascade check) |

## 13. Known gaps & technical debt

Consolidated, in no particular order (see §8 for the three that are security-significant):

1. **`npm run server` is dead** — `server/index.js` does not exist; `express`, `cors`, `multer`, `dotenv` in `devDependencies` are unused by anything that currently runs.
2. **`backend/` is a disconnected prototype**, not a backend for this application (§3.4).
3. **Third-party AI keys are exposed client-side** (§8.1).
4. **The `medical-images` bucket is effectively public** (§8.3).
5. **`audit_logs.ip_address` is a hardcoded placeholder**, never a real IP (§8.4).
6. **`src/lib/supabase.ts`'s `Database` type omits `follow_ups`** entirely, even though the table has existed since the third migration — all `follow_ups` queries are untyped.
7. **Dashboard's inline delete does not remove the Storage object**, unlike `DiagnosisDetail`'s delete, which does — the two delete paths are not equivalent, and the Dashboard path leaks orphaned storage objects.
8. **Two different delete-confirmation UX patterns** coexist: Dashboard uses a native `window.confirm()`; `DiagnosisDetail` uses the dedicated `DeleteConfirmModal` component. Pick one and apply it consistently.
9. **`RegisterForm.tsx` uses a native `alert()`** for password-mismatch validation, inconsistent with the `react-toastify` convention used everywhere else.
10. **A client-side stats race condition exists in `Dashboard.tsx`**: `fetchDiagnoses()` and `fetchFollowUps()` fire in the same `useEffect` without sequencing, so `calculateStats()` can run once against an empty `followUps` array before the second fetch resolves, then again via the separate `useEffect` that watches `followUps`. The stat cards briefly render `pendingFollowUps: 0` before correcting — not a data-integrity bug, but a visible flash of incorrect state worth fixing if the Dashboard is touched.
11. **No automated tests, no CI pipeline, no LICENSE file** (§12 and `README.md`).
12. **No password reset flow, no email verification UI, no MFA** in the authentication surface.

## 14. Appendix: full directory tree

```
med-ai/
├── backend/
│   ├── brain_of_the_doctor.py
│   ├── gradio-app.py
│   ├── requirements.txt
│   ├── voice_of_the_doctor.py
│   └── voice_of_the_patient.py
├── src/
│   ├── components/
│   │   ├── Auth/
│   │   │   ├── LoginForm.tsx
│   │   │   └── RegisterForm.tsx
│   │   ├── Dashboard/
│   │   │   └── Dashboard.tsx
│   │   ├── Diagnosis/
│   │   │   ├── DeleteConfirmModal.tsx
│   │   │   ├── DiagnosisDetail.tsx
│   │   │   ├── DiagnosisForm.tsx
│   │   │   ├── FollowUpModal.tsx
│   │   │   └── VoiceDiagnosisForm.tsx
│   │   ├── Landing/
│   │   │   └── LandingPage.tsx
│   │   ├── Layout/
│   │   │   └── Header.tsx
│   │   ├── Voice/
│   │   │   ├── VoiceRecorder.tsx
│   │   │   └── VoiceResponse.tsx
│   │   └── ProtectedRoute.tsx
│   ├── contexts/
│   │   └── AuthContext.tsx
│   ├── hooks/
│   │   └── useVoiceRecording.ts
│   ├── lib/
│   │   └── supabase.ts
│   ├── services/
│   │   └── voiceService.ts
│   ├── App.tsx
│   ├── index.css
│   ├── main.tsx
│   └── vite-env.d.ts
├── supabase/
│   └── migrations/
│       ├── 20250610141554_graceful_tree.sql
│       ├── 20250610141822_polished_cliff.sql
│       └── 20250626203938_falling_surf.sql
├── .env.example
├── eslint.config.js
├── index.html
├── package.json
├── package-lock.json
├── postcss.config.js
├── tailwind.config.js
├── tsconfig.app.json
├── tsconfig.json
├── tsconfig.node.json
└── vite.config.ts
```
