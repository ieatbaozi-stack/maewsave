# TEAM.md — คู่มือทีม Multi-Agent (`maewsave` / แมวอ้วนเฮง)

เอกสารฉบับนี้คือ Single Source of Truth สำหรับกระบวนการทำงานของทีมวิศวกรรม Antigravity-Native บนโปรเจกต์ **maewsave (แมวอ้วนเฮง)** โดยใช้หลัก **Scrum-lite Engineering Discipline**:

> **No Contract, No Code · Maker ≠ Checker · Real Command Evidence (Handoff Certificate) · 1 Contract = 1 Branch = 1 PR · Boss Merges & Releases**

---

## 0. Project Metadata

| หัวข้อ | รายละเอียด |
|---|---|
| **Project** | `maewsave` (แมวอ้วนเฮง) — Bilingual (TH/EN) Mobile-First iOS PWA Personal Finance & Smart Recurring Manager |
| **Product Owner / Approver** | `boss` (สื่อสารกับ `boss` เป็น **ภาษาไทย** กระชับ ตรงไปตรงมา) |
| **Repository Visibility** | **Public FinTech Repository** — ห้ามมี Secrets, PII, local paths, อีเมลส่วนตัว, ชื่อจริง, ชื่อแบรนด์ธนาคาร/ประกันจริง หรือ Production URLs ใน repo และ git history |
| **Default Branch** | `main` (ป้องกันด้วย GitHub Branch Ruleset — ห้าม push ตรงเข้า `main`) |
| **Git Commit Email** | ต้องใช้ `@users.noreply.github.com` ที่ตั้งไว้ใน repo เสมอ |
| **Core Tech Stack** | Next.js 16 (App Router) · React 19 · TypeScript (`strict: true`) · Tailwind CSS v4 (Semantic Tokens) · `next-themes` · `next-intl` · Drizzle ORM + Neon Serverless HTTP (`drizzle-orm/neon-http`) · Better Auth (Google OAuth + 6-digit Email OTP + Invite-Only + Super Admin `404`) · Zod · Vitest · Playwright (Phase 4) |
| **Mandatory Quality Gates** | `npm run typecheck` · `npm run lint` · `npm run test` · `npm run build` · *(และ `npx drizzle-kit check` เมื่อแก้ schema/migrations; เพิ่ม `e2e` เมื่อเข้า Phase 4)* |
| **Core Specs (ห้ามเขียนทับโดยไม่ผ่าน Contract)** | `docs/PRD.md` · `docs/ARCHITECTURE.md` · `docs/DESIGN.md` · `docs/ROADMAP.md` |

---

## 1. Team Roster & Gemini 4 Model Routing

> **หลักการเรียกใช้งานแบบ Lean & Productive:** ไม่จำเป็นต้องเรียกครบทุกตัวในทุกรอบ — ให้ **Main** เลือกเรียกเฉพาะบทบาทที่จำเป็นต่อ Contract นั้นๆ (ดูตาราง Dispatch Matrix เพิ่มเติมใน `.agents/MODEL_ROUTING.md`)

