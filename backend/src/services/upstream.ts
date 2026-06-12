/**
 * Upstream Resolution
 *
 * Unified upstream resolution: given a model and an optional region preference,
 * return the actual base_url and api_key. When provider channel configuration
 * (provider_channel_configs) is present and usable it takes precedence;
 * otherwise the resolver falls back to the static configuration in
 * services/providers.ts plus environment variables, preserving legacy behavior.
 */

import { findProvider, getResolvedProviderApiKey } from "./providers";
import {
  channelAllowsModel,
  getProviderChannelConfig,
  isChannelUsable,
  resolveChannelBaseUrl,
  upsertProviderChannelConfig,
  WORKSPACE_ID_PLACEHOLDER,
  type ProviderChannel,
} from "../data/provider-channels";

export const DEFAULT_REGION = "cn-beijing";
export const REGION_HEADER = "x-nf-region";

export interface ResolvedUpstream {
  providerId: string;
  /** Matched channel ID; null indicates the static-environment-variable fallback path */
  channelId: string | null;
  region: string;
  /** OpenAI-compatible base, e.g. https://dashscope.aliyuncs.com/compatible-mode/v1 */
  baseUrl: string;
  /** Native protocol base (image/video /api/v1 style), derived from baseUrl by stripping the compatible-mode suffix */
  nativeBaseUrl: string;
  apiKey: string;
}

export type ResolveUpstreamResult =
  | { ok: true; upstream: ResolvedUpstream }
  | { ok: false; status: number; code: string; message: string };

function toNativeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/compatible-mode\/v1\/?$/, "");
}

export async function resolveUpstream(
  modelId: string,
  options: { region?: string } = {}
): Promise<ResolveUpstreamResult> {
  const provider = findProvider(modelId);
  if (!provider) {
    return {
      ok: false,
      status: 404,
      code: "provider_not_found",
      message: `No provider configured for model '${modelId}'.`,
    };
  }

  const requestedRegion = options.region?.trim() || undefined;
  const config = await getProviderChannelConfig(provider.id);

  if (config) {
    // Channels without an explicit key may fall back to the provider-level environment variable key,
    // but only for the default region: in practice (2026-06) the domestic DASHSCOPE_API_KEY returns 401
    // when used against overseas regions, so overseas channels must be configured with a dedicated key.
    const hasFallbackKey = !!getResolvedProviderApiKey(provider);
    let candidates = Object.entries(config.channels)
      .filter(([, channel]) => {
        const fallbackApplies = hasFallbackKey && (!channel.region || channel.region === DEFAULT_REGION);
        return isChannelUsable(channel, { hasFallbackKey: fallbackApplies }) && channelAllowsModel(channel, modelId);
      });

    if (requestedRegion) {
      candidates = candidates.filter(([, channel]) => channel.region === requestedRegion);
      if (candidates.length === 0) {
        return {
          ok: false,
          status: 400,
          code: "region_unavailable",
          message: `Model '${modelId}' is not available in region '${requestedRegion}'.`,
        };
      }
    }

    if (candidates.length > 0) {
      candidates.sort(([idA, a], [idB, b]) => {
        const priorityDiff = (b.priority ?? 0) - (a.priority ?? 0);
        if (priorityDiff !== 0) return priorityDiff;
        if (idA === config.active_channel) return -1;
        if (idB === config.active_channel) return 1;
        return 0;
      });
      const [channelId, channel] = candidates[0];
      const baseUrl = resolveChannelBaseUrl(channel).replace(/\/$/, "");
      return {
        ok: true,
        upstream: {
          providerId: provider.id,
          channelId,
          region: channel.region || DEFAULT_REGION,
          baseUrl,
          nativeBaseUrl: toNativeBaseUrl(baseUrl),
          apiKey: channel.api_key || getResolvedProviderApiKey(provider),
        },
      };
    }
  }

  // Channel config is missing or all channels are unusable: do not silently fall back to Beijing when an explicit non-default region was requested
  if (requestedRegion && requestedRegion !== DEFAULT_REGION) {
    return {
      ok: false,
      status: 400,
      code: "region_unavailable",
      message: `Region '${requestedRegion}' is not enabled for model '${modelId}'.`,
    };
  }

  const apiKey = getResolvedProviderApiKey(provider);
  if (!apiKey) {
    return {
      ok: false,
      status: 500,
      code: "provider_not_configured",
      message: `Provider '${provider.name}' API key not configured. Please add ${provider.apiKeyEnv} to environment.`,
    };
  }

  const baseUrl = provider.baseUrl.replace(/\/$/, "");
  return {
    ok: true,
    upstream: {
      providerId: provider.id,
      channelId: null,
      region: provider.id === "dashscope" ? DEFAULT_REGION : "global",
      baseUrl,
      nativeBaseUrl: toNativeBaseUrl(baseUrl),
      apiKey,
    },
  };
}

/**
 * Pre-create the four DashScope region channels. Only writes if no configuration exists.
 * Overseas regions are disabled by default and require their region-specific API keys (the domestic key
 * returns 401 against overseas regions in practice); Singapore/Frankfurt also need workspace_id.
 * The Beijing channel falls back to DASHSCOPE_API_KEY when its key is empty.
 */
export async function ensureDashScopeChannelConfig(): Promise<void> {
  if (await getProviderChannelConfig("dashscope")) return;
  const intlAllowlist = ["qwen", "qwq", "text-embedding"];
  await upsertProviderChannelConfig("dashscope", {
    active_channel: "cn-beijing",
    channels: {
      "cn-beijing": {
        name: "North China 2 (Beijing)",
        adapter: "dashscope",
        region: "cn-beijing",
        api_base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        api_key: process.env.DASHSCOPE_API_KEY || "",
        enabled: true,
        priority: 100,
      },
      "ap-southeast-1": {
        name: "Singapore",
        adapter: "dashscope",
        region: "ap-southeast-1",
        api_base_url: `https://${WORKSPACE_ID_PLACEHOLDER}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1`,
        api_key: process.env.DASHSCOPE_INTL_API_KEY || "",
        workspace_id: process.env.DASHSCOPE_INTL_WORKSPACE_ID || "",
        enabled: false,
        priority: 50,
        model_allowlist: intlAllowlist,
      },
      "us-east-1": {
        name: "United States (Virginia)",
        adapter: "dashscope",
        region: "us-east-1",
        api_base_url: "https://dashscope-us.aliyuncs.com/compatible-mode/v1",
        api_key: process.env.DASHSCOPE_US_API_KEY || "",
        enabled: false,
        priority: 50,
        model_allowlist: intlAllowlist,
      },
      "eu-central-1": {
        name: "Germany (Frankfurt)",
        adapter: "dashscope",
        region: "eu-central-1",
        api_base_url: `https://${WORKSPACE_ID_PLACEHOLDER}.eu-central-1.maas.aliyuncs.com/compatible-mode/v1`,
        api_key: process.env.DASHSCOPE_EU_API_KEY || "",
        workspace_id: process.env.DASHSCOPE_EU_WORKSPACE_ID || "",
        enabled: false,
        priority: 50,
        model_allowlist: intlAllowlist,
      },
    },
  });
}

export function upstreamErrorBody(result: { status: number; code: string; message: string }) {
  return {
    message: result.message,
    type: result.status >= 500 ? "server_error" : "invalid_request_error",
    code: result.code,
  };
}

export function getRequestedRegion(req: { headers: Record<string, unknown> }): string | undefined {
  const raw = req.headers[REGION_HEADER];
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return undefined;
}
