/**
 * 用官方价本校验本地模型目录。
 * 百炼参考值逐条抄自官方 CSV（中国内地部署范围）；Claude 参考值来自
 * Anthropic 官方定价页 https://docs.anthropic.com/en/docs/about-claude/pricing ，
 * 按 1 USD = 6.8 CNY 折算。仅覆盖本平台在售的模型，不参与运行时。
 */
import { getStaticModels, resolveCachePricing, resolveCompletionPrice, AIModel } from "../src/data/models";
import { REF, UNIT_REF } from "../src/data/official-pricing-ref";

const at6 = (v: number) => Math.round(v * 1_000_000) / 1_000_000;
const problems: string[] = [];
const notes: string[] = [];
const add = (id: string, msg: string) => problems.push(`${id.padEnd(22)} ${msg}`);

const models = new Map(getStaticModels().map((m) => [m.id, m]));

for (const [id, ref] of Object.entries(REF)) {
  const m = models.get(id) as AIModel | undefined;
  if (!m) { notes.push(`${id} 不在本地目录（官方有价，未接入）`); continue; }

  if (ref.ctx !== undefined && m.contextLength !== ref.ctx) {
    add(id, `contextLength ${m.contextLength} ≠ 官方 ${ref.ctx}`);
  }
  if (ref.maxOut !== undefined && m.maxOutput !== ref.maxOut) {
    add(id, `maxOutput ${m.maxOutput} ≠ 官方 ${ref.maxOut}`);
  }
  if (ref.in !== undefined && at6(m.promptPrice) !== ref.in) {
    add(id, `输入价 ${m.promptPrice} ≠ 官方 ${ref.in}`);
  }
  if (ref.out !== undefined && at6(m.completionPrice) !== ref.out) {
    add(id, `输出价 ${m.completionPrice} ≠ 官方 ${ref.out}`);
  }

  // 模型级缓存
  const base = resolveCachePricing(m);
  if (ref.cache !== undefined && !ref.tiers && at6(base.implicitHit) !== ref.cache) {
    add(id, `隐式缓存命中 实收 ${at6(base.implicitHit)} ≠ 官方 ${ref.cache}`);
  }
  if (ref.read !== undefined && !ref.tiers && at6(base.explicitHit) !== ref.read) {
    add(id, `显式缓存命中 实收 ${at6(base.explicitHit)} ≠ 官方 ${ref.read}`);
  }
  if (ref.create !== undefined && !ref.tiers && at6(base.explicitCreation) !== ref.create) {
    add(id, `显式缓存创建 实收 ${at6(base.explicitCreation)} ≠ 官方 ${ref.create}`);
  }

  // 档位
  if (ref.tiers) {
    const local = m.tokenPricingTiers || [];
    if (local.length !== ref.tiers.length) {
      add(id, `档位数 ${local.length} ≠ 官方 ${ref.tiers.length}`);
    }
    ref.tiers.forEach((rt, i) => {
      const lt = local[i];
      if (!lt) return;
      if (lt.maxTokens !== rt.max) add(id, `档${i + 1} maxTokens ${lt.maxTokens} ≠ 官方 ${rt.max}`);
      if (at6(lt.promptPrice) !== rt.in) add(id, `档${i + 1} 输入价 ${lt.promptPrice} ≠ 官方 ${rt.in}`);
      if (at6(lt.completionPrice) !== rt.out) add(id, `档${i + 1} 输出价 ${lt.completionPrice} ≠ 官方 ${rt.out}`);
      const tc = resolveCachePricing(m, lt);
      if (rt.cache !== undefined && at6(tc.implicitHit) !== rt.cache) {
        add(id, `档${i + 1} 隐式缓存 实收 ${at6(tc.implicitHit)} ≠ 官方 ${rt.cache}`);
      }
      if (rt.read !== undefined && at6(tc.explicitHit) !== rt.read) {
        add(id, `档${i + 1} 显式缓存 实收 ${at6(tc.explicitHit)} ≠ 官方 ${rt.read}`);
      }
      if (rt.thinkingOut !== undefined) {
        const actual = at6(resolveCompletionPrice(m, lt, true));
        if (actual !== rt.thinkingOut) add(id, `档${i + 1} 思考模式输出 实收 ${actual} ≠ 官方 ${rt.thinkingOut}`);
      }
    });
  }

  // omni 音频分模态
  if (ref.audioIn !== undefined) {
    if (m.audioInputPrice === undefined) add(id, `缺 audioInputPrice（官方音频输入 ${ref.audioIn}，现按文本价 ${m.promptPrice} 计=少收 ${at6(ref.audioIn / m.promptPrice)}倍）`);
    else if (at6(m.audioInputPrice) !== ref.audioIn) add(id, `audioInputPrice ${m.audioInputPrice} ≠ 官方 ${ref.audioIn}`);
  }
  if (ref.audioOut !== undefined) {
    if (m.audioOutputPrice === undefined) add(id, `缺 audioOutputPrice（官方 ${ref.audioOut}）`);
    else if (at6(m.audioOutputPrice) !== ref.audioOut) add(id, `audioOutputPrice ${m.audioOutputPrice} ≠ 官方 ${ref.audioOut}`);
  }

  // 思考模式输出价（模型级）
  if (ref.thinkingOut !== undefined) {
    const actual = at6(resolveCompletionPrice(m, null, true));
    if (actual !== ref.thinkingOut) add(id, `思考模式输出 实收 ${actual} ≠ 官方 ${ref.thinkingOut}`);
  }
}

for (const [id, ref] of Object.entries(UNIT_REF)) {
  const m = models.get(id);
  if (!m) { add(id, "百炼非 token 计费模型未接入"); continue; }
  if (m.pricingType !== ref.pricingType) add(id, `计费单位 ${m.pricingType} ≠ 官方 ${ref.pricingType}`);
  if (at6(m.promptPrice) !== ref.base) add(id, `基础单价 ${m.promptPrice} ≠ 官方 ${ref.base}`);
  const local = m.pricingTiers || [];
  if (local.length !== ref.tiers.length) add(id, `单位计费档位数 ${local.length} ≠ 官方 ${ref.tiers.length}`);
  ref.tiers.forEach((expected, index) => {
    const actual = local[index];
    if (!actual) return;
    if (actual.label !== expected.label) add(id, `单位档${index + 1}标签 ${actual.label} ≠ 官方 ${expected.label}`);
    if (at6(actual.price) !== expected.price) add(id, `单位档${index + 1}单价 ${actual.price} ≠ 官方 ${expected.price}`);
  });
}

console.log(`=== 校验 ${Object.keys(REF).length} 个 token 模型 + ${Object.keys(UNIT_REF).length} 个单位计费模型，发现 ${problems.length} 处不一致 ===`);
for (const p of problems) console.log("  ✗ " + p);
console.log(`\n=== schema 表达能力缺口 / 备注 ${notes.length} 条 ===`);
for (const n of notes) console.log("  ! " + n);
if (problems.length > 0) process.exitCode = 1;
