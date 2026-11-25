# Engineering Standards & AI Agent Guardrails

You are working on **maewsave (แมวอ้วนเฮง)** — a bilingual (TH/EN) mobile-first iOS PWA personal finance & smart recurring manager hosted in a **Public FinTech Repository**.
Before planning or writing any code, you MUST read:
- `docs/PRD.md`
- `docs/ARCHITECTURE.md`
- `docs/DESIGN.md`
- `docs/ROADMAP.md`
- `TEAM.md` (team workflow, role ownership, and Handoff Certificate rules)
- `.agents/MODEL_ROUTING.md` (Gemini 4 model routing & lean dispatch guide)

## 1. Mandatory Workflow (Full-Loop Engineering)
For every task or feature request:
1. **No Contract, No Code:** Every feature or phase round starts from an approved `docs/contracts/<round>_CONTRACT.md` aligned with `docs/ROADMAP.md`. Do NOT work outside the approved scope (tiny typo/doc fixes exempt).
2. **Test-Driven for Domain Logic:** Write Vitest unit tests first for any logic in `src/domain/` (money math, billing cycles, recurring schedules, statement reconciliation).
3. **Implement Cleanly:** Follow the modular architecture and role file ownership strictly. Keep functions small, cohesive, and readable.
4. **Verify Before Finishing (Handoff Certificate):** Run `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build` (plus `npx drizzle-kit check` when schema/migrations change). Never claim completion with guessed, skipped, or failing checks.
5. **Dependency Discipline:** NEVER install a new npm package without explicitly stating why it is needed and getting `boss` approval first.

## 2. Architecture & Code Quality Rules
* **Strict TypeScript:** `strict: true` is mandatory. NEVER use `any`, `@ts-ignore`, or `@ts-expect-error`.
* **Money Representation:** ALWAYS store and calculate money as `BIGINT` / integer in **satang (minor units)** (e.g., 65.50 THB = `6550`). NEVER use floating-point math for currency.
* **Neon Serverless HTTP Constraint:** `src/db/index.ts` uses `drizzle-orm/neon-http` (stateless HTTP). NEVER use interactive `db.transaction()`; use single-statement atomic SQL or Neon HTTP `db.batch([...])`.
* **Clean Layer Separation:**
  * `src/components/`: Presentational UI only. No direct DB queries, no complex business logic.
  * `src/domain/`: Pure TypeScript functions only. Zero side effects, zero DB/API calls. Must have 100% unit test coverage.
  * `src/services/`: Orchestrates DB, AI API, and Web Push Notifications.
  * `src/db/`: Drizzle ORM schema, migrations, and Neon DB connection only.
* **Validation:** Use `zod` as the Single Source of Truth for all API inputs, Server Actions, Form inputs, and AI structured outputs.

## 3. Anti-AI Slop UI/UX Standards (iOS PWA)
* **Strict Design System Compliance:** Follow `docs/DESIGN.md` strictly. Use semantic CSS variables (`--bg-canvas`, `--bg-surface`, `--brand-accent`, etc.) — NEVER hardcode raw Tailwind palette colors in components.
* **Visual Restraint:** Minimalist Monochrome + Emerald Jade Brand Accent + Semantic financial colors ONLY. Solid opaque surfaces; NO random gradients, NO excessive nested cards, NO decorative bloat.
* **Grid & Typography:** Strict 4px/8px spacing grid. Apply `tabular-nums` (`font-variant-numeric: tabular-nums`) to ALL monetary figures, dates, and percentages.
* **Zero Hardcoded UI Strings (TH/EN):** Every visible label, button, toast, empty state, and validation message MUST come from `messages/th.json` and `messages/en.json` via `next-intl` with 100% key parity.
* **iOS Standalone PWA:**
  * Respect `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)`.
  * All `<input>`, `<textarea>`, and `<select>` elements MUST have `font-size: 16px` (`text-base`) minimum to prevent iOS Safari auto-zoom.
  * Minimum `44px x 44px` tap targets. Primary actions (Quick Input, Bottom Nav) must sit comfortably in the thumb zone, using swipe-to-dismiss Bottom Sheets on mobile instead of centered modals.
* **Complete Product States:** Every data-fetching view MUST handle all 4 states: Loading (Skeleton), Empty State (with minimal Fat Cat mark), Error State (with Retry), and Optimistic UI updates.

