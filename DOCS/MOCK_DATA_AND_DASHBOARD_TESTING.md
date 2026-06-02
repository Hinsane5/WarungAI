# Mock Data & Dashboard / Flow Testing — WarungAI

**Version:** 1.0 · **Last updated:** 2026-06-02

How to verify the **whole app flow** — the GCP AI pipeline (input) and the dashboard
(output) — **without depending on WhatsApp**. This unblocks dashboard (Phase 8) work and
demo prep while the WhatsApp transport is still being sorted (Meta `130497` / n8n).

---

## 1. The key idea: the dashboard reads MongoDB, not WhatsApp

WhatsApp is just **one input channel**. The system is layered, and each layer is testable
on its own:

```
  INPUT (any of these)            PROCESSING            STORAGE            OUTPUT
 ┌─────────────────────┐
 │ WhatsApp (Meta/n8n) │─┐
 │ npm run sim         │─┼──► [GCP AI: Gemini + STT] ──► MongoDB ──► Dashboard (Phase 8)
 │ npm run seed        │─┘     (extraction, voice)      (data layer)   reads MongoDB only
 └─────────────────────┘
```

- The **dashboard never touches WhatsApp or GCP** — it runs **MongoDB aggregations**. If
  MongoDB has data, the dashboard works.
- So you can fill MongoDB **without WhatsApp** and verify both the AI flow *and* the
  dashboard.

> **"GCP" clarified.** Two different GCP touchpoints:
> 1. **AI pipeline** — Gemini (extraction) + Speech-to-Text (voice). Exercised by the
>    **simulator** path (real GCP calls). Already verified live.
> 2. **Analytics** — the dashboard uses **MongoDB aggregation** for the MVP; **no GCP**.
>    BigQuery + Looker is the *post-MVP* scale story only. So the dashboard needs **no GCP**.

---

## 2. Two ways to fill MongoDB without WhatsApp

| Path | Command | Exercises | Use it to… |
|------|---------|-----------|------------|
| **Simulator** | `npm run sim -- "<msg>" <number>` | The **real GCP AI pipeline** (Gemini, and STT for voice) + the full router/confirmation/commit flow | Verify the **input→output / GCP flow** end-to-end |
| **Seed** | `npm run seed` | Nothing AI — inserts realistic data directly | Instantly give the **dashboard** rich, deterministic data |

Both write to the same MongoDB the dashboard reads. Use the **simulator** to prove the
pipeline is correct; use the **seed** for fast, repeatable dashboard/UI work and demos.

---

## 3. Verify the GCP / input→output flow (simulator)

Prereqs: local DB up (`npm run db:start` + `npm run db:init` once) and the server running
(`GOOGLE_APPLICATION_CREDENTIALS= npm run dev` so STT uses ADC). Then:

```bash
# text → Gemini extraction → pending → confirm → committed
npm run sim -- "masuk 2 dus indomie, laku 1 galon aqua" 6281100001111
npm run sim -- "Y" 6281100001111

# kasbon → credit scoring
npm run sim -- "kasbon budi 2 rokok" 6281100001111
npm run sim -- "20000" 6281100001111          # if it asks for price

# inspect what the pipeline produced
npm run db:inspect
```

**What this proves (the "GCP thing"):**
- The message hit **Gemini** and came back as structured items (check the `Transaction.items`
  and `extractionConfidence` in `db:inspect`).
- The confirmation → **atomic commit** updated stock + cash (`status: "committed"`).
- For a **voice note**, send audio via the real WhatsApp/n8n path (or unit tests) — STT was
  already verified with `npm run check:stt`.

> The simulator signs a real Meta-shaped webhook and runs the *actual* code path, so a green
> result here means the pipeline (including GCP) is correct — independent of whether WhatsApp
> can *deliver* replies.

---

## 4. Seed realistic data for the dashboard

```bash
npm run seed
```

