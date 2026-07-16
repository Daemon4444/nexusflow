const { Client } = require('pg');
const c = new Client({ host: process.env.PG_HOST, port: Number(process.env.PG_PORT), user: process.env.PG_USER, password: process.env.PG_PASSWORD, database: process.env.PG_DATABASE });
(async () => {
  await c.connect();
  const r = await c.query(`SELECT key FROM api_keys WHERE id=$1`, ['a35752e2-206e-483b-9d3c-abe830712e9f']);
  if (!r.rows.length) { console.error('no key'); process.exit(1); }
  const apiKey = r.rows[0].key;
  await c.end();

  const messages = Array.from({length: 201}, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'x' }));
  const body = { model: '__nonexistent_model_xyz__', messages, max_tokens: 1 };
  const res = await fetch('http://localhost:3001/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  const txt = await res.text();
  console.log('HTTP', res.status);
  console.log('body:', txt.slice(0,500));
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});
