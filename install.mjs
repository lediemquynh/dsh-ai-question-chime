#!/usr/bin/env node
// ============================================================================
// install.mjs — trình cài đặt mẫu cho ai-question-chime
//
// Market "Install" có thể gọi script này. Nó:
//   1) copy module plugin vào <presetDir>/plugins/ai-question-chime/
//   2) append 1 dòng composition (loader entry) vào file composition của preset
//      (mặc định agent.cordis.yml; đổi bằng --composition nếu preset khác)
//      để plugin tự nạp mỗi khi mở dsh web với preset đó.
//
// Dùng:  node install.mjs --preset cordis [--dsh-home <path>] [--composition agent.cordis.yml]
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
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

const args = parseArgs(process.argv);
const presetDir = path.join(args.dshHome, '.agent-presets', args.preset);

if (!fs.existsSync(presetDir)) {
  fail(
    `Không tìm thấy preset "${args.preset}" tại:\n  ${presetDir}\n` +
    `Hãy copy preset có sẵn (vd. từ thư mục cài đặt dsh) vào .agent-presets/<id>/ ` +
    `rồi chạy lại với --preset <id>. TUYỆT ĐỐI không sửa preset gốc trong node_modules.`
  );
}

// --- xác định file composition của preset -----------------------------------
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

// --- gắn dòng composition ----------------------------------------------------
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
console.log(`  Khởi động dsh web với preset "${args.preset}" để plugin tự nạp.`);
console.log(`  (Để gỡ: xoá thư mục plugins/ai-question-chime và dòng "${rowId}" trong ${path.basename(compFile)})`);
