window.__ModuleLoader__.load({ id: "dsh-ai-question-chime", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
'use strict';

/**
 * dsh-ai-question-chime client:
 *
 * Phát tiếng "bíp" khi AI hỏi lại người dùng để làm rõ tình huống.
 *
 * Cơ chế phát hiện (lấy cảm hứng từ dsh-complete-notify):
 *   - Subscribe `useSessions` hook → nhận snapshot toàn bộ session list
 *     (MỌI session — kể cả session cũ — đều nằm trong snapshot).
 *   - State machine so sánh `prev` ↔ `next` để phát hiện edge:
 *       • session.pendingInteraction tăng từ null → có object = AI hỏi user
 *         (ask_user_question tool, model tự hỏi, hoặc cần approval).
 *       • pendingId đổi (cùng session, key khác) = câu hỏi mới.
 *   - Khi session bị xóa khỏi list, state cleanup.
 *   - origin === 'subagent' bị bỏ qua.
 *   - Snapshot đầu tiên (prev = null) chỉ khởi tạo, KHÔNG emit.
 *
 * Cài đặt lưu localStorage: enabled, volume.
 */

const React = require('react');
const h = React.createElement;
const { useState, useEffect, useRef } = React;

const NS = 'ai-question-chime';
const STORAGE_KEY = 'dsh.aiQuestionChime.v1';
const DEFAULT_CFG = { enabled: true, volume: 0.18 };
const BEEP_COOLDOWN_MS = 1200;

const PLUGIN_TAG = '[ai-question-chime]';

// ---------------------------------------------------------------------------
// i18n
// ---------------------------------------------------------------------------
const zh = {
  navLabel: 'AI 提问提示音',
  intro: '当 AI 询问澄清性问题时（带问号或调用 ask_user_question）播放提示音。所有设置保存在当前浏览器。',
  enableLabel: '启用提示音',
  volumeLabel: '音量',
  testSound: '测试提示音',
  soundHint: '声音由浏览器 Web Audio 合成，不读取系统原生音频文件。',
};
const en = {
  navLabel: 'AI Question Chime',
  intro: 'Play a chime when the AI asks a clarifying question (a `?` / `？` in the message, or an `ask_user_question` tool call). Settings persist in this browser.',
  enableLabel: 'Enable chime',
  volumeLabel: 'Volume',
  testSound: 'Test chime',
  soundHint: 'Sounds are synthesized by browser Web Audio; system audio files are not read.',
};
const vi = {
  navLabel: 'Tiếng bíp khi AI hỏi',
  intro: 'Phát tiếng bíp khi AI hỏi lại bạn để làm rõ tình huống (tin nhắn có dấu ? hoặc gọi tool ask_user_question). Cài đặt lưu trong trình duyệt.',
  enableLabel: 'Bật tiếng bíp',
  volumeLabel: 'Âm lượng',
  testSound: 'Thử bíp',
  soundHint: 'Âm thanh được tổng hợp bằng Web Audio của trình duyệt, không đọc file âm thanh hệ thống.',
};

// ---------------------------------------------------------------------------
// Config (localStorage)
// ---------------------------------------------------------------------------
function getCfg() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return Object.assign({}, DEFAULT_CFG);
    const stored = JSON.parse(raw);
    return Object.assign({}, DEFAULT_CFG, stored);
  } catch (err) {
    return Object.assign({}, DEFAULT_CFG);
  }
}
function setCfg(patch) {
  const next = Object.assign({}, getCfg(), patch);
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch (err) {}
  return next;
}

// ---------------------------------------------------------------------------
// Web Audio
// ---------------------------------------------------------------------------
let audioCtx = null;
let lastBeep = 0;
function ensureAudio() {
  if (audioCtx === null) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (Ctor === undefined) return null;
    try { audioCtx = new Ctor(); } catch (err) { audioCtx = null; }
  }
  return audioCtx;
}
function unlockAudio() {
  const ctx = ensureAudio();
  if (ctx === null) return;
  if (ctx.state === 'suspended') { try { ctx.resume(); } catch (err) {} }
}
function playChime() {
  const cfg = getCfg();
  if (cfg.enabled === false) return;
  const vol = typeof cfg.volume === 'number' ? cfg.volume : DEFAULT_CFG.volume;
  const now = Date.now();
  if (now - lastBeep < BEEP_COOLDOWN_MS) return;
  lastBeep = now;
  const ctx = ensureAudio();
  if (ctx === null) return;
  const play = () => {
    try {
      const t0 = ctx.currentTime;
      const tones = [[988, 0], [1319, 0.10]];
      for (let i = 0; i < tones.length; i++) {
        const freq = tones[i][0];
        const delay = tones[i][1];
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        osc.connect(gain);
        gain.connect(ctx.destination);
        const start = t0 + delay;
        const dur = 0.09;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(vol, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
        osc.start(start);
        osc.stop(start + dur + 0.02);
      }
      console.log(PLUGIN_TAG, '🔔 BEEP');
    } catch (err) {
      console.warn(PLUGIN_TAG, 'playChime error:', err && err.message);
    }
  };
  if (ctx.state === 'suspended') {
    ctx.resume().then(() => { if (ctx.state === 'running') play(); }).catch(() => {});
  } else {
    play();
  }
}

// ---------------------------------------------------------------------------
// State machine — phát hiện edge "AI vừa hỏi user"
//
// Input: snapshot useSessions ({ ids, byId, current }).
// Output: mảng event { sessionId, kind: 'question' }.
// ---------------------------------------------------------------------------
function createWatcher() {
  const state = new Map(); // sessionId -> { lastPendingId: any }
  return {
    diff(prev, next) {
      const events = [];
      if (next === null || next === undefined) return events;
      const byId = next.byId || {};
      const ids = next.ids || [];
      const seen = new Set();
      for (const id of ids) {
        seen.add(id);
        const entry = byId[id];
        if (entry === undefined) continue;
        if (entry.origin === 'subagent') continue;

        let st = state.get(id);
        if (st === undefined) st = { lastPendingId: null };
        const pending = entry.pendingInteraction;
        const currentPendingId = pending !== undefined && pending !== null
          ? (pending.id !== undefined ? pending.id : (pending.kind || '1'))
          : null;

        if (prev === null || prev === undefined) {
          // First snapshot: record only, no emit
          st.lastPendingId = currentPendingId;
        } else if (currentPendingId !== null && currentPendingId !== st.lastPendingId) {
          // Edge: pending appeared or changed → AI asking user
          st.lastPendingId = currentPendingId;
          events.push({ sessionId: id, kind: 'question' });
        } else {
          st.lastPendingId = currentPendingId;
        }
        state.set(id, st);
      }
      // Cleanup deleted sessions
      for (const id of Array.from(state.keys())) if (!seen.has(id)) state.delete(id);
      return events;
    },
  };
}

// ---------------------------------------------------------------------------
// Settings page
// ---------------------------------------------------------------------------
function Row(props) {
  return h('div', {
    style: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 0', borderBottom: '1px solid rgba(127,127,127,0.18)',
    },
  },
    h('span', { style: { fontSize: 13 } }, props.label),
    props.children);
}

