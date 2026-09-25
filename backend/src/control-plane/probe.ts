/**
 * Route probes (P5): for every active route, one minimal real request per
 * declared chat protocol and capability — text, tool call, image input,
 * thinking on/off. A result that contradicts the declaration is reported
 * (notify) and stored in cp_route_probe_results. Only people run this
 * against real upstreams (cli/route-probe.ts); tests use a mock upstream.
 * All traffic goes through safeProviderFetch.
 */
import { randomUUID } from "node:crypto";
import { safeProviderFetch } from "../services/outbound-url-policy";
import type { LoadedControlPlane } from "./runtime";
import { CHAT_PROTOCOLS, type CpAccount, type CpModel, type CpProtocol, type CpRoute } from "./schema";

export type ProbeCapability = "text" | "tools" | "image_input" | "thinking_on" | "thinking_off";

export interface ProbePlan {
  route: CpRoute;
  account: CpAccount;
  model: CpModel;
  protocol: CpProtocol;
  capability: ProbeCapability;
}

export interface ProbeResult {
  routeId: string;
  modelId: string;
  accountId: string;
  protocol: CpProtocol;
  capability: ProbeCapability;
  ok: boolean;
  expected: boolean;
  httpStatus: number | null;
  latencyMs: number;
  error: string | null;
  usage: unknown;
}

// 1×1 transparent PNG.
const TINY_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const WEATHER_TOOL = {
  name: "get_weather",
  description: "Get the weather for a city",
  parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
};

export function planProbes(snapshot: LoadedControlPlane, filter: { modelId?: string; routeId?: string } = {}): ProbePlan[] {
  const plans: ProbePlan[] = [];
  for (const [modelId, routes] of snapshot.routesByModel) {
    if (filter.modelId && filter.modelId !== modelId) continue;
    const model = snapshot.models.get(modelId);
    if (!model || model.lifecycle === "retired" || model.lifecycle === "draft") continue;
    for (const route of routes) {
      if (filter.routeId && filter.routeId !== route.id) continue;
      const account = snapshot.accounts.get(route.account_id);
      if (route.status !== "active" || !account || account.status !== "active") continue;
      for (const protocol of model.protocols) {
        if (!CHAT_PROTOCOLS.has(protocol) || !route.native_protocols.includes(protocol)) continue;
        const capabilities: ProbeCapability[] = ["text"];
        if (model.capabilities.tools.supported) capabilities.push("tools");
        if (model.capabilities.input.image) capabilities.push("image_input");
        if (model.capabilities.thinking.mode === "mixed" && model.capabilities.thinking.control) {
          capabilities.push("thinking_on", "thinking_off");
        }
        for (const capability of capabilities) plans.push({ route, account, model, protocol, capability });
      }
    }
  }
  return plans;
}

function authHeaders(account: CpAccount, apiKey: string, protocol: CpProtocol): Record<string, string> {
  if (protocol === "anthropic.messages" || account.auth_scheme === "x-api-key") {
    return { "x-api-key": apiKey, "anthropic-version": "2023-06-01" };
  }
  if (account.auth_scheme === "api-key") return { "api-key": apiKey };
  return { Authorization: `Bearer ${apiKey}` };
}

