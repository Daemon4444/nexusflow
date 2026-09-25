/**
 * Control-plane backfill (P3): legacy configuration → cp_* version 1.
 *
 * Offline (safe anywhere, used in CI and for the committed report):
 *   ts-node src/cli/control-plane-backfill.ts \
 *     --offline scripts/fixtures/bailian-2026-09-25 \
 *     [--bailian-snapshot ../docs/upstream-sync/snapshots/bailian-2026-09-25.snapshot.json] \
 *     [--date 2026-09-25] [--write]
 *
 * Online (operators only, during go-live):
 *   ts-node src/cli/control-plane-backfill.ts --online [--bailian-snapshot <file>]          # dry run, read-only
 *   ts-node src/cli/control-plane-backfill.ts --online --apply --published-by <admin>       # inserts version (kind=backfill)
 *
 * The backfill always reads legacy tables and never changes them. --apply
 * only succeeds when no control-plane version exists yet (unless
 * --expected-parent <n> names the current one) and validation passes
 * (known legacy errors listed with --allow-check are reported as warnings).
 * The output also contains an offline shadow comparison: every difference
 * between the legacy effective catalog/routes and the backfilled version.
 */
import fs from "fs";
import path from "path";
import { getStaticModels } from "../data/models";
import { computeEffectiveModelsFrom } from "../data/model-overrides";
import {
  buildBackfill,
  type BackfillReport,
  type LegacyCapacityRow,
  type LegacyProviderRow,
  type LegacySources,
} from "../control-plane/backfill";
import type { ControlPlaneContent } from "../control-plane/schema";
import { validateContent, type ValidationIssue, type ValidationResult } from "../control-plane/validation";
import { indexContent } from "../control-plane/runtime";
import { compareCatalog, type CatalogComparison } from "../control-plane/shadow-compare";
import { contentSha256 } from "../control-plane/store";

const repositoryRoot = path.resolve(__dirname, "../../..");

interface Options {
  offline?: string;
  online: boolean;
  apply: boolean;
  write: boolean;
  date?: string;
  bailianSnapshot?: string;
  publishedBy?: string;
  expectedParent: number | null;
  allowChecks: string[];
}

function parseArgs(argv: string[]): Options {
  const options: Options = { online: false, apply: false, write: false, expectedParent: null, allowChecks: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--offline") options.offline = argv[++index];
    else if (arg === "--online") options.online = true;
    else if (arg === "--apply") options.apply = true;
    else if (arg === "--write") options.write = true;
    else if (arg === "--date") options.date = argv[++index];
    else if (arg === "--bailian-snapshot") options.bailianSnapshot = argv[++index];
    else if (arg === "--published-by") options.publishedBy = argv[++index];
    else if (arg === "--expected-parent") options.expectedParent = Number(argv[++index]);
    else if (arg === "--allow-check") options.allowChecks.push(argv[++index]);
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!!options.offline === options.online) throw new Error("choose exactly one of --offline <fixtures-dir> or --online");
  if (options.apply && !options.online) throw new Error("--apply requires --online");
  if (options.apply && !options.publishedBy) throw new Error("--apply requires --published-by <admin>");
  if (options.date && !/^\d{4}-\d{2}-\d{2}$/.test(options.date)) throw new Error("--date must be YYYY-MM-DD");
  if (options.expectedParent !== null && !Number.isInteger(options.expectedParent)) throw new Error("--expected-parent must be an integer");
  return options;
}

