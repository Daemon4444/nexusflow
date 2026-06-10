require('dotenv').config();
const { Pool } = require('pg');
(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const r = await pool.query("SELECT id, email, balance FROM users WHERE id = '2ca68729-7a61-4a7a-a054-3978f72dbc1f'");
  if (r.rows.length > 0) console.log('User balance: ' + r.rows[0].balance);
  
  // Also check rate limits
  const rl = await pool.query("SELECT * FROM rate_limits WHERE user_id = '2ca68729-7a61-4a7a-a054-3978f72dbc1f' LIMIT 3");
  rl.rows.forEach(r => console.log('Rate limit: ' + JSON.stringify(r)));
  
  await pool.end();
  process.exit(0);
})();
