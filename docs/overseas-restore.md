# Overseas Restore Runbook

This branch preserves the live `nexus-vip` deployment that was running on
`47.85.190.59` for `nexusflow.vip` on 2026-07-11. It is intended as a rebuild
branch for a future server, without committing production secrets.

## What is preserved

- App source for the overseas NexusFlow deployment.
- PM2 process definition in `ecosystem.config.js`.
- Docker Compose definition for local Postgres and Redis in `docker-compose.yml`.
- Environment variable templates in `docs/env.backend.example` and
  `docs/env.frontend.example`.

## What is not preserved in Git

- `backend/.env` and `frontend/.env` values.
- Database contents and Docker volumes.
- TLS private keys, Nginx certificates, sing-box secrets, or Cloudflare tokens.
- PM2 runtime state and systemd state.

Store those in 1Password or another private backup before releasing the old
machine. Do not paste secrets into this repository.

## Known live topology

- Hostname on the old machine: `iZ0xi3ncy5vyll0h3c799yZ`.
- Domain: `nexusflow.vip` and `www.nexusflow.vip` pointed directly to the host.
- Backend: Node process on `0.0.0.0:3001`, PM2 name `quadrant-backend`.
- Frontend: Next.js process on `0.0.0.0:19999`, PM2 name `quadrant-frontend`.
- Postgres: Docker container `quadrant-postgres`, bound to `127.0.0.1:5432`.
- Redis: Docker container `quadrant-redis`, bound to `127.0.0.1:6379`.
- Nginx should route `/`, `/_next/`, and static frontend traffic to `19999`, and
  API routes such as `/api/` and `/v1/` to `3001`.
- `us.liuyanggg.us` was a separate Cloudflare-fronted proxy entry on the same
  host. Recreate it only if that proxy role is still wanted.

## Server prerequisites

The old server was using:

- Alibaba Cloud Linux 4.
- Node.js `v22.22.0`.
- npm `10.9.4`.
- PM2 `7.0.1`.
- Docker and Docker Compose.
- Nginx with TLS certificates for `nexusflow.vip`.

Equivalent newer patch versions should be fine, but keep Node on the same major
version unless you have time to retest the frontend and backend build.

## Rebuild steps

1. Prepare the server.

```bash
dnf update -y
dnf install -y git nginx docker
systemctl enable --now docker nginx
npm install -g pm2
```

Install Node.js 22 with your preferred method if it is not already available.

2. Pull the preserved branch.

```bash
git clone git@github.com:Daemon4444/nexusflow.git /root/nexusflow
cd /root/nexusflow
git checkout archive/nexus-vip-live-20260711
```

3. Restore environment files.

```bash
cp docs/env.backend.example backend/.env
cp docs/env.frontend.example frontend/.env
```

Fill both files from the secret store. Required values include provider API
keys, Google OAuth client ID, Alipay keys, database credentials, Redis password,
SMTP/SMS credentials, and SLS credentials. Keep the real `.env` files out of
Git.

4. Start databases.

```bash
docker compose up -d redis postgres
docker ps
```

If you have a database dump from the old machine, restore it before starting the
app. Otherwise the migration scripts create a fresh schema.

5. Install dependencies and build.

```bash
npm ci
npm run build
cd backend && npm run db:migrate && cd ..
```

6. Start PM2.

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 status
```

If this is a long-lived machine, run `pm2 startup systemd` and follow the command
it prints.

7. Configure Nginx.

Use the same routing shape as the old server:

```nginx
server {
    listen 80;