function readJson(file: string): any {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function loadOfflineSources(directory: string, bailianSnapshotFile?: string): LegacySources {
  return {
    staticModels: getStaticModels(),
    overrides: readJson(path.join(directory, "production-model-overrides.json")).rows,
    capacity: readJson(path.join(directory, "production-provider-capacity.json")).rows,
    providers: null,
    bailianSnapshot: bailianSnapshotFile ? readJson(bailianSnapshotFile) : null,
  };
}

export async function loadOnlineSources(bailianSnapshotFile?: string): Promise<LegacySources> {
  const { db } = await import("../db/client");
  const [capacity, overrides, providers, channels] = await Promise.all([
    db.queryMany<any>(
      `SELECT provider_id, model_id, rpm_limit, tpm_limit, daily_limit, concurrent_limit, is_enabled, priority, weight
         FROM provider_capacity ORDER BY provider_id, model_id`
    ),
    db.queryMany<any>("SELECT id, doc, action, enabled FROM model_overrides ORDER BY id"),
    db.queryMany<any>("SELECT id, name, api_base_url, status FROM providers ORDER BY id"),
    db.queryMany<{ provider_id: string }>("SELECT DISTINCT provider_id FROM provider_channel_configs").catch(() => []),
  ]);
  return {
    staticModels: getStaticModels(),
    capacity: capacity.map((row): LegacyCapacityRow => ({
      provider_id: row.provider_id,
      model_id: row.model_id,
      rpm_limit: Number(row.rpm_limit),
      tpm_limit: Number(row.tpm_limit),
      daily_limit: Number(row.daily_limit),
      concurrent_limit: Number(row.concurrent_limit),
      is_enabled: row.is_enabled === true,
      priority: row.priority === null || row.priority === undefined ? undefined : Number(row.priority),
      weight: row.weight === null || row.weight === undefined ? undefined : Number(row.weight),
    })),
    overrides: overrides.map((row) => ({
      id: row.id,
      doc: row.doc || null,
      action: row.action === "disable" ? "disable" : "upsert",
      enabled: row.enabled !== false,
    })),
    providers: providers.map((row): LegacyProviderRow => ({
      id: row.id,
      name: row.name,
      api_base_url: row.api_base_url || null,
      status: row.status,
    })),
    channelProviderIds: channels.map((row) => row.provider_id),
    bailianSnapshot: bailianSnapshotFile ? readJson(bailianSnapshotFile) : null,
  };
}

export interface BackfillRun {
  content: ControlPlaneContent;
  contentSha256: string;
  report: BackfillReport;
  validation: ValidationResult;
  comparison: CatalogComparison;
}

/** Pure: sources → backfilled content, validation and shadow comparison. */
export function runBackfill(sources: LegacySources): BackfillRun {
  const { content, report } = buildBackfill(sources);
  const validation = validateContent(content);
  const legacyModels = computeEffectiveModelsFrom(sources.staticModels, sources.overrides as any);
  const legacyRoutes = [
    ...sources.capacity,
    ...report.synthesizedRoutes.map((row) => ({ ...row, is_enabled: true })),
  ];
  const comparison = compareCatalog(legacyModels, legacyRoutes, indexContent(0, "", content), report.skippedOrphanRoutes);
  return { content, contentSha256: contentSha256(content), report, validation, comparison };
}

/** Errors named in `allowChecks` (known legacy findings) become warnings. */
export function blockingErrors(validation: ValidationResult, allowChecks: string[]): ValidationIssue[] {
  return validation.errors.filter((issue) => !allowChecks.includes(issue.check));
}

export function renderBackfillMarkdown(run: BackfillRun, meta: { source: string; date: string }): string {
  const { content, report, validation, comparison } = run;
  const lines: string[] = [
    `# 控制面回填报告（${meta.date}）`,
    "",
    `来源：${meta.source}。本报告由 \`src/cli/control-plane-backfill.ts\` 生成，只读旧表，不写任何数据。`,
    "",
    "## 概要",
    "",
    `- 模型 ${content.models.length}、上游账号 ${content.accounts.length}、额度池 ${content.pools.length}、路由 ${content.routes.length}、流量策略 ${content.policies.length}`,
    `- 内容 SHA-256：\`${run.contentSha256}\``,
    `- 额度池来源：docs ${report.pools.docs}、legacy_default ${report.pools.legacyDefault}、共享 ${report.pools.shared}`,
    `- 由 ensureRoutingDefaults 补出的路由：${report.synthesizedRoutes.length}`,
    `- 跳过的孤儿路由：${report.skippedOrphanRoutes.length}`,
    `- 兼容桥接（非原生协议）模型：${report.bridgedModels.map((row) => `${row.model_id}（${row.protocols.join(", ")}）`).join("、") || "无"}`,
    "",
    "## 校验",
    "",
    `- 错误 ${validation.errors.length}，警告 ${validation.warnings.length}`,
    "",
  ];
  for (const issue of validation.errors) lines.push(`- ❌ \`${issue.check}\` ${issue.id}：${issue.message}`);
  const warningCounts = new Map<string, number>();
  for (const issue of validation.warnings) warningCounts.set(issue.check, (warningCounts.get(issue.check) || 0) + 1);
  for (const [check, count] of [...warningCounts].sort()) lines.push(`- ⚠️ \`${check}\`：${count} 条`);
  lines.push("", "## 影子比对（旧逻辑 vs 回填版本）", "");
  const diffs = [...comparison.modelDiffs, ...comparison.routeDiffs];
  if (diffs.length === 0) lines.push("零差异：模型目录、价格和启用路由完全一致（已跳过的孤儿路由除外）。");
  for (const diff of diffs) lines.push(`- \`${diff.kind}\` ${diff.modelId}：${diff.detail}`);
  const capabilityIssues = validation.warnings.filter((issue) => issue.check === "display_capabilities");
  if (capabilityIssues.length) {
    lines.push("", "## 能力宣告 vs 结构化能力（展示串将由结构化能力生成）", "");
    lines.push("结构化能力由 `model-capabilities.ts` 的现有推导生成；下列模型的展示串与之不一致（对应 P1a 规则 5），发布前需人工确认以哪边为准。", "");
    for (const issue of capabilityIssues) lines.push(`- ${issue.id}：${issue.message}`);
  }
  if (report.skippedOrphanRoutes.length) {
    lines.push("", "## 跳过的孤儿路由", "");
    for (const row of report.skippedOrphanRoutes) lines.push(`- ${row.provider_id} / ${row.model_id}：${row.reason}`);
  }
  if (report.notes.length) {
    lines.push("", "## 备注", "");
    for (const note of report.notes) lines.push(`- ${note}`);
  }
  return `${lines.join("\n")}\n`;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const date = options.date || new Date().toISOString().slice(0, 10);
  const snapshotFile = options.bailianSnapshot ? path.resolve(options.bailianSnapshot) : undefined;
  let closeDb: (() => Promise<void>) | null = null;
  try {
    let sources: LegacySources;
    if (options.offline) {
      sources = loadOfflineSources(path.resolve(options.offline), snapshotFile);
    } else {
      const client = await import("../db/client");
      closeDb = client.closeDb;
      sources = await loadOnlineSources(snapshotFile);
    }
    const run = runBackfill(sources);
    const source = options.offline
      ? `fixtures ${path.relative(repositoryRoot, path.resolve(options.offline))}`
      : "live database (read-only)";
    const blocking = blockingErrors(run.validation, options.allowChecks);
    console.error(
      `[cp-backfill] models=${run.content.models.length} accounts=${run.content.accounts.length} pools=${run.content.pools.length} routes=${run.content.routes.length} errors=${run.validation.errors.length} blocking=${blocking.length} diffs=${run.comparison.modelDiffs.length + run.comparison.routeDiffs.length}`
    );

    if (options.write) {
      const dir = path.join(repositoryRoot, "docs/control-plane");
      fs.mkdirSync(dir, { recursive: true });
      const base = path.join(dir, `backfill-${options.offline ? "offline" : "online"}-${date}`);
      fs.writeFileSync(`${base}.md`, renderBackfillMarkdown(run, { source, date }));
      fs.writeFileSync(`${base}.content.json`, `${JSON.stringify(run.content, null, 2)}\n`);
      console.error(`[cp-backfill] wrote ${path.relative(repositoryRoot, base)}.{md,content.json}`);
    } else if (!options.apply) {
      process.stdout.write(renderBackfillMarkdown(run, { source, date }));
    }

    if (options.apply) {
      if (blocking.length) {
        for (const issue of blocking) console.error(`  ${issue.check} ${issue.id}: ${issue.message}`);
        throw new Error(`validation failed (${blocking.length} blocking errors); fix legacy data or pass --allow-check <check> for known findings`);
      }
      const { insertVersion } = await import("../control-plane/store");
      const version = await insertVersion({
        content: run.content,
        expectedParent: options.expectedParent,
        kind: "backfill",
        publishedBy: options.publishedBy as string,
        note: `backfill ${date}; allowed checks: ${options.allowChecks.join(", ") || "none"}`,
      });
      console.error(`[cp-backfill] inserted control-plane version ${version.version} (${version.contentSha256})`);
    }
  } finally {
    if (closeDb) await closeDb();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[cp-backfill] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
