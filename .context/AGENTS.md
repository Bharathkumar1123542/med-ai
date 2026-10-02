# AGENTS.md — MedAI Diagnosis

Instructions for AI coding agents (Claude Code, Cursor, Copilot Workspace, or similar) working in this repository. Read this before making changes. For the "why," see [`Architecture.md`](./Architecture.md) and [`project_overview.md`](./project_overview.md).

---

## 1. Project summary

A Vite + React + TypeScript single-page app that calls Supabase (Postgres/Auth/Storage) and three third-party AI APIs (Google Gemini, GROQ, ElevenLabs) directly from the browser. There is no custom application server running today, despite some scaffolding suggesting one was planned — see §6.

## 2. Setup commands

```bash
npm install
cp .env.example .env     # then fill in every value — see Architecture.md §7
npm run dev               # starts Vite on the default local port
```

Before any diagnosis flow will work end-to-end, the three SQL migrations under `supabase/migrations/` must be applied to the target Supabase project, in filename order. See `README.md` → "Supabase setup."

## 3. Build / lint / verify commands

| Command | Purpose |
|---|---|
| `npm run dev` | Local dev server with HMR |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the `dist/` build locally |
| `npm run lint` | ESLint (flat config, `@typescript-eslint` + `eslint-plugin-react-hooks` + `eslint-plugin-react-refresh`) |
| `npm run server` | **Do not rely on this.** It runs `node server/index.js`, which does not exist in this repository. If a task asks you to "run the server," confirm with the user whether they mean implementing it first, not assume it already works. |

**There is no test command.** If a task asks you to "run the tests," there are none to run — say so rather than inventing a result. If asked to add tests, use **Vitest** (pairs natively with Vite, already the build tool) and **React Testing Library** for components; add a `"test": "vitest"` script to `package.json` rather than introducing Jest.

Always run `npm run lint` after a change to `.ts`/`.tsx` files and fix what it reports before considering a task done.

## 4. Code style conventions to follow (observed throughout the existing codebase)

- **Functional components only**, typed with `React.FC<Props>`, one component per file, default-exported, filename in PascalCase matching the component name.
- **Styling is Tailwind utility classes written inline in JSX.** There are no CSS modules, no styled-components, no separate stylesheet per component (the only project-wide CSS is `src/index.css` plus the print-only block in `index.html`). Do not introduce a different styling approach in isolation.
- **Icons** come from `lucide-react` exclusively — do not add a second icon library.
- **Animation** is `framer-motion`. The established pattern is `<motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: ... }}>` for page/section entrances, and `AnimatePresence` wrapping anything conditionally rendered (modals, lists with removable items). Match this pattern rather than introducing a different animation library or a different easing convention.
- **User feedback is `react-toastify`** (`toast.success(...)`, `toast.error(...)`, `toast.warn(...)`), not `alert()` or `window.confirm()` for anything other than the one pre-existing exception in `RegisterForm.tsx` (a known inconsistency, documented in `Architecture.md §13`, not a pattern to copy).
- **Every Supabase query against a user-owned table filters by `user_id` (or `id` + `user_id` together) explicitly in the client code**, even though Row Level Security also enforces this server-side. This is a defense-in-depth convention already in the codebase — keep doing it on any new query, don't rely on RLS alone just because it happens to be sufficient.
- **Every mutating action that already has a precedent (insert/update/delete on `diagnoses` or `follow_ups`) is followed by an `INSERT INTO audit_logs`** with a descriptive `action` string and a `details` JSON object. If you add a new kind of mutation to one of these tables, add a matching audit log insert using the existing action-naming convention (`snake_case`, verb-object or object_verb, e.g. `diagnosis_created`, `follow_up_added`).
- **New authenticated pages are added to `src/App.tsx`'s route table wrapped in `<ProtectedRoute>`**, following the exact pattern already used for `/dashboard`, `/diagnose`, `/voice-diagnose`, and `/diagnosis/:id`.

## 5. Adding a new Supabase table

Follow the exact structure of the three existing files in `supabase/migrations/` — do not hand-edit the database directly and skip the migration file.

