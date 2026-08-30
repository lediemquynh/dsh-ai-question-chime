window.__ModuleLoader__.load({ id: "dsh-ai-question-chime", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
'use strict';

/**
 * dsh-ai-question-chime client:
 *
 * Phát tiếng "bíp" khi AI hỏi lại người dùng để làm rõ tình huống:
 *   - Câu hỏi được phát hiện qua event `assistant/message` của service
 *     `conversationEvents` (Client Host service, xem dsh-client-runtime);
 *   - Hai trigger: dấu `?` / `？` trong message, hoặc tool call
 *     `ask_user_question` (chuẩn của dsh);
 *   - Âm thanh: Web Audio API tổng hợp (zero audio file, hoạt động mọi OS);
 *   - Lần đầu có thao tác người dùng mới unlock AudioContext (Chromium
 *     autoplay policy);
 *   - Settings: 设置 → AI Question Chime — bật/tắt tiếng, chỉnh âm lượng,
 *     thử âm thanh. Lưu vào localStorage (`dsh.aiQuestionChime.v1`).
 */

const NS = 'ai-question-chime';
const STORAGE_KEY = 'dsh.aiQuestionChime.v1';
const DEFAULT_CFG = { enabled: true, volume: 0.18 };
const BEEP_COOLDOWN_MS = 1200;

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
// Phát hiện câu hỏi
// ---------------------------------------------------------------------------
function msgRole(m) {
  if (!m || typeof m !== 'object') return undefined;
  return m.role || (m.data && m.data.role);
}

function collectStrings(node) {
  const out = [];
  (function walk(v) {
    if (v == null) return;
    if (typeof v === 'string') { out.push(v); return; }
    if (typeof v !== 'object') return;
    if (Array.isArray(v)) { v.forEach(walk); return; }
    for (const k in v) walk(v[k]);
  })(node);
  return out.join(' ');
}

function hasToolUse(node, name) {
  let found = false;
  (function walk(v) {
    if (found || v == null || typeof v !== 'object') return;
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (typeof v.name === 'string' && v.name === name) { found = true; return; }
    if (v.type === 'tool_use' && typeof v.name === 'string' && v.name === name) { found = true; return; }
    for (const k in v) walk(v[k]);
  })(node);
  return found;
}

function isAssistantQuestion(msg) {
  if (hasToolUse(msg, 'ask_user_question')) return true;
  const role = msgRole(msg);
  if (role && role !== 'assistant') return false;
  const text = collectStrings(msg);
  return /[?？]/.test(text);
}

// ---------------------------------------------------------------------------
// Web Audio: tổng hợp tiếng "bíp" 2 nốt (988Hz → 1319Hz)
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
function playChime(volume) {
  const vol = typeof volume === 'number' && volume >= 0 && volume <= 1 ? volume : 0.18;
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
    } catch (err) { /* ignore */ }
  };
  if (ctx.state === 'suspended') {
    ctx.resume().then(() => { if (ctx.state === 'running') play(); }).catch(() => {});
  } else {
    play();
  }
}

// ---------------------------------------------------------------------------
// Settings page
// ---------------------------------------------------------------------------
function Row(props) {
  return require('react').createElement('div', {
    style: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 0', borderBottom: '1px solid rgba(127,127,127,0.18)',
    },
  },
    require('react').createElement('span', { style: { fontSize: 13 } }, props.label),
    props.children);
}

function SettingsPage(props) {
  const React = require('react');
  const h = React.createElement;
  const { useState } = React;
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
      h('button', { style: btnStyle, onClick: () => { unlockAudio(); playChime(cfg.volume); } }, t('testSound'))),
  );
}

// ---------------------------------------------------------------------------
// Plugin entry
// ---------------------------------------------------------------------------
exports.name = 'dsh-ai-question-chime';
exports.inject = ['slots', 'locale', 'conversationEvents'];
exports.apply = function apply(ctx) {
  // 1) Đăng ký từ điển i18n
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-ai-question-chime: dictionaries');
  const t = ctx.locale.bind(NS);

  // 2) Unlock AudioContext ở thao tác người dùng đầu tiên
  ctx.effect(() => {
    const unlock = () => { try { unlockAudio(); } catch (err) {} };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, 'dsh-ai-question-chime: audio unlock');

  // 3) Đăng ký event handler trên conversationEvents (chạy ở mọi session)
  const events = ctx.get('conversationEvents');
  if (events !== undefined && typeof events.register === 'function') {
    const seenSeqs = new Set();
    events.register({
      kind: 'ai-question-chime',
      target: 'chat',
      match: function (event) {
        return event.type === 'assistant/message'
          ? { id: 'ai-question-chime-' + event.seq, role: 'update' }
          : null;
      },
      start: function (_c, match) { return { seq: match.event.seq }; },
      update: function (context, match) {
        const seq = match.event.seq;
        if (seenSeqs.has(seq)) return context.state;
        seenSeqs.add(seq);
        const msg = match.event.data && match.event.data.message;
        if (!msg || !isAssistantQuestion(msg)) return context.state;
        const cfg = getCfg();
        if (cfg.enabled === false) return context.state;
        playChime(cfg.volume);
        return context.state;
      },
      buildViewNode: function () { return null; },
    });
  } else {
    console.log('[ai-question-chime] conversationEvents service không có sẵn — plugin tắt.');
  }

  // 4) Trang settings
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'ai-question-chime',
    order: 50,
    label: () => t('navLabel'),
    locale: NS,
    inject: () => ({ t }),
  }, () => SettingsPage({ t })));

  console.log('[ai-question-chime] plugin loaded (apply)');
};

return module.exports;
} });
