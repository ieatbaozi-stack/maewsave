# System Architecture & Engineering Specification
**Project:** maewsave (แมวอ้วนเฮง)

## 1. Tech Stack & Infrastructure
* **Framework:** Next.js (App Router) + TypeScript (`strict: true`, no `any`)
* **Styling & Theme:** Tailwind CSS (Semantic CSS Tokens) + `next-themes` (Dark/Light/System)
* **i18n:** `next-intl` (Cookie/Preference-driven TH/EN without URL prefixes)
* **Validation:** Zod (Single Source of Truth สำหรับ API, Forms, และ AI JSON Output)
* **Authentication:** **Better Auth (`better-auth`)** + `drizzleAdapter` + Passwordless Invite-Only System
  * **Google OAuth 2.0:** `openid`, `email`, `profile` + `prompt=select_account` (ไม่เก็บ access/refresh token ลง DB)
  * **Email + 6-digit OTP:** ส่งผ่าน Decoupled Email Transport Layer (`smtp` Gmail App Password / `log` dev-only / ขยาย `http` ได้), เก็บ hash ใน DB, หมดอายุ 10 นาที, ผิดได้ 5 ครั้ง
  * **Account Linking:** ผูกบัญชีด้วยอีเมลเดียวกัน (Google ↔ Email OTP ใช้ `user.id` เดียวกัน)
  * **Invite-Only & Super Admin:** โค้ดเชิญ `XXXX-XXXX` เก็บเฉพาะ `SHA-256` hash + ลิงก์ `#invite=` + ตัดสิทธิ์แบบ Atomic ใน `databaseHooks.user.create.before`; สิทธิ์ `super_admins` อัปเดตผ่าน SQL เท่านั้น (`/admin/invites` ตอบ `404` สำหรับคนทั่วไป)
  * **DB-Backed Sessions & Rate Limiting:** Session cookie `HttpOnly; Secure; SameSite=Lax` (30 วัน, sliding renewal) + Rate limiting ใน PostgreSQL (`rate_limits`) + `OTP_DAILY_CAP`
  * Ready for Official Passkey (WebAuthn / Face ID) Plugin
* **Database & ORM:** Neon (PostgreSQL Serverless) + Drizzle ORM
* **Hosting & Cron:** Vercel (Hobby Plan) + Vercel Cron (รันวันละ 1 ครั้ง เวลา 00:00 UTC / 07:00 ICT)
* **AI Engine:** Gemini API (Pay-as-you-go Tier เพื่อรับประกันนโยบาย Zero Data Training)
* **Testing:** Vitest (Unit/Domain Logic) + Playwright (E2E Mobile Viewport)

---

## 2. Modular Architecture (Clean Layer Separation)
แยกความรับผิดชอบชัดเจน ห้ามนำ Business Logic หรือ DB Query ไปเขียนใน React Component

```text
src/
├── app/                  # Next.js App Router (Pages, API Routes, Server Actions)
├── components/           # Presentational UI Components & Design System
├── domain/               # Pure Functions (100% Unit Test Coverage)
│   ├── billing-cycle.ts  # คำนวณรอบบิลบัตรเครดิต
│   ├── reconciliation.ts # Algorithm ชนยอด (±3 วัน, 1-to-1 Matching, Dedup)
│   └── money.ts          # แปลงหน่วยสตางค์ <-> บาท และ Format
├── services/             # Application Services (Orchestrate DB + AI + Push)
│   ├── ai-parser.ts      # Gemini Vision/Text + Strict Zod Schema
│   └── recurring.ts      # ประมวลผล Cron Job รายวัน
├── lib/                  # Auth config (better-auth), env validation, utils
└── db/                   # Drizzle Schema, Migrations, Connection (Neon)
```

---

## 3. Database Schema (PostgreSQL / Neon)
**กฎเหล็กเรื่องตัวเลขเงิน:** เก็บจำนวนเงินทุกคอลัมน์เป็น **`BIGINT` หน่วยสตางค์ (Minor Units)** เช่น `65.50 บาท = 6550` เพื่อป้องกัน Floating-Point Rounding Error 100%

