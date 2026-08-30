# dsh-ai-question-chime

当 AI 询问澄清性问题时，播放一个简短的提示音，让你不会错过并能及时回答。为 [DeepSeek Harness](https://github.com/deepseek-ai)（DSH）设计。

- 🔔 **两种检测方式** —— 助手消息中包含 `?` / `？`，或调用 `ask_user_question` 工具（DSH 标准的澄清工具）。
- 🎵 **Web Audio API 合成** —— 无需音频文件，所有操作系统通用（Windows / macOS / Linux）。
- ⚙️ **设置页** —— `设置 ⚙️ → AI 提问提示音`。开关、调整音量、试听。设置保存在 `localStorage`。
- 🪶 **零系统依赖** —— 不调用 shell、不依赖系统通知、无需特殊权限。
- 🚀 **所有预设通用** —— 安装后任何 session 都生效（无需切换预设）。
- 🌐 **本地化** —— English / 简体中文 / Tiếng Việt。设置项和文档与 UI 语言一致。

> 架构参考了 [`kaixinbaba/dsh-complete-notify`](https://github.com/kaixinbaba/dsh-complete-notify)。感谢分享标准的 DSH 插件布局。

[English](README.md) · [简体中文](README.zh.md) · [Tiếng Việt](README.vi.md)

## 安装

### 方式 1 —— 从 npm 安装（推荐）
```sh
# 全局安装（或让 dsh plugin 帮你管理）
npm install -g dsh-ai-question-chime
# 注册到 web profile
dsh plugin --profile web add dsh-ai-question-chime
# 重启 dsh web 生效
# macOS launchd:
launchctl kickstart -k gui/$(id -u)/com.dsh.dsh-web
# 否则手动停止并重启 dsh web
```

### 方式 2 —— 从 GitHub 安装（无需 npm 账号）
```sh
dsh plugin --profile web add "github:lediemquynh/dsh-ai-question-chime"
# 重启 dsh web
```

### 方式 3 —— 本地 link（开发用）
```sh
dsh plugin --profile web add link:/path/to/dsh-ai-question-chime
# 改代码 → 重启 dsh web → 立即生效（无需重新安装）
```

## 使用

1. 在 dsh web 中打开任意 session（任意预设）。
2. 当 AI 询问澄清性问题（消息中带 `?` 或调用 `ask_user_question` 工具）→ 你会听到一个 2 音上升的提示音（988 Hz → 1319 Hz，约 0.2 秒）。
3. **设置 ⚙️ → AI 提问提示音**（或对应语言的标签）可以：
   - 开关提示音
   - 调整音量（滑块，0–100%）
   - 点击 **测试提示音** 试听
4. 在 **设置 → 插件 → 插件列表** 中，你会看到 `dsh-ai-question-chime` 的卡片，状态为 **已挂载 / Mounted**。

### 注意
- 浏览器在首次加载时会阻止自动播放。在 dsh 中发送 **第一条消息** 即可自然解锁 `AudioContext`（任何点击或按键也可以）。
- 插件仅在 dsh 标签页打开时运行 —— 这是 Web Audio 的一般限制，不是 bug。关闭标签页后将不会播放提示音。
- 如果你在多个浏览器标签页中打开 dsh，每个标签页都会独立运行插件 —— 它们不共享状态。

## 卸载
```sh
dsh plugin --profile web remove dsh-ai-question-chime
# 重启 dsh web
```

## 项目结构
```
.
├── lib/
│   └── index.js          # Host 入口（Node, ESM）—— 空实现，仅声明名称
├── client/
│   └── client.js         # Client 入口（浏览器, CJS 自注册）—— 所有真实逻辑都在这里
├── cordis.patch.yml      # Bundle insert：告诉 dsh 将此插件挂载到 web profile
├── package.json          # 声明 dsh.bundle.patch 和 peer dependencies
├── scripts/
│   └── simulate-loader.mjs  # dsh client module loader 的桩，用于本地测试 client.js
├── README.md             # 英文
├── README.zh.md          # 简体中文（本文件）
├── README.vi.md          # Tiếng Việt
├── LICENSE
└── .gitignore
```

## 工作原理（技术细节）

DSH 插件模型
- DSH client 插件是一个 JavaScript 模块，通过 `window.__ModuleLoader__.load({ id, factory })` 注册自身。factory 接收 `require` 函数，返回 `module.exports` 对象。
- `module.exports` 的形状是 `{ name, inject, apply(ctx) }`。`inject` 声明插件需要的 Host 服务（`slots`、`locale`、`conversationEvents`）；Cordis loader 在调用 `apply` 前会注入它们。
- `apply(ctx)` 在插件启动时执行一次。内部可以：
  - 通过 `ctx.locale.register(NS, { zh, en, vi })` 注册 UI 字符串。
  - 通过 `ctx.get('conversationEvents').register({ kind, target, match, start, update, buildViewNode })` 订阅对话事件。
  - 通过 `ctx.slots.inject('settings.section', …)` 注入设置页。
  - 通过 `ctx.effect(fn, label)` 设置持久化效果（如音频解锁监听）。

提示音触发逻辑
- `match(event)` 对每个客户端对话事件运行。当 `event.type === 'assistant/message'` 时，返回一个匹配 id（每个 `event.seq` 一个），loader 会调用 `update`。
- `update(context, match)` 接收事件负载。它读取 `event.data.message`，运行 `isAssistantQuestion(msg)`，如果为真，调用 `playChime(cfg.volume)`。
- `isAssistantQuestion(msg)` 在以下情况返回 true：
  1. 消息包含 `ask_user_question` 工具调用（深度遍历内容块），或
  2. 消息文本包含 `?` 或 `？` 且消息角色是 `assistant`。

声音合成
- `playChime(volume)` 懒加载创建 `AudioContext`（首次调用时），然后调度两个正弦波振荡器：
  - 988 Hz，在 `t=0` 启动，时长 0.09 秒。
  - 1319 Hz，在 `t=0.10` 启动，时长 0.09 秒。
- 每个振荡器经过一个 `GainNode`，使用指数包络：12 ms 攻击，衰减到静音。主音量为 `cfg.volume`（0–1）。
- `AudioContext` 在首次 `pointerdown` / `keydown` 时懒解锁，以符合 Chromium 自动播放策略。
- 1200 ms 冷却时间（`BEEP_COOLDOWN_MS`）防止 AI 快速连续发送多个块时重复播放。

## 开发
```sh
npm run check         # node --check 检查 lib/index.js 和 client/client.js
npm run test:loader   # 在沙箱化的 __ModuleLoader__ 桩中执行 client.js
```

沙箱脚本（`scripts/simulate-loader.mjs`）会验证：
- `__ModuleLoader__.load` 被调用恰好一次，传入正确的 `id`。
- factory 返回的 exports 对象包含 `name`、`inject`（含 `slots`）、`apply`。
- `apply(ctx)` 在桩上下文上运行不抛异常。
- `ctx.locale.register`、`ctx.get('conversationEvents').register`、`ctx.slots.inject` 均被调用。

如果你修改了插件，提交前运行这两个命令。awesome-dsh-plugin 上的 CI 会运行相同的检查。

## 调整声音

所有音频参数都在 `client/client.js` 的 `playChime` 函数顶部。常见调整：

| 你想要的效果 | 修改 |
|---|---|
| 更高/更低的音调 | `const tones = [[988, 0], [1319, 0.10]];` —— 尝试 `[[659, 0], [880, 0.10]]`（更低）或 `[[1319, 0], [1760, 0.10]]`（更高） |
| 更长的提示音 | `const dur = 0.09;` → `0.15` |
| 三个音而不是两个 | 添加第三个音：`tones.push([2093, 0.20])` |
| 更大的默认音量 | `const DEFAULT_CFG = { enabled: true, volume: 0.4 };` |
| 没有冷却（每个事件都响） | `const BEEP_COOLDOWN_MS = 0;` |
| 方波/三角波/锯齿波 | `osc.type = 'sine';` → `'square'`、`'triangle'` 或 `'sawtooth'` |

修改后重启 dsh web，无需重新安装。

## 浏览器兼容性
- Chrome / Edge / Brave / Opera（Chromium 90+）：完全支持。
- Firefox 88+：完全支持。
- Safari 14+：完全支持（旧版 Safari 包含 `webkitAudioContext` 回退）。

插件不使用任何实验性 Web API。

## 已知限制
- 未聚焦的浏览器标签页可能会限制 `AudioContext`。如果在 AI 提问前切换离开 dsh，你可能会错过提示音。
- 当浏览器页面被静音（系统级别音频关闭）时，插件不工作。
- 插件只能看到客户端的 `assistant/message` 事件。如果 Host 端在发送前过滤或重写了消息，检测可能会遗漏一些问题。

## 发布更新

1. 在 `package.json` 中增加版本号（遵循 [semver](https://semver.org/)）。
2. 必要时更新 changelog / README。
3. 提交并推送到 GitHub：`git push origin main`。
4. 发布到 npm：`npm publish`。
5. 已经通过 dshmarket 安装的用户会在 **更新** 标签页看到"有新版本可用"徽章，一键更新。

## 许可证
MIT
