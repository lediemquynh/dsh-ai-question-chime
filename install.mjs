#!/usr/bin/env node
// ============================================================================
// install.mjs — trình cài đặt mẫu cho ai-question-chime
//
// Market "Install" có thể gọi script này. Nó:
//   1) nếu preset <id> chưa tồn tại trong ~/.dsh/.agent-presets, tự động copy
//      preset có sẵn từ thư mục cài đặt dsh sang đó (KHÔNG sửa node_modules);
//   2) copy module plugin vào <presetDir>/plugins/ai-question-chime/;
//   3) append 1 dòng composition (loader entry) vào file composition của preset
//      (mặc định agent.cordis.yml) để plugin tự nạp mỗi khi mở dsh web.
//
// Dùng:  node install.mjs --preset cordis [--dsh-home <path>] [--composition agent.cordis.yml]
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = { preset: 'cordis', dshHome: process.env.DSH_HOME || '', composition: '' };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--preset') out.preset = argv[++i];
    else if (argv[i] === '--dsh-home') out.dshHome = argv[++i];
    else if (argv[i] === '--composition') out.composition = argv[++i];
  }
  if (!out.dshHome) out.dshHome = path.join(os.homedir(), '.dsh');
  return out;
}

function fail(msg) {
  console.error('✗ ' + msg);
  process.exit(1);
}

// --- định vị thư mục cài đặt dsh (chứa config/agent-presets) ----------------
function findDshInstall() {
  const candidates = [];
  try {
    const gRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
    if (gRoot) candidates.push(path.join(gRoot, '@deepseek-ai', 'dsh'));
  } catch { /* ignore */ }
  if (process.env.APPDATA) candidates.push(path.join(process.env.APPDATA, 'npm', 'node_modules', '@deepseek-ai', 'dsh'));
  candidates.push('C:\\Users\\Admin\\AppData\\Roaming\\npm\\node_modules\\@deepseek-ai\\dsh');
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'config', 'agent-presets'))) return c;
  }
  return null;
}

const args = parseArgs(process.argv);
const presetDir = path.join(args.dshHome, '.agent-presets', args.preset);

// --- bước 1: tự copy preset nếu thiếu --------------------------------------
if (!fs.existsSync(presetDir)) {
  const dshInstall = findDshInstall();
  const srcPreset = dshInstall && path.join(dshInstall, 'config', 'agent-presets', args.preset);
  if (!dshInstall || !fs.existsSync(srcPreset)) {
    fail(
      `Không tìm thấy preset "${args.preset}" tại:\n  ${presetDir}\n` +
      `và cũng không tự định vị được bản cài đặt dsh để copy.\n` +
      `Hãy copy preset có sẵn (vd. từ thư mục cài đặt dsh) vào .agent-presets/<id>/ thủ công, ` +
      `rồi chạy lại. TUYỆT ĐỐI không sửa preset gốc trong node_modules.`
    );
  }
  fs.mkdirSync(path.dirname(presetDir), { recursive: true });
  fs.cpSync(srcPreset, presetDir, { recursive: true });
  console.log(`  + đã copy preset "${args.preset}" từ bản cài đặt dsh vào ${presetDir}`);
}

// --- bước 2: xác định file composition của preset ---------------------------
const candidates = [];
if (args.composition) candidates.push(args.composition);
candidates.push('agent.cordis.yml', 'cordis.yml', `${args.preset}.cordis.yml`);
const compFile = candidates.map((c) => path.join(presetDir, c)).find((p) => fs.existsSync(p));
if (!compFile) {
  fail(
    `Không thấy file composition (*.cordis.yml) trong ${presetDir}.\n` +
    `Hãy chỉ rõ bằng --composition <tên file>.`
  );
}

// --- bước 3: copy module plugin ---------------------------------------------
const destDir = path.join(presetDir, 'plugins', 'ai-question-chime');
fs.mkdirSync(destDir, { recursive: true });

const rowId = 'ai-question-chime';
const rowName = './plugins/ai-question-chime/index.js';
const copyFiles = ['index.js', 'code.client.js', 'plugin.json', 'package.json'];

for (const f of copyFiles) {
  const src = path.join(here, f);
  if (!fs.existsSync(src)) continue;
  fs.copyFileSync(src, path.join(destDir, f));
  console.log('  + ' + path.join('plugins', 'ai-question-chime', f));
}

// --- bước 4: gắn dòng composition -------------------------------------------
const block =
  `- id: ${rowId}\n` +
  `  name: ${rowName}\n` +
  `  config: {}\n`;

let body = fs.readFileSync(compFile, 'utf8');
if (body.includes(`id: ${rowId}`)) {
  console.log(`• "${rowId}" đã có trong ${path.basename(compFile)} — bỏ qua.`);
} else {
  if (body.length && !body.endsWith('\n')) body += '\n';
  if (body.length) body += '\n';
  body += block;
  fs.writeFileSync(compFile, body, 'utf8');
  console.log('  + appended composition row vào ' + path.basename(compFile));
}

console.log(`\n✓ Đã cài ai-question-chime vào preset "${args.preset}".`);
console.log(`  Khởi động lại dsh web với preset "${args.preset}" để plugin tự nạp.`);
console.log(`  (Để gỡ: xoá thư mục plugins/ai-question-chime và dòng "${rowId}" trong ${path.basename(compFile)})`);
