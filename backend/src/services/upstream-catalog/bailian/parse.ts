/**
 * Parsers for the Bailian (Alibaba Cloud Model Studio) documentation pages.
 *
 *  - rate-limit page: per model × region RPM/TPM (plus RPS / concurrency for
 *    media models), "动态限流" markers and shared quota pools;
 *  - model-pricing page: per model token pricing for the 华北2（北京）region
 *    (tiers, thinking-mode output, cache-hit input, list price before promos).
 *
 * Region comes from the section heading: pages nest `h3 model family` above
 * `h4 region` tabs. A table without a region column takes the nearest h4.
 */
import { createHash } from "crypto";
import { columnHeader, compact, extractTables, leafHeader, type ExtractedTable, type GridCell } from "../html-grid";

export const REGION_CODES = [
  "cn-beijing",
  "us-east-1",
  "ap-southeast-1",
  "eu-central-1",
  "ap-northeast-1",
  "cn-hongkong",
] as const;
export type RegionCode = (typeof REGION_CODES)[number];

/** Normalises a heading such as "华北2（北京）" or "美国（弗吉尼亚）" to a region code. */
export function normalizeRegion(text: string): RegionCode | null {
  const value = compact(text);
  if (!value) return null;
  if (value.includes("华北2") || value.includes("北京")) return "cn-beijing";
  if (value.includes("弗吉尼亚")) return "us-east-1";
  if (value.includes("新加坡")) return "ap-southeast-1";
  if (value.includes("法兰克福")) return "eu-central-1";
  if (value.includes("东京")) return "ap-northeast-1";
  if (value.includes("中国香港") || value.includes("香港")) return "cn-hongkong";
  return null;
}

/**
 * The deployment scope that is "local" to a region tab. Rows with a different
 * scope (e.g. 全球 inside 美国（弗吉尼亚）) are kept only when no local row exists.
 */
const LOCAL_SCOPES: Record<RegionCode, string[]> = {
  "cn-beijing": ["", "中国内地"],
  "us-east-1": ["美国"],
  "ap-southeast-1": ["国际"],
  "eu-central-1": ["欧盟"],
  "ap-northeast-1": ["日本"],
  "cn-hongkong": ["中国香港"],
};

export interface ParseWarning {
  page: string;
  message: string;
}

const MODEL_ID_TOKEN = /^[A-Za-z][A-Za-z0-9._\/:-]*[A-Za-z0-9]$/;

/** First token of the first line of a model-name cell, when it looks like an ID. */
export function modelIdFromCell(cell: GridCell | undefined): string | null {
  if (!cell) return null;
  const first = (cell.lines[0] || cell.text).split(/\s+/)[0] || "";
  return MODEL_ID_TOKEN.test(first) && /[a-z]/i.test(first) && /[\d.-]/.test(first) ? first : null;
}

/** Parses "15,000", "3,000,000", "1,200万" style numbers. */
export function parseLimitNumber(text: string): number | null {
  const match = text.replace(/\s+/g, "").match(/^(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(万)?/);
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, "")) * (match[2] ? 10_000 : 1);
  return Number.isFinite(value) ? value : null;
}

function isDeprecatedSection(table: ExtractedTable): boolean {
  return /下线/.test(`${table.headings.h3} ${table.headings.h4}`);
}

function headers(table: ExtractedTable): string[] {
  return Array.from({ length: table.columnCount }, (_, col) => compact(columnHeader(table, col)));
}

function tableRegion(table: ExtractedTable): RegionCode | null {
  return normalizeRegion(table.headings.h4) || normalizeRegion(table.headings.h3);
}

// ---------------------------------------------------------------- rate limit

export interface RegionLimit {
  rpm?: number;
  tpm?: number;
  rps?: number;
  concurrency?: number;
  dynamic?: true;
  poolId?: string;
  scope?: string;
}

export interface QuotaPool {
  region: RegionCode;
  rpm?: number;
  tpm?: number;
  concurrency?: number;
  members: string[];
}

export interface RateLimitParseResult {
  limits: Record<string, Partial<Record<RegionCode, RegionLimit>>>;
  pools: Record<string, QuotaPool>;
  warnings: ParseWarning[];
  tableCount: number;
}

