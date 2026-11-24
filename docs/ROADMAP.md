# Development Roadmap (Full-Loop Phased Execution)
**Project:** maewsave (แมวอ้วนเฮง)

แบ่งการพัฒนาเป็น 5 เฟส (Phase 0 - 4) เพื่อคุมคุณภาพโค้ดและลดความเสี่ยง ห้ามข้ามเฟสจนกว่า Definition of Done (DoD) ของเฟสก่อนหน้าจะผ่านครบ

---

## Phase 0: Foundation, Security, Design Tokens & CI/CD
**Goal:** วางโครงสร้าง Repo, ระบบ Better Auth ที่ล็อกคนเดียว, Design System (Dark/Light + TH/EN), iOS PWA Shell และ CI/CD Pipeline
- [ ] Init Next.js (App Router, Strict TS, Tailwind) + Drizzle ORM + Neon PostgreSQL (ไม่เขียนทับ `docs/`, `AGENTS.md`, `.github/`, `public/`)
- [ ] สร้าง Database Schema ทั้งหมดตาม `docs/ARCHITECTURE.md` + ตาราง Better Auth และรัน Initial Migration
- [ ] ตั้งค่า **Better Auth (`better-auth`)** + `drizzleAdapter` + Google OAuth + `databaseHooks` ล็อก `ALLOWED_USER_EMAIL` + Middleware Protection
- [ ] ตั้งค่า Design Tokens (`docs/DESIGN.md`), ฟอนต์ `Inter` + `Anuphan`, `next-themes` (Dark/Light/System) และ `next-intl` (`messages/th.json`, `messages/en.json`)
- [ ] ตั้งค่า Security Headers (`CSP`, `HSTS`, `X-Frame-Options`, `nosniff`) ใน `next.config.ts`
- [ ] ตั้งค่า iOS PWA (`manifest.json`, Export `public/icon.svg` เป็น `apple-touch-icon.png` 180x180 & `icon-512.png`, `viewport-fit=cover`, Safe Area CSS, Dynamic `theme-color`)
- [ ] ติดตั้ง Vitest, ESLint และตรวจสอบ `.github/workflows/ci.yml` ให้รันผ่านเขียว
- **DoD:** Deploy ขึ้น Vercel Preview, Add to Home Screen บน iPhone ได้เหมือนแอปจริงด้วยไอคอน `maewsave`, ล็อกอินได้เฉพาะเมลที่ Whitelist, สลับ Dark/Light และ TH/EN ได้, CI ผ่านเขียวทั้งหมด

## Phase 1: Core Ledger & Virtual Wallets (Tab 1 - Basic)
**Goal:** ใช้งานจดรายรับ-รายจ่ายแบบ Manual และจัดการกระเป๋า/บัตรได้จริงโดยไม่นับยอดซ้ำ
- [ ] หน้า Settings: CRUD Virtual Wallets (`BANK_CASH`, `CREDIT_CARD` พร้อมวันสรุปยอด/วันครบกำหนด, `EWALLET`), Categories, สลับธีม และสลับภาษา TH/EN
- [ ] `src/domain/money.ts` & `src/domain/billing-cycle.ts` + Unit Tests 100%
- [ ] หน้า Tab 1: Mini Summary Widget (ยอดใช้เดือนนี้ + ยอดค้างบัตรแต่ละใบตามรอบบิล)
- [ ] ระบบบันทึกรายการ (`INCOME`, `EXPENSE`, `TRANSFER`) ผ่าน Mobile Bottom Sheet พร้อม Optimistic UI
- [ ] รายการ Transaction Ledger ย้อนหลัง (ครบทั้ง Loading Skeleton, Empty State แมวอ้วนเฮง, Error State)
- **DoD:** บันทึกรูดบัตร A และโอนเงินจาก Bank A จ่ายบัตร A แล้ว ยอดรายจ่ายรวมไม่นับซ้ำ

## Phase 2: Smart Reminder & Recurring (Tab 2)
**Goal:** จัดการบิลรายเดือน/รายปี แยก Auto-Charge กับ Manual Pay พร้อมแจ้งเตือนบน iPhone
- [ ] หน้า Tab 2: CRUD `recurring_rules` (`MONTHLY`/`YEARLY`, `AUTO_CHARGE`/`MANUAL_PAY`)
- [ ] รองรับการแก้ไขราคาค่าบริการ (Non-retroactive: ไม่กระทบ Transaction เก่า)
- [ ] สร้าง Vercel Cron API (`/api/cron/recurring`) พร้อมตรวจ `CRON_SECRET`:
  - `AUTO_CHARGE`: สร้าง Transaction เข้าบัตรที่ผูกไว้อัตโนมัติเมื่อถึง `next_run_date`
  - `MANUAL_PAY`: ส่ง Web Push Notification เตือนล่วงหน้าและวันครบกำหนด
- [ ] ระบบตั้งค่า iOS Web Push Notification (`push_subscriptions`) + ปุ่ม `[Mark as Paid]`
- **DoD:** Cron Job ทำงานถูกต้อง, กด Mark as Paid แล้วสร้าง Transaction จริง, แจ้งเตือนเด้งบน iPhone PWA ได้

## Phase 3: AI Quick Input & Statement Reconciliation
**Goal:** ลด Friction การจดให้เหลือไม่ถึง 5 วินาที และเก็บตกยอดที่ลืมจดผ่าน Statement
- [ ] `src/services/ai-parser.ts`: เชื่อม Gemini API (Structured Output + Zod + Prompt Injection Defense)
- [ ] Quick Input แบบพิมพ์สั้นๆ (Text) และแนบรูปสลิป (Client-side Compression + Magic Bytes Check + RAM-only) พร้อม Toast `[Edit]` / `[Undo]`
- [ ] `src/domain/reconciliation.ts`: Algorithm ชนยอด (±3 วัน, 1-to-1 Matching, Intra-batch Dedup) + Unit Tests 100%
- [ ] หน้า Statement Reconciliation: Unified Upload (`.csv`, `.pdf` ใส่รหัสผ่านใน RAM, `.jpg/.png` หลายรูป) -> หน้า Review (`MATCHED` / `POSSIBLE_MATCH` / `NEW`) -> Edit & Confirm
- **DoD:** อัปโหลดสลิป/Statement แล้วไม่มีไฟล์ค้างบน Server, ชนยอดที่ลืมจดและเพิ่มเข้าระบบได้แม่นยำ

## Phase 4: Hardening, Passkey, E2E & Pen-Test
**Goal:** ตรวจสอบความปลอดภัยระดับ Production ก่อนใช้งานจริงระยะยาว
- [ ] เปิดใช้งาน Better Auth Official Passkey Plugin (Face ID login บน iPhone PWA)
- [ ] เขียน Playwright E2E Tests (จำลอง iPhone Viewport: Auth, Quick Input, Transfer, Reconcile)
- [ ] ตรวจสอบ GitHub Security (Push Protection, Dependabot, CodeQL)
- [ ] ทำ DAST Scan (OWASP ZAP / Nuclei) บน Vercel Preview URL
- [ ] ทำ Manual Pen-Test Checklist (Auth Bypass `curl` -> 401, Malicious File Upload `.svg`/fake `.pdf` -> 400, DevTools Secret Check)
- **DoD:** ปิดช่องโหว่ระดับ Medium/High ทั้งหมด และพร้อมใช้งานจริงบน Production
