const { Client } = require('pg');
const c = new Client({ host: process.env.PG_HOST, port: Number(process.env.PG_PORT), user: process.env.PG_USER, password: process.env.PG_PASSWORD, database: process.env.PG_DATABASE });
(async()=>{
  await c.connect();
  const r = await c.query(`SELECT count(*)::int AS n FROM api_keys WHERE name='__temp_e2e_verify__'`);
  console.log('leftover temp rows:', r.rows[0].n);
  const total = await c.query(`SELECT count(*)::int AS n FROM api_keys WHERE user_id=$1`, ['5867aa55-c5e3-427f-8f65-57384be5e9df']);
  console.log('247284 user total keys now:', total.rows[0].n, '(should be 5, same as before)');
})().catch(e=>{console.error(e.message);process.exit(1)}).finally(()=>c.end());
