# Tharaa Market API (Version 1 — Frozen)

NestJS backend for **Tharaa Market** — single-store grocery delivery and pickup for **Al Khafji**, Saudi Arabia.

Public repository: [ensegypt1-ux/tharaa_BackEnd](https://github.com/ensegypt1-ux/tharaa_BackEnd)

> **API Version 1 is frozen.** See [`docs/API_CONTRACT_V1.md`](docs/API_CONTRACT_V1.md).  
> Official OpenAPI: runtime `/api/docs-json` and artifact [`docs/openapi-v1.json`](docs/openapi-v1.json).  
> Admin integration (REST + Socket.IO): [`docs/ADMIN_INTEGRATION.md`](docs/ADMIN_INTEGRATION.md).

## Requirements

- Node.js 20+ and npm
- Docker and Docker Compose (local Postgres + Redis), **or** managed PostgreSQL 16+ and Redis 7+
- PM2 (optional, production process manager)

## Installation

```bash
git clone https://github.com/ensegypt1-ux/tharaa_BackEnd.git
cd tharaa_BackEnd
npm install
cp .env.example .env
# Edit `.env` and replace every CHANGE_ME_* / empty secret value
```

## Environment variables

Copy [`.env.example`](.env.example) to `.env`. All runtime configuration is loaded from the environment (see `src/config/configuration.ts` and `src/config/env.validation.ts`).

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | Yes | HTTP port |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis connection string |
| `JWT_ACCESS_SECRET` | Yes | Access JWT secret (≥ 32 chars) |
| `JWT_REFRESH_SECRET` | Yes | Refresh JWT secret (≥ 32 chars) |
| `POSTGRES_PASSWORD` | Yes for `docker compose` | Postgres password used by Compose |
| `SEED_ADMIN_*` | Yes for seed | Admin seed identity + password |
| `CORS_ORIGINS` / `ADMIN_DASHBOARD_ORIGINS` | Recommended | Comma-separated browser origins |
| `GOOGLE_CLIENT_IDS` | Optional | Comma-separated OAuth client IDs for Google ID token audience (include Web client ID). See [`../docs/GOOGLE_SIGN_IN_PRODUCTION.md`](../docs/GOOGLE_SIGN_IN_PRODUCTION.md) |
| `FCM_*` | Optional | Firebase Cloud Messaging |
| `PEXELS_API_KEY` | Optional | Admin product image search (server-only) |
| `E2E_EMPLOYEE_PASSWORD` | E2E only | Staff password for e2e fixture |

Never commit `.env`, credential JSON files, certificates, or private keys.

## Local development

```bash
# 1) Configure environment
cp .env.example .env
# set at least: POSTGRES_PASSWORD, DATABASE_URL, REDIS_URL,
# JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, SEED_ADMIN_*

# 2) Start Postgres + Redis
npm run db:up

# 3) Migrate + seed
npx prisma migrate deploy
npm run prisma:seed

# 4) Run API (watch mode)
npm run start:dev
```

Default local Postgres host port is **55432** (see `POSTGRES_PORT`).

## Production build

```bash
npm ci
cp .env.example .env   # on the server; fill production secrets
npm run build
npx prisma migrate deploy
# seed only when intentional:
npm run prisma:seed
npm run start:prod
```

Persist `STORAGE_ROOT` (default `./storage`) across deploys so product/category images survive restarts.

## Prisma migrate

```bash
npx prisma migrate deploy    # production / CI
npx prisma migrate dev       # local development (creates migrations)
npx prisma generate
npx prisma validate
```

## Prisma seed

```bash
npm run prisma:seed
```

Requires `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PHONE`, and `SEED_ADMIN_PASSWORD` in the environment.  
The seed upserts delivery/pickup settings, bootstrap AppSettings, coupon `THARAA10`, demo SKU `TH-TOM-001`, and imports `prisma/seed-data/products.xlsx` (`XLS-*` SKUs, idempotent).

## PM2 start

```bash
npm run build
cp ecosystem.config.example.cjs ecosystem.config.cjs
# Ensure production `.env` (or host env) is loaded before start
pm2 start ecosystem.config.cjs
pm2 save
```

Do not put secrets inside the PM2 config file. Prefer `.env` on the host or a secret manager.

## Health endpoint

- Liveness: `GET /api/v1/health`
- Readiness: `GET /api/v1/health/ready`

Example: `http://localhost:3000/api/v1/health`

## Swagger URL

- UI: `http://localhost:3000/api/docs`
- OpenAPI JSON: `http://localhost:3000/api/docs-json`

## Useful URLs

| Resource | URL |
|----------|-----|
| API base | `http://localhost:3000/api/v1` |
| Bootstrap | `http://localhost:3000/api/v1/bootstrap` |
| Static files | `http://localhost:3000/static/...` |
| Admin Socket.IO | `http://localhost:3000/admin` |

## Docker

```bash
npm run db:up      # postgres + redis (requires POSTGRES_PASSWORD in .env)
npm run db:down
```

## Verification

```bash
npm run prisma:validate
npm run build
npm run lint
npm test
npm run test:e2e   # needs SEED_ADMIN_* and E2E_EMPLOYEE_PASSWORD
```

## Security notes

- All secrets must come from environment variables.
- Rotate any credential that was ever shared, committed, or used in a public channel before production.
- Admin dashboard Socket.IO namespace is `/admin` (JWT access token handshake). See `docs/ADMIN_INTEGRATION.md`.

## Versioning

All current routes live under `/api/v1` (`API_PREFIX`). A future Version 2 must use a separate prefix (e.g. `api/v2`) without changing v1 behavior.

## Project structure

```text
docs/                 # API contract, OpenAPI, admin integration
prisma/               # schema, migrations, seed
storage/              # local uploads (gitignored contents)
src/                  # NestJS application
docker-compose.yml
ecosystem.config.example.cjs
.env.example
```
