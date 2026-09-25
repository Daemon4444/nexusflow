/**
 * Loads the raw Bailian sources, either from an offline fixture directory or
 * from the network. Every network request goes through
 * `safeUpstreamCatalogFetch` (help.aliyun.com and dashscope.aliyuncs.com only).
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { safeUpstreamCatalogFetch } from "../../outbound-url-policy";
import { BAILIAN_PAGE_URLS, type BailianSources } from "./snapshot";

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

function readMaybeGzip(file: string): string {
  const bytes = fs.readFileSync(file);
  return file.endsWith(".gz") ? zlib.gunzipSync(bytes).toString("utf8") : bytes.toString("utf8");
}

export function loadOfflineSources(directory: string): BailianSources {
  const page = (name: string) => {
    for (const candidate of [`${name}.html.gz`, `${name}.html`]) {
      const file = path.join(directory, candidate);
      if (fs.existsSync(file)) return readMaybeGzip(file);
    }
    throw new Error(`offline fixture ${name}.html(.gz) is missing in ${directory}`);
  };
  const modelListRaw = fs.readFileSync(path.join(directory, "compatible-mode-models.json"), "utf8");
  const parsed = JSON.parse(modelListRaw) as { data?: Array<{ id?: unknown }> };
  return {
    rateLimitHtml: page("rate-limit"),
    modelPricingHtml: page("model-pricing"),
    modelsHtml: page("models"),
    listedModelIds: (parsed.data || []).map((item) => String(item.id || "")).filter(Boolean),
    modelListRaw,
  };
}

const MAX_PAGES = 50;
const MAX_HTML_BYTES = 20 * 1024 * 1024;

async function fetchText(fetcher: Fetcher, url: string, init?: RequestInit): Promise<string> {
  const response = await fetcher(url, init);
  if (!response.ok) throw new Error(`GET ${url} returned HTTP ${response.status}`);
  const text = await response.text();
  if (text.length > MAX_HTML_BYTES) throw new Error(`GET ${url} exceeded ${MAX_HTML_BYTES} bytes`);
  return text;
}

/**
 * Lists every model of the DashScope compatible-mode endpoint, following
 * `has_more` / `last_id` pagination (passed back as `after`).
 */
export async function fetchModelList(
  apiKey: string,
  fetcher: Fetcher = safeUpstreamCatalogFetch
): Promise<{ ids: string[]; raw: string }> {
  if (!apiKey) throw new Error("DASHSCOPE_API_KEY is required to list upstream models");
  const ids: string[] = [];
  const rawPages: string[] = [];
  let after: string | null = null;
  for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex += 1) {
    const url = new URL(BAILIAN_PAGE_URLS.modelList);
    url.searchParams.set("limit", "100");
    if (after) url.searchParams.set("after", after);
    const raw = await fetchText(fetcher, url.href, { headers: { Authorization: `Bearer ${apiKey}` } });
    rawPages.push(raw);
    const body = JSON.parse(raw) as { data?: Array<{ id?: unknown }>; has_more?: boolean; last_id?: string };
    const pageIds = (body.data || []).map((item) => String(item.id || "")).filter(Boolean);
    ids.push(...pageIds);
    if (!body.has_more) return { ids: [...new Set(ids)], raw: rawPages.join("\n") };
    const next = body.last_id || pageIds[pageIds.length - 1];
    if (!next || next === after) throw new Error("model list pagination did not advance");
    after = next;
  }
  throw new Error(`model list exceeded ${MAX_PAGES} pages`);
}

export async function loadOnlineSources(
  apiKey: string,
  fetcher: Fetcher = safeUpstreamCatalogFetch
): Promise<BailianSources> {
  const [rateLimitHtml, modelPricingHtml, modelsHtml, list] = await Promise.all([
    fetchText(fetcher, BAILIAN_PAGE_URLS.rateLimit),
    fetchText(fetcher, BAILIAN_PAGE_URLS.modelPricing),
    fetchText(fetcher, BAILIAN_PAGE_URLS.models),
    fetchModelList(apiKey, fetcher),
  ]);
  return { rateLimitHtml, modelPricingHtml, modelsHtml, listedModelIds: list.ids, modelListRaw: list.raw };
}
