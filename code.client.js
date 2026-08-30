// ============================================================================
// ai-question-chime — dynamic Client Cordis Plugin (function body for code.client)
// Dùng làm giá trị code.client khi gọi cordis_define (nạp động). Không có export.
// ============================================================================

let audioCtx = null;
let lastBeep = 0;
let enabled = true;
let volume = 0.18;
const BEEP_COOLDOWN_MS = 1200;
const seenSeqs = new Set();

function msgRole(m) {
  if (!m || typeof m !== 'object') return undefined;
  return m.role ?? (m.data && m.data.role);
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

function ensureCtx() {
  try {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  } catch (e) {
    console.warn('[ai-question-chime] AudioContext lỗi:', e);
    return null;
  }
}

function playChime() {
  if (enabled === false) return;
  const now = Date.now();
  if (now - lastBeep < BEEP_COOLDOWN_MS) return;
  lastBeep = now;
  const ctx = ensureCtx();
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const tones = [[988, 0], [1319, 0.10]];
  for (const [freq, delay] of tones) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const start = t0 + delay;
    const dur = 0.09;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }
  console.log('[ai-question-chime] 🔔 BEEP');
}

return {
  inject: ['conversationEvents'],
  apply(ctx) {
    console.log('[ai-question-chime] plugin loaded');
    ctx.effect(() => {
      const unlock = () => { ensureCtx(); };
      document.addEventListener('pointerdown', unlock);
      document.addEventListener('keydown', unlock);
      return () => {
        document.removeEventListener('pointerdown', unlock);
        document.removeEventListener('keydown', unlock);
      };
    });
    const events = ctx.conversationEvents;
    if (events === undefined) {
      console.warn('[ai-question-chime] conversationEvents chưa sẵn sàng — không thể theo dõi tin nhắn');
      return;
    }
    events.register({
      kind: 'ai-question-chime',
      target: 'chat',
      match: (event) =>
        event.type === 'assistant/message' ? { id: 'chime-' + event.seq, role: 'update' } : null,
      start: (_c, match) => ({ seq: match.event.seq }),
      update: (context, match) => {
        const seq = match.event.seq;
        if (seenSeqs.has(seq)) return context.state;
        seenSeqs.add(seq);
        const msg = match.event.data && match.event.data.message;
        console.log('[ai-question-chime] assistant message seq=' + seq);
        if (msg && isAssistantQuestion(msg)) playChime();
        return context.state;
      },
      buildViewNode: () => null,
    });
    console.log('[ai-question-chime] đang theo dõi assistant/message');
  },
};
