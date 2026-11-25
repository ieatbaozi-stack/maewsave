# Product Requirements Document (PRD)
**Project:** maewsave (แมวอ้วนเฮง) — Personal Finance & Smart Recurring Manager  
**Target User:** Invite-only Private Multi-User (Passwordless Google OAuth + Email OTP, managed via SQL-only Super Admin Invites)  
**Platform:** Mobile-First Web App / iOS PWA (95% iPhone Standalone, 5% Desktop Browser)  
**Languages & Theme:** Bilingual (TH / EN) + Dark / Light / System Theme

---

## 1. Problem Statement & Goals
* **Friction in Logging:** แอปรายรับ-รายจ่ายทั่วไปมีขั้นตอนบันทึกมากเกินไป ทำให้เลิกจดกลางคัน
* **Credit Card Double-Counting:** การรูดบัตรเครดิตและการโอนจ่ายบิลบัตรมักถูกนับเป็นรายจ่ายซ้ำซ้อน
* **Unstructured Reminders:** แอปเตือนความจำทั่วไปไม่สามารถแยกได้ว่าบิลไหน "ตัดบัตรอัตโนมัติแล้ว" หรือ "ต้องโอนเอง" และไม่รองรับการปรับราคาโดยไม่กระทบประวัติเดิม
* **Missing Micro-Transactions:** รายการแตะจ่ายที่ไม่มีสลิปชัดเจน (เช่น รถไฟฟ้า/ค่าเดินทาง) มักตกหล่น

**Success Metrics:**
* บันทึกรายจ่ายผ่าน Quick Input (พิมพ์สั้น/อัปโหลดสลิป) เสร็จภายใน < 5 วินาที
* ยอดค้างบัตรเครดิตในระบบตรงกับ Statement จริง 100% หลังทำ Reconciliation
* ปราศจากการเก็บไฟล์สลิป/Statement ถาวรบนเซิร์ฟเวอร์ (Zero-File Storage)

---

## 2. Information Architecture (2 Core Tabs + Settings)

### Tab 1: Ledger & Reconcile / บัญชีรายรับ-รายจ่าย (หน้าหลัก)
ออกแบบให้เปิดมาแล้วจดได้ทันที โดยมี Summary เป็น Subset ด้านบน
* **Mini Summary Widget (Top):**
  * ยอดรายจ่ายรวมเดือนปัจจุบัน (แยกจากยอด Transfer)
  * ยอดค้างชำระสะสมของบัตรเครดิตแต่ละใบ (ตามรอบบิลปัจจุบัน)
  * แจ้งเตือนบิล Manual Pay ที่ใกล้ครบกำหนด + ปุ่มขยายดูกราฟ/สรุปรายหมวดหมู่
* **Quick Input (Thumb-Zone):**
  * **Text Input:** พิมพ์ประโยคสั้นๆ (เช่น `"กาแฟ 65 บัตร A"`) ให้ AI แยก ยอดเงิน, ร้านค้า, หมวดหมู่, กระเป๋าเงิน
  * **Slip Image Input:** อัปโหลดรูปสลิป -> บีบอัดฝั่ง Client -> แกะข้อมูลใน RAM -> ลบรูปทิ้งทันที
  * **Optimistic Save:** บันทึกทันทีพร้อม Toast แจ้งผลที่มีปุ่ม `[Edit]` และ `[Undo/Delete]` ใน 1 คลิก
* **Transaction Ledger:**
  * แยกประเภทชัดเจน: `INCOME`, `EXPENSE`, `TRANSFER` (โอนจ่ายบิลบัตร/ย้ายเงินระหว่างกระเป๋า ไม่นับเป็นรายจ่ายซ้ำ)
* **Statement Reconciliation (กระทบยอดสเตทเมนต์):**
  * ช่องอัปโหลดเดียวรองรับ `.csv`, `.pdf` (รองรับช่องกรอกรหัสผ่านปลดล็อกใน RAM), และรูปแคปหน้าจอ `.jpg/.png` (หลายรูปพร้อมกัน)
  * **Smart Matching:** เทียบกับรายการใน DB โดยแบ่งเป็น 3 สถานะ:
    1. `MATCHED` (บันทึกแล้ว — ข้ามอัตโนมัติ)
    2. `POSSIBLE_MATCH` (ยอดตรง แต่วันที่เหลื่อม ±3 วัน หรือชื่อร้านต่างกัน — ให้ผู้ใช้เลือกผูกหรือเพิ่มใหม่)
    3. `NEW` (ยังไม่เคยบันทึก เช่น ค่าเดินทางแตะบัตร — ให้ AI เดาหมวดหมู่รอไว้)
  * รองรับการตัดรายการซ้ำจากรูปแคปหน้าจอที่เหลื่อมกัน (Overlapping Screenshots)
  * หน้า Review ให้ Edit รายละเอียดก่อนกด Confirm เพื่อบันทึกและติดสถานะ `is_reconciled = true`

### Tab 2: Smart Reminder & Recurring / เตือนบิลประจำ
* รองรับรอบเวลา: `MONTHLY` (รายเดือน) และ `YEARLY` (รายปี)
* แยกประเภท Action ชัดเจน:
  * **`AUTO_CHARGE` (ตัดบัตรอัตโนมัติ):** เช่น Streaming Sub, AI Sub, ประกันรายปี -> เมื่อถึงวัน ระบบสร้าง Transaction เข้าบัตรเครดิตที่ผูกไว้อัตโนมัติ
  * **`MANUAL_PAY` (ต้องโอนเอง):** เช่น ค่าเช่าที่พัก, ภาษีประจำปี -> ส่ง Web Push Notification เตือนล่วงหน้าและวันครบกำหนด พร้อมปุ่ม `[Mark as Paid]` เพื่อสร้าง Transaction จริง
* **Non-Retroactive Price Update:** แก้ไขราคาค่าบริการได้โดยไม่กระทบยอดที่บันทึกไปแล้วในอดีต

### Settings & Virtual Wallets (Privacy-First)
* **Zero PII:** ไม่เก็บเลขบัญชี, เลขบัตร 16 หลัก, ชื่อจริง หรือรหัสผ่านธนาคาร
* สร้างเป็น Virtual Wallet ด้วยชื่อสมมติ (Alias) เช่น `"Bank A"`, `"Card A"`, `"E-Wallet A"`
* ประเภทกระเป๋า: `BANK_CASH`, `CREDIT_CARD` (ระบุ `statement_day` และ `due_day`), `EWALLET`
* จัดการหมวดหมู่ (Categories), สลับภาษา (`TH` / `EN`), สลับธีม (`System` / `Light` / `Dark`), และตั้งค่า Web Push / Passkey

---

## 3. UX/UI & iOS PWA Requirements (Anti-AI Slop)
* ดูรายละเอียดครบถ้วนใน `docs/DESIGN.md`
* **Standalone Native Feel:** `manifest.json` (`display: standalone`), `apple-mobile-web-app-capable="yes"`, ไอคอน `maewsave` Home Screen ครบทุกขนาด
* **Safe Area & Viewport:** `viewport-fit=cover`, รองรับ `env(safe-area-inset-top/bottom)` ไม่ทับ Dynamic Island และ Home Indicator
* **No Auto-Zoom:** ช่อง `<input>` ทุกจุดต้องมี `font-size >= 16px`
* **Notifications:** รองรับ iOS Web Push Notification (PWA) สำหรับแจ้งเตือนบิล `MANUAL_PAY`
