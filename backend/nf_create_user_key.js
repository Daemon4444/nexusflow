require('dotenv').config();
const { Pool } = require('pg');
(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  // Find an existing user
  const userResult = await pool.query("SELECT id, email FROM users LIMIT 5");
  userResult.rows.forEach(r => console.log('User: ' + r.id + ' - ' + r.email));
  
  // Create a key bound to the first user
  if (userResult.rows.length > 0) {
    const userId = userResult.rows[0].id;
    const { createApiKey } = require('./dist/data/apikeys');
    const result = await createApiKey('nf-model-test-user', 60, userId);
    require('fs').writeFileSync('/tmp/nf_user_key.txt', result.key);
    console.log('Created key for user: ' + userId);
  }
  await pool.end();
  process.exit(0);
})();
