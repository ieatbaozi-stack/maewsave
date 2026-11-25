# Contract: `<ROUND_ID>` — `<Short Title>`

- **Status:** `DRAFT` | `APPROVED` | `COMPLETED`
- **Roadmap Alignment:** `docs/ROADMAP.md` — Phase `<N>`
- **Branch:** `feat/<short-kebab-name>`
- **Owner (Orchestrator):** Main
- **Assigned Roles:** *(select only roles needed per `.agents/MODEL_ROUTING.md`)*
  - [ ] `architect`
  - [ ] `dev-backend`
  - [ ] `dev-frontend`
  - [ ] `ops-release`
  - [ ] `tech-lead` *(Mandatory Code Review Gate)*
  - [ ] `qa-reviewer`
  - [ ] `security-auditor`
  - [ ] `secretary`

---

## 1. Goal & Scope
**Goal:** `<1-2 concise sentences describing user-visible outcome>`

### In Scope
- ...

### Out of Scope (Explicit Non-Goals)
- ...

---

## 2. Dependency Approval Check
- **New npm packages required?** `No` | `Yes`
- *(If Yes, list exact package name, purpose, license/security note — MUST receive explicit `boss` approval before `npm install`.)*

---

## 3. File Ownership & Implementation Plan
| Role | Target Files / Modules | Summary of Work |
|---|---|---|
| `dev-backend` | `src/domain/...`, `src/services/...`, `src/app/api/...` | ... |
| `dev-frontend` | `src/components/...`, `src/app/...`, `messages/{th,en}.json` | ... |
| `ops-release` | `vercel.json`, `.env.example`, ... *(if needed)* | ... |

---

## 4. Acceptance Criteria (Testable)
| ID | Acceptance Criterion | Verification Method |
|---|---|---|
| AC-1 | ... | Vitest unit/service test / API test / UI check |
| AC-2 | ... | ... |

---

## 5. Non-Negotiable Compliance Checklist
- [ ] Money stored & calculated strictly as `BIGINT` / integer satang (zero floats)
- [ ] `src/domain/` pure TypeScript with 100% unit test coverage
- [ ] Neon HTTP driver compatible (no interactive `db.transaction()`)
- [ ] Zero-Trust `session.userId` scoping, Origin CSRF, DB rate limiting, Zod validation
- [ ] Zero-File Storage (RAM `Buffer` + Magic Bytes + `< 4.5MB`) & AI Prompt Injection defense *(if applicable)*
- [ ] `docs/DESIGN.md` semantic tokens only, 4px/8px grid, `tabular-nums`, `>= 16px` inputs, `>= 44px` tap targets, Bottom Sheets on mobile, all 4 UI states
- [ ] TH/EN `messages/{th,en}.json` 100% key parity (zero hardcoded UI strings)
- [ ] Public Repo Hygiene: zero PII, secrets, local paths, real names, or real bank/insurance brand names

---

## 6. Gate Plan & Sign-Off
1. `boss` approves this Contract (`No Contract, No Code`).
2. Dev(s) implement + commit on feature branch + return **Handoff Certificate**.
3. `tech-lead` returns `APPROVE` / `APPROVE WITH NOTES` (archived to `docs/reviews/<round>-review.md`).
4. `qa-reviewer` ∥ `security-auditor` pass with 0 `CRITICAL`/`HIGH`/`MEDIUM`.
5. `secretary` updates `docs/team/PROGRESS.md` and `docs/reports/YYYY-MM-DD.md`.
6. Main re-runs all mechanical gates independently, opens PR, waits for green CI → **STOP** for `boss` merge.