1. Create a new file named `<YYYYMMDDHHMMSS>_<two_word_slug>.sql` (match the existing timestamp+slug naming convention; a new timestamp later than the most recent existing migration).
2. Open the file with a comment block in the same style as the existing three migrations: a `/* # Title ... */` header describing the new table(s), its columns, the security approach, and any indexes — written *before* the SQL, exactly as the existing files do.
3. `CREATE TABLE IF NOT EXISTS` with an explicit `user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL` column — every application table in this schema has one, and it is what the RLS policies key on.
4. `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` **in the same migration**, immediately after creating the table. Never ship a table without this — there is no table in this schema that lacks it, and that is a hard line to hold, not a stylistic preference.
5. Add explicit `SELECT`/`INSERT`/`UPDATE`/`DELETE` policies (only the subset the table actually needs — `audit_logs` deliberately has no `UPDATE`/`DELETE` policy because audit rows must stay append-only; follow that precedent for any similarly immutable data), each `USING (auth.uid() = user_id)` and, for `INSERT`/`UPDATE`, a matching `WITH CHECK (auth.uid() = user_id)`.
6. Add indexes on `user_id`, `created_at DESC`, and any foreign key column, matching the existing three migrations.
7. If the table needs an `updated_at` column, reuse the existing `update_updated_at_column()` trigger function (defined in the first migration) rather than writing a new one.
8. **Update `src/lib/supabase.ts`'s `Database` interface** to include the new table's `Row`/`Insert`/`Update` shapes. (Note: this step was skipped for `follow_ups` in the existing codebase — see `Architecture.md §13` item 6 — do not repeat that omission.)

## 6. Things to never assume about this codebase

- **Do not assume `backend/` is connected to the frontend.** It is a standalone Python/Gradio prototype with its own `requirements.txt`, launched locally via `gradio-app.py`. It shares no imports, no deployment, and no runtime with the React app. If a task references "the backend" without further qualification, it almost certainly means Supabase + the direct AI API calls in `src/`, not this directory — confirm with the user if genuinely ambiguous.
- **Do not assume `npm run server` works.** `server/index.js` does not exist. If a task requires a real server-side component (e.g., to fix the API-key exposure issue in `Architecture.md §8.1`), that is new work, not a fix to existing wiring.
- **Do not assume `VITE_`-prefixed environment variables are secret.** They are compiled into the public client bundle. Never add a new provider API key as a `VITE_*` variable and consider the job done — that reproduces the exact problem documented in `Architecture.md §8.1`. If a task is specifically about adding a new third-party API call, raise this with the user and prefer routing it through a server-side component instead of adding another client-exposed key, unless the user explicitly says otherwise.

## 7. Things to never do

- Never commit a real `.env` file or a literal API key/secret into the repository. `.env` is already gitignored — keep it that way.
- Never remove, weaken, or bypass a Row Level Security policy, and never ship a new table without RLS enabled (§5.4).
- Never remove or water down the medical disclaimer block in `DiagnosisDetail.tsx`.
- Never introduce a new instance of the "silent fallback" pattern described in `Architecture.md §9` (an AI response that fails to parse as structured JSON being replaced with a fixed, fabricated confidence score with no indication to the user that this happened). If you touch `DiagnosisForm.tsx` or `voiceService.ts`'s parsing logic, prefer surfacing a distinguishable "response could not be parsed" state over preserving or copying the existing fallback behavior elsewhere.
- Never make the two delete flows (`Dashboard.tsx`'s inline delete vs. `DiagnosisDetail.tsx`'s modal delete) diverge further than they already do (`Architecture.md §13` item 7) — if you touch either, bring them in line with each other rather than adding a third variant.

## 8. Manual verification checklist (no automated tests exist — see §3)

Until a real test suite exists, verify any change touching the flows below by hand:

1. Register a new account, confirm redirect to `/dashboard`.
2. Sign out, sign back in with the same credentials.
3. Run a full Traditional Diagnosis (`/diagnose`): upload an image, submit, confirm redirect to the detail page with a diagnosis, confidence badge, and explanation populated.
4. Run a full Voice Diagnosis (`/voice-diagnose`): record audio, confirm the transcript appears, upload an image, submit, confirm the spoken response plays (or, if no ElevenLabs key is configured, confirm the Web Speech fallback still produces audio) and the record saves.
5. From the Dashboard, confirm the four stat cards reflect the diagnoses just created.
6. From a diagnosis detail page, add a follow-up, confirm it appears in the list with the correct status badge.
7. Delete a diagnosis from the Dashboard's inline delete, and separately delete one from the detail page's modal — confirm both remove the diagnosis and its follow-ups (and be aware, per `Architecture.md §13` item 7, that only the detail-page path currently also removes the Storage object).
8. On a diagnosis detail page, confirm both "Download PDF" and "Print" produce a reasonable rendering of the report.

## 9. Commit / PR conventions

No commit linting, PR template, or branch naming convention is currently enforced by any tooling in this repository (no `.github/` directory, no `commitlint`/`husky` config exists). In the absence of the user specifying otherwise, default to [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `chore:`, etc.) for commit messages, since it is a safe, widely-understood default — but defer to any convention the user states explicitly over this one.