export function poolIdFor(region: RegionCode, members: string[]): string {
  const digest = createHash("sha256").update(`${region}\0${[...members].sort().join("\0")}`).digest("hex");
  return `pool-${digest.slice(0, 16)}`;
}

type LimitKind = "rpm" | "tpm" | "rps" | "concurrency";

function limitColumn(header: string): LimitKind | null {
  if (/RPM|每分钟调用次数|每分钟请求数|每分钟任务下发/.test(header)) return "rpm";
  if (/TPM|每分钟消耗Token/.test(header)) return "tpm";
  if (/RPS|每秒钟调用次数/.test(header)) return "rps";
  if (/并发|同时处理中/.test(header)) return "concurrency";
  return null;
}

export function parseRateLimitPage(html: string, page = "rate-limit"): RateLimitParseResult {
  const tables = extractTables(html);
  const limits: RateLimitParseResult["limits"] = {};
  const pools: Record<string, QuotaPool> = {};
  const warnings: ParseWarning[] = [];
  let tableCount = 0;

  for (const table of tables) {
    const cols = headers(table);
    const modelCol = cols.findIndex((header) => /模型名称|模型服务|模型ID/.test(header));
    if (modelCol < 0) continue;
    // Classify by the most specific header only: the shared parent header
    // mentions "RPS（RPM/60）与TPS（TPM/60）" and would match every column.
    const kinds = cols.map((_, col) => limitColumn(compact(leafHeader(table, col))));
    if (!kinds.some(Boolean)) continue;
    if (isDeprecatedSection(table)) continue;
    const scopeCol = cols.findIndex((header) => header.includes("服务部署范围"));
    const regionCol = cols.findIndex((header) => header === "地域" || header.includes("地域"));
    const headingRegion = tableRegion(table);
    tableCount += 1;

    // Pool detection: a limit cell spanning several model rows whose text
    // says the quota is shared (共享).
    const handledPoolCells = new Set<number>();
    table.bodyRows.forEach((row, rowIndex) => {
      const modelId = modelIdFromCell(row[modelCol]);
      if (!modelId) {
        if (row[modelCol]?.text) {
          warnings.push({ page, message: `unrecognised model cell "${row[modelCol].text.slice(0, 60)}" under ${table.headings.h3}/${table.headings.h4}` });
        }
        return;
      }
      const region = (regionCol >= 0 ? normalizeRegion(row[regionCol].text) : null) || headingRegion;
      if (!region) {
        warnings.push({ page, message: `no region for ${modelId} under ${table.headings.h3}/${table.headings.h4}` });
        return;
      }
      const scope = scopeCol >= 0 ? row[scopeCol].text : "";
      const entry: RegionLimit = {};
      if (scope) entry.scope = scope;
      const seenCells = new Set<number>();
      kinds.forEach((kind, col) => {
        if (!kind) return;
        const cell = row[col];
        if (seenCells.has(cell.id)) return;
        seenCells.add(cell.id);
        if (/动态限流/.test(cell.text)) {
          entry.dynamic = true;
          return;
        }
        const value = parseLimitNumber(cell.text);
        if (value === null) {
          if (cell.text && !/^[-—–]$/.test(cell.text)) {
            warnings.push({ page, message: `non-numeric ${kind} "${cell.text.slice(0, 40)}" for ${modelId} (${region})` });
          }
          return;
        }
        entry[kind] = value;
        if (cell.rowspan > 1 && /共享/.test(cell.text)) {
          const originIndex = cell.row - table.headerRows.length;
          const members = table.bodyRows
            .slice(originIndex, originIndex + cell.rowspan)
            .map((memberRow) => modelIdFromCell(memberRow[modelCol]))
            .filter((id): id is string => !!id);
          const poolId = poolIdFor(region, members);
          entry.poolId = poolId;
          if (!handledPoolCells.has(cell.id)) {
            handledPoolCells.add(cell.id);
            const pool = pools[poolId] || { region, members: [...new Set(members)].sort() };
            pool[kind === "rps" ? "rpm" : kind] = kind === "rps" ? value * 60 : value;
            pools[poolId] = pool;
          }
        }
      });
      void rowIndex;
      if (!Object.keys(entry).some((key) => key !== "scope")) return;

      const perModel = (limits[modelId] = limits[modelId] || {});
      const existing = perModel[region];
      if (!existing) {
        perModel[region] = entry;
        return;
      }
      const local = LOCAL_SCOPES[region];
      const existingIsLocal = local.includes(existing.scope || "");
      const entryIsLocal = local.includes(entry.scope || "");
      if (entryIsLocal && !existingIsLocal) perModel[region] = entry;
    });
  }
  return { limits, pools, warnings, tableCount };
}

