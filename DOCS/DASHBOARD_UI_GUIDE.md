# Dashboard UI Guide — WarungAI

**Version:** 1.0 · **Last updated:** 2026-05-30 · **Scope:** Owner analytics dashboard (Phase 8) + B2B FMCG view (post-MVP/demo)

> **Purpose.** This is the visual + build spec for the web dashboard. It marries the
> **aesthetic** of the reference design (deep-green header, cream canvas, soft white cards —
> "TalentaSync" style) with **WarungAI's real content** (omzet, kasbon, loyalty, sales trend,
> predictive restock, credit scoring). Follow this and the dashboard will look intentional,
> on-brand, and demo-ready — not like a generic admin template.
>
> Build it with our existing stack: **HTML + CSS + Bootstrap 5 (grid/utilities only) +
> Chart.js + vanilla JS**, served by Express from `web/dashboard/`. No React. See
> [`ARCHITECTURE.md`](./ARCHITECTURE.md) and [`CONVENTIONS.md`](./CONVENTIONS.md).

---

## 1. North star — what we're matching

From the reference (Image 1) we take the **look**; from the WarungAI mockups (Images 2–3) we take the **content**.

**Aesthetic DNA to copy:**
- Deep forest-green top **navbar** spanning full width, with a lighter-green "pill" on the active nav item.
- Warm **cream canvas** below the header (not stark white, not blue-gray) — this is the signature warmth.
- **White cards** with generous padding, large radius (~18px), and a *very soft* low shadow. Lots of breathing room.
- A **greeting line** ("Selamat Pagi, …") with the shop name in large bold type, and a period selector + "Export Data" button on the right.
- A row of **KPI stat cards** up top, then a **grid of widget cards** below.
- Big, confident **numbers**; small **muted labels**; **pill badges** for deltas/status (green = good, red = liability/urgent, amber = watch).

**What we deliberately change from the reference:** content is 100% WarungAI (no HR/jobs), copy is **Indonesian**, money is **Rupiah**, and charts reflect retail (sales trend, category mix, restock).

---

