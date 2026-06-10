const http = require('http');
const fs = require('fs');

const KEY = fs.readFileSync('/tmp/nf_user_key.txt', 'utf8').trim();

const MODELS = [
  'qwen3.6-35b-a3b',
  'qwen-flash', 
  'tongyi-intent-detect-v3',
  'qwen3-asr-flash',
  'qwen3-tts-flash-realtime',
  'deepseek-v4-flash'
];

function callAPI(model) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      model,
      messages: [{ role: 'user', content: '1+1=?' }],
      max_tokens: 30
    });
    const req = http.request({
      hostname: '127.0.0.1',
      port: 3001,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + KEY,
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 60000
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
  console.log('Using key: ' + KEY.substring(0, 16) + '... (len=' + KEY.length + ')');
  
  let passed = 0, failed = 0;
  
  for (const model of MODELS) {
    process.stdout.write('\n=== ' + model + ' ===\n');
    try {
      const res = await callAPI(model);
      process.stdout.write('HTTP: ' + res.status + '\n');
      try {
        const d = JSON.parse(res.body);
        if (d.error) {
          process.stdout.write('FAIL: ' + (d.error.code || d.error.type) + ' - ' + (d.error.message || '').slice(0, 200) + '\n');
          failed++;
        } else if (d.choices) {
          const msg = d.choices[0]?.message || {};
          const content = (msg.content || '').slice(0, 100);
          const usage = d.usage || {};
          const thinking = msg.reasoning_content ? ' [thinking: ' + msg.reasoning_content.length + ' chars]' : '';
          process.stdout.write('PASS: "' + content + '"' + thinking + '\n');
          process.stdout.write('Tokens: in=' + (usage.prompt_tokens || 0) + ', out=' + (usage.completion_tokens || 0) + '\n');
          passed++;
        } else {
          process.stdout.write('UNEXPECTED: ' + res.body.slice(0, 200) + '\n');
          failed++;
        }
      } catch(e) {
        process.stdout.write('PARSE_ERROR: ' + res.body.slice(0, 200) + '\n');
        failed++;
      }
    } catch(e) {
      process.stdout.write('CALL_ERROR: ' + e.message + '\n');
      failed++;
    }
  }
  
  console.log('\n========================================');
  console.log('PASSED: ' + passed + ' / ' + MODELS.length);
  console.log('FAILED: ' + failed + ' / ' + MODELS.length);
  console.log('========================================');
})();
