/**
 * Bailian official catalog sync (P1b). Read-only with respect to configuration:
 * it fetches (or reads fixtures), parses, self-checks, diffs and writes a
 * report. Nothing is ever written to the catalog, routes or limits.
 *
 * Offline (CI / fixtures):
 *   ts-node src/cli/bailian-catalog-sync.ts --offline scripts/fixtures/bailian-2026-09-25
 * Online (operators; needs DASHSCOPE_API_KEY for the model list and reads
 * provider_capacity / model_overrides from the database read-only):
 *   ts-node src/cli/bailian-catalog-sync.ts --online [--notify]
 *
 * Options:
 *   --out <dir>        report directory (default docs/upstream-sync)
 *   --date YYYY-MM-DD  report date (default: snapshot date)
 *   --no-write         print the report JSON instead of writing files
 *   --notify           send a notifier event when actionable differences exist
 *
 * Exit codes: 0 ok; 1 self-check or runtime failure (nothing written);
 * 3 written with actionable differences (only with --fail-on-diff).
 */
import fs from "fs";
import path from "path";
import { getStaticModels } from "../data/models";
import { computeEffectiveModelsFrom } from "../data/model-overrides";
import { REF } from "../data/official-pricing-ref";
import { legacyRoutedProviderId } from "../services/providers";
import { notify } from "../services/notifier";
import {
  bailianSnapshotSchema,
  buildSnapshot,
  diffAgainstConfig,
  diffAgainstPrevious,
  selfCheck,
  type BailianSnapshot,
  type ConfigCapacityRow,
  type OurConfig,
} from "../services/upstream-catalog/bailian/snapshot";
import { loadOfflineSources, loadOnlineSources } from "../services/upstream-catalog/bailian/sources";
import { buildReport, renderReportMarkdown, type BailianSyncReport } from "../services/upstream-catalog/bailian/report";

const repositoryRoot = path.resolve(__dirname, "../../..");

interface Options {
  offline?: string;
  online: boolean;
  out: string;
  date?: string;
  write: boolean;
  notify: boolean;
  failOnDiff: boolean;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    online: false,
    out: path.join(repositoryRoot, "docs/upstream-sync"),
    write: true,
    notify: false,
    failOnDiff: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--offline") options.offline = argv[++index];
    else if (arg === "--online") options.online = true;
    else if (arg === "--out") options.out = path.resolve(argv[++index]);
    else if (arg === "--date") options.date = argv[++index];
    else if (arg === "--no-write") options.write = false;
    else if (arg === "--notify") options.notify = true;
    else if (arg === "--fail-on-diff") options.failOnDiff = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!!options.offline === options.online) throw new Error("choose exactly one of --offline <dir> or --online");
  if (options.date && !/^\d{4}-\d{2}-\d{2}$/.test(options.date)) throw new Error("--date must be YYYY-MM-DD");
  return options;
}

/** Latest committed snapshot strictly older than `date`, if any. */
export function findPreviousSnapshot(
  snapshotDir: string,
  date: string
): { file: string; snapshot: BailianSnapshot } | null {
  if (!fs.existsSync(snapshotDir)) return null;
  const candidates = fs.readdirSync(snapshotDir)
    .map((name) => ({ name, match: name.match(/^bailian-(\d{4}-\d{2}-\d{2})\.snapshot\.json$/) }))
    .filter((entry) => entry.match && entry.match[1] < date)
    .sort((a, b) => a.name.localeCompare(b.name));
  const latest = candidates[candidates.length - 1];
  if (!latest) return null;
  const file = path.join(snapshotDir, latest.name);
  return { file, snapshot: bailianSnapshotSchema.parse(JSON.parse(fs.readFileSync(file, "utf8"))) };
}

export function buildOurConfig(input: {
  overrides: Parameters<typeof computeEffectiveModelsFrom>[1];
  capacity: ConfigCapacityRow[];
}): OurConfig {
  const effective = computeEffectiveModelsFrom(getStaticModels(), input.overrides);
  return {
    bailianModels: effective.filter((model) => legacyRoutedProviderId(model.id) === "dashscope"),
    soldModelIds: new Set(effective.map((model) => model.id)),
    capacity: input.capacity,
  };
}

function loadOfflineConfig(directory: string): OurConfig {
  const capacity = JSON.parse(fs.readFileSync(path.join(directory, "production-provider-capacity.json"), "utf8")).rows;
  const overrides = JSON.parse(fs.readFileSync(path.join(directory, "production-model-overrides.json"), "utf8")).rows;
  return buildOurConfig({ overrides, capacity });
}

