# DragonFruit — Production Deployment Guide

A pragmatic walkthrough for getting DragonFruit running in production. This is a forked Plane stack, so it's **not** a single Vercel deploy — there's a Django API and a HocusPocus realtime server that need long-running hosts. The frontend deploys cleanly to Vercel; the backend services go to a container host (Railway, Fly.io, or Render).

Skim the [Architecture](#architecture-at-a-glance) section first, then jump to the service you care about.

---

## Architecture at a glance

| Service                 | Path             | What it is                                       | Where it deploys                              |
| ----------------------- | ---------------- | ------------------------------------------------ | --------------------------------------------- |
| **`web`**               | `apps/web`       | React Router v7 + Vite + MobX (the main UI)      | **Vercel** (static + SSR)                     |
| **`admin`**             | `apps/admin`     | Next.js instance-admin panel                     | **Vercel** (separate project)                 |
| **`space`**             | `apps/space`     | Public publishing app (issue & page sharing)     | **Vercel** (separate project)                 |
| **`api`**               | `apps/api`       | Django REST + Celery workers                     | **Container host** (Railway / Fly / Render)   |
| **`live`**              | `apps/live`      | HocusPocus realtime collab server (Node)         | **Container host** with sticky sessions       |
| **`proxy`**             | `apps/proxy`     | Nginx reverse proxy (optional in cloud)          | Skip if your CDN handles routing              |
| **Postgres**            | —                | Primary store                                    | Neon / Supabase / managed Postgres            |
| **Redis**               | —                | Celery broker + cache + HocusPocus sync          | Upstash / managed Redis                       |
| **Object storage**      | —                | Uploads, attachments, avatars                    | S3 / R2 / GCS (S3-compatible API)             |
| **Email**               | —                | Transactional (invites, notifications, magic links) | Resend / Postmark / SES                    |

Why not put everything on Vercel? Django needs a long-running process for Celery + websockets; HocusPocus is stateful and needs sticky connections. Vercel Functions are great for the frontend but not the right primitive for either.

---

## Prerequisites

- A GitHub repo for this fork (you have one).
- A Vercel account (or team) for the frontends.
- A Railway / Fly.io / Render account for the API + live server. I'll use **Railway** in the examples because it's the lowest-friction; the same recipe works on Fly with `fly.toml` and on Render with their dashboard.
- A managed Postgres (recommend **Neon** — generous free tier, branchable databases).
- A managed Redis (recommend **Upstash** — free tier, edge-friendly).
- An S3-compatible bucket (recommend **Cloudflare R2** — no egress fees).
- A domain you control with DNS access.

---

## Step 1 — Provision the data layer

Do this first; everything else needs these URLs.

### Postgres (Neon)

1. Create a Neon project, region close to where your API will run.
2. Create a database `dragonfruit_prod` (or whatever).
3. Copy the connection string. You'll see two flavors:
   - Pooled (for app queries): `postgres://...neon.tech/dragonfruit_prod?sslmode=require&channel_binding=require`
   - Direct (for migrations): same URL without `-pooler`.
4. Keep both — Django uses the direct URL for `migrate`, pooled for runtime.

### Redis (Upstash)

1. Create an Upstash Redis database, same region as Neon.
2. Copy the **Redis URL** (the `redis://default:...` one, not the REST URL — Plane uses the protocol-level client).
3. Note that you'll use this URL for **both** Celery and the HocusPocus collab server.

### Object storage (Cloudflare R2)

1. Create an R2 bucket called `dragonfruit-uploads-prod`.
2. Generate an API token with read/write on this bucket. Save the `accessKeyId` and `secretAccessKey`.
3. Note your account ID and the S3-compatible endpoint: `https://<account-id>.r2.cloudflarestorage.com`.
4. Configure CORS on the bucket so the web app can upload directly:
   ```json
   [{
     "AllowedOrigins": ["https://app.yourdomain.com"],
     "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],
     "AllowedHeaders": ["*"],
     "ExposeHeaders": ["ETag"]
   }]
   ```

---

## Step 2 — Deploy the API (Django)

The API is the heaviest service. It needs the Django web process, a Celery worker, and Celery Beat (scheduler) — three processes against the same codebase.

### On Railway

1. **New Project → Deploy from GitHub repo**, pick your DragonFruit fork.
2. In the new service settings, set the **Root Directory** to `apps/api`.
3. Override the **Build command** to use the existing Dockerfile (Railway auto-detects). The image is multi-stage; default builder works.
4. Set environment variables (the important ones — there are more, search `os.environ` in `apps/api/plane/settings/` if you need to be exhaustive):

   ```bash
   # Database
   DATABASE_URL=<neon-pooled-url>
   PGSSLMODE=require

   # Redis
   REDIS_URL=<upstash-redis-url>
   CACHE_URL=<upstash-redis-url>

   # Storage
   AWS_S3_ENDPOINT_URL=https://<account-id>.r2.cloudflarestorage.com
   AWS_ACCESS_KEY_ID=<r2-key-id>
   AWS_SECRET_ACCESS_KEY=<r2-secret>
   AWS_S3_BUCKET_NAME=dragonfruit-uploads-prod
   AWS_REGION=auto
   USE_MINIO=0

   # App
   SECRET_KEY=<generate with: python -c "import secrets; print(secrets.token_urlsafe(64))">
   DEBUG=0
   DJANGO_SETTINGS_MODULE=plane.settings.production
   WEB_URL=https://app.yourdomain.com
   ALLOWED_HOSTS=api.yourdomain.com
   CORS_ALLOWED_ORIGINS=https://app.yourdomain.com,https://space.yourdomain.com

   # Email
   EMAIL_HOST=smtp.resend.com
   EMAIL_HOST_USER=resend
   EMAIL_HOST_PASSWORD=<resend-api-key>
   EMAIL_PORT=465
   EMAIL_USE_TLS=1
   EMAIL_FROM=DragonFruit <noreply@yourdomain.com>
   ```

5. **Migrations**: run once via Railway's one-off shell:
   ```bash
   python manage.py migrate
   python manage.py createsuperuser  # if you want a Django admin login
   ```
6. **Add a worker service** in the same Railway project, same repo, same root directory. Override the start command to:
   ```bash
   celery -A plane worker -l info --concurrency=2
   ```
7. **Add a beat service** (the scheduler), start command:
   ```bash
   celery -A plane beat -l info --scheduler django_celery_beat.schedulers:DatabaseScheduler
   ```
8. Add a **public domain** to the web service: `api.yourdomain.com`.

> **Memory & concurrency**: Django web at 512 MB / 1 vCPU is fine for small workspaces. Celery worker concurrency=2 is conservative; bump if you see queue backups. Beat is single-instance — never scale it horizontally.

### Why three services?

Web handles HTTP. Worker handles background jobs (search indexing, webhook delivery, exports). Beat schedules periodic jobs (cleanup, digests). Splitting them lets you scale and observe each independently, and a long-running worker job can't pin the request thread.

---

## Step 3 — Deploy the realtime collab server (`live`)

DragonFruit uses HocusPocus for collaborative editing on pages and docs. It's a Node server that talks to Redis for cross-instance state and Postgres for persistence.

### On Railway

1. **New service** in the same project, same repo, root directory `apps/live`.
2. Build command: `pnpm install --filter=live --frozen-lockfile && pnpm --filter=live build`.
3. Start command: `node apps/live/dist/server.js` (or whatever the live app's `package.json` start script resolves to — check it).
4. Environment:

   ```bash
   PORT=3100
   DATABASE_URL=<neon-pooled-url>
   REDIS_URL=<upstash-redis-url>
   API_BASE_URL=https://api.yourdomain.com
   ```

5. Add a public domain: `live.yourdomain.com`.
6. **Sticky sessions**: Railway routes WebSocket upgrades cleanly. If you go to Fly.io instead, enable `--ha=false` or use a single region until you need to scale; multi-region HocusPocus needs the Redis adapter (already configured).

> **Don't put `live` on Vercel.** Vercel Functions kill long-lived connections.

---

## Step 4 — Deploy the frontends to Vercel

This is the bit where things get cushy.

### `apps/web` (main UI)

1. **New Project on Vercel → Import** your GitHub fork.
2. In the import dialog:
   - **Root Directory**: `apps/web`
   - **Framework Preset**: `Vite` (Vercel detects React Router v7's `react-router-serve`; if not, choose "Other" and override the build command below).
   - **Build Command**: `pnpm --filter=web build`
   - **Output Directory**: `apps/web/build/client`
   - **Install Command**: `pnpm install --frozen-lockfile`
3. Environment variables (set for `Production`, `Preview`, and `Development`):

   ```bash
   VITE_API_BASE_URL=https://api.yourdomain.com
   VITE_LIVE_BASE_URL=https://live.yourdomain.com
   VITE_SPACE_BASE_URL=https://space.yourdomain.com
   VITE_ADMIN_BASE_URL=https://admin.yourdomain.com
   ```

4. Add the production domain: `app.yourdomain.com`.
5. Deploy. First build will run the monorepo install — give it ~3 minutes.

### `apps/admin`

Same recipe with Root Directory `apps/admin`, Framework `Next.js`, domain `admin.yourdomain.com`. Same env vars apply.

### `apps/space`

Same recipe with Root Directory `apps/space`, Framework `Next.js`, domain `space.yourdomain.com`.

> **Heads-up on monorepo builds**: Vercel's `pnpm install` honors the workspace catalog and builds the dependent packages first. If a build mysteriously fails on `@plane/editor` or `@plane/ui`, it's usually because the workspace root's `pnpm-workspace.yaml` is missing from the deploy — make sure **Root Directory** is `apps/web` (not the monorepo root), and Vercel will walk up to find it automatically.

---

## Step 5 — Wire up DNS

For `yourdomain.com` (managed in Cloudflare, Route53, or wherever):

```
app.yourdomain.com    CNAME  cname.vercel-dns.com        ; web
admin.yourdomain.com  CNAME  cname.vercel-dns.com        ; admin
space.yourdomain.com  CNAME  cname.vercel-dns.com        ; space
api.yourdomain.com    CNAME  <railway-or-fly-domain>     ; api
live.yourdomain.com   CNAME  <railway-or-fly-domain>     ; live
```

Then go back to Vercel/Railway and **add the domain** in each project's settings so they can issue TLS certificates.

---

## Step 6 — First-run sanity checks

In order:

1. `https://api.yourdomain.com/api/instances/` — should return JSON (a bootstrap response or 401 — anything other than 502/504 means Django is up).
2. `https://app.yourdomain.com/` — loads the auth screen.
3. Sign up the first user. They become the workspace owner.
4. Create a workspace. Watch the API logs — the worker should pick up a few onboarding jobs.
5. Create a doc. Open it in two browser windows. Type in one — the other should update in real time. **If it doesn't, the `live` service or its Redis URL is wrong.**
6. Upload an image to a comment. **If upload fails, R2 CORS or credentials are wrong.**

---

## Step 7 — Production hardening

Things that are easy to skip and painful to add later.

### Backups

- **Postgres**: Neon does point-in-time recovery on paid plans. On free, dump nightly:
  ```bash
  pg_dump $DATABASE_URL | gzip > backups/db-$(date +%F).sql.gz
  ```
  Schedule this on Railway as a Cron service or in GitHub Actions.
- **R2**: enable bucket versioning. Lifecycle rule: keep noncurrent versions 30 days.

### Monitoring

- **Sentry** for both API (Python SDK) and web (browser SDK). Errors here are unforgiving; you want stack traces before users tell you.
- **Vercel Analytics** for Core Web Vitals on the frontends. The perf work in this fork specifically targets list/scroll perf — verify it in production with real data.
- **Railway logs** + Datadog/Logtail for the API. Aggregate Celery worker logs; backpressure is usually the first sign of trouble.

### Rate limiting

The API has Django middleware for rate limits (search `RATELIMIT` in `apps/api/plane/settings/`). Default values are conservative but tune for your traffic.

### Auth secrets rotation

`SECRET_KEY` change invalidates every active session. Plan for a maintenance window. Worth doing every 6 months or after any suspected leak.

---

## CI / CD

Vercel auto-deploys on push to your main branch (preview deploys per PR). Railway does the same with its GitHub integration.

A minimal GitHub Actions check before merge — type-check + lint — lives well in `.github/workflows/`. The web app already has `pnpm check:types`; wire it up:

```yaml
name: CI
on: [pull_request]
jobs:
  web:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 10 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter=web check:types
      - run: pnpm --filter=web check:lint
```

---

## Cost estimate (USD, monthly)

For a workspace under 50 users, < 100k issues:

| Service               | Tier              | Cost     |
| --------------------- | ----------------- | -------- |
| Vercel (3 projects)   | Pro for one team  | $20      |
| Railway (api + live)  | Hobby + small DB  | $20–40   |
| Neon Postgres         | Launch tier       | $19      |
| Upstash Redis         | Pay-as-you-go     | $5–10    |
| Cloudflare R2         | Storage + ops     | $5       |
| Resend (email)        | First 3k free     | $0       |
| Sentry                | Team              | $26      |
| Domain + DNS          | (you have it)     | —        |
| **Total**             |                   | **~$95–120** |

Scaling north of that: bigger Celery worker, Postgres compute boost, and CDN if you put many docs/images. The expensive line is usually Postgres CPU once your search/activity-feed traffic ramps.

---

## Rollback recipe

If a deploy breaks production:

1. **Frontend** (Vercel): hit "Promote previous deployment" on the project's Deployments tab. Sub-second cutover.
2. **API** (Railway): the Deployments tab has a "Redeploy" on every prior image. Picks the previous image; tear-down + start ≈ 90 s.
3. **Database**: avoid rolling back. If a migration is bad, write a forward fix.

---

## What's NOT covered here

- **Self-hosted full-stack on a single VM**: there's a `docker-compose.yml` at the repo root for that. Useful for staging but not what this guide is about.
- **Kubernetes**: if you're running this at K8s scale, the platform docs are better than what I can put here.
- **Air-gapped / on-prem**: the Plane upstream has a community guide; the broad strokes apply.
- **Multi-region**: the API is region-pinned by Postgres latency. HocusPocus could go multi-region via the Redis adapter but you'd want to validate latency end-to-end first.

---

## Troubleshooting cheat sheet

| Symptom                                          | First thing to check                                       |
| ------------------------------------------------ | ---------------------------------------------------------- |
| Frontend loads, login does nothing               | `CORS_ALLOWED_ORIGINS` on the API includes the web origin  |
| Doc editor freezes for one user only             | `live.yourdomain.com` reachable from their network         |
| Image upload silently fails                      | R2 CORS rule lacks the production origin                   |
| Background jobs not running                      | Celery **beat** service crashed (not just worker)          |
| API returns 502 intermittently                   | Postgres connection pool exhausted — switch to pooled URL  |
| Mention search / autocomplete returns no results | API container missing search-index env vars                |
| Vercel build fails on `@plane/editor`            | Root Directory set wrong, or pnpm version mismatch         |

When in doubt: `railway logs` on each service in chronological order tells you exactly where the request died.
