// Copy-paste request examples shown in the console (API keys page).

export function getCurlExample(apiKey = "sk-air-...", modelId = "qwen-plus") {
  return `curl https://nexusflow.hk/v1/chat/completions \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${modelId}",
    "messages": [
      { "role": "user", "content": "用一句话介绍 NexusFlow" }
    ]
  }'`;
}

export function getJavascriptExample(apiKey = "sk-air-...", modelId = "qwen-plus") {
  return `const response = await fetch("https://nexusflow.hk/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: "Bearer ${apiKey}",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "${modelId}",
    messages: [{ role: "user", content: "用一句话介绍 NexusFlow" }],
  }),
});`;
}
