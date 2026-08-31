// Watcher state machine tests — chạy client.js trong stub, lấy createWatcher,
// rồi kiểm tra các kịch bản edge: câu hỏi mới, boot lần đầu, re-ask, subagent.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const clientFile = path.resolve(here, '..', 'client', 'client.js');

const fakeWindow = {
  AudioContext: undefined,
  webkitAudioContext: undefined,
  addEventListener: () => {},
  removeEventListener: () => {},
  localStorage: { getItem: () => null, setItem: () => {} },
  document: { body: null },
};
const fakeReact = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  Fragment: 'Fragment',
  useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  useEffect: () => {},
  useRef: (init) => ({ current: init === null ? null : init }),
};

const loaderCalls = [];
const fakeLoader = { load: (r) => loaderCalls.push(r) };
fakeWindow.__ModuleLoader__ = fakeLoader;

const src = fs.readFileSync(clientFile, 'utf8');
const fn = new Function('window', 'console', src);
fn(fakeWindow, console);

const { id, factory } = loaderCalls[0];
if (id !== 'dsh-ai-question-chime') { console.error('FAIL id'); process.exit(2); }
const mod = factory((name) => { if (name === 'react') return fakeReact; throw new Error('unknown ' + name); });
const { createWatcher } = mod.__test || {};
if (typeof createWatcher !== 'function') {
  console.error('FAIL: __test.createWatcher missing — exports.__test not exposed');
  process.exit(2);
}

let failures = 0;
function expect(name, cond) {
  if (cond) { console.log('  ok  -', name); }
  else { failures += 1; console.error('  FAIL-', name); }
}

// --- snapshot builders -----------------------------------------------------
const snap = (entries) => ({ ids: entries.map((e) => e.id), byId: Object.fromEntries(entries.map((e) => [e.id, e])), current: entries[0] && entries[0].id });

// 1. Boot lần đầu với session CŨ đang có pendingInteraction → KHÔNG bíp
{
  const w = createWatcher();
  const first = snap([{ id: 'old-session', pendingInteraction: { id: 'q1', kind: 'question' } }]);
  const events = w.diff(null, first);
  expect('boot với pending sẵn: 0 event (không bíp hồi âm cũ)', events.length === 0);
  // Sau đó pending biến mất (user trả lời) → không event
  const cleared = w.diff(first, snap([{ id: 'old-session' }]));
  expect('pending biến mất: 0 event', cleared.length === 0);
  // Rồi AI hỏi lại → 1 event
  const reask = w.diff(cleared, snap([{ id: 'old-session', pendingInteraction: { id: 'q2', kind: 'question' } }]));
  expect('AI hỏi lại sau khi được trả lời: 1 event', reask.length === 1 && reask[0].kind === 'question');
}

// 2. Session mới hỏi lần đầu → 1 event
{
  const w = createWatcher();
  const first = snap([{ id: 's1' }]);
  w.diff(null, first);
  const asked = w.diff(first, snap([{ id: 's1', pendingInteraction: { id: 'q1' } }]));
  expect('câu hỏi đầu tiên: 1 event', asked.length === 1);
  const stillSame = w.diff(asked && snap([{ id: 's1', pendingInteraction: { id: 'q1' } }]), snap([{ id: 's1', pendingInteraction: { id: 'q1' } }]));
  expect('cùng 1 pending lặp lại snapshot: 0 event (dedup)', stillSame.length === 0);
}

// 3. Subagent bị bỏ qua
{
  const w = createWatcher();
  const first = snap([{ id: 's1' }, { id: 'sub1', origin: 'subagent' }]);
  w.diff(null, first);
  const asked = w.diff(first, snap([{ id: 's1' }, { id: 'sub1', origin: 'subagent', pendingInteraction: { id: 'q1' } }]));
  expect('subagent hỏi: 0 event', asked.length === 0);
}

// 4. Cleanup session đã xóa
{
  const w = createWatcher();
  const first = snap([{ id: 's1' }]);
  w.diff(null, first);
  const removed = w.diff(first, snap([]));
  expect('session xóa: 0 event (chỉ cleanup)', removed.length === 0);
  const readd = w.diff(removed, snap([{ id: 's1', pendingInteraction: { id: 'q9' } }]));
  expect('session thêm lại rồi hỏi: 1 event', readd.length === 1);
}

if (failures > 0) { console.error(failures + ' failure(s)'); process.exit(2); }
console.log('WATCHER PASS');
