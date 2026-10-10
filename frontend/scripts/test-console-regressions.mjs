// Offline regressions: execute source functions/components with deterministic API responses.
// No browser, database, provider calls, or customer data. Browser layout is verified separately.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function harness(relativePath, { exports = [], fetchAPI = async () => ({ success: false }), user = null, params = { id: ['test'] }, storage = new Map() } = {}) {
  let cursor = 0;
  const slots = [];
  let pending = [];
  const react = {
    ...React,
    createContext: () => ({ Provider: 'AuthProvider' }),
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef(value) { return this.useState({ current: value })[0]; },
    useMemo: callback => callback(),
    useCallback: callback => callback,
    useEffect(callback, deps) {
      const index = cursor++;
      const old = slots[index];
      if (!old || !deps || deps.some((value, i) => value !== old.deps[i])) {
        pending.push(() => { old?.cleanup?.(); slots[index] = { deps, cleanup: callback() }; });
      }
    },
  };
  // Imported hooks are called unbound.
  react.useRef = value => react.useState({ current: value })[0];
  const mocks = {
    react,
    'react/jsx-runtime': jsxRuntime,
    'next/navigation': { useParams: () => params },
    '@/lib/api': { fetchAPI },
    '@/lib/auth': { useAuth: () => ({ user }), authHeaders: () => ({}) },
    '@/lib/i18n': { useI18n: () => ({ t: key => key }) },
  };
  function load(relative, extra = []) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8') + (extra.length ? `\nexport { ${extra.join(',')} };` : '');
    const code = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const compiledModule = { exports: {} };
    const localRequire = id => mocks[id] || (id === '@/lib/models' ? load('lib/models.ts') : id === '@/lib/money' ? load('lib/money.ts') : id === '@/lib/firstRun' ? load('lib/firstRun.ts') : id === '@/lib/codeExamples' ? load('lib/codeExamples.ts') : id === '@/components/ConsoleUI' ? load('components/ConsoleUI.tsx') : new Proxy({}, { get: (_, name) => `${id}/${String(name)}` }));
    vm.runInNewContext(code, { module: compiledModule, exports: compiledModule.exports, require: localRequire, AbortController, URLSearchParams, Date, console, window: {}, navigator: {}, localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }, setTimeout }, { filename: relative });
    return compiledModule.exports;
  }
  const mod = load(relativePath, exports);
  return {
    mod, params, storage,
    render(name = 'default', props = {}) { cursor = 0; return mod[name](props); },
    async effects() { const callbacks = pending; pending = []; callbacks.forEach(callback => callback()); await new Promise(setImmediate); },
  };
}
function nodes(tree) { if (!tree || typeof tree !== 'object') return []; if (Array.isArray(tree)) return tree.flatMap(nodes); return [tree, ...nodes(tree.props?.children)]; }
function find(tree, predicate) { const node = nodes(tree).find(predicate); assert.ok(node, 'expected matching element'); return node; }
function text(tree) { return JSON.stringify(tree, (_, value) => typeof value === 'symbol' ? undefined : value); }
const model = (id, more = {}) => ({ id, name: id, provider: 'Synthetic', category: '大语言模型', supported: [], promptPrice: 1, completionPrice: 2, contextLength: 8192, maxOutput: 1024, availability: 'available', supportedProtocols: ['openai/chat-completions'], ...more });

test('default example requires available Chat protocol and respects null versus empty model permissions', () => {
  const { getDefaultChatModel } = harness('lib/models.ts').mod;
  const rows = [model('claude-sonnet-5', { supportedProtocols: ['anthropic/messages'] }), model('qwen3.8-max', { availability: 'temporarily_unavailable' }), model('unknown', { availability: undefined }), model('chat'), model('other')];
  assert.equal(getDefaultChatModel(rows, null).id, 'chat');
  assert.equal(getDefaultChatModel(rows, []), undefined);
});

