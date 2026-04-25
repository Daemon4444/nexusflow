export interface AIModel {
  id: string;
  name: string;
  provider: string;
  description: string;
  contextLength: number;
  promptPrice: number;   // per 1M tokens (CNY)
  completionPrice: number; // per 1M tokens (CNY)
  category: string;
  tags: string[];
  isNew?: boolean;
  isFeatured?: boolean;
  maxOutput: number;
  supported: string[];
}

export const models: AIModel[] = [
  // ========== 通义千问 Qwen 旗舰系列 ==========
  {
    id: "qwen3-max",
    name: "Qwen3 Max",
    provider: "通义千问",
    description: "通义千问3代最强旗舰模型，支持思考模式切换，在复杂推理、代码生成、数学等方面表现卓越。262K上下文窗口。",
    contextLength: 262144,
    promptPrice: 2.5,
    completionPrice: 10,
    category: "大语言模型",
    tags: ["旗舰", "推理", "编程", "思考模式"],
    isFeatured: true,
    isNew: true,
    maxOutput: 16384,
    supported: ["文本", "函数调用", "思考模式"]
  },
  {
    id: "qwen3.6-max-preview",
    name: "Qwen3.6 Max Preview",
    provider: "通义千问",
    description: "通义千问3.6代最强预览模型，面向复杂推理、代码生成和多步骤工具任务，适合需要更强思考能力的场景。",
    contextLength: 262144,
    promptPrice: 9.742,
    completionPrice: 58.455,
    category: "大语言模型",
    tags: ["旗舰", "推理", "预览版"],
    isFeatured: true,
    isNew: true,
    maxOutput: 65536,
    supported: ["文本", "函数调用", "思考模式"]
  },
  {
    id: "qwen3.6-plus",
    name: "Qwen3.6 Plus",
    provider: "通义千问",
    description: "通义千问3.6代均衡旗舰模型，支持百万级上下文、函数调用和内置工具，适合大型代码库与通用生产场景。",
    contextLength: 1000000,
    promptPrice: 3.7471,
    completionPrice: 22.4826,
    category: "大语言模型",
    tags: ["高性价比", "均衡", "百万上下文"],
    isFeatured: true,
    isNew: true,
    maxOutput: 65536,
    supported: ["文本", "函数调用", "内置工具", "思考模式"]
  },
  {
    id: "qwen3.5-plus",
    name: "Qwen3.5 Plus",
    provider: "通义千问",
    description: "通义千问3.5代增强版，效果、速度、成本最佳平衡。支持百万级上下文窗口，适合大规模应用场景。",
    contextLength: 1000000,
    promptPrice: 0.8,
    completionPrice: 4.8,
    category: "大语言模型",
    tags: ["高性价比", "均衡", "百万上下文"],
    isFeatured: true,
    isNew: true,
    maxOutput: 16384,
    supported: ["文本", "函数调用", "思考模式"]
  },
  {
    id: "qwen3.5-flash",
    name: "Qwen3.5 Flash",
    provider: "通义千问",
    description: "通义千问3.5代闪电版，适合简单任务，速度快、成本低。支持百万级上下文窗口和上下文缓存。",
    contextLength: 1000000,
    promptPrice: 0.2,
    completionPrice: 2,
    category: "大语言模型",
    tags: ["极速", "低成本", "百万上下文"],
    isNew: true,
    maxOutput: 16384,
    supported: ["文本", "函数调用", "思考模式"]
  },
  {
    id: "qwen-plus",
    name: "Qwen Plus",
    provider: "通义千问",
    description: "通义千问增强版，效果和速度的经典平衡点，适合大规模应用场景。",
    contextLength: 131072,
    promptPrice: 0.8,
    completionPrice: 2,
    category: "大语言模型",
    tags: ["高性价比", "均衡", "通用"],
    isFeatured: true,
    maxOutput: 16384,
    supported: ["文本", "函数调用"]
  },
  {
    id: "qwen-turbo",
    name: "Qwen Turbo",
    provider: "通义千问",
    description: "通义千问高速版，响应极快，成本最低，适合对延迟敏感的应用场景。",
    contextLength: 131072,
    promptPrice: 0.3,
    completionPrice: 0.6,
    category: "大语言模型",
    tags: ["快速", "低成本", "通用"],
    maxOutput: 16384,
    supported: ["文本", "函数调用"]
  },
  {
    id: "qwen-long",
    name: "Qwen Long",
    provider: "通义千问",
    description: "通义千问长文本模型，支持超长上下文，适合文档分析和长文本理解。上下文窗口高达1000万token。",
    contextLength: 10000000,
    promptPrice: 0.5,
    completionPrice: 2,
    category: "大语言模型",
    tags: ["超长上下文", "文档分析"],
    maxOutput: 8192,
    supported: ["文本"]
  },

  // ========== Qwen3 开源系列 ==========
  {
    id: "qwen3-235b-a22b",
    name: "Qwen3 235B-A22B",
    provider: "通义千问",
    description: "Qwen3开源旗舰，2350亿参数MoE架构（激活220亿），支持思考与非思考模式动态切换。",
    contextLength: 131072,
    promptPrice: 1,
    completionPrice: 4,
    category: "大语言模型",
    tags: ["开源", "MoE", "推理", "思考模式"],
    isNew: true,
    maxOutput: 8192,
    supported: ["文本", "函数调用", "思考模式"]
  },
  {
    id: "qwen3-32b",
    name: "Qwen3 32B",
    provider: "通义千问",
    description: "Qwen3开源320亿参数密集模型，在中等规模模型中表现优异。",
    contextLength: 131072,
    promptPrice: 0.5,
    completionPrice: 2,
    category: "大语言模型",
    tags: ["开源", "推理", "编程"],
    maxOutput: 8192,
    supported: ["文本", "函数调用"]
  },

  // ========== 推理模型 ==========
  {
    id: "qwq-plus",
    name: "QwQ Plus",
    provider: "通义千问",
    description: "通义千问推理模型，基于Qwen2.5训练，擅长数学、逻辑推理和复杂问题分析，展示完整思考链路。",
    contextLength: 131072,
    promptPrice: 1,
    completionPrice: 4,
    category: "推理模型",
    tags: ["推理", "数学", "逻辑", "思考链"],
    isFeatured: true,
    maxOutput: 16384,
    supported: ["文本", "思考链"]
  },

  // ========== 视觉模型 ==========
  {
    id: "qwen-vl-max",
    name: "Qwen VL Max",
    provider: "通义千问",
    description: "通义千问视觉旗舰模型，支持图像理解、图文对话、文档OCR等多模态任务。",
    contextLength: 32768,
    promptPrice: 3,
    completionPrice: 9,
    category: "多模态模型",
    tags: ["视觉", "多模态", "OCR", "图文理解"],
    isFeatured: true,
    maxOutput: 8192,
    supported: ["文本", "图像输入"]
  },
  {
    id: "qwen-vl-plus",
    name: "Qwen VL Plus",
    provider: "通义千问",
    description: "通义千问视觉增强版，平衡性能与成本的多模态模型。",
    contextLength: 32768,
    promptPrice: 1.5,
    completionPrice: 4.5,
    category: "多模态模型",
    tags: ["视觉", "多模态", "高性价比"],
    maxOutput: 8192,
    supported: ["文本", "图像输入"]
  },
  {
    id: "qwen3-vl-plus",
    name: "Qwen3 VL Plus",
    provider: "通义千问",
    description: "Qwen3代视觉语言模型，图像理解能力大幅提升，支持高分辨率图像输入。262K上下文窗口。",
    contextLength: 262144,
    promptPrice: 1,
    completionPrice: 10,
    category: "多模态模型",
    tags: ["视觉", "多模态", "高分辨率"],
    isNew: true,
    maxOutput: 8192,
    supported: ["文本", "图像输入"]
  },
  {
    id: "qwen3-vl-flash",
    name: "Qwen3 VL Flash",
    provider: "通义千问",
    description: "Qwen3代视觉闪电版，快速图像理解，适合实时场景。免费体验。",
    contextLength: 131072,
    promptPrice: 0,
    completionPrice: 0,
    category: "多模态模型",
    tags: ["视觉", "免费", "极速"],
    maxOutput: 8192,
    supported: ["文本", "图像输入"]
  },
  // ========== 全能模型 ==========
  {
    id: "qwen3-omni-flash",
    name: "Qwen3 Omni Flash",
    provider: "通义千问",
    description: "通义千问3代全能模型，接收文本、图片、视频等多种模态输入，适合复杂多模态理解场景。",
    contextLength: 65536,
    promptPrice: 1.8,
    completionPrice: 6.9,
    category: "多模态模型",
    tags: ["全能", "多模态", "视频输入"],
    isNew: true,
    maxOutput: 8192,
    supported: ["文本", "图像输入", "视频输入"]
  },

  // ========== 编程专用 ==========
  {
    id: "qwen3-coder-plus",
    name: "Qwen3 Coder Plus",
    provider: "通义千问",
    description: "通义千问3代卓越代码模型，擅长工具调用和环境交互，代码生成、补全、Debug和重构能力出色。百万级上下文。",
    contextLength: 1000000,
    promptPrice: 4,
    completionPrice: 16,
    category: "编程模型",
    tags: ["编程", "代码生成", "工具调用", "百万上下文"],
    isFeatured: true,
    isNew: true,
    maxOutput: 16384,
    supported: ["文本", "代码生成", "函数调用"]
  },
  {
    id: "qwen3-coder-flash",
    name: "Qwen3 Coder Flash",
    provider: "通义千问",
    description: "通义千问3代编程闪电版，快速代码补全和生成，适合IDE集成场景。免费体验。",
    contextLength: 131072,
    promptPrice: 0,
    completionPrice: 0,
    category: "编程模型",
    tags: ["编程", "极速", "免费"],
    isNew: true,
    maxOutput: 8192,
    supported: ["文本", "代码生成"]
  },

  // ========== 数学模型 ==========
  {
    id: "qwen-math-plus",
    name: "Qwen Math Plus",
    provider: "通义千问",
    description: "通义千问数学专用模型，擅长各类数学问题求解、证明和计算，支持LaTeX格式输出。",
    contextLength: 4096,
    promptPrice: 4,
    completionPrice: 12,
    category: "推理模型",
    tags: ["数学", "推理", "求解", "LaTeX"],
    isNew: true,
    maxOutput: 4096,
    supported: ["文本", "数学求解"]
  },

  // ========== 翻译模型 ==========
  {
    id: "qwen-mt-plus",
    name: "Qwen MT Plus",
    provider: "通义千问",
    description: "通义千问旗舰级翻译大模型，支持92个语种互译，翻译质量优异，适合专业翻译场景。",
    contextLength: 16384,
    promptPrice: 1.8,
    completionPrice: 5.4,
    category: "专业模型",
    tags: ["翻译", "92语种", "专业"],
    isNew: true,
    maxOutput: 8192,
    supported: ["文本", "翻译"]
  },

  // ========== 向量模型 ==========
  {
    id: "text-embedding-v3",
    name: "Text Embedding V3",
    provider: "通义千问",
    description: "通义千问最新文本向量模型，将文本转换为高维向量表示，适用于语义搜索、聚类、推荐等场景。",
    contextLength: 8192,
    promptPrice: 0.7,
    completionPrice: 0,
    category: "向量模型",
    tags: ["向量", "嵌入", "语义搜索"],
    isNew: true,
    maxOutput: 1,
    supported: ["文本到向量"]
  },

  // ========== 图像生成 ==========
  {
    id: "wan2.6-t2i",
    name: "万相 2.6 文生图",
    provider: "通义千问",
    description: "最新一代文生图旗舰模型，支持图文混排输出和图像编辑。可处理复杂指令、渲染中英文本，生成高清写实图片。支持多种分辨率和宽高比。",
    contextLength: 4000,
    promptPrice: 0.20,  // 元/张
    completionPrice: 0,
    category: "图像生成",
    tags: ["图像生成", "文生图", "图文混排", "高清写实", "文字渲染"],
    isFeatured: true,
    isNew: true,
    maxOutput: 4,
    supported: ["文本到图像", "图文混排", "图像编辑"]
  },
  // ========== 视频生成 ==========
  {
    id: "wan2.6-t2v",
    name: "万相 2.6 文生视频",
    provider: "通义千问",
    description: "最新一代文生视频旗舰模型，支持多镜头叙事和智能分镜。可生成2-15秒1080P高清视频，支持prompt改写。生成耗时约1-5分钟。",
    contextLength: 1500,
    promptPrice: 0.15,  // 元/秒/1080P
    completionPrice: 0,
    category: "视频生成",
    tags: ["视频生成", "文生视频", "多镜头", "1080P"],
    isFeatured: true,
    isNew: true,
    maxOutput: 15,
    supported: ["文生视频", "多镜头叙事"],
    // 限制: RPS 5, 并发 5
  },
  {
    id: "wan2.6-i2v",
    name: "万相 2.6 图生视频",
    provider: "通义千问",
    description: "图像驱动视频生成模型，以输入图像作为首帧生成连贯视频。支持多镜头叙事、自动配音、720P/1080P分辨率，时长2-15秒。画面连贯性和运动一致性出色。",
    contextLength: 1500,
    promptPrice: 0.15,  // 元/秒/1080P
    completionPrice: 0,
    category: "视频生成",
    tags: ["视频生成", "图生视频", "首帧驱动", "多镜头", "配音"],
    isFeatured: true,
    isNew: true,
    maxOutput: 15,
    supported: ["图生视频", "多镜头叙事", "自动配音"],
    // 限制: RPS 5, 并发 5
  },
  {
    id: "wan2.6-i2v-flash",
    name: "万相 2.6 图生视频 Flash",
    provider: "通义千问",
    description: "图生视频快速版，支持有声/无声视频生成。生成速度更快，适合对延迟敏感的场景。支持720P/1080P，时长2-15秒。",
    contextLength: 1500,
    promptPrice: 0.10,  // 元/秒/1080P
    completionPrice: 0,
    category: "视频生成",
    tags: ["视频生成", "图生视频", "快速", "Flash"],
    isNew: true,
    maxOutput: 15,
    supported: ["图生视频", "快速生成"],
  },
  {
    id: "wan2.6-r2v",
    name: "万相 2.6 参考生视频",
    provider: "通义千问",
    description: "多模态输入视频生成模型，支持文本/图像/视频作为参考。可将人物或物体作为主角，生成单角色表演或多角色互动视频。时长2-10秒，支持智能分镜。",
    contextLength: 1500,
    promptPrice: 0.15,  // 元/秒/1080P
    completionPrice: 0,
    category: "视频生成",
    tags: ["视频生成", "参考生视频", "角色扮演", "多模态"],
    isNew: true,
    maxOutput: 10,
    supported: ["参考生视频", "角色扮演", "多角色互动"],
  },
  {
    id: "wan2.6-r2v-flash",
    name: "万相 2.6 参考生视频 Flash",
    provider: "通义千问",
    description: "参考生视频快速版，支持有声/无声输出。生成速度更快，适合快速迭代场景。支持720P/1080P分辨率。",
    contextLength: 1500,
    promptPrice: 0.10,
    completionPrice: 0,
    category: "视频生成",
    tags: ["视频生成", "参考生视频", "快速", "Flash"],
    isNew: true,
    maxOutput: 10,
    supported: ["参考生视频", "快速生成"],
  },
  {
    id: "pixverse-v4.5",
    name: "PixVerse V4.5",
    provider: "拍我AI (PixVerse)",
    description: "PixVerse最新旗舰视频生成模型，支持文生视频、图生视频，画面质量和运动一致性大幅提升。支持5秒/8秒时长，多种分辨率和画面比例。",
    contextLength: 500,
    promptPrice: 0,
    completionPrice: 0,
    category: "视频生成",
    tags: ["视频生成", "文生视频", "图生视频", "旗舰"],
    isFeatured: true,
    isNew: true,
    maxOutput: 1,
    supported: ["文生视频", "图生视频"]
  },
  {
    id: "pixverse-v4",
    name: "PixVerse V4",
    provider: "拍我AI (PixVerse)",
    description: "PixVerse V4视频生成模型，高质量视频输出，支持5秒/8秒时长和540p/720p/1080p多种分辨率。",
    contextLength: 500,
    promptPrice: 0,
    completionPrice: 0,
    category: "视频生成",
    tags: ["视频生成", "文生视频", "图生视频"],
    maxOutput: 1,
    supported: ["文生视频", "图生视频"]
  },
  {
    id: "pixverse-v3.5",
    name: "PixVerse V3.5",
    provider: "拍我AI (PixVerse)",
    description: "PixVerse V3.5视频生成模型，性价比高，适合大规模视频创作场景。生成速度快，质量稳定。",
    contextLength: 500,
    promptPrice: 0,
    completionPrice: 0,
    category: "视频生成",
    tags: ["视频生成", "文生视频", "高性价比"],
    maxOutput: 1,
    supported: ["文生视频", "图生视频"]
  },

  // ========== HappyHorse 快乐小马 ==========
  {
    id: "happyhorse-1.0",
    name: "HappyHorse 1.0",
    provider: "阿里巴巴 (Alibaba)",
    description: "阿里巴巴2026年最新AI视频生成模型，在Artificial Analysis视频生成榜单排名第一。支持高质量视频生成、多风格转换，画面流畅自然。",
    contextLength: 1500,
    promptPrice: 0.12,
    completionPrice: 0,
    category: "视频生成",
    tags: ["视频生成", "文生视频", "图生视频", "高质量", "榜单第一"],
    isFeatured: true,
    isNew: true,
    maxOutput: 15,
    supported: ["文生视频", "图生视频", "多风格"]
  },

  // ========== DeepSeek 系列 ==========
  {
    id: "deepseek-v4-flash",
    name: "DeepSeek V4 Flash",
    provider: "DeepSeek",
    description: "百炼接入的 DeepSeek V4 Flash 高速模型，适合低延迟和高并发在线对话场景。",
    contextLength: 131072,
    promptPrice: 1,
    completionPrice: 4,
    category: "大语言模型",
    tags: ["V4", "极速", "高并发", "性价比"],
    isNew: true,
    maxOutput: 16384,
    supported: ["文本", "函数调用"]
  },
  {
    id: "deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    provider: "DeepSeek",
    description: "百炼接入的 DeepSeek V4 Pro 旗舰模型，面向复杂推理、代码生成和多步骤任务。",
    contextLength: 131072,
    promptPrice: 4,
    completionPrice: 16,
    category: "推理模型",
    tags: ["V4", "旗舰", "推理", "编程"],
    isFeatured: true,
    isNew: true,
    maxOutput: 16384,
    supported: ["文本", "函数调用", "思考链"]
  },
  {
    id: "deepseek-v3.2",
    name: "DeepSeek V3.2",
    provider: "DeepSeek",
    description: "深度求索最新通用大模型，MoE架构，中英双语能力突出，编程能力强大。",
    contextLength: 131072,
    promptPrice: 1,
    completionPrice: 4,
    category: "大语言模型",
    tags: ["MoE", "编程", "中文优化"],
    isFeatured: true,
    isNew: true,
    maxOutput: 16384,
    supported: ["文本", "函数调用"]
  },
  {
    id: "deepseek-r1",
    name: "DeepSeek R1",
    provider: "DeepSeek",
    description: "深度求索推理模型，在数学、编程和逻辑推理方面有卓越表现，展示完整思考过程。",
    contextLength: 65536,
    promptPrice: 2,
    completionPrice: 8,
    category: "推理模型",
    tags: ["推理", "数学", "编程", "思考链"],
    isFeatured: true,
    maxOutput: 8192,
    supported: ["文本", "思考链"]
  },
  {
    id: "deepseek-v3",
    name: "DeepSeek V3",
    provider: "DeepSeek",
    description: "深度求索V3通用大模型，671B参数MoE架构，中英双语能力优异。",
    contextLength: 65536,
    promptPrice: 0.5,
    completionPrice: 2,
    category: "大语言模型",
    tags: ["MoE", "中文优化", "编程"],
    maxOutput: 8192,
    supported: ["文本", "函数调用"]
  },
  // ========== 其他第三方模型 ==========
  {
    id: "glm-4.7",
    name: "GLM 4.7",
    provider: "智谱AI",
    description: "智谱最新大模型GLM-4.7，综合能力提升显著，中文理解力强。",
    contextLength: 131072,
    promptPrice: 1,
    completionPrice: 4,
    category: "大语言模型",
    tags: ["中文优化", "推理", "通用"],
    isNew: true,
    maxOutput: 8192,
    supported: ["文本", "函数调用"]
  },
  {
    id: "glm-5",
    name: "GLM 5",
    provider: "智谱AI",
    description: "智谱AI GLM-5 旗舰大模型，综合能力全面提升，在推理、编程和长文本方面表现出色。",
    contextLength: 131072,
    promptPrice: 2,
    completionPrice: 8,
    category: "大语言模型",
    tags: ["旗舰", "推理", "编程", "中文优化"],
    isFeatured: true,
    isNew: true,
    maxOutput: 16384,
    supported: ["文本", "函数调用", "思考模式"]
  },
  {
    id: "glm-5.1",
    name: "GLM 5.1",
    provider: "智谱AI",
    description: "智谱AI GLM-5.1 增强版旗舰模型，在 GLM-5 基础上进一步优化，复杂推理和代码生成能力更强。",
    contextLength: 131072,
    promptPrice: 2.5,
    completionPrice: 10,
    category: "大语言模型",
    tags: ["旗舰", "推理", "编程", "增强"],
    isFeatured: true,
    isNew: true,
    maxOutput: 16384,
    supported: ["文本", "函数调用", "思考模式"]
  },
  {
    id: "kimi-k2.5",
    name: "Kimi K2.5",
    provider: "月之暗面",
    description: "月之暗面Kimi K2.5模型，擅长长文本理解和多轮对话，中文能力出色。",
    contextLength: 131072,
    promptPrice: 1,
    completionPrice: 4,
    category: "大语言模型",
    tags: ["长文本", "多轮对话", "中文优化"],
    maxOutput: 8192,
    supported: ["文本"]
  },
  {
    id: "kimi-k2.6",
    name: "Kimi K2.6",
    provider: "月之暗面",
    description: "月之暗面 Kimi K2.6 最新旗舰模型，长文本理解和创意写作能力大幅提升，支持更长上下文窗口。",
    contextLength: 262144,
    promptPrice: 2,
    completionPrice: 8,
    category: "大语言模型",
    tags: ["旗舰", "长文本", "创意写作", "中文优化"],
    isFeatured: true,
    isNew: true,
    maxOutput: 16384,
    supported: ["文本", "函数调用"]
  },
  {
    id: "MiniMax-M2.1",
    name: "MiniMax M2.1",
    provider: "MiniMax",
    description: "MiniMax M2.1模型，在创意写作和多轮对话方面表现突出。",
    contextLength: 131072,
    promptPrice: 1,
    completionPrice: 4,
    category: "大语言模型",
    tags: ["创意写作", "对话", "通用"],
    maxOutput: 8192,
    supported: ["文本"]
  },
  {
    id: "MiniMax-M2.5",
    name: "MiniMax M2.5",
    provider: "MiniMax",
    description: "MiniMax M2.5 增强版，推理和编程能力提升，多轮对话更加稳定。",
    contextLength: 131072,
    promptPrice: 1.5,
    completionPrice: 6,
    category: "大语言模型",
    tags: ["推理", "编程", "对话"],
    isNew: true,
    maxOutput: 16384,
    supported: ["文本", "函数调用"]
  },
  // ========== Qwen3 小模型 ==========
  {
    id: "qwen3-8b",
    name: "Qwen3 8B",
    provider: "通义千问",
    description: "Qwen3 开源 80 亿参数轻量模型，适合边缘部署和低成本推理场景。",
    contextLength: 131072,
    promptPrice: 0,
    completionPrice: 0,
    category: "大语言模型",
    tags: ["开源", "轻量", "免费"],
    isNew: true,
    maxOutput: 8192,
    supported: ["文本", "函数调用"]
  },
];
