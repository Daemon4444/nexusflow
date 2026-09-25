/**
 * Thin forwarder to the single migration runner, scripts/migrate-with-lock.mjs.
 *
 * The runner holds a PostgreSQL advisory lock, rejects pending contract SQL,
 * records and verifies per-file SHA-256 checksums (migration 029) and applies
 * each migration in its own transaction. There is intentionally no second
 * implementation here; `npm run db:migrate` and releases share one code path.
 */
import { spawnSync } from "child_process";
import path from "path";

const repositoryRoot = path.resolve(__dirname, "../../..");
const runner = path.join(repositoryRoot, "scripts/migrate-with-lock.mjs");
const result = spawnSync(process.execPath, [runner, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: {
    ...process.env,
    NEXUSFLOW_APP_ROOT: process.env.NEXUSFLOW_APP_ROOT || repositoryRoot,
  },
});
process.exitCode = result.status ?? 1;
