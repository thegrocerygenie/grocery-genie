# Deployment Guide

How to deploy Grocery Genie's backend on Hetzner VPS with Supabase PostgreSQL, and the iOS app via Expo EAS.

## Architecture Overview

```
┌─────────────┐     HTTPS      ┌──────────────────────────────────┐
│  iOS App    │ ──────────────▸│  Hetzner VPS                     │
│  (App Store)│                │                                  │
└─────────────┘                │  ┌────────────┐  ┌─────────────┐ │
                               │  │ Caddy      │  │ FastAPI     │ │
                               │  │ (reverse   │─▸│ (Uvicorn,   │ │
                               │  │  proxy+TLS)│  │  4 workers) │ │
                               │  └────────────┘  └──────┬──────┘ │
                               │                         │        │
                               │  ┌─────────────┐  ┌────▼──────┐  │
                               │  │ Celery Beat │  │ Redis     │  │
                               │  │ (scheduler) │─▸│ (broker)  │  │
                               │  └─────────────┘  └────┬──────┘  │
                               │                         │        │
                               │  ┌─────────────┐       │         │
                               │  │ Celery      │◂──────┘         │
                               │  │ Worker      │                 │
                               │  └──────┬──────┘                 │
                               └─────────┼────────────────────────┘
                                         │
                               ┌─────────▼────────────────────────┐
                               │  Supabase (managed)              │
                               │  PostgreSQL + pgvector           │
                               └──────────────────────────────────┘
```

**Services on Hetzner VPS (via Docker Compose):**
- Caddy (reverse proxy, automatic TLS)
- FastAPI app (Uvicorn, 4 workers)
- Celery Worker (receipt processing, notifications)
- Celery Beat (weekly summary scheduler)
- Redis (Celery broker + caching)

**External managed services:**
- Supabase PostgreSQL (database + pgvector for V1.1)
- Anthropic API (LLM receipt extraction)
- Apple App Store / TestFlight (iOS distribution)
- Expo EAS (iOS builds)

---

## Part 1: Backend on Hetzner VPS

### Prerequisites
- Hetzner VPS with Ubuntu 22.04+ (minimum 2 vCPU, 4GB RAM recommended)
- Docker and Docker Compose installed
- A domain name pointed to the VPS IP (e.g., api.grocerygenie.app)
- Supabase project with PostgreSQL database
- Anthropic API key

### 1.1 Project Structure for Deployment

The deploy files are in the repo:

```
docker/
  Dockerfile                # One image for the api, worker and beat services
  Dockerfile.dockerignore   # Keeps the build context to backend/ code
  docker-compose.yml        # All services
  Caddyfile                 # Reverse proxy and TLS
  .env.production.example   # Copy to .env.production (gitignored) and fill in
```

Run every `docker compose` command from the repo root with
`-f docker/docker-compose.yml`. Compose resolves the paths in that file from
`docker/`, and the file sets the project name to `grocery-genie`.

### 1.2 Dockerfile

[`docker/Dockerfile`](../docker/Dockerfile) installs the dependencies listed in
`backend/pyproject.toml` on `python:3.12-slim` and runs as a non-root user. Its
default command starts Uvicorn with 4 workers. Uvicorn trusts Caddy's
`X-Forwarded-For` header, so the per-IP auth rate limit sees the caller's
address.

### 1.3 Docker Compose

[`docker/docker-compose.yml`](../docker/docker-compose.yml) runs these services:

- `api`: FastAPI. It publishes no host port, so only Caddy reaches it.
- `worker`: Celery worker (receipt processing, push delivery).
- `beat`: Celery beat (weekly summaries, push queue every minute).
- `redis`: the Celery broker.
- `caddy`: the only service that publishes ports (80 and 443).

`api` and `worker` both mount the `receipt_images` volume at `/app/storage`.
`GG_STORAGE_PATH` must be that path (see 1.5).

### 1.4 Caddyfile

[`docker/Caddyfile`](../docker/Caddyfile) proxies `api.grocerygenie.app` to
`api:8000` and sets security headers. Change the host name if your domain is
different. Caddy gets and renews the TLS certificate from Let's Encrypt on its
own. Rate limiting is done in the app: the stock `caddy` image has no
`rate_limit` directive.

### 1.5 Environment Variables (.env.production)