## 2. Page anatomy (layout map)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  NAVBAR (deep green, full-bleed)                                           │
│  ◆ WarungAI   [Dashboard]  Transaksi  Pelanggan  Laporan      ⚙  🔔  👤   │
├──────────────────────────────────────────────────────────────────────────┤
│  CANVAS (cream)                                                            │
│                                                                            │
│  Selamat Pagi,                              [📅 Hari Ini ▾]  [Export Data] │
│  Warung Bu Sri                                                             │
│                                                                            │
│  ┌─ KPI ───────┐ ┌─ KPI ───────┐ ┌─ KPI ───────┐ ┌─ KPI (opt) ─┐         │
│  │ Daily Omzet │ │ Active      │ │ Loyalty     │ │ Transaksi   │         │  ← Row 1
│  │ Rp 487.000  │ │ Piutang     │ │ Customers   │ │ Hari Ini    │         │
│  │ ↑8% vs kmrn │ │ Rp 345.000  │ │ 142 ↑5 baru │ │ 38 ↑12%     │         │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘         │
│                                                                            │
│  ┌─ 📈 Tren Penjualan 7 Hari Terakhir ─────────────────────────────────┐  │  ← Row 2
│  │            (area line chart, Sen…Min)                                │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
│  ┌─ 🛍️ Kategori Produk Terlaris ─┐  ┌─ 🔮 Predictive Restock ─────────┐   │  ← Row 3
│  │        (donut chart)          │  │  Sirup Marjan      [Urgent]     │   │
│  │                               │  │  Minyak Goreng 2L  [Urgent]     │   │
│  └───────────────────────────────┘  └─────────────────────────────────┘   │
│                                                                            │
│  ┌─ 🛡️ Behavioral Credit Scoring (Kasbon) ────────────────────────────┐   │  ← Row 4
│  │  Budi   Debt Rp145.000 · Telat 3x          [32/100]                 │   │
│  │  Andi   Debt Rp210.000 · Telat 1x          [61/100]                 │   │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
│  ── 🌍 External: FMCG Regional Data (B2B Access) ──────  [post-MVP/demo]   │  ← Row 5+
│  (mini KPIs · price-trend line · top-brand donut · turnover list)          │
└──────────────────────────────────────────────────────────────────────────┘
```

**Grid:** 12-column, max content width ~1280px, centered, 24px horizontal gutters. Card gap 24px (desktop), 16px (mobile).

| Row | Widget | Desktop span |
|-----|--------|--------------|
| 1 | KPI cards × 3 (or 4) | 4 cols each (3-up) or 3 cols each (4-up) |
| 2 | Tren Penjualan 7 Hari (area line) | 12 |
| 3 | Kategori Produk Terlaris (donut) \| Predictive Restock (list) | 6 \| 6 |
| 4 | Behavioral Credit Scoring (list) | 12 |
| 5 | B2B mini-KPIs × 2 | 6 \| 6 |
| 6 | Tren Fluktuasi Harga (line, 2 series) | 12 |
| 7 | Top Brand donut \| Turnover Rate per Item (list) | 6 \| 6 |

> Rows 1–4 = **MVP owner dashboard**. Rows 5–7 = **B2B FMCG view** — a *post-MVP* feature ([`PRD.md`](./PRD.md#2-goals--non-goals) marks it Q1 2027). For the competition demo, build it with clearly-labeled **mock/seeded data** to sell the vision; gate it behind a `?view=b2b` route or a "B2B Access" tab. The MVP data model must not preclude it.

---

## 3. Design tokens

Put these in `web/dashboard/css/tokens.css` as CSS variables. Every color/space/radius below
comes from analyzing the reference; don't freelance new values.

```css
:root {
  /* ---- Brand green scale ---- */
  --wa-green-900: #0E3B30;   /* navbar darkest / donut darkest slice */
  --wa-green-800: #14443A;   /* navbar base */
  --wa-green-700: #1B5E4B;
  --wa-green-600: #2E8B68;   /* donut mid slice */
  --wa-green-500: #34B36B;   /* primary accent / positive text */
  --wa-green-400: #4FC97F;   /* line-chart stroke, bright accents */
  --wa-green-300: #7FD9A0;
  --wa-green-100: #E6F7EE;   /* success badge bg, chart area fill */

  /* ---- Surfaces ---- */
  --wa-canvas:   #F7F3EA;    /* cream page background (the signature warmth) */
  --wa-surface:  #FFFFFF;    /* cards */
  --wa-surface-2:#FBF9F4;    /* subtle inset / hover */

  /* ---- Ink (text) ---- */
  --wa-ink-900:  #14201C;    /* headings, big numbers */
  --wa-ink-700:  #2E3B36;    /* body strong */
  --wa-ink-500:  #5B6B66;    /* labels, muted */
  --wa-ink-300:  #93A19C;    /* subtle / disabled */

  /* ---- Lines ---- */
  --wa-border:   #EAE7DD;    /* hairline on cream */
  --wa-border-2: #F0EEE6;    /* inner dividers */

  /* ---- Status ---- */
  --wa-success:  #16A34A;  --wa-success-bg: #E6F7EE;
  --wa-danger:   #DC2626;  --wa-danger-bg:  #FDECEC;
  --wa-warning:  #D97706;  --wa-warning-bg: #FEF3C7;
  --wa-info:     #2563EB;  --wa-info-bg:    #E8F0FE;

  /* ---- Radius ---- */
  --r-card: 18px;  --r-md: 12px;  --r-sm: 8px;  --r-pill: 999px;

  /* ---- Shadow (soft, low) ---- */
  --shadow-card: 0 4px 20px rgba(16, 44, 34, 0.06);
  --shadow-sm:   0 1px 2px rgba(16, 24, 40, 0.05);

  /* ---- Spacing (8px base) ---- */
  --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px;
  --sp-5: 20px; --sp-6: 24px; --sp-8: 32px; --sp-10: 40px;

  /* ---- Type ---- */
  --font-sans: "Plus Jakarta Sans", "Inter", system-ui, -apple-system, sans-serif;
}
```

### Typography
- **Primary typeface: Plus Jakarta Sans** (Google Fonts) — a geometric humanist sans *commissioned for the city of Jakarta*. On-brand for an Indonesian product, free, and visually close to the reference. Fallback: Inter.
- Load weights **500, 600, 700, 800**.

| Token | Size / Line | Weight | Use |
|-------|-------------|--------|-----|
| Display | 30 / 36 | 700 | Greeting shop name |
| KPI number | 28 / 34 | 700 | Stat-card value |
| H2 (card title) | 18 / 24 | 600 | Widget headers |
| Body | 14 / 20 | 500 | List item primary text |
| Label | 13 / 18 | 500 | KPI labels, muted captions (`--wa-ink-500`) |
| Badge | 12 / 16 | 600 | Pills, deltas, scores |

**Money formatting (critical):** always `id-ID` locale, no decimals, dot thousands separator → `Rp 487.000`.
```js
const rupiah = (n) => new Intl.NumberFormat('id-ID',
  { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n); // "Rp 487.000"
```

---

## 4. Component specs

### 4.1 Navbar (deep green, full-bleed)
- Background `--wa-green-800`; height ~64px; content constrained to max width.
- Left: logo mark + "WarungAI" (white, 700). Nav items in white at ~85% opacity; **active item** sits in a pill `background: rgba(255,255,255,.12)` with full opacity text + a small leading icon (matches the reference's active "Dashboard" pill).
- Right: settings + bell icons (white, circular hover bg `rgba(255,255,255,.10)`), then the avatar + shop/owner name (two lines: name 600, role/tier 400 muted-white).

### 4.2 KPI stat card
The hero numbers. White card, `--r-card`, padding `--sp-6`, `--shadow-card`, **4px left accent border** colored by meaning.

Anatomy (top→bottom): label (Label token, `--wa-ink-500`) → value (KPI number, `--wa-ink-900`) → delta row (badge/icon + context).

| Card | Accent border | Value color | Delta |
|------|---------------|-------------|-------|
| Daily Omzet | `--wa-green-500` | ink-900 | `↑ 8% vs kemarin` (success) |
| Active Piutang (Kasbon) | `--wa-danger` | **`--wa-danger`** (it's a liability) | `⚠ 2 jatuh tempo` (danger) |
| Loyalty Customers | `--wa-green-500` | `--wa-success` | `↑ 5 baru hari ini` (success) |
| Transaksi Hari Ini *(optional 4th)* | `--wa-green-500` | ink-900 | `↑ 12%` (success) |

> Reference detail to keep: deltas are **pill badges** (green/amber/red bg), not bare text. Positive = `--wa-success-bg`, watch = `--wa-warning-bg`, liability/urgent = `--wa-danger-bg`.

```html
<!-- KPI card example -->
<div class="kpi-card kpi-card--positive">
  <p class="kpi-card__label">Daily Omzet</p>
  <p class="kpi-card__value">Rp 487.000</p>
  <span class="badge badge--success">↑ 8% vs kemarin</span>
</div>
```
```css
.kpi-card{
  background:var(--wa-surface); border-radius:var(--r-card); padding:var(--sp-6);
  box-shadow:var(--shadow-card); border-left:4px solid var(--wa-green-500);
}
.kpi-card--danger{ border-left-color:var(--wa-danger); }
.kpi-card__label{ font-size:13px; color:var(--wa-ink-500); margin:0 0 8px; }
.kpi-card__value{ font-size:28px; font-weight:700; color:var(--wa-ink-900); margin:0 0 12px; }
.badge{ display:inline-flex; align-items:center; gap:4px; font-size:12px; font-weight:600;
        padding:4px 10px; border-radius:var(--r-pill); }
.badge--success{ color:var(--wa-success); background:var(--wa-success-bg); }
.badge--danger { color:var(--wa-danger);  background:var(--wa-danger-bg); }
.badge--warning{ color:var(--wa-warning); background:var(--wa-warning-bg); }
```

### 4.3 Widget / chart card
- White, `--r-card`, padding `--sp-6`, `--shadow-card`.
- **Header row:** emoji or icon + title (H2) on the left; optional `⋯` menu or `← →` arrows on the right (muted, hover darkens).
- Body: chart canvas or list. Keep ~16px gap between header and body.

### 4.4 List item (Predictive Restock / Credit Scoring / Turnover)
- Row: left block (primary text 600 + muted subtext 13px) | right block (badge), separated by `--wa-border-2` hairline, ~14px vertical padding.
- **Predictive Restock:** subtext `Sisa: 2 Botol · Est. Habis: 3 hari`; badge `Urgent` (danger) when `daysToStockout ≤ leadTime`, else `Perlu Restock` (warning).
- **Credit Scoring:** subtext `Debt: Rp145.000 · Telat 3x bulan ini`; right badge = score `32/100` colored by band.

### 4.5 Score / status badge mapping
Score badge is a 0–100 **creditworthiness** number (higher = safer). Color by band:

| Band | Score range* | Badge style |
|------|--------------|-------------|
| `risky` | 0–40 | danger (red) — e.g. Budi `32/100` |
| `watch` | 41–70 | warning (amber) — e.g. Andi `61/100` |
| `good` | 71–100 | success (green) |

> ⚠ **Cross-doc note for the backend agent:** [`DATA_MODEL.md`](./DATA_MODEL.md#customer) stores `creditScore.value` and [`AI_INTEGRATION.md`](./AI_INTEGRATION.md#credit-scoring) computes a **risk** value where *higher = worse*. The dashboard displays the **inverse** (creditworthiness, higher = better). Pick one convention and align both docs: recommended — store a normalized `creditScore.value` in **0–100 where higher = safer** plus the `band`, and derive it from the risk formula. Update `AI_INTEGRATION.md` accordingly when implementing Phase 5/8.

---

## 5. Charts (Chart.js v4)

Load Chart.js 4 via CDN. Use these exact styles so charts match the brand.

### 5.1 Sales trend — smooth area line (Row 2)
- One dataset, labels `['Sen','Sel','Rab','Kam','Jum','Sab','Min']`.
- Stroke `--wa-green-400` (#4FC97F), width 3, `tension: 0.4` (the soft curve in the mockup), points filled white with green border, radius 4.
- Area fill: vertical gradient `rgba(79,201,127,0.22)` → `rgba(79,201,127,0)`.
- Y axis: Rupiah formatted ticks, light grid `--wa-border`; X axis no grid. Hide legend. Tooltip shows `rupiah(value)`.

```js
const ctx = document.getElementById('salesTrend');
const g = ctx.getContext('2d').createLinearGradient(0, 0, 0, 260);
g.addColorStop(0, 'rgba(79,201,127,0.22)'); g.addColorStop(1, 'rgba(79,201,127,0)');
new Chart(ctx, {
  type: 'line',
  data: { labels: data.labels, datasets: [{
    data: data.values, borderColor: '#4FC97F', borderWidth: 3, tension: 0.4,
    fill: true, backgroundColor: g,
    pointBackgroundColor: '#fff', pointBorderColor: '#4FC97F', pointBorderWidth: 2, pointRadius: 4,
  }]},
  options: {
    plugins: { legend: { display: false },
      tooltip: { callbacks: { label: (c) => rupiah(c.parsed.y) } } },
    scales: {
      y: { ticks: { callback: (v) => 'Rp ' + v.toLocaleString('id-ID') },
           grid: { color: '#EAE7DD' }, beginAtZero: false },
      x: { grid: { display: false } } },
    maintainAspectRatio: false, // wrap canvas in a fixed-height container (~300px)
  }
});
```

### 5.2 Category mix — donut (Row 3 / Row 7)
- `type: 'doughnut'`, `cutout: '68%'`, custom **legend on top** (colored squares + labels, like the mockup — Chart.js default legend is fine if styled, or render your own chips).
- Palette (dark→light green, then beige for "Snack/Lainnya"): `['#14443A', '#2E8B68', '#4FC97F', '#E8E2D0']`.
- Thin white slice borders (`borderColor:'#fff', borderWidth:3`).

### 5.3 B2B price trend — multi-series line (Row 6, demo)
- Two datasets: `Minyak Goreng 1L` (red `#E5484D`, the rising line) and `Indomie Goreng` (green `#3DB85C`, flat). Same axis styling as 5.1 but legend **on top**.

---

## 6. Data contracts (feeds for each widget)

The dashboard is static HTML + JS that fetches JSON from the backend. Define these in
`routes/api.js` → `analyticsService` (Phase 8). Shapes below are the contract; the UI agent
can mock them first, the backend agent fills them.

```jsonc
// GET /api/dashboard/summary?period=today
{
  "omzet":   { "value": 487000, "deltaPct": 8, "vs": "kemarin" },
  "piutang": { "value": 345000, "overdueCount": 2 },
  "loyalty": { "count": 142, "newToday": 5 },
  "txnToday":{ "count": 38, "deltaPct": 12 }
}

// GET /api/dashboard/sales-trend?days=7
{ "labels": ["Sen","Sel","Rab","Kam","Jum","Sab","Min"],
  "values": [350000,380000,320000,410000,487000,520000,610000] }

// GET /api/dashboard/category-mix
[ { "category": "Sembako", "value": 42 }, { "category": "Rokok", "value": 28 },
  { "category": "Minuman", "value": 20 }, { "category": "Snack", "value": 10 } ]

// GET /api/dashboard/predictive-restock
[ { "name": "Sirup Marjan (Cocopandan)", "remaining": 2, "unit": "Botol",
    "daysToStockout": 3, "urgency": "urgent" },
  { "name": "Minyak Goreng 2L", "remaining": 4, "unit": "Pouch",
    "daysToStockout": 2, "urgency": "urgent" } ]

// GET /api/dashboard/credit-scores
[ { "name": "Budi", "debt": 145000, "lateNote": "Telat 3x bulan ini", "score": 32, "band": "risky" },
  { "name": "Andi", "debt": 210000, "lateNote": "Telat 1x bulan lalu", "score": 61, "band": "watch" } ]
```

**Rules:** only `status:"committed"` transactions feed these aggregations ([`DATA_MODEL.md`](./DATA_MODEL.md#4-data-integrity-rules)); the **Export Data** button is **Premium-gated** ([`PRD.md`](./PRD.md#5-monetization)); all money is integer IDR.

---

## 7. Responsive behavior

| Breakpoint | KPI row | 2-col widget rows | Charts |
|------------|---------|-------------------|--------|
| ≥1200px (desktop) | 4-up (or 3-up) | side-by-side 6\|6 | full height (~300px) |
| 768–1199px (tablet) | 2-up | side-by-side 6\|6 → stack if tight | maintain aspect, shrink |
| <768px (mobile) | 1-up stacked | stacked 12\|12 | fixed-height container, allow horizontal scroll if labels crowd |

Use Bootstrap's grid (`row` / `col-12 col-md-6 col-xl-4`) for the scaffolding; everything visual is your custom CSS over the tokens (do **not** ship default Bootstrap card/shadow styles — override them).

---

## 8. Build sub-phases (extends Phase 8)

Work these in order; each has a visible result.

| Step | Deliverable | Done when |
|------|-------------|-----------|
| **8a** | Shell: `tokens.css`, navbar, greeting bar, cream canvas, fonts loaded, 12-col grid | Empty layout renders pixel-close to the wireframe on desktop |
| **8b** | KPI cards wired to `/api/dashboard/summary` (mock JSON first) | 3–4 cards show formatted Rupiah + colored delta badges |
| **8c** | Sales-trend area chart + category donut (Chart.js, brand styling) | Both charts render with the exact palette and smooth curve |
| **8d** | List widgets: Predictive Restock + Behavioral Credit Scoring (with band-colored score badges) | Lists render with correct badges and hairline dividers |
| **8e** | Responsive pass + states: loading **skeletons**, **empty states**, number/date formatting | Looks right at mobile/tablet/desktop; no raw "undefined"/"NaN" |
| **8f** | *(post-MVP/demo)* B2B FMCG section behind `?view=b2b`, mock data, clearly labeled | Demo view tells the B2B story without faking it as live owner data |

Then connect the real `analyticsService` endpoints (backend, Phase 8) and remove mocks.

---

## 9. Quality bar (avoid "AI-slop" dashboards)

A reviewer / `/design-review` should be able to check these:

- [ ] **One** radius (`--r-card`) on all cards; **one** soft shadow. No mixed corner sizes.
- [ ] Consistent 24px card gap and 24px card padding everywhere (8px-grid spacing only).
- [ ] Numbers are the visual hero (28px/700); labels are small + muted. Hierarchy is obvious at a glance.
- [ ] Money always `Rp 487.000` (id-ID, dot separators, no decimals). Never `Rp487000.00`.
- [ ] Deltas/status are **pill badges** with semantic color (green good / amber watch / red liability), never bare colored text.
- [ ] Cream canvas + white cards + green navbar — the three-surface system is intact (don't make the page white).
- [ ] Copy is **Indonesian** and warung-native ("Selamat Pagi", "Piutang", "Sisa", "Est. Habis", "Telat 3x").
- [ ] Charts use the brand palette (no default Chart.js blue/orange); smooth `tension:0.4` line; donut `cutout:68%`.
- [ ] Real **empty states** ("Belum ada transaksi hari ini") and **loading skeletons**, not spinners-only or blank cards.
- [ ] Keyboard focus rings visible; text contrast ≥ 4.5:1 (muted ink on cream passes; verify badge text on tinted bg).
- [ ] B2B section is unmistakably labeled as B2B/demo — never presented as the owner's own live data.

---

## 10. Assets & libraries

| Asset | Source | Notes |
|-------|--------|-------|
| Plus Jakarta Sans | Google Fonts | weights 500/600/700/800 |
| Chart.js 4 | CDN (`cdn.jsdelivr.net/npm/chart.js@4`) | charts only |
| Bootstrap 5 | CDN | **grid + utilities only**; override default component styles |
| Icons | Lucide / Bootstrap Icons | line icons matching the clean reference |

Keep the page light (low-end phones, weak connections — same principle as the loyalty page in
[`WHATSAPP_INTEGRATION.md`](./WHATSAPP_INTEGRATION.md#7-loyalty-web-app-endpoints)). Defer/async non-critical JS;
the dashboard should be usable on a mid-range Android over 3G.

---

## 11. Related docs
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — where the dashboard sits (Analytics layer, `web/dashboard/`).
- [`DATA_MODEL.md`](./DATA_MODEL.md) — the collections behind every metric.
- [`PRD.md`](./PRD.md#f5--analytics-dashboard-web) — F5 acceptance criteria + Premium gating.
- [`PHASES.md`](./PHASES.md) — Phase 8 (this guide expands it into 8a–8f).
- [`CONVENTIONS.md`](./CONVENTIONS.md) — code standards for `web/dashboard/`.
