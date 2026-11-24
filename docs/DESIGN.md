# Design System & UX/UI Specification (`docs/DESIGN.md`)

**Brand Name:** maewsave (แมวอ้วนเฮง)  
**Brand Aesthetic:** Modern Minimalist FinTech + Cozy "Fat Cat" Identity  
**Design Philosophy:** Calm, high-clarity, anti-AI slop. Restraint over decoration. Built for 95% one-handed iPhone PWA usage and 5% Desktop review.

---

## 1. Brand Identity & "Fat Cat" Mascot Guidelines
* **Logo Concept:** Plump, rounded **Fat Cat** wearing an auspicious red collar and gold lucky coin (`public/icon.svg`), paired with a crisp 1-color monoline UI mark (`public/maewsave-mark.svg`).
* **Signature Brand Color:** Deep Emerald Jade (`#0F5C4D` in Light Mode / `#34D399` in Dark Mode) — distinct financial green that pairs harmoniously with minimalist monochrome surfaces.
* **Usage:**
  * **iOS App Icon (`public/icon.svg` -> PNG 180x180 & 512x512):** Plump warm-cream Fat Cat on `#0F5C4D` Deep Emerald Jade background with safe padding for iOS squircle mask.
  * **Header & Empty States (`public/maewsave-mark.svg`):** Flat vector SVG using `currentColor` (adapts automatically to Light/Dark Mode). Subtle line-art Fat Cat illustrations for empty states without overwhelming financial data.

---

## 2. Color System (Semantic Design Tokens)
**Strict Rules:**
* NEVER hardcode raw Tailwind colors (e.g., `bg-slate-900`) in UI components. Always use semantic CSS variables.
* Use **solid opaque hex values** for surfaces (avoid translucent `rgba` card layering to maintain 60fps scrolling on iOS WebKit).
* Dark Mode achieves depth via **surface lightness elevation**, NOT drop shadows.
* Reserve saturated colors strictly for brand accent and financial status.

### Token Table (Light & Dark Mode)

| Semantic Token | Light Mode (Warm Crisp) | Dark Mode (Deep Obsidian) | Usage |
| :--- | :--- | :--- | :--- |
| `--bg-canvas` | `#F8F9FA` | `#0D0F12` | Root viewport background & iOS `theme-color` |
| `--bg-surface` | `#FFFFFF` | `#16191F` | Primary cards, list containers, bottom sheets |
| `--bg-elevated` | `#F1F3F5` | `#1E222B` | Input fields, pills, secondary surfaces |
| `--border-subtle` | `#E5E7EB` | `#262B36` | 1px hairline dividers, card borders |
| `--text-primary` | `#111827` | `#F3F4F6` | Headings, monetary values, primary labels |
| `--text-secondary` | `#4B5563` | `#9CA3AF` | Subtitles, wallet names, dates |
| `--text-muted` | `#9CA3AF` | `#6B7280` | Placeholders, disabled labels |
| `--brand-accent` | `#0F5C4D` | `#34D399` | Primary brand CTA, active tab highlight, focus rings |
| `--brand-accent-fg` | `#FFFFFF` | `#0D0F12` | Text/icons inside primary brand CTA |
| `--status-income` | `#059669` | `#34D399` | Income, Matched reconciliation, Paid |
| `--status-expense` | `#DC2626` | `#F87171` | Expense, Overdue bills, Destructive actions |
| `--status-warning` | `#D97706` | `#FBBF24` | Possible match, Upcoming manual bill due |
| `--status-transfer` | `#2563EB` | `#60A5FA` | Credit card bill payments / Wallet transfers |

### Theme Switching Behavior
* Managed via `next-themes` (`attribute="class"`, default `"system"`).
* Support 3 states in Settings: `System` / `Light` / `Dark`.
* Dynamically sync `<meta name="theme-color">` with `--bg-canvas` (`#F8F9FA` in Light, `#0D0F12` in Dark) so the iOS Dynamic Island and status bar blend seamlessly.

---

## 3. Typography (Bilingual TH/EN + Financial Clarity)
* **Font Stack (via `next/font/google`):**
  * **Latin & Numbers:** `Inter` (weights: 400, 500, 600, 700)
  * **Thai:** `Anuphan` (loopless, modern geometric proportions matched to Latin) — *Fallback alternative: `IBM Plex Sans Thai`*
  * CSS Stack: `font-family: var(--font-inter), var(--font-anuphan), sans-serif;`
