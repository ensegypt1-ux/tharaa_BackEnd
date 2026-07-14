# Security

## Secrets policy

- Never commit `.env`, keys, certificates, Firebase/service-account JSON, or PM2 configs that embed secrets.
- Use `.env.example` and `ecosystem.config.example.cjs` as templates only.
- Production credentials must be unique and loaded from the environment or a secret manager.

## Rotation checklist (before production)

If any of the following were shared in chat, screenshots, old commits, or a previous publish, **rotate them** before go-live:

1. `PEXELS_API_KEY` (a live key was previously present in a local `.env`)
2. `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`
3. Database password (`POSTGRES_PASSWORD` / `DATABASE_URL`)
4. Redis auth (if enabled)
5. `SEED_ADMIN_PASSWORD` and any known staff passwords
6. Google OAuth client secrets / Firebase private keys (if used)
7. Any other API keys copied into the project folder

## Git history

This package was prepared so the first public push contains no secret files. If secrets were ever pushed to `tharaa_BackEnd` previously, rewrite/purge history (or rotate and treat the repo as compromised) before production use — ignoring a file going forward does **not** remove it from Git history.
