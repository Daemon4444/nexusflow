/**
 * Structured capabilities → display labels (P5). The Chinese capability
 * strings shown in the console and model pages are generated from the
 * structured `capabilities` for every label that has a structured source;
 * labels without one (e.g. 前缀续写, 批量推理, media task labels) are
 * editorial and kept as authored.
 */
import type { CpCapabilities, CpModel } from "./schema";

/** Label → how it follows from the structured capabilities (chat models). */
export const CAPABILITY_LABELS: ReadonlyArray<{ label: string; derive: (caps: CpCapabilities) => boolean }> = [
  { label: "文本", derive: (caps) => caps.input.text && caps.output.text },
  { label: "图像输入", derive: (caps) => caps.input.image },
  { label: "音频输入", derive: (caps) => caps.input.audio },
  { label: "音频输出", derive: (caps) => caps.output.audio },
  { label: "视频输入", derive: (caps) => caps.input.video },
  { label: "函数调用", derive: (caps) => caps.tools.supported },
  { label: "思考模式", derive: (caps) => caps.thinking.mode === "mixed" || caps.thinking.mode === "always" },
  { label: "联网搜索", derive: (caps) => caps.search },
  { label: "结构化输出", derive: (caps) => caps.structured_output },
  { label: "上下文缓存", derive: (caps) => caps.caching.implicit || caps.caching.explicit },
];

const DERIVED = new Set(CAPABILITY_LABELS.map((item) => item.label));
/** Labels that express thinking in the legacy catalog. */
const THINKING_ALIASES = new Set(["思考模式", "思考链"]);

function isChatModel(model: Pick<CpModel, "capabilities">): boolean {
  return model.capabilities.output.text;
}

/**
 * Display labels for a model: the capability-derived labels in canonical
 * order, then the editorial labels already authored (order preserved).
 * Non-chat models keep their authored labels unchanged.
 */
export function displaySupportedFor(model: Pick<CpModel, "capabilities" | "display">): string[] {
  if (!isChatModel(model)) return [...model.display.supported];
  const derived = CAPABILITY_LABELS.filter((item) => item.derive(model.capabilities)).map((item) => item.label);
  const hasThinkingAlias = model.display.supported.includes("思考链");
  const labels = derived.filter((label) => !(label === "思考模式" && hasThinkingAlias));
  const editorial = model.display.supported.filter((label) => !DERIVED.has(label) && !(THINKING_ALIASES.has(label) && !derived.includes("思考模式")));
  return [...labels, ...editorial.filter((label) => !labels.includes(label))];
}

/**
 * Capability-derived labels whose presence disagrees with the structured
 * capabilities (validation warning, listed in the backfill report).
 */
export function displayCapabilityMismatches(model: Pick<CpModel, "id" | "capabilities" | "display">): string[] {
  if (!isChatModel(model)) return [];
  const issues: string[] = [];
  for (const item of CAPABILITY_LABELS) {
    const shown = model.display.supported.includes(item.label)
      || (item.label === "思考模式" && model.display.supported.includes("思考链"));
    const actual = item.derive(model.capabilities);
    if (shown && !actual) issues.push(`shows “${item.label}” but capabilities say no`);
    if (!shown && actual) issues.push(`capabilities say “${item.label}” but it is not shown`);
  }
  return issues;
}

/** Public, structured capability object for /v1/models (NF_CP_MODE=enforce). */
export function publicCapabilities(model: Pick<CpModel, "capabilities">) {
  const caps = model.capabilities;
  return {
    input: { ...caps.input },
    output: { ...caps.output },
    tools: { ...caps.tools },
    thinking: { ...caps.thinking },
    search: caps.search,
    caching: { ...caps.caching },
    structured_output: caps.structured_output,
  };
}