test('restricted subaccount example uses only its allowed model', () => {
  const { getDefaultChatModel } = harness('lib/models.ts').mod;
  assert.equal(getDefaultChatModel([model('chat'), model('other')], ['other']).id, 'other');
  assert.equal(getDefaultChatModel([model('chat')], ['missing']), undefined);
});

test('all generated text protocol examples contain valid JSON, including tool arrays', () => {
  const { getProtocolExamples } = harness('app/(dashboard)/models/[...id]/page.tsx', { exports: ['getProtocolExamples'] }).mod;
  for (const supported of [[], ['工具调用']]) {
    const examples = getProtocolExamples(model('Synthetic/Model', { supported, supportedProtocols: ['openai/chat-completions', 'anthropic/messages', 'openai/responses'] }));
    assert.equal(examples.length, 3);
    for (const example of examples) {
      const body = example.code.match(/-d '([\s\S]*)'/)[1];
      const parsed = JSON.parse(body);
      assert.equal(parsed.model, 'Synthetic/Model');
      if (example.id === 'openai/chat-completions' && supported.length) assert.equal(parsed.tools.length, 1);
    }
  }
});

test('model distribution keeps the complete long-tail totals', () => {
  const { topModels } = harness('app/(dashboard)/activity/page.tsx', { exports: ['topModels'] }).mod;
  const rows = Array.from({ length: 12 }, (_, i) => ({ model: `synthetic-${i}`, requests: 13 - i, tokens: 100, cost: 0.01, percentage: 5 }));
  const result = topModels(rows);
  assert.equal(result.length, 6);
  assert.equal(result.reduce((sum, row) => sum + row.requests, 0), rows.reduce((sum, row) => sum + row.requests, 0));
  assert.equal(result.at(-1).tokens, 700);
  const equalRows = Array.from({ length: 94 }, (_, i) => ({ model: `equal-${i}`, requests: 1, tokens: 1, cost: 0, percentage: 1.1 }));
  const equalGroups = topModels(equalRows);
  assert.equal(equalGroups.at(-1).requests, 89);
  assert.equal(equalGroups.at(-1).percentage, 94.7, '89/94 rounded once, not 89 times the rounded 1.1%');
  assert.equal(equalGroups[0].percentage, 1.1);
});

test('zero-use account shows no success percentage or outage advice', async () => {
  const h = harness('app/(dashboard)/activity/page.tsx', { fetchAPI: async path => ({ success: true, data: path.endsWith('/overview') ? { totalRequests: 0, totalTokens: 0, totalCost: 0, activeModels: 0, avgLatency: 0, successRate: 0, totalCachedTokens: 0, totalPromptTokens: 0 } : [] }) });
  h.render(); await h.effects();
  const kpis = find(h.render(), node => node.props?.items).props.items;
  assert.equal(kpis.find(item => item.label === 'successRate').value, '—');
  assert.equal(kpis.find(item => item.label === 'successRate').hint, '尚无请求');
});

test('one rejected Activity request keeps independent data and marks missing statistics', async () => {
  const h = harness('app/(dashboard)/activity/page.tsx', { fetchAPI: async path => { if (path.endsWith('/overview')) throw new Error('synthetic network failure'); return { success: true, data: [] }; } });
  h.render(); await h.effects();
  const tree = h.render();
  assert.match(text(tree), /用量统计暂不可用/);
  assert.equal(nodes(tree).some(node => node.props?.items), false, 'do not display fake zero statistics');
});

test('log search network failure restores submit and shows a recoverable error', async () => {
  const h = harness('app/(dashboard)/activity/page.tsx', { exports: ['LogAnalysis'], fetchAPI: async () => { throw new Error('synthetic network failure'); } });
  await find(h.render('LogAnalysis'), node => node.type === 'form').props.onSubmit();
  const tree = h.render('LogAnalysis');
  assert.equal(find(tree, node => node.props?.type === 'submit').props.disabled, false);
  assert.match(text(tree), /无法连接日志服务/);
});

