// ============================================================================
// ai-question-chime — dynamic Client Cordis Plugin (function body for code.client)
//
// Dùng làm giá trị code.client khi gọi cordis_define (nạp động). Đây là function
// body (KHÔNG có export), trả về một Cordis Plugin. Nội dung tương đương index.js.
// ============================================================================

const seen = new Set();
let audioCtx = null;
let lastBeep = 0;
let enabled = true;
let volume = 0.18;
const BEEP_COOLDOWN_MS = 1200;

function nodeRole(n) {
  if (!n || typeof n !== 'object') return undefined;
  return n.role ?? (n.data && n.data.role) ?? (n.message && n.message.role) ?? n.kind ?? n.type;
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

function isAssistantQuestion(node) {
  if (hasToolUse(node, 'ask_user_question')) return true;
  const role = nodeRole(node);
  if (!role || role !== 'assistant') return false;
  const text = collectStrings(node);
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
}

function QuestionWatcher(props) {
  const useSession = props && props.useSession;
  if (typeof useSession !== 'function') return null;
  const order = useSession((s) => (s && s.chat ? s.chat.order : null));
  const nodes = useSession((s) => (s && s.chat ? s.chat.nodes : null));
  React.useEffect(() => {
    if (!order || !nodes || typeof nodes.get !== 'function') return;
    for (const key of order) {
      if (seen.has(key)) continue;
      seen.add(key);
      const node = nodes.get(key);
      if (!node) continue;
      if (isAssistantQuestion(node)) { playChime(); break; }
    }
  }, [order, nodes]);
  return null;
}

return {
  apply(ctx) {
    const slots = ctx.get('slots');
    if (slots === undefined) return;
    ctx.effect(() => {
      const unlock = () => { ensureCtx(); };
      document.addEventListener('pointerdown', unlock);
      document.addEventListener('keydown', unlock);
      return () => {
        document.removeEventListener('pointerdown', unlock);
        document.removeEventListener('keydown', unlock);
      };
    });
    slots.inject('conversation.chat.turnTail', () => slots.register(
      { name: 'conversation.chat.turnTail', id: 'ai-question-chime', key: 'ai-question-chime' },
      (props) => React.createElement(QuestionWatcher, props),
    ));
  },
};
