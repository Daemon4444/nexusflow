/**
 * Upstream Resolution
 *
 * 统一的上游解析入口：根据模型与可选的区域偏好，返回实际请求的
 * base_url 与 api_key。渠道配置（provider_channel_configs）存在且可用时
 * 优先生效，否则回退到 services/providers.ts 的静态配置 + 环境变量，
 * 保证存量部署行为不变。
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
  /** 命中的渠道 ID；null 表示走静态环境变量回退路径 */
  channelId: string | null;
  region: string;
  /** OpenAI 兼容协议 base，如 https://dashscope.aliyuncs.com/compatible-mode/v1 */
  baseUrl: string;
  /** 原生协议 base（图像/视频 /api/v1 风格），由 baseUrl 去掉 compatible-mode 后缀得到 */
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
    // 渠道未单独配 key 时可回退 provider 级环境变量 key，但仅限默认区域：
    // 实测（2026-06）国内 DASHSCOPE_API_KEY 调海外区域返回 401，海外渠道必须配独立 key
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

  // 渠道配置缺失或全部不可用：显式要求非默认区域时不允许静默落回北京
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
 * 预置 dashscope 四区域渠道。仅在配置不存在时写入。
 * 海外区域默认 disabled，且必须配置该区域专属的 API Key（实测国内 key 调海外返回 401）；
 * 新加坡/法兰克福还需补 workspace_id。北京渠道 key 留空时回退 DASHSCOPE_API_KEY。
 */
export async function ensureDashScopeChannelConfig(): Promise<void> {
  if (await getProviderChannelConfig("dashscope")) return;
  const intlAllowlist = ["qwen", "qwq", "text-embedding"];
  await upsertProviderChannelConfig("dashscope", {
    active_channel: "cn-beijing",
    channels: {
      "cn-beijing": {
        name: "华北2（北京）",
        adapter: "dashscope",
        region: "cn-beijing",
        api_base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        api_key: process.env.DASHSCOPE_API_KEY || "",
        enabled: true,
        priority: 100,
      },
      "ap-southeast-1": {
        name: "新加坡",
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
        name: "美国（弗吉尼亚）",
        adapter: "dashscope",
        region: "us-east-1",
        api_base_url: "https://dashscope-us.aliyuncs.com/compatible-mode/v1",
        api_key: process.env.DASHSCOPE_US_API_KEY || "",
        enabled: false,
        priority: 50,
        model_allowlist: intlAllowlist,
      },
      "eu-central-1": {
        name: "德国（法兰克福）",
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
