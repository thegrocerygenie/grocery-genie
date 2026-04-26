# Deployment Guide

How to deploy Grocery Genie's backend on Hetzner VPS with Supabase PostgreSQL, and the iOS app via Expo EAS.

## Architecture Overview

```
┌─────────────┐     HTTPS      ┌──────────────────────────────────┐
│  iOS App    │ ──────────────▸│  Hetzner VPS                     │
│  (App Store)│                │                                  │
└─────────────┘                │  ┌────────────┐  ┌─────────────┐ │
                               │  │ Caddy      │  │ FastAPI     │ │
                               │  │ (reverse   │─▸│ (Gunicorn + │ │
                               │  │  proxy+TLS)│  │  Uvicorn)   │ │
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
- FastAPI app (Gunicorn + Uvicorn workers)
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

Add these files to the repo root:

```
docker/
  Dockerfile           # Multi-stage build for FastAPI + Celery
  docker-compose.yml   # All services
  Caddyfile            # Reverse proxy config
  .env.production      # Environment variables (DO NOT commit)
```

### 1.2 Dockerfile

```dockerfile
FROM python:3.12-slim AS base

WORKDIR /app

# System dependencies for OpenCV and psycopg
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    gcc libpq-dev libgl1 libglib2.0-0 && \
    rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

# Default: run FastAPI
CMD ["gunicorn", "main:app", "-w", "4", "-k", "uvicorn.workers.UvicornWorker", "--bind", "0.0.0.0:8000"]
```

### 1.3 Docker Compose

```yaml
version: "3.8"

services:
  api:
    build:
      context: .
      dockerfile: docker/Dockerfile
    env_file: docker/.env.production
    ports:
      - "8000:8000"
    depends_on:
      - redis
    restart: unless-stopped
    volumes:
      - receipt_images:/app/storage  # Receipt image storage

  worker:
    build:
      context: .
      dockerfile: docker/Dockerfile
    command: celery -A app.tasks worker --loglevel=info --concurrency=2
    env_file: docker/.env.production
    depends_on:
      - redis
    restart: unless-stopped
    volumes:
      - receipt_images:/app/storage

  beat:
    build:
      context: .
      dockerfile: docker/Dockerfile
    command: celery -A app.tasks beat --loglevel=info
    env_file: docker/.env.production
    depends_on:
      - redis
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - redis_data:/data

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./docker/Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config

volumes:
  receipt_images:
  redis_data:
  caddy_data:
  caddy_config:
```

### 1.4 Caddyfile

```
api.grocerygenie.app {
    reverse_proxy api:8000
    encode gzip

    header {
        # Security headers
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        Referrer-Policy strict-origin-when-cross-origin
    }

    # Rate limiting (basic — app-level rate limiting is also enforced)
    rate_limit {
        zone api {
            key {remote_host}
            events 300
            window 1m
        }
    }
}
```

Caddy handles automatic HTTPS certificate provisioning via Let's Encrypt. No manual TLS configuration needed.

### 1.5 Environment Variables (.env.production)

```bash
# Database — Supabase connection string
# Get from: Supabase Dashboard → Settings → Database → Connection string → URI
# Use the "Session pooler" connection string for long-lived connections
DATABASE_URL=postgresql+asyncpg://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres

# Redis — local container
REDIS_URL=redis://redis:6379/0

# LLM
ANTHROPIC_API_KEY=sk-ant-...
GG_LLM_MODEL=claude-sonnet-4-20250514
GG_LLM_TEMPERATURE=0

# App
SECRET_KEY=<generate with: python -c "import secrets; print(secrets.token_hex(32))">
ALLOWED_ORIGINS=https://grocerygenie.app
ENVIRONMENT=production

# Image storage
STORAGE_PATH=/app/storage
STORAGE_BASE_URL=https://api.grocerygenie.app/static/receipts

# Notifications (configure when push delivery is implemented)
# APNS_KEY_ID=
# APNS_TEAM_ID=
# APNS_AUTH_KEY_PATH=
```

**Important:** Never commit `.env.production`. Add it to `.gitignore`.

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
   # Set DATABASE_URL to your Supabase connection string
   cd backend
   alembic upgrade head
   ```

5. **Seed default categories:**
   ```bash
   python -c "from app.core.seed import seed_categories; import asyncio; asyncio.run(seed_categories())"
   ```

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
docker compose -f docker/docker-compose.yml exec api python -c \
  "from app.core.seed import seed_categories; import asyncio; asyncio.run(seed_categories())"

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

### 2.2 Configure API URL

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

### 2.3 Build for TestFlight (Internal Testing)

```bash
# Build production iOS binary
eas build --platform ios --profile production

# Submit to TestFlight
eas submit --platform ios

# Or combine both:
eas build --platform ios --profile production --auto-submit
```

EAS handles signing credentials automatically. On first run, it will prompt you to log into your Apple Developer account and generate the required certificates and provisioning profiles.

### 2.4 TestFlight Distribution

After EAS Submit uploads the binary:
1. Log into App Store Connect
2. Navigate to your app → TestFlight
3. Build appears after ~10-15 minutes of Apple processing
4. Add internal testers (your Apple ID and any team members)
5. Testers receive a TestFlight invite and can install the app

### 2.5 App Store Submission

When ready for public release:
1. In App Store Connect, fill in app metadata: description, keywords, screenshots, privacy policy URL
2. Select the TestFlight build to submit
3. Click "Submit for Review"
4. Apple review typically takes 1-3 days

### 2.6 Over-the-Air Updates (Post-Launch)

For non-native code changes (JS bundle updates), use EAS Update to push updates without a full App Store review:

```bash
# Push an OTA update to production
eas update --branch production --message "Bug fix for budget calculation"
```

This updates the JS bundle for all users on the production channel. Native code changes (new native modules, SDK version bumps) still require a full build + App Store review.

### 2.7 CI/CD with GitHub Actions

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
- [ ] Receipt extraction returns results from production API
- [ ] Budget dashboard loads with real data
- [ ] Push notification permissions requested on first launch

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