| # | บทบาท | ไฟล์นิยาม | Target Gemini 4 & Effort | YAML `model` | `mainAgent` | สิทธิ์เครื่องมือ / การแก้ไฟล์ | ขอบเขตความเป็นเจ้าของไฟล์ (File Ownership) |
|---|---|---|---|---|---|---|---|
| 0 | **Main / Lead (Orchestrator)** | *(Main Window)* | Gemini 4 Neon (`high`–`xhigh`) | *(UI)* | — | **ไม่เขียน feature code เอง** | `docs/contracts/**`, `docs/reviews/**` (archive), `TEAM.md`, `AGENTS.md` |
| 1 | **Backend Dev** *(Core)* | `.agents/agents/dev-backend.md` | Gemini 4 Neon (`high`; `xhigh` งานซับซ้อน) | `inherit` | `false` | แก้โค้ด + รัน test เต็มรูปแบบ | `src/db/**`, `drizzle/**`, `src/domain/**`, `src/services/**`, `src/lib/**`, `src/app/api/**`, `scripts/**` + unit/integration tests |
| 2 | **Frontend Dev** *(Core)* | `.agents/agents/dev-frontend.md` | Gemini 4 Neon (`high`) | `inherit` | `false` | แก้โค้ด + รัน test เต็มรูปแบบ | `src/app/**` (non-API), `src/components/**`, `messages/{th,en}.json`, CSS tokens + UI tests |
| 3 | **Tech Lead** *(Core Gate)* | `.agents/agents/tech-lead.md` | Gemini 4 Carbon (`medium`–`high`) | `pro` | `true` | **ห้ามมีเครื่องมือแก้ไฟล์** (read + search + รันคำสั่งตรวจเท่านั้น) | รีวิว diff เทียบ Contract/ADR ส่ง Review Report (`APPROVE` / `APPROVE WITH NOTES` / `REQUEST CHANGES`) ให้ Main เก็บใน `docs/reviews/` |
| 4 | **QA & E2E** *(Core Gate)* | `.agents/agents/qa-reviewer.md` | Gemini 4 Hydrogen (`high`; `medium` PR เล็ก) | `flash` | `false` | อ่าน + รัน test + browser/E2E + แก้บั๊กเล็กที่ชัดเจน (`qa:`) | `tests/e2e/**`, `docs/reports/qa-*.md` (+ small clear bug/a11y fixes เฉพาะที่ชัดเจน) |
| 5 | **Security Auditor** *(Core on sensitive PRs)* | `.agents/agents/security-auditor.md` | Gemini 4 Carbon (`medium` ปกติ; `high` critical/pen-test) | `pro` | `true` | **STRICT Read-Only** (`view_file`, `grep_search`, `find_by_name`, `list_dir`) | ตรวจ AppSec แบบ read-only และรายงานผลตรงให้ Main ในแชตเท่านั้น *(ห้ามเขียนช่องโหว่ที่ยังไม่แก้ลงไฟล์ที่ track บน public repo)* |
| 6 | **Secretary** *(Support)* | `.agents/agents/secretary.md` | Gemini 4 Hydrogen (`medium`) | `flash` | `false` | แก้เอกสารเท่านั้น (`*.md`, `docs/**`) + รัน git/test แบบ read-only | `docs/team/PROGRESS.md`, `docs/reports/YYYY-MM-DD.md`, doc-sync audit |
| 7 | **Architect** *(Specialist)* | `.agents/agents/architect.md` | Gemini 4 Carbon (`medium`) | `pro` | `false` | เอกสาร + ค้นคว้าเว็บเท่านั้น (ห้ามแก้ app code) | `docs/adr/**`, `docs/research/**`, `docs/ARCHITECTURE.md` |
| 8 | **Ops & Release** *(Specialist)* | `.agents/agents/ops-release.md` | Gemini 4 Hydrogen (`high`) | `flash` | `false` | CI/config/docs *(ห้าม merge, tag, หรือ release เอง)* | `.github/**`, `next.config.ts`, `.env.example`, `vercel.json`, `CHANGELOG.md`, `docs/OPERATIONS.md` |

---

## 2. กฎเหล็กของทีม (Iron Rules)

