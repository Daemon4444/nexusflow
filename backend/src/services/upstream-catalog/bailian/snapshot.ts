/**
 * Bailian official-catalog snapshot: schema, builder, self-checks and diffs.
 *
 * Nothing here writes configuration. The sync CLI stores the snapshot and a
 * report; people decide what, if anything, to change.
 */
import { createHash } from "crypto";
import { z } from "zod";
import type { AIModel } from "../../../data/models";
import { detectModelType } from "../../adapters";
import type { Ref } from "../../../data/official-pricing-ref";
import {
  parseModelsPage,
  parsePricingPage,
  parseRateLimitPage,
  REGION_CODES,
  type ModelPricing,
  type ParseWarning,
  type QuotaPool,
  type RegionLimit,
} from "./parse";

// ------------------------------------------------------------------ schema

const regionCode = z.enum(REGION_CODES);
const nonNegative = z.number().finite().nonnegative();

const regionLimitSchema = z.object({
  rpm: nonNegative.optional(),
  tpm: nonNegative.optional(),
  rps: nonNegative.optional(),
  concurrency: nonNegative.optional(),
  dynamic: z.literal(true).optional(),
  poolId: z.string().regex(/^pool-[0-9a-f]{16}$/).optional(),
  scope: z.string().max(40).optional(),
}).strict();

const priceTierSchema = z.object({
  minTokens: z.number().int().nonnegative(),
  maxTokens: z.number().int().positive().nullable(),
  input: nonNegative,
  output: nonNegative,
  thinkingOutput: nonNegative.optional(),
  cacheHitInput: nonNegative.optional(),
  promotion: z.string().max(60).optional(),
}).strict();

const pricingSchema = z.object({
  currency: z.literal("CNY"),
  unit: z.literal("per_million_tokens"),
  region: regionCode,
  scope: z.string().max(40),
  tiers: z.array(priceTierSchema).min(1),
}).strict();

export const bailianSnapshotSchema = z.object({
  source: z.literal("bailian"),
  fetchedAt: z.string().datetime({ offset: true }),
  mode: z.enum(["online", "offline"]),
  pages: z.array(z.object({ url: z.string().url(), sha256: z.string().regex(/^[0-9a-f]{64}$/) }).strict()).min(1),
  models: z.record(
    z.string().min(1).max(160),
    z.object({
      listed: z.boolean(),
      featured: z.boolean().optional(),
      regions: z.record(z.string(), regionLimitSchema),
      pricing: pricingSchema.optional(),
      contextLength: z.number().int().positive().optional(),
      maxOutput: z.number().int().positive().optional(),
    }).strict()
  ),
  pools: z.record(
    z.string().regex(/^pool-[0-9a-f]{16}$/),
    z.object({
      region: regionCode,
      rpm: nonNegative.optional(),
      tpm: nonNegative.optional(),
      concurrency: nonNegative.optional(),
      members: z.array(z.string()).min(2),
    }).strict()
  ),
  warnings: z.array(z.object({ page: z.string(), message: z.string() }).strict()),
}).strict();

export type BailianSnapshot = z.infer<typeof bailianSnapshotSchema>;

// ----------------------------------------------------------------- builder

export const BAILIAN_PAGE_URLS = {
  rateLimit: "https://help.aliyun.com/zh/model-studio/rate-limit",
  modelPricing: "https://help.aliyun.com/zh/model-studio/model-pricing",
  models: "https://help.aliyun.com/zh/model-studio/models",
  modelList: "https://dashscope.aliyuncs.com/compatible-mode/v1/models",
} as const;

