/**
 * Control-plane consistency rules (P1a).
 *
 * Pure functions over a snapshot of the legacy configuration sources: the
 * static catalog, `model_overrides`, `provider_capacity` and `providers`.
 * They never touch the database; the CLI (src/cli/control-plane-consistency.ts)
 * gathers the inputs either from offline fixtures or from a live database.
 *
 * Findings can be turned into a *reviewable* cleanup SQL file. That SQL only
 * ever disables things (`UPDATE ... SET is_enabled = FALSE` / status
 * 'disabled'); it never deletes and is never executed by this code.
 */
import type { AIModel } from "../data/models";
import { computeEffectiveModelsFrom, sanitizeModelDoc, type ModelOverrideRow } from "../data/model-overrides";
import { getModelCapabilities, type ModelCapabilities } from "../utils/model-capabilities";

export interface CapacityRow {
  provider_id: string;
  model_id: string;
  rpm_limit: number;
  tpm_limit: number;
  daily_limit: number;
  concurrent_limit: number;
  is_enabled: boolean;
}

export interface ProviderRow {
  id: string;
  status: string;
  api_base_url: string;
  /** True when the row carries a non-empty (possibly encrypted) api_key. */
  has_api_key: boolean;
}

export interface ConsistencyInput {
  staticModels: AIModel[];
  overrides: Array<Pick<ModelOverrideRow, "id" | "doc" | "action" | "enabled">>;
  capacity: CapacityRow[];
  /** null in offline mode: rule 4 is skipped (reported as such). */
  providers: ProviderRow[] | null;
}

export type RuleId =
  | "sellable_model_without_route"
  | "route_to_unknown_model"
  | "override_identical_to_static"
  | "provider_invalid_url_with_secret"
  | "capability_declaration_mismatch";

export interface Finding {
  rule: RuleId;
  severity: "high" | "medium" | "low";
  subject: string;
  detail: string;
  /** A reviewable, disable-only statement; absent when no safe SQL exists. */
  cleanupSql?: string;
}

