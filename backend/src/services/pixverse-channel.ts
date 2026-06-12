import { getProviderChannelConfig } from "../data/provider-channels";

export type PixVerseRuntimeChannel = {
  id: string;
  name: string;
  adapter: "dashscope" | "pixverse";
  apiBaseUrl: string;
  apiKey: string;
  taskProvider: string;
};

const DEFAULT_CHANNELS = {
  bailian: {
    name: "Bailian Channel",
    adapter: "dashscope" as const,
    api_base_url: "https://dashscope.aliyuncs.com/api/v1",
    api_key: process.env.DASHSCOPE_API_KEY || "",
  },
  official: {
    name: "PixVerse Official",
    adapter: "pixverse" as const,
    api_base_url: "https://app-api.pixverse.ai/openapi/v2",
    api_key: process.env.PIXVERSE_API_KEY || "",
  },
};

function normalizePixVerseBaseUrl(apiBaseUrl: string): string {
  const normalized = apiBaseUrl.replace(/\/$/, "");
  if (
    normalized === "https://app-api.pixverseai.cn/openapi/v2" ||
    normalized === "https://app-api.pixverse.ai.cn/openapi/v2"
  ) {
    return "https://app-api.pixverse.ai/openapi/v2";
  }
  return normalized;
}

export async function getPixVerseRuntimeChannel(channelId?: string): Promise<PixVerseRuntimeChannel> {
  let selectedId = channelId;

  if (!selectedId) {
    const dbConfig = await getProviderChannelConfig("pixverse");
    if (dbConfig) {
      selectedId = dbConfig.active_channel;
      const dbChannel = dbConfig.channels[selectedId];
      if (dbChannel) {
        const envKey = dbChannel.adapter === "dashscope" ? process.env.DASHSCOPE_API_KEY : process.env.PIXVERSE_API_KEY;
        const apiKey = dbChannel.api_key || envKey || "";
        return {
          id: selectedId,
          name: dbChannel.name,
          adapter: dbChannel.adapter,
          apiBaseUrl: normalizePixVerseBaseUrl(dbChannel.api_base_url),
          apiKey,
          taskProvider: `pixverse:${selectedId}:${dbChannel.adapter}`,
        };
      }
    }
  }

  const fallbackId = selectedId || "bailian";
  const fallback = DEFAULT_CHANNELS[fallbackId as keyof typeof DEFAULT_CHANNELS] || DEFAULT_CHANNELS.bailian;
  const selected = { id: fallbackId, ...fallback };
  const envKey = selected.adapter === "dashscope" ? process.env.DASHSCOPE_API_KEY : process.env.PIXVERSE_API_KEY;
  const apiKey = selected.api_key || envKey || "";

  return {
    id: selected.id,
    name: selected.name,
    adapter: selected.adapter,
    apiBaseUrl: normalizePixVerseBaseUrl(selected.api_base_url),
    apiKey,
    taskProvider: `pixverse:${selected.id}:${selected.adapter}`,
  };
}

export async function getPixVerseTaskChannel(provider: string): Promise<PixVerseRuntimeChannel> {
  if (!provider.startsWith("pixverse:")) return getPixVerseRuntimeChannel();
  const [, channelId] = provider.split(":");
  return getPixVerseRuntimeChannel(channelId);
}
