---
name: pre-pr-gate
description: "Mandatory pre-PR quality, Tech Lead, QA, and Security verification loop aligned with TEAM.md. Run before finalizing any phase or opening a pull request."
---

# Pre-PR Quality, Tech Lead, QA & Security Gate

Run this full verification loop before finalizing any phase, marking a contract complete, or opening a pull request. Align strictly with `TEAM.md` and `.agents/MODEL_ROUTING.md`.

## Procedure

### Step 1: Dev Handoff Certificate & Mechanical Verification
Confirm every participating Dev (`dev-backend`, `dev-frontend`, `ops-release`) delivered a complete **Handoff Certificate** with real outputs, then run all mechanical checks independently as Main:
1. `npm run typecheck`
2. `npm run lint`
3. `npm run test`
4. `npm run build` (confirm production build succeeds without runtime secrets)
5. `npx drizzle-kit check` (mandatory whenever `src/db/**` or `drizzle/**` changed)

If any command fails, delegate the fix to the owning Dev role and re-run until all mechanical checks pass with zero errors.

### Step 2: Tech Lead Gate (Maker ≠ Checker)
Spawn `tech-lead` (`.agents/agents/tech-lead.md`) against the current branch diff and active `docs/contracts/<round>_CONTRACT.md`:
- `tech-lead` has **no file-edit tools** and must return a structured Review Report with verdict: `APPROVE`, `APPROVE WITH NOTES`, or `REQUEST CHANGES`.
- If `REQUEST CHANGES`: delegate fixes to the owning Dev, re-run Step 1, and re-submit to `tech-lead`.
- Once `APPROVE` or `APPROVE WITH NOTES`: Main archives the approved report to `docs/reviews/<round>-review.md` before proceeding to Step 3.

### Step 3: Parallel QA & Security Audits
Spawn both checkers **in parallel** with fresh context against the current git diff / changed files (skip `security-auditor` only on pure docs/copy PRs per `.agents/MODEL_ROUTING.md`):
1. `qa-reviewer` (`.agents/agents/qa-reviewer.md`) — verifies Contract acceptance criteria, `docs/PRD.md`, `docs/DESIGN.md`, `docs/ROADMAP.md`, TH/EN i18n parity, iOS PWA compliance, E2E/unit test quality, and writes `docs/reports/qa-<round>.md`.
2. `security-auditor` (`.agents/agents/security-auditor.md`) — **STRICT read-only** audit verifying Invite-Only Passwordless Auth (Google OAuth + 6-digit Email OTP + Account Linking), Super Admin `404` isolation, multi-user `user_id` isolation, DB-backed rate limiting, Zod validation, Security Headers, Zero-File Storage / Magic Bytes, AI Prompt Injection defense, and Zero PII/Secrets for a public repo. Reports findings **directly to Main in chat** (NEVER writes unfixed vulnerability details to tracked files).

### Step 4: Automated Fix & Retry Loop (Max 2–3 Iterations)
- If `tech-lead`, `qa-reviewer`, or `security-auditor` reports any `CRITICAL`, `HIGH`, or `MEDIUM` finding:
  1. Delegate every finding to the owning Dev (`dev-backend` or `dev-frontend`) to fix cleanly without regressions.
  2. Re-run Step 1 (`typecheck`, `lint`, `test`, `build`).
  3. Re-run the failing checker(s) to confirm every finding is resolved (`PASS`).
- Maximum **3 iterations** (consider bumping Dev effort to `xhigh` after Loop 2). If any `CRITICAL`, `HIGH`, or `MEDIUM` finding remains unresolved after 3 iterations, **STOP** and escalate clearly to `boss` in Thai with root cause and options.

### Step 5: Secretary Doc-Sync & Git Hygiene Check
1. Spawn `secretary` (`.agents/agents/secretary.md`) to update `docs/team/PROGRESS.md` and `docs/reports/YYYY-MM-DD.md` and verify doc-sync.
2. Run `git status --short` and verify:
   - On a feature/chore branch (NEVER `main`).
   - Zero `.env`, `.env.local`, or `.env.*` files (except `.env.example`).
   - Zero `.pdf`, `.csv`, key/cert files (`*.pem`, `*.key`), `tmp/`, `uploads/`, or temporary debug artifacts.
   - Zero leaked secrets, personal emails, local machine paths, or unfixed vulnerability disclosures in tracked files.
   - Protected specs (`docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN.md`, `docs/ROADMAP.md`) and brand assets remain intact unless explicitly included in the approved Contract.

### Step 6: Main Independent Gate Re-Run & PR Handoff
1. If any files changed after Step 1 (including fixes or docs), re-run `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build` cleanly.
2. Push the feature branch and open the Pull Request with a concise **Final Review Summary**:
   - **Verification Status Table:** `Typecheck`, `Lint`, `Unit Tests`, `Production Build`, `Tech Lead`, `QA Reviewer`, `Security Auditor` (with exact real counts/verdicts).
   - **Changed Files List:** Grouped by responsibility.
   - **Manual Verification Steps:** Any required human steps for `boss`.
3. **STOP.** Never merge the PR, never tag, and never run releases — hand over to `boss` for final review and merge.
