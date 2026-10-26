interface TokenPricingTier {
  label: string;
  maxTokens: number;
  promptPrice: number;
  completionPrice: number;
  thinkingCompletionPrice?: number;
  cacheReadPrice?: number;
  cacheReadExplicitPrice?: number;
}

/** 后端已解析的缓存价，与实扣路径同源；前端只渲染，不重算倍率。仅隐式缓存的模型（MiniMax/kimi）无显式字段。 */
interface CachePricing {
  implicitHit: number;
  explicitHit?: number;
  explicitCreation?: number;
  tiers?: {
    label: string;
    implicitHit: number;
    explicitHit?: number;
    explicitCreation?: number;
  }[];
}

/** 后端已解析的思考模式输出价，仅在官方单独定价时返回。 */
interface ThinkingPricing {
  completionPrice: number;
  thinkingCompletionPrice: number;
  tiers?: { label: string; completionPrice: number; thinkingCompletionPrice: number }[];
}

interface UnitPricingTier {
  label: string;
  price: number;
}

export interface AIModel {
  id: string;
  name: string;
  provider: string;
  description: string;
  contextLength: number;
  promptPrice: number | null;
  completionPrice: number | null;
  lifecycle?: "announced";
  audioInputPrice?: number;
  audioOutputPrice?: number;
  pricingStatus?: "unpublished";
  pricingType?: "token" | "per-image" | "per-second" | "per-10k-characters";
  pricingTiers?: UnitPricingTier[];
  tokenPricingTiers?: TokenPricingTier[];
  cachePricing?: CachePricing | null;
  thinkingPricing?: ThinkingPricing | null;
  alternatePricingModes?: Array<{
    id: string;
    label: string;
    promptPrice: number;
    completionPrice: number;
    availability: "available" | "announced";
    note?: string;
  }>;
  category: string;
  tags: string[];
  isNew?: boolean;
  isFeatured?: boolean;
  maxOutput: number;
  supported: string[];
  supportedProtocols?: string[];
  supported_protocols?: string[];
  capabilities?: {
    model_type: string;
    supports_tools: boolean;
    supports_vision: boolean;
    supports_video_input: boolean;
    supports_audio_input: boolean;
    supports_audio_output: boolean;
    thinking_mode: "mixed" | "always" | "none" | "unknown";
    thinking_default: boolean | null;
    supports_enable_thinking: boolean;
    supports_thinking_budget: boolean;
    supports_preserve_thinking: boolean;
    supports_search: boolean;
    supports_parallel_tool_calls: boolean;
    supports_context_caching?: boolean;
  };
  allowed_parameters?: string[];
  availability?: "available" | "temporarily_unavailable" | "disabled";
  availabilityReason?: string | null;
}


/** 价格统一至少两位小数（¥12.00、¥1.50、¥0.022），表格里小数点才能对齐。 */
function compactTokens(n: number) {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(n);
}

export function formatPrice(value: number) {
  const decimals = Math.max(2, (String(value).split('.')[1] || '').length);
  return value.toFixed(decimals);
}