## 4. Security, Privacy & Public Repo Guardrails (Zero-Trust)
* **Passwordless Invite-Only Auth (Better Auth + Email OTP + Account Linking):**
  * Support Google OAuth (`openid`, `email`, `profile`, `prompt=select_account`, NEVER store Google OAuth tokens in DB) and 6-digit Email OTP (HMAC-SHA256 hashed in DB, 10-min expiry, max 5 attempts, anti-enumeration pre-gate before sending email).
  * Enforce invite-only sign-up atomically in `better-auth` `databaseHooks.user.create.before` (single SQL `uses_count = uses_count + 1 WHERE ...`), store only `SHA-256` hash of invite codes, pass invites via `#invite=` hash fragment (never `?invite=`), and clear invite cookie after signup.
  * Multi-user isolation: EVERY finance table (`wallets`, `categories`, `transactions`, `recurring_rules`, `push_subscriptions`) MUST scope reads/writes to `session.userId`.
  * Super Admin (`super_admins` table): managed ONLY via SQL Editor (zero API/UI to grant/revoke), verified against DB on every request, and returns `404` for non-Super-Admins.
  * Serverless DB-backed Rate Limiting (`rate_limits` table) with HTTP `429` + `X-Retry-After` and global `OTP_DAILY_CAP` (`503`).
  * Email Transport Layer decoupled (`EMAIL_TRANSPORT=smtp|log`); `log` mode MUST be rejected in production and OTP/emails MUST NEVER be logged in production.
* **Zero-File Storage:** NEVER save uploaded slip images or bank statements to disk, S3, or Vercel Blob. Process in RAM (`Buffer`) and discard immediately.
* **File Validation:** Validate MIME type, file size (strictly under Vercel's 4.5MB limit), and **Magic Bytes** before processing any upload.
* **AI Prompt Injection Defense:** Wrap extracted text/files as untrusted data inside clear delimiters and enforce strict Zod JSON schema output.
* **Public Repo Hygiene (Zero PII & Zero Secrets):** NEVER hardcode API keys, DB URLs, local machine paths, personal emails, real names, real bank/insurance brand details, or production URLs anywhere in code, docs, tests, or seed files. Use `process.env` validated at startup. NEVER write unfixed vulnerability details into tracked files in this public repo.

## 5. Multi-Agent Orchestration & Pre-PR Governance
Follow `TEAM.md` and `.agents/MODEL_ROUTING.md` strictly:
* **Main Window = Lead / Orchestrator Only:** Main communicates with `boss` concisely and candidly in **Thai**, writes Contracts (`docs/contracts/`), delegates implementation and review to native subagents in `.agents/agents/`, re-runs mechanical quality gates independently, and opens PRs. Main MUST NOT write feature code directly (even for small features).
* **Strict Maker ≠ Checker:**
  * `dev-backend` and `dev-frontend` implement code + tests and deliver a real **Handoff Certificate**.
  * `tech-lead` (no file-edit tools) MUST review against the Contract/ADR and return `APPROVE` or `APPROVE WITH NOTES` before `qa-reviewer` and `security-auditor` run. Main archives the approved review report in `docs/reviews/`.
  * `security-auditor` is STRICT read-only and reports findings directly to Main in chat (never writes unfixed vulnerabilities to tracked files).
* **Feature Branch & Git Attribution:** `1 Contract = 1 Feature Branch = 1 PR`. NEVER push or commit directly to `main`. Commits use conventional format with role attribution (`git -c user.name=<role> commit -m "<type>: ..."`) and the repository's configured `@users.noreply.github.com` email.
* **Mandatory `pre-pr-gate` Skill:** Before finalizing any phase or opening a pull request, Main MUST run `.agents/skills/pre-pr-gate/SKILL.md`:
  1. Verify Dev Handoff Certificate and run mechanical checks (`npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`).
  2. Run `tech-lead` review gate, then spawn `qa-reviewer` and `security-auditor` in parallel against the git diff.
  3. Delegate every `CRITICAL`, `HIGH`, and `MEDIUM` finding back to the owning Dev and re-verify (maximum 2–3 retry loops; escalate to `boss` if still blocked).
  4. Have `secretary` sync `docs/team/PROGRESS.md` and daily reports, and verify `git status` is clean of `.env*`, `.pdf`, `.csv`, keys, or temp files.
* **Human Review & Release Gate (`boss` Only):** Only Main pushes feature branches and opens Pull Requests after all gates pass cleanly → then **STOP**. NEVER merge PRs, NEVER create git tags, and NEVER run releases; `boss` performs merges and releases manually.
