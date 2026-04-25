import { Router, Request, Response } from "express";
import { models } from "../data/models";
import { detectModelType } from "../services/adapters";

const router = Router();

const DASHSCOPE_BASE = "https://dashscope.aliyuncs.com/compatible-mode/v1";

function getApiKey(): string {
  return process.env.DASHSCOPE_API_KEY || "";
}

// 代理到阿里云百炼 DashScope
router.post("/completions", async (req: Request, res: Response) => {
  const { model: modelId, messages, stream } = req.body;

  if (!modelId || !messages || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({
      success: false,
      message: "请提供模型ID和消息列表",
    });
    return;
  }

  const model = models.find((m) => m.id === modelId);
  if (!model) {
    res.status(404).json({ success: false, message: "模型不存在" });
    return;
  }

  const modelType = detectModelType(model.category);
  if (modelType !== "chat") {
    res.status(400).json({ success: false, message: "该模型不支持对话，请使用文本对话模型" });
    return;
  }

  const DASHSCOPE_API_KEY = getApiKey();
  if (!DASHSCOPE_API_KEY) {
    res.status(500).json({ success: false, message: "未配置 API Key" });
    return;
  }

  try {
    // 流式输出
    if (stream) {
      const response = await fetch(`${DASHSCOPE_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${DASHSCOPE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: modelId,
          messages,
          stream: true,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        res.status(response.status).json({ success: false, message: errText });
        return;
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const reader = response.body as any;
      if (reader && typeof reader[Symbol.asyncIterator] === "function") {
        for await (const chunk of reader) {
          res.write(chunk);
        }
      } else if (reader && reader.getReader) {
        const r = reader.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await r.read();
          if (done) break;
          res.write(decoder.decode(value, { stream: true }));
        }
      }
      res.end();
      return;
    }

    // 非流式：直接代理
    const response = await fetch(`${DASHSCOPE_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${DASHSCOPE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelId,
        messages,
        stream: false,
      }),
    });

    const data: any = await response.json();

    if (!response.ok) {
      res.status(response.status).json({
        success: false,
        message: data.error?.message || "上游 API 调用失败",
        detail: data,
      });
      return;
    }

    // 包装为统一格式
    res.json({
      success: true,
      data: {
        id: data.id,
        model: data.model,
        choices: data.choices,
        usage: {
          prompt_tokens: data.usage?.prompt_tokens || 0,
          completion_tokens: data.usage?.completion_tokens || 0,
          total_tokens: data.usage?.total_tokens || 0,
          cost: calculateCost(model, data.usage),
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: `请求上游 API 失败: ${err.message}`,
    });
  }
});

function calculateCost(
  model: { promptPrice: number; completionPrice: number },
  usage?: { prompt_tokens?: number; completion_tokens?: number }
): string {
  if (!usage) return "0.000000";
  const promptCost = ((usage.prompt_tokens || 0) / 1_000_000) * model.promptPrice;
  const completionCost = ((usage.completion_tokens || 0) / 1_000_000) * model.completionPrice;
  return (promptCost + completionCost).toFixed(6);
}

export default router;