/** Recommendations are derived from this deployment's catalog, not vendor-wide claims. */
export function getModelGuidance(model: AIModel) {
  const c = model.capabilities;
  const type = c?.model_type;
  const evidence = [model.id, ...(model.tags || [])].join(' ');
  const uses: string[] = [];
  const limits: string[] = [];
  if (type === 'embedding') {
    uses.push('把知识库段落与用户问题转换成向量，用于语义检索和 RAG 召回。', '按文本语义做聚类、去重和相似内容推荐。');
    limits.push('输入文本，返回向量；不会直接生成问答回复。', '建库与查询应使用相同模型和向量维度。');
  } else if (type === 'audio') {
    if (model.id.includes('tts')) {
      uses.push('把讲解稿、通知或客服回复合成为语音。');
      limits.push('输入文本；这是非实时 HTTP 语音合成接口，按输入字符计费。');
    } else if (model.id.includes('streaming')) {
      uses.push('实时字幕、语音输入：边上传音频边取得中间转写与句末结果。');
      limits.push('通过 WebSocket 发送音频帧，不能使用普通 HTTP 转写调用。', '单连接最长 30 分钟，并受约 5 分钟音频费用上限约束；到限后需重新连接。');
    } else {
      uses.push('把录音转换成文本，供字幕制作、会议记录整理或后续内容分析使用。');
      limits.push('通过 file_url 传入公网可访问的音频；此页面对应 HTTP 转写接口。');
      if (model.id === 'qwen-audio-3.1-asr-flash') limits.push('单文件不超过 5 分钟；按音频输入 Token 与文本输出 Token 计费。');
    }
    limits.push('音频编码、采样率与文件大小请按接入文档准备，不能仅更改文件扩展名。');
  } else if (type === 'video') {
    if (/video.?edit/.test(model.id)) uses.push('基于已有视频修改内容或风格，适合视频素材二次创作。');
    else if (model.id.includes('i2v')) uses.push('以产品图、人物图或场景图为起始画面，生成动态展示片段。');
    else if (model.id.includes('r2v')) uses.push('围绕参考素材中的人物或物体生成片段，用于角色展示与故事镜头。');
    else uses.push('根据镜头描述生成视频片段，用于分镜预览和短片素材制作。');
    limits.push(`当前目录开放：${model.supported.join('、')}。`, '异步提交后需要轮询任务结果；分辨率、时长及参考素材数量按该模型接口要求设置。');
    if (model.maxOutput > 0) limits.push(`目录标注最长输出 ${model.maxOutput} 秒，具体规格可能有更低上限。`);
  } else if (type === 'image') {
    uses.push('根据文字描述制作插画、产品场景图与设计草稿。');
    limits.push(`当前目录开放：${model.supported.join('、')}。`, '图片尺寸与数量需使用接口支持的取值；图像生成能力不等同于通用图片问答。');
  } else {
    if (/翻译|qwen-mt/.test(evidence)) uses.push('翻译产品说明、客服内容与多语言文档，并在提示中提供术语表。');
    else if (/意图|intent-detect/.test(evidence)) uses.push('识别客服请求意图，把咨询分配到订单、退款或技术支持流程。');
    else if (/数学|math/.test(evidence)) uses.push('拆解数学题、核对推导过程，并生成公式与解题说明。');
    if (model.category === '编程模型' || /编程|代码|coder|code/i.test(evidence)) uses.push('结合源码与报错定位问题、修改函数、补充测试或规划重构。');
    if (c?.supports_vision) uses.push('读取截图、图表与文档页面图片，提取信息或解释视觉内容。');
    if (c?.supports_audio_output && uses.length < 3) uses.push('语音对话与音频回复：输入文字、图片、音频或视频，直接得到语音输出。');
    if (model.contextLength >= 128000 && uses.length < 3) uses.push('把多份文档的正文放入同一上下文，提取条款、汇总要点并交叉核对。');
    if (!uses.length) uses.push('整理文本、提取业务字段，或结合已有资料生成多轮问答回复。');
    if (c?.supports_tools && uses.length < 3) uses.push('为业务工具生成调用参数，串联查询与多步骤处理流程。');
    const modalities = ['文本', ...(c?.supports_vision ? ['图片'] : []), ...(c?.supports_audio_input ? ['音频'] : []), ...(c?.supports_video_input ? ['视频'] : [])];
    if (model.contextLength > 0) limits.push(`上下文窗口 ${compactTokens(model.contextLength)} Token${model.maxOutput > 0 ? `，单次最长输出 ${compactTokens(model.maxOutput)} Token` : ''}。`);
    limits.push(`输入支持${modalities.join('、')}${c?.supports_audio_output ? '，可输出音频' : ''}。PDF、Word、Excel 请先提取正文${c?.supports_vision ? '，扫描件转为页面图片' : ''}；暂不支持直接上传文件。`);
    limits.push(c?.supports_tools ? '支持工具调用；工具由你的应用执行，模型不会自行运行代码。' : '不支持工具调用。');
    limits.push(c?.thinking_mode === 'always' ? '思考始终开启、不能关闭，输出预算包含思考 Token。' : c?.thinking_mode === 'mixed' ? `思考模式可切换${c.thinking_default == null ? '' : `，默认${c.thinking_default ? '开启' : '关闭'}`}；开启后输出预算包含思考 Token。` : '不支持思考模式。');
  }
  if (model.availability && model.availability !== 'available') limits.unshift('当前未开放调用；以下用途仅供选型参考。');
  return { uses: uses.slice(0, 3), limits };
}