```bash
# Settings reads only GG_-prefixed names (app/core/config.py, env_prefix="GG_").
# A name without the prefix is ignored, and the setting keeps its default.

# Database — Supabase connection string
# Get from: Supabase Dashboard → Settings → Database → Connection string → URI
# Use the "Session pooler" connection string for long-lived connections
GG_DATABASE_URL=postgresql+asyncpg://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres

# Redis — local container
GG_REDIS_URL=redis://redis:6379/0

# LLM — the app passes GG_LLM_API_KEY to LiteLLM as api_key.
GG_LLM_PROVIDER=anthropic
GG_LLM_MODEL=claude-sonnet-5-5
GG_LLM_API_KEY=sk-ant-...
# Leave GG_LLM_TEMPERATURE unset: Claude Sonnet 5.5 rejects any non-default value.

# App
# Signs access and refresh tokens. Startup fails if it is the dev default or
# shorter than 32 characters.
GG_JWT_SECRET=<generate with: python -c "import secrets; print(secrets.token_hex(32))">
# A JSON list. GG_DEBUG defaults to false, which is production mode.
GG_CORS_ORIGINS=["https://grocerygenie.app"]

# Image storage — must be the receipt_images volume mount (/app/storage) that
# the api and worker share. Any other path puts images on each container's own
# disk: a rebuild loses them, the backup misses them, and the purge task cannot
# delete them. Images are served only through authenticated API routes, so
# there is no public base URL to set.
GG_STORAGE_PATH=/app/storage

# Email — Resend. Startup fails without the key: the app sends verify and
# reset links only by email.
# The sender must be on a domain verified in Resend.
GG_RESEND_API_KEY=re_...
GG_RESEND_FROM=Grocery Genie <noreply@grocerygenie.app>

# Sign in with Apple — from Apple Developer → Certificates, IDs & Profiles → Keys
# (a key with Sign in with Apple enabled). The client ID is the iOS bundle ID.
GG_APPLE_TEAM_ID=<10-character Team ID>
GG_APPLE_KEY_ID=<10-character Key ID>
GG_APPLE_CLIENT_ID=com.grocerygenie.app
# The .p8 file contents on one line, in double quotes: join its lines with
# the two characters \n. Compose turns each \n back into a newline.
GG_APPLE_PRIVATE_KEY="<.p8 file lines joined with \n>"

# Sign in with Google — the app passes webClientId, so Google's ID tokens carry
# the web client ID as audience. Use the same value as the mobile build's
# EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID.
GG_GOOGLE_CLIENT_ID=<web client ID>.apps.googleusercontent.com

# Push notifications — sent through Expo's push service, which forwards to
# APNs. The APNs key is uploaded to EAS (see 2.2), not configured here.
# Set only if "Enhanced push security" is on for the Expo project:
# GG_EXPO_PUSH_ACCESS_TOKEN=
# Pending pushes older than this are dropped instead of sent late (default 60):
# GG_PUSH_MAX_AGE_MINUTES=60
```

[`docker/.env.production.example`](../docker/.env.production.example) holds
this block; a test checks that the two match. `.gitignore` excludes
`docker/.env.production`: never commit it.

### 1.6 Supabase PostgreSQL Setup

1. **Create a new Supabase project** (or use an existing one with a dedicated schema).

2. **Enable pgvector extension:**
   - Dashboard → Database → Extensions → search "vector" → Enable
   - Or run: `CREATE EXTENSION IF NOT EXISTS vector;`

3. **Get connection string:**
   - Dashboard → Settings → Database → Connection string
   - Use the **Session pooler** URI for SQLAlchemy async connections
   - Format: `postgresql+asyncpg://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres`

4. **Run migrations from your local machine or VPS:**
   ```bash
   # Set GG_DATABASE_URL to your Supabase connection string
   cd backend
   alembic upgrade head
   ```

The API seeds the default categories when it starts, so there is no seed step.

### 1.7 Deploy to Hetzner

```bash
# SSH into VPS
ssh root@your-vps-ip

# Clone repo
git clone https://github.com/your-username/grocery-genie.git
cd grocery-genie

# Create env file
cp docker/.env.production.example docker/.env.production
nano docker/.env.production  # Fill in all values

# Build and start
docker compose -f docker/docker-compose.yml up -d --build

# Verify
docker compose -f docker/docker-compose.yml ps
docker compose -f docker/docker-compose.yml logs api --tail=50

# Run migrations (first deploy only — or after model changes)
docker compose -f docker/docker-compose.yml exec api alembic upgrade head

# Verify API is responding
curl https://api.grocerygenie.app/health
```

