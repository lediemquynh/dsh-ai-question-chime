window.__ModuleLoader__.load({ id: "dsh-ai-question-chime", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
'use strict';

/**
 * dsh-ai-question-chime client:
 *
 * Phát tiếng "bíp" khi AI hỏi lại người dùng để làm rõ tình huống.
 *
 * Cơ chế phát hiện câu hỏi (3 lớp, dùng lớp nào chạy trước):
 *   1. conversationEvents: register definition khớp `assistant/message`.
 *   2. sessionProjections: subscribe snapshot, lấy message mới nhất.
 *   3. DOM MutationObserver: theo dõi khung chat, bắt text mới có "?" hoặc "？".
 *
 * Bất kỳ layer nào phát hiện câu hỏi đều gọi `playChime()`. Đảm bảo plugin hoạt
 * động ngay cả khi một trong các service không có sẵn (vd dsh version cũ).
 *
 * Cài đặt trong Settings: bật/tắt, volume, test. Lưu localStorage.
 */

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
  debugLabel: '调试',
  debugSeen: '已监听到 assistant 消息',
  debugMatched: '已识别为提问',
  debugPlayed: '已播放提示音',
  debugReset: '清零',
};
const en = {
  navLabel: 'AI Question Chime',
  intro: 'Play a chime when the AI asks a clarifying question (a `?` / `？` in the message, or an `ask_user_question` tool call). Settings persist in this browser.',
  enableLabel: 'Enable chime',
  volumeLabel: 'Volume',
  testSound: 'Test chime',
  soundHint: 'Sounds are synthesized by browser Web Audio; system audio files are not read.',
  debugLabel: 'Debug',
  debugSeen: 'Assistant messages seen',
  debugMatched: 'Matched as question',
  debugPlayed: 'Chimes played',
  debugReset: 'Reset',
};
const vi = {
  navLabel: 'Tiếng bíp khi AI hỏi',
  intro: 'Phát tiếng bíp khi AI hỏi lại bạn để làm rõ tình huống (tin nhắn có dấu ? hoặc gọi tool ask_user_question). Cài đặt lưu trong trình duyệt.',
  enableLabel: 'Bật tiếng bíp',
  volumeLabel: 'Âm lượng',
  testSound: 'Thử bíp',
  soundHint: 'Âm thanh được tổng hợp bằng Web Audio của trình duyệt, không đọc file âm thanh hệ thống.',
  debugLabel: 'Gỡ lỗi',
  debugSeen: 'Số message assistant đã thấy',
  debugMatched: 'Số message là câu hỏi',
  debugPlayed: 'Số lần đã bíp',
  debugReset: 'Đặt lại',
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
// Stats (cho debug panel)
// ---------------------------------------------------------------------------
const stats = { seen: 0, matched: 0, played: 0, lastSeq: null };
function bumpSeen() { stats.seen += 1; notifyStatsChange(); }
function bumpMatched() { stats.matched += 1; notifyStatsChange(); }
function bumpPlayed() { stats.played += 1; notifyStatsChange(); }
function resetStats() { stats.seen = 0; stats.matched = 0; stats.played = 0; stats.lastSeq = null; notifyStatsChange(); }

let statsSubs = new Set();
function notifyStatsChange() {
  for (const cb of statsSubs) { try { cb(stats); } catch (e) {} }
}
function subscribeStats(cb) { statsSubs.add(cb); return () => statsSubs.delete(cb); }

// ---------------------------------------------------------------------------
// Detect câu hỏi
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

/** Trả về true nếu message là câu hỏi từ assistant cần user trả lời. */
function isAssistantQuestion(msg) {
  if (!msg) return false;
  // 1) ask_user_question tool call
  if (hasToolUse(msg, 'ask_user_question')) return true;
  // 2) có role = assistant + text chứa ? / ？
  const role = msgRole(msg);
  if (role !== undefined && role !== 'assistant') return false;
  const text = collectStrings(msg);
  if (!text) return false;
  return /[?？]/.test(text);
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
function playChime(volume) {
  const cfg = getCfg();
  if (cfg.enabled === false) return;
  const vol = typeof volume === 'number' && volume >= 0 && volume <= 1 ? volume
            : (typeof cfg.volume === 'number' ? cfg.volume : DEFAULT_CFG.volume);
  const now = Date.now();
  if (now - lastBeep < BEEP_COOLDOWN_MS) return;
  lastBeep = now;
  const ctx = ensureAudio();
  if (ctx === null) { console.warn(PLUGIN_TAG, 'AudioContext không tạo được'); return; }
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
      bumpPlayed();
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
// Các layer phát hiện
// ---------------------------------------------------------------------------
function processMessage(seq, msg) {
  if (stats.lastSeq === seq) return; // dedup
  stats.lastSeq = seq;
  bumpSeen();
  if (isAssistantQuestion(msg)) {
    bumpMatched();
    console.log(PLUGIN_TAG, 'câu hỏi từ assistant seq=' + seq, msg);
    playChime();
  }
}

// Layer 1: conversationEvents
function attachConversationEvents(ctx) {
  const events = ctx.get('conversationEvents');
  if (!events || typeof events.register !== 'function') {
    console.log(PLUGIN_TAG, 'layer 1 (conversationEvents) không có sẵn — thử layer khác');
    return false;
  }
  try {
    events.register({
      kind: 'ai-question-chime',
      target: 'chat',
      match: (event) => event.type === 'assistant/message'
        ? { id: 'ai-question-chime-' + event.seq, role: 'update' }
        : null,
      start: (_c, match) => ({ seq: match.event.seq }),
      update: (context, match) => {
        const msg = match.event.data && match.event.data.message;
        processMessage(match.event.seq, msg);
        return context.state;
      },
      buildViewNode: () => null,
    });
    console.log(PLUGIN_TAG, 'layer 1 (conversationEvents) đã đăng ký');
    return true;
  } catch (err) {
    console.warn(PLUGIN_TAG, 'layer 1 lỗi:', err && err.message);
    return false;
  }
}

// Layer 2: sessionProjections
function attachSessionProjections(ctx) {
  const projections = ctx.get('sessionProjections');
  if (!projections || typeof projections.subscribe !== 'function') {
    console.log(PLUGIN_TAG, 'layer 2 (sessionProjections) không có sẵn');
    return false;
  }
  try {
    projections.subscribe((snapshot) => {
      if (!snapshot || !snapshot.sessions) return;
      for (const sid in snapshot.sessions) {
        const session = snapshot.sessions[sid];
        if (!session || !Array.isArray(session.messages)) continue;
        for (const m of session.messages) {
          if (!m || m.role !== 'assistant') continue;
          const seq = m.seq || (m.id ? String(m.id) : sid + ':' + session.messages.indexOf(m));
          processMessage('sp-' + seq, m);
        }
      }
    });
    console.log(PLUGIN_TAG, 'layer 2 (sessionProjections) đã subscribe');
    return true;
  } catch (err) {
    console.warn(PLUGIN_TAG, 'layer 2 lỗi:', err && err.message);
    return false;
  }
}

// Layer 3: DOM MutationObserver (luôn hoạt động, không cần service)
function attachDomObserver() {
  if (typeof document === 'undefined' || !document.body) {
    console.log(PLUGIN_TAG, 'layer 3 (DOM) bỏ qua: không có document');
    return false;
  }
  // Tìm container chat thường có class chứa 'chat' hoặc 'message'
  const root = document.body;
  if (!root) return false;
  const seenTexts = new Set();
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return;
        // Thu thập text mới thêm vào DOM
        const text = node.textContent || '';
        if (!text || text.length < 3) return;
        // Dedup đơn giản theo 200 ký tự đầu
        const key = text.slice(0, 200);
        if (seenTexts.has(key)) return;
        seenTexts.add(key);
        // Giới hạn set
        if (seenTexts.size > 200) {
          const first = seenTexts.values().next().value;
          seenTexts.delete(first);
        }
        if (/[?？]/.test(text)) {
          // Có thể là câu hỏi. Chỉ phát bíp nếu text từ khung chat.
          // Heuristic: text ngắn (< 500 ký tự) và có dấu ?
          if (text.length < 500 && /[?？]/.test(text)) {
            console.log(PLUGIN_TAG, 'layer 3 (DOM) thấy text có ?:', text.slice(0, 80));
            processMessage('dom-' + Date.now() + '-' + Math.random(), { role: 'assistant', content: text });
          }
        }
      });
    }
  });
  observer.observe(root, { childList: true, subtree: true });
  console.log(PLUGIN_TAG, 'layer 3 (DOM observer) đã attach');
  return true;
}

