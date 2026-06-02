# Deployment — Cloud Run + Cloud Scheduler

**Version:** 1.0 · **Last updated:** 2026-06-02

How to deploy WarungAI to **Google Cloud Run** and run the nightly batch via **Cloud
Scheduler**. Deploying also gives you a **stable public URL**, which simultaneously unblocks
the WhatsApp webhook and Cloud Scheduler (both need a reachable HTTPS endpoint).

> The **code is already deploy-ready:** a `Dockerfile`, a secured `POST /jobs/run-nightly`
> trigger endpoint, and `PORT`-aware config. This doc is the infra you provision.

---

## What deploying unlocks

| Before (local) | After (Cloud Run) |
|----------------|-------------------|
| Cloud Scheduler can't reach `localhost` | Scheduler → `https://…run.app/jobs/run-nightly` ✅ |
| WhatsApp webhook needs a flaky tunnel | Stable HTTPS webhook URL ✅ |
| `node-cron` (dies when laptop sleeps) | Cloud Scheduler (reliable, managed) ✅ |
| Local MongoDB | MongoDB Atlas (managed, reachable from Cloud Run) ✅ |

---

## Prerequisites
- `gcloud` installed + authenticated (you have this), project `warungai-498004`, billing on.
- Enable the APIs:
  ```bash
  gcloud services enable run.googleapis.com cloudscheduler.googleapis.com \
    cloudbuild.googleapis.com artifactregistry.googleapis.com --project=warungai-498004
  ```

---

## Step 1 — MongoDB Atlas (Cloud Run can't reach local Mongo)

1. Create a free **M0 cluster** at <https://cloud.mongodb.com> (pick the GCP `asia-southeast2` / Jakarta region to match your data).
2. **Database Access** → add a DB user (username + strong password).
3. **Network Access** → for the MVP, *Allow access from anywhere* (`0.0.0.0/0`).
   - ⚠️ This is acceptable for a demo with a strong password, but **not production**. The production path is a **VPC connector** on Cloud Run + Atlas private endpoint/peering.
4. Copy the **connection string** (SRV):
   `mongodb+srv://<user>:<password>@<cluster>/warungai?retryWrites=true&w=majority`
5. (Optional) Seed it: `MONGODB_URI="<atlas-uri>" npm run seed`.

---

## Step 2 — Deploy to Cloud Run

Pick a strong jobs secret first:
```bash
JOBS_SECRET="warungai-jobs-$(openssl rand -hex 16)"
echo "$JOBS_SECRET"   # save it — Cloud Scheduler uses it in Step 3
```

Deploy from source (Cloud Build containerizes via the `Dockerfile`):
```bash
gcloud run deploy warungai \
  --source . \
  --project=warungai-498004 \
  --region=asia-southeast2 \
  --allow-unauthenticated \
  --set-env-vars="NODE_ENV=production,\
PUBLIC_BASE_URL=https://PLACEHOLDER,\
MONGODB_URI=<your-atlas-uri>,\
GCP_PROJECT_ID=warungai-498004,\
GEMINI_API_KEY=<your-gemini-key>,\
WHATSAPP_PROVIDER=n8n,\
N8N_OUTBOUND_URL=<n8n-url>,N8N_OUTBOUND_SECRET=<x>,N8N_INBOUND_SECRET=<y>,\
WHATSAPP_TOKEN=unused,WHATSAPP_PHONE_NUMBER_ID=unused,WHATSAPP_VERIFY_TOKEN=unused,WHATSAPP_APP_SECRET=unused,\
CRM_JOBS_ENABLED=false,\
BIGQUERY_ENABLED=true,\
JOBS_TRIGGER_SECRET=$JOBS_SECRET"
```
Then take the service URL it prints and set `PUBLIC_BASE_URL` to it:
```bash
URL=$(gcloud run services describe warungai --region=asia-southeast2 --format='value(status.url)')
gcloud run services update warungai --region=asia-southeast2 --update-env-vars="PUBLIC_BASE_URL=$URL"
```

