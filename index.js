// ============================================================================
// ai-question-chime — Client Cordis Plugin (ESM module)
//
// Phát một tiếng "bíp" nhỏ trên trình duyệt GUI mỗi khi AI gửi một lượt tin
// nhắn mà trong đó nó đang HỎI LẠI người dùng để làm rõ tình huống:
//   1) tin nhắn assistant chứa dấu hỏi ("?" / "？"), HOẶC
//   2) assistant gọi công cụ ask_user_question (hộp thoại chọn lựa).
//
// Đây là module Cordis chuẩn (export default một Plugin). Có thể:
//   - cài cố định: đưa repo này vào composition của preset (xem cordis.yml).
//   - nạp động:   dùng nội dung file code.client.js làm code.client của
//                 cordis_define (không cần file này).
//
// Không dùng import bên trong apply(); React / window / document là global ở
// phía Client (trình duyệt).
// ============================================================================

// ---- trạng thái module (sống cùng vòng đời Plugin) ------------------------
const seen = new Set();        // node key đã xử lý -> không bíp lại lịch sử
let audioCtx = null;           // AudioContext được tạo lười biếng
let lastBeep = 0;              // throttle: tránh bíp dày trong cùng 1 lượt
let enabled = true;            // bật/tắt (có thể gắn nút cài đặt sau)
let volume = 0.18;             // âm lượng 0..1
const BEEP_COOLDOWN_MS = 1200; // khoảng tối thiểu giữa 2 tiếng bíp

// ---- trích xuất vai trò của một chat node ----------------------------------
function nodeRole(n) {
  if (!n || typeof n !== 'object') return undefined;
  return n.role ?? (n.data && n.data.role) ?? (n.message && n.message.role) ?? n.kind ?? n.type;
}

// ---- duyệt đệ quy, gom mọi chuỗi trong node --------------------------------
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

// ---- tìm một tool_use có tên cụ thể (vd. ask_user_question) -----------------
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

// ---- quyết định một node có phải là "AI đang hỏi lại" không -----------------
function isAssistantQuestion(node) {
  // Công cụ ask_user_question là dấu hiệu chắc chắn nhất (chỉ assistant gọi).
  if (hasToolUse(node, 'ask_user_question')) return true;
  const role = nodeRole(node);
  // Chỉ xét tin nhắn của assistant; bỏ qua user / tool / không rõ vai trò.
  if (!role || role !== 'assistant') return false;
  const text = collectStrings(node);
  return /[?？]/.test(text);
}

// ---- chuẩn bị AudioContext (tuân thủ autoplay policy của trình duyệt) -------
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

// ---- phát tiếng bíp 2 nốt ngắn, êm (B5 -> E6) -------------------------------
function playChime() {
  if (enabled === false) return;
  const now = Date.now();
  if (now - lastBeep < BEEP_COOLDOWN_MS) return;
  lastBeep = now;
  const ctx = ensureCtx();
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const tones = [[988, 0], [1319, 0.10]]; // tần số (Hz), độ trễ (s)
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

// ---- component theo dõi (được mount vào Slot, không vẽ gì cả) ---------------
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

// ---- Plugin entry -----------------------------------------------------------
export default {
  apply(ctx) {
    const slots = ctx.get('slots');
    if (slots === undefined) return;

    // Mở khóa AudioContext ngay khi người dùng có cử chỉ đầu tiên (click/gõ phím)
    // để trình duyệt cho phép phát âm thanh sau đó.
    ctx.effect(() => {
      const unlock = () => { ensureCtx(); };
      document.addEventListener('pointerdown', unlock);
      document.addEventListener('keydown', unlock);
      return () => {
        document.removeEventListener('pointerdown', unlock);
        document.removeEventListener('keydown', unlock);
      };
    });

    // Gắn trình theo dõi vào đuôi mỗi lượt hội thoại (session-scoped -> có useSession).
    slots.inject('conversation.chat.turnTail', () => slots.register(
      { name: 'conversation.chat.turnTail', id: 'ai-question-chime', key: 'ai-question-chime' },
      (props) => React.createElement(QuestionWatcher, props),
    ));
  },
};
