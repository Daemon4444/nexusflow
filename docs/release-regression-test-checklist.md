# NexusFlow Release Regression Test Checklist

Use this checklist after every meaningful backend or frontend iteration. It is intentionally broader than a smoke test: the goal is to verify money, discounts, usage, rate limits, admin controls, and public API behavior as one billing-grade system.

## 0. Test Scope And Release Gate

Do not mark a release as ready until all required items are checked or explicitly waived.

Minimum release gate:

- Backend build passes.
- Frontend type check passes.
- Database migration state is known.
- Redis is available for production-like rate-limit tests.
- At least one text model call, one embedding call, one async image/video task, one billing export, one admin user-management flow, and one rate-limit rejection are verified.
- No failed billing write, negative balance surprise, duplicate charge, or incorrect discount is accepted as a known issue.
- The immutable release dry-run passes, including exact ALB health-check drain
  preflight and an age-encrypted PostgreSQL 16 offsite full-restore preflight.
- Both nodes use the same release archive, SHA-256 manifest, Git SHA, and
  deterministic Next.js BUILD_ID.
- `backend/.env` is absent from the artifact/manifest, and each installed
  release resolves its runtime symlink to the configured root-only source.
- Release telemetry idempotency and stale runtime-node protection pass against
  an isolated PostgreSQL database after migration `014`.
- Rollback pointers exist and the release does not build in the live `.next`.
- Session storage reaches hash-only only after both new nodes verify; a failed
  legacy rollback never restores balanced traffic while its compatibility
  transition is still release-owned.
- Production provider outbound allowlist is explicit, proxy variables are
  absent, and backend/frontend ports listen on loopback only.
- The private Provider cost manifest passes root-only staging validation; the
  exact 13-tier price book activates only after both new nodes verify, is
  deactivated before any incompatible rollback runtime receives traffic, and
  is reapplied on failed-rollback recovery before that new runtime is admitted.

Recommended commands:

```bash
npm run build:backend
cd frontend && npx tsc --noEmit
```

If the environment supports the full frontend production build, also run:

```bash
npm run build:frontend
```

## 1. Required Test Accounts And Data

Prepare these accounts before running the checklist:

| Account | Role | Balance | Purpose |
| --- | --- | ---: | --- |
| `admin-test` | Admin | Any | Admin console, user management, discount/limit control |
| `user-paid-a` | Normal user | Enough for multiple calls | Normal billing, discounts, exports |
| `user-low-balance` | Normal user | Very low, e.g. ¥0.01 | Insufficient-balance rejection |
| `user-zero-discount` | Normal user | Enough balance | Free/zero-price discount edge case |
| `user-rate-limit` | Normal user | Enough balance | QPM/TPM limit verification |

Prepare at least two API keys:

- One active API key for `user-paid-a`.
- One active API key for `user-rate-limit`.

Record the following values in the test run notes:

```txt
Release branch:
Commit SHA:
Backend URL:
Frontend URL:
Redis host:
Database:
Admin user:
Paid test user:
Rate-limit test user:
Test start time:
Test end time:
```

## 2. Environment And Deployment Checks

Check these before functional testing:

- `DATABASE_URL` points to the intended database.
- Latest migrations required by the release have been executed exactly once.
- If `004_user_model_discounts.sql` was already applied, do not apply it again.
- `REDIS_HOST` and `REDIS_PORT` are set in production-like environments.
- Redis responds to `PING`.
- Backend logs show no startup schema errors.
- Backend logs show no Redis connection errors.
- Frontend `NEXT_PUBLIC_API_BASE` points to the tested backend.
- Admin login works after restart.
- `bash scripts/deploy-all-production.sh --dry-run` passes without bypass flags.
- `NEXUSFLOW_PROVIDER_COST_MANIFEST` points only to the validated random
  `/run/nexusflow-provider-cost.*/manifest.json` handoff; it is absent from
  Git, artifacts, logs, and process arguments containing its content.
- The read-only migration preflight reports only expand-compatible pending SQL.
- Both nodes report and verify one identical pre-release rollback SHA.
- Both root-owned nginx drain helpers match the release source.
- Both root-owned nginx ingress guard configs match the helper-rendered exact
  route policy, and the root-owned default `/v1/` snippet matches the release
  source: exact 50 MiB chat/responses/messages routes, 8 MiB embeddings, 1 MiB
  audio/default `/v1`, route-specific body timeouts, streaming request/response
  buffering settings, and per-real-IP connection/request limits.
- Nginx effective config contains the trusted ALB `real_ip_header` and
  `set_real_ip_from`; external acceptance uses two distinct client IPs to prove
  rate/connection keys are not the ALB address.