*(หมายเหตุ: ตาราง Authentication ของ Better Auth ได้แก่ `user`, `session`, `account`, `verification` จะถูกสร้างผ่าน `@better-auth/cli` ใน Phase 0)*

```sql
-- 1. Virtual Wallets (Zero PII)
CREATE TABLE wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alias VARCHAR(50) NOT NULL,               -- เช่น "Card A", "Bank A", "E-Wallet A"
  type VARCHAR(20) NOT NULL,                -- 'BANK_CASH' | 'CREDIT_CARD' | 'EWALLET'
  statement_day SMALLINT,                   -- 1-31 (เฉพาะ CREDIT_CARD)
  due_day SMALLINT,                         -- 1-31 (เฉพาะ CREDIT_CARD)
  initial_balance_satang BIGINT DEFAULT 0,  -- Optional
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Categories
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) NOT NULL,
  type VARCHAR(10) NOT NULL,                -- 'INCOME' | 'EXPENSE'
  icon VARCHAR(30),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Transactions (Ledger)
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(15) NOT NULL,                -- 'INCOME' | 'EXPENSE' | 'TRANSFER'
  amount_satang BIGINT NOT NULL CHECK (amount_satang > 0),
  wallet_id UUID NOT NULL REFERENCES wallets(id),
  to_wallet_id UUID REFERENCES wallets(id), -- ใช้เฉพาะกรณี type = 'TRANSFER' (เช่น จ่ายบิลบัตร)
  category_id UUID REFERENCES categories(id),
  merchant VARCHAR(120) NOT NULL,
  note TEXT,
  transaction_date DATE NOT NULL,
  source VARCHAR(20) DEFAULT 'MANUAL',      -- 'MANUAL' | 'AI_TEXT' | 'AI_SLIP' | 'RECURRING' | 'STATEMENT'
  is_reconciled BOOLEAN DEFAULT FALSE,
  recurring_rule_id UUID,                   -- อ้างอิงถ้าเกิดจาก Smart Reminder
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Smart Recurring Rules
CREATE TABLE recurring_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(100) NOT NULL,              -- เช่น "Streaming Sub", "Monthly Rent"
  amount_satang BIGINT NOT NULL CHECK (amount_satang > 0), -- แก้ได้ไม่กระทบอดีต
  wallet_id UUID NOT NULL REFERENCES wallets(id),
  category_id UUID REFERENCES categories(id),
  frequency VARCHAR(10) NOT NULL,           -- 'MONTHLY' | 'YEARLY'
  billing_day SMALLINT NOT NULL,            -- วันที่ตัด/จ่าย (1-31)
  billing_month SMALLINT,                   -- เดือนที่จ่าย (1-12, เฉพาะ YEARLY)
  action_type VARCHAR(15) NOT NULL,         -- 'AUTO_CHARGE' | 'MANUAL_PAY'
  next_run_date DATE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Web Push Subscriptions (iOS PWA)
CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint TEXT UNIQUE NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 4. Key Data Flows & Constraints

### A. Zero-File Storage & Vercel 4.5MB Limit
1. **Client-Side Compression:** ก่อนส่งรูปสลิปหรือแคปหน้าจอ Statement ขึ้น API ฝั่ง Client ต้องย่อขนาดรูปด้วย Canvas API ให้เหลือ ~300–500 KB/รูป เพื่อไม่ให้ชนเพดาน 4.5 MB ของ Vercel Serverless Function
2. **RAM-Only Processing:** Backend อ่านไฟล์เป็น `Buffer` ใน Memory -> ตรวจ Magic Bytes -> (ถ้าเป็น PDF ติดรหัสผ่าน ให้ปลดล็อกใน Memory) -> ส่งเข้า Gemini API หรือ CSV Parser -> คืนค่า JSON -> ปล่อย Buffer ทิ้งทันที

### B. Statement Reconciliation Algorithm (`src/domain/reconciliation.ts`)
1. **Intra-Batch Deduplication:** กรณีอัปโหลดรูปแคปหน้าจอหลายรูป ให้ตรวจหาและตัดรายการที่ซ้ำซ้อนกันเองจากรอยต่อของรูป
2. **1-to-1 Matching:** ดึงรายการของ `wallet_id` นั้นในช่วงเวลาของ Statement มาเทียบแบบ 1-ต่อ-1 (รายการที่ถูกจับคู่แล้วจะถูกดึงออกจาก Pool เพื่อรองรับยอดเท่ากันในวันเดียวกัน เช่น ค่าเดินทางไป-กลับ)
   * `MATCHED`: ยอดตรงกันเป๊ะ + วันที่ตรงกัน
   * `POSSIBLE_MATCH`: ยอดตรงกันเป๊ะ + วันที่ต่างกันไม่เกิน ±3 วัน (เผื่อ Transaction Date vs Posting Date)
   * `NEW`: ไม่พบคู่ใน Pool

---

## 5. Security Architecture & Pen-Test Plan

### Defense-in-Depth Controls
1. **Passwordless Invite-Only Auth & Super Admin (Better Auth):**
   * Google OAuth (`openid`, `email`, `profile`, `prompt=select_account`, strip OAuth tokens before DB write) + Email 6-digit OTP (HMAC-SHA256 hashed, 10-min TTL, max 5 attempts, anti-enumeration pre-gate before sending email)
   * Atomic invite consumption (`UPDATE invitations SET uses_count = uses_count + 1 WHERE ...`) inside `databaseHooks.user.create.before` — zero uninvited `user` rows
   * SQL-only `super_admins` table verified against DB on every request (`404` for non-Super-Admins), `Origin` CSRF check, `Cache-Control: no-store`, and `<= 20/day` invite creation rate limit
   * Optional Passkey (Face ID) Plugin สำหรับล็อกอินแบบ Phishing-resistant บน iPhone
2. **Zero-Trust API & Multi-Tenant Isolation:** ตรวจ DB-backed Session ใน Middleware/Proxy และทุก Server Action/API Route โดยใช้ Cookie `HttpOnly`, `Secure`, `SameSite=Lax` และบังคับ `user_id` scoping ในทุกตารางการเงิน
3. **App Hardening:**
   * ตั้งค่า Security Headers: per-request nonce `CSP`, `HSTS`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`
   * ตรวจ **Magic Bytes** ของไฟล์อัปโหลดทุกครั้ง (รับเฉพาะ JPEG, PNG, PDF, CSV แท้ๆ)
   * DB-backed Serverless Rate Limiting (`rate_limits`) ตอบ `429` + `X-Retry-After` และ `OTP_DAILY_CAP` ตอบ `503` + เปิด **Vercel Firewall**
4. **AI Prompt Injection Defense:** ห่อข้อมูลจากสลิป/Statement ใน Delimiter ชัดเจนว่าเป็น Untrusted Data และบังคับ Structured Output ผ่าน Zod Schema

### Automated CI/CD & Pen-Test Checklist (Public Repo Ready)
* **CI Quality Gates (GitHub Actions):** ห้าม Merge เข้า `main` หากไม่ผ่าน `tsc --noEmit`, `lint`, `vitest run`, `CodeQL`, และ `Gitleaks` (Secret Scanning)
* **GitHub Security:** เปิด Push Protection, CodeQL (SAST), Dependabot, และ Branch Ruleset สำหรับ `main`
* **DAST & Manual Pen-Test (ก่อนใช้งานจริงบน Production):**
  * รัน OWASP ZAP / Nuclei สแกน Vercel Preview URL
  * ทดสอบ Auth Bypass (`curl` ยิง API โดยไม่มี Cookie ต้องได้ `401`)
  * ทดสอบ Malicious Upload (อัปโหลด `.svg` ฝัง `<script>` หรือปลอมนามสกุลเป็น `.pdf` ต้องถูกปฏิเสธ `400`)
