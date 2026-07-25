import { db } from "../db/client";
import { decryptProviderSecret, encryptProviderSecret } from "../utils/provider-secrets";

export type ProviderChannelAdapter = "dashscope" | "pixverse";

export interface ProviderChannel {
  name: string;
  adapter: ProviderChannelAdapter;
  api_base_url: string;
  api_key: string;
  /** 上游区域标识，如 cn-beijing / ap-southeast-1 / us-east-1 / eu-central-1 */
  region?: string;
  /** 百炼新加坡、法兰克福区域 URL 含 {WorkspaceId} 占位符时必填 */
  workspace_id?: string;
  /** 默认 true；disabled 渠道不参与路由 */
  enabled?: boolean;
  /** 同模型多渠道可用时按 priority 降序选择，默认 0 */
  priority?: number;
  /** 该渠道可服务的模型 ID 前缀/精确匹配；不填表示跟随全局目录 */
  model_allowlist?: string[];
}

export interface ProviderChannelConfig {
  active_channel: string;
  channels: Record<string, ProviderChannel>;
}

export const WORKSPACE_ID_PLACEHOLDER = "{WorkspaceId}";

/** 替换 base_url 中的 {WorkspaceId} 占位符，得到可直接请求的 URL */
export function resolveChannelBaseUrl(channel: ProviderChannel): string {
  if (!channel.api_base_url.includes(WORKSPACE_ID_PLACEHOLDER)) return channel.api_base_url;
  return channel.api_base_url.split(WORKSPACE_ID_PLACEHOLDER).join(channel.workspace_id || "");
}

/**
 * 渠道是否可参与路由：启用、占位符已被 workspace_id 填充，且有 key 可用。
 * 渠道自身未填 key 时，若 provider 级别有回退 key（如环境变量 DASHSCOPE_API_KEY
 * 跨区域通用）也视为可用。
 */
export function isChannelUsable(channel: ProviderChannel, options: { hasFallbackKey?: boolean } = {}): boolean {
  if (channel.enabled === false) return false;
  if (!channel.api_key && !options.hasFallbackKey) return false;
  if (channel.api_base_url.includes(WORKSPACE_ID_PLACEHOLDER) && !channel.workspace_id) return false;
  return true;
}

export function channelAllowsModel(channel: ProviderChannel, modelId: string): boolean {
  if (!channel.model_allowlist || channel.model_allowlist.length === 0) return true;
  return channel.model_allowlist.some((pattern) => modelId === pattern || modelId.startsWith(pattern));
}

export function validateChannel(channel: ProviderChannel): string | null {
  if (!channel.name) return "channel name is required";
  if (!channel.api_base_url) return "api_base_url is required";
  if (channel.api_base_url.includes(WORKSPACE_ID_PLACEHOLDER) && !channel.workspace_id && channel.enabled !== false) {
    return `api_base_url contains ${WORKSPACE_ID_PLACEHOLDER} but workspace_id is empty; set workspace_id or disable the channel`;
  }
  return null;
}

export async function getProviderChannelConfig(providerId: string): Promise<ProviderChannelConfig | null> {
  const row = await db.queryOne<{ active_channel: string; channels: string }>(
    "SELECT * FROM provider_channel_configs WHERE provider_id = ?",
    [providerId]
  );
  if (!row) return null;
  return {
    active_channel: row.active_channel,
    channels: parseChannels(row.channels),
  };
}

export async function upsertProviderChannelConfig(providerId: string, config: ProviderChannelConfig): Promise<ProviderChannelConfig> {
  const now = new Date().toISOString();
  const existing = await db.queryOne<{ channels: string }>(
    "SELECT channels FROM provider_channel_configs WHERE provider_id = ?",
    [providerId]
  );
  const storedChannels = existing
    ? parseStoredChannels(existing.channels)
    : {};
  await db.execute(
    `INSERT INTO provider_channel_configs (provider_id, active_channel, channels, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(provider_id) DO UPDATE SET
       active_channel = excluded.active_channel,
       channels = excluded.channels,
       updated_at = excluded.updated_at`,
    [
      providerId,
      config.active_channel,
      JSON.stringify(serializeChannels(config.channels, storedChannels)),
      now,
      now,
    ]
  );
  return (await getProviderChannelConfig(providerId))!;
}

export async function switchProviderChannel(providerId: string, channel: string): Promise<ProviderChannelConfig | null> {
  const config = await getProviderChannelConfig(providerId);
  if (!config || !config.channels[channel]) return null;
  return upsertProviderChannelConfig(providerId, { ...config, active_channel: channel });
}

/** 新增或更新单个渠道；传入的字段与现有渠道合并，api_key 留空表示保持原值 */
export async function upsertProviderChannel(
  providerId: string,
  channelId: string,
  patch: Partial<ProviderChannel>
): Promise<{ config: ProviderChannelConfig } | { error: string }> {
  const config = (await getProviderChannelConfig(providerId)) || { active_channel: channelId, channels: {} };
  const existing = config.channels[channelId];
  const merged: ProviderChannel = {
    name: patch.name ?? existing?.name ?? channelId,
    adapter: patch.adapter ?? existing?.adapter ?? "dashscope",
    api_base_url: patch.api_base_url ?? existing?.api_base_url ?? "",
    api_key: patch.api_key !== undefined && patch.api_key !== "" ? patch.api_key : existing?.api_key ?? "",
    region: patch.region ?? existing?.region,
    workspace_id: patch.workspace_id ?? existing?.workspace_id,
    enabled: patch.enabled ?? existing?.enabled ?? true,
    priority: patch.priority ?? existing?.priority ?? 0,
    model_allowlist: patch.model_allowlist ?? existing?.model_allowlist,
  };
  const validationError = validateChannel(merged);
  if (validationError) return { error: validationError };
  const updated = await upsertProviderChannelConfig(providerId, {
    ...config,
    channels: { ...config.channels, [channelId]: merged },
  });
  return { config: updated };
}

export async function getProviderChannel(providerId: string, channel?: string): Promise<(ProviderChannel & { id: string }) | null> {
  const config = await getProviderChannelConfig(providerId);
  if (!config) return null;
  const channelId = channel || config.active_channel;
  const selected = config.channels[channelId];
  return selected ? { id: channelId, ...selected } : null;
}

function serializeChannels(
  channels: Record<string, ProviderChannel>,
  storedChannels: Record<string, ProviderChannel> = {}
): Record<string, ProviderChannel> {
  return Object.fromEntries(
    Object.entries(channels).map(([id, channel]) => [
      id,
      {
        ...channel,
        api_key: channel.api_key
          ? encryptProviderSecret(channel.api_key)
          : storedChannels[id]?.api_key || "",
      },
    ])
  );
}

function parseStoredChannels(raw: string): Record<string, ProviderChannel> {
  return JSON.parse(raw || "{}") as Record<string, ProviderChannel>;
}

function parseChannels(raw: string): Record<string, ProviderChannel> {
  const parsed = parseStoredChannels(raw);
  return Object.fromEntries(
    Object.entries(parsed).map(([id, channel]) => [
      id,
      { ...channel, api_key: decryptProviderSecret(channel.api_key || "") },
    ])
  );
}