test('failed log search clears previous results instead of presenting stale records', async () => {
  let fail = false;
  const h = harness('app/(dashboard)/activity/page.tsx', { exports: ['LogAnalysis'], fetchAPI: async () => fail ? { success: false, status: 503, message: 'synthetic unavailable' } : { success: true, data: [{ log_id: 'synthetic-old', model: 'synthetic', status: 'success', time: '2026-10-09T00:00:00Z', total_tokens: 1, cost: 0 }] } });
  await find(h.render('LogAnalysis'), node => node.type === 'form').props.onSubmit();
  assert.match(text(h.render('LogAnalysis')), /synthetic-old/);
  fail = true;
  await find(h.render('LogAnalysis'), node => node.type === 'form').props.onSubmit();
  const tree = h.render('LogAnalysis');
  assert.doesNotMatch(text(tree), /synthetic-old/);
  assert.match(text(tree), /synthetic unavailable/);
});

test('temporary session failure retains token; explicit 401 removes it', async () => {
  let status = 503;
  const storage = new Map([['air_session_token', 'synthetic-token']]);
  const h = harness('lib/auth.tsx', { storage, fetchAPI: async () => ({ success: false, status }) });
  await h.render('AuthProvider').props.value.refreshUser();
  assert.equal(storage.has('air_session_token'), true);
  assert.ok(h.render('AuthProvider').props.value.authError);
  status = 401;
  await h.render('AuthProvider').props.value.refreshUser();
  assert.equal(storage.has('air_session_token'), false);
  assert.equal(h.render('AuthProvider').props.value.user, null);
});

test('invalid model navigation clears the previous model and stale requests cannot restore it', async () => {
  let resolveOld;
  const h = harness('app/(dashboard)/models/[...id]/page.tsx', { params: { id: ['old'] }, fetchAPI: path => path.endsWith('/old') ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve({ success: false, status: 404, message: 'synthetic missing' }) });
  h.render(); await h.effects();
  h.params.id = ['missing'];
  h.render(); await h.effects();
  resolveOld({ success: true, data: model('old') });
  await new Promise(setImmediate);
  assert.match(text(h.render()), /synthetic missing/);
  assert.doesNotMatch(text(h.render()), /"children":"old"/);
});

test('Dashboard keeps available sections when billing rejects and shows unavailable balance', async () => {
  const h = harness('app/(dashboard)/dashboard/page.tsx', { user: { balance: 7, creditBalance: 0, allowedModels: null }, fetchAPI: async path => {
    if (path === '/api/billing/summary') throw new Error('synthetic network failure');
    if (path === '/api/usage/overview') return { success: true, data: { totalRequests: 3, totalTokens: 4, totalCost: 0.01, activeModels: 1, avgLatency: 1, successRate: 100 } };
    return { success: true, data: [] };
  } });
  h.render(); await h.effects();
  const tree = h.render();
  assert.match(text(tree), /1 项数据暂未加载/);
  const kpis = nodes(tree).filter(node => node.props?.className === 'quiet-kpi');
  assert.equal(kpis.length, 4);
  assert.equal(find(kpis[0], node => node.type === 'strong').props.children, '—');
  assert.match(text(kpis[1]), /累计 3 次/);
});

test('log permission failure is shown without a misleading retry action', async () => {
  const h = harness('app/(dashboard)/activity/page.tsx', { exports: ['LogAnalysis'], fetchAPI: async path => path.includes('/search?') ? { success: true, data: [{ log_id: 'synthetic', model: 'synthetic', status: 'success', time: '2026-10-09T00:00:00Z', total_tokens: 1, cost: 0 }] } : { success: false, status: 403, message: 'synthetic forbidden' } });
  await find(h.render('LogAnalysis'), node => node.type === 'form').props.onSubmit();
  await find(h.render('LogAnalysis'), node => node.props?.role === 'button').props.onClick();
  const tree = h.render('LogAnalysis');
  assert.match(text(tree), /synthetic forbidden/);
  assert.equal(nodes(tree).some(node => node.type === 'button' && node.props.children === '重试'), false);
});