export interface ConsistencyReport {
  generatedAt: string;
  mode: "offline" | "online";
  source: string;
  counts: Record<RuleId, number>;
  skippedRules: Array<{ rule: RuleId; reason: string }>;
  findings: Finding[];
}

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>)
    .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
    .join(",")}}`;
}

/** Rule 1: a model that is sold (effective catalog) but has no enabled route. */
export function findSellableModelsWithoutRoute(input: ConsistencyInput): Finding[] {
  const effective = computeEffectiveModelsFrom(input.staticModels, input.overrides as ModelOverrideRow[]);
  const enabledProviders = input.providers
    ? new Set(input.providers.filter((row) => row.status === "enabled").map((row) => row.id))
    : null;
  const routed = new Set(
    input.capacity
      .filter((row) => row.is_enabled && (!enabledProviders || enabledProviders.has(row.provider_id)))
      .map((row) => row.model_id)
  );
  return effective
    .filter((model) => !routed.has(model.id))
    .map((model) => {
      const disabledRoutes = input.capacity.filter((row) => row.model_id === model.id);
      return {
        rule: "sellable_model_without_route" as const,
        severity: "high" as const,
        subject: model.id,
        detail: disabledRoutes.length
          ? `sold in the catalog but every route is disabled (${disabledRoutes.map((row) => row.provider_id).join(", ")})`
          : "sold in the catalog but has no provider_capacity route",
        // No disable-only SQL can fix this safely: hiding the model needs a
        // catalog decision (model_overrides disable or a real route).
      };
    });
}

/** Rule 2: a route whose model does not exist in the effective catalog. */
export function findRoutesToUnknownModels(input: ConsistencyInput): Finding[] {
  const effective = new Set(
    computeEffectiveModelsFrom(input.staticModels, input.overrides as ModelOverrideRow[]).map((model) => model.id)
  );
  return input.capacity
    .filter((row) => !effective.has(row.model_id))
    .map((row) => ({
      rule: "route_to_unknown_model" as const,
      severity: row.is_enabled ? ("high" as const) : ("low" as const),
      subject: `${row.provider_id}/${row.model_id}`,
      detail: row.is_enabled
        ? "enabled route points at a model that is not in the catalog"
        : "disabled route points at a model that is not in the catalog (already inert)",
      cleanupSql: row.is_enabled
        ? `UPDATE provider_capacity SET is_enabled = FALSE, updated_at = NOW() WHERE provider_id = ${sqlLiteral(row.provider_id)} AND model_id = ${sqlLiteral(row.model_id)} AND is_enabled = TRUE;`
        : undefined,
    }));
}

/**
 * Display-only fields: they change what the catalog page shows but not
 * pricing, limits, routing or billing.
 */
export const DISPLAY_ONLY_MODEL_FIELDS: ReadonlySet<string> = new Set([
  "name",
  "description",
  "tags",
  "supported",
  "isNew",
  "isFeatured",
]);

/**
 * Rule 3: an enabled upsert override that adds nothing over the static entry.
 * "Identical" means every pricing/limit/runtime field equals the static entry;
 * display-only differences are listed in the finding because they are a
 * second, unaudited source of truth for what the model claims (the
 * 2026-09-25 glm-5.2-fast-preview row only adds "联网搜索" to `supported`).
 */
export function findRedundantOverrides(input: ConsistencyInput): Finding[] {
  const staticById = new Map(input.staticModels.map((model) => [model.id, model]));
  const findings: Finding[] = [];
  for (const row of input.overrides) {
    if (!row.enabled || row.action !== "upsert" || !row.doc) continue;
    const base = staticById.get(row.id);
    if (!base) continue;
    const override = sanitizeModelDoc(row.doc);
    const seed = sanitizeModelDoc(base);
    if (!override.ok || !seed.ok) continue;
    const a = override.model as unknown as Record<string, unknown>;
    const b = seed.model as unknown as Record<string, unknown>;
    const differing = [...new Set([...Object.keys(a), ...Object.keys(b)])]
      .filter((key) => canonical(a[key]) !== canonical(b[key]))
      .sort();
    if (differing.some((key) => !DISPLAY_ONLY_MODEL_FIELDS.has(key))) continue;
    findings.push({
      rule: "override_identical_to_static",
      severity: differing.length ? "medium" : "low",
      subject: row.id,
      detail: differing.length
        ? `model_overrides row equals the static entry in every pricing/limit/runtime field and differs only in display fields (${differing.join(", ")}); disabling it reverts the display to the static catalog`
        : "model_overrides row is identical to the static catalog entry; disabling it changes nothing but removes a second source of truth",
      cleanupSql: `UPDATE model_overrides SET enabled = FALSE, updated_at = NOW() WHERE id = ${sqlLiteral(row.id)} AND action = 'upsert' AND enabled = TRUE;`,
    });
  }
  return findings;
}

function isValidProviderUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !!url.hostname;
  } catch {
    return false;
  }
}

/** Rule 4: a provider whose base URL is not a valid URL yet holds a secret. */
export function findInvalidProviderUrls(providers: ProviderRow[]): Finding[] {
  return providers
    .filter((row) => row.has_api_key && !isValidProviderUrl(row.api_base_url || ""))
    .map((row) => ({
      rule: "provider_invalid_url_with_secret" as const,
      severity: "high" as const,
      subject: row.id,
      detail: "api_base_url is not a valid https URL but the row stores an api_key; rotate the key and disable the provider",
      cleanupSql: row.status === "disabled"
        ? undefined
        : `UPDATE providers SET status = 'disabled', updated_at = NOW() WHERE id = ${sqlLiteral(row.id)} AND status <> 'disabled';`,
    }));
}

/**
 * Display labels in `supported` and the capability each one promises. Only
 * labels with an unambiguous capability are checked.
 */
export const CAPABILITY_LABELS: ReadonlyArray<{
  label: string;
  capability: string;
  test: (capabilities: ModelCapabilities) => boolean;
}> = [
  { label: "函数调用", capability: "supports_tools", test: (c) => c.supports_tools },
  { label: "思考模式", capability: "thinking_mode!=none", test: (c) => c.thinking_mode !== "none" },
  { label: "联网搜索", capability: "supports_search", test: (c) => c.supports_search },
  { label: "上下文缓存", capability: "supports_context_caching", test: (c) => c.supports_context_caching },
  { label: "图像输入", capability: "supports_vision", test: (c) => c.supports_vision },
  { label: "视频输入", capability: "supports_video_input", test: (c) => c.supports_video_input },
  { label: "音频输入", capability: "supports_audio_input", test: (c) => c.supports_audio_input },
  { label: "音频输出", capability: "supports_audio_output", test: (c) => c.supports_audio_output },
];

/**
 * Rule 5: a declared display capability that the runtime capability model
 * (and therefore the parameter allowlist) does not grant, e.g. "联网搜索" on a
 * model whose enable_search is silently stripped.
 */
export function findCapabilityMismatches(input: ConsistencyInput): Finding[] {
  const effective = computeEffectiveModelsFrom(input.staticModels, input.overrides as ModelOverrideRow[]);
  const findings: Finding[] = [];
  for (const model of effective) {
    const capabilities = getModelCapabilities(model);
    if (capabilities.model_type !== "chat") continue;
    for (const entry of CAPABILITY_LABELS) {
      if (model.supported.includes(entry.label) && !entry.test(capabilities)) {
        findings.push({
          rule: "capability_declaration_mismatch",
          severity: entry.label === "联网搜索" || entry.label === "函数调用" ? "medium" : "low",
          subject: model.id,
          detail: `declares "${entry.label}" but ${entry.capability} is false, so the related parameters are not honoured`,
        });
      }
    }
  }
  return findings;
}

export function runConsistencyChecks(
  input: ConsistencyInput,
  meta: { mode: "offline" | "online"; source: string; now?: Date }
): ConsistencyReport {
  const findings = [
    ...findSellableModelsWithoutRoute(input),
    ...findRoutesToUnknownModels(input),
    ...findRedundantOverrides(input),
    ...(input.providers ? findInvalidProviderUrls(input.providers) : []),
    ...findCapabilityMismatches(input),
  ];
  const counts = {
    sellable_model_without_route: 0,
    route_to_unknown_model: 0,
    override_identical_to_static: 0,
    provider_invalid_url_with_secret: 0,
    capability_declaration_mismatch: 0,
  } as Record<RuleId, number>;
  for (const finding of findings) counts[finding.rule] += 1;
  return {
    generatedAt: (meta.now || new Date()).toISOString(),
    mode: meta.mode,
    source: meta.source,
    counts,
    skippedRules: input.providers
      ? []
      : [{ rule: "provider_invalid_url_with_secret", reason: "offline mode has no providers table export" }],
    findings,
  };
}

export function renderConsistencyMarkdown(report: ConsistencyReport): string {
  const lines = [
    `# 控制面一致性检查（${report.mode}）`,
    "",
    `- 生成时间：${report.generatedAt}`,
    `- 数据来源：${report.source}`,
    "",
    "| 规则 | 数量 |",
    "|---|---|",
    ...Object.entries(report.counts).map(([rule, count]) => `| \`${rule}\` | ${count} |`),
    "",
  ];
  for (const skipped of report.skippedRules) {
    lines.push(`> 跳过 \`${skipped.rule}\`：${skipped.reason}`, "");
  }
  for (const rule of Object.keys(report.counts) as RuleId[]) {
    const items = report.findings.filter((finding) => finding.rule === rule);
    if (!items.length) continue;
    lines.push(`## \`${rule}\``, "", "| 对象 | 严重度 | 说明 | 有清理 SQL |", "|---|---|---|---|");
    for (const item of items) {
      lines.push(`| \`${item.subject}\` | ${item.severity} | ${item.detail.replace(/\|/g, "\\|")} | ${item.cleanupSql ? "是" : "否"} |`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

/**
 * Renders the cleanup SQL. Every statement is preceded by a comment with its
 * reason; the file is wrapped in a transaction and is never executed here.
 */
export function renderCleanupSql(report: ConsistencyReport): string {
  const statements = report.findings.filter((finding) => finding.cleanupSql);
  const lines = [
    `-- NexusFlow control-plane cleanup (${report.mode}), generated ${report.generatedAt}`,
    `-- Source: ${report.source}`,
    "-- REVIEW EVERY STATEMENT. This file is generated only; nothing ran it.",
    "-- Disable-only: no DELETE, no DROP. Run inside a maintenance window after a",
    "-- fresh backup, and re-run control-plane-consistency afterwards.",
    "",
    "BEGIN;",
    "",
  ];
  for (const finding of statements) {
    lines.push(`-- [${finding.rule}] ${finding.subject}: ${finding.detail}`);
    lines.push(finding.cleanupSql!);
    lines.push("");
  }
  if (!statements.length) lines.push("-- No disable-only cleanup statements were generated.", "");
  lines.push("COMMIT;", "");
  const text = lines.join("\n");
  if (/\bDELETE\b|\bDROP\b|\bTRUNCATE\b/i.test(text.replace(/^--.*$/gm, ""))) {
    throw new Error("cleanup SQL must be disable-only");
  }
  return text;
}
