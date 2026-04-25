"use client";

import { useState } from "react";

const errorCodes = [
  {
    code: 400,
    name: "Bad Request",
    causes: ["请求格式错误", "必填参数缺失", "参数类型不匹配", "参数值超出有效范围"],
    solution: "检查请求 JSON 格式是否正确，确认所有必填参数已提供且类型正确。"
  },
  {
    code: 401,
    name: "Unauthorized",
    causes: ["API Key 无效或已过期", "未提供 Authorization 请求头", "认证格式错误"],
    solution: "确认使用正确的 API Key，检查 Authorization 头格式为 'Bearer sk-air-xxx'。"
  },
  {
    code: 403,
    name: "Forbidden",
    causes: ["账户余额不足", "API Key 权限不足", "访问被禁止的资源", "账户被封禁"],
    solution: "检查账户余额，确认 API Key 具有相应权限，联系客服处理账户问题。"
  },
  {
    code: 404,
    name: "Not Found",
    causes: ["请求的模型不存在", "API 端点路径错误", "资源已被删除"],
    solution: "确认模型 ID 拼写正确，检查 API 端点路径，查看文档确认资源是否可用。"
  },
  {
    code: 413,
    name: "Payload Too Large",
    causes: ["请求体超过大小限制", "上传文件过大", "messages 数组过长"],
    solution: "减少请求体大小，压缩或分割大文件，减少对话历史长度。"
  },
  {
    code: 422,
    name: "Unprocessable Entity",
    causes: ["参数语义错误", "temperature 超出 0-2 范围", "max_tokens 超出模型限制"],
    solution: "检查参数值是否在有效范围内，参考文档确认各参数的约束条件。"
  },
  {
    code: 429,
    name: "Too Many Requests",
    causes: ["超出 RPM（每分钟请求数）限制", "超出 TPM（每分钟 Token 数）限制", "并发请求过多"],
    solution: "实现请求重试机制（指数退避），升级套餐提高配额，优化请求频率。"
  },
  {
    code: 500,
    name: "Internal Server Error",
    causes: ["服务器内部错误", "上游模型服务异常", "系统临时故障"],
    solution: "稍后重试请求，如持续出错请联系技术支持。"
  },
  {
    code: 502,
    name: "Bad Gateway",
    causes: ["网关错误", "上游服务不可达", "网络链路问题"],
    solution: "稍后重试，检查服务状态页面，如持续出错请联系技术支持。"
  },
  {
    code: 503,
    name: "Service Unavailable",
    causes: ["服务暂时不可用", "服务器过载", "维护中"],
    solution: "等待几分钟后重试，关注官方公告了解维护计划。"
  },
  {
    code: 504,
    name: "Gateway Timeout",
    causes: ["请求处理超时", "模型响应过慢", "网络延迟过高"],
    solution: "减少 max_tokens 参数，简化输入内容，或稍后重试。"
  },
];

const businessErrors = [
  {
    code: "invalid_api_key",
    message: "Invalid API key provided",
    desc: "API Key 格式不正确或不存在",
    solution: "从控制台重新获取有效的 API Key"
  },
  {
    code: "insufficient_quota",
    message: "You have exceeded your quota",
    desc: "账户余额不足或配额已用完",
    solution: "充值账户余额或等待配额重置"
  },
  {
    code: "model_not_found",
    message: "The model does not exist",
    desc: "指定的模型 ID 不存在",
    solution: "检查模型 ID 拼写，参考文档获取可用模型列表"
  },
  {
    code: "context_length_exceeded",
    message: "Context length exceeds model limit",
    desc: "输入内容超出模型的上下文长度限制",
    solution: "减少输入内容长度，或使用支持更长上下文的模型"
  },
  {
    code: "content_filter",
    message: "Content was filtered due to policy",
    desc: "内容因安全策略被过滤",
    solution: "修改输入内容，避免敏感或违规内容"
  },
  {
    code: "rate_limit_exceeded",
    message: "Rate limit exceeded",
    desc: "请求频率超出限制",
    solution: "降低请求频率，实现重试机制"
  },
  {
    code: "server_error",
    message: "Internal server error",
    desc: "服务器内部处理错误",
    solution: "稍后重试，如持续出错请联系支持"
  },
];

