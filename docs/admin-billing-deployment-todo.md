# NexusFlow Admin Billing Deployment TODO

This checklist is for deploying the admin user management, per-user per-model discounts, billing CSV export, and discounted billing paths.

## 1. Pull Latest Code

Pull the latest branch and confirm these files exist:

- `backend/src/db/migrations/004_user_model_discounts.sql`
- `backend/src/data/user-discounts.ts`
- `backend/src/routes/admin.ts`
- `backend/src/routes/discounts.ts`

## 2. Run Database Migrations

From the repository root:

```bash
cd backend
npm run db:migrate
```

Confirm the production database has this table:

```sql
SELECT * FROM user_model_discounts LIMIT 1;
```

The table stores per-user per-model discount multipliers:

- `1` means list price.
- `0.8` means 20% off.
- `0` means free.

## 3. Configure Admin Access

Set at least one of these backend environment variables:

```env
ADMIN_EMAILS=admin@example.com
# or
ADMIN_USER_IDS=user-id-1,user-id-2
```

Restart the backend after changing environment variables.

## 4. Install, Build, And Restart

```bash
npm install
npm run build:backend
npm run build:frontend
```

If frontend build fails because native packages are missing or signed incorrectly, reinstall dependencies:

```bash
rm -rf node_modules frontend/node_modules backend/node_modules
npm install
npm run build
```

Then restart the backend and frontend services.

## 5. Verify Admin User Management

Log in as an admin and open:

```txt
/admin
```

Verify the user management page can:

- List all registered users.
- Search users by nickname, email, phone, or user ID.
- Show user balance.
- Adjust user balance with an admin ledger entry.
- Show usage summary.
- Show usage by model.
- Show recent API calls.
- Show recent billing transactions.
- Add, edit, and delete per-user per-model discounts.
- Export one user's billing CSV as admin.

## 6. Verify Discounted Billing

Create a test discount:

- User: any test user.
- Model: `qwen-plus` or another active model.
- Discount rate: `0.8`.

Call the model using that user's API key:

```txt
POST /v1/chat/completions
```

Confirm:

- Balance check uses the discounted amount.
- `usage_logs.cost` stores the discounted amount.
- `transactions.amount` stores the discounted amount.
- Admin user detail usage reflects the discounted amount.

Also smoke test these paths:

- `/v1/chat/completions`
- `/v1/embeddings`
- `/v1/messages`
- Playground
- Image generation
- Video generation
- `/v1/tasks`

## 7. Verify Billing CSV

Verify both export paths:

- User self export from `/billing`.
- Admin export from `/admin` user detail.

The CSV must include these amount and discount fields:

- `list_amount_cny`
- `discount_rate`
- `discount_amount_cny`
- `billed_amount_cny`
- `recalculated_amount_cny`
- `rounding_delta_cny`

The CSV should not include performance metrics such as latency, TTFT, or TPOT.

## 8. Final Smoke Test

Run a complete production smoke test:

- Admin login works.
- `/api/health` returns OK.
- Admin can see registered users.
- Admin can adjust a user's balance.
- Admin can add and edit a user-model discount.
- A discounted model call bills at the discounted amount.
- Admin user detail shows updated usage.
- User billing CSV exports successfully.
- Admin user billing CSV exports successfully.

Only mark the deployment complete after these checks pass.