test('pricing estimate rejects output and combined context limits and uses the matching input tier', () => {
  const h = harness('app/(dashboard)/pricing/PricingClient.tsx', { exports: ['tierFor'] });
  const sample = model('synthetic', { tokenPricingTiers: [{ label: 'first', maxTokens: 1024, promptPrice: 1, completionPrice: 2 }, { label: 'second', maxTokens: 8192, promptPrice: 3, completionPrice: 4 }] });
  assert.equal(h.mod.tierFor(sample, 1024).prompt, 1);
  assert.equal(h.mod.tierFor(sample, 1025).prompt, 3);
  let tree = h.render('default', { initialModels: [sample] });
  find(tree, node => node.props?.label === '每次输出 tokens').props.onChange(2000);
  tree = h.render('default', { initialModels: [sample] });
  assert.match(text(tree), /最大输出上限/);
  find(tree, node => node.props?.label === '每次输出 tokens').props.onChange(800);
  find(tree, node => node.props?.label === '每次输入 tokens').props.onChange(8000);
  assert.match(text(h.render('default', { initialModels: [sample] })), /上下文上限/);
});

test('Keys examples share catalog/protocol/account checks for both existing and newly created keys', async () => {
  for (const scenario of [
    { allowedModels: ['other'], catalogFails: false, expected: 'other' },
    { allowedModels: [], catalogFails: false, expected: null },
    { allowedModels: null, catalogFails: true, expected: null },
  ]) {
    const fixtureKey = { id: 'synthetic-key', name: 'synthetic', key: 'synthetic-masked', createdAt: '2026-10-09T00:00:00Z', usageCount: 0, rateLimit: null };
    const h = harness('app/(dashboard)/keys/page.tsx', { user: { balance: 0, creditBalance: 0, allowedModels: scenario.allowedModels }, fetchAPI: async (requestPath, options) => {
      if (requestPath === '/api/models') return scenario.catalogFails ? { success: false, status: 503 } : { success: true, data: [model('qwen-plus', { availability: 'temporarily_unavailable' }), model('messages', { supportedProtocols: ['anthropic/messages'] }), model('other')] };
      return { success: true, data: options?.method === 'POST' ? { ...fixtureKey, key: 'synthetic-new-plaintext' } : [fixtureKey] };
    } });
    assert.equal(nodes(h.render()).filter(node => node.type === 'pre').length, 0, 'unknown catalog must not generate a request');
    await h.effects();
    let tree = h.render();
    const verify = currentTree => {
      const samples = nodes(currentTree).filter(node => node.type === 'pre');
      assert.equal(samples.length, scenario.expected ? 2 : 0);
      for (const sample of samples) {
        assert.match(sample.props.children, new RegExp(scenario.expected));
        assert.doesNotMatch(sample.props.children, /qwen-plus/);
      }
    };
    verify(tree);
    find(tree, node => node.type === 'button' && Array.isArray(node.props.children) && node.props.children.includes('createKey')).props.onClick();
    tree = h.render();
    find(tree, node => node.type === 'input').props.onChange({ target: { value: 'synthetic new key' } });
    await find(h.render(), node => node.type === 'button' && node.props.children === 'create').props.onClick();
    verify(h.render());
  }
});

test('model catch-all params preserve slash IDs whether Next supplies encoded or split segments', async () => {
  for (const id of [['MiniMax%2FMiniMax-M3'], ['MiniMax', 'MiniMax-M3']]) {
    const requests = [];
    const h = harness('app/(dashboard)/models/[...id]/page.tsx', { params: { id }, fetchAPI: async requestPath => {
      requests.push(requestPath);
      return { success: true, data: model('MiniMax/MiniMax-M3', { tags: [], description: 'Synthetic model' }) };
    } });
    h.render(); await h.effects();
    assert.deepEqual(requests, ['/api/models/MiniMax%2FMiniMax-M3']);
    assert.match(text(h.render()), /MiniMax\/MiniMax-M3/);
  }
});