- ALB health is confirmed specifically as trusted-source
  `HEAD /api/health` with `SLBHealthCheck`; the compatibility
  `GET /v1/health` probe shares dependency-aware status after rollout but is
  never counted as an ALB drain or release-health signal.
- Public plain-HTTP probes for representative exact and prefix `/v1` routes
  redirect to HTTPS (or are rejected) and never expose backend content; this
  catches a port-80 server that redirects only from its old `location /`.
- `/proxy/v1/*` and `/api/proxy/v1/*` (including bare aliases and encoded-path
  variants) return 404 at nginx and at the Next handler.
- Anonymous `/api/upload` requests just below/above 101 MiB are exercised with
  both `Content-Length` and chunked transfer; rejection occurs without a
  temporary file or frontend RSS growth proportional to the body.
- Concurrent near-100 MiB `/api/uploads/*` downloads remain streamed: nginx
  connection/rate/bandwidth controls activate as designed and frontend RSS
  stays bounded rather than scaling by object size times concurrency.
- The traffic hook observes real consecutive health-check 503s, proves only
  the intended node through public probes, and waits for active connections to
  drain without ever excluding both nodes.
- The database backup hook streams a fresh custom-format dump directly through
  age without a plaintext file; the offsite private-key verifier authenticates
  the complete ciphertext, validates its PostgreSQL 16 TOC, fully restores an
  isolated database, and checks core schema/migration counts.
- Pending SQL is expand-compatible with the previous application release.
- The release artifact was built once; both nodes verify the same archive
  digest and `.release-manifest.sha256`.
- The same release ID has exactly one `started` and one terminal event;
  successful direct node verification is reflected in `runtime_nodes`.
- `frontend/.next/BUILD_ID` equals the full 40-character release Git SHA.
- `nexusflow-current` and `nexusflow-previous` resolve to complete releases.
- A simulated activation verification or `pm2 save` failure restores the
  baseline with status `20`; incomplete restoration is never re-admitted.
- A simulated unhealthy legacy rollback target restores and verifies the
  hash-capable current runtime but returns failure; the orchestrator isolates
  traffic on that directly verified new node and restores hash-only posture.
- Provider cost state-machine tests prove normal activation, full deactivation
  before an old rollback, same-manifest transactional reactivation after a
  failed rollback, partial-state rejection, and private staging cleanup on
  success/failure.
- An artifact with an escaping symlink is rejected before install.
- Terminal telemetry replay archives an exact success event, suffixes archive
  collisions, retains failed replays, and rejects unsafe outbox permissions.

Redis check:

```bash
redis-cli -h "$REDIS_HOST" -p "${REDIS_PORT:-6379}" ping
```

Expected:

```txt
PONG
```

## 3. Authentication And Session Regression

### 3.1 User Login

Steps:

1. Open the login page.
2. Log in as `user-paid-a`.
3. Refresh the page.
4. Navigate to dashboard, billing, models, playground, keys, and rate-limits pages.

Expected:

- User remains logged in after refresh.
- Protected pages do not redirect unexpectedly.
- User-only pages do not expose admin controls.
- No console error blocks data loading.

### 3.2 Admin Login And Authorization

Steps:

1. Log in as `admin-test`.
2. Open `/admin`.
3. Log out.
4. Log in as a non-admin user and manually open `/admin`.

Expected:

- Admin can load `/admin`.
- Non-admin cannot access admin data or mutate admin APIs.
- Admin API responses for non-admin requests are `401` or `403`.

## 4. Admin User Management

### 4.1 User List And Search

Steps:

1. Open `/admin`.
2. Verify the all-users table loads.
3. Search by email, partial email, and display name.
4. Select `user-paid-a`.

Expected:

- Registered users appear.
- Search filters correctly.
- User detail panel includes balance, usage, model usage, recent API calls, discounts, and limits.
- Empty fields render gracefully.

### 4.2 Balance Adjustment

Steps:

1. Record current balance for `user-paid-a`.
2. Add a small positive amount, e.g. `1.23`.
3. Verify new balance.
4. Add a small negative adjustment if allowed by business policy, e.g. `-0.23`.
5. Reload admin page and user billing page.

Expected:

- Balance changes by the exact amount.
- Transaction record is created.
- User billing page reflects the new balance.
- Negative adjustment cannot create an invalid balance unless explicitly allowed.

## 5. User-Model Discount System

### 5.1 Create Exact Model Discount

Steps:

1. In admin user detail, create discount:

