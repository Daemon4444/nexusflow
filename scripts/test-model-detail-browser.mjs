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
function fill(selector, value) {
  // CDP's select-all shortcut is platform-dependent; select the DOM text, then type real keys.
  check(`document.querySelector(${JSON.stringify(selector)}).select()`);
  browser('press', 'Backspace');
  if (value) browser('type', selector, value);
}
const catalog = await (await fetch(`${base}/proxy/api/models`, { signal: AbortSignal.timeout(30000) })).json();
if (!catalog.success || !Array.isArray(catalog.data) || !catalog.data.length) throw new Error('Full catalog unavailable');
const ids = catalog.data.map(model => model.id);
if (new Set(ids).size !== ids.length) throw new Error('Duplicate model IDs in catalog');
console.log(`Full catalog coverage: ${ids.length} models`);
function verifyEstimate() {
  return check(`(async () => {
    const id = document.querySelector('.nmd-model-id code').textContent;
    const {data:m} = await (await fetch('/proxy/api/models/' + encodeURIComponent(id))).json();
    const fields = [...document.querySelectorAll('.nmd-estimator input[role="spinbutton"]')];
    const unit = m.pricingType && m.pricingType !== 'token';
    let expected;
    if (unit) expected = Number(fields[0].value.replaceAll(',', '')) * (m.pricingTiers?.[0]?.price ?? m.promptPrice) / (m.pricingType === 'per-10k-characters' ? 10000 : 1);
    else if (m.promptPrice == null || m.completionPrice == null) {
      if (!document.querySelector('.nmd-estimate-result [role="alert"]')) throw new Error('Missing unpublished estimate state');
      return 'PASS unpublished estimate';
    } else {
      const input = Number(fields[0].value.replaceAll(',', '')), output = m.capabilities?.model_type === 'embedding' ? 0 : Number(fields[1].value.replaceAll(',', ''));
      const tier = m.tokenPricingTiers?.find(t => input <= t.maxTokens) || m.tokenPricingTiers?.at(-1);
      const thinking = m.capabilities?.thinking_mode === 'always' || m.capabilities?.thinking_default === true;
      const outputPrice = thinking ? (tier ? m.thinkingPricing?.tiers?.find(t => t.label === tier.label)?.thinkingCompletionPrice ?? tier.thinkingCompletionPrice ?? tier.completionPrice : m.thinkingPricing?.thinkingCompletionPrice ?? m.completionPrice) : tier?.completionPrice ?? m.completionPrice;
      expected = (input * (tier?.promptPrice ?? m.promptPrice) + output * outputPrice) / 1000000;
    }
    const actual = Number(document.querySelector('[data-testid="estimated-cost"]')?.textContent.replace('¥',''));
    if (!Number.isFinite(actual) || Math.abs(actual - Number(expected.toFixed(6))) > 0.0000001) throw new Error('Estimate mismatch: '+id+' '+actual+' / '+expected);
    return 'PASS cost estimate: '+id;
  })()`);
}
try {
  for (const id of ids) {
    browser('open', `${base}/models/${id.split('/').map(encodeURIComponent).join('/')}`);
    browser('wait', '--fn', '!!document.querySelector(".nmd-pricing")');
    check(`(async () => {
      const { data: model, success } = await (await fetch('/proxy/api/models/' + encodeURIComponent(${JSON.stringify(id)}))).json();
      const assert = (value, message) => { if (!value) throw new Error(message); };
      const fmt = v => '¥' + v.toFixed(Math.max(2, (String(v).split('.')[1] || '').length));
      assert(success, 'Catalog unavailable');
      assert(document.querySelector('h1').firstChild.textContent === model.name, 'Model identity mismatch');
      const pricing = document.querySelector('.nmd-pricing').textContent;
      if (!model.pricingType || model.pricingType === 'token') {
        if (model.promptPrice === null || model.completionPrice === null) assert(pricing.includes('价格待公布'), 'Missing unpublished price state');
        else {
          const values = [...document.querySelectorAll('.nmd-price-row strong')].map(e => e.textContent);
          assert(values[0] === fmt(model.promptPrice) && values[1] === fmt(model.completionPrice), 'Input/output price mismatch');
        }
      } else assert(pricing.includes(fmt(model.pricingTiers?.[0]?.price ?? model.promptPrice)), 'Unit price mismatch');
      for (const tier of model.tokenPricingTiers || []) assert(pricing.includes(tier.label) && pricing.includes(fmt(tier.promptPrice)) && pricing.includes(fmt(tier.completionPrice)), 'Missing tier');
      for (const key of ['implicitHit','explicitHit','explicitCreation']) if (model.cachePricing?.[key] !== undefined) assert(pricing.includes(fmt(model.cachePricing[key])), 'Missing cache price ' + key);
      assert(!!document.querySelector('.nmd-actions a[href="/keys"]') === (!model.availability || model.availability === 'available'), 'Availability CTA mismatch');
      assert(document.querySelectorAll('.nmd-guidance li').length >= 2, 'Missing model guidance');
      assert(document.querySelector('.nmd-estimator'), 'Missing cost estimator');
      assert(!document.querySelector('.nmd-details[open]'), 'Details should start collapsed');
      return 'PASS real catalog: ' + model.id;
    })()`);
    verifyEstimate();
    const isUnit = catalog.data.find(model => model.id === id).pricingType;
    fill('.nmd-estimator input[role="spinbutton"]', isUnit && isUnit !== 'token' ? '2' : '1000');
    verifyEstimate();
    for (const width of [1440, 1280, 1024, 390, 320]) {
      browser('set', 'viewport', String(width), '900');
      check(`(() => { if (document.documentElement.scrollWidth > innerWidth) throw new Error('Horizontal overflow at ' + innerWidth); return 'PASS width ' + innerWidth; })()`);
    check(`(() => {
      const rect = selector => document.querySelector(selector).getBoundingClientRect();
      const close = (a,b) => Math.abs(a-b) <= 1;
      if (!close(rect('.nmd-specs').right, rect('.nmd-content').right)) throw new Error('Summary/content right edges differ');
      for (const sel of ['.nmd-specs', '.nmd-content', '.nmd-section-nav', '.nmd-pricing', '.nmd-estimator', '.nmd-guidance', '.nmd-description'])
        if (document.querySelector(sel) && !close(rect(sel).left, rect('.nmd h1').left)) throw new Error('Left edge differs: ' + sel);
      const prices = [...document.querySelectorAll('.nmd-price-row strong, .nmd-cache-grid strong')];
      const axis = prices.length ? prices[0].getBoundingClientRect().right : 0;
      if (prices.some(e => !close(e.getBoundingClientRect().right, axis))) throw new Error('Price amounts do not share an axis');
      const cells = [...document.querySelectorAll('.nmd-specs>div')];
      if (innerWidth > 760 && cells.some(c => !close(c.getBoundingClientRect().top, cells[0].getBoundingClientRect().top) || !close(c.getBoundingClientRect().height, cells[0].getBoundingClientRect().height))) throw new Error('Spec cells misaligned');
      return 'PASS shared content and price alignment';
    })()`);
    }
    console.log(`PASS catalog, guidance, edited estimate, prices, availability, alignment, 1440/1280/1024/390/320px: ${id}`);
  }
  browser('set', 'viewport', '1440', '1000');
  browser('open', `${base}/models/qwen3.8-max`);
  browser('wait', '--fn', '!!document.querySelector(".nmd-pricing")');
  fill('[aria-label="总输入 Token"]', '10000');
  fill('[aria-label="总输出 Token（含思考）"]', '1000');
  browser('wait', '--fn', `document.querySelector('[data-testid="estimated-cost"]').textContent === '¥0.156'`);
  browser('click', '.nmd-estimator summary');
  fill('[aria-label="输入中缓存命中 Token"]', '8000');
  browser('wait', '--fn', `document.querySelector('[data-testid="estimated-cost"]').textContent === '¥0.072'`);
  fill('[aria-label="输入中缓存命中 Token"]', '10001');
  browser('wait', '--text', '缓存命中与创建 Token 合计不能超过非音频输入。');
  fill('[aria-label="输入中缓存命中 Token"]', '0');
  fill('[aria-label="总输入 Token"]', '');
  browser('wait', '--text', '请填写用量后查看估算。');
  fill('[aria-label="总输入 Token"]', '10000');
  console.log('PASS live estimator edits: ¥0.156 normal / ¥0.072 cached; over-cache and empty rejection');
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
  browser('find', 'role', 'button', 'click', '--name', '复制模型 ID', '--exact');
  browser('wait', '--fn', `!!document.querySelector('[aria-label="模型 ID 已复制"]')`);
  browser('click', '.nmd-section-nav a[href="#nmd-pricing"]');
  browser('wait', '--fn', 'location.hash === "#nmd-pricing"');
  browser('wait', '--fn', `(() => { const top = document.querySelector('#nmd-pricing').getBoundingClientRect().top; return top >= 64 && top <= 150; })()`);
  check(`(() => {
    const top = document.querySelector('#nmd-pricing').getBoundingClientRect().top;
    if (top < 64 || top > 150) throw new Error('Pricing anchor obscured by header');
    return 'PASS section navigation';
  })()`);
  console.log('PASS model ID copy and section navigation');
  browser('set', 'viewport', '390', '844');
  browser('click', '.nmd-section-nav a[href="#nmd-integration"]');
  browser('wait', '--fn', `document.querySelector('#nmd-integration').getBoundingClientRect().top < innerHeight / 2`);
  check(`(() => {
    const nav = document.querySelector('.nmd-section-nav').getBoundingClientRect();
    const section = document.querySelector('#nmd-integration').getBoundingClientRect();
    if (nav.top < 60 || nav.top > 80 || section.top < nav.bottom) throw new Error('Mobile sticky navigation overlaps content');
    return 'PASS mobile sticky navigation';
  })()`);
  console.log('PASS mobile sticky navigation');
} finally { browser('close'); }
