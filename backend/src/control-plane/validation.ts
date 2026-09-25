/**
 * Publish-time validation (docs/control-plane-config-design.md §3.2 + D6).
 * A version with any error cannot be published; warnings are shown but do
 * not block.
 */
import {
  CHAT_PROTOCOLS,
  controlPlaneContentSchema,
  type ControlPlaneContent,
  type CpModel,
} from "./schema";
import { BILLING_GUARDED_NAMES, guardedParamBillingSupported } from "./params";

export type ValidationCheck =
  | "schema"
  | "unique_ids"
  | "model_has_active_route"
  | "route_references"
  | "protocols_native"
  | "pricing_sane"
  | "guarded_params_billable"
  | "relay_disclosure"
  | "quota_unverified";

export interface ValidationIssue {
  check: ValidationCheck;
  entity: "model" | "account" | "pool" | "route" | "policy" | "content";
  id: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

function tierIssues(model: CpModel): string[] {
  const issues: string[] = [];
  const pricing = model.pricing;
  const tiers = pricing.tokenPricingTiers || [];
  for (let index = 1; index < tiers.length; index += 1) {
    if (tiers[index].maxTokens <= tiers[index - 1].maxTokens) {
      issues.push(`token tier ${index + 1} upper bound ${tiers[index].maxTokens} is not above tier ${index}`);
    }
  }
  if (tiers.length && tiers[tiers.length - 1].maxTokens < model.limits.context_length) {
    issues.push(`last token tier ends at ${tiers[tiers.length - 1].maxTokens}, below the context length ${model.limits.context_length}`);
  }
  return issues;
}

export function validateContent(input: unknown): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const parsed = controlPlaneContentSchema.safeParse(input);
  if (!parsed.success) {
    for (const issue of parsed.error.issues.slice(0, 20)) {
      errors.push({ check: "schema", entity: "content", id: issue.path.join("."), message: issue.message });
    }
    return { ok: false, errors, warnings };
  }
  const content: ControlPlaneContent = parsed.data;

  // Unique IDs per collection.
  for (const [entity, items] of [
    ["model", content.models],
    ["account", content.accounts],
    ["pool", content.pools],
    ["route", content.routes],
    ["policy", content.policies],
  ] as const) {
    const seen = new Set<string>();
    for (const item of items) {
      if (seen.has(item.id)) errors.push({ check: "unique_ids", entity, id: item.id, message: `duplicate ${entity} id` });
      seen.add(item.id);
    }
  }
  const seenScopes = new Set<string>();
  for (const policy of content.policies) {
    if (seenScopes.has(policy.scope)) errors.push({ check: "unique_ids", entity: "policy", id: policy.id, message: `duplicate policy scope ${policy.scope}` });
    seenScopes.add(policy.scope);
  }

  const models = new Map(content.models.map((model) => [model.id, model]));
  const accounts = new Map(content.accounts.map((account) => [account.id, account]));
  const pools = new Map(content.pools.map((pool) => [pool.id, pool]));

  // (2) Route references, pools belong to the route's account.
  for (const route of content.routes) {
    if (!models.has(route.model_id)) {
      errors.push({ check: "route_references", entity: "route", id: route.id, message: `model ${route.model_id} does not exist` });
    }
    if (!accounts.has(route.account_id)) {
      errors.push({ check: "route_references", entity: "route", id: route.id, message: `account ${route.account_id} does not exist` });
    }
    if (route.quota_pool_id) {
      const pool = pools.get(route.quota_pool_id);
      if (!pool) {
        errors.push({ check: "route_references", entity: "route", id: route.id, message: `quota pool ${route.quota_pool_id} does not exist` });
      } else if (pool.account_id !== route.account_id) {
        errors.push({ check: "route_references", entity: "route", id: route.id, message: `quota pool ${pool.id} belongs to account ${pool.account_id}, not ${route.account_id}` });
      }
    }
  }
  for (const pool of content.pools) {
    if (!accounts.has(pool.account_id)) {
      errors.push({ check: "route_references", entity: "pool", id: pool.id, message: `account ${pool.account_id} does not exist` });
    }
  }

  const activeRoutesByModel = new Map<string, typeof content.routes>();
  for (const route of content.routes) {
    const account = accounts.get(route.account_id);
    if (route.status !== "active" || !account || account.status !== "active") continue;
    const list = activeRoutesByModel.get(route.model_id) || [];
    list.push(route);
    activeRoutesByModel.set(route.model_id, list);
  }

  for (const model of content.models) {
    const active = activeRoutesByModel.get(model.id) || [];
    // (1) Sellable models need at least one active route on an active account.
    if ((model.lifecycle === "active" || model.lifecycle === "preview") && active.length === 0) {
      errors.push({ check: "model_has_active_route", entity: "model", id: model.id, message: `${model.lifecycle} model has no active route on an active account` });
    }
    // (2/D6) Exposed chat protocols must be native on every active route.
    for (const protocol of model.protocols) {
      if (!CHAT_PROTOCOLS.has(protocol)) continue;
      const missing = active.filter((route) => !route.native_protocols.includes(protocol));
      if (missing.length) {
        errors.push({
          check: "protocols_native",
          entity: "model",
          id: model.id,
          message: `exposes ${protocol} but route(s) ${missing.map((route) => route.id).join(", ")} do not support it natively`,
        });
      }
    }
    // (3) Prices: non-negative is enforced by the schema; tiers must ascend
    // and the last tier must cover the whole context.
    for (const message of tierIssues(model)) {
      errors.push({ check: "pricing_sane", entity: "model", id: model.id, message });
    }
    // (4) Guarded parameters only when billing can price them.
    for (const param of model.param_overrides?.allow_guarded || []) {
      if (!BILLING_GUARDED_NAMES.has(param)) {
        errors.push({ check: "guarded_params_billable", entity: "model", id: model.id, message: `${param} is not a billing_guarded parameter` });
      } else if (!guardedParamBillingSupported(model, param)) {
        errors.push({ check: "guarded_params_billable", entity: "model", id: model.id, message: `billing cannot reserve and settle ${param} for this model` });
      }
    }
  }

  for (const account of content.accounts) {
    // (5) Relay accounts must disclose the operator and data path.
    if (account.is_relay && (!account.relay_operator || !account.data_path)) {
      errors.push({ check: "relay_disclosure", entity: "account", id: account.id, message: "relay account requires relay_operator and data_path" });
    }
    // (6) Unverified quotas publish with a standing warning.
    if (account.quota_source === "unverified") {
      warnings.push({ check: "quota_unverified", entity: "account", id: account.id, message: "account quota is unverified" });
    }
  }
  for (const pool of content.pools) {
    if (pool.source === "unverified") {
      warnings.push({ check: "quota_unverified", entity: "pool", id: pool.id, message: "quota pool is unverified" });
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}