async function loadOnlineConfig(): Promise<OurConfig> {
  const { db, closeDb } = await import("../db/client");
  try {
    const capacity = await db.queryMany<ConfigCapacityRow>(
      "SELECT provider_id, model_id, rpm_limit, tpm_limit, is_enabled FROM provider_capacity"
    );
    const overrides = await db.queryMany<any>("SELECT id, doc, action, enabled FROM model_overrides");
    return buildOurConfig({
      capacity,
      overrides: overrides.map((row) => ({
        id: row.id,
        doc: row.doc || null,
        action: row.action === "disable" ? "disable" : "upsert",
        enabled: row.enabled !== false,
      })),
    });
  } finally {
    await closeDb();
  }
}

export const ACTIONABLE_CATEGORIES = new Set([
  "limit_above_upstream",
  "price_mismatch",
  "context_mismatch",
  "pool_not_modeled",
  "sold_but_not_listed",
]);

export async function runSync(options: Options): Promise<{ report: BailianSyncReport; written: string[] }> {
  const sources = options.offline
    ? loadOfflineSources(path.resolve(options.offline))
    : await loadOnlineSources((process.env.DASHSCOPE_API_KEY || "").trim());
  const fetchedAt = options.offline
    ? String(JSON.parse(sources.modelListRaw).fetched_at || new Date().toISOString())
    : new Date().toISOString();
  const snapshot = buildSnapshot(sources, { fetchedAt, mode: options.offline ? "offline" : "online" });
  const date = options.date || fetchedAt.slice(0, 10);
  const snapshotDir = path.join(options.out, "snapshots");
  const previous = findPreviousSnapshot(snapshotDir, date);

  const check = selfCheck(snapshot, { previous: previous?.snapshot || null, ref: REF });
  if (!check.ok) {
    const error = new Error(`self-check failed; nothing was written:\n  - ${check.failures.join("\n  - ")}`);
    (error as Error & { selfCheck?: unknown }).selfCheck = check;
    throw error;
  }

  const config = options.offline ? loadOfflineConfig(path.resolve(options.offline)) : await loadOnlineConfig();
  const report = buildReport({
    snapshot,
    selfCheck: check,
    previousSnapshot: previous ? path.relative(repositoryRoot, previous.file) : null,
    upstreamChanges: diffAgainstPrevious(snapshot, previous?.snapshot || null),
    diffs: diffAgainstConfig(snapshot, config),
    generatedAt: options.offline ? fetchedAt : new Date().toISOString(),
  });

  const written: string[] = [];
  if (options.write) {
    fs.mkdirSync(snapshotDir, { recursive: true });
    const base = path.join(options.out, `bailian-${date}`);
    const snapshotFile = path.join(snapshotDir, `bailian-${date}.snapshot.json`);
    fs.writeFileSync(snapshotFile, `${JSON.stringify(snapshot, null, 1)}\n`);
    fs.writeFileSync(`${base}.json`, `${JSON.stringify(report, null, 1)}\n`);
    fs.writeFileSync(`${base}.md`, renderReportMarkdown(report));
    written.push(snapshotFile, `${base}.json`, `${base}.md`);
  }

  if (options.notify) {
    const actionable = report.diffs.filter((diff) => ACTIONABLE_CATEGORIES.has(diff.category));
    if (actionable.length || report.upstreamChanges.length) {
      const summary = Object.entries(report.counts)
        .filter(([category, count]) => count > 0 && ACTIONABLE_CATEGORIES.has(category))
        .map(([category, count]) => `${category}=${count}`)
        .join(", ");
      await notify({
        severity: report.counts.limit_above_upstream > 0 ? "warning" : "info",
        kind: "bailian_catalog_diff",
        title: `百炼官方数据与平台配置存在差异（${date}）`,
        body: `${summary || "no actionable config diff"}; upstream changes since last snapshot: ${report.upstreamChanges.length}. See docs/upstream-sync/bailian-${date}.md`,
        dedupeKey: `bailian-catalog-diff:${date}:${summary}`,
      });
    }
  }
  return { report, written };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const { report, written } = await runSync(options);
  if (!options.write) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  for (const file of written) console.error(`[bailian-sync] wrote ${path.relative(repositoryRoot, file)}`);
  console.error(`[bailian-sync] ${JSON.stringify(report.counts)}`);
  if (options.failOnDiff && report.diffs.some((diff) => ACTIONABLE_CATEGORIES.has(diff.category))) {
    process.exitCode = 3;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[bailian-sync] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
