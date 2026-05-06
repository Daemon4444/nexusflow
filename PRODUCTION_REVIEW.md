# Nexusflow.hk Production Review

Date: 2026-05-06

This document records the production review and live test findings for `nexusflow.hk`.

## 2026-05-06 Update

### Confirmed Production State

- Runtime database is PostgreSQL, connected through `backend/src/db/client.ts` with `pg.Pool`.
- Production database checked on this server:
  - users: 14
  - api_keys: 7
  - usage_logs: 654
  - transactions: 461
  - async_tasks: 66
- Public health check: `https://nexusflow.hk/api/health` returned 200.
- `/api/models` returns `supported_protocols` for each model; chat-class Qwen, DeepSeek and GLM models expose:
  - `openai/chat-completions`
  - `anthropic/messages`
  - `google/generate-content`

### Live Protocol Test

All tests used minimal prompts against production `https://nexusflow.hk` and returned HTTP 200:

| Family | Model | OpenAI Chat | Anthropic Messages | Gemini-compatible |
| --- | --- | --- | --- | --- |
| Qwen | `qwen3.5-flash` | PASS | PASS | PASS |
| DeepSeek | `deepseek-v4-flash` | PASS | PASS | PASS |
| GLM | `glm-5.1` | PASS | PASS | PASS |

Observed caveat: even with `max_tokens` / `maxOutputTokens` set low, several models still returned substantial reasoning-token usage. This affects cost predictability and should be surfaced in product copy or controlled with a clearer default `enable_thinking` policy.

### Thinking Parameter Test

`enable_thinking` is currently passed through by `/v1/chat/completions`; NexusFlow does not yet forward `thinking_budget` or `preserve_thinking`.

| Model | `enable_thinking=true` | `enable_thinking=false` | Conclusion |
| --- | --- | --- | --- |
| `qwen3.5-flash` | returned `reasoning_content` | no `reasoning_content` | switchable thinking |
| `qwen3-max` | returned `reasoning_content` | no `reasoning_content` | switchable thinking |
| `qwq-plus` | returned `reasoning_content` | still returned `reasoning_content` | thinking-only; false does not disable |
| `qwen-math-plus` | no `reasoning_content` | no `reasoning_content` | do not document as thinking switch |
| `deepseek-r1` | returned `reasoning_content` | still returned `reasoning_content` | thinking-only; false does not disable |
| `deepseek-v3.2` | returned `reasoning_content` | no `reasoning_content` | switchable thinking |
| `deepseek-v4-pro` | returned `reasoning_content` | no `reasoning_content` | switchable thinking |
| `glm-5.1` | returned `reasoning_content` | no `reasoning_content` | switchable thinking |

### Documentation Corrections

- Removed public documentation rows that advertised routes not exposed by the NexusFlow public gateway.
- Qwen API docs now list only the three currently open public text protocols and include cURL examples for OpenAI Chat, Anthropic Messages and Gemini-compatible GenerateContent.
- DeepSeek and GLM API docs now explicitly include the same three protocol examples.
- README, WIKI, wiki and MODELS docs now describe only callable public protocols and point users to `supported_protocols` as the source of truth.

### Database Review Notes

- Balance mutation uses transactions and `SELECT ... FOR UPDATE`, so the main consumption path is protected against concurrent double-spend races.
- Money fields were migrated from `REAL` to `NUMERIC(18, 6)` in `002_money_numeric.sql`: `users.balance`, `transactions.amount`, `transactions.balance_after`, and `usage_logs.cost`. `tpot_ms` remains non-money telemetry.
- API keys now validate through `key_hash`, and the stored `key` value is masked for newly created keys. The compatibility query still checks both `key_hash` and `key`; after confirming no legacy plaintext keys remain, remove the plaintext fallback and make `key_hash` required.
- `backend/src/routes/messages.ts` and `backend/src/routes/protocols.ts` both contain Anthropic Messages handling, but `messages.ts` is mounted first and is the active production route for `/v1/messages`. This duplication is maintainability risk and should be consolidated.

## Scope

- Live login with `2472843658@qq.com`
- Session, account, billing, API key, model call, streaming, Anthropic-compatible API, Gemini-compatible API, upload, payment configuration, public pages, auth boundaries
- Static code review for payment, auth, API key handling, upload, model pricing, routing, and production hardening

## Confirmed Working

- Email verification login works in production.
- Session-protected APIs reject unauthenticated requests.
- API key create/use/delete works; deleted keys are rejected immediately.
- OpenAI-compatible `/v1/chat/completions` works.
- Streaming chat completions work.
- Anthropic-compatible `/v1/messages` works.
- Usage is logged and balance is deducted for successful paid calls.
- Basic validation errors return structured JSON.

