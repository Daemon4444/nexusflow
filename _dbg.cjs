const { Client } = require('pg');
const c = new Client({ host: process.env.PG_HOST, port: Number(process.env.PG_PORT), user: process.env.PG_USER, password: process.env.PG_PASSWORD, database: process.env.PG_DATABASE });
(async () => {
  await c.connect();
  const r = await c.query(`SELECT key FROM api_keys WHERE id=$1`, ['a35752e2-206e-483b-9d3c-abe830712e9f']);
  if (!r.rows.length) { console.error('no key'); process.exit(1); }
  const k = r.rows[0].key;
  console.log('len:', k.length, 'typeof:', typeof k);
  console.log('first 10 codes:', [...k.slice(0,10)].map(ch=>ch.charCodeAt(0)));
  console.log('codes 15-25:', [...k.slice(15,25)].map(ch=>ch.charCodeAt(0)));
  // also: Buffer view
  const b = Buffer.from(k, 'utf8');
  console.log('utf8 byte len:', b.length);
  console.log('non-ascii codes:', [...k].map((ch,i)=>{const cc=ch.charCodeAt(0);return cc>127?[i,cc,ch]:null}).filter(Boolean));
  await c.end();
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});
