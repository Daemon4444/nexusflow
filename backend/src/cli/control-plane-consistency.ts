/**
 * Control-plane consistency check (P1a).
 *
 * Offline (safe anywhere, used in CI and to produce the committed report):
 *   ts-node src/cli/control-plane-consistency.ts \
 *     --offline scripts/fixtures/bailian-2026-09-25 [--date 2026-09-25] [--write]
 *
 * Online (operators only; read-only SELECTs against the configured database):
 *   ts-node src/cli/control-plane-consistency.ts --online [--write]
 *
 * --write stores the Markdown + JSON report under docs/consistency/ and the
 * disable-only cleanup SQL under ops/sql/cleanup-<date>.sql. Without --write
 * the JSON report is printed to stdout. The SQL is never executed here.
 * --fail-on high|medium|low exits 2 when a finding at or above that severity
 * exists (for scheduled checks).
 */
import fs from "fs";
import path from "path";
import { getStaticModels } from "../data/models";
import {
  renderCleanupSql,
  renderConsistencyMarkdown,
  runConsistencyChecks,
  type CapacityRow,
  type ConsistencyInput,
  type ProviderRow,
} from "../control-plane/consistency";

const repositoryRoot = path.resolve(__dirname, "../../..");

function parseArgs(argv: string[]) {
  const options: { offline?: string; online: boolean; write: boolean; date?: string; failOn?: string } = {
    online: false,
    write: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--offline") options.offline = argv[++index];
    else if (arg === "--online") options.online = true;
    else if (arg === "--write") options.write = true;
    else if (arg === "--date") options.date = argv[++index];
    else if (arg === "--fail-on") options.failOn = argv[++index];
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!!options.offline === options.online) {
    throw new Error("choose exactly one of --offline <fixtures-dir> or --online");
  }
  if (options.date && !/^\d{4}-\d{2}-\d{2}$/.test(options.date)) throw new Error("--date must be YYYY-MM-DD");
  if (options.failOn && !["high", "medium", "low"].includes(options.failOn)) {
    throw new Error("--fail-on must be high, medium or low");
  }
  return options;
}

export function loadOfflineInput(directory: string): ConsistencyInput {
  const capacity = JSON.parse(
    fs.readFileSync(path.join(directory, "production-provider-capacity.json"), "utf8")
  ) as { rows: CapacityRow[] };
  const overrides = JSON.parse(
    fs.readFileSync(path.join(directory, "production-model-overrides.json"), "utf8")
  ) as { rows: ConsistencyInput["overrides"] };
  return {
    staticModels: getStaticModels(),
    overrides: overrides.rows,
    capacity: capacity.rows,
    providers: null,
  };
}

async function loadOnlineInput(): Promise<ConsistencyInput> {
  const { db, closeDb } = await import("../db/client");
  try {
    const [capacity, overrides, providers] = await Promise.all([
      db.queryMany<CapacityRow>(
        `SELECT provider_id, model_id, rpm_limit, tpm_limit, daily_limit, concurrent_limit, is_enabled
           FROM provider_capacity ORDER BY provider_id, model_id`
      ),
      db.queryMany<any>("SELECT id, doc, action, enabled FROM model_overrides ORDER BY id"),
      db.queryMany<any>(
        `SELECT id, status, api_base_url,
                (api_key IS NOT NULL AND api_key <> '') AS has_api_key
           FROM providers ORDER BY id`
      ),
    ]);
    return {
      staticModels: getStaticModels(),
      capacity: capacity.map((row) => ({ ...row, is_enabled: row.is_enabled === true })),
      overrides: overrides.map((row) => ({
        id: row.id,
        doc: row.doc || null,
        action: row.action === "disable" ? "disable" : "upsert",
        enabled: row.enabled !== false,
      })),
      providers: providers.map((row): ProviderRow => ({
        id: row.id,
        status: row.status,
        api_base_url: row.api_base_url || "",
        has_api_key: row.has_api_key === true,
      })),
    };
  } finally {
    await closeDb();
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const input = options.offline
    ? loadOfflineInput(path.resolve(options.offline))
    : await loadOnlineInput();
  const date = options.date || new Date().toISOString().slice(0, 10);
  const report = runConsistencyChecks(input, {
    mode: options.offline ? "offline" : "online",
    source: options.offline
      ? `fixtures ${path.relative(repositoryRoot, path.resolve(options.offline))}`
      : "live database (read-only)",
    now: options.date ? new Date(`${date}T00:00:00.000Z`) : undefined,
  });

  if (options.write) {
    const reportDir = path.join(repositoryRoot, "docs/consistency");
    const sqlDir = path.join(repositoryRoot, "ops/sql");
    fs.mkdirSync(reportDir, { recursive: true });
    fs.mkdirSync(sqlDir, { recursive: true });
    const base = path.join(reportDir, `consistency-${report.mode}-${date}`);
    fs.writeFileSync(`${base}.json`, `${JSON.stringify(report, null, 2)}\n`);
    fs.writeFileSync(`${base}.md`, renderConsistencyMarkdown(report));
    const sqlPath = path.join(sqlDir, `cleanup-${date}.sql`);
    fs.writeFileSync(sqlPath, renderCleanupSql(report));
    console.error(`[consistency] wrote ${path.relative(repositoryRoot, base)}.{md,json} and ${path.relative(repositoryRoot, sqlPath)}`);
  } else {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  }
  console.error(`[consistency] ${JSON.stringify(report.counts)}`);

  if (options.failOn) {
    const rank = { low: 1, medium: 2, high: 3 } as const;
    const threshold = rank[options.failOn as keyof typeof rank];
    if (report.findings.some((finding) => rank[finding.severity] >= threshold)) process.exitCode = 2;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[consistency] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
