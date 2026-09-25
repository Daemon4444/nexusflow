import type { BailianSnapshot, DiffCategory, DiffEntry, SelfCheckResult, UpstreamChange } from "./snapshot";

export interface BailianSyncReport {
  generatedAt: string;
  snapshotFetchedAt: string;
  mode: "online" | "offline";
  pages: BailianSnapshot["pages"];
  stats: {
    models: number;
    listed: number;
    rateLimited: number;
    priced: number;
    pools: number;
    parseWarnings: number;
  };
  selfCheck: Pick<SelfCheckResult, "ok" | "priceModelsCompared" | "priceIssues">;
  previousSnapshot: string | null;
  upstreamChanges: UpstreamChange[];
  counts: Record<DiffCategory, number>;
  diffs: DiffEntry[];
}

export const DIFF_CATEGORIES: DiffCategory[] = [
  "limit_above_upstream",
  "price_mismatch",
  "context_mismatch",
  "pool_not_modeled",
  "sold_but_not_listed",
  "limit_below_upstream",
  "listed_not_sold",
  "parse_warning",
];

const CATEGORY_NOTES: Record<DiffCategory, string> = {
  limit_above_upstream: "危险：我们的限流高于上游，上游会先返回 429",
  price_mismatch: "售价与官方价不一致（不自动修改）",
  context_mismatch: "上下文或最大输出与官方不一致",
  pool_not_modeled: "上游共享配额池没有建模，逐模型限流拦不住池级 429",
  sold_but_not_listed: "在售但上游模型列表里没有",
  limit_below_upstream: "我们的限流低于上游（安全但浪费容量）",
  listed_not_sold: "上游已上架、我们未售卖（仅供参考）",
  parse_warning: "解析告警，需要人工确认",
};

export function buildReport(input: {
  snapshot: BailianSnapshot;
  selfCheck: SelfCheckResult;
  previousSnapshot: string | null;
  upstreamChanges: UpstreamChange[];
  diffs: DiffEntry[];
  generatedAt: string;
}): BailianSyncReport {
  const models = Object.values(input.snapshot.models);
  const counts = Object.fromEntries(DIFF_CATEGORIES.map((category) => [category, 0])) as Record<DiffCategory, number>;
  for (const diff of input.diffs) counts[diff.category] += 1;
  return {
    generatedAt: input.generatedAt,
    snapshotFetchedAt: input.snapshot.fetchedAt,
    mode: input.snapshot.mode,
    pages: input.snapshot.pages,
    stats: {
      models: models.length,
      listed: models.filter((model) => model.listed).length,
      rateLimited: models.filter((model) => Object.keys(model.regions).length > 0).length,
      priced: models.filter((model) => model.pricing).length,
      pools: Object.keys(input.snapshot.pools).length,
      parseWarnings: input.snapshot.warnings.length,
    },
    selfCheck: {
      ok: input.selfCheck.ok,
      priceModelsCompared: input.selfCheck.priceModelsCompared,
      priceIssues: input.selfCheck.priceIssues,
    },
    previousSnapshot: input.previousSnapshot,
    upstreamChanges: input.upstreamChanges,
    counts,
    diffs: input.diffs,
  };
}

function cell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export function renderReportMarkdown(report: BailianSyncReport): string {
  const lines = [
    `# 百炼官方数据同步报告（${report.snapshotFetchedAt.slice(0, 10)}）`,
    "",
    `- 模式：${report.mode}；快照时间：${report.snapshotFetchedAt}；报告生成：${report.generatedAt}`,
    `- 解析：${report.stats.models} 个模型（API 上架 ${report.stats.listed}，有限流 ${report.stats.rateLimited}，有北京 token 价 ${report.stats.priced}），共享配额池 ${report.stats.pools} 个，解析告警 ${report.stats.parseWarnings} 条`,
    `- 自检：${report.selfCheck.ok ? "通过" : "失败"}；与人工核对的 REF 比对了 ${report.selfCheck.priceModelsCompared} 个模型，差异 ${report.selfCheck.priceIssues.length} 处`,
    `- 上一次快照：${report.previousSnapshot || "无（首次运行，跳过快照对比）"}`,
    "",
    "> 本报告只供人工审阅：任何结果都不会自动写入配置。",
    "",
    "## 汇总",
    "",
    "| 类别 | 数量 | 含义 |",
    "|---|---|---|",
    ...DIFF_CATEGORIES.map((category) => `| \`${category}\` | ${report.counts[category]} | ${CATEGORY_NOTES[category]} |`),
    "",
    "## 来源页面",
    "",
    ...report.pages.map((page) => `- ${page.url} — sha256 \`${page.sha256}\``),
    "",
  ];
  if (report.selfCheck.priceIssues.length) {
    lines.push("## 与 REF 的价格差异", "", "| 模型 | 分类 | 说明 |", "|---|---|---|");
    for (const issue of report.selfCheck.priceIssues) {
      lines.push(`| \`${issue.model}\` | ${issue.classification} | ${cell(issue.detail)} |`);
    }
    lines.push("");
  }
  if (report.upstreamChanges.length) {
    lines.push("## 与上一次快照相比的上游变化", "", "| 模型 | 字段 |", "|---|---|");
    for (const change of report.upstreamChanges) lines.push(`| \`${change.model}\` | ${change.field} |`);
    lines.push("");
  }
  const LIST_LIMIT = 60;
  for (const category of DIFF_CATEGORIES) {
    const entries = report.diffs.filter((diff) => diff.category === category);
    if (!entries.length) continue;
    lines.push(`## \`${category}\`（${entries.length}）`, "", CATEGORY_NOTES[category], "", "| 模型 | 说明 |", "|---|---|");
    for (const entry of entries.slice(0, LIST_LIMIT)) lines.push(`| \`${cell(entry.model)}\` | ${cell(entry.detail)} |`);
    if (entries.length > LIST_LIMIT) lines.push(`| … | 另有 ${entries.length - LIST_LIMIT} 条，见 JSON 报告 |`);
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}