1. **No Contract, No Code:** ทุก feature หรือ phase round ต้องเริ่มจาก `docs/contracts/<round>_CONTRACT.md` ที่ผ่านการ `Approve` จาก `boss` แล้วเท่านั้น *(ยกเว้นงานแก้ typo หรือปรับเอกสารเล็กน้อยที่ไม่มีผลต่อ behavior)*
2. **Strict File Ownership:** แต่ละ agent แก้เฉพาะไฟล์ในขอบเขตบทบาทของตนและที่ระบุใน Contract ห้ามแอบแก้ไฟล์ข้ามโดเมน หากจำเป็นต้องแก้ข้ามขอบเขตให้ escalate กลับที่ Main เพื่อมอบหมายเจ้าของไฟล์
3. **Tests Ship With Code:**
   * ฟังก์ชันใน `src/domain/` ต้องเป็น Pure TypeScript 100% (ไร้ side-effect) และมี Vitest unit tests ครอบคลุม 100% รวมถึง edge cases
   * จำนวนเงินทุกจุดต้องเป็น `BIGINT` / integer หน่วย **สตางค์ (satang)** เท่านั้น — ห้ามใช้ floating-point math กับเงิน
   * TypeScript `strict: true` — ห้ามใช้ `any`, `@ts-ignore`, `@ts-expect-error`
   * ฐานข้อมูลใช้ `drizzle-orm/neon-http` (stateless HTTP) — ห้ามใช้ interactive `db.transaction()` ให้ใช้ single-statement atomic SQL หรือ `db.batch([...])`
   * ห้ามติดตั้ง npm package ใหม่โดยไม่ได้ชี้แจงเหตุผลและได้รับอนุมัติจาก `boss` ก่อน
4. **Mandatory Handoff Certificate:** Dev ทุกคนต้องรันคำสั่งตรวจสอบจริงและแนบผลลัพธ์จริงลงใน Handoff Certificate ก่อนส่งต่องาน — ห้ามเดา ห้ามข้าม และห้ามสร้างผลลัพธ์ปลอม
5. **Maker ≠ Checker:** `tech-lead` ต้องส่งผล `APPROVE` หรือ `APPROVE WITH NOTES` ก่อนจึงจะส่งต่อไปยัง `qa-reviewer` และ `security-auditor` ได้ ทั้ง `tech-lead` และ `security-auditor` ห้ามแก้ไข feature code เองเด็ดขาด
6. **Feedback Loop Cap:** หากวนแก้ปัญหาเดิมเกิน **2–3 รอบ** แล้วยังไม่ผ่าน ให้ Main หยุดทันทีแล้ว escalate ให้ `boss` ตัดสินใจ (เช่น อัปเกรด effort ของ Dev เป็น `xhigh` หรือทบทวน Contract ใหม่)
7. **Zero-Trust FinTech & Public Repo Hygiene:**
   * **Passwordless Invite-Only Auth (Better Auth):** รองรับ Google OAuth (`openid`, `email`, `profile`, `prompt=select_account`, ห้ามเก็บ OAuth tokens ใน DB) + Email 6-digit OTP (HMAC-SHA256 hash, TTL 10 นาที, ผิดได้สูงสุด 5 ครั้ง, anti-enumeration pre-gate ก่อนส่งเมล) + Bidirectional Account Linking (`Google ↔ OTP` ใช้ `user.id` เดียวกัน)
   * **Invite-Only Atomic Gate & Super Admin `404`:** โค้ดเชิญเก็บเฉพาะ `SHA-256` hash ส่งผ่าน `#invite=` hash fragment (ห้าม `?invite=`) และตัดสิทธิ์แบบ atomic ใน `databaseHooks.user.create.before`; สิทธิ์ `super_admins` จัดการผ่าน SQL Editor เท่านั้น และ `/admin/*` + `/api/admin/*` ต้องคืน `404` สำหรับผู้ที่ไม่ใช่ Super Admin
   * **Multi-User Isolation & DB Rate Limiting:** ทุกตารางการเงิน (`wallets`, `categories`, `transactions`, `recurring_rules`, `push_subscriptions`) ต้อง scope ด้วย `session.userId`; Rate limit ทั้งหมดต้องเก็บใน PostgreSQL (`rate_limits`) ตอบ `429` + `X-Retry-After` และ `OTP_DAILY_CAP` ตอบ `503`; `EMAIL_TRANSPORT=log` ต้องถูกปฏิเสธใน production
   * **Zero-File Storage & AI Safety:** ห้ามบันทึกไฟล์สลิป/Statement ลง disk, S3 หรือ Vercel Blob — ประมวลผลใน RAM (`Buffer`) แล้วทิ้งทันที พร้อมตรวจ MIME, ขนาด (`< 4.5MB`), และ Magic Bytes; ห่อ untrusted text/file ใน delimiter และ validate ผลลัพธ์ AI ด้วย Zod
   * **Public Repo Hygiene:** ห้าม commit secrets, API keys, DB URLs, local machine paths, อีเมลส่วนตัว, ชื่อจริง, ชื่อแบรนด์ธนาคาร/ประกันจริง หรือ production URLs และ **`security-auditor` ห้ามเขียนรายละเอียดช่องโหว่ที่ยังไม่ได้รับการแก้ไขลงไฟล์ที่ track บน repo**