const codeExamples: Record<string, string> = {
  python: `from openai import OpenAI
import time

client = OpenAI(
    api_key="sk-air-your-key",
    base_url="https://nexusflow.hk/v1",
)

def call_with_retry(messages, max_retries=3):
    """带重试机制的 API 调用"""
    for attempt in range(max_retries):
        try:
            response = client.chat.completions.create(
                model="qwen3.5-plus",
                messages=messages,
            )
            return response
        except Exception as e:
            error_code = getattr(e, 'status_code', None)
            
            # 可重试的错误
            if error_code in [429, 500, 502, 503, 504]:
                wait_time = (2 ** attempt) + 1  # 指数退避
                print(f"Error {error_code}, retrying in {wait_time}s...")
                time.sleep(wait_time)
                continue
            
            # 不可重试的错误
            raise e
    
    raise Exception("Max retries exceeded")

# 使用示例
try:
    response = call_with_retry([
        {"role": "user", "content": "Hello!"}
    ])
    print(response.choices[0].message.content)
except Exception as e:
    print(f"Failed: {e}")`,
  nodejs: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-air-your-key",
  baseURL: "https://nexusflow.hk/v1",
});

async function callWithRetry(messages, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model: "qwen3.5-plus",
        messages,
      });
      return response;
    } catch (error) {
      const statusCode = error.status;
      
      // 可重试的错误
      if ([429, 500, 502, 503, 504].includes(statusCode)) {
        const waitTime = Math.pow(2, attempt) + 1;
        console.log(\`Error \${statusCode}, retrying in \${waitTime}s...\`);
        await new Promise(r => setTimeout(r, waitTime * 1000));
        continue;
      }
      
      // 不可重试的错误
      throw error;
    }
  }
  throw new Error("Max retries exceeded");
}

// 使用示例
try {
  const response = await callWithRetry([
    { role: "user", content: "Hello!" }
  ]);
  console.log(response.choices[0].message.content);
} catch (error) {
  console.error("Failed:", error.message);
}`,
};

export default function ErrorsPage() {
  const [codeLang, setCodeLang] = useState<"python" | "nodejs">("python");

  return (
    <div style={{ padding: "48px 64px", maxWidth: 960 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8, letterSpacing: "-0.5px" }}>
        错误码参考
      </h1>
      <p style={{ fontSize: 15, color: "var(--text-secondary)", marginBottom: 40, lineHeight: 1.6 }}>
        本文档列出了 nexusflow API 可能返回的所有错误码，以及推荐的处理方式。
      </p>

      {/* HTTP 状态码 */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 20 }}>
          HTTP 状态码
        </h2>
        <div style={{
          border: "1px solid var(--border)",
          borderRadius: 10,
          overflow: "hidden",
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)", width: 80 }}>状态码</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)", width: 140 }}>名称</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>可能原因</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)", width: 240 }}>解决方案</th>
              </tr>
            </thead>
            <tbody>
              {errorCodes.map((err, idx) => (
                <tr key={err.code} style={{ background: idx % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", verticalAlign: "top" }}>
                    <code style={{
                      background: err.code >= 500 ? "#fef2f2" : err.code >= 400 ? "#fffbeb" : "#f0fdf4",
                      color: err.code >= 500 ? "#dc2626" : err.code >= 400 ? "#d97706" : "#16a34a",
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontSize: 13,
                      fontWeight: 600,
                    }}>
                      {err.code}
                    </code>
                  </td>
                  <td style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", fontWeight: 500, verticalAlign: "top" }}>
                    {err.name}
                  </td>
                  <td style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", verticalAlign: "top" }}>
                    <ul style={{ margin: 0, paddingLeft: 16 }}>
                      {err.causes.map((c, i) => <li key={i} style={{ marginBottom: 4 }}>{c}</li>)}
                    </ul>
                  </td>
                  <td style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", fontSize: 13, verticalAlign: "top" }}>
                    {err.solution}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 业务错误码 */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 20 }}>
          业务错误码
        </h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 16 }}>
          当请求失败时，响应体中会包含详细的错误信息：
        </p>
        <div style={{
          background: "#1a1a1a",
          borderRadius: 8,
          padding: 16,
          marginBottom: 24,
          overflow: "auto",
        }}>
          <pre style={{ margin: 0, fontSize: 13, color: "#e5e5e5", fontFamily: "'JetBrains Mono', monospace" }}>
{`{
  "error": {
    "code": "insufficient_quota",
    "message": "You have exceeded your quota. Please check your plan and billing details.",
    "type": "invalid_request_error"
  }
}`}
          </pre>
        </div>

        <div style={{
          border: "1px solid var(--border)",
          borderRadius: 10,
          overflow: "hidden",
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)", width: 180 }}>错误码</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>说明</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)", width: 200 }}>解决方案</th>
              </tr>
            </thead>
            <tbody>
              {businessErrors.map((err, idx) => (
                <tr key={err.code} style={{ background: idx % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", verticalAlign: "top" }}>
                    <code style={{
                      background: "var(--bg-elevated)",
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontSize: 12,
                      fontFamily: "'JetBrains Mono', monospace",
                    }}>
                      {err.code}
                    </code>
                  </td>
                  <td style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", verticalAlign: "top" }}>
                    {err.desc}
                  </td>
                  <td style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", fontSize: 13, verticalAlign: "top" }}>
                    {err.solution}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 错误处理示例 */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 20 }}>
          错误处理最佳实践
        </h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 16 }}>
          建议在生产环境中实现指数退避重试机制，以优雅地处理临时性错误：
        </p>

        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {(["python", "nodejs"] as const).map((lang) => (
            <button
              key={lang}
              onClick={() => setCodeLang(lang)}
              style={{
                padding: "6px 16px",
                fontSize: 13,
                fontWeight: 500,
                border: "1px solid var(--border)",
                borderRadius: 6,
                background: codeLang === lang ? "var(--text-primary)" : "var(--bg)",
                color: codeLang === lang ? "var(--bg)" : "var(--text-secondary)",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {lang === "python" ? "Python" : "Node.js"}
            </button>
          ))}
        </div>

        <div style={{
          background: "#1a1a1a",
          borderRadius: 8,
          padding: 16,
          overflow: "auto",
        }}>
          <pre style={{ margin: 0, fontSize: 13, color: "#e5e5e5", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.5 }}>
            {codeExamples[codeLang]}
          </pre>
        </div>
      </section>

      {/* 注意事项 */}
      <section style={{
        padding: 20,
        background: "var(--warning-bg)",
        border: "1px solid var(--warning-border)",
        borderRadius: 10,
      }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--warning)", marginBottom: 12 }}>
          注意事项
        </h3>
        <ul style={{ margin: 0, paddingLeft: 20, color: "#92400e", fontSize: 14, lineHeight: 1.8 }}>
          <li><strong>可重试错误</strong>：429、500、502、503、504 通常是临时性问题，建议使用指数退避重试</li>
          <li><strong>不可重试错误</strong>：400、401、403、404、422 通常需要修改请求后才能成功</li>
          <li><strong>记录日志</strong>：建议记录请求 ID（响应头中的 X-Request-ID）以便排查问题</li>
          <li><strong>监控告警</strong>：建议对 5xx 错误设置监控告警，及时发现服务异常</li>
        </ul>
      </section>
    </div>
  );
}
