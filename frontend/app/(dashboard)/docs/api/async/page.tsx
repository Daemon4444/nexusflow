"use client";

import DocsCodeBlock from "@/components/DocsCodeBlock";
import Link from "next/link";

const submit = `curl https://nexusflow.hk/v1/tasks \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "wan2.6-t2i",
    "prompt": "生成一张科技产品海报",
    "size": "1024x1024"
  }'`;

const poll = `curl https://nexusflow.hk/v1/tasks/task_xxx \\
  -H "Authorization: Bearer $API_KEY"`;

const params = [
  { name: "model", required: "必填", desc: "图像或视频模型 ID，如 seedance-2.0（旗舰视频，火山方舟）、wan2.6-t2i、wan2.6-i2v、pixverse-v6、happyhorse-1.0-t2v。" },
  { name: "prompt", required: "必填", desc: "生成提示词。视频建议描述主体、动作、镜头、场景和光线。" },
  { name: "size", required: "可选", desc: "图像尺寸可用 1024x1024；Wan 视频精确尺寸使用 1280*720（兼容传入 1280x720）。" },
  { name: "duration", required: "视频可选", desc: "视频时长，按模型能力选择 5、8、10、15 等值。" },
  { name: "img_url", required: "图生视频可选", desc: "参考图 URL，用于 i2v/r2v 类型任务。" },
  { name: "negative_prompt", required: "可选", desc: "不希望出现的元素、风格或动作。" },
  { name: "webhook_url", required: "暂不支持", desc: "当前公开任务接口不会触发 webhook；生产系统请使用 GET /v1/tasks/{id} 轮询。" },
];

export default function AsyncApiPage() {
  return (
    <div style={{ padding: "48px 64px", maxWidth: 940 }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 8, fontWeight: 600 }}>API 参考</div>
        <h1 style={{ fontSize: 30, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 10px" }}>
          异步任务 API
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.8, maxWidth: 720, margin: 0 }}>
          图像、视频等高时延模型统一使用任务接口。提交任务后返回任务状态；视频任务需要轮询，部分图像任务会直接返回 succeeded。
        </p>
      </div>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14, marginBottom: 38 }}>
        {[
          ["提交", "POST /v1/tasks", "创建任务；视频返回 running，部分图像直接返回 succeeded。"],
          ["查询", "GET /v1/tasks/{id}", "读取任务状态、进度、输出和错误。"],
          ["列表", "GET /v1/tasks", "列出当前 API Key 用户的最近任务。"],
        ].map(([title, endpoint, desc]) => (
          <div key={title} style={{ padding: 18, border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg)" }}>
            <div style={{ fontSize: 15, color: "var(--text-primary)", fontWeight: 700, marginBottom: 8 }}>{title}</div>
            <code style={{ fontSize: 12 }}>{endpoint}</code>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7, marginTop: 8 }}>{desc}</div>
          </div>
        ))}
      </section>

      <section style={{ marginBottom: 38 }}>
        <h2 style={{ fontSize: 20, color: "var(--text-primary)", marginBottom: 14 }}>请求参数</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          {params.map((param, index) => (
            <div key={param.name} style={{ display: "grid", gridTemplateColumns: "180px 120px 1fr", padding: "12px 16px", borderTop: index === 0 ? "none" : "1px solid var(--border)", background: index % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)", fontSize: 13 }}>
              <code>{param.name}</code>
              <span style={{ color: "var(--text-tertiary)" }}>{param.required}</span>
              <span style={{ color: "var(--text-secondary)" }}>{param.desc}</span>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, color: "var(--text-primary)", marginBottom: 10 }}>提交任务</h2>
        <DocsCodeBlock code={submit} />
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, color: "var(--text-primary)", marginBottom: 10 }}>查询任务</h2>
        <DocsCodeBlock code={poll} />
      </section>

      <Link href="/docs/api/tasks" className="btn-primary">
        查看完整 Tasks 文档
      </Link>
    </div>
  );
}