## Production Test Data

- Starting balance observed: `1.999994`
- Ending balance after expanded tests: `1.999979`
- Live test spend: approximately `0.000015 CNY`
- Tested model: `qwen-turbo`
- Tested calls:
  - OpenAI non-streaming: 16 tokens, billed about `0.000005`
  - OpenAI streaming: 16 tokens, billed about `0.000005`
  - Anthropic `/v1/messages`: 16 tokens, billed about `0.000005`
- Gemini `/v1beta/models/qwen-turbo:generateContent` returned a Next.js 404 before this patch series.

## P0 Issues

1. Production payment can fall back to mock crediting.
   - Alipay production config was missing all required `ALIPAY_*` variables.
   - Existing code credited balance when Alipay was not configured.
   - Fix: disable mock payment in production and return an error when real payment is not configured.

2. Email code test mode can be active if SMTP is missing.
   - Existing code logs verification codes when SMTP is not configured.
   - Fix: production requests fail when SMTP is not configured.

3. API keys are stored and returned in plaintext.
   - Existing list endpoint returns the full key.
   - Fix: hash keys for validation; only creation returns the full key once; list returns masked keys.

4. Upload endpoint is public.
   - Live unauthenticated upload succeeded and returned a public file URL.
   - Fix: require session token or API key before accepting uploads.

5. Repository contains suspected live upstream keys in docs/scripts.
   - Affected files include `start.sh`, `AGENTS.md`, `MODELS.md`, and `ISSUES.md`.
   - Required operational action: revoke those keys, rotate production keys, and clean Git history.

## P1 Issues

- Billing is post-paid, not reserved/prepaid. A high-cost call can succeed before the platform confirms the user can pay for the final cost.
- Pricing is hard-coded and does not fully represent provider tiered pricing or model snapshot changes.
- Usage and billing counters have inconsistent semantics.
- Default user limits were high for a public site: `1000 QPM / 1,000,000 TPM`.
- Public pages are slow from the test environment; several pages took 4-7 seconds, and the homepage did not fully download within 8 seconds in one check.
- Security headers were incomplete and `X-Powered-By` exposed stack information.
- Logged-in dashboard pages rely on client-side redirects when unauthenticated.

## Usability Issues

- First login does not strongly guide users through: set password, create API key, make first call, understand billing.
- Users with no password are not prompted clearly enough to set one.
- Playground required manual API key entry even for logged-in dashboard users.
  - Fix: chat, image, video, upload, and async status polling can now use the logged-in session directly; API key input remains available for explicit API testing.
- Balances display micro precision in places where users expect currency precision.
- Payment configuration failures should be hidden from end users or shown as maintenance, not as test-payment behavior.
- Ticket forms allow low-quality submissions such as subject `1` and description `x`.
- API errors are technically correct but not always actionable for dashboard users.

## Recommended Follow-up

- Revoke and rotate all leaked upstream keys.
- Move billing to reservation/finalization with idempotent ledger entries.
- Replace static pricing with an admin-managed pricing table and provider price audit workflow.
- Keep PostgreSQL as the production source of truth and add backup/restore drills plus migration rollback discipline.
- Add monitoring for provider errors, payment failures, unusual upload volume, and high spend.
- Add Playwright user journey tests for login, key creation, first API call, billing, and upload.

## Patch Notes

- Production mock payment is disabled unless explicitly enabled in non-production.
- Production email-code test mode is disabled when SMTP is missing.
- API keys are hashed for validation and listed as masked values; the full key is only returned on creation.
- Uploads now require a session token or API key.
- Basic security headers and `/v1beta` proxying were added.
- Default rate limits were reduced to `60 QPM / 100,000 TPM`.
- Ticket creation now requires a useful title and description.
- Balance display now rounds main currency values to two decimals while preserving precise values in transaction detail views.
- Chat, image, embedding, and Anthropic requests now perform estimated-cost balance checks before upstream calls.
- Playground text chat now has a session-protected backend proxy with user-level rate limits, balance checks, usage logging, and billing.
- Playground uploads now forward the logged-in session token, matching the backend upload authorization requirement.
- Playground image/video generation now accepts session auth as well as API keys.
- Async image/video task status endpoints now require auth and validate task ownership before returning task results.
- User usage overview now counts only successful paid requests as `totalRequests`.
- PostgreSQL migration tooling was added and production runtime now uses the PostgreSQL `pg.Pool` path.
- The public landing page and console-wide visual system were redesigned toward a denser production SaaS interface.
