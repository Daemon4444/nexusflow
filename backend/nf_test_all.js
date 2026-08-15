require('dotenv').config();
const http = require('http');

const MODELS = [
  'qwen3.6-35b-a3b',
  'qwen-flash', 
  'tongyi-intent-detect-v3',
  'qwen3-asr-flash',
  'qwen3-tts-flash',
  'deepseek-v4-flash'
];

function callAPI(key, model) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      model,
      messages: [{ role: 'user', content: '1+1=?' }],
      max_tokens: 30
    });
    const authHeader = `Bearer ${key}`;
    const req = http.request({
      hostname: '127.0.0.1',
      port: 3001,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 30000
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', e => resolve({ status: 0, body: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: 'TIMEOUT' }); });
    req.write(body);
    req.end();
  });
}

(async () => {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });
  
  const result = await pool.query("SELECT key, LENGTH(key) as klen FROM api_keys WHERE name = '测试环境密钥' LIMIT 1");
  if (result.rows.length === 0) {
    console.log('No API key found in DB');
    await pool.end();
    return;
  }
  const rawKey = result.rows[0].key;
  const klen = result.rows[0].klen;
  console.log(`DB key length: ${klen}, JS length: ${rawKey.length}`);
  console.log(`Char codes: ${Array.from(rawKey).map(c => c.charCodeAt(0)).join(',')}`);
  
  // Clean the key - keep only printable ASCII
  const key = rawKey.replace(/[^\x20-\x7E]/g, '');
  console.log(`Cleaned key length: ${key.length}`);
  
  for (const model of MODELS) {
    process.stdout.write(`\n=== ${model} ===\n`);
    try {
      const res = await callAPI(key, model);
      process.stdout.write(`HTTP: ${res.status}\n`);
      try {
        const d = JSON.parse(res.body);
        if (d.error) {
          process.stdout.write(`ERROR: ${d.error.code || d.error.type} - ${(d.error.message || '').slice(0, 200)}\n`);
        } else if (d.choices) {
          const msg = d.choices[0]?.message || {};
          const content = (msg.content || '').slice(0, 100);
          const usage = d.usage || {};
          const thinking = msg.reasoning_content ? ` [thinking: ${msg.reasoning_content.length} chars]` : '';
          process.stdout.write(`OK: "${content}"${thinking}\n`);
          process.stdout.write(`Tokens: in=${usage.prompt_tokens || 0}, out=${usage.completion_tokens || 0}\n`);
        } else {
          process.stdout.write(`UNEXPECTED: ${res.body.slice(0, 200)}\n`);
        }
      } catch(e) {
        process.stdout.write(`PARSE_ERROR: ${res.body.slice(0, 200)}\n`);
      }
    } catch(e) {
      process.stdout.write(`CALL_ERROR: ${e.message}\n`);
    }
  }
  await pool.end();
})();