// ------------------------------------------------------------------- pricing

export interface PriceTier {
  /** Exclusive lower bound of the request input tokens for this tier. */
  minTokens: number;
  /** Inclusive upper bound; null when unbounded. */
  maxTokens: number | null;
  input: number;
  output: number;
  thinkingOutput?: number;
  cacheHitInput?: number;
  /** Set when the page shows a promotion ("原价X元（限时8折）"); prices above are list prices. */
  promotion?: string;
}

export interface ModelPricing {
  currency: "CNY";
  unit: "per_million_tokens";
  region: RegionCode;
  scope: string;
  tiers: PriceTier[];
}

export interface PricingParseResult {
  pricing: Record<string, ModelPricing>;
  warnings: ParseWarning[];
  tableCount: number;
}

/** "2.5元" → 2.5; "原价2元（限时8折）" → { value: 2, promotion: "限时8折" }. */
export function parsePrice(text: string): { value: number; promotion?: string } | null {
  const normalised = text.replace(/\s+/g, "");
  const listed = normalised.match(/原价(\d+(?:\.\d+)?)元(?:[（(]([^）)]+)[）)])?/);
  if (listed) return { value: Number(listed[1]), promotion: listed[2] || "promotion" };
  const plain = normalised.match(/^(\d+(?:\.\d+)?)元/);
  if (plain) return { value: Number(plain[1]) };
  return null;
}

function tokenBound(value: string, unit: string | undefined): number {
  const number = Number(value);
  if (unit === "K" || unit === "k") return Math.round(number * 1024);
  if (unit === "M" || unit === "m") return Math.round(number * 1_000_000);
  return Math.round(number);
}

