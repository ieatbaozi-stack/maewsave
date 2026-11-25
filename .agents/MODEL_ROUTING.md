# Model Routing & Dispatch Guide (`.agents/MODEL_ROUTING.md`)

เอกสารอ้างอิงกลางสำหรับการเลือก **Gemini 4 Model**, **Effort Level**, และ **Lean Dispatch Strategy** ของทีม Antigravity-Native บนโปรเจกต์ `maewsave`

> **หมายเหตุเรื่อง Antigravity Frontmatter:** YAML frontmatter ใน `.agents/agents/*.md` รองรับค่า `model: inherit | flash | pro` และยังไม่มี key `effort` แยกต่อ subagent จึงระบุ Target Gemini 4 Model และคำแนะนำ `/effort` ไว้เป็น YAML comment ด้านบนของไฟล์แต่ละตัว และรวมไว้ในตารางนี้เป็นจุดอ้างอิงกลาง

---

## 1. Gemini 4 Model & Effort Matrix

| Role | File | Target Gemini 4 Model | Recommended `/effort` | Frontmatter `model` | `mainAgent` | Tool Policy |
|---|---|---|---|---|---|---|
| **Main / Lead (Orchestrator)** | *(Main Window)* | Gemini 4 Neon | `high` (งานซับซ้อน/Contract ใหญ่: `xhigh`) | *(UI)* | — | Orchestrate, contracts, independent gates, PR only (no feature code) |
| **Backend Dev** (`dev-backend`) | `.agents/agents/dev-backend.md` | Gemini 4 Neon | `high` (`xhigh` สำหรับ reconciliation / auth / complex SQL) | `inherit` | `false` | Full code + test tools within backend ownership |
| **Frontend Dev** (`dev-frontend`) | `.agents/agents/dev-frontend.md` | Gemini 4 Neon | `high` | `inherit` | `false` | Full code + test tools within frontend ownership |
| **Tech Lead** (`tech-lead`) | `.agents/agents/tech-lead.md` | Gemini 4 Carbon | `medium`–`high` | `pro` | `true` | **No file-edit tools** (read + search + run verification commands only) |
| **QA & E2E** (`qa-reviewer`) | `.agents/agents/qa-reviewer.md` | Gemini 4 Hydrogen | `high` (`medium` สำหรับ PR เล็ก) | `flash` | `false` | Read, test, browser/E2E, tiny clear bugfixes (`qa:`) |
| **Security Auditor** (`security-auditor`) | `.agents/agents/security-auditor.md` | Gemini 4 Carbon | `medium` (`high` สำหรับ auth/upload/AI/pen-test) | `pro` | `true` | **STRICT Read-Only** (`view_file`, `grep_search`, `find_by_name`, `list_dir`) |
| **Secretary** (`secretary`) | `.agents/agents/secretary.md` | Gemini 4 Hydrogen | `medium` | `flash` | `false` | Docs-only (`*.md`, `docs/**`) + read-only git/test inspection |
| **Architect** (`architect`) | `.agents/agents/architect.md` | Gemini 4 Carbon | `medium` | `pro` | `false` | Docs + web research only (no app code) |
| **Ops & Release** (`ops-release`) | `.agents/agents/ops-release.md` | Gemini 4 Hydrogen | `high` | `flash` | `false` | CI/config/docs tools (NEVER merges, tags, or releases) |

---

## 2. Lean Dispatch Matrix (เลือกเรียกเฉพาะบทบาทที่คุ้มค่า)

เพื่อประหยัด usage quota และลด latency ให้ Main เรียกเฉพาะบทบาทที่ตรงกับลักษณะงาน:

| ประเภท PR / รอบงาน | Dev / Specialist | Gates ที่ต้องรัน | Support |
|---|---|---|---|
| **Full-Stack Feature / Phase** (เช่น Phase 2 Recurring, Phase 3 AI/Reconcile) | `architect` *(ถ้ามี ADR ใหม่)* → `dev-backend` + `dev-frontend` | `tech-lead` → `qa-reviewer` ∥ `security-auditor` | `secretary` (+ `ops-release` ถ้ามี Cron/CI/config ใหม่) |
| **Backend / Auth / API / Cron / Upload Only** | `dev-backend` | `tech-lead` → `security-auditor` (+ `qa-reviewer` ตรวจ domain/API tests) | `secretary` |
| **Frontend / UI / i18n / PWA Only** | `dev-frontend` | `tech-lead` → `qa-reviewer` *(เรียก `security-auditor` เฉพาะเมื่อแตะ auth/XSS/CSP/upload)* | `secretary` |
| **CI / Headers / Env / Infra Config** | `ops-release` | `tech-lead` → `security-auditor` | `secretary` |
| **Docs / Governance Only** | `secretary` หรือ `architect` | Main ตรวจ Zero-PII &ความสอดคล้อง *(ไม่ต้องเรียก QA/Security ถ้าไม่แตะโค้ด)* | — |

---

## 3. Escalation & Effort Bump Rules
1. **Default:** รันตาม Recommended `/effort` ในตารางด้านบนเสมอ
2. **Loop 2 Failure:** หาก Dev แก้ข้อท้วงติงจาก `tech-lead` / `qa-reviewer` / `security-auditor` ไม่ผ่านในรอบที่ 2 ให้พิจารณาเพิ่ม effort เป็น `xhigh` (สำหรับ `dev-backend`/`dev-frontend`) หรือ `high` (สำหรับ `tech-lead`/`security-auditor`)
3. **Loop 3 Cap:** หากครบ 3 รอบแล้วยังติด `CRITICAL` / `HIGH` / `MEDIUM` ให้ **STOP** และ escalate กลับ `boss` ทันทีพร้อมสรุป root cause และทางเลือก
