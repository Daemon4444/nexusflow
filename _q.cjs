const { Client } = require('pg');
const c = new Client({ host: process.env.PG_HOST, port: Number(process.env.PG_PORT), user: process.env.PG_USER, password: process.env.PG_PASSWORD, database: process.env.PG_DATABASE });
(async () => {
  await c.connect();
  const cols = await c.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='provider_models' ORDER BY ordinal_position`);
  console.log('provider_models cols:', cols.rows.map(r=>`${r.column_name}(${r.data_type})`).join(', '));
  const m = await c.query(`SELECT * FROM provider_models LIMIT 5`);
  console.log('sample row:', JSON.stringify(m.rows[0]));
})().catch(e=>{console.error('ERR',e.message);process.exit(1);}).finally(()=>c.end());
