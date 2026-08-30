# dsh-ai-question-chime

Phát tiếng "bíp" ngắn khi AI hỏi lại người dùng để làm rõ tình huống, giúp bạn không bỏ lỡ và trả lời kịp thời. Thiết kế cho [DeepSeek Harness](https://github.com/deepseek-ai) (DSH).

- 🔔 **Hai cách phát hiện** — dấu `?` / `？` trong tin nhắn assistant, hoặc tool call `ask_user_question` (tool chuẩn của DSH để hỏi lại).
- 🎵 **Tổng hợp bằng Web Audio API** — không cần file âm thanh, hoạt động trên mọi OS (Windows / macOS / Linux).
- ⚙️ **Trang Settings** — `Settings ⚙️ → AI Question Chime`. Bật/tắt, chỉnh âm lượng, thử âm thanh. Lưu vào `localStorage`.
- 🪶 **Không phụ thuộc hệ thống** — không gọi shell, không dùng system notification, không cần quyền đặc biệt.
- 🚀 **Hoạt động ở mọi preset** — cài một lần, dùng cho mọi session (không cần đổi preset).
- 🌐 **Đa ngôn ngữ** — English / 简体中文 / Tiếng Việt. Cài đặt và tài liệu đều theo ngôn ngữ UI.

> Mẫu kiến trúc tham khảo từ [`kaixinbaba/dsh-complete-notify`](https://github.com/kaixinbaba/dsh-complete-notify). Cảm ơn đã chia sẻ layout plugin DSH chuẩn.

[English](README.md) · [简体中文](README.zh.md) · [Tiếng Việt](README.vi.md)

## Cài đặt

### Cách 1 — Từ npm (khuyên dùng)
```sh
# Cài global (hoặc để dsh plugin tự quản lý)
npm install -g dsh-ai-question-chime
# Đăng ký vào web profile
dsh plugin --profile web add dsh-ai-question-chime
# Khởi động lại dsh web
# macOS launchd:
launchctl kickstart -k gui/$(id -u)/com.dsh.dsh-web
# Hoặc tắt/mở dsh web thủ công
```

### Cách 2 — Từ GitHub (không cần tài khoản npm)
```sh
dsh plugin --profile web add "github:lediemquynh/dsh-ai-question-chime"
# Khởi động lại dsh web
```

### Cách 3 — Link local (để phát triển)
```sh
dsh plugin --profile web add link:/path/to/dsh-ai-question-chime
# Sửa code → restart dsh web → thay đổi có hiệu lực (không cần cài lại)
```

## Sử dụng

1. Mở bất kỳ session nào trong dsh web (preset nào cũng được).
2. Khi AI hỏi lại bạn (tin nhắn có `?` hoặc gọi tool `ask_user_question`) → bạn nghe tiếng bíp 2 nốt tăng dần (988 Hz → 1319 Hz, khoảng 0.2 giây).
3. **Settings ⚙️ → AI Question Chime** (hoặc nhãn theo ngôn ngữ) cho phép bạn:
   - Bật / tắt tiếng bíp
   - Chỉnh âm lượng (thanh trượt, 0–100%)
   - Bấm **Test chime** để nghe thử
4. Trong **Settings → Plugins → Plugin list** (插件列表), bạn sẽ thấy card `dsh-ai-question-chime` với trạng thái **Mounted / 已挂载**.

### Lưu ý
- Trình duyệt chặn autoplay lần đầu. Gửi **tin nhắn đầu tiên** trong dsh là đủ để mở khóa `AudioContext` (mọi click/keystroke cũng unlock).
- Plugin chỉ chạy khi tab dsh đang mở — đây là giới hạn chung của Web Audio, không phải bug. Đóng tab thì không nghe được bíp.
- Nếu mở nhiều tab dsh trong cùng trình duyệt, mỗi tab chạy bản plugin riêng — chúng không chia sẻ trạng thái.

## Gỡ cài đặt
```sh
dsh plugin --profile web remove dsh-ai-question-chime
# Khởi động lại dsh web
```

## Cấu trúc dự án
```
.
├── lib/
│   └── index.js          # Host entry (Node, ESM) — thân rỗng, chỉ khai báo tên
├── client/
│   └── client.js         # Client entry (browser, CJS self-register) — toàn bộ logic thật ở đây
├── cordis.patch.yml      # Bundle insert: bảo dsh mount plugin này vào web profile
├── package.json          # Khai báo dsh.bundle.patch + peer dependencies
├── scripts/
│   └── simulate-loader.mjs  # Stub của dsh client module loader, dùng để test client.js ở local
├── README.md             # File này (Tiếng Việt)
├── README.zh.md          # 简体中文
├── README.en.md          # English
├── LICENSE
└── .gitignore
```

> Ghi chú: nếu repo của bạn đặt README chính là tiếng Anh (`README.md` không có hậu tố), bạn có thể đổi tên file này thành `README.vi.md` và tạo thêm `README.en.md` cho tiếng Anh, hoặc ngược lại. GitHub sẽ tự nhận diện theo locale trình duyệt nếu bạn đặt tên đúng chuẩn.

## Cách hoạt động (kỹ thuật)

Mô hình plugin DSH
- Một DSH client plugin là một JavaScript module tự đăng ký qua `window.__ModuleLoader__.load({ id, factory })`. Factory nhận hàm `require` và trả về đối tượng `module.exports`.
- Hình dạng `module.exports` là `{ name, inject, apply(ctx) }`. `inject` khai báo các Host service mà plugin cần (`slots`, `locale`, `conversationEvents`); Cordis loader sẽ inject chúng trước khi gọi `apply`.
- `apply(ctx)` chạy đúng 1 lần khi plugin boot. Bên trong, bạn có thể:
  - Đăng ký chuỗi UI qua `ctx.locale.register(NS, { zh, en, vi })`.
  - Subscribe sự kiện hội thoại qua `ctx.get('conversationEvents').register({ kind, target, match, start, update, buildViewNode })`.
  - Inject trang settings qua `ctx.slots.inject('settings.section', …)`.
  - Đăng ký effect lâu dài (vd listener unlock audio) qua `ctx.effect(fn, label)`.

Logic kích hoạt bíp
- `match(event)` chạy cho mỗi sự kiện hội thoại phía client. Khi `event.type === 'assistant/message'`, nó trả về 1 match id (mỗi `event.seq` một id), loader sẽ gọi `update`.
- `update(context, match)` nhận payload sự kiện. Nó đọc `event.data.message`, chạy `isAssistantQuestion(msg)`, nếu true thì gọi `playChime(cfg.volume)`.
- `isAssistantQuestion(msg)` trả về true nếu:
  1. Message chứa tool call `ask_user_question` (duyệt sâu các content block), HOẶC
  2. Text của message chứa `?` hoặc `？` VÀ role là `assistant`.

Tổng hợp âm thanh
- `playChime(volume)` tạo `AudioContext` (lazy, lần gọi đầu tiên), rồi lên lịch 2 oscillator sine:
  - 988 Hz, bắt đầu tại `t=0`, dài 0.09 s.
  - 1319 Hz, bắt đầu tại `t=0.10`, dài 0.09 s.
- Mỗi oscillator đi qua 1 `GainNode` với attack mũ 12 ms và decay về im lặng. Âm lượng chính là `cfg.volume` (0–1).
- `AudioContext` được unlock lazy ở lần `pointerdown` / `keydown` đầu tiên (theo autoplay policy của Chromium).
- Cooldown 1200 ms (`BEEP_COOLDOWN_MS`) chặn bíp lặp khi AI gửi nhiều chunk liên tiếp.

## Phát triển
```sh
npm run check         # node --check cho lib/index.js và client/client.js
npm run test:loader   # chạy client.js trong sandbox __ModuleLoader__ stub
```

Script sandbox (`scripts/simulate-loader.mjs`) kiểm tra:
- `__ModuleLoader__.load` được gọi đúng 1 lần với `id` đúng.
- Factory trả về object exports có `name`, `inject` (bao gồm `slots`), `apply`.
- `apply(ctx)` chạy không ném exception trên stub context.
- `ctx.locale.register`, `ctx.get('conversationEvents').register`, `ctx.slots.inject` đều được gọi.

Nếu bạn sửa plugin, chạy 2 lệnh này trước khi commit. CI trên awesome-dsh-plugin chạy đúng check này.

## Chỉnh âm thanh

Mọi tham số âm thanh nằm ở đầu hàm `playChime` trong `client/client.js`. Một số tuỳ chỉnh thường gặp:

| Bạn muốn | Sửa |
|---|---|
| Cao hơn / thấp hơn | `const tones = [[988, 0], [1319, 0.10]];` — thử `[[659, 0], [880, 0.10]]` (thấp hơn) hoặc `[[1319, 0], [1760, 0.10]]` (cao hơn) |
| Bíp dài hơn | `const dur = 0.09;` → `0.15` |
| 3 nốt thay vì 2 | Thêm nốt thứ 3: `tones.push([2093, 0.20])` |
| Volume mặc định lớn hơn | `const DEFAULT_CFG = { enabled: true, volume: 0.4 };` |
| Không cooldown (bíp mỗi event) | `const BEEP_COOLDOWN_MS = 0;` |
| Sóng vuông / tam giác / răng cưa | `osc.type = 'sine';` → `'square'`, `'triangle'`, hoặc `'sawtooth'` |

Sau khi sửa, restart dsh web, không cần cài lại.

## Tương thích trình duyệt
- Chrome / Edge / Brave / Opera (Chromium 90+): hỗ trợ đầy đủ.
- Firefox 88+: hỗ trợ đầy đủ.
- Safari 14+: hỗ trợ đầy đủ (có fallback `webkitAudioContext` cho Safari cũ).

Plugin không dùng bất kỳ Web API thử nghiệm nào.

## Giới hạn đã biết
- Tab trình duyệt không được focus có thể throttle `AudioContext`. Nếu bạn chuyển tab khác trước khi AI hỏi, có thể lỡ tiếng bíp.
- Plugin không hoạt động khi trang bị tắt tiếng (tắt âm thanh hệ thống).
- Plugin chỉ thấy event `assistant/message` phía client. Nếu Host lọc hoặc viết lại message trước khi gửi, có thể sót một số câu hỏi.

## Phát hành bản cập nhật

1. Bump version trong `package.json` (theo [semver](https://semver.org/)).
2. Cập nhật changelog / README nếu cần.
3. Commit và push lên GitHub: `git push origin main`.
4. Publish lên npm: `npm publish`.
5. Người dùng đã cài qua dshmarket sẽ thấy badge "Có bản mới" ở tab **Updates** và update 1 cú click.

## Giấy phép
MIT
