# dsh-ai-question-chime

Plays a small chime when the AI asks the user a clarifying question, so you don't miss it and can answer promptly. Built for [DeepSeek Harness](https://github.com/deepseek-ai) (DSH).

- 🔔 **Two detection paths** — either a `?` / `？` character in the assistant's message, or an `ask_user_question` tool call (the standard DSH tool for clarification).
- 🎵 **Web Audio API synthesis** — no audio files, works on every OS (Windows / macOS / Linux).
- ⚙️ **Settings page** — `Settings ⚙️ → AI Question Chime`. Toggle on/off, adjust volume, test the sound. Persists in `localStorage`.
- 🪶 **Zero system dependencies** — no shell, no native notifications, no special permissions.
- 🚀 **Works in every preset** — once installed, it runs in any session (no need to switch presets).
- 🌐 **Localized** — English / 简体中文 / Tiếng Việt. Settings and documentation all match the UI locale.

> Architectural pattern inspired by [`kaixinbaba/dsh-complete-notify`](https://github.com/kaixinbaba/dsh-complete-notify). Thanks for sharing the standard DSH plugin layout.

[English](README.md) · [简体中文](README.zh.md) · [Tiếng Việt](README.vi.md)

## Installation

### Option 1 — From npm (recommended)
```sh
# Global install (or let dsh plugin manage it for you)
npm install -g dsh-ai-question-chime
# Register into the web profile
dsh plugin --profile web add dsh-ai-question-chime
# Restart dsh web to apply
# macOS launchd:
launchctl kickstart -k gui/$(id -u)/com.dsh.dsh-web
# Otherwise just stop and start dsh web manually
```

### Option 2 — From GitHub (no npm account needed)
```sh
dsh plugin --profile web add "github:lediemquynh/dsh-ai-question-chime"
# Restart dsh web
```

### Option 3 — Local link (for development)
```sh
dsh plugin --profile web add link:/path/to/dsh-ai-question-chime
# Edit code → restart dsh web → changes take effect (no reinstall needed)
```

## Usage

1. Open any session in dsh web (any preset).
2. When the AI asks you a clarifying question (a `?` in the message, or an `ask_user_question` tool call) → you'll hear a 2-note ascending chime (988 Hz → 1319 Hz, ≈0.2 s total).
3. **Settings ⚙️ → AI Question Chime** (or its localized label) lets you:
   - Enable / disable the chime
   - Adjust the volume (slider, 0–100 %)
   - Click **Test chime** to preview the sound
4. In **Settings → Plugins → Plugin list** (插件列表), you'll see a card for `dsh-ai-question-chime` showing **Mounted / 已挂载**.

### Notes
- Browsers block autoplay on the first load. Sending your **first message** in dsh naturally unlocks `AudioContext` (any click or keypress also works).
- The plugin only runs while the dsh tab is open — this is a general limitation of Web Audio, not a bug. If you close the tab, the chime won't play.
- If you use multiple browser tabs of dsh, each tab runs its own copy of the chime — they don't share state.

## Uninstall
```sh
dsh plugin --profile web remove dsh-ai-question-chime
# Restart dsh web
```

## Project layout
```
.
├── lib/
│   └── index.js          # Host entry (Node, ESM) — empty body, just declares the name
├── client/
│   └── client.js         # Client entry (browser, CJS self-register) — all real logic lives here
├── cordis.patch.yml      # Bundle insert: tells dsh to mount this plugin into the web profile
├── package.json          # Declares dsh.bundle.patch + peer dependencies
├── scripts/
│   └── simulate-loader.mjs  # Stub of the dsh client module loader, used to test client.js locally
├── README.md             # This file (English)
├── README.zh.md          # 简体中文
├── README.vi.md          # Tiếng Việt
├── LICENSE
└── .gitignore
```

## How it works (technical)

DSH plugin model
- A DSH client plugin is a JavaScript module that registers itself with `window.__ModuleLoader__.load({ id, factory })`. The factory receives a `require` function and returns a `module.exports` object.
- The `module.exports` shape is `{ name, inject, apply(ctx) }`. `inject` declares which Host services the plugin needs (`slots`, `locale`, `conversationEvents`); the Cordis loader injects them before calling `apply`.
- `apply(ctx)` runs once at plugin boot. Inside, you can:
  - Register UI strings via `ctx.locale.register(NS, { zh, en, vi })`.
  - Subscribe to conversation events via `ctx.get('conversationEvents').register({ kind, target, match, start, update, buildViewNode })`.
  - Inject settings pages via `ctx.slots.inject('settings.section', …)`.
  - Set up persistent effects (e.g. audio unlock listeners) via `ctx.effect(fn, label)`.

Chime trigger logic
- `match(event)` runs for every client-side conversation event. When `event.type === 'assistant/message'`, it returns a match id (one per `event.seq`) so the loader calls `update`.
- `update(context, match)` receives the event payload. It reads `event.data.message`, runs `isAssistantQuestion(msg)`, and if true, calls `playChime(cfg.volume)`.
- `isAssistantQuestion(msg)` returns true if:
  1. The message contains a `ask_user_question` tool call (deep walk through content blocks), OR
  2. The message text contains `?` or `？` AND the message role is `assistant`.

Sound synthesis
- `playChime(volume)` creates an `AudioContext` (lazily, on first call), then schedules two sine-wave oscillators:
  - 988 Hz, starts at `t=0`, duration 0.09 s.
  - 1319 Hz, starts at `t=0.10`, duration 0.09 s.
- Each oscillator goes through a `GainNode` with exponential attack (12 ms) and decay to silence. Master volume is `cfg.volume` (0–1).
- `AudioContext` is unlocked lazily on the first `pointerdown` / `keydown` to comply with Chromium's autoplay policy.
- A 1200 ms cooldown (`BEEP_COOLDOWN_MS`) prevents repeated chimes when the AI sends multiple chunks in quick succession.

## Development
```sh
npm run check         # node --check for both lib/index.js and client/client.js
npm run test:loader   # evaluate client.js in a sandboxed __ModuleLoader__ stub
```

The sandbox script (`scripts/simulate-loader.mjs`) verifies:
- `__ModuleLoader__.load` is called exactly once with the right `id`.
- The factory returns an exports object with `name`, `inject` (including `slots`), and `apply`.
- `apply(ctx)` runs without throwing on a stub context.
- `ctx.locale.register`, `ctx.get('conversationEvents').register`, and `ctx.slots.inject` are all invoked.

If you change the plugin, run both commands before committing. CI on awesome-dsh-plugin runs the same checks.

## Tuning the sound

All audio parameters live in `client/client.js` at the top of the `playChime` function. Common tweaks:

| What you want | Change |
|---|---|
| Higher / lower pitch | `const tones = [[988, 0], [1319, 0.10]];` — try `[[659, 0], [880, 0.10]]` (lower) or `[[1319, 0], [1760, 0.10]]` (higher) |
| Longer chime | `const dur = 0.09;` → `0.15` |
| Three notes instead of two | Add a third tone: `tones.push([2093, 0.20])` |
| Louder default | `const DEFAULT_CFG = { enabled: true, volume: 0.4 };` |
| No cooldown (chime on every event) | `const BEEP_COOLDOWN_MS = 0;` |
| Square / triangle / sawtooth wave | `osc.type = 'sine';` → `'square'`, `'triangle'`, or `'sawtooth'` |

After editing, restart dsh web. There's no need to reinstall.

## Browser compatibility
- Chrome / Edge / Brave / Opera (Chromium 90+): full support.
- Firefox 88+: full support.
- Safari 14+: full support (note: `webkitAudioContext` fallback included for older Safari).

The plugin does not use any experimental Web APIs.

## Known limitations
- Browser tabs that are not focused may throttle `AudioContext`. If you switch away from dsh before the AI asks, you might miss the chime.
- The plugin does not work in browsers where the page is muted (system-level audio off).
- The plugin only sees client-side `assistant/message` events. If the Host side filters or rewrites messages before sending, the detection might miss some questions.

## Publishing updates

1. Bump the version in `package.json` (follow [semver](https://semver.org/)).
2. Update the changelog / README if relevant.
3. Commit and push to GitHub: `git push origin main`.
4. Publish to npm: `npm publish`.
5. Users who already installed via dshmarket will see an "Update available" badge in the **Updates** tab and can update with one click.

## License
MIT