export interface CostInputs {
  input: number; output: number; cached: number; created: number;
  cacheMode: 'implicit' | 'explicit'; thinking: boolean;
  quantity: number; specification: number; audioInput: number; audioOutput: number;
}
export interface CostLine { label: string; quantity: number; rate: number; amount: number }
export function estimateModelCost(model: AIModel, value: CostInputs): { error?: string; lines: CostLine[]; total?: number; tier?: string } {
  const fail = (error: string) => ({ error, lines: [] });
  const unit = model.pricingType && model.pricingType !== 'token';
  const valid = (n: number) => Number.isFinite(n) && n >= 0 && n <= Number.MAX_SAFE_INTEGER;
  const lines: CostLine[] = [];
  const add = (label: string, quantity: number, rate: number | null | undefined, divisor = 1_000_000) => {
    if (rate == null || !valid(rate)) throw new Error('当前计费项未公布价格，暂不能估算。');
    lines.push({ label, quantity, rate, amount: quantity * rate / divisor });
  };
  try {
    if (unit) {
      if (!valid(value.quantity) || value.quantity <= 0) return fail('请输入大于 0 的用量。');
      if (model.pricingType !== 'per-second' && !Number.isInteger(value.quantity)) return fail('图片张数和字符数必须为整数。');
      const spec = model.pricingTiers?.[value.specification];
      if (model.pricingTiers?.length && !spec) return fail('请选择有效的计费规格。');
      if (model.capabilities?.model_type === 'video' && model.maxOutput > 0 && value.quantity > model.maxOutput) return fail(`单次视频输出不能超过目录上限 ${model.maxOutput} 秒。`);
      add(spec?.label || '用量', value.quantity, spec?.price ?? model.promptPrice, model.pricingType === 'per-10k-characters' ? 10000 : 1);
    } else {
      const counts = [value.input, value.output, value.cached, value.created, value.audioInput, value.audioOutput];
      if (counts.some(n => !valid(n) || !Number.isInteger(n))) return fail('Token 数量必须是非负整数。');
      if (model.promptPrice == null || model.completionPrice == null) return fail('价格待公布，暂不能估算。');
      if (model.maxOutput > 0 && value.output > model.maxOutput) return fail(`输出超过目录上限 ${model.maxOutput.toLocaleString()} Token。`);
      if (model.contextLength > 0 && value.input + value.output > model.contextLength) return fail(`输入与输出合计超过上下文窗口 ${model.contextLength.toLocaleString()} Token。`);
      if (value.audioInput > value.input || value.audioOutput > value.output) return fail('音频 Token 不能超过对应的总 Token 数。');
      if (value.cached + value.created > value.input - value.audioInput) return fail('缓存命中与创建 Token 合计不能超过非音频输入。');
      const tiers = model.tokenPricingTiers || [];
      const tier = tiers.find(t => Math.max(1, value.input) <= t.maxTokens) || tiers.at(-1);
      const cache = tier ? model.cachePricing?.tiers?.find(t => t.label === tier.label) : model.cachePricing;
      const thinking = tier ? model.thinkingPricing?.tiers?.find(t => t.label === tier.label)?.thinkingCompletionPrice ?? tier.thinkingCompletionPrice ?? tier.completionPrice : model.thinkingPricing?.thinkingCompletionPrice ?? model.completionPrice;
      add('未缓存输入', value.input - value.audioInput - value.cached - value.created, tier?.promptPrice ?? model.promptPrice);
      if (value.cached) add(value.cacheMode === 'explicit' ? '显式缓存命中' : '隐式缓存命中', value.cached, value.cacheMode === 'explicit' ? cache?.explicitHit : cache?.implicitHit);
      if (value.created) {
        if (value.cacheMode !== 'explicit') return fail('创建缓存需要选择显式缓存模式。');
        add('显式缓存创建', value.created, cache?.explicitCreation);
      }
      if (value.audioInput) add('音频输入', value.audioInput, model.audioInputPrice);
      if (value.audioOutput) add('音频输出', value.audioOutput, model.audioOutputPrice);
      else add('输出（含思考）', value.output, value.thinking ? thinking : tier?.completionPrice ?? model.completionPrice);
      return { lines, total: Number(lines.reduce((sum, line) => sum + line.amount, 0).toFixed(6)), tier: tier?.label };
    }
    return { lines, total: Number(lines.reduce((sum, line) => sum + line.amount, 0).toFixed(6)) };
  } catch (error) { return fail((error as Error).message); }
}
