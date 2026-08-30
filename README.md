# dsh-ai-question-chime

Phát tiếng "bíp" khi AI (trong [DeepSeek Harness](https://github.com/deepseek-ai)) hỏi lại người dùng để làm rõ tình huống.

- 🎵 Âm thanh do **Web Audio API** tổng hợp — không cần file âm thanh, hoạt động mọi OS (Windows / macOS / Linux).
- 🔔 Phát hiện **2 cách**: dấu `?` / `？` trong tin nhắn assistant, **hoặc** assistant gọi tool `ask_user_question` (chuẩn của dsh).
- ⚙️ Có trang **Settings → AI Question Chime** — bật/tắt, chỉnh âm lượng, thử âm thanh.
- 💾 Cài đặt lưu vào `localStorage` (`dsh.aiQuestionChime.v1`).
- 🪶 Không phụ thuộc OS notification, không gọi shell, không cần quyền đặc biệt.
- 🚀 Hoạt động ở **mọi preset** (cài qua `dsh plugin --profile web add …`).

> Pattern tham khảo từ [`kaixinbaba/dsh-complete-notify`](https://github.com/kaixinbaba/dsh-complete-notify). Cảm ơn tác giả đã chia sẻ kiến trúc plugin chuẩn DSH.

## Cài đặt

### Cách 1 — Từ npm (khuyên dùng)
```sh
# Cài global (hoặc dùng dsh plugin tự quản lý)
npm install -g dsh-ai-question-chime
# Đăng ký vào profile web
dsh plugin --profile web add dsh-ai-question-chime
# Khởi động lại dsh web
# macOS launchd:
launchctl kickstart -k gui/$(id -u)/com.dsh.dsh-web
# hoặc tắt/mở dsh web thủ công nếu không dùng launchd
```

### Cách 2 — Từ GitHub (không cần npm)
```sh
dsh plugin --profile web add "github:<your-username>/dsh-ai-question-chime"
# Khởi động lại dsh web
```

### Cách 3 — Phát triển local (link tới thư mục code)
```sh
dsh plugin --profile web add link:/path/to/dsh-ai-question-chime
# Sửa code → restart dsh web là có hiệu lực (không cần cài lại)
```

## Sử dụng

1. Mở bất kỳ session nào trong dsh web (preset nào cũng được).
2. Khi AI hỏi lại bạn một câu hỏi (có `?` hoặc dùng `ask_user_question`) → bạn nghe tiếng "bíp" 2 nốt.
3. **Settings ⚙️ → AI Question Chime** (hoặc tiếng Trung ở UI gốc) để bật/tắt tiếng, chỉnh âm lượng, bấm **Test chime** nghe thử.
4. Trong tab **Plugins → Plugin list** (插件列表) sẽ thấy card `dsh-ai-question-chime` với trạng thái **Mounted / 已挂载**.

### Lưu ý
- Trình duyệt chặn autoplay lần đầu; bạn **gửi tin nhắn đầu tiên** trong dsh là đủ để mở khóa `AudioContext` (mọi click/keystroke cũng unlock).
- Plugin **chỉ chạy trong tab dsh đang mở** (giới hạn của Web Audio + Web Notification). Đóng tab thì không nghe được — đây là giới hạn chung của mọi plugin âm thanh trình duyệt, không phải lỗi.

## Gỡ cài đặt
```sh
dsh plugin --profile web remove dsh-ai-question-chime
# Khởi động lại dsh web
```

## Cấu trúc
```
.
├── lib/
│   └── index.js          # Host entry (Node, ESM) — không cần logic, chỉ khai báo tên
├── client/
│   └── client.js         # Client entry (browser, CJS self-register) — toàn bộ logic
├── cordis.patch.yml      # Bundle insert: ghi vào profiles/web/cordis.yml
├── package.json          # Khai báo dsh.bundle.patch
├── scripts/
│   └── simulate-loader.mjs  # Stub dsh client loader, chạy client.js để kiểm thử
├── README.md
└── LICENSE
```

## Phát triển
```sh
npm run check           # node --check cho lib/index.js và client/client.js
npm run test:loader     # chạy client.js trong sandbox giả lập __ModuleLoader__
```

Pattern được mô phỏng lại từ dsh-complete-notify. Plugin này đơn giản hơn (chỉ phát tiếng, không có toast / recap / system notification).

## License
MIT
