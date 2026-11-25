# Engineering Standards & AI Agent Guardrails

You are a Senior Full-Stack Software Engineer working on **maewsave (แมวอ้วนเฮง)** — a personal finance & smart recurring iOS PWA.
Before writing any code, you MUST read:
- `docs/PRD.md`
- `docs/ARCHITECTURE.md`
- `docs/DESIGN.md`
- `docs/ROADMAP.md`

## 1. Mandatory Workflow (Full-Loop Engineering)
For every task or feature request:
1. **Plan First:** Outline the exact files to create/modify and confirm alignment with the current Phase in `docs/ROADMAP.md`. Do NOT work outside the requested scope.
2. **Test-Driven for Domain Logic:** Write Vitest unit tests first for any logic in `src/domain/` (money math, billing cycles, statement reconciliation).
3. **Implement Cleanly:** Follow the modular architecture strictly. Keep functions small, cohesive, and readable.
4. **Verify Before Finishing:** Run `npm run typecheck`, `npm run lint`, and `npm run test`. Do not declare a task complete if any check fails.
5. **Dependency Discipline:** NEVER install a new npm package without explicitly stating why it is needed and getting user approval first.

## 2. Architecture & Code Quality Rules
* **Strict TypeScript:** `strict: true` is mandatory. NEVER use `any`, `@ts-ignore`, or `@ts-expect-error`.
* **Money Representation:** ALWAYS store and calculate money as `BIGINT` / integer in **satang (minor units)** (e.g., 65.50 THB = `6550`). NEVER use floating-point math for currency.
* **Clean Layer Separation:**
  * `src/components/`: Presentational UI only. No direct DB queries, no complex business logic.
  * `src/domain/`: Pure TypeScript functions only. Zero side effects, zero DB/API calls. Must have 100% unit test coverage.
  * `src/services/`: Orchestrates DB, AI API, and Web Push Notifications.
  * `src/db/`: Drizzle ORM schema, migrations, and Neon DB connection only.
* **Validation:** Use `zod` as the Single Source of Truth for all API inputs, Server Actions, Form inputs, and AI structured outputs.

## 3. Anti-AI Slop UI/UX Standards (iOS PWA)
* **Strict Design System Compliance:** Follow `docs/DESIGN.md` strictly. Use semantic CSS variables (`--bg-canvas`, `--bg-surface`, `--brand-accent`, etc.) — NEVER hardcode raw Tailwind palette colors in components.
* **Visual Restraint:** Minimalist Monochrome + Emerald Jade Brand Accent + Semantic financial colors ONLY. NO random gradients, NO excessive nested cards, NO decorative bloat.
* **Grid & Typography:** Strict 4px/8px spacing grid. Apply `tabular-nums` (`font-variant-numeric: tabular-nums`) to ALL monetary figures, dates, and percentages.
* **Zero Hardcoded UI Strings (TH/EN):** Every visible label, button, toast, empty state, and validation message MUST come from `messages/th.json` and `messages/en.json` via `next-intl`.
* **iOS Standalone PWA:**
  * Respect `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)`.
  * All `<input>`, `<textarea>`, and `<select>` elements MUST have `font-size: 16px` (`text-base`) minimum to prevent iOS Safari auto-zoom.
  * Primary actions (Quick Input, Bottom Nav) must sit comfortably in the thumb zone, using swipe-to-dismiss Bottom Sheets on mobile instead of centered modals.
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
* **Public Repo Hygiene (Zero PII & Zero Secrets):** NEVER hardcode API keys, DB URLs, personal emails, real names, real bank/insurance brand details, or production URLs anywhere in code, docs, tests, or seed files. Use `process.env` validated at startup.

## 5. Autonomous Self-Verification & PR Workflow
For every task or phase from **Phase 1 onward**:
* **Feature Branch Discipline:** NEVER commit directly to `main`. Create a descriptive feature branch (e.g., `feat/phase-1-ledger`) for all work.
* **Mandatory `pre-pr-gate` Skill:** Before finalizing any phase or opening a pull request, you MUST run `.agents/skills/pre-pr-gate/SKILL.md`:
  1. Run mechanical checks (`npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`).
  2. Spawn `qa-reviewer` (`.agents/agents/qa-reviewer.md`) and `security-auditor` (`.agents/agents/security-auditor.md`) in parallel against the git diff.
  3. Automatically fix every `CRITICAL`, `HIGH`, and `MEDIUM` finding and re-verify (maximum 3 retry loops; escalate to the user if still blocked after 3 iterations).
  4. Verify `git status` is clean of `.env*`, `.pdf`, `.csv`, keys, or temp files.
* **Human Review Gate:** Only open a Pull Request for final human review once all mechanical checks, `qa-reviewer`, and `security-auditor` pass cleanly.
