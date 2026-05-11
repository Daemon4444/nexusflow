# NexusFlow Admin Rate Limit Deployment TODO

This checklist is for deploying and verifying admin-managed user/model rate limits.

## What This Feature Does

Admins can manage rate limits per user and per model:

- `QPM`: requests per minute.
- `TPM`: tokens per minute.
- `model = *`: default limit for that user.
- `model = qwen-plus`: model-specific override.

Effective limit priority:

1. User + exact model limit.
2. User + `*` default limit.
3. System default.

## Backend APIs

Admin direct set:

```txt
PUT /api/rate-limits/admin/users/:userId/models/:model
```

Body:

```json
{
  "qpm": 60,
  "tpm": 100000
}
```

Admin delete:

```txt
DELETE /api/rate-limits/admin/users/:userId/models/:model
```

Existing approval flow remains available:

```txt
GET  /api/rate-limits/admin/requests
POST /api/rate-limits/admin/requests/:id/approve
POST /api/rate-limits/admin/requests/:id/reject
```

## Enforcement Coverage

The backend enforces limits in these paths:

- `/v1/chat/completions`
- `/v1/embeddings`
- `/v1/messages`
- `/api/playground/chat/completions`
- `/api/image`
- `/api/video`
- `/v1/tasks`

Text endpoints enforce both QPM and TPM. Image/video/task endpoints enforce QPM because they do not consume token usage in the same way.

QPM also uses an atomic Redis check-and-record operation, so multiple backend instances cannot race through the same remaining request slot.

TPM uses a reservation model:

- The request pre-reserves estimated prompt + max output tokens before going upstream.
- Redis performs the check and reservation atomically, so concurrent backend instances cannot overshoot the configured limit by racing each other.
- After the upstream returns usage, the backend reconciles the difference between reserved tokens and actual tokens. This avoids double-counting estimated tokens and actual tokens.

## Deployment Steps

1. Pull the latest branch.
2. Install dependencies if needed:

```bash
npm install
```

3. Build backend and frontend:

```bash
npm run build:backend
npm run build:frontend
```

4. Restart services.
5. In production, configure Redis and make sure all backend instances point to the same Redis:

```bash
REDIS_HOST=your-redis-host
REDIS_PORT=6379
REDIS_PASSWORD=your-password-if-any
```

No new database migration is needed for this rate-limit update because the existing `user_rate_limits` table is reused.

## High-TPM Capacity Checklist

For limits like `30,000,000 TPM`, do not rely on a single untested app instance. The code can store and enforce that number, but capacity depends on Redis, upstream concurrency, Node.js worker count, network bandwidth, and database write throughput.

Required before production:

1. Use Redis for rate limiting. In-memory mode is development-only.
2. Run a staged load test at 10%, 30%, 60%, then 100% of target TPM.
3. Watch Redis CPU/latency, backend event-loop lag, upstream timeout rate, and usage/billing database insert latency.
4. Keep per-user/per-model limits conservative until the load test proves the full path.
5. Add alerts for `429` spikes, upstream `5xx`, Redis latency, and billing write failures.

## Smoke Test

1. Log in as admin and open `/admin`.
2. Go to user management.
3. Select a test user.
4. Add or edit a limit:

```txt
model: qwen-plus
qpm: 1
tpm: 100
```

5. Use that user's API key to call `qwen-plus` twice within one minute.
6. The second request should return HTTP `429`.
7. Raise `qpm` back to a normal value.
8. Set `tpm` very low and send a request whose estimated prompt + max output exceeds the TPM.
9. The request should return HTTP `429` before reaching upstream.

Expected error type:

```txt
rate_limit_error
```

## Notes

Production must use Redis for consistent rate limiting across multiple backend processes. Without Redis, the fallback in-memory limiter works only within a single Node.js process and is not appropriate for high-volume traffic.