### 1.8 Updating (Subsequent Deploys)

```bash
ssh root@your-vps-ip
cd grocery-genie
git pull origin main
docker compose -f docker/docker-compose.yml up -d --build
docker compose -f docker/docker-compose.yml exec api alembic upgrade head
```

For automated deploys, set up a GitHub Actions workflow that SSHs into the VPS and runs these commands on push to `main`.

### 1.9 Monitoring & Logs

```bash
# View all logs
docker compose -f docker/docker-compose.yml logs -f

# View specific service
docker compose -f docker/docker-compose.yml logs api -f
docker compose -f docker/docker-compose.yml logs worker -f

# Check resource usage
docker stats

# Redis health
docker compose -f docker/docker-compose.yml exec redis redis-cli ping
```

### 1.10 Backup Strategy

- **Database:** Supabase handles automatic daily backups (Pro plan includes point-in-time recovery).
- **Receipt images:** Set up a cron job on the VPS to sync the `receipt_images` volume to object storage (Hetzner Object Storage or S3):
  ```bash
  # Example: nightly sync to Hetzner Object Storage
  0 3 * * * rclone sync /var/lib/docker/volumes/grocery-genie_receipt_images/_data hetzner-s3:grocery-genie-receipts-backup
  ```
- **Redis:** Ephemeral by design (Celery broker). No backup needed — tasks are retried on failure.

---

## Part 2: iOS App via Expo EAS

### Prerequisites
- Apple Developer Program membership ($99/year)
- Expo account (free at expo.dev)
- App entry created in App Store Connect

### 2.1 Initial Setup

```bash
cd mobile

# Install EAS CLI
npm install -g eas-cli

# Log in to Expo
eas login

# Configure EAS for the project
eas build:configure
```

This creates `eas.json`. Update it:

```json
{
  "cli": {
    "version": ">= 16.0.0",
    "appVersionSource": "local"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": {
        "simulator": true
      }
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {
      "ios": {
        "image": "latest"
      }
    }
  },
  "submit": {
    "production": {
      "ios": {
        "ascAppId": "YOUR_APP_STORE_CONNECT_APP_ID"
      }
    }
  }
}
```

### 2.2 Push Notifications

The backend sends budget alerts and weekly summaries through Expo's push
service. The `beat` service queues delivery every minute and the `worker`
sends it, so both must run. Set up once:

1. Link the app to an EAS project. This writes `extra.eas.projectId` into
   `app.json`, which the app needs to get a push token:

   ```bash
   cd mobile
   eas init
   ```

2. Give Expo an APNs key. Either let EAS create one when it asks during the
   first `eas build`, or upload an existing key:

   ```bash
   eas credentials
   ```

   Choose iOS → your build profile → Push Notifications → set up a push key.

3. Optional: in the Expo dashboard, turn on Enhanced push security and set
   `GG_EXPO_PUSH_ACCESS_TOKEN` on the backend to the access token it gives.

4. Test on a **physical device** with a development or TestFlight build.
   Expo Go and simulator builds can't get a push token. The app asks for
   notification permission after sign-in, registers the token with
   `POST /api/users/me/push-tokens`, and unregisters it on sign-out.

Notification text (spend amounts, category names) passes through Expo's
servers on the way to Apple.

### 2.3 Configure API URL

In `mobile/src/constants/config.ts` (or `app.config.js`):

```typescript
const API_URL = __DEV__
  ? "http://localhost:8000"
  : "https://api.grocerygenie.app";
```

For EAS builds, set the production API URL as an environment variable:

```bash
eas secret:create --name API_URL --value https://api.grocerygenie.app --type string
```

### 2.4 Build for TestFlight (Internal Testing)

```bash
# Build production iOS binary
eas build --platform ios --profile production

# Submit to TestFlight
eas submit --platform ios

# Or combine both:
eas build --platform ios --profile production --auto-submit
```

EAS handles signing credentials automatically. On first run, it will prompt you to log into your Apple Developer account and generate the required certificates and provisioning profiles.

