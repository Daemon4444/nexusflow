require('dotenv').config();
const { Pool } = require('pg');
(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query("UPDATE users SET balance = balance + 100.00 WHERE id = '2ca68729-7a61-4a7a-a054-3978f72dbc1f'");
  const r = await pool.query("SELECT balance FROM users WHERE id = '2ca68729-7a61-4a7a-a054-3978f72dbc1f'");
  console.log('Balance after topup: ' + r.rows[0].balance);
  await pool.end();
  process.exit(0);
})();