```txt
user: user-paid-a
model: qwen-plus
discount_rate: 0.8
enabled: true
```

2. Call `qwen-plus` once using `user-paid-a` API key.
3. Open user detail and billing export.

Expected:

- Usage row records `discount_rate = 0.8`.
- Billed amount equals list amount times `0.8`, allowing only expected decimal rounding.
- User balance decreases by discounted amount, not list amount.

### 5.2 Wildcard Discount Fallback

Steps:

1. Create wildcard discount:

```txt
model: *
discount_rate: 0.9
enabled: true
```

2. Call a model without an exact discount.
3. Call a model with an exact discount.

Expected:

- Model without exact discount uses wildcard `0.9`.
- Model with exact discount uses exact model discount, not wildcard.

### 5.3 Disable And Delete Discount

Steps:

1. Disable a discount.
2. Call the same model again.
3. Delete the discount.
4. Call the same model again.

Expected:

- Disabled discount is not applied.
- Deleted discount disappears from admin detail and global discount list.
- New calls use the next applicable discount or full price.
- Historical usage rows do not change unexpectedly.

### 5.4 Boundary Discount Rates

Test these values:

| Discount | Expected |
| ---: | --- |
| `1` | Full price |
| `0.99` | 1% discount |
| `0.5` | Half price |
| `0` | Free billed amount, usage still recorded |
| `-0.1` | Rejected |
| `1.1` | Rejected |
| Non-number | Rejected |

## 6. Billing And Balance Integrity

### 6.1 Chat Billing

Run both streaming and non-streaming calls.

OpenAI-compatible non-streaming:

```bash
curl "$API_BASE/v1/chat/completions" \
  -H "Authorization: Bearer $USER_PAID_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen-plus",
    "messages": [{"role":"user","content":"Return one short sentence for billing regression."}],
    "max_tokens": 64,
    "stream": false
  }'
```

OpenAI-compatible streaming:

```bash
curl -N "$API_BASE/v1/chat/completions" \
  -H "Authorization: Bearer $USER_PAID_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen-plus",
    "messages": [{"role":"user","content":"Return one short sentence for streaming billing regression."}],
    "max_tokens": 64,
    "stream": true,
    "stream_options": {"include_usage": true}
  }'
```

Expected:

- HTTP `200`.
- Usage is logged once per call.
- Balance is charged once per call.
- Prompt, completion, total tokens are present if upstream returns usage.
- Streaming usage is not double-counted.
- A normally finished stream ends with exactly one `[DONE]`; if an otherwise
  complete upstream omits the sentinel, the proxy synthesizes it once.
- A stream interrupted before `finish_reason` is logged as `error` with a
  stable `upstream_stream_*` code even though HTTP 200 headers were already sent.

### 6.2 Anthropic Messages Billing

Run both direct Anthropic provider path and converted OpenAI path if available.

```bash
curl "$API_BASE/v1/messages" \
  -H "x-api-key: $USER_PAID_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen-plus",
    "max_tokens": 64,
    "messages": [{"role":"user","content":"Anthropic billing regression."}]
  }'
```

Expected:

- Response follows Anthropic-compatible structure.
- Usage is logged.
- Balance is charged using the same discount policy.

### 6.3 Embedding Billing

```bash
curl "$API_BASE/v1/embeddings" \
  -H "Authorization: Bearer $USER_PAID_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "text-embedding-v4",
    "input": "Embedding billing regression input."
  }'
```

Expected:

- HTTP `200`.
- Prompt tokens are billed.
- Completion tokens are `0`.
- Discount policy applies if configured for the embedding model or wildcard.

### 6.4 Async Image/Video Billing

Run at least one image task and one video task in a controlled test environment.

Expected:

- Insufficient balance is rejected before creating a paid upstream task.
- Successful task is billed exactly once when completed.
- Failed task follows the intended error-billing policy.
- Admin and user usage views show the task model and amount.

### 6.5 Insufficient Balance

Steps:

1. Use `user-low-balance`.
2. Send a request whose estimated maximum cost exceeds balance.

Expected:

- Request returns `402`.
- Error code indicates insufficient balance.
- No upstream provider call should be made.
- No successful usage row is created.
- Balance remains unchanged.

## 7. Billing CSV Export

Run both self-service export and admin export.

Self-service:

```bash
curl "$API_BASE/api/billing/export.csv?startDate=2026-05-01&endDate=2026-05-31" \
  -H "Authorization: Bearer $USER_PAID_SESSION_OR_TOKEN" \
  -o user-billing.csv
```

Admin user export:

```bash
curl "$API_BASE/api/admin/users/$USER_ID/billing-export.csv?startDate=2026-05-01&endDate=2026-05-31" \
  -H "Authorization: Bearer $ADMIN_SESSION_OR_TOKEN" \
  -o admin-user-billing.csv
```

Expected CSV columns:

- `timestamp`
- `user_id`
- `api_key_id`
- `model`
- `prompt_tokens`
- `completion_tokens`
- `total_tokens`
- `list_amount_cny`
- `discount_rate`
- `discount_amount_cny`
- `billed_amount_cny`
- `recalculated_amount_cny`
- `rounding_delta_cny`
- `status`
- `reference_id`

CSV correctness checks:

- No performance-only columns are required for amount-focused billing export.
- Sum of `billed_amount_cny` matches the billing summary for the same date range.
- Discount amount equals list amount minus billed amount.
- `rounding_delta_cny` is small and explainable.
- Failed calls either have zero billed amount or match the intended failed-call billing policy.
- CSV values that start with `=`, `+`, `-`, or `@` are formula-safe.
- Date range boundaries include the intended start and end records.
- Empty date range returns a valid CSV with headers.

## 8. Rate Limit Management

### 8.1 Admin Set, Edit, Delete

Steps:

1. In admin user detail, set:

```txt
user: user-rate-limit
model: qwen-plus
qpm: 1
tpm: 100000
```

2. Reload the user detail.
3. Edit QPM to `2`.
4. Delete the exact-model limit.
5. Add wildcard:

```txt
model: *
qpm: 3
tpm: 100000
```

Expected:

- Exact-model and wildcard limits are both visible.
- Edit persists after reload.
- Delete removes only the selected rule.
- Effective limit priority is exact model, then wildcard, then system default.

### 8.2 QPM Enforcement

Steps:

1. Set exact-model limit:

```txt
qpm: 1
tpm: 100000
```

2. Send two requests to the same model within 60 seconds.

Expected:

- First request is accepted unless another request already consumed the slot.
- Second request returns `429`.
- Error type is `rate_limit_error`.
- Error code is `rate_limit_exceeded`.
- Request is rejected before upstream billing success.

### 8.3 TPM Enforcement

Steps:

1. Set:

```txt
qpm: 100
tpm: 50
```

2. Send a request with prompt plus `max_tokens` clearly above `50`.

Expected:

- Request returns `429`.
- Error mentions remaining tokens.
- No upstream call is made.
- No balance charge is made.

### 8.4 TPM Reservation And Reconciliation

Steps:

1. Set TPM moderately above a small request estimate.
2. Send a request where `max_tokens` is high but actual output is short.
3. Immediately send another small request.

Expected:

- First request reserves the estimated TPM before upstream.
- After usage returns, actual tokens reconcile against reservation.
- Second request behavior matches the reconciled remaining TPM, not double-counted estimated plus actual tokens.

### 8.5 Redis Production Path

Steps:

1. Run backend with Redis enabled.
2. Send concurrent requests against a `qpm: 1` limit.
3. Repeat with two backend instances if available.

Expected:

- Only one request is accepted in the active window.
- Other requests return `429`.
- No multi-instance overshoot is observed.
- Inject a lost Redis acknowledgement after a successful managed-provider
  reservation; the bounded retry must recover the same lease identity.
- The recovered reservation consumes RPM, daily, TPM, and concurrency exactly
  once, and release reconciles the same TPM event.
- A persistent Redis failure still fails closed with
  `provider_capacity_store_unavailable`.
- With a non-empty TPM rolling window, an immediate second reservation and
  usage read succeed without `SET ... KEEPTTL`; TTL is preserved explicitly
  with proxy-compatible `PTTL`/`PEXPIRE`.

Suggested quick concurrency command:

```bash
seq 1 5 | xargs -I{} -P5 curl -s -o /tmp/nexusflow-rate-{}.json -w "%{http_code}\n" "$API_BASE/v1/chat/completions" \
  -H "Authorization: Bearer $RATE_LIMIT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"qwen-plus","messages":[{"role":"user","content":"qpm regression"}],"max_tokens":16}'
```

## 9. API Compatibility Regression

### 9.1 OpenAI Compatible

Verify:

- `GET /v1/models`
- `POST /v1/chat/completions`
- `POST /v1/chat/completions` streaming
- `POST /v1/images/generations`
- `POST /v1/embeddings`
- Invalid API key returns `401`.
- Unknown model returns `404`.
- Unsupported model type returns `400`.

### 9.2 Anthropic Compatible

Verify:

- `POST /v1/messages`
- Streaming and non-streaming if supported.
- System prompt maps correctly.
- Multimodal content is either supported or rejected cleanly.
- Usage and billing are recorded.

### 9.3 Responses API

Verify:

- `POST /v1/responses` (non-streaming and streaming variants).
- Built-in tools work end-to-end: `web_search`, `web_extractor`, `code_interpreter`, `web_search_image`, `image_search`, `file_search`, `mcp`.
- `previous_response_id` correctly chains a follow-up turn to a prior stored response.
- `store: true` persists the response and `store: false` does not.
- `GET /v1/responses/:id` returns the stored response when `store: true` was used.
- `DELETE /v1/responses/:id` removes the stored response and subsequent reads return `404`.
- `GET /v1/responses/:id/input_items` returns the original input items for a stored response.
- Authentication and billing/usage are recorded consistently with the rest of the system.

## 10. Admin Operations And Provider Controls

Run these if the release touches providers, models, routing, operations, or admin pages:

- Provider list loads.
- Provider health overview loads.
- Provider credential missing state is clear.
- Model routing policy can be viewed.
- Updating a provider policy does not break unrelated models.
- Pinned provider route uses the pinned provider.
- Lowest-cost or weighted routing does not select disabled providers.
- Provider errors are logged without charging successful usage incorrectly.

## 11. Frontend Regression

Test desktop and narrow mobile widths.

Required pages:

- Landing page
- Login/register
- Dashboard
- API keys
- Playground
- Models
- Billing
- Rate limits
- Tickets
- Docs
- Admin

Checks:

- No major layout overlap.
- Buttons remain clickable.
- Tables and cards do not overflow horizontally in a broken way.
- Loading states resolve.
- Empty states are readable.
- Error messages are actionable.
- Admin prompts validate invalid input.
- Export buttons produce a file.
- User detail refreshes after admin mutations.
- Every `/_next/static/*` URL referenced by the tested HTML returns non-empty
  `200` with the correct JavaScript/CSS content type through the ALB.
- The frontend response header `X-NexusFlow-Build-Sha` matches the backend
  `/api/version` SHA.
- Repeated hard refreshes during and after the balanced cutover produce no
  ChunkLoadError, hydration error, or static `404`.

## 12. Security And Abuse Checks

Verify:

- User A cannot export User B's billing CSV.
- User A cannot view User B's API keys, transactions, limits, or discounts.
- Non-admin cannot call admin discount APIs.
- Non-admin cannot call admin rate-limit APIs.
- Deleted or invalid API key cannot call public APIs.
- CSV export is formula-injection safe.
- Extremely large request bodies are rejected or handled without process crash.
- Invalid JSON returns a controlled error.
- Rate limit errors do not leak internal provider keys or stack traces.

## 13. Money Invariants

These invariants must hold after every test run:

- A successful billable call creates exactly one successful usage record.
- A successful billable call consumes balance exactly once.
- `total_tokens = prompt_tokens + completion_tokens` when both components exist.
- Discounted amount is never greater than list amount.
- A disabled discount never applies to new calls.
- Historical usage does not change when a discount is edited later.
- Free discount records usage but bills `0`.
- Insufficient-balance rejection does not charge balance.
- Rate-limit rejection does not charge balance.
- CSV totals match database/billing summary for the same range.
- Admin balance adjustments appear as transactions.

## 14. High-Throughput Readiness

Run this before raising large customer limits such as `30,000,000 TPM`.

Staged test:

1. Test at 10% of target throughput.
2. Test at 30%.
3. Test at 60%.
4. Test at 100%.
5. Hold the target load for at least 10 minutes.

Watch:

- Redis latency and CPU.
- Backend CPU and memory.
- Backend event-loop lag.
- Upstream timeout rate.
- HTTP `429`, `5xx`, and provider error rates.
- Usage insert latency.
- Billing transaction latency.
- Balance update conflicts.
- CSV export query latency under recent high-volume data.

Pass criteria:

- No unexpected successful requests above configured QPM/TPM.
- No duplicate charges.
- No lost successful usage rows.
- No backend process restart.
- Error rate is within the planned threshold.

## 15. Post-Test Cleanup

After each regression run:

- Restore test discounts to the planned baseline.
- Restore test rate limits to the planned baseline.
- Remove temporary API keys.
- Archive exported CSV files if they contain sensitive user data.
- Record commit SHA, failed cases, waived cases, and release decision.

Suggested release decision format:

```txt
Release:
Commit:
Tester:
Date:
Environment:
Passed:
Failed:
Waived:
Blockers:
Decision: Go / No-Go
```
