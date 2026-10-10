import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

// Exercise the actual cron command under a minimal environment using only
// private local fixture paths. No production files, SSH, backups or jobs run.
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "nf-backup-cron-"));
try {
  const template = fs.readFileSync(new URL("../ops/cron/nexusflow-db-backup.cron", import.meta.url), "utf8");
  const line = template.split("\n").find(value => value.startsWith("30 3 * * * root "));
  assert.ok(line);
  const logDir = path.join(fixture, "logs");
  const envFile = path.join(fixture, "backup-release.env");
  const backup = path.join(fixture, "backup.sh");
  const marker = path.join(fixture, "called");
  fs.writeFileSync(backup, `#!/bin/bash\nset -eu\ntest "$NEXUSFLOW_BACKUP_RESTORE_VERIFY_HOST" = "synthetic-verifier"\ntouch '${marker}'\n`, { mode: 0o700 });
  const command = line.replace(/^30 3 \* \* \* root /, "")
    .replaceAll("/var/log/nexusflow", logDir)
    .replaceAll("/etc/nexusflow/backup-release.env", envFile)
    .replaceAll("/root/distiny/nexusflow/scripts/daily-db-backup.sh", backup);
  const run = () => spawnSync("/bin/bash", ["-c", command], { env: { PATH: "/usr/bin:/bin" }, encoding: "utf8" });
  assert.notEqual(run().status, 0, "missing config must fail before backup");
  assert.equal(fs.existsSync(marker), false);
  fs.writeFileSync(envFile, 'NEXUSFLOW_BACKUP_RESTORE_VERIFY_HOST="synthetic-verifier"\n', { mode: 0o600 });
  assert.equal(run().status, 0, "cron must export private config to backup child");
  assert.equal(fs.existsSync(marker), true);
  assert.equal(fs.statSync(path.join(logDir, "db-backup.log")).mode & 0o777, 0o600);
  console.log("backup-cron-ok: minimal environment loads verifier; missing config fails closed; logs remain private");
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}