### 2.5 TestFlight Distribution

After EAS Submit uploads the binary:
1. Log into App Store Connect
2. Navigate to your app → TestFlight
3. Build appears after ~10-15 minutes of Apple processing
4. Add internal testers (your Apple ID and any team members)
5. Testers receive a TestFlight invite and can install the app

### 2.6 App Store Submission

When ready for public release:
1. In App Store Connect, fill in app metadata: description, keywords, screenshots, privacy policy URL
2. Select the TestFlight build to submit
3. Click "Submit for Review"
4. Apple review typically takes 1-3 days

### 2.7 Over-the-Air Updates (Post-Launch)

For non-native code changes (JS bundle updates), use EAS Update to push updates without a full App Store review:

```bash
# Push an OTA update to production
eas update --branch production --message "Bug fix for budget calculation"
```

This updates the JS bundle for all users on the production channel. Native code changes (new native modules, SDK version bumps) still require a full build + App Store review.

### 2.8 CI/CD with GitHub Actions

Create `.github/workflows/deploy-ios.yml`:

```yaml
name: Deploy iOS
on:
  workflow_dispatch:  # Manual trigger only

jobs:
  build-and-submit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22.x
          cache: npm
          cache-dependency-path: mobile/package-lock.json
      - uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}
      - run: cd mobile && npm ci
      - run: cd mobile && eas build -p ios --profile production --non-interactive
      - run: cd mobile && eas submit -p ios --profile production --latest --non-interactive
```

Set `EXPO_TOKEN` in GitHub repository secrets (generate at expo.dev → Account Settings → Access Tokens).

---

## Part 3: Cost Estimate

| Service | Cost | Notes |
|---------|------|-------|
| Hetzner VPS (CX22 or CX32) | €4-8/month | 2-4 vCPU, 4-8GB RAM. Already paying for this. |
| Supabase PostgreSQL (Free/Pro) | $0-25/month | Free tier: 500MB. Pro: 8GB, $25/month. |
| Anthropic API | ~$50-200/month | Depends on receipt volume. ~$0.003-0.01 per receipt with Sonnet. |
| Apple Developer Program | $99/year (~$8/month) | Required for App Store. |
| Expo EAS (Free tier) | $0 | 15 iOS builds/month. Sufficient for MVP. |
| Domain name | ~$12/year | For api.grocerygenie.app |
| **Total** | **~$65-250/month** | Before revenue. Lower end if using Supabase free tier. |

---

## Part 4: Pre-Launch Checklist

### Backend
- [ ] Docker Compose builds and starts cleanly on VPS
- [ ] Caddy serves HTTPS with valid certificate
- [ ] API health check returns 200 at `https://api.grocerygenie.app/health`
- [ ] Alembic migrations run successfully against Supabase
- [ ] Default categories seeded
- [ ] Celery worker processes a test receipt extraction
- [ ] Celery Beat fires on schedule (check with `docker logs`)
- [ ] CORS configured to allow requests from the iOS app
- [ ] Rate limiting active
- [ ] Receipt image upload and retrieval working

### Mobile
- [ ] Production build succeeds via EAS Build
- [ ] App connects to production API URL
- [ ] TestFlight build installs and runs on physical device
- [ ] Camera capture works on physical device
- [ ] History → "Choose from Library" imports a HEIC photo, and "Choose Files" imports a single-page PDF, both reaching the review screen with the image shown
- [ ] Receipt extraction returns results from production API
- [ ] Budget dashboard loads with real data
- [ ] Push notification permission requested after sign-in
- [ ] `app.json` has `extra.eas.projectId` and EAS has an APNs push key
- [ ] A budget alert arrives as a push on a physical device; tapping it opens the dashboard

### Supabase
- [ ] pgvector extension enabled (for future V1.1 use)
- [ ] Connection pooling configured (Session pooler)
- [ ] Database backups verified (Supabase dashboard → Backups)
- [ ] Row Level Security policies if using Supabase auth (optional for MVP — app uses its own auth)

### Security
- [ ] `.env.production` is NOT in the git repo
- [ ] API key rotation plan documented
- [ ] VPS firewall: only ports 80, 443, and SSH (22) open
- [ ] SSH key-only authentication (disable password login)
- [ ] Docker containers run as non-root user
- [ ] Supabase database password is strong and unique
