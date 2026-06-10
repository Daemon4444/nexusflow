require('dotenv').config();
const { createApiKey } = require('./dist/data/apikeys');
(async () => {
  const result = await createApiKey('nf-new-model-test', 60);
  // Write to file to avoid stdout masking
  require('fs').writeFileSync('/tmp/nf_new_key.txt', result.key);
  console.log('Key created, id: ' + result.id);
  process.exit(0);
})();
