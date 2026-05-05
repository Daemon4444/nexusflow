import { db } from "../db/client";
import { decryptProviderSecret, encryptProviderSecret } from "../utils/provider-secrets";

export type ProviderChannelAdapter = "dashscope" | "pixverse";

export interface ProviderChannel {
  name: string;
  adapter: ProviderChannelAdapter;
  api_base_url: string;
  api_key: string;
}

export interface ProviderChannelConfig {
  active_channel: string;
  channels: Record<string, ProviderChannel>;
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
  await db.execute(
    `INSERT INTO provider_channel_configs (provider_id, active_channel, channels, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(provider_id) DO UPDATE SET
       active_channel = excluded.active_channel,
       channels = excluded.channels,
       updated_at = excluded.updated_at`,
    [providerId, config.active_channel, JSON.stringify(serializeChannels(config.channels)), now, now]
  );
  return (await getProviderChannelConfig(providerId))!;
}

export async function switchProviderChannel(providerId: string, channel: string): Promise<ProviderChannelConfig | null> {
  const config = await getProviderChannelConfig(providerId);
  if (!config || !config.channels[channel]) return null;
  return upsertProviderChannelConfig(providerId, { ...config, active_channel: channel });
}

export async function getProviderChannel(providerId: string, channel?: string): Promise<(ProviderChannel & { id: string }) | null> {
  const config = await getProviderChannelConfig(providerId);
  if (!config) return null;
  const channelId = channel || config.active_channel;
  const selected = config.channels[channelId];
  return selected ? { id: channelId, ...selected } : null;
}

function serializeChannels(channels: Record<string, ProviderChannel>): Record<string, ProviderChannel> {
  return Object.fromEntries(
    Object.entries(channels).map(([id, channel]) => [
      id,
      { ...channel, api_key: encryptProviderSecret(channel.api_key || "") },
    ])
  );
}

function parseChannels(raw: string): Record<string, ProviderChannel> {
  const parsed = JSON.parse(raw || "{}") as Record<string, ProviderChannel>;
  return Object.fromEntries(
    Object.entries(parsed).map(([id, channel]) => [
      id,
      { ...channel, api_key: decryptProviderSecret(channel.api_key || "") },
    ])
  );
}