8. **Anti-AI Slop iOS PWA:** ใช้เฉพาะ semantic CSS tokens จาก `docs/DESIGN.md` (ห้าม raw Tailwind palette colors), พื้นผิวทึบ (solid opaque), ระยะห่าง 4px/8px grid, `tabular-nums` ทุกตัวเลขเงิน/วันที่/เปอร์เซ็นต์, `font-size >= 16px` (`text-base`) สำหรับทุก `<input>`/`<textarea>`/`<select>`, รองรับ `env(safe-area-inset-top/bottom)`, พื้นที่กดขั้นต่ำ `44px x 44px`, ใช้ swipe-to-dismiss Bottom Sheet บนมือถือ, ครบ 4 สถานะ (Loading/Empty/Error/Optimistic) และห้าม hardcode UI strings (ต้องอยู่ในทั้ง `messages/th.json` และ `messages/en.json` ครบคู่)
9. **Git & PR Discipline:** `1 Contract = 1 Feature Branch = 1 PR`; commit ด้วย Conventional Commits พร้อมระบุชื่อบทบาท (`git -c user.name=<role> commit -m "<type>: ..."` โดยใช้ `@users.noreply.github.com` ของ repo); มีเพียง **Main** เท่านั้นที่ push branch และเปิด PR พร้อมสรุปครบถ้วนแล้ว **STOP** เพื่อให้ `boss` เป็นผู้ review, merge และ release/tag เอง
10. **Main Orchestrator Rule:** Main **ห้ามเขียน feature code เอง** (แม้เป็นงานเล็ก) หน้าที่ของ Main คือสื่อสารกับ `boss`, เขียน Contract, มอบหมาย subagents, รัน quality gates ซ้ำด้วยตนเอง, และเปิด PR
11. **Docs Sync:** เอกสารที่เกี่ยวข้อง (`docs/team/PROGRESS.md`, `docs/ROADMAP.md`, `CHANGELOG.md`, `README.md` เมื่อมีการเปลี่ยนแปลงที่เกี่ยวข้อง) ต้องอัปเดตให้ตรงกันใน PR เดียวกัน

---

## 3. Workflow Diagram & Handoff Table

```text
boss
  │ (ให้โจทย์ / เป้าหมายรอบงาน)
  ▼
Main (เขียน docs/contracts/<round>_CONTRACT.md)
  │
  ▼
boss ──[Approve]──► Main มอบหมาย Dev (dev-backend / dev-frontend)
                        │ (เขียนโค้ด + เทสต์ + Handoff Certificate)
                        ▼
                    Tech Lead (Code Review vs Contract/ADR — No Edit Tools)
                        │ [REQUEST CHANGES] ──► กลับไปที่ Dev (สูงสุด 2–3 รอบ)
                        │ [APPROVE / APPROVE WITH NOTES]
                        ▼
                    Main Archive Review ลง docs/reviews/
                        │
                        ├──► QA & E2E (qa-reviewer) ────────┐
                        │                                    ├──► (รันขนานกัน)
                        └──► Security Auditor (read-only) ──┘
                                │ [มี CRITICAL/HIGH/MEDIUM] ──► Dev แก้ + ตรวจซ้ำ
                                │ [PASS]
                                ▼
                            Secretary (อัปเดต PROGRESS.md + Daily Report)
                                │
                                ▼
                            Main (รัน Gates ซ้ำเอง + ตรวจ git status + เปิด PR → STOP)
                                │
                                ▼
                            boss (Review & Merge PR / Manual Release)
```

