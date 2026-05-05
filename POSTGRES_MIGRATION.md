# PostgreSQL Migration Runbook

This runbook migrates production data from the current SQLite database to PostgreSQL without overwriting the existing SQLite file.

## Required Environment

Set these variables on the server before running migration commands:

```bash
PG_HOST=127.0.0.1
PG_PORT=5432
PG_USER=quadrant
PG_PASSWORD=...
PG_DATABASE=quadrant
SQLITE_DB_PATH=/root/distiny/nexusflow/backend/data/ai-router.db
```

## Commands

Run from the repository root:

```bash
cd backend
npm run db:pg:migrate
npm run db:pg:copy
npm run db:pg:verify
```

`db:pg:migrate` creates the schema and records applied SQL files in `schema_migrations`.

`db:pg:copy` copies rows from SQLite into PostgreSQL in dependency order. It uses `ON CONFLICT DO NOTHING`, so it can be retried after a failed partial run.

`db:pg:verify` checks row counts and production safety invariants:

- no full plaintext `sk-air-*` keys in `api_keys.key`
- every API key has `key_hash`
- no negative user balances
- no orphan transaction rows

## Production Cutover Recommendation

1. Deploy the migration scripts first.
2. Run `db:pg:migrate` against an empty PostgreSQL database.
3. Run `db:pg:copy` and `db:pg:verify`.
4. Compare account balances, transactions, API keys, usage logs, payment orders and async tasks.
5. Schedule a short write freeze.
6. Run `db:pg:copy` and `db:pg:verify` again.
7. Switch the runtime data layer to PostgreSQL in a separate deploy.
8. Keep the SQLite database as a read-only backup until billing and API usage have been reconciled.

The current runtime still defaults to SQLite. Do not delete SQLite production data until the PostgreSQL runtime cutover has been separately completed and verified.
