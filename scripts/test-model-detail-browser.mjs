/** Read-only browser regression against a running frontend and its real catalog.
 * Usage: node scripts/test-model-detail-browser.mjs http://127.0.0.1:3217
 * Requires agent-browser on PATH. Does not make authenticated or billable requests.
 */
import { execFileSync } from 'node:child_process';
const base = process.argv[2] || 'http://127.0.0.1:3217';
const session = `model-detail-regression-${process.pid}`;
function browser(...args) {
  return execFileSync('agent-browser', ['--session', session, ...args], { encoding: 'utf8', timeout: 60000 });
}
function check(code) { return browser('eval', code); }
const ids = ['qwen3.8-max', 'qwen3.7-plus', 'qwen3-asr-flash', 'kimi-k3.1-pro', 'MiniMax/MiniMax-M3'];
try {
  for (const id of ids) {
    browser('open', `${base}/models/${id.split('/').map(encodeURIComponent).join('/')}`);
    browser('wait', '--fn', '!!document.querySelector(".nmd-pricing")');
    check(`(async () => {
      const { data: model, success } = await (await fetch('/proxy/api/models/' + encodeURIComponent(${JSON.stringify(id)}))).json();
      const assert = (value, message) => { if (!value) throw new Error(message); };
      assert(success, 'Catalog unavailable');
      assert(document.querySelector('h1').textContent === model.name, 'Model identity mismatch');
      const pricing = document.querySelector('.nmd-pricing').textContent;
      if (!model.pricingType || model.pricingType === 'token') {
        if (model.promptPrice === null || model.completionPrice === null) assert(pricing.includes('价格待公布'), 'Missing unpublished price state');
        else {
          const values = [...document.querySelectorAll('.nmd-price-row strong')].map(e => e.textContent);
          assert(values[0] === '¥' + model.promptPrice && values[1] === '¥' + model.completionPrice, 'Input/output price mismatch');
        }
      } else assert(pricing.includes('¥' + (model.pricingTiers?.[0]?.price ?? model.promptPrice)), 'Unit price mismatch');
      for (const tier of model.tokenPricingTiers || []) assert(pricing.includes(tier.label) && pricing.includes('¥' + tier.promptPrice) && pricing.includes('¥' + tier.completionPrice), 'Missing tier');
      for (const key of ['implicitHit','explicitHit','explicitCreation']) if (model.cachePricing?.[key] !== undefined) assert(pricing.includes('¥' + model.cachePricing[key]), 'Missing cache price ' + key);
      assert(!!document.querySelector('.nmd-actions a[href="/keys"]') === (!model.availability || model.availability === 'available'), 'Availability CTA mismatch');
      assert(!document.querySelector('.nmd-details[open]'), 'Details should start collapsed');
      return 'PASS real catalog: ' + model.id;
    })()`);
    for (const width of [1440, 390, 320]) {
      browser('set', 'viewport', String(width), '900');
      check(`(() => { if (document.documentElement.scrollWidth > innerWidth) throw new Error('Horizontal overflow at ' + innerWidth); return 'PASS width ' + innerWidth; })()`);
    }
    console.log(`PASS catalog, prices, availability, collapsed details, 1440/390/320px: ${id}`);
  }
  browser('set', 'viewport', '1440', '1000');
  browser('open', `${base}/models/qwen3.8-max`);
  browser('wait', '--fn', '!!document.querySelector(".nmd-pricing")');
  for (const [label, endpoint] of [['Messages', '/v1/messages'], ['Responses', '/v1/responses'], ['Chat Completions', '/v1/chat/completions']]) {
    browser('find', 'role', 'tab', 'click', '--name', label, '--exact');
    browser('wait', '--fn', `document.querySelector('[role="tabpanel"]:not([aria-hidden="true"]) .nmd-endpoint code')?.textContent === ${JSON.stringify(endpoint)}`);
    const code = JSON.parse(check(`document.querySelector('[role="tabpanel"]:not([aria-hidden="true"]) pre code').textContent`));
    execFileSync('bash', ['-n'], { input: code });
    const payload = JSON.parse(code.match(/-d '([\s\S]*)'$/)[1]);
    if (payload.model !== 'qwen3.8-max') throw new Error('Example model mismatch');
    const response = await fetch(`https://nexusflow.hk${endpoint}`, { signal: AbortSignal.timeout(15000), method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (response.status !== 401) throw new Error(`Expected anonymous 401, got ${response.status}`);
    console.log(`PASS protocol selection, shell/JSON syntax and anonymous 401: ${label}`);
  }
  browser('find', 'role', 'button', 'click', '--name', '复制', '--exact');
  browser('wait', '--text', '已复制');
  console.log('PASS code copy feedback');
} finally { browser('close'); }
