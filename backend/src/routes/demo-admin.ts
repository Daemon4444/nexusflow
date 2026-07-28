import { Router } from "express";
import { requireDemoAdmin } from "../middleware/demo-admin";

const router = Router();

export interface DemoAdminOverview {
  isDemoData: true;
  label: string;
  generatedAt: string;
  metrics: Array<{
    label: string;
    value: string;
    change: string;
    tone: "teal" | "blue" | "purple" | "amber";
  }>;
  traffic: Array<{ time: string; requests: number; tokens: number }>;
  models: Array<{
    model: string;
    requests: number;
    tokens: string;
    successRate: string;
    avgLatency: string;
  }>;
  users: Array<{
    account: string;
    plan: string;
    requests: number;
    status: "正常" | "观察";
  }>;
  events: Array<{
    time: string;
    type: string;
    message: string;
    status: "正常" | "提示";
  }>;
}

export function buildDemoAdminOverview(now = new Date()): DemoAdminOverview {
  const generatedAt = now.toISOString();

  return {
    isDemoData: true,
    label: "演示数据 · 不连接生产账本",
    generatedAt,
    metrics: [
      { label: "今日请求", value: "12,480", change: "+18.4%", tone: "teal" },
      { label: "今日 Tokens", value: "84.6M", change: "+12.7%", tone: "blue" },
      { label: "模拟费用", value: "¥1,284.32", change: "+9.3%", tone: "purple" },
      { label: "成功率", value: "99.92%", change: "+0.08%", tone: "amber" },
    ],
    traffic: [
      { time: "00:00", requests: 420, tokens: 2_800_000 },
      { time: "04:00", requests: 310, tokens: 2_100_000 },
      { time: "08:00", requests: 1_260, tokens: 8_900_000 },
      { time: "12:00", requests: 2_180, tokens: 15_600_000 },
      { time: "16:00", requests: 3_120, tokens: 21_400_000 },
      { time: "20:00", requests: 2_760, tokens: 18_900_000 },
    ],
    models: [
      { model: "qwen3.7-max", requests: 5_842, tokens: "42.8M", successRate: "99.95%", avgLatency: "812 ms" },
      { model: "glm-5.2", requests: 3_104, tokens: "23.6M", successRate: "99.91%", avgLatency: "946 ms" },
      { model: "deepseek-v3.2", requests: 2_218, tokens: "12.4M", successRate: "99.87%", avgLatency: "1,124 ms" },
      { model: "qwen-plus", requests: 1_316, tokens: "5.8M", successRate: "99.96%", avgLatency: "684 ms" },
    ],
    users: [
      { account: "demo-alpha@example.invalid", plan: "Enterprise", requests: 4_820, status: "正常" },
      { account: "demo-labs@example.invalid", plan: "Pro", requests: 3_610, status: "正常" },
      { account: "demo-studio@example.invalid", plan: "Pro", requests: 2_940, status: "正常" },
      { account: "demo-sandbox@example.invalid", plan: "Trial", requests: 1_110, status: "观察" },
    ],
    events: [
      { time: "21:20", type: "容量", message: "示例华北节点自动扩容完成", status: "正常" },
      { time: "20:48", type: "路由", message: "演示流量已切换至低延迟线路", status: "正常" },
      { time: "19:32", type: "预算", message: "示例项目达到日预算的 72%", status: "提示" },
      { time: "18:05", type: "模型", message: "qwen3.7-max 演示健康检查通过", status: "正常" },
    ],
  };
}

router.use(requireDemoAdmin);

router.get("/overview", (_req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-NexusFlow-Demo-Data", "true");
  res.json({
    success: true,
    data: buildDemoAdminOverview(),
  });
});

export default router;