* **Financial Number Rules:**
  * Apply `font-variant-numeric: tabular-nums;` (`tabular-nums`) to **ALL** currency amounts, dates, and percentages so columns align vertically.
  * Display currency symbol consistently (`฿1,250.00`).
* **Thai Script Legibility Rules:**
  * Minimum `line-height: 1.5` for body text and `1.35` for headings so Thai upper/lower vowels and tone marks (`สระ/วรรณยุกต์`) are NEVER clipped by `overflow-hidden`.
* **iOS Input Rule:**
  * All form inputs (`<input>`, `<textarea>`, `<select>`) MUST use at least `16px` (`text-base`) font size to prevent iOS Safari auto-zoom.

### Type Scale
* **Hero Balance (Summary):** `32px` / Bold / `tracking-tight` / `tabular-nums`
* **Page Title:** `22px` / Semibold
* **Section Header:** `13px` / Semibold / Uppercase (`tracking-wider`, `--text-secondary`)
* **Transaction Title / Body:** `15px` / Medium
* **Metadata (Date, Wallet, Tag):** `13px` / Regular (`--text-secondary`)

---

## 4. Internationalization (TH / EN)
* **Architecture:** Lightweight cookie/preference-driven `next-intl` (no URL prefixes like `/th` or `/en` to keep iOS PWA routing clean).
* **Toggle:** Instant 1-tap switch between `ไทย (TH)` and `English (EN)` in Settings.
* **Copywriting & Formatting Rules:**
  * **Zero Hardcoded Strings:** Every UI label, toast, empty state, and validation message must live in `messages/th.json` and `messages/en.json`.
  * **Button & Tab Length Resilience:** Bottom nav labels and pill badges must remain concise (1–2 words max, e.g., `บัญชี / Ledger`, `เตือนบิล / Bills`).
  * **Date Formatting:** Use crisp short formats (`24 พ.ย.` / `24 Nov`) with Gregorian year (`2026`) by default for clean consistency with bank statements.

---

## 5. Mobile-First Layout & iOS PWA Ergonomics

### Navigation Structure (Thumb-Zone First)
* **Bottom Navigation Bar:** Fixed bottom bar respecting `padding-bottom: env(safe-area-inset-bottom)`.
  * **Left Tab:** Ledger / บัญชี (Tab 1: Mini Summary + Quick Input + Transactions + Reconcile)
  * **Center Action (FAB or Integrated Quick-Add Trigger):** Primary Quick Input trigger (Text / Slip upload) directly reachable by thumb.
  * **Right Tab:** Bills / เตือนบิล (Tab 2: Smart Reminder & Recurring Rules)
* **Top Header:** Clean, minimal header respecting `padding-top: env(safe-area-inset-top)` with `maewsave-mark.svg` + brand name (`แมวอ้วนเฮง` / `maewsave`) on the left, and Settings icon on the right.
* **Desktop (5% usage):** Center the primary mobile column (`max-w-[480px] mx-auto`), EXCEPT on the **Statement Reconciliation** screen which expands up to `max-w-4xl` for comfortable side-by-side table review.

### Interaction Patterns (Native Feel)
* **Bottom Sheets over Modals:** On mobile, Quick Input, Transaction Edit, and Wallet Picker MUST open as swipe-to-dismiss **Bottom Sheets** instead of centered desktop modals.
* **Spacing Grid:** Strict `4px / 8px` scale (`p-4` card padding, `gap-3` between list items, `rounded-2xl` for cards, `rounded-xl` for buttons/inputs).
* **Touch Targets:** Minimum `44px x 44px` tap area for all interactive icons and buttons (Apple HIG standard).
* **Complete States Required on Every Screen:**
  1. **Loading:** Shimmering Skeleton placeholders matching exact layout geometry.
  2. **Empty:** Minimal `maewsave-mark.svg` line-art + concise localized message + 1 clear CTA.
  3. **Error:** Non-alarming inline alert card with a clear `Retry` button.
  4. **Optimistic Feedback:** Instant UI insertion + bottom toast with 1-tap `[Edit]` / `[Undo]` buttons.
