// Simulate dsh client module loader: provide __ModuleLoader__.load and a
// fake window/react, then evaluate client/client.js and assert shape.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const clientFile = path.resolve(here, '..', 'client', 'client.js');

const fakeWindow = {
  AudioContext: function () {
    return {
      state: 'running',
      currentTime: 0,
      destination: {},
      createOscillator: () => ({ frequency: { value: 0 }, connect: () => {}, start: () => {}, stop: () => {}, type: 'sine' }),
      createGain: () => ({ gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} }, connect: () => {} }),
      resume: () => Promise.resolve(),
    };
  },
  webkitAudioContext: undefined,
  addEventListener: () => {},
  removeEventListener: () => {},
  localStorage: {
    _store: {},
    getItem(k) { return this._store[k] || null; },
    setItem(k, v) { this._store[k] = v; },
  },
  Notification: undefined,
};
fakeWindow.document = { body: null, addEventListener: () => {}, removeEventListener: () => {} };

const fakeReact = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  Fragment: 'Fragment',
  useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  useEffect: () => {},
  useRef: () => ({ current: null }),
};

const loaderCalls = [];
const fakeLoader = {
  load(registration) { loaderCalls.push(registration); },
};

const src = fs.readFileSync(clientFile, 'utf8');
// Inject __ModuleLoader__ as a property of `window` so the script's
// `window.__ModuleLoader__.load(...)` call resolves.
fakeWindow.__ModuleLoader__ = fakeLoader;
const fn = new Function('window', 'console', src);
fn(fakeWindow, console);

if (loaderCalls.length !== 1) {
  console.error('FAIL: expected 1 loader call, got', loaderCalls.length);
  process.exit(2);
}
const { id, factory } = loaderCalls[0];
if (id !== 'dsh-ai-question-chime') {
  console.error('FAIL: id expected dsh-ai-question-chime, got', id);
  process.exit(2);
}

const stubCtx = {
  get: (name) => (name === 'conversationEvents' ? { register: (def) => console.log('  [stub] conversationEvents.register:', def.kind) } : undefined),
  effect: (fn) => { try { fn(); } catch (e) { console.warn('effect error:', e.message); } },
  slots: { inject: (slot, factory) => { console.log('  [stub] slots.inject(' + slot + ')'); const reg = factory(); if (reg && reg.id) console.log('    -> registered:', reg.id); return reg; }, register: (def, render) => { console.log('  [stub] slots.register:', def.id, '/ render type:', typeof render); return def; } },
  locale: {
    register: (ns, dicts) => console.log('  [stub] locale.register(' + ns + '): ' + Object.keys(dicts).join(',')),
    bind: () => (k) => k,
  },
  reflect: { provide: () => {} },
};
const fakeRequire = (name) => {
  if (name === 'react') return fakeReact;
  throw new Error('unknown require: ' + name);
};
const mod = factory(fakeRequire);
console.log('--- module exports keys:', Object.keys(mod).join(','));
console.log('--- name:', mod.name);
console.log('--- inject:', JSON.stringify(mod.inject));
console.log('--- apply is function:', typeof mod.apply === 'function');

if (mod.name !== 'dsh-ai-question-chime') { console.error('FAIL: mod.name'); process.exit(2); }
if (typeof mod.apply !== 'function') { console.error('FAIL: apply missing'); process.exit(2); }
if (!Array.isArray(mod.inject) || !mod.inject.includes('slots') || !mod.inject.includes('locale')) {
  console.error('FAIL: inject must include slots, locale; got:', mod.inject);
  process.exit(2);
}

mod.apply(stubCtx);
console.log('--- apply completed without throwing');
console.log('PASS');
