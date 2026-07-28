# Release telemetry

`scripts/release-telemetry.mjs` writes factual deployment evidence to the
`deployment_events` and `runtime_nodes` tables created by
`014_admin_control_plane.sql`. It is a recorder, not a deployment
orchestrator, and must only be called after migration 014 has succeeded.

The script loads `backend/.env` from `NEXUSFLOW_APP_ROOT` (or the current
repository) without overriding already-exported values. It connects with
`DATABASE_URL` when present, otherwise with `PG_HOST`, `PG_PORT`, `PG_USER`,
`PG_PASSWORD`, and `PG_DATABASE`. Credentials and database error messages are
never printed.

## Deployment events

Use one stable release ID for a single rollout attempt. Keep that ID unchanged
when retrying a telemetry call. A release ID should distinguish a second
rollout of the same Git SHA, for example `prod-<sha-prefix>-<utc-run-id>`.

```bash
node scripts/release-telemetry.mjs deployment-event \
  --release-id "$RELEASE_ID" \
  --sha "$BUILD_SHA" \
  --event-type started \
  --message "Immutable artifact verified; rollout started"
```

Node-scoped event types require `--node-id`:

```bash
node scripts/release-telemetry.mjs deployment-event \
  --release-id "$RELEASE_ID" \
  --sha "$BUILD_SHA" \
  --event-type node_succeeded \
  --node-id "$NODE_ID" \
  --message "Direct node verification passed"
```

The default event ID is derived from release ID, environment, event type, node
ID, and the default idempotency key. An exact retry is a no-op. Reusing that
identity with different facts fails instead of silently rewriting history.
Use a stable `--idempotency-key` only when the same release legitimately has
more than one event of the same type and scope. `--event-id` is available for
an orchestrator that already owns stable event IDs; it is mutually exclusive
with `--idempotency-key`.

`--actor-user-id` must reference an existing NexusFlow user because the schema
enforces a foreign key. Automated releases should omit it unless a real
application user initiated the release.

## Runtime node state

Upsert a node only after direct health, version, and frontend build
verification. A healthy node requires matching backend SHA and frontend Build
ID plus `ok` PostgreSQL and Redis status:

```bash
node scripts/release-telemetry.mjs runtime-node \
  --node-id "$NODE_ID" \
  --hostname "$NODE_HOSTNAME" \
  --environment production \
  --status healthy \
  --backend-sha "$BUILD_SHA" \
  --frontend-build-id "$BUILD_SHA" \
  --backend-built-at "$BUILD_TIME" \
  --postgres-status ok \
  --redis-status ok \
  --observed-at "$OBSERVED_AT"
```

The node primary key makes repeated upserts safe. An observation older than
the stored `last_seen_at` is ignored so that delayed commands cannot replace a
newer state. A node ID cannot move between environments.

## Recommended orchestration points

After migration 014:

1. Record `started` before the first traffic change.
2. Record `node_started` before activating each drained node.
3. After direct verification, upsert its runtime state and record
   `node_succeeded`; record `node_failed` on failure.
4. Record `succeeded` only after both nodes and the balanced public path pass.
5. Record `failed` for a terminal failed rollout.
6. Record `rollback_started`, update node truth after verification, and then
   record `rolled_back` during rollback.

Telemetry failure before traffic mutation should fail the rollout closed.
Safety recovery must still proceed if telemetry is temporarily unavailable;
retry the same event identity after recovery rather than inventing a second
event.

Metadata is limited to a small JSON object and rejects common credential keys.
Do not include credentials, request bodies, cookies, API keys, customer data,
or raw health responses in messages or metadata.

Run the isolated contract tests with:

```bash
npm run test:release-telemetry
npm run test:release-telemetry-reconcile
```

The reconciler test exercises exact replay arguments, collision-safe archive
suffixes, retention after a replay failure, and rejection of non-private
outbox entries. Production reconciliation still requires root, a root:root
`0700` outbox, and root:root `0600` entries; the test-only dependency injection
does not change those command-line defaults.

The recorder implementation was also rehearsed against an isolated PostgreSQL
16 instance after applying the then-current migration set. Exact event retries
left unique rollout events, an exact node retry remained one row, and the
release/node projections consumed by `/api/admin/releases` passed. The
rehearsal did not connect to production RDS.
