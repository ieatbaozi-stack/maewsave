# Project Progress (`docs/team/PROGRESS.md`)

> อัปเดตล่าสุดอิงจาก `git log` บน branch `main` ณ commit `c94264f`

## 1. สถานะภาพรวมตาม Roadmap (`docs/ROADMAP.md`)

| Phase | เป้าหมาย | สถานะโค้ด | PR / Commit | หมายเหตุ |
|---|---|---|---|---|
| **Phase 0** | Foundation, Passwordless Invite-Only Auth, Design Tokens, iOS PWA Shell, CI/CD | **Code Merged** *(รอ External Env Setup)* | PR #4 (`f366bdd`) | โค้ดครบ + CI/CodeQL/Gitleaks/Branch Ruleset เขียว + Dependabot 0 open; รอผู้ใช้ตั้งค่า Neon, Gmail SMTP App Password, Google OAuth, Vercel และรัน `npm run db:migrate` + `npm run invite` |
| **Phase 1** | Core Ledger & Virtual Wallets (Tab 1 - Basic) | **Merged** | PR #5 (`c94264f`) | Domain math (`money.ts`, `billing-cycle.ts`, `ledger-optimistic.ts`), CRUD APIs + DB rate limits, Settings UI, Tab 1 Mini Summary + Bottom Sheet + Optimistic UI, 27 test files / 138 tests ผ่านครบ |
| **Phase 2** | Smart Reminder & Recurring (Tab 2) | **Not Started** | — | รอบถัดไป: `recurring_rules` CRUD (`MONTHLY`/`YEARLY`, `AUTO_CHARGE`/`MANUAL_PAY`, non-retroactive price updates), `/api/cron/recurring`, iOS Web Push (`push_subscriptions`), `[Mark as Paid]` *(ต้องขออนุมัติ `boss` ก่อนติดตั้ง `web-push` หรือ package ใหม่)* |
| **Phase 3** | AI Quick Input & Statement Reconciliation | **Not Started** | — | Gemini Structured Output + RAM-only slip/PDF/CSV + Magic Bytes + `src/domain/reconciliation.ts` |
| **Phase 4** | Hardening, Passkey, E2E & Pen-Test | **Not Started** | — | Passkey (Face ID), Playwright iPhone Viewport E2E, DAST & Manual Pen-Test |

---

## 2. Verification Baseline ล่าสุดบน `main` (`c94264f`)
- `npm run typecheck`: PASS (0 errors)
- `npm run lint`: PASS (0 errors, 0 warnings)
- `npm run test`: PASS (27 test files, 138 tests)
- `npm run build`: PASS (Next.js 16 Turbopack clean build without runtime secrets)
- `npx drizzle-kit check`: PASS
- `npm audit`: 0 vulnerabilities (Dependabot open alerts: 0)
- GitHub Security: Branch Ruleset `Protect main` Active · Secret Scanning + Push Protection ON · CodeQL ON

---

## 3. สิ่งที่รอฝั่งผู้ใช้ (External Manual Setup — ยังไม่ต้องทำก่อนเริ่ม Phase 2)
1. ตั้งค่า Neon PostgreSQL (`DATABASE_URL`), Gmail App Password (`SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`), Google Cloud OAuth (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`), และ Vercel env vars
2. รัน `npm run db:migrate` และ `npm run invite -- --days 7 --max-uses 1 --note "Founder"`
3. เพิ่ม `user_id` ของบัญชีผู้ก่อตั้งลงตาราง `super_admins` ผ่าน Neon SQL Editor หลังล็อกอินครั้งแรก

---

## 4. Next Step
- **Governance Setup:** รวม PR Setup ทีม Antigravity-Native (`TEAM.md`, `.agents/`, `docs/` governance)
- **Next Feature Contract:** เมื่อพร้อมเริ่มพัฒนาต่อ ให้ Main ร่าง `docs/contracts/P2_CONTRACT.md` (Phase 2: Smart Reminder & Recurring) พร้อมขออนุมัติ npm package (ถ้าจำเป็น) และส่งให้ `boss` พิจารณา `Approve` ก่อนเริ่มเขียนโค้ด