// ---------------------------------------------------------------------------
// Settings page
// ---------------------------------------------------------------------------
function SettingsPage(props) {
  const React = require('react');
  const h = React.createElement;
  const { useState, useEffect } = React;
  const t = props.t;
  const [cfg, setCfgState] = useState(() => getCfg());
  const [s, setStats] = useState(stats);
  useEffect(() => subscribeStats((next) => setStats({ ...next })), []);
  const update = (patch) => setCfgState(setCfg(patch));

  const btnStyle = {
    padding: '5px 12px', borderRadius: 6,
    border: '1px solid rgba(127,127,127,0.45)', background: 'transparent',
    color: 'inherit', cursor: 'pointer', fontSize: 12,
  };
  const numStyle = { fontFamily: 'ui-monospace, monospace', padding: '0 4px', color: 'var(--dsw-alias-label-primary)' };

  return h('div', { style: { padding: '6px 10px 20px', fontSize: 13, lineHeight: 1.6 } },
    h('p', { style: { margin: '0 0 4px', opacity: 0.75 } }, t('intro')),
    h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(127,127,127,0.18)' } },
      h('span', { style: { fontSize: 13 } }, t('enableLabel')),
      h('input', { type: 'checkbox', checked: cfg.enabled !== false, onChange: (e) => update({ enabled: e.target.checked }) })),
    h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(127,127,127,0.18)' } },
      h('span', { style: { fontSize: 13 } }, t('volumeLabel')),
      h('input', {
        type: 'range', min: 0, max: 100, value: Math.round((cfg.volume ?? DEFAULT_CFG.volume) * 100),
        onChange: (e) => update({ volume: Number(e.target.value) / 100 }),
        style: { width: 150 },
      })),
    h('p', { style: { margin: '8px 0 0', opacity: 0.6, fontSize: 11 } }, t('soundHint')),
    h('div', { style: { padding: '12px 0 4px' } },
      h('button', { style: btnStyle, onClick: () => { unlockAudio(); playChime(); } }, t('testSound'))),
    h('details', { style: { marginTop: 16, fontSize: 12, opacity: 0.85 } },
      h('summary', { style: { cursor: 'pointer', fontWeight: 600 } }, t('debugLabel')),
      h('div', { style: { padding: '8px 0', lineHeight: 1.8 } },
        h('div', null, t('debugSeen') + ': ', h('span', { style: numStyle }, s.seen)),
        h('div', null, t('debugMatched') + ': ', h('span', { style: numStyle }, s.matched)),
        h('div', null, t('debugPlayed') + ': ', h('span', { style: numStyle }, s.played)),
        h('button', { style: { ...btnStyle, marginTop: 6 }, onClick: () => resetStats() }, t('debugReset')),
      ),
    ),
  );
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

  // 2) Unlock AudioContext ở thao tác người dùng đầu tiên
  const unlock = () => { try { unlockAudio(); } catch (err) {} };
  const events = ['pointerdown', 'mousedown', 'keydown', 'touchstart', 'wheel'];
  for (const ev of events) {
    window.addEventListener(ev, unlock, { passive: true, capture: true });
  }

  // 3) Thử attach 3 layer
  let l1 = attachConversationEvents(ctx);
  if (!l1) l1 = false;
  const l2 = attachSessionProjections(ctx);
  const l3 = attachDomObserver();
  console.log(PLUGIN_TAG, 'plugin loaded; layers: conversationEvents=' + l1 + ', sessionProjections=' + l2 + ', domObserver=' + l3);

  // 4) Settings page
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'ai-question-chime',
    order: 50,
    label: () => t('navLabel'),
    locale: NS,
    inject: () => ({ t }),
  }, () => SettingsPage({ t })));

  // 5) Cleanup khi plugin unload
  ctx.effect(() => () => {
    for (const ev of events) {
      window.removeEventListener(ev, unlock, { capture: true });
    }
  }, 'dsh-ai-question-chime: cleanup');
};

return module.exports;
} });
