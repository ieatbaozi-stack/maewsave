---
name: pre-pr-gate
description: "Mandatory pre-PR quality, QA, and security verification loop. Run before finalizing any phase or opening a pull request."
---

# Pre-PR Quality, QA & Security Gate

Run this full verification loop before finalizing any phase, marking a feature complete, or opening a pull request.

## Procedure

### Step 1: Mechanical Verification
Run all automated project checks:
1. `npm run typecheck`
2. `npm run lint`
3. `npm run test`
4. `npm run build` (confirm production build succeeds without runtime secrets)

If any command fails, fix the root cause and re-run until all mechanical checks pass with zero errors.

### Step 2: Parallel Independent Subagent Audits
Spawn both read-only subagents **in parallel** with fresh context against the current git diff / changed files:
1. `qa-reviewer` (`.agents/agents/qa-reviewer.md`) — verifies PRD, DESIGN.md, ROADMAP.md, i18n, iOS PWA compliance, and unit test quality.
2. `security-auditor` (`.agents/agents/security-auditor.md`) — verifies single-user auth lock, Zero-Trust guards, Zod validation, Security Headers, Zero-File Storage, and Zero PII/Secrets.

### Step 3: Automated Fix & Retry Loop (Max 3 Iterations)
- If either subagent reports any `CRITICAL`, `HIGH`, or `MEDIUM` finding:
  1. Fix every reported finding cleanly without introducing regressions.
  2. Re-run Step 1 (`typecheck`, `lint`, `test`, `build`).
  3. Re-run the failing subagent(s) to confirm every finding is resolved (`PASS`).
- Maximum **3 iterations**. If any `CRITICAL`, `HIGH`, or `MEDIUM` finding remains unresolved after 3 iterations, **STOP** and escalate clearly to the user with the full findings and blockers.

### Step 4: Git Hygiene & Secret Leak Check
Run `git status --short` and verify:
- Zero `.env`, `.env.local`, or `.env.*` files (except `.env.example`).
- Zero `.pdf`, `.csv`, key/cert files (`*.pem`, `*.key`), `tmp/`, `uploads/`, or temporary debug artifacts.
- Protected documentation and brand assets remain intact.

### Step 5: Final Review Summary
Present a clean **Final Review Summary** containing:
1. **Verification Status Table:** `Typecheck`, `Lint`, `Unit Tests`, `Production Build`, `QA Reviewer`, `Security Auditor` (with exact results and pass counts).
2. **Changed Files List:** Grouped by responsibility.
3. **Manual Verification Steps:** Any required human steps (e.g., GitHub Actions, Branch Ruleset, `.env.local` / Vercel env vars, iPhone PWA testing).