function SettingsPage(props) {
  const t = props.t;
  const [cfg, setCfgState] = useState(() => getCfg());
  const update = (patch) => setCfgState(setCfg(patch));

  const btnStyle = {
    padding: '5px 12px', borderRadius: 6,
    border: '1px solid rgba(127,127,127,0.45)', background: 'transparent',
    color: 'inherit', cursor: 'pointer', fontSize: 12,
  };

  return h('div', { style: { padding: '6px 10px 20px', fontSize: 13, lineHeight: 1.6 } },
    h('p', { style: { margin: '0 0 4px', opacity: 0.75 } }, t('intro')),
    h(Row, { label: t('enableLabel') },
      h('input', { type: 'checkbox', checked: cfg.enabled !== false, onChange: (e) => update({ enabled: e.target.checked }) })),
    h(Row, { label: t('volumeLabel') },
      h('input', {
        type: 'range', min: 0, max: 100, value: Math.round((cfg.volume ?? DEFAULT_CFG.volume) * 100),
        onChange: (e) => update({ volume: Number(e.target.value) / 100 }),
        style: { width: 150 },
      })),
    h('p', { style: { margin: '8px 0 0', opacity: 0.6, fontSize: 11 } }, t('soundHint')),
    h('div', { style: { padding: '12px 0 4px' } },
      h('button', { style: btnStyle, onClick: () => { unlockAudio(); playChime(); } }, t('testSound'))),
  );
}

// ---------------------------------------------------------------------------
// ChimeHost — chứa watcher, chạy ẩn trên shell.overlay
// ---------------------------------------------------------------------------
function useFallbackSnap() { return null; }

function ChimeHost(props) {
  const select = typeof props.useSessions === 'function' ? props.useSessions : useFallbackSnap;
  const snap = select((s) => s);
  const watcherRef = useRef(null);
  const prevRef = useRef(null);
  if (watcherRef.current === null) watcherRef.current = createWatcher();

  useEffect(() => {
    if (snap === null || snap === undefined) return;
    const events = watcherRef.current.diff(prevRef.current, snap);
    prevRef.current = snap;
    for (const ev of events) {
      if (ev.kind === 'question') {
        console.log(PLUGIN_TAG, 'câu hỏi mới ở session', ev.sessionId);
        playChime();
      }
    }
  }, [snap]);

  return null;
}

// ---------------------------------------------------------------------------
// Plugin entry
// ---------------------------------------------------------------------------
exports.name = 'dsh-ai-question-chime';
exports.inject = ['slots', 'locale'];
exports.apply = function apply(ctx) {
  // 1) i18n
  ctx.effect(() => ctx.locale.register(NS, { zh, en, vi }), 'dsh-ai-question-chime: dictionaries');
  const t = ctx.locale.bind(NS);

  // 2) Audio unlock ở thao tác người dùng đầu tiên
  const unlock = () => { try { unlockAudio(); } catch (err) {} };
  const events = ['pointerdown', 'mousedown', 'keydown', 'touchstart', 'wheel'];
  for (const ev of events) window.addEventListener(ev, unlock, { passive: true, capture: true });

  // 3) Watcher mount trên shell.overlay (luôn chạy mọi session)
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'ai-question-chime-watcher',
    order: 40,
    label: () => t('navLabel'),
    locale: NS,
    inject: () => ({ t }),
  }, (props) => h(ChimeHost, { useSessions: props ? props.useSessions : undefined })));

  // 4) Settings page
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'ai-question-chime',
    order: 50,
    label: () => t('navLabel'),
    locale: NS,
    inject: () => ({ t }),
  }, () => h(SettingsPage, { t })));

  console.log(PLUGIN_TAG, 'plugin loaded (useSessions-based)');

  // 5) Cleanup
  ctx.effect(() => () => {
    for (const ev of events) window.removeEventListener(ev, unlock, { capture: true });
  }, 'dsh-ai-question-chime: cleanup');
};

// 单测钩子（客户端宿主会忽略该额外导出）— same pattern as dsh-complete-notify
exports.__test = { createWatcher, playChime, getCfg };

return module.exports;
} });
