// tools/make-manifest.mjs — สร้าง files.json (รายการไฟล์เว็บของแอพ + sha1) ให้ ota.js ใช้อัปเดตแอพจาก GitHub Pages
// ใช้: node tools/make-manifest.mjs        (เขียน files.json)   ·   node tools/make-manifest.mjs --check  (ตรวจว่าตรงกับไฟล์จริง)
// bump-version.mjs เรียกให้เอง · ไฟล์ไหนอยู่ในรายการ = ไฟล์เว็บที่แอพต้องใช้ (ไม่รวม tests/tools/.github/*.md/*.mjs/*.py/files.json)
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['.git', '.github', 'tests', 'tools', 'wrap', 'node_modules']);
const SKIP_FILE = /(^|\/)(\.nojekyll|\.gitignore|files\.json)$|\.(md|mjs|py|keystore)$/;
const sha1 = (buf) => createHash('sha1').update(buf).digest('hex');

function walk(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name), rel = relative(ROOT, p).split('\\').join('/');
    if (statSync(p).isDirectory()) { if (!SKIP_DIRS.has(name)) walk(p, out); continue; }
    if (!SKIP_FILE.test(rel)) out.push(rel);
  }
  return out;
}

export function buildManifest() {
  const files = walk(ROOT).map((p) => { const buf = readFileSync(join(ROOT, p)); return { p, h: sha1(buf), s: buf.length }; });
  const ver = /var VERSION = "([\w.]+)"/.exec(readFileSync(join(ROOT, 'version.js'), 'utf-8'));
  const id = sha1(files.map((f) => f.p + ':' + f.h).join('\n'));
  return { id, version: ver ? ver[1] : '', files };
}
export function writeManifest() { const m = buildManifest(); writeFileSync(join(ROOT, 'files.json'), JSON.stringify(m) + '\n'); return m; }
export function manifestFresh() {
  const f = join(ROOT, 'files.json'); if (!existsSync(f)) return false;
  try { return JSON.parse(readFileSync(f, 'utf-8')).id === buildManifest().id; } catch { return false; }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv[2] === '--check') {
    if (manifestFresh()) console.log('files.json ตรงกับไฟล์จริง');
    else { console.error('files.json ไม่ตรงกับไฟล์จริง รัน: node tools/make-manifest.mjs'); process.exit(1); }
  } else { const m = writeManifest(); console.log(`สร้าง files.json: v${m.version} · ${m.files.length} ไฟล์ · id ${m.id.slice(0, 8)}`); }
}