/** "0<Token≤32K" → [0, 32768]; "256K<Token≤1M" → [262144, 1000000]; "Token>1M" → [1000000, null]. */
export function parseTokenRange(text: string): { minTokens: number; maxTokens: number | null } | null {
  const value = text.replace(/\s+/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  const bounded = value.match(/^(?:(\d+(?:\.\d+)?)([KkMm])?<)?Token≤(\d+(?:\.\d+)?)([KkMm])?/);
  if (bounded) {
    return {
      minTokens: bounded[1] ? tokenBound(bounded[1], bounded[2]) : 0,
      maxTokens: tokenBound(bounded[3], bounded[4]),
    };
  }
  const open = value.match(/^Token>(\d+(?:\.\d+)?)([KkMm])?/);
  if (open) return { minTokens: tokenBound(open[1], open[2]), maxTokens: null };
  if (value === "不区分阶梯" || value === "无阶梯计价" || value === "") return { minTokens: 0, maxTokens: null };
  return null;
}

interface PricingColumns {
  model: number;
  scope: number;
  mode: number;
  tier: number;
  input: number;
  cacheHit: number;
  output: number;
  thinkingOutput: number;
}

function pricingColumns(cols: string[]): PricingColumns | null {
  const find = (predicate: (header: string) => boolean) => cols.findIndex(predicate);
  const model = find((header) => /模型ID|模型名称/.test(header));
  const input = find((header) => header.startsWith("输入单价") && /每百万Token/.test(header));
  const outputs = cols
    .map((header, index) => ({ header, index }))
    .filter(({ header }) => header.startsWith("输出单价") && /每百万Token/.test(header));
  if (model < 0 || input < 0 || outputs.length === 0) return null;
  const thinking = outputs.find(({ header }) => /\/思考模式/.test(header));
  const normal = outputs.find(({ header }) => /\/非思考模式/.test(header)) || outputs.find(({ header }) => !/\/思考模式/.test(header));
  return {
    model,
    scope: find((header) => header.includes("服务部署范围")),
    mode: find((header) => header === "模式"),
    tier: find((header) => /单次请求的输入Token/.test(header)),
    input,
    cacheHit: find((header) => /缓存命中/.test(header) && /每百万Token/.test(header)),
    output: normal ? normal.index : -1,
    thinkingOutput: thinking ? thinking.index : -1,
  };
}

/**
 * Parses per-million-token prices for the 华北2（北京）region, preferring the
 * mainland (no scope / 中国内地) rows. Other regions are counted, not stored.
 */
export function parsePricingPage(html: string, page = "model-pricing"): PricingParseResult {
  const tables = extractTables(html);
  const pricing: Record<string, ModelPricing> = {};
  const warnings: ParseWarning[] = [];
  let tableCount = 0;

  for (const table of tables) {
    if (isDeprecatedSection(table)) continue;
    const cols = headers(table);
    const columns = pricingColumns(cols);
    if (!columns) continue;
    const region = tableRegion(table);
    if (region !== "cn-beijing") continue;
    tableCount += 1;

    const collected = new Map<string, { scope: string; tiers: Map<string, PriceTier> }>();
    for (const row of table.bodyRows) {
      const modelId = modelIdFromCell(row[columns.model]);
      if (!modelId) continue;
      const scope = columns.scope >= 0 ? row[columns.scope].text : "";
      if (!LOCAL_SCOPES["cn-beijing"].includes(scope)) continue;
      const range = columns.tier >= 0
        ? parseTokenRange(row[columns.tier].text)
        : { minTokens: 0, maxTokens: null };
      if (!range) {
        warnings.push({ page, message: `unparsed token range "${row[columns.tier].text}" for ${modelId}` });
        continue;
      }
      const mode = columns.mode >= 0 ? compact(row[columns.mode].text) : "";
      const input = parsePrice(row[columns.input].text);
      const thinking = columns.thinkingOutput >= 0 ? parsePrice(row[columns.thinkingOutput].text) : null;
      // Thinking-only models show "-" for the non-thinking output; their
      // billed output is the thinking price.
      const output = (columns.output >= 0 ? parsePrice(row[columns.output].text) : null) || thinking;
      const cacheHit = columns.cacheHit >= 0 ? parsePrice(row[columns.cacheHit].text) : null;
      if (!input || !output) {
        warnings.push({ page, message: `unparsed price row for ${modelId}: "${row[columns.input].text}" / "${columns.output >= 0 ? row[columns.output].text : ""}"` });
        continue;
      }
      const record = collected.get(modelId) || { scope, tiers: new Map<string, PriceTier>() };
      collected.set(modelId, record);
      const key = `${range.minTokens}:${range.maxTokens ?? "inf"}`;
      const tier: PriceTier = record.tiers.get(key) || {
        minTokens: range.minTokens,
        maxTokens: range.maxTokens,
        input: input.value,
        output: output.value,
      };
      const promotion = input.promotion || output.promotion;
      if (promotion) tier.promotion = promotion;
      if (cacheHit) tier.cacheHitInput = cacheHit.value;
      const thinkingOnly = mode.startsWith("思考模式") || mode === "仅思考模式";
      if (thinkingOnly) {
        // A separate "思考模式" row prices thinking output; its input equals
        // the non-thinking input on this page.
        tier.thinkingOutput = output.value;
        if (!record.tiers.has(key)) {
          tier.output = output.value;
        }
      } else {
        tier.input = input.value;
        tier.output = output.value;
        if (thinking && thinking.value !== output.value) tier.thinkingOutput = thinking.value;
      }
      record.tiers.set(key, tier);
    }
    for (const [modelId, record] of collected) {
      if (pricing[modelId]) continue; // first (primary) table wins
      pricing[modelId] = {
        currency: "CNY",
        unit: "per_million_tokens",
        region: "cn-beijing",
        scope: record.scope,
        tiers: [...record.tiers.values()].sort((a, b) => a.minTokens - b.minTokens),
      };
    }
  }
  return { pricing, warnings, tableCount };
}

/** Collects model-ID-looking tokens from the featured models page. */
export function parseModelsPage(html: string): string[] {
  const ids = new Set<string>();
  for (const table of extractTables(html)) {
    for (const row of [...table.headerRows, ...table.bodyRows]) {
      for (const cell of row) {
        for (const line of cell.lines) {
          const token = line.split(/\s+/)[0];
          if (MODEL_ID_TOKEN.test(token) && /[\d]/.test(token)) ids.add(token);
        }
      }
    }
  }
  return [...ids].sort();
}