export function buildProbeRequest(plan: ProbePlan): { url: string; body: Record<string, unknown> } {
  const { account, route, protocol, capability, model } = plan;
  const upstreamModel = route.upstream_model_id;
  const thinking = capability === "thinking_on" ? true : capability === "thinking_off" ? false : null;
  if (protocol === "anthropic.messages") {
    const base = (account.anthropic_base_url || account.base_url || "").replace(/\/$/, "");
    const content: unknown = capability === "image_input"
      ? [{ type: "image", source: { type: "base64", media_type: "image/png", data: TINY_PNG.split(",")[1] } }, { type: "text", text: "What is in this image? One word." }]
      : capability === "tools" ? "What is the weather in Beijing? Use the tool." : "Reply with the single word: ok";
    return {
      url: `${base}/messages`,
      body: {
        model: upstreamModel,
        max_tokens: thinking ? 2048 : 32,
        messages: [{ role: "user", content }],
        ...(capability === "tools" ? { tools: [{ name: WEATHER_TOOL.name, description: WEATHER_TOOL.description, input_schema: WEATHER_TOOL.parameters }], tool_choice: { type: "any" } } : {}),
        ...(thinking === true ? { thinking: { type: "enabled", budget_tokens: 1024 } } : {}),
      },
    };
  }
  const base = (account.base_url || "").replace(/\/$/, "");
  const thinkingParams = thinking === null ? {}
    : model.capabilities.thinking.control === "enable_thinking" ? { enable_thinking: thinking }
      : { thinking: { type: thinking ? "enabled" : "disabled" } };
  if (protocol === "openai.responses") {
    return {
      url: `${base}/responses`,
      body: {
        model: upstreamModel,
        input: capability === "image_input"
          ? [{ role: "user", content: [{ type: "input_image", image_url: TINY_PNG }, { type: "input_text", text: "What is in this image? One word." }] }]
          : capability === "tools" ? "What is the weather in Beijing? Use the tool." : "Reply with the single word: ok",
        max_output_tokens: 64,
        ...(capability === "tools" ? { tools: [{ type: "function", ...WEATHER_TOOL }], tool_choice: "required" } : {}),
        ...thinkingParams,
      },
    };
  }
  return {
    url: `${base}/chat/completions`,
    body: {
      model: upstreamModel,
      max_tokens: 32,
      messages: [{
        role: "user",
        content: capability === "image_input"
          ? [{ type: "image_url", image_url: { url: TINY_PNG } }, { type: "text", text: "What is in this image? One word." }]
          : capability === "tools" ? "What is the weather in Beijing? Use the tool." : "Reply with the single word: ok",
      }],
      ...(capability === "tools" ? { tools: [{ type: "function", function: WEATHER_TOOL }], tool_choice: "required" } : {}),
      ...thinkingParams,
    },
  };
}

/** Whether the response demonstrates the capability. */
export function judgeProbe(plan: ProbePlan, httpStatus: number, data: any): { ok: boolean; error: string | null } {
  if (httpStatus < 200 || httpStatus >= 300) {
    const message = data?.error?.message || data?.message || `HTTP ${httpStatus}`;
    return { ok: false, error: String(message).slice(0, 300) };
  }
  if (plan.capability === "tools") {
    const called = !!data?.choices?.[0]?.message?.tool_calls?.length
      || (Array.isArray(data?.content) && data.content.some((block: any) => block?.type === "tool_use"))
      || (Array.isArray(data?.output) && data.output.some((item: any) => item?.type === "function_call"));
    return called ? { ok: true, error: null } : { ok: false, error: "no tool call in the response" };
  }
  return { ok: true, error: null };
}

export async function runProbe(plan: ProbePlan, apiKey: string): Promise<ProbeResult> {
  const { url, body } = buildProbeRequest(plan);
  const started = Date.now();
  let httpStatus: number | null = null;
  let data: any = null;
  let error: string | null = null;
  let ok = false;
  try {
    const response = await safeProviderFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(plan.account, apiKey, plan.protocol) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    httpStatus = response.status;
    data = await response.json().catch(() => null);
    ({ ok, error } = judgeProbe(plan, response.status, data));
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }
  return {
    routeId: plan.route.id,
    modelId: plan.model.id,
    accountId: plan.account.id,
    protocol: plan.protocol,
    capability: plan.capability,
    ok,
    expected: true,
    httpStatus,
    latencyMs: Date.now() - started,
    error,
    // Usage counters only (no content).
    usage: data?.usage ?? null,
  };
}

export async function storeProbeResults(
  execute: (sql: string, params: unknown[]) => Promise<unknown>,
  results: ProbeResult[]
): Promise<void> {
  for (const result of results) {
    await execute(
      `INSERT INTO cp_route_probe_results (id, route_id, model_id, account_id, protocol, capability, ok, expected, http_status, latency_ms, error, usage, probed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, NOW())`,
      [randomUUID(), result.routeId, result.modelId, result.accountId, result.protocol, result.capability, result.ok, result.expected,
        result.httpStatus, result.latencyMs, result.error, result.usage === null ? null : JSON.stringify(result.usage)]
    );
  }
}

export function probeMismatches(results: ProbeResult[]): ProbeResult[] {
  return results.filter((result) => result.ok !== result.expected);
}