**Key env choices:**
- `CRM_JOBS_ENABLED=false` — disable in-process `node-cron` (Cloud Run scales to zero, so cron is unreliable). **Cloud Scheduler runs the jobs instead.**
- `BIGQUERY_ENABLED=true` — nightly export runs as part of the batch.
- `GOOGLE_APPLICATION_CREDENTIALS` is left unset → on Cloud Run, ADC = the service's **service account**.

**Grant the Cloud Run service account the GCP roles it needs** (Speech-to-Text + BigQuery), since it's no longer your user ADC:
```bash
SA=$(gcloud run services describe warungai --region=asia-southeast2 --format='value(spec.template.spec.serviceAccountName)')
# (defaults to the compute SA if you didn't set one)
gcloud projects add-iam-policy-binding warungai-498004 --member="serviceAccount:$SA" --role="roles/bigquery.dataEditor"
gcloud projects add-iam-policy-binding warungai-498004 --member="serviceAccount:$SA" --role="roles/bigquery.jobUser"
```
(Speech-to-Text v1 works for any project SA once the API is enabled; add `roles/serviceusage.serviceUsageConsumer` if you hit a quota-project error.)

> **Secrets:** for the MVP we pass secrets as env vars. For production, store `MONGODB_URI`,
> `GEMINI_API_KEY`, `JOBS_TRIGGER_SECRET`, etc. in **Secret Manager** and reference them with
> `--set-secrets` instead of `--set-env-vars`.

---

## Step 3 — Cloud Scheduler (the nightly trigger)

```bash
gcloud scheduler jobs create http warungai-nightly \
  --project=warungai-498004 \
  --location=asia-southeast2 \
  --schedule="0 1 * * *" \
  --time-zone="Asia/Jakarta" \
  --uri="$URL/jobs/run-nightly" \
  --http-method=POST \
  --headers="x-warungai-jobs-secret=$JOBS_SECRET" \
  --attempt-deadline=600s
```
Test it immediately (don't wait for 1 AM):
```bash
gcloud scheduler jobs run warungai-nightly --location=asia-southeast2
# then check logs:
gcloud run services logs read warungai --region=asia-southeast2 --limit=20
```
You should see `nightly jobs finished` with the restock/credit/crm/bigquery summary.

> **Hardening (optional, GCP-native):** instead of the shared-secret header, deploy Cloud Run
> **without** `--allow-unauthenticated` and have Scheduler authenticate with an **OIDC token**
> (`--oidc-service-account-email=…`). Then only Scheduler (and authorized callers) can invoke it.

---

## Step 4 — Point WhatsApp at the deployed URL
- **n8n transport:** set the n8n inbound HTTP node to `https://…run.app/integrations/whatsapp/inbound`.
- **Meta Cloud API:** set the webhook callback to `https://…run.app/webhook` (once your account is verified).

The stable HTTPS URL means no more tunnels.

---

## Verify the deploy
```bash
curl -s "$URL/health"                         # {"status":"ok","db":"connected"}
curl -s "$URL/dashboard?token=<dashboardToken>" -o /dev/null -w "%{http_code}\n"   # 200
curl -s -X POST "$URL/jobs/run-nightly" -H "x-warungai-jobs-secret: $JOBS_SECRET"  # runs the batch
```

---

## Cost & operational notes
- **Cloud Run** scales to zero — you pay only per request/CPU-second. A demo costs ~nothing.
- **Cloud Scheduler** — 3 free jobs/month.
- **Atlas M0** — free.
- **node-cron stays for local dev** (`CRM_JOBS_ENABLED=true` locally); it's only disabled in the deployed env where Scheduler takes over. The jobs themselves are unchanged — that's the seam from [`ARCHITECTURE.md`](./ARCHITECTURE.md#8-production-evolution-post-mvp-seams).

---

## Related docs
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — the node-cron → Cloud Scheduler seam
- [`TECH_STACK.md`](./TECH_STACK.md) — env vars
- [`N8N_INTEGRATION.md`](./N8N_INTEGRATION.md) — WhatsApp transport
- [`MANUAL_TESTING.md`](./MANUAL_TESTING.md) — local equivalents (`npm run jobs:run`)