| ขั้นตอน | ผู้ส่ง (From) | ผู้รับ (To) | สิ่งส่งมอบ (Artifact / Evidence) | เงื่อนไขผ่านด่าน (Gate Condition) |
|---|---|---|---|---|
| 1. Scope | `boss` | Main | ความต้องการ / Phase เป้าหมาย | ระบุขอบเขตชัดและตรวจความจำเป็นของ package ใหม่ (ถ้ามี) |
| 2. Contract | Main | `boss` | `docs/contracts/<round>_CONTRACT.md` | `boss` ตอบ `Approve` อย่างชัดเจน |
| 3. Build | `dev-backend` / `dev-frontend` | Main → `tech-lead` | Commits บน feature branch + **Handoff Certificate** | ผลรันคำสั่งจริงผ่านทุก gate ในขอบเขตงาน |
| 4. Code Review | `tech-lead` | Main | Review Report (`APPROVE` / `APPROVE WITH NOTES` / `REQUEST CHANGES`) | ต้องได้ `APPROVE` หรือ `APPROVE WITH NOTES` (Main archive ลง `docs/reviews/`) |
| 5. Quality & Security | `qa-reviewer` ∥ `security-auditor` | Main | QA Report (`docs/reports/qa-*.md`) + Security Report (ในแชตเท่านั้น) | Zero `CRITICAL` / `HIGH` / `MEDIUM` findings |
| 6. Doc Sync | `secretary` | Main | อัปเดต `docs/team/PROGRESS.md` + `docs/reports/YYYY-MM-DD.md` | สถานะตรงกับ git history และ Contract จริง |
| 7. PR Handoff | Main | `boss` | Pull Request พร้อมตารางผลรันจริงทุก Gate | CI ผ่านเขียวทุก check, working tree สะอาด → **STOP** |

---

## 4. Handoff Certificate Template

Dev ทุกคนต้องแนบ Certificate นี้ทุกครั้งเมื่อส่งงานคืนให้ Main:

```markdown
## Handoff Certificate
- **Role:** `dev-backend` | `dev-frontend` | `ops-release`
- **Contract:** `docs/contracts/<round>_CONTRACT.md`
- **Branch / Commit:** `<branch-name>` @ `<short-sha>`

### 1. Contract Acceptance Criteria
| # | Acceptance Criterion | Status | Evidence (File / Test / Route) |
|---|---|---|---|
| AC-1 | ... | PASS | `src/...` + `...test.ts` |

### 2. Real Verification Command Outputs
- `npm run typecheck`: PASS (0 errors)
- `npm run lint`: PASS (0 errors, 0 warnings)
- `npm run test`: PASS (<X> files, <Y> tests passed)
- `npm run build`: PASS
- `npx drizzle-kit check`: PASS / N/A

### 3. Role Checklist
- [ ] Strict TypeScript (zero `any`, `@ts-ignore`, `@ts-expect-error`)
- [ ] Money in `BIGINT`/integer satang only (zero floats)
- [ ] Zero-Trust `session.userId` scoping + Zod validation (Backend) / Semantic tokens + TH/EN i18n parity + iOS PWA rules (Frontend)
- [ ] Zero PII, secrets, local paths, or unapproved npm dependencies

### 4. Changed Files Scope Check
- All modified/created files are strictly inside assigned role ownership and Contract scope: `YES`
- Files list: `<compact list>`

### 5. Known Risks / Follow-ups
- None / `<explicit concise list>`

### 6. Attestation
> Signed by `<role>`: All commands above were executed against the current commit and outputs are genuine.
```

---

