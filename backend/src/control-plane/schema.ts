/**
 * Control-plane configuration snapshot (content of cp_config_versions).
 *
 * One version holds the complete published state of the four entities:
 * models, upstream accounts (+ quota pools), routes and traffic policies.
 * Field names follow docs/specs/control-plane-config-design.md §2.
 */
import { z } from "zod";
import { UPSTREAM_ADAPTERS } from "../pipeline/adapters";

export const CP_PROTOCOLS = [
  "openai.chat",
  "anthropic.messages",
  "openai.responses",
  "openai.embeddings",
  "openai.images",
  "openai.audio.speech",
  "openai.audio.transcriptions",
  "nexusflow.tasks",
] as const;
export type CpProtocol = (typeof CP_PROTOCOLS)[number];

/** Chat protocols governed by D6 (no conversion between them). */
export const CHAT_PROTOCOLS: ReadonlySet<CpProtocol> = new Set(["openai.chat", "anthropic.messages", "openai.responses"]);

export const LIFECYCLES = ["draft", "preview", "active", "deprecated", "retired"] as const;
export const QUOTA_SOURCES = ["console", "contract", "observed", "unverified", "docs", "legacy_default"] as const;

const nonNegative = z.number().finite().nonnegative();
const idString = z.string().min(1).max(160).regex(/^[A-Za-z0-9._:\-\/]+$/);

const tokenTierSchema = z.object({
  label: z.string(),
  maxTokens: z.number().positive(),
  promptPrice: nonNegative,
  completionPrice: nonNegative,
  cacheReadPrice: nonNegative.optional(),
  cacheReadExplicitPrice: nonNegative.optional(),
  thinkingCompletionPrice: nonNegative.optional(),
}).strict();

/** Mirrors the pricing fields of data/models.ts AIModel one-to-one. */
export const cpPricingSchema = z.object({
  pricingType: z.enum(["token", "per-image", "per-second", "per-10k-characters"]).optional(),
  promptPrice: nonNegative,
  completionPrice: nonNegative,
  cacheReadPrice: nonNegative.optional(),
  cacheReadExplicitPrice: nonNegative.optional(),
  thinkingCompletionPrice: nonNegative.optional(),
  audioInputPrice: nonNegative.optional(),
  audioOutputPrice: nonNegative.optional(),
  pricingTiers: z.array(z.object({ label: z.string(), price: nonNegative }).strict()).optional(),
  tokenPricingTiers: z.array(tokenTierSchema).optional(),
  alternatePricingModes: z.array(z.object({
    id: z.string(),
    label: z.string(),
    promptPrice: nonNegative,
    completionPrice: nonNegative,
    availability: z.enum(["available", "announced"]),
    note: z.string().optional(),
  }).strict()).optional(),
  source_url: z.string().optional(),
  verified_at: z.string().optional(),
}).strict();

export const cpCapabilitiesSchema = z.object({
  input: z.object({ text: z.boolean(), image: z.boolean(), video: z.boolean(), audio: z.boolean(), file: z.boolean() }).strict(),
  output: z.object({ text: z.boolean(), audio: z.boolean() }).strict(),
  tools: z.object({ supported: z.boolean(), parallel: z.boolean() }).strict(),
  thinking: z.object({
    mode: z.enum(["none", "mixed", "always", "unknown"]),
    default_on: z.boolean().nullable(),
    budget: z.boolean(),
    preserve: z.boolean(),
    control: z.enum(["enable_thinking", "thinking_object"]).nullable(),
  }).strict(),
  search: z.boolean(),
  caching: z.object({ implicit: z.boolean(), explicit: z.boolean() }).strict(),
  structured_output: z.boolean(),
  /** Legacy parameter-support flags kept so NF_PARAM_MODE=legacy stays exact. */
  sampling: z.object({ top_k: z.boolean(), seed: z.boolean(), logprobs: z.boolean(), repetition_penalty: z.boolean() }).strict(),
}).strict();
export type CpCapabilities = z.infer<typeof cpCapabilitiesSchema>;

export const cpParamOverridesSchema = z.object({
  /** Parameters the platform must rename for this model (adapter concern). */
  rewrite: z.record(z.string(), z.string()).optional(),
  /** Parameters the platform forces (e.g. stream_options.include_usage). */
  fixed: z.record(z.string(), z.unknown()).optional(),
  /** billing_guarded parameters this model's billing handles correctly. */
  allow_guarded: z.array(z.string()).optional(),
}).strict();

export const cpModelSchema = z.object({
  id: idString,
  lifecycle: z.enum(LIFECYCLES),
  display: z.object({
    name: z.string().min(1),
    provider_label: z.string(),
    description: z.string(),
    family: z.string().optional(),
    category: z.string().min(1),
    tags: z.array(z.string()),
    featured: z.boolean().optional(),
    is_new: z.boolean().optional(),
    /** Display capability strings; generated from `capabilities` in P5. */
    supported: z.array(z.string()),
  }).strict(),
  limits: z.object({
    // 0 for media models that have no token context.
    context_length: z.number().int().nonnegative(),
    max_output: z.number().int().nonnegative(),
    default_output_reservation: z.number().int().positive().optional(),
  }).strict(),
  pricing: cpPricingSchema,
  protocols: z.array(z.enum(CP_PROTOCOLS)),
  /**
   * Legacy-only: protocols the platform currently offers by converting
   * (anthropic-openai-bridge). Honoured only while NF_PROTOCOL_MODE=legacy.
   */
  legacy_bridged_protocols: z.array(z.enum(CP_PROTOCOLS)).optional(),
  capabilities: cpCapabilitiesSchema,
  param_overrides: cpParamOverridesSchema.optional(),
  preview_user_ids: z.array(z.string()).default([]),
  /** Legacy-only fields kept for exact round-tripping; see contract checklist. */
  legacy_flags: z.object({ anthropic_pass_through: z.boolean().optional() }).strict().optional(),
  replacement_model_id: z.string().optional(),
  deprecation_date: z.string().optional(),
}).strict();
export type CpModel = z.infer<typeof cpModelSchema>;

