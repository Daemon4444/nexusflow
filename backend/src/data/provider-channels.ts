import db from "../db";
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

const stmts = {
  get: db.prepare("SELECT * FROM provider_channel_configs WHERE provider_id = ?"),
  upsert: db.prepare(`
    INSERT INTO provider_channel_configs (provider_id, active_channel, channels, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(provider_id) DO UPDATE SET
      active_channel = excluded.active_channel,
      channels = excluded.channels,
      updated_at = excluded.updated_at
  `),
};

export function getProviderChannelConfig(providerId: string): ProviderChannelConfig | null {
  const row = stmts.get.get(providerId) as { active_channel: string; channels: string } | undefined;
  if (!row) return null;
  return {
    active_channel: row.active_channel,
    channels: parseChannels(row.channels),
  };
}

export function upsertProviderChannelConfig(providerId: string, config: ProviderChannelConfig): ProviderChannelConfig {
  const now = new Date().toISOString();
  stmts.upsert.run(
    providerId,
    config.active_channel,
    JSON.stringify(serializeChannels(config.channels)),
    now,
    now
  );
  return getProviderChannelConfig(providerId)!;
}

export function switchProviderChannel(providerId: string, channel: string): ProviderChannelConfig | null {
  const config = getProviderChannelConfig(providerId);
  if (!config || !config.channels[channel]) return null;
  return upsertProviderChannelConfig(providerId, {
    ...config,
    active_channel: channel,
  });
}

export function getProviderChannel(providerId: string, channel?: string): (ProviderChannel & { id: string }) | null {
  const config = getProviderChannelConfig(providerId);
  if (!config) return null;
  const channelId = channel || config.active_channel;
  const selected = config.channels[channelId];
  return selected ? { id: channelId, ...selected } : null;
}

function serializeChannels(channels: Record<string, ProviderChannel>): Record<string, ProviderChannel> {
  return Object.fromEntries(
    Object.entries(channels).map(([id, channel]) => [
      id,
      {
        ...channel,
        api_key: encryptProviderSecret(channel.api_key || ""),
      },
    ])
  );
}

function parseChannels(raw: string): Record<string, ProviderChannel> {
  const parsed = JSON.parse(raw || "{}") as Record<string, ProviderChannel>;
  return Object.fromEntries(
    Object.entries(parsed).map(([id, channel]) => [
      id,
      {
        ...channel,
        api_key: decryptProviderSecret(channel.api_key || ""),
      },
    ])
  );
}