## 5. Definition of Done (DoD) Gate Table & Main Pre-PR Checklist

### DoD Gate Table
| Gate | ผู้รับผิดชอบ | เกณฑ์ผ่าน |
|---|---|---|
| **Contract Alignment** | `tech-lead` | ตรงตาม Contract 100%, แยกเลเยอร์สะอาด (`components`/`domain`/`services`/`db`), ไม่มี scope creep |
| **Typecheck & Lint** | Dev + Main | `npm run typecheck` และ `npm run lint` ผ่าน 0 errors, 0 warnings |
| **Tests & Coverage** | Dev + `qa-reviewer` + Main | `npm run test` ผ่าน 100%, `src/domain/` ครอบคลุม edge cases ครบ |
| **Production Build** | Dev + Main | `npm run build` ผ่านโดยไม่ต้องพึ่ง runtime secrets |
| **UI / i18n / iOS PWA** | `qa-reviewer` | ตรง `docs/DESIGN.md`, `messages/{th,en}.json` key parity 100%, ครบ 4 UI states, inputs `>= 16px`, tap `>= 44px` |
| **AppSec & Public Repo** | `security-auditor` | Zero `CRITICAL`/`HIGH`/`MEDIUM`, Zero PII/Secrets/local paths, Auth/Tenant/Rate-Limit/Headers ครบ |
| **Docs & Progress Sync** | `secretary` | `docs/team/PROGRESS.md` และรายงานรอบงานอัปเดตตรงความจริง |

### Main Pre-PR Checklist
- [ ] อยู่บน feature/chore branch (ไม่ใช่ `main`) และ rebase/sync ล่าสุดสะอาด
- [ ] มี Handoff Certificate ของ Dev ครบถ้วน
- [ ] `tech-lead` ให้ผล `APPROVE` / `APPROVE WITH NOTES` และ archive ลง `docs/reviews/` แล้ว
- [ ] `qa-reviewer` และ `security-auditor` ผ่าน (0 `CRITICAL`/`HIGH`/`MEDIUM`) และไม่มีรายละเอียดช่องโหว่ที่ยังไม่แก้หลุดลงไฟล์ใน repo
- [ ] Main รัน `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build` ซ้ำด้วยตนเองแล้วผ่านจริง
- [ ] `git status --short` สะอาด ไม่มี `.env*`, `.pdf`, `.csv`, `*.key`, `*.pem`, `tmp/`, `uploads/`
- [ ] เปิด PR พร้อมสรุปผลตรวจทุก Gate → รอ CI เขียว → **STOP** ส่งให้ `boss` รีวิวและ Merge

---

## 6. Git Conventions & SemVer

* **Branch Naming:**
  * Feature / Phase: `feat/<short-kebab-name>` (เช่น `feat/phase-2-recurring`)
  * Bugfix: `fix/<short-kebab-name>`
  * Docs / Governance / Chore: `chore/<short-kebab-name>` หรือ `docs/<short-kebab-name>`
* **Commit Format (Conventional Commits + Role Attribution):**
  * ใช้รูปแบบ `git -c user.name=<role> commit -m "<type>(<scope>): <summary>"` (โดยยังคง email เป็น `@users.noreply.github.com`)
  * ประเภทมาตรฐาน: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`, `ci:`, `qa:` (เฉพาะบั๊กเล็กที่ `qa-reviewer` แก้)
* **Versioning (SemVer):**
  * เริ่มนับจาก `v0.1.0` (`MAJOR.MINOR.PATCH`)
  * ชื่อรอบงาน/เฟส เช่น `P1`, `P2`, `R1` เป็นชื่อ Contract/Round **ไม่ใช่** เลข SemVer
  * PR ที่แก้เฉพาะเอกสาร (`docs/`, `TEAM.md`, `.agents/`) ไม่ต้องออก release หรือ bump version
  * การสร้าง Git Tag และ Release เป็นสิทธิ์ของ **`boss` เท่านั้น**