This wipes and recreates a demo shop **"Warung Bu Sri"** (slug `warung-demo`) with:
- **8 products** across categories (Sembako, Rokok, Minuman, Snack), including two **low-stock**
  items (Minyak Goreng 2L = 4, Sirup Marjan = 2) for the restock widget.
- **12 loyalty customers** (QR-registered, opted in) + a routine Aqua-Galon buyer.
- **~30 committed sales spread over the last 7 days** (rising toward today) for the trend chart.
- **Kasbon** for **Budi** (overdue 10d → `risky`) and **Andi** (overdue 4d → `watch`), with
  credit scores computed.

Re-run anytime — it's idempotent (clears the demo shop first). Inspect with `npm run db:inspect`.

---

## 5. The dashboard data contracts (verified against the seed)

The dashboard endpoints (Phase 8, see [`DASHBOARD_UI_GUIDE.md`](./DASHBOARD_UI_GUIDE.md#6-data-contracts))
are **MongoDB aggregations**. Each one already returns sensible data on the seed:

| Endpoint / widget | Aggregation shape | Seed result |
|-------------------|-------------------|-------------|
| `summary` (KPI) | sum today's committed `totalAmount`; count; open kasbon sum; loyalty count | omzet ~529k, 5 txns, piutang 355k (2), loyalty 14 |
| `sales-trend?days=7` | group committed sales by day (Asia/Jakarta) | `304k 260k 109k 249k 286k 448k 529k` |
| `category-mix` | unwind items → lookup product.category → sum lineTotal | Sembako · Rokok · Minuman · Snack |
| `predictive-restock` | products where `stock <= reorderPoint` | Minyak Goreng (4), Sirup Marjan (2) |
| `credit-scores` | customers with `creditScore.band ∈ {watch, risky}` | Budi risky, Andi watch |

> Only `status: "committed"` rows count (per [`DATA_MODEL.md`](./DATA_MODEL.md#4-data-integrity-rules)).
> Reference aggregation pipelines are in this repo's history / the dashboard guide.

---

## 6. End-to-end verification (no WhatsApp)

A full local loop you can run today:

```bash
# 1. database
npm run db:start          # terminal 1 (replica set)
npm run db:init           # once

# 2. data — pick one or both
npm run seed              # instant dashboard data
# and/or drive the real GCP pipeline:
GOOGLE_APPLICATION_CREDENTIALS= npm run dev   # terminal 2
npm run sim -- "masuk 2 dus indomie" 628100001111   # terminal 3
npm run sim -- "Y" 628100001111

# 3. batch/CRM flow (uses the seeded data)
npm run jobs:run          # predictive restock + credit refresh + RFM

# 4. inspect everything the dashboard will read
npm run db:inspect
```

When Phase 8 lands, step 4 becomes "open the dashboard in a browser" — it renders the same
data. Nothing here needs WhatsApp.

---

## 7. What this does and doesn't verify

| ✅ Verified without WhatsApp | ❌ Still needs real WhatsApp |
|------------------------------|------------------------------|
| GCP **Gemini** extraction (text) | Inbound message *delivery* from a real phone |
| GCP **Speech-to-Text** (`npm run check:stt`) | Outbound reply *delivery* to a customer |
| Full router → confirm → **atomic commit** | The on-phone UX / live demo |
| Kasbon + **credit scoring** | — |
| **Batch jobs** (restock, RFM, quota metering) | — |
| **Dashboard** rendering + all aggregations | — |

So the entire *application logic and GCP pipeline* is verifiable now. Only the WhatsApp
*delivery hop* depends on the transport (Meta verification or the n8n gateway), and that's
isolated behind the `messaging/` provider.

---

## 8. Related docs
- [`DASHBOARD_UI_GUIDE.md`](./DASHBOARD_UI_GUIDE.md) — the dashboard design + data contracts (Phase 8)
- [`MANUAL_TESTING.md`](./MANUAL_TESTING.md) — local run + the simulator
- [`N8N_INTEGRATION.md`](./N8N_INTEGRATION.md) — the WhatsApp transport workaround
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — the layered design this testing strategy relies on