export interface BailianSources {
  rateLimitHtml: string;
  modelPricingHtml: string;
  modelsHtml: string;
  /** IDs from GET /compatible-mode/v1/models (all pages). */
  listedModelIds: string[];
  /** Raw bytes of the model list response(s), hashed for provenance. */
  modelListRaw: string;
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function buildSnapshot(
  sources: BailianSources,
  meta: { fetchedAt: string; mode: "online" | "offline" }
): BailianSnapshot {
  const rateLimits = parseRateLimitPage(sources.rateLimitHtml);
  const pricing = parsePricingPage(sources.modelPricingHtml);
  const featured = new Set(parseModelsPage(sources.modelsHtml));
  const listed = new Set(sources.listedModelIds);
  const ids = new Set<string>([
    ...listed,
    ...Object.keys(rateLimits.limits),
    ...Object.keys(pricing.pricing),
  ]);
  const models: BailianSnapshot["models"] = {};
  for (const id of [...ids].sort()) {
    const entry: BailianSnapshot["models"][string] = {
      listed: listed.has(id),
      regions: (rateLimits.limits[id] || {}) as Record<string, RegionLimit>,
    };
    if (featured.has(id)) entry.featured = true;
    if (pricing.pricing[id]) entry.pricing = pricing.pricing[id];
    models[id] = entry;
  }
  const snapshot = {
    source: "bailian" as const,
    fetchedAt: meta.fetchedAt,
    mode: meta.mode,
    pages: [
      { url: BAILIAN_PAGE_URLS.rateLimit, sha256: sha256(sources.rateLimitHtml) },
      { url: BAILIAN_PAGE_URLS.modelPricing, sha256: sha256(sources.modelPricingHtml) },
      { url: BAILIAN_PAGE_URLS.models, sha256: sha256(sources.modelsHtml) },
      { url: BAILIAN_PAGE_URLS.modelList, sha256: sha256(sources.modelListRaw) },
    ],
    models,
    pools: rateLimits.pools as Record<string, QuotaPool>,
    warnings: [...rateLimits.warnings, ...pricing.warnings] as ParseWarning[],
  };
  return bailianSnapshotSchema.parse(snapshot);
}

// -------------------------------------------------------------- self-check

/**
 * Minimum number of models a healthy parse must produce. Set to ~90% of the
 * 2026-09-25 fixture counts (504 distinct IDs, 433 with rate limits, 212 with
 * Beijing token pricing, 261 listed by the API) to leave room for upstream
 * retirements while still catching a broken parser.
 */
export const MIN_SNAPSHOT_MODELS = 450;
export const MIN_RATE_LIMITED_MODELS = 390;
export const MIN_PRICED_MODELS = 190;
export const MIN_SNAPSHOT_RATIO = 0.8;

/**
 * Values the owner verified by hand on 2026-09-25. They are canaries for
 * parser breakage; when upstream really changes one, update it here only
 * after a person re-verifies the official page.
 */
export const GOLDEN_LIMITS: ReadonlyArray<{
  model: string;
  region: (typeof REGION_CODES)[number];
  rpm: number;
  tpm: number;
  poolMembers?: number;
}> = [
  { model: "glm-5.2", region: "cn-beijing", rpm: 500, tpm: 2_000_000 },
  { model: "deepseek-v4-flash", region: "cn-beijing", rpm: 15_000, tpm: 1_200_000 },
  { model: "MiniMax/MiniMax-M3", region: "cn-beijing", rpm: 500, tpm: 20_000_000 },
  { model: "kimi/kimi-k3", region: "cn-beijing", rpm: 500, tpm: 3_000_000, poolMembers: 5 },
];

export interface PriceCheckIssue {
  model: string;
  classification: "parser_issue" | "ref_outdated";
  detail: string;
}

export interface SelfCheckResult {
  ok: boolean;
  failures: string[];
  priceIssues: PriceCheckIssue[];
  priceModelsCompared: number;
}

const at6 = (value: number) => Math.round(value * 1_000_000) / 1_000_000;

/**
 * Compares parsed prices with the hand-verified REF for every overlapping
 * Bailian model. Structural differences (tier count / boundaries / missing
 * values) are parser issues; equal structure with different numbers means the
 * REF may be outdated. Neither is auto-resolved.
 */
export function compareWithRef(
  snapshot: BailianSnapshot,
  ref: Record<string, Ref>
): { compared: number; issues: PriceCheckIssue[] } {
  const issues: PriceCheckIssue[] = [];
  let compared = 0;
  for (const [id, expected] of Object.entries(ref)) {
    const parsed = snapshot.models[id]?.pricing;
    if (!parsed) continue;
    compared += 1;
    const expectedTiers = expected.tiers
      ? expected.tiers.map((tier) => ({ max: tier.max, in: tier.in, out: tier.out, thinkingOut: tier.thinkingOut }))
      : expected.in !== undefined && expected.out !== undefined
        ? [{ max: undefined as number | undefined, in: expected.in, out: expected.out, thinkingOut: expected.thinkingOut }]
        : [];
    if (!expectedTiers.length) continue;
    if (parsed.tiers.length !== expectedTiers.length) {
      issues.push({
        model: id,
        classification: "parser_issue",
        detail: `parsed ${parsed.tiers.length} tier(s), REF has ${expectedTiers.length}`,
      });
      continue;
    }
    expectedTiers.forEach((tier, index) => {
      const actual = parsed.tiers[index];
      // The final tier's upper bound is a convention (REF stores the context
      // length, the page prints the nominal "≤200K"); only inner boundaries
      // carry pricing meaning.
      const isLastTier = index === expectedTiers.length - 1;
      if (expected.tiers && !isLastTier && tier.max !== undefined && actual.maxTokens !== null && actual.maxTokens !== tier.max) {
        issues.push({ model: id, classification: "parser_issue", detail: `tier ${index + 1} max ${actual.maxTokens} ≠ REF ${tier.max}` });
      }
      if (at6(actual.input) !== tier.in) {
        issues.push({ model: id, classification: "ref_outdated", detail: `tier ${index + 1} input ${actual.input} ≠ REF ${tier.in}` });
      }
      if (at6(actual.output) !== tier.out) {
        issues.push({ model: id, classification: "ref_outdated", detail: `tier ${index + 1} output ${actual.output} ≠ REF ${tier.out}` });
      }
      if (tier.thinkingOut !== undefined && at6(actual.thinkingOutput ?? actual.output) !== tier.thinkingOut) {
        issues.push({
          model: id,
          classification: actual.thinkingOutput === undefined ? "parser_issue" : "ref_outdated",
          detail: `tier ${index + 1} thinking output ${actual.thinkingOutput ?? "missing"} ≠ REF ${tier.thinkingOut}`,
        });
      }
    });
  }
  return { compared, issues };
}

export function selfCheck(
  snapshot: BailianSnapshot,
  options: { previous?: BailianSnapshot | null; ref: Record<string, Ref> }
): SelfCheckResult {
  const failures: string[] = [];
  const modelCount = Object.keys(snapshot.models).length;
  const rateLimited = Object.values(snapshot.models).filter((model) => Object.keys(model.regions).length > 0).length;
  const priced = Object.values(snapshot.models).filter((model) => model.pricing).length;
  if (modelCount < MIN_SNAPSHOT_MODELS) failures.push(`only ${modelCount} models parsed (minimum ${MIN_SNAPSHOT_MODELS})`);
  if (rateLimited < MIN_RATE_LIMITED_MODELS) failures.push(`only ${rateLimited} rate-limited models parsed (minimum ${MIN_RATE_LIMITED_MODELS})`);
  if (priced < MIN_PRICED_MODELS) failures.push(`only ${priced} priced models parsed (minimum ${MIN_PRICED_MODELS})`);
  if (options.previous) {
    const previousCount = Object.keys(options.previous.models).length;
    if (modelCount < previousCount * MIN_SNAPSHOT_RATIO) {
      failures.push(`model count dropped to ${modelCount} from ${previousCount} (below ${MIN_SNAPSHOT_RATIO * 100}%)`);
    }
  }
  for (const golden of GOLDEN_LIMITS) {
    const limit = snapshot.models[golden.model]?.regions[golden.region];
    if (!limit || limit.rpm !== golden.rpm || limit.tpm !== golden.tpm) {
      failures.push(`${golden.model} ${golden.region} expected ${golden.rpm} RPM / ${golden.tpm} TPM, parsed ${JSON.stringify(limit || null)}`);
      continue;
    }
    if (golden.poolMembers) {
      const pool = limit.poolId ? snapshot.pools[limit.poolId] : undefined;
      if (!pool || pool.members.length !== golden.poolMembers || pool.rpm !== golden.rpm || pool.tpm !== golden.tpm) {
        failures.push(`${golden.model} expected a ${golden.poolMembers}-member shared pool of ${golden.rpm}/${golden.tpm}, parsed ${JSON.stringify(pool || null)}`);
      }
    }
  }
  const prices = compareWithRef(snapshot, options.ref);
  for (const issue of prices.issues) {
    failures.push(`price ${issue.classification}: ${issue.model} ${issue.detail}`);
  }
  return { ok: failures.length === 0, failures, priceIssues: prices.issues, priceModelsCompared: prices.compared };
}

// --------------------------------------------------------------------- diff

export type DiffCategory =
  | "price_mismatch"
  | "context_mismatch"
  | "limit_above_upstream"
  | "limit_below_upstream"
  | "pool_not_modeled"
  | "sold_but_not_listed"
  | "listed_not_sold"
  | "parse_warning";

export interface DiffEntry {
  category: DiffCategory;
  model: string;
  detail: string;
  ours?: unknown;
  upstream?: unknown;
}

export interface UpstreamChange {
  model: string;
  field: "listed" | "limits" | "pricing";
  before: unknown;
  after: unknown;
}

export interface ConfigCapacityRow {
  provider_id: string;
  model_id: string;
  rpm_limit: number;
  tpm_limit: number;
  is_enabled: boolean;
}

export interface OurConfig {
  /** Catalog models sold through the Bailian (dashscope) account. */
  bailianModels: AIModel[];
  /** Every sold model ID (to decide listed_not_sold). */
  soldModelIds: Set<string>;
  capacity: ConfigCapacityRow[];
  /** Pool IDs already modelled as shared quota (empty before cp_quota_pools). */
  modeledPoolIds?: Set<string>;
}

function ourTiers(model: AIModel): Array<{ max: number | null; input: number; output: number; thinking?: number }> {
  if (model.tokenPricingTiers?.length) {
    return model.tokenPricingTiers.map((tier) => ({
      max: tier.maxTokens,
      input: tier.promptPrice,
      output: tier.completionPrice,
      thinking: tier.thinkingCompletionPrice ?? model.thinkingCompletionPrice,
    }));
  }
  return [{ max: null, input: model.promptPrice, output: model.completionPrice, thinking: model.thinkingCompletionPrice }];
}

function pricingMismatch(model: AIModel, pricing: ModelPricing): string | null {
  const ours = ourTiers(model);
  if (ours.length !== pricing.tiers.length) {
    return `${ours.length} tier(s) vs upstream ${pricing.tiers.length}`;
  }
  for (let index = 0; index < ours.length; index += 1) {
    const mine = ours[index];
    const theirs = pricing.tiers[index];
    if (at6(mine.input) !== at6(theirs.input)) return `tier ${index + 1} input ${mine.input} vs upstream ${theirs.input}`;
    if (at6(mine.output) !== at6(theirs.output)) return `tier ${index + 1} output ${mine.output} vs upstream ${theirs.output}`;
    const upstreamThinking = theirs.thinkingOutput;
    if (upstreamThinking !== undefined && at6(mine.thinking ?? mine.output) !== at6(upstreamThinking)) {
      return `tier ${index + 1} thinking output ${mine.thinking ?? mine.output} vs upstream ${upstreamThinking}`;
    }
    if (
      index < ours.length - 1 && mine.max !== null && theirs.maxTokens !== null && mine.max !== theirs.maxTokens
    ) {
      return `tier ${index + 1} boundary ${mine.max} vs upstream ${theirs.maxTokens}`;
    }
  }
  return null;
}

export function diffAgainstConfig(snapshot: BailianSnapshot, config: OurConfig): DiffEntry[] {
  const entries: DiffEntry[] = [];
  for (const model of config.bailianModels) {
    const upstream = snapshot.models[model.id];
    // /compatible-mode/v1/models lists OpenAI-compatible (chat) models only;
    // media, audio and embedding models count as listed when documented.
    const isChat = detectModelType(model.category) === "chat";
    const documented = !!upstream && (Object.keys(upstream.regions).length > 0 || !!upstream.pricing);
    if (!upstream || (isChat ? !upstream.listed : !upstream.listed && !documented)) {
      entries.push({
        category: "sold_but_not_listed",
        model: model.id,
        detail: !upstream
          ? "absent from the official model list and docs"
          : "documented but absent from /compatible-mode/v1/models",
      });
    }
    if (!upstream) continue;
    if ((model.pricingType || "token") === "token" && upstream.pricing) {
      const mismatch = pricingMismatch(model, upstream.pricing);
      if (mismatch) {
        entries.push({ category: "price_mismatch", model: model.id, detail: mismatch, ours: ourTiers(model), upstream: upstream.pricing.tiers });
      }
    }
    if (upstream.contextLength && upstream.contextLength !== model.contextLength) {
      entries.push({ category: "context_mismatch", model: model.id, detail: `contextLength ${model.contextLength} vs upstream ${upstream.contextLength}` });
    }
    if (upstream.maxOutput && upstream.maxOutput !== model.maxOutput) {
      entries.push({ category: "context_mismatch", model: model.id, detail: `maxOutput ${model.maxOutput} vs upstream ${upstream.maxOutput}` });
    }
    const limit = upstream.regions["cn-beijing"];
    const route = config.capacity.find((row) => row.provider_id === "dashscope" && row.model_id === model.id);
    if (limit && route) {
      if (limit.dynamic) {
        entries.push({ category: "parse_warning", model: model.id, detail: "upstream limit is dynamic (动态限流); our fixed route limit cannot be compared", ours: { rpm: route.rpm_limit, tpm: route.tpm_limit } });
      } else {
        for (const [field, ours, theirs] of [
          ["rpm", route.rpm_limit, limit.rpm],
          ["tpm", route.tpm_limit, limit.tpm],
        ] as const) {
          if (theirs === undefined || !ours) continue;
          if (ours > theirs) {
            entries.push({ category: "limit_above_upstream", model: model.id, detail: `${field} ${ours} is above upstream ${theirs}${limit.poolId ? " (shared pool)" : ""}`, ours, upstream: theirs });
          } else if (ours < theirs) {
            entries.push({ category: "limit_below_upstream", model: model.id, detail: `${field} ${ours} is below upstream ${theirs}`, ours, upstream: theirs });
          }
        }
      }
    }
  }
  // Shared pools whose members we sell but do not model as one quota.
  const sold = config.soldModelIds;
  for (const [poolId, pool] of Object.entries(snapshot.pools)) {
    const soldMembers = pool.members.filter((member) => sold.has(member));
    if (!soldMembers.length || config.modeledPoolIds?.has(poolId)) continue;
    entries.push({
      category: "pool_not_modeled",
      model: soldMembers.join(", "),
      detail: `${pool.members.length} models share ${JSON.stringify({ rpm: pool.rpm, tpm: pool.tpm, concurrency: pool.concurrency })} in ${pool.region}; per-model limits cannot stop the shared 429`,
      upstream: pool,
    });
  }
  for (const [id, upstream] of Object.entries(snapshot.models)) {
    if (upstream.listed && !sold.has(id)) {
      entries.push({ category: "listed_not_sold", model: id, detail: "listed by the upstream API but not in our catalog" });
    }
  }
  for (const warning of snapshot.warnings) {
    entries.push({ category: "parse_warning", model: "-", detail: `${warning.page}: ${warning.message}` });
  }
  return entries;
}

export function diffAgainstPrevious(current: BailianSnapshot, previous: BailianSnapshot | null): UpstreamChange[] {
  if (!previous) return [];
  const changes: UpstreamChange[] = [];
  const ids = new Set([...Object.keys(current.models), ...Object.keys(previous.models)]);
  for (const id of [...ids].sort()) {
    const after = current.models[id];
    const before = previous.models[id];
    if (!!after?.listed !== !!before?.listed) {
      changes.push({ model: id, field: "listed", before: !!before?.listed, after: !!after?.listed });
    }
    if (JSON.stringify(after?.regions || {}) !== JSON.stringify(before?.regions || {})) {
      changes.push({ model: id, field: "limits", before: before?.regions || null, after: after?.regions || null });
    }
    if (JSON.stringify(after?.pricing || null) !== JSON.stringify(before?.pricing || null)) {
      changes.push({ model: id, field: "pricing", before: before?.pricing || null, after: after?.pricing || null });
    }
  }
  return changes;
}
