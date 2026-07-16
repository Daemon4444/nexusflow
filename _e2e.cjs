const crypto = require('crypto');
const { Client } = require('pg');
const c = new Client({ host: process.env.PG_HOST, port: Number(process.env.PG_PORT), user: process.env.PG_USER, password: process.env.PG_PASSWORD, database: process.env.PG_DATABASE });
const UID = '5867aa55-c5e3-427f-8f65-57384be5e9df';
const token = 'sk-air-e2etest-' + crypto.randomBytes(12).toString('hex');
const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
const masked = token.slice(0,12) + '••••••••' + token.slice(-8);
const tempId = crypto.randomUUID();
const t0 = Date.now();

(async () => {
  await c.connect();
  await c.query(
    `INSERT INTO api_keys (id, user_id, name, key, key_hash, created_at, last_used, usage_count, rate_limit) VALUES ($1,$2,$3,$4,$5,$6,NULL,0,30000)`,
    [tempId, UID, '__temp_e2e_verify2__', masked, tokenHash, new Date().toISOString()]
  );
  console.log('temp key inserted');

  const messages = Array.from({length: 201}, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'x' }));
  // first message must be user (OpenAI convention); fix roles so it's a valid chat
  messages[0] = { role: 'user', content: 'hi' };
  messages[1] = { role: 'assistant', content: 'ok' };
  for (let i = 2; i < messages.length; i++) messages[i] = { role: (i % 2 ? 'assistant' : 'user'), content: 'x' };
  // ensure last is user
  if (messages[messages.length-1].role !== 'user') messages.push({ role: 'user', content: 'reply with just: 1' });

  const body = { model: 'qwen-turbo', messages, max_tokens: 1, stream: false };

  const res = await fetch('http://localhost:3001/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const txt = await res.text();
  const latency = Date.now() - t0;
  console.log('--- response ---');
  console.log('HTTP', res.status, 'latency', latency, 'ms');
  console.log('body:', txt.slice(0,800));

  await c.query(`DELETE FROM api_keys WHERE id=$1`, [tempId]);
  console.log('temp key deleted');

  if (res.status === 200) {
    try {
      const j = JSON.parse(txt);
      const usage = j.usage || {};
      console.log('\nVERDICT: PASS — 201 messages reached upstream (qwen-turbo) and got 200');
      console.log('tokens:', JSON.stringify(usage));
    } catch {
      console.log('\nVERDICT: PASS (HTTP 200) but body not JSON');
    }
  } else if (res.status === 400 && txt.includes('Too many messages')) {
    console.log('\nVERDICT: FAIL — still blocked by 200-message limit');
  } else {
    console.log('\nVERDICT: see response above (non-200 non-400-too-many)');
  }
})().catch(e=>{console.error('ERR',e.message);process.exit(1);}).finally(()=>c.end());