const quotaSchema = z.object({
  rpm: z.number().int().nonnegative().optional(),
  tpm: z.number().int().nonnegative().optional(),
  concurrency: z.number().int().nonnegative().optional(),
  daily: z.number().int().nonnegative().optional(),
}).strict();

export const cpAccountSchema = z.object({
  id: idString,
  vendor: z.string().min(1),
  adapter: z.enum(UPSTREAM_ADAPTERS),
  base_url: z.string().nullable(),
  native_base_url: z.string().nullable(),
  anthropic_base_url: z.string().nullable(),
  auth_scheme: z.enum(["bearer", "x-api-key", "api-key"]),
  secret_ref: z.string().min(1),
  region: z.string().nullable(),
  is_relay: z.boolean(),
  relay_operator: z.string().nullable(),
  data_path: z.string().nullable(),
  quota: quotaSchema,
  quota_source: z.enum(QUOTA_SOURCES),
  quota_verified_at: z.string().nullable(),
  status: z.enum(["active", "draining", "disabled"]),
  owner: z.string().nullable(),
  contract_ref: z.string().nullable(),
  contact: z.string().nullable(),
  legacy_provider_id: z.string().nullable(),
  legacy_channel_id: z.string().nullable(),
}).strict();
export type CpAccount = z.infer<typeof cpAccountSchema>;

export const cpQuotaPoolSchema = z.object({
  id: idString,
  account_id: idString,
  name: z.string().min(1),
  rpm: z.number().int().nonnegative(),
  tpm: z.number().int().nonnegative(),
  concurrency: z.number().int().nonnegative(),
  daily: z.number().int().nonnegative(),
  source: z.enum(QUOTA_SOURCES),
  verified_at: z.string().nullable(),
}).strict();
export type CpQuotaPool = z.infer<typeof cpQuotaPoolSchema>;

export const cpRouteSchema = z.object({
  id: idString,
  model_id: idString,
  account_id: idString,
  upstream_model_id: z.string().min(1),
  native_protocols: z.array(z.enum(CP_PROTOCOLS)),
  priority: z.number().int(),
  weight: z.number().int().nonnegative(),
  quota_pool_id: idString.nullable(),
  rpm: z.number().int().nonnegative(),
  tpm: z.number().int().nonnegative(),
  concurrency: z.number().int().nonnegative(),
  daily: z.number().int().nonnegative(),
  status: z.enum(["active", "standby", "disabled"]),
}).strict();
export type CpRoute = z.infer<typeof cpRouteSchema>;

export const cpTrafficPolicySchema = z.object({
  id: idString,
  scope: z.string().regex(/^(global|model:.+|model_type:(chat|async)|user:.+)$/),
  user_default: z.object({ qpm: z.number().int().positive(), tpm: z.number().int().positive() }).strict().optional(),
  fair_share: z.object({ max_share_per_user: z.number().gt(0).max(1) }).strict().optional(),
  overflow: z.object({
    chat: z.object({ behavior: z.literal("failover_then_reject"), retry_after_s: z.number().int().positive() }).strict().optional(),
    async: z.object({
      behavior: z.literal("queue"),
      max_queue_depth: z.number().int().positive(),
      max_wait_s: z.number().int().positive(),
      max_queued_per_user: z.number().int().positive(),
    }).strict().optional(),
  }).strict().optional(),
  circuit: z.object({
    count_http: z.array(z.string()),
    threshold: z.number().int().positive(),
    cooldown_s: z.number().int().positive(),
    half_open_probes: z.number().int().positive(),
  }).strict().optional(),
}).strict();
export type CpTrafficPolicy = z.infer<typeof cpTrafficPolicySchema>;

export const controlPlaneContentSchema = z.object({
  schema_version: z.literal(1),
  models: z.array(cpModelSchema),
  accounts: z.array(cpAccountSchema),
  pools: z.array(cpQuotaPoolSchema),
  routes: z.array(cpRouteSchema),
  policies: z.array(cpTrafficPolicySchema),
}).strict();
export type ControlPlaneContent = z.infer<typeof controlPlaneContentSchema>;

export interface ControlPlaneVersion {
  version: number;
  content: ControlPlaneContent;
  contentSha256: string;
  publishedAt: string;
  publishedBy: string;
  parentVersion: number | null;
}

export const ENTITY_KINDS = ["model", "account", "pool", "route", "policy"] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

export const ENTITY_COLLECTION: Record<EntityKind, keyof Omit<ControlPlaneContent, "schema_version">> = {
  model: "models",
  account: "accounts",
  pool: "pools",
  route: "routes",
  policy: "policies",
};

/** Canonical JSON: sorted keys, undefined omitted. Used for hashing/diffing. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

/** Sorts every collection by id so equal configurations hash equally. */
export function normalizeContent(content: ControlPlaneContent): ControlPlaneContent {
  const byId = <T extends { id: string }>(items: T[]) => [...items].sort((a, b) => a.id.localeCompare(b.id));
  return {
    schema_version: 1,
    models: byId(content.models),
    accounts: byId(content.accounts),
    pools: byId(content.pools),
    routes: byId(content.routes),
    policies: byId(content.policies),
  };
}
