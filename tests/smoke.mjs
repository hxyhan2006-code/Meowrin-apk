// tests/smoke.mjs — ทดสอบเร็วก่อน push: เปิดทั้ง 3 หน้าในเบราว์เซอร์จำลองกว้าง 380px แล้วเช็กว่าไม่พัง
// รัน: node tests/smoke.mjs   (ต้องมี Playwright · เครื่อง cloud มีติดตั้งไว้แล้ว) ไม่เรียก API จริง ไม่เสียเงิน
// เช็ก: เลขรุ่นตรงกัน · เทสต์ของ sub ผ่าน · ชื่อไอคอนที่เรียกมีครบ · ไม่มี confirm/alert/prompt ของเบราว์เซอร์ ·
//       แต่ละหน้าโหลดได้ไม่มี error/ไฟล์หาย/หน้าล้นจอ/อีโมจิหรือสัญลักษณ์ ★✓▶ ค้างบนจอ · เลขรุ่นท้ายตั้งค่าตรง version.js ·
//       เสียงที่เก็บไว้ (เล่น/หยุดตอนปิด ความยาว) · ลิงก์ ?voice= ของหน้าซับและหน้าฟุตเทจ
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log((ok ? 'ผ่าน  ' : 'ไม่ผ่าน') + ' ' + name + (ok || !detail ? '' : '\n         ' + detail)); };
const sh = (cmd, cwd = ROOT) => { try { return { ok: true, out: execSync(cmd, { cwd, stdio: 'pipe' }).toString() }; } catch (e) { return { ok: false, out: String(e.stdout || '') + String(e.stderr || '') }; } };
const files = (dir, ext) => readdirSync(join(ROOT, dir)).filter((f) => f.endsWith(ext)).map((f) => join(dir, f));
const text = (f) => readFileSync(join(ROOT, f), 'utf-8');

// ---------- เช็กไฟล์ (ไม่ต้องเปิดเบราว์เซอร์) ----------
let r = sh('node bump-version.mjs --check'); check('เลขรุ่นตรงกันทุกจุด (bump-version --check)', r.ok, r.out);
r = sh('node ai.test.mjs', join(ROOT, 'sub')); check('เทสต์ sub/ai.test.mjs', r.ok, r.out.slice(-400));
r = sh('node aligner.energy.test.mjs', join(ROOT, 'sub')); check('เทสต์ sub/aligner.energy.test.mjs', r.ok, r.out.slice(-400));
for (const f of [...files('.', '.js'), ...files('sub', '.js')]) { const t = text(f); try { new Function(t.replace(/^\s*import .*$/gm, '').replace(/\bexport\s+/g, '').replace(/\bawait\b/g, '')); } catch (e) { if (!/await|import|export/.test(String(e))) check('syntax ' + f, false, String(e)); } }
const jsAll = [...files('.', '.js'), ...files('sub', '.js')];
const defined = new Set([...text('icons.js').matchAll(/^\s{4}([a-z]+):\s*'/gm)].map((m) => m[1]));
const used = new Set(); const subUsed = new Set();
for (const f of [...jsAll.filter((x) => !x.startsWith('sub')), 'index.html', 'footage.html']) for (const m of text(f).matchAll(/MWIcon\("([a-z]+)"\)|#i-([a-z]+)/g)) used.add(m[1] || m[2]);
const subSyms = new Set([...text('sub/index.html').matchAll(/<symbol id="i-([a-z]+)"/g)].map((m) => m[1]));
for (const f of ['sub/index.html', ...files('sub', '.js')]) for (const m of text(f).matchAll(/#i-([a-z]+)/g)) subUsed.add(m[1]);
const missing = [...used].filter((n) => !defined.has(n)); const subMissing = [...subUsed].filter((n) => !subSyms.has(n));
check('ชื่อไอคอนที่เรียกใช้มีครบ (icons.js + sprite ของ sub)', !missing.length && !subMissing.length, 'ขาด: ' + [...missing, ...subMissing].join(', '));
// ไอคอนแอพ: ทุกไฟล์ใน manifest.json ต้องมีจริงและเป็น PNG ขนาดตรงที่ประกาศไว้
const man = JSON.parse(text('manifest.json')); const badIcons = [];
for (const ic of man.icons) { try { const b = readFileSync(join(ROOT, ic.src.split('?')[0])); const w = b.readUInt32BE(16), h = b.readUInt32BE(20); if (b.toString('latin1', 1, 4) !== 'PNG' || `${w}x${h}` !== ic.sizes) badIcons.push(ic.src + ' ขนาด ' + w + 'x' + h); } catch { badIcons.push(ic.src + ' ไม่มีไฟล์'); } }
check('ไอคอนแอพใน manifest.json มีจริงและขนาดตรง', !badIcons.length, badIcons.join(', '));
const dialogs = [];
for (const f of jsAll.filter((x) => x !== 'dialog.js')) text(f).split('\n').forEach((l, i) => { if (/window\.(confirm|alert|prompt)\b|(?<![.\w])(alert|confirm)\(/.test(l)) dialogs.push(f + ':' + (i + 1)); });
check('ไม่มี confirm/alert/prompt ของเบราว์เซอร์ (ใช้ MWDialog)', !dialogs.length, dialogs.join(', '));

// ---------- เปิดหน้าในเบราว์เซอร์ ----------
let pw;
try { pw = await import('playwright'); } catch { pw = createRequire(import.meta.url)(join(execSync('npm root -g').toString().trim(), 'playwright')); }
const chromium = pw.chromium || pw.default?.chromium;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer((req, res) => { let p = join(ROOT, decodeURIComponent(req.url.split('?')[0])); if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html'); if (!existsSync(p)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); res.end(readFileSync(p)); });
await new Promise((ok) => server.listen(0, ok)); const base = 'http://localhost:' + server.address().port;
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ viewport: { width: 380, height: 820 } }); // ทุกหน้าใช้ที่เก็บข้อมูลเดียวกัน (เสียงที่เซ็ตไว้ในหน้าหลักเห็นในหน้าอื่น)
const GLYPH = /[\u{1F300}-\u{1FAFF}⚠✂⚙⏹⏳☁⬇★☆✓✗✕▶❚]/u;
const wavBlobJs = `(n, sr) => { const buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf); const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0))); w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true); for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin(i / 10) * 8000, true); return new Blob([buf], { type: 'audio/wav' }); }`;
async function open(path, name) {
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push('error: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_|net::|accounts\.google|youtube|ytimg/.test(m.text())) problems.push('console: ' + m.text()); });
  page.on('response', (x) => { if (x.url().startsWith(base) && x.status() >= 400) problems.push(x.status() + ' ' + x.url()); });
  await page.addInitScript(() => { window.__auds = []; const op = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { window.__auds.push(this); return op.call(this); }; });
  await page.goto(base + path); await page.waitForTimeout(2200);
  return { page, problems, name };
}
async function finishPage(p) {
  const over = await p.page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  const glyph = await p.page.evaluate((re) => (document.body.innerText.match(new RegExp(re, 'gu')) || []).join(''), GLYPH.source);
  check(`${p.name}: โหลดได้ ไม่มี error/ไฟล์หาย`, !p.problems.length, p.problems.join('\n         '));
  check(`${p.name}: หน้าไม่ล้นจอ`, !over);
  check(`${p.name}: ไม่มีอีโมจิ/สัญลักษณ์ตัวอักษรบนจอ`, !glyph, 'เจอ: ' + glyph);
}
try {
  // หน้าหลัก
  const main = await open('/index.html', 'หน้าหลัก');
  await main.page.click('nav [data-tab=settings]'); await main.page.waitForTimeout(300);
  const label = await main.page.textContent('#appVersion'); const ver = /var VERSION = "([\w.]+)"/.exec(text('version.js'))[1];
  check('ท้ายตั้งค่าโชว์เลขรุ่นตรง version.js', label === 'Meowrin factory v' + ver, `ได้ "${label}"`);
  await main.page.evaluate(`(async () => { const mk = ${wavBlobJs}; await MWVoice.put({ id: 1700000000001, text: 'บทของเทคนี้', name: 'take.mp3', blob: mk(80000, 8000) }); })()`);
  await main.page.reload(); await main.page.waitForTimeout(2000);
  await main.page.click('nav [data-tab=voice]'); await main.page.click('#vSavedBtn'); await main.page.waitForTimeout(1500);
  check('เสียงที่เก็บไว้: การ์ดขึ้นพร้อมความยาว', /0:00 \/ 0:\d\d/.test(await main.page.textContent('.vtime')));
  await main.page.click('#vSavedList .vplay'); await main.page.waitForTimeout(600);
  const playing = await main.page.evaluate(() => window.__auds.some((a) => !a.paused));
  await main.page.click('#vSavedClose'); await main.page.waitForTimeout(300);
  // เสียงที่เก็บไว้: ไม่มีของคลัง R2 เหลือ (ไม่มีส่วน "อยู่ในคลัง" / ปุ่มอัปขึ้นคลัง / ดึงมาเครื่องนี้) · ปุ่มดาวน์โหลดในแอพบันทึกผ่าน MWNative (ไม่ใช้ <a download> ที่ในแอพไม่เซฟ)
  await main.page.click('#vSavedBtn'); await main.page.waitForTimeout(800);
  const svr = await main.page.evaluate(() => ({ cloudLeft: !!document.querySelector('#vSavedCloud, [data-vup], [data-vpull], [data-vdelc]'), hasDl: !!document.querySelector('#vSavedList a[data-vdl]'), api: ['cloudOn', 'cloudList', 'cloudPut', 'cloudDel', 'pull'].filter((k) => k in MWVoice) }));
  check('เสียงที่เก็บไว้: ไม่เหลือส่วนของคลัง R2 · มีปุ่มดาวน์โหลด (data-vdl)', !svr.cloudLeft && svr.hasDl && !svr.api.length, JSON.stringify(svr));
  await main.page.click('#vSavedClose'); await main.page.waitForTimeout(300);
  // แถวปุ่มใต้เสียงที่เจนแล้ว ต้องไม่ล้นจอ (ล้น = มือถือซูมออกทั้งหน้า) แม้ปุ่มโชว์ครบทั้ง 5
  await main.page.evaluate(() => { document.querySelector('#vBody').hidden = false; document.querySelector('#vNo').hidden = true; document.querySelector('#ttsOut').hidden = false; ['ttsSub', 'ttsDirect', 'ttsRaw', 'ttsShare'].forEach((i) => { document.getElementById(i).hidden = false; }); });
  check('แท็บเสียง: แถวปุ่มใต้เสียงที่เจนแล้วไม่ล้นจอ', await main.page.evaluate(() => { const bs = [...document.querySelectorAll('#ttsOut .row .btn')]; return bs.length === 5 && bs.every((b) => b.getBoundingClientRect().width > 0 && b.getBoundingClientRect().right <= innerWidth + 1); }));
  check('แท็บเสียง: ตัวเล่นของแอพเอง (ไม่มีตัวเล่นของเบราว์เซอร์) ไม่ล้นจอ', await main.page.evaluate(() => { const r = document.querySelector('#ttsOut .tplayer').getBoundingClientRect(); return !document.querySelector('#ttsAudio').controls && r.width > 0 && r.right <= innerWidth + 1 && document.querySelector('#ttsPlay svg') !== null; }));
  check('เสียงที่เก็บไว้: กดเล่นแล้วปิดหน้าต่าง เสียงหยุด', playing && !(await main.page.evaluate(() => window.__auds.some((a) => !a.paused))));
  // บทพากย์: แก้ในหน้าเสียงต้องไม่ทับต้นฉบับในหน้าบท · จัดบรรทัดใหม่ต้องรวมบรรทัดที่ถูกตัด (ไม่ตัดตามความกว้างจอ)
  await main.page.evaluate(() => {
    const clip = { id: 'smokeclip', title: 'คลิปทดสอบ', channel: 'ช่อง', views: 1, published: '2026-01-01', score: 1 };
    MW.history.merge([{ id: 'smokeclip', clip, at: Date.now(), trans: '', active: 0, vers: [{ pid: 'A', pname: 'A', eye: 'x', writer: 'x', chat: [{ role: 'user', content: 'u' }, { role: 'assistant', content: 's1' }], s1Len: 2, s1: 's1', s2: 'PART 1\nชื่อ\nPART 2\nลูฟี่เคยสร้างอุบัติเหตุ\nพุ่งชนหน้าอกสาว\n\nรอบแรกเกิดขึ้นที่เกาะ', at: Date.now() }] }]);
    MW.data.picked = clip; MW.persist();
  });
  await main.page.click('nav [data-tab=script]'); await main.page.click('nav [data-tab=voice]'); await main.page.waitForTimeout(500);
  const orig = 'ลูฟี่เคยสร้างอุบัติเหตุ\nพุ่งชนหน้าอกสาว\n\nรอบแรกเกิดขึ้นที่เกาะ';
  await main.page.evaluate(() => document.querySelector('#quickFb [data-q=lines]').click()); await main.page.waitForTimeout(300);
  check('จัดบรรทัดใหม่: รวมบรรทัดที่ถูกตัดในท่อนเดียวกัน คงบรรทัดว่างคั่นท่อน', (await main.page.inputValue('#vText')) === 'ลูฟี่เคยสร้างอุบัติเหตุ พุ่งชนหน้าอกสาว\n\nรอบแรกเกิดขึ้นที่เกาะ', await main.page.inputValue('#vText'));
  check('หน้าบทยังโชว์ต้นฉบับ แม้แก้ในหน้าเสียงแล้ว', (await main.page.textContent('#s2View')) === orig);
  const st = () => main.page.evaluate(() => ({ back: !document.querySelector('#s2Back').disabled, fwd: !document.querySelector('#s2Fwd').disabled }));
  const s1 = await st();
  check('ย้อน/ไปข้างหน้า: หลังแก้ ย้อนได้ ไปข้างหน้าไม่ได้ (ปุ่มเทา)', s1.back && !s1.fwd);
  await main.page.evaluate(() => document.querySelector('#s2Back').click()); await main.page.waitForTimeout(300);
  const s2 = await st();
  check('กดย้อน: บทกลับเป็นต้นฉบับ และปุ่มย้อนเป็นสีเทา (สุดทาง) ปุ่มไปข้างหน้ากดได้', (await main.page.inputValue('#vText')) === orig && !s2.back && s2.fwd);
  await main.page.evaluate(() => document.querySelector('#s2Fwd').click()); await main.page.waitForTimeout(300);
  const s3 = await st();
  check('กดไปข้างหน้า: บทกลับเป็นฉบับแก้ และปุ่มไปข้างหน้าเป็นสีเทา', (await main.page.inputValue('#vText')).startsWith('ลูฟี่เคยสร้างอุบัติเหตุ พุ่ง') && s3.back && !s3.fwd);
  await main.page.fill('#vText', 'พิมพ์แก้เองหนึ่งรอบ'); await main.page.dispatchEvent('#vText', 'change'); await main.page.evaluate(() => document.querySelector('#s2Back').click()); await main.page.waitForTimeout(300);
  check('พิมพ์แก้เองแล้วแตะออก = หนึ่งขั้น ย้อนได้ทีละขั้น', (await main.page.inputValue('#vText')).startsWith('ลูฟี่เคยสร้างอุบัติเหตุ พุ่ง'));
  check('หน้าบทยังโชว์ต้นฉบับหลังย้อน/แก้หลายรอบ', (await main.page.textContent('#s2View')) === orig);
  check('แท็บเสียง: แถวปุ่มคัดลอก/ย้อน/ไปข้างหน้า ไม่ล้นจอ', await main.page.evaluate(() => { const bs = ['copyBtn', 's2Back', 's2Fwd'].map((i) => document.getElementById(i).getBoundingClientRect()); return bs.every((b) => b.width > 0 && b.right <= innerWidth + 1); }));
  await main.page.evaluate(`MWVoice.put({ id: 1700000000002, text: 'ลูฟี่เคยสร้างอุบัติเหตุพุ่งชนหน้าอกสาวรอบแรกเกิดขึ้นที่เกาะ', name: 'h.mp3', blob: new Blob(['x'], { type: 'audio/mpeg' }) })`);
  await main.page.click('nav [data-tab=script]');
  await main.page.click('#histBtn'); await main.page.waitForTimeout(600);
  check('ประวัติบท: บทที่เคยสร้างเสียงมีป้าย "มีเสียง"', await main.page.evaluate(() => { const t = document.querySelector('#histList [data-vo="smokeclip"]'); return !!t && !t.hidden && t.textContent.includes('มีเสียง'); }));
  await main.page.click('#histClose');
  await main.page.click('#histBtn'); await main.page.waitForTimeout(300);
  check('ประวัติบท: ปุ่มลบซ่อนไว้ แตะสามจุดเปิด แตะซ้ำปิด', await main.page.evaluate(async () => { const r = document.querySelector('#histList .hrow'), d = r.querySelector('.hdel'), m = r.querySelector('[data-more]'); const hid = getComputedStyle(d).display === 'none'; m.click(); const sh = getComputedStyle(d).display !== 'none'; m.click(); return hid && sh && getComputedStyle(d).display === 'none'; }));
  await main.page.click('#histClose');
  await finishPage(main);
  // หน้าซับ (?voice=)
  const sub = await open('/sub/index.html?voice=1700000000001', 'หน้าซับ');
  await sub.page.waitForTimeout(1500);
  check('หน้าซับ: ?voice= ใส่เสียงและบทให้', (await sub.page.textContent('#fileInfo')).includes('take.mp3') && (await sub.page.inputValue('#rawScript')) === 'บทของเทคนี้');
  const subAlign = await sub.page.evaluate(() => { const c = (e) => { const r = e.getBoundingClientRect(); return r.top + r.height / 2; }; return Math.abs(c(document.querySelector('.back-link')) - c(document.querySelector('.topbar h1'))); });
  check('หน้าซับ: ปุ่มย้อนกลับกับชื่อหน้าอยู่กึ่งกลางแนวเดียวกัน', subAlign < 3, `ต่างกัน ${subAlign.toFixed(1)}px`);
  await finishPage(sub);
  // หน้าฟุตเทจ (?voice=)
  const foot = await open('/footage.html?voice=1700000000001', 'หน้าฟุตเทจ');
  await foot.page.waitForTimeout(1200);
  check('หน้าฟุตเทจ: ?voice= ไปแท็บผู้กำกับ เลือกเสียงให้', (await foot.page.evaluate(() => document.querySelector('#p-plan').classList.contains('on'))) && (await foot.page.textContent('#plVoiceBtn')).includes('take.mp3') && !(await foot.page.textContent('#plVoiceBtn')).includes('ไม่ใส่เสียง'));
  check('หน้าฟุตเทจ: ไม่มี select/datalist ของเบราว์เซอร์', (await foot.page.evaluate(() => document.querySelectorAll('select,datalist,[list]').length)) === 0);
  await foot.page.click('#plModeBtn'); check('หน้าฟุตเทจ: ช่องเลือกแบบเปิดชีตของแอพ', (await foot.page.evaluate(() => document.querySelectorAll('#pkList .alrow').length)) === 2); await foot.page.click('#pkDone');
  const footAlign = await foot.page.evaluate(() => { const c = (e) => { const r = e.getBoundingClientRect(); return r.top + r.height / 2; }; return Math.abs(c(document.querySelector('header a.back')) - c(document.querySelector('header h1'))); });
  check('หน้าฟุตเทจ: ปุ่มย้อนกลับกับชื่อหน้าอยู่กึ่งกลางแนวเดียวกัน', footAlign < 3, `ต่างกัน ${footAlign.toFixed(1)}px`);
  await foot.page.evaluate(() => document.querySelector('nav button[data-p="set"]').click()); await foot.page.waitForTimeout(300); /* โหมดตัดต่ออัตโนมัติซ่อนแท็บ → สั่งคลิกผ่านโค้ด */
  check('หน้าฟุตเทจ: วิดีโอในมือถือ ในเบราว์เซอร์ปุ่มปิด บอกว่าใช้ได้เฉพาะแอพ', await foot.page.evaluate(() => document.getElementById('locScan').disabled && /เฉพาะแอพ/.test(document.getElementById('tagLoc').textContent)));
  await finishPage(foot);
  // วิดีโอในมือถือ (MWLocal) ในแอพ: ปลั๊กอินจำลอง → สแกน ข้ามโฟลเดอร์ที่อ่านไม่ได้ จับคู่ ชื่อ|ขนาด ได้ ไม่ล้น
  const nat = await context.newPage(); const natErr = [];
  nat.on('pageerror', (e) => natErr.push(e.message));
  await nat.addInitScript(() => { window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: () => true, convertFileSrc: (x) => 'https://localhost/_cs' + x.replace('file://', ''),
    Plugins: { Media: { getAlbums: async () => ({ albums: [{ name: 'a', identifier: '/s/a' }, { name: 'b', identifier: '/s/bad' }] }) },
      Filesystem: { readdir: async ({ path }) => { if (path === '/s/bad') throw new Error('EACCES'); return { files: [{ name: 'a.mp4', type: 'file', size: 100, uri: 'file:///s/a/a.mp4' }, { name: 'ก b.mp4', type: 'file', size: 7, uri: 'file:///s/a/ก b.mp4' }, { name: 'p.jpg', type: 'file', size: 5, uri: 'file:///s/a/p.jpg' }] }; } } } }; });
  // เปิดที่ 127.0.0.1 = จำลองโหมด live (หน้าไม่ได้อยู่ที่ localhost)
  await nat.goto(base.replace('localhost', '127.0.0.1') + '/footage.html'); await nat.waitForFunction(() => window.MWLocal && window.FT && FT.ui, null, { timeout: 20000 }); await nat.click('nav button[data-p="set"]'); await nat.evaluate(() => { document.getElementById('locFold').open = true; }); await nat.click('#locScan'); await nat.waitForTimeout(800);
  const loc = await nat.evaluate(() => ({ info: document.getElementById('locInfo').textContent, a: MWLocal.urlOf({ name: 'a.mp4', size: 100 }), thai: MWLocal.urlOf({ name: 'ก b.mp4', size: 7 }), miss: MWLocal.urlOf({ name: 'a.mp4', size: 101 }), has: FT.ui.hasSrc({ name: 'a.mp4', size: 100 }), over: document.documentElement.scrollWidth > innerWidth + 1 }));
  check('หน้าฟุตเทจ (ในแอพ): สแกนวิดีโอในมือถือ จับคู่ชื่อ|ขนาด เล่นจากไฟล์ในเครื่องได้ ข้ามโฟลเดอร์ที่อ่านไม่ได้', /สแกนแล้ว 2 อัลบั้ม · วิดีโอ 2 ไฟล์/.test(loc.info) && loc.a === 'https://localhost/_capacitor_file_/s/a/a.mp4' && loc.thai === 'https://localhost/_capacitor_file_/s/a/' + encodeURIComponent('ก b.mp4') && loc.miss === null && loc.has === true && !natErr.length && !loc.over, JSON.stringify(loc) + natErr.join(';'));
  await nat.close();
  // บันทึก/แชร์ไฟล์ (MWNative): เบราว์เซอร์ = ดาวน์โหลดตามเดิม · ในแอพ = Filesystem เขียนทีละก้อน (ชื่อเดิมเขียนไม่ได้ → ชื่อใหม่) + Share ผ่านแคช
  const [webDl] = await Promise.all([foot.page.waitForEvent('download', { timeout: 5000 }).catch(() => null), foot.page.evaluate(() => MWNative.save(new Blob(['x']), 't.txt'))]);
  check('บันทึกไฟล์ (เบราว์เซอร์): ดาวน์โหลดตามเดิม', !!webDl && webDl.suggestedFilename() === 't.txt');
  const nv = await context.newPage(); const nvErr = [];
  nv.on('pageerror', (e) => nvErr.push(e.message));
  await nv.addInitScript(() => { window.__w = []; window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: () => true,
    Plugins: { Filesystem: { writeFile: async (o) => { if (o.path === 'Meowrin/blocked.txt') throw new Error('EACCES'); window.__w.push(['w', o.path, o.directory, o.data.length]); },
      appendFile: async (o) => { window.__w.push(['a', o.path, o.directory, o.data.length]); }, getUri: async (o) => ({ uri: 'file:///x/' + o.path }) },
      Share: { share: async (o) => { window.__w.push(['share', o.files[0]]); } } } }; });
  await nv.goto(base + '/footage.html'); await nv.waitForTimeout(1200);
  const nres = await nv.evaluate(async () => {
    const r1 = await MWNative.save(new Blob([new Uint8Array(13 * 1024 * 1024)]), 'big.mp4'), r2 = await MWNative.save(new Blob(['x']), 'blocked.txt');
    await MWNative.share(new Blob(['y']), 'a.mp3', 'a'); return { r1, r2, w: window.__w, can: MWNative.canShare() };
  });
  const big = nres.w.filter((x) => x[1] === 'Meowrin/big.mp4');
  check('บันทึกไฟล์ (ในแอพ): เขียน 13 MB เป็น 3 ก้อน ลง Documents/Meowrin ต่อกันได้', big.length === 3 && big[0][0] === 'w' && big[1][0] === 'a' && big[2][0] === 'a' && big[0][3] === 8388608 && big[0][2] === 'DOCUMENTS' && nres.r1.path === 'Documents/Meowrin/big.mp4', JSON.stringify(nres.r1) + JSON.stringify(big));
  check('บันทึกไฟล์ (ในแอพ): ชื่อเดิมเขียนไม่ได้ → ใช้ชื่อใหม่', /^Documents\/Meowrin\/blocked-\d+\.txt$/.test(nres.r2.path) && nres.w.some((x) => /^Meowrin\/blocked-\d+\.txt$/.test(x[1])), JSON.stringify(nres.r2));
  check('แชร์ไฟล์ (ในแอพ): เขียนลงแคชแล้วเปิดหน้าต่างแชร์', nres.can === true && nres.w.some((x) => x[0] === 'w' && x[2] === 'CACHE') && nres.w.some((x) => x[0] === 'share' && /^file:\/\/\/x\/share\//.test(x[1])) && !nvErr.length, JSON.stringify(nres.w.slice(-3)) + nvErr.join(';'));
  await nv.close();
  // สำรองเป็นไฟล์แล้วแชร์ (ในแอพ ล็อกอิน Google ไม่ได้): แถบสำรองด่วนของหน้าหลักกับหน้าฟุตเทจ + ซ่อนส่วน Google Drive
  for (const [pg, qid, nm] of [['index.html', 'gdQuick', 'meowrin-factory-backup.json'], ['footage.html', 'gdFootQuick', 'meowrin-footage-index.json']]) {
    const bk = await context.newPage(); const bkErr = []; bk.on('pageerror', (e) => bkErr.push(e.message));
    await bk.addInitScript(() => { window.__w = []; window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: () => true,
      Plugins: { Filesystem: { writeFile: async (o) => { window.__w.push(['w', o.path, o.directory]); }, appendFile: async () => {}, getUri: async (o) => ({ uri: 'file:///x/' + o.path }) },
        Share: { share: async (o) => { window.__w.push(['share', o.files[0]]); } } } }; });
    await bk.goto(base + '/' + pg); await bk.waitForFunction(() => window.MWDrive && (window.MW || (window.FT && FT.ui)), null, { timeout: 20000 }); await bk.waitForTimeout(500);
    await bk.click(pg === 'footage.html' ? 'nav button[data-p="set"]' : 'nav button[data-tab="settings"]');
    await bk.click('#' + qid); await bk.waitForTimeout(1500);
    const br = await bk.evaluate(() => ({ w: window.__w, last: (MWStore.get('mw_gdrive_v1', {}) || {}), msg: (document.querySelector('#gdQuickMsg, #gdFootQuickMsg') || {}).textContent || '', hid: !!document.getElementById('gdConnect') && document.getElementById('gdConnect').hidden || (document.getElementById('gdFold') || {}).hidden }));
    check('สำรองเป็นไฟล์ (ในแอพ ' + pg + '): เขียนแคช ' + nm + ' แล้วเปิดหน้าต่างแชร์ + จดเวลา + ซ่อนส่วน Google Drive', br.w.some((x) => x[0] === 'w' && x[2] === 'CACHE' && x[1].endsWith(nm)) && br.w.some((x) => x[0] === 'share') && (pg === 'index.html' ? br.last.last : br.last.lastFoot) > 0 && br.hid && bkErr.length === 0, JSON.stringify(br).slice(0, 200) + bkErr.join());
    await bk.close();
  }
  // แกนส่งออกวิดีโอเร็ว (exporter.js): ต่อ 3 ช็อตจากคลิปจำลอง (vp9 เพราะ Chromium ที่ใช้เทสต์ไม่มี H.264) → ความยาว/ขนาด/ลำดับสีถูก
  const ex = await context.newPage(); const exErr = []; ex.on('pageerror', (e) => exErr.push(e.message));
  await ex.goto(base + '/check.html'); await ex.waitForTimeout(800);
  const exr = await ex.evaluate(async () => {
    const mb = await import('/sub/vendor/mediabunny.min.js');
    async function make(color){ const c = document.createElement('canvas'); c.width = 320; c.height = 180; const x = c.getContext('2d'); const o = new mb.Output({ format: new mb.Mp4OutputFormat(), target: new mb.BufferTarget() }); const v = new mb.CanvasSource(c, { codec: 'vp9', quality: mb.QUALITY_HIGH }); o.addVideoTrack(v); await o.start(); for (let i = 0; i < 60; i++){ x.fillStyle = color; x.fillRect(0, 0, 320, 180); await v.add(i / 30, 1 / 30); } await o.finalize(); return URL.createObjectURL(new Blob([o.target.buffer], { type: 'video/mp4' })); }
    const red = await make('#c00'), blue = await make('#00c'), { exportShots } = await import('/exporter.js');
    const res = await exportShots({ shots: [{ url: red, start: 0.2, dur: 0.5 }, { url: blue, start: 0.5, dur: 0.5 }, { url: red, start: 0, dur: 0.5 }], width: 270, height: 480, fps: 30, codec: 'vp9' });
    const v = document.createElement('video'); v.muted = true; v.src = URL.createObjectURL(res.blob); document.body.appendChild(v);
    await new Promise((ok, no) => { v.onloadedmetadata = ok; v.onerror = () => no(new Error('เล่นไม่ได้')); });
    const cv = document.createElement('canvas'); cv.width = 27; cv.height = 48; const cx = cv.getContext('2d');
    const at = async (t) => { v.currentTime = t; await new Promise((ok) => v.onseeked = ok); cx.drawImage(v, 0, 0, 27, 48); const d = cx.getImageData(1, 1, 1, 1).data; return d[0] > d[2] ? 'R' : 'B'; };
    const out = { frames: res.frames, dur: v.duration, size: res.blob.size, w: v.videoWidth, h: v.videoHeight, order: (await at(0.2)) + (await at(0.7)) + (await at(1.2)) };
    /* ใส่เสียงพากย์: เสียงสังเคราะห์ 2 วิ (WAV) → ช็อตกำหนดด้วย at · ช็อตที่ 2 ไม่มี url = ค้างภาพแดง · ไฟล์ต้องยาว 2 วิ มีแทร็กเสียง */
    const sr = 22050, n = sr * 2, wav = new DataView(new ArrayBuffer(44 + n * 2)); const W = (o, t) => { for (let i = 0; i < t.length; i++) wav.setUint8(o + i, t.charCodeAt(i)); };
    W(0, 'RIFF'); wav.setUint32(4, 36 + n * 2, true); W(8, 'WAVEfmt '); wav.setUint32(16, 16, true); wav.setUint16(20, 1, true); wav.setUint16(22, 1, true); wav.setUint32(24, sr, true); wav.setUint32(28, sr * 2, true); wav.setUint16(32, 2, true); wav.setUint16(34, 16, true); W(36, 'data'); wav.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) wav.setInt16(44 + i * 2, Math.round(Math.sin(i / sr * 2 * Math.PI * 440) * 8000), true);
    const r2 = await exportShots({ voice: new Blob([wav], { type: 'audio/wav' }), shots: [{ url: red, start: 0, at: 0 }, { url: null, at: 0.8 }, { url: blue, start: 0.2, at: 1.2 }], width: 270, height: 480, fps: 30 });
    const inp = new mb.Input({ source: new mb.BlobSource(r2.blob), formats: mb.ALL_FORMATS }), at2 = await inp.getPrimaryAudioTrack(), vt = await inp.getPrimaryVideoTrack();
    out.v2 = { frames: r2.frames, audio: !!at2, ad: at2 ? await at2.computeDuration() : 0, vd: vt ? await vt.computeDuration() : 0, codec: r2.codec, ac: r2.audio };
    return out;
  });
  check('ส่งออกวิดีโอเร็ว (exporter.js): ใส่เสียงพากย์ 2 วิ ช็อตตามเวลา at + ค้างภาพ ได้ไฟล์มีทั้งภาพและเสียงยาว 2 วิ', exr.v2.frames === 60 && exr.v2.audio && Math.abs(exr.v2.ad - 2) < 0.15 && Math.abs(exr.v2.vd - 2) < 0.1, JSON.stringify(exr.v2));
  check('ส่งออกวิดีโอเร็ว (exporter.js): ต่อ 3 ช็อต ยาว 1.5 วิ ขนาด 270x480 ลำดับสีถูก', exr.frames === 45 && Math.abs(exr.dur - 1.5) < 0.1 && exr.w === 270 && exr.h === 480 && exr.order === 'RBR' && exr.size > 500 && !exErr.length, JSON.stringify(exr) + exErr.join(';'));
  await ex.close();
  // ตัวต่อวิดีโอในแท็บผู้กำกับ (FT.stitch.make โหมดมีเสียงพากย์) → ใช้ทางเร็ว (exporter) ได้ไฟล์ mp4 ถูกต้อง · ไฟล์ต้นทางหายก็ต้องถอยแบบเดิมแล้วบอกในข้อความ ไม่เงียบ
  const sf = await context.newPage(); const sfErr = []; sf.on('pageerror', (e) => sfErr.push(e.message));
  await sf.goto(base + '/footage.html'); await sf.waitForFunction(() => window.FT && FT.ui && FT.stitch, null, { timeout: 20000 });
  const sfr = await sf.evaluate(async () => {
    const mb = await import('/sub/vendor/mediabunny.min.js');
    const c = document.createElement('canvas'); c.width = 320; c.height = 180; const x = c.getContext('2d'); const o = new mb.Output({ format: new mb.Mp4OutputFormat(), target: new mb.BufferTarget() }); const v = new mb.CanvasSource(c, { codec: 'vp9', quality: mb.QUALITY_HIGH }); o.addVideoTrack(v); await o.start();
    for (let i = 0; i < 30; i++) { x.fillStyle = '#c00'; x.fillRect(0, 0, 320, 180); await v.add(i / 30, 1 / 30); } await o.finalize();
    const clip = URL.createObjectURL(new Blob([o.target.buffer], { type: 'video/mp4' }));
    const sr = 22050, n = sr * 2, wav = new DataView(new ArrayBuffer(44 + n * 2)); const W = (p, t) => { for (let i = 0; i < t.length; i++) wav.setUint8(p + i, t.charCodeAt(i)); };
    W(0, 'RIFF'); wav.setUint32(4, 36 + n * 2, true); W(8, 'WAVEfmt '); wav.setUint32(16, 16, true); wav.setUint16(20, 1, true); wav.setUint16(22, 1, true); wav.setUint32(24, sr, true); wav.setUint32(28, sr * 2, true); wav.setUint16(32, 2, true); wav.setUint16(34, 16, true); W(36, 'data'); wav.setUint32(40, n * 2, true);
    const voice = new Blob([wav], { type: 'audio/wav' }), msgs = [], steps = [];
    FT.ui.srcUrl = async () => ({ url: clip });
    const list = [{ c: { name: 'a.mp4' }, from: 0, to: 1, at: 0, k: 0, t: 'a' }, { c: null, from: 0, to: 0, at: 1, k: 1, t: 'b' }];
    const r = await FT.stitch.make(list, (i) => steps.push(i), (m) => msgs.push(m), { voice });
    const inp = new mb.Input({ source: new mb.BlobSource(r.file), formats: mb.ALL_FORMATS });
    const out = { fast: r.fast, name: r.file.name, type: r.file.type, steps, marks: r.marks.map((m) => [m.at, +m.len.toFixed(2)]), ad: await (await inp.getPrimaryAudioTrack()).computeDuration(), vd: await (await inp.getPrimaryVideoTrack()).computeDuration() };
    FT.ui.srcUrl = async () => ({ url: '/ไม่มีไฟล์นี้.mp4' });
    try { const r2 = await FT.stitch.make(list, () => {}, (m) => msgs.push(m), { voice }); out.fb = { fast: !!r2.fast, msgs }; } catch (e) { out.fb = { err: e.message, msgs }; }
    return out;
  });
  check('ตัดต่อในแท็บผู้กำกับ (มีเสียงพากย์): ใช้ทางเร็ว ได้ mp4 ยาว 2 วิ มีเสียง ลำดับช็อตถูก', sfr.fast === true && /\.mp4$/.test(sfr.name) && sfr.steps.join() === '0,1' && Math.abs(sfr.ad - 2) < 0.15 && Math.abs(sfr.vd - 2) < 0.1 && sfr.marks.length === 2 && sfr.marks[0][1] === 1, JSON.stringify(sfr).slice(0, 400));
  check('ตัดต่อในแท็บผู้กำกับ: ไฟล์ต้นทางเปิดไม่ได้ → บอกข้อความว่าตัดแบบเร็วไม่ได้ แล้วถอยไปแบบเดิม (ไม่เงียบ)', !!sfr.fb && sfr.fb.msgs.some((m) => /ตัดแบบเร็วไม่ได้/.test(m)) && sfr.fb.fast !== true, JSON.stringify(sfr.fb).slice(0, 300));
  await sf.close();
  // หน้าตั้งค่าแบบใหม่: เครื่องมือ = อัลบั้ม / ตัดต่ออัตโนมัติ / ซับจอเขียว · ตรวจระบบแอพเป็นแถบเล็กท้ายหน้า (ไม่ใช่กล่องใหญ่) · footage.html?tab=plan เปิดแท็บผู้กำกับตรง · หน้าตรวจระบบเหลือ 3 ข้อ
  const hm = await context.newPage(); const hmErr = []; hm.on('pageerror', (e) => hmErr.push(e.message));
  await hm.goto(base + '/index.html'); await hm.waitForFunction(() => window.MW, null, { timeout: 20000 }); await hm.click('nav [data-tab=settings]');
  const tl = await hm.evaluate(() => ({ tiles: [...document.querySelectorAll('#tab-settings .tool b')].map((b) => b.textContent), plan: document.querySelector('#tab-settings .tool[href="footage.html?tab=plan"]') ? 1 : 0, chk: [...document.querySelectorAll('#tab-settings a.btn')].some((a) => a.getAttribute('href') === 'check.html' && /ตรวจระบบแอพ/.test(a.textContent)) }));
  check('ตั้งค่า: เครื่องมือเป็น อัลบั้ม / ตัดต่ออัตโนมัติ / ซับจอเขียว และตรวจระบบเป็นแถบเล็กท้ายหน้า', tl.tiles.join('|') === 'อัลบั้ม|ตัดต่ออัตโนมัติ|ซับจอเขียว' && tl.plan === 1 && tl.chk && !hmErr.length, JSON.stringify(tl) + hmErr.join());
  await hm.goto(base + '/footage.html?tab=plan'); await hm.waitForFunction(() => window.FT && FT.ui, null, { timeout: 20000 }); await hm.waitForTimeout(500);
  check('footage.html?tab=plan: เปิดโหมดตัดต่ออัตโนมัติ (ผู้กำกับอย่างเดียว ไม่มีแท็บ)', await hm.evaluate(() => document.getElementById('p-plan').classList.contains('on') && document.body.classList.contains('mode-plan') && getComputedStyle(document.querySelector('.tabs')).display === 'none' && document.getElementById('pgTitle').textContent === 'ตัดต่ออัตโนมัติ'));
  await hm.goto(base + '/check.html'); await hm.waitForTimeout(800);
  check('หน้าตรวจระบบ: เหลือ 3 ข้อ (ข้อมูลเครื่อง / API / สิทธิ์ดูวิดีโอ)', await hm.evaluate(() => document.querySelectorAll('.tc').length === 3));
  await hm.close();
  // แท็บอัลบั้ม (footage-album.js): ตารางอัลบั้มจากไฟล์ที่สแกน (เฉพาะใต้ Gallery/owner) → เข้าอัลบั้มเห็นคลิป → แตะเล่นเต็มจอ → ปุ่มย้อนปิดทีละชั้น
  const al = await context.newPage(); const alErr = []; al.on('pageerror', (e) => alErr.push(e.message));
  await al.goto(base + '/footage.html'); await al.waitForFunction(() => window.FT && FT.ui && document.getElementById('alGrid'), null, { timeout: 20000 }); await al.waitForTimeout(500);
  await al.evaluate(() => { const D = '/storage/emulated/0/Pictures/Gallery/owner/'; const mk = (d, n, a) => ({ name: n, size: 1000 + n.length, uri: 'file://' + D + d + '/' + n, album: a, dir: D + d + '/' });
    window.MWLocal.list = () => [mk('luffy', 'a.mp4', 'luffy'), mk('luffy', 'b.mp4', 'luffy'), mk('zoro', 'c.mp4', 'zoro'), { name: 'x.mp4', size: 5, uri: 'file:///storage/emulated/0/DCIM/Camera/x.mp4', album: 'Camera', dir: '/storage/emulated/0/DCIM/Camera/' }];
    window.MWLocal.fileUrl = (u) => '/ไม่มีไฟล์.mp4?u=' + encodeURIComponent(u); document.dispatchEvent(new CustomEvent('ft:files', { detail: 3 })); });
  await al.waitForTimeout(300);
  const a1 = await al.evaluate(() => ({ names: [...document.querySelectorAll('#alGrid .album b')].map((b) => b.textContent), sub: document.getElementById('alSub').textContent }));
  check('แท็บอัลบั้ม: โชว์เฉพาะอัลบั้มใต้ Gallery/owner (luffy 2, zoro 1) ไม่โชว์โฟลเดอร์อื่น', a1.names.join(',') === 'luffy,zoro' && /2 อัลบั้ม · 3 คลิป/.test(a1.sub), JSON.stringify(a1));
  await al.evaluate(() => { FT.ui.lib().push({ id: 'g1', name: 'gone.mp4', size: 77, album: 'ยังไม่แยก', duration: 5, scenes: [] }); document.dispatchEvent(new CustomEvent('ft:lib')); });
  await al.waitForTimeout(200);
  const a1b = await al.evaluate(() => [...document.querySelectorAll('#alGrid .album')].map((a) => a.querySelector('b').textContent + ':' + a.querySelector('small').textContent).join(','));
  check('แท็บอัลบั้ม: คลิปในดัชนีที่หาไฟล์ในมือถือไม่เจอ แยกเป็นอัลบั้ม "ไม่เจอในมือถือ" ไม่ปนกับอัลบั้มจริง', /luffy:2 คลิป/.test(a1b) && /ไม่เจอในมือถือ:1 คลิป/.test(a1b) && !/ยังไม่แยก/.test(a1b), a1b);
  await al.evaluate(() => { FT.ui.lib().push({ id: 'g2', name: 'a.mp4', size: 1005, album: 'luffy', duration: 9, status: 'done', scenes: [] }); document.dispatchEvent(new CustomEvent('ft:lib')); });
  await al.waitForTimeout(200);
  const ai1 = await al.evaluate(() => ({ strip: document.getElementById('alAi').textContent, sub: [...document.querySelectorAll('#alGrid .album')].map((a) => a.querySelector('small').textContent).join('|') }));
  check('อัลบั้ม: แถบ AI บอกสถานะ (ทำแล้ว 1/3 + ปุ่มให้ AI ทำที่เหลือ 2) และอัลบั้มบอกจำนวนที่ AI ทำแล้ว', /AI ทำแล้ว 1\/3 คลิป/.test(ai1.strip) && /ให้ AI ทำที่เหลือ \(2\)/.test(ai1.strip) && /luffy|2 คลิป · AI 1/.test(ai1.sub) && /2 คลิป · AI 1/.test(ai1.sub), JSON.stringify(ai1));
  await al.click('#alAi [data-act=run]'); await al.waitForTimeout(400);
  const nokey = await al.evaluate(() => document.body.textContent.includes('ยังไม่มี OpenRouter key'));
  await al.getByRole('button', { name: /ตกลง|ปิด|OK/ }).first().click().catch(() => {}); await al.waitForTimeout(200);
  await al.evaluate(() => MWStore.set('mw_openrouter_key_v1', 'test-key'));
  await al.click('#alAi [data-act=run]'); await al.waitForTimeout(400);
  const dlg = await al.evaluate(() => document.body.textContent.includes('ให้ AI ทำดัชนี 2 คลิป') && document.body.textContent.includes('ประมาณ'));
  await al.getByRole('button', { name: 'เริ่ม', exact: true }).click(); await al.waitForTimeout(1500);
  const qi = await al.evaluate(() => ({ q: FT.ui.queueInfo(), runMsg: document.getElementById('queue') ? document.querySelectorAll('#queue li').length : -1 }));
  check('อัลบั้ม: กด ให้ AI ทำที่เหลือ → ไม่มีคีย์เตือนก่อน → มีคีย์ถามราคาประมาณ → ต่อคิว 2 คลิป (เฉพาะที่ยังไม่ทำ) เริ่มทำ', nokey && dlg && qi.q.total === 2 && qi.runMsg === 2, JSON.stringify({ nokey, dlg, qi }));
  await al.click('#alGrid .album'); await al.waitForTimeout(200);
  const a2 = await al.evaluate(() => ({ view: !document.getElementById('alView').hidden, home: document.getElementById('alHome').hidden, clips: document.querySelectorAll('#alvGrid .clip').length, t: document.getElementById('alvTitle').textContent }));
  check('แท็บอัลบั้ม: แตะอัลบั้มเข้าไปเห็นคลิปในอัลบั้ม', a2.view && a2.home && a2.clips === 2 && a2.t === 'luffy', JSON.stringify(a2));
  await al.click('#alvGrid .clip'); await al.waitForTimeout(200);
  const a3 = await al.evaluate(() => ({ open: !document.getElementById('alPlay').hidden, src: document.getElementById('alVid').getAttribute('src') || '', title: document.getElementById('alpT').textContent }));
  check('แท็บอัลบั้ม: แตะคลิปเปิดตัวเล่นเต็มจอ (ใส่ที่อยู่ไฟล์ในมือถือ)', a3.open && /a\.mp4/.test(a3.src) && a3.title === 'a.mp4', JSON.stringify(a3));
  await al.goBack(); await al.waitForTimeout(300);
  const a4 = await al.evaluate(() => ({ play: document.getElementById('alPlay').hidden, view: !document.getElementById('alView').hidden, vsrc: document.getElementById('alVid').getAttribute('src') }));
  await al.goBack(); await al.waitForTimeout(300);
  const a5 = await al.evaluate(() => ({ home: !document.getElementById('alHome').hidden, view: document.getElementById('alView').hidden, url: location.pathname }));
  check('แท็บอัลบั้ม: ปุ่มย้อนปิดทีละชั้น (ตัวเล่น → อัลบั้ม → หน้าอัลบั้มทั้งหมด) และไม่หลุดออกจากหน้า', a4.play && a4.view && a4.vsrc === null && a5.home && a5.view && /footage\.html$/.test(a5.url) && !alErr.length, JSON.stringify([a4, a5]) + alErr.join());
  // อัลบั้ม 3 แบบ: ตัวละคร (≥3 คลิป) / ภาค (มั่นใจเข้าเอง ไม่แน่ใจรวมไว้) · เลือกคลิปแล้วย้ายเข้าภาคเอง (ล็อกไม่ให้ AI ทับ)
  await al.evaluate(() => { const L = FT.ui.lib(); const a = L.find((c) => c.name === 'a.mp4');
    a.scenes = [{ ai: { characters: ['Luffy'], arc: 'Alabasta' } }, { ai: { characters: ['Luffy', 'Zoro'], arc: 'Alabasta arc' } }];
    L.push({ id: 'b1', name: 'b.mp4', size: 1005, album: 'luffy', duration: 5, status: 'done', scenes: [{ ai: { characters: ['Luffy'], arc: '' } }] });
    L.push({ id: 'c1', name: 'c.mp4', size: 1005, album: 'zoro', duration: 5, status: 'done', scenes: [{ ai: { characters: ['Luffy'], arc: 'Enies Lobby' } }, { ai: { characters: ['Luffy'], arc: '' } }, { ai: { characters: ['Luffy'], arc: '' } }, { ai: { characters: ['Luffy'], arc: '' } }] });
    document.dispatchEvent(new CustomEvent('ft:lib')); });
  await al.click('#alSeg [data-m=char]'); await al.waitForTimeout(300);
  const ch = await al.evaluate(() => [...document.querySelectorAll('#alGrid .album')].map((x) => x.querySelector('b').textContent + ':' + x.querySelector('small').textContent.split(' · ')[0]).join(','));
  check('อัลบั้มแบบตัวละคร: Luffy 3 คลิป (Zoro เจอ 1 คลิป ไม่ทำอัลบั้ม)', /^Luffy:3 คลิป$/.test(ch), ch);
  await al.click('#alSeg [data-m=arc]'); await al.waitForTimeout(300);
  const ar = await al.evaluate(() => [...document.querySelectorAll('#alGrid .album')].map((x) => x.querySelector('b').textContent + ':' + x.querySelector('small').textContent.split(' · ')[0]).join(','));
  check('อัลบั้มแบบภาค: Alabasta 1 (ชื่อภาคต่างกัน "Alabasta arc" รวมกัน) · Enies Lobby 1 · ยังไม่แน่ใจ 1 (ไม่มีป้ายภาค)', ar === 'Alabasta:1 คลิป,Enies Lobby:1 คลิป,ยังไม่แน่ใจ:1 คลิป', ar);
  await al.click('#alGrid .album:last-child'); await al.waitForTimeout(200);
  await al.click('#alSel'); await al.click('#alvGrid .clip'); await al.waitForTimeout(150);
  await al.click('#alMove'); await al.waitForTimeout(200); await al.locator('#pkList .alrow', { hasText: 'Alabasta' }).click(); await al.waitForTimeout(600);
  const mv = await al.evaluate(() => ({ b: FT.ui.lib().find((c) => c.name === 'b.mp4'), names: [...document.querySelectorAll('#alGrid .album')].map((x) => x.querySelector('b').textContent + ':' + x.querySelector('small').textContent.split(' · ')[0]).join(','), home: !document.getElementById('alHome').hidden }));
  check('อัลบั้มแบบภาค: เลือกคลิปที่ไม่แน่ใจ แล้วย้ายเข้า Alabasta → ล็อกภาค (arcFixed) และกลับหน้ารวมที่จัดกลุ่มใหม่', mv.b.arc === 'Alabasta' && mv.b.arcFixed === true && mv.home && /Alabasta:2 คลิป/.test(mv.names) && !/ยังไม่แน่ใจ/.test(mv.names), JSON.stringify(mv));
  // v8.2: แท็บเหลือ 4 (อัลบั้ม/ค้นหา/ผู้กำกับ/ตั้งค่า) · ชื่อหัวหน้าตามแท็บ · ส่วนทำดัชนีเองย้ายเป็นแถบพับในตั้งค่า (ปุ่มเดิมยังอยู่ครบ)
  await al.click('.tabs [data-p=set]'); await al.waitForTimeout(150);
  const t82 = await al.evaluate(() => ({ tabs: [...document.querySelectorAll('.tabs button')].map((b) => b.textContent).join('|'), h1: document.getElementById('pgTitle').textContent, inSet: !!document.querySelector('#p-set #p-idx #startBtn') && !!document.querySelector('#p-set #p-idx #filesDocsBtn') }));
  check('footage: โหมดอัลบั้มมีแท็บ อัลบั้ม/ตั้งค่า (ไม่มีผู้กำกับ), ชื่อหัวหน้าตามแท็บ, ทำดัชนีเองอยู่ในตั้งค่า', t82.tabs === 'อัลบั้ม|ตั้งค่า' && t82.h1 === 'ตั้งค่า' && t82.inSet, JSON.stringify(t82));
  await al.close();
  // v8.0: ชื่อไฟล์ยาวไม่มีเว้นวรรคในกล่องข้อความ ไม่ทำให้หน้าล้นจอ · อัลบั้มโชว์ผลสแกนรอบก่อนทันทีที่เปิด · ชีตจำนวนคนไม่มีช่องค้นหา
  const v8 = await browser.newContext({ viewport: { width: 380, height: 800 } }); const v8p = await v8.newPage(); const v8Err = []; v8p.on('pageerror', (e) => v8Err.push(e.message));
  await v8p.goto(base + '/index.html'); await v8p.waitForFunction(() => window.MW, null, { timeout: 20000 });
  const ovf = await v8p.evaluate(() => { const m = document.getElementById('setMsg'); m.innerHTML = '<div class="msg">' + 'x'.repeat(6) + '_HOW_BADLY_THE_STRAW_HATS_EXPLOIT_SANJI_long_long_name_without_spaces.mp4</div>'; document.querySelector('nav [data-tab=settings]').click(); document.querySelector('#setMsg').closest('details').open = true; document.querySelector('#setMsg').closest('details.top').open = true; return document.documentElement.scrollWidth - document.documentElement.clientWidth; });
  check('ข้อความชื่อไฟล์ยาวไม่มีเว้นวรรค ไม่ทำให้หน้าล้นจอ', ovf <= 1, 'ล้น ' + ovf + ' px');
  await v8p.evaluate(() => MWStore.set('mw_local_v1', { auto: true, st: { albums: 1, files: 2, at: 1 }, list: [{ name: 'p.mp4', size: 11, uri: 'file:///storage/emulated/0/Pictures/Gallery/owner/nami/p.mp4', album: 'nami', dir: '/storage/emulated/0/Pictures/Gallery/owner/nami/' }, { name: 'q.mp4', size: 12, uri: 'file:///storage/emulated/0/Pictures/Gallery/owner/nami/q.mp4', album: 'nami', dir: '/storage/emulated/0/Pictures/Gallery/owner/nami/' }] }));
  await v8p.goto(base + '/footage.html'); await v8p.waitForFunction(() => window.FT && FT.ui && document.getElementById('alGrid'), null, { timeout: 20000 }); await v8p.waitForTimeout(600);
  const rs = await v8p.evaluate(() => [...document.querySelectorAll('#alGrid .album')].map((a) => a.querySelector('b').textContent + ':' + a.querySelector('small').textContent).join(','));
  check('อัลบั้ม: เปิดหน้าแล้วโชว์อัลบั้มจากผลสแกนรอบก่อนทันที (ไม่ต้องรอสแกนใหม่)', /nami:2 คลิป/.test(rs), rs);
  await v8.close();
  // v8.3: ค้นหาในหน้าอัลบั้ม (พิมพ์ค้นแล้วโชว์ฉาก ล้างแล้วกลับตารางอัลบั้ม) · ค้นด้วยชื่อภาคไทย (สกายเปีย ↔ Skypiea)
  const sq = await context.newPage(); const sqErr = []; sq.on('pageerror', (e) => sqErr.push(e.message));
  await sq.goto(base + '/footage.html'); await sq.waitForFunction(() => window.FT && FT.ui && FT.ui.search, null, { timeout: 20000 }); await sq.waitForTimeout(400);
  await sq.evaluate(() => { FT.ui.lib().push({ id: 'sk1', name: 'sk.mp4', size: 9, album: 'luffy', duration: 20, status: 'done', lastModified: 1, cover: '', scenes: [{ s: 0, e: 4, thumb: '', ai: { characters: ['Luffy'], characters_th: ['ลูฟี่'], emotion: 'laughing', summary_th: 'ลูฟี่หัวเราะ', arc: 'Skypiea arc' } }, { s: 4, e: 9, thumb: '', ai: { characters: ['Zoro'], emotion: 'angry', arc: 'Alabasta' } }] }); FT.ui.search(); });
  const sq0 = await sq.evaluate(() => ({ main: !document.getElementById('alMain').hidden, res: document.getElementById('results').hidden }));
  await sq.fill('#q', 'ลูฟี่หัวเราะภาคสกายเปีย'); await sq.waitForTimeout(700);
  const sq1 = await sq.evaluate(() => ({ main: document.getElementById('alMain').hidden, cards: document.querySelectorAll('#results .card').length, txt: document.getElementById('results').textContent.includes('ลูฟี่หัวเราะ') }));
  await sq.fill('#q', ''); await sq.waitForTimeout(500);
  const sq2 = await sq.evaluate(() => ({ main: !document.getElementById('alMain').hidden, res: document.getElementById('results').hidden }));
  check('ค้นหาในหน้าอัลบั้ม: ไม่พิมพ์ = ตารางอัลบั้ม · พิมพ์ "ลูฟี่หัวเราะภาคสกายเปีย" = เจอฉากเดียวที่ตรง (ไม่ใช่ฉากโซโร/ภาคอื่น) · ล้างแล้วกลับตารางอัลบั้ม', sq0.main && sq0.res && sq1.main && sq1.cards === 1 && sq1.txt && sq2.main && sq2.res && !sqErr.length, JSON.stringify([sq0, sq1, sq2]) + sqErr.join());
  // ให้ AI ดูภาคของคลิปที่ยังไม่แน่ใจ (โหมดภาค): ถามราคาก่อน · AI ตอบภาค = เข้าอัลบั้มภาคนั้น (arcAi) · ตอบว่าง = ยังไม่แน่ใจและไม่ลองซ้ำ
  await sq.evaluate(() => { const c = FT.ui.lib().find((x) => x.name === 'sk.mp4'); c.scenes[0].thumb = 'data:image/jpeg;base64,/9j/4AAQ'; FT.classifyArcs = async (items, arcs) => { window.__arcCalls = (window.__arcCalls || 0) + 1; return { cost: 0.01, map: { 1: 'Alabasta' } }; }; MWStore.set('mw_openrouter_key_v1', 'k'); });
  await sq.click('#alSeg [data-m=arc]'); await sq.waitForTimeout(300);
  const ap0 = await sq.evaluate(() => ({ txt: document.getElementById('alArc').textContent, hid: document.getElementById('alArc').hidden }));
  await sq.click('#alArc [data-act=run]'); await sq.waitForTimeout(300);
  const apDlg = await sq.evaluate(() => document.body.textContent.includes('ให้ AI ดูภาคของ 1 คลิป') && document.body.textContent.includes('AI จะไม่เดา'));
  await sq.getByRole('button', { name: 'เริ่ม', exact: true }).click(); await sq.waitForTimeout(800);
  const ap1 = await sq.evaluate(() => ({ c: FT.ui.lib().find((x) => x.name === 'sk.mp4').arcAi, calls: window.__arcCalls, names: [...document.querySelectorAll('#alGrid .album b')].map((b) => b.textContent).join(','), strip: document.getElementById('alArc').textContent }));
  check('ให้ AI ดูภาค: ถามราคา+บอกว่าไม่เดาก่อน → เรียก AI 1 รอบ → คลิปได้ภาค Alabasta (arcAi) เข้าอัลบั้มภาค · ไม่มีคลิปรอแล้ว', !ap0.hid && /ยังไม่แน่ใจ 1 คลิป/.test(ap0.txt) && apDlg && ap1.c && ap1.c.arc === 'Alabasta' && ap1.calls === 1 && /Alabasta/.test(ap1.names) && (/ไม่มีคลิปที่รอ/.test(ap1.strip) || /เสร็จรอบนี้/.test(ap1.strip)), JSON.stringify([ap0, apDlg, ap1]));
  await sq.click('#alSeg [data-m=phone]'); await sq.waitForTimeout(200);
  // ตัวกรองภาค (รวมกับตัวละครได้) + ช่องว่างใต้แผงค้นหา
  await sq.evaluate(() => { FT.ui.lib().push({ id: 'sk2', name: 'sk2.mp4', size: 10, album: 'luffy', duration: 20, status: 'done', lastModified: 2, cover: '', scenes: [{ s: 0, e: 4, thumb: '', ai: { characters: ['Luffy'], arc: 'Skypiea' } }, { s: 4, e: 9, thumb: '', ai: { characters: ['Zoro'], arc: 'Skypiea arc' } }] }); FT.ui.search(); });
  await sq.click('#chips [data-open=r]'); await sq.waitForTimeout(200);
  const arcRows = await sq.evaluate(() => [...document.querySelectorAll('#pkList .alrow')].map((r) => r.textContent.replace(/\s+/g, ' ').trim()).join('|'));
  await sq.locator('#pkList .alrow', { hasText: 'Skypiea' }).click(); await sq.click('#pkDone'); await sq.waitForTimeout(400);
  const ar1 = await sq.evaluate(() => ({ cards: document.querySelectorAll('#results .card').length, main: document.getElementById('alMain').hidden, chip: [...document.querySelectorAll('#chips .chip')].some((c) => /Skypiea/.test(c.textContent)) }));
  await sq.click('#chips [data-open=c]'); await sq.waitForTimeout(200); await sq.locator('#pkList .alrow', { hasText: 'Zoro' }).click(); await sq.click('#pkDone'); await sq.waitForTimeout(400);
  const ar2 = await sq.evaluate(() => ({ cards: document.querySelectorAll('#results .card').length, gap: parseFloat(getComputedStyle(document.querySelector('#p-album > .panel')).marginBottom) }));
  check('ตัวกรองภาค: มีรายการภาค (Skypiea, Alabasta ที่ AI ดูแล้ว) · เลือก Skypiea เจอ 2 ฉากของคลิปนั้น · ใส่ตัวละคร Zoro ด้วยเหลือ 1 ฉาก · มีช่องว่างใต้แผงค้นหา', /Skypiea/.test(arcRows) && /Alabasta/.test(arcRows) && ar1.cards === 2 && ar1.main && ar1.chip && ar2.cards === 1 && ar2.gap >= 12, JSON.stringify([arcRows, ar1, ar2]));
  // ตัวเลขในชีตตามที่เลือกอยู่: เลือกภาค Skypiea แล้วดูตัวละคร = นับเฉพาะในภาคนั้น เรียงมากไปน้อย · ตัวละครที่ไม่มีในภาค = 0 ฉากล่างสุดจาง
  await sq.click('#chips [data-open=c]'); await sq.waitForTimeout(200); await sq.click('#pkClear'); await sq.waitForTimeout(200);
  const cr = await sq.evaluate(() => [...document.querySelectorAll('#pkList .alrow')].map((r) => ({ n: r.querySelector('b').textContent, c: +(r.querySelector('i')?.textContent.match(/\d+/) || [-1])[0], dim: r.classList.contains('dim') })));
  const sorted = cr.every((r, i) => i === 0 || cr[i - 1].c >= r.c || cr[i - 1].n === 'ไม่ระบุตัวละคร');
  await sq.click('#pkDone'); await sq.waitForTimeout(200);
  check('ชีตตัวละคร/ภาค: ตัวเลขนับตามที่เลือกอยู่ เรียงมากไปน้อย ตัวที่ 0 ฉากอยู่ล่างสุดและจาง', cr.length > 1 && sorted && cr.filter((r) => r.c === 0).every((r) => r.dim), JSON.stringify(cr));
  await sq.close();
  // เก็บคลิปไว้ในแอพ (library.js): ก๊อปจาก Gallery/owner → Documents/Meowrin/library/<อัลบั้ม>/ ผ่านชื่อ .part แล้วเปลี่ยนชื่อ · ข้ามที่มีแล้ว · สแกนแล้วเล่นจากสำเนา · ต้นฉบับไม่ถูกลบ
  const lb = await context.newPage(); const lbE = []; lb.on('pageerror', (e) => lbE.push(e.message));
  await lb.addInitScript(() => { const fsx = { lib: { 'Meowrin/library/luffy': [{ name: 'old.mp4', type: 'file', size: 50, uri: 'file:///docs/Meowrin/library/luffy/old.mp4' }] }, ops: [] };
    window.__fs = fsx; window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: () => true, convertFileSrc: (x) => 'https://localhost/_cs' + x.replace('file://', ''),
    Plugins: { Media: { getAlbums: async () => ({ albums: [{ name: 'luffy', identifier: '/storage/Pictures/Gallery/owner/luffy' }, { name: 'luffy', identifier: '/storage/emulated/0/Documents/Meowrin/library/luffy' }] }) },
      Filesystem: {
        readdir: async ({ path, directory }) => { if (directory === 'DOCUMENTS') { if (path === 'Meowrin/library') return { files: Object.keys(fsx.lib).map((k) => ({ name: k.split('/').pop(), type: 'directory' })) }; if (fsx.lib[path]) return { files: fsx.lib[path] }; throw new Error('nope'); }
          if (path.includes('/Meowrin/library/')) return { files: [{ name: 'old.mp4', type: 'file', size: 50, uri: 'file:///docs/Meowrin/library/luffy/old.mp4' }, ...(fsx.lib['Meowrin/library/luffy'] || []).filter((f) => f.name !== 'old.mp4')] }; /* MediaStore เห็นโฟลเดอร์สำเนาเป็นอัลบั้มด้วย */
          return { files: [{ name: 'old.mp4', type: 'file', size: 50, uri: 'file:///storage/Pictures/Gallery/owner/luffy/old.mp4' }, { name: 'new1.mp4', type: 'file', size: 70, uri: 'file:///storage/Pictures/Gallery/owner/luffy/new1.mp4' }, { name: 'new2.mp4', type: 'file', size: 80, uri: 'file:///storage/Pictures/Gallery/owner/luffy/new2.mp4' }] }; },
        mkdir: async (o) => { fsx.ops.push(['mkdir', o.path]); }, deleteFile: async (o) => { fsx.ops.push(['del', o.path]); throw new Error('no such'); },
        copy: async (o) => { fsx.ops.push(['copy', o.from, o.to]); }, rename: async (o) => { fsx.ops.push(['rename', o.from, o.to]); const d = o.to.replace(/\/[^/]+$/, ''), n = o.to.split('/').pop(); (fsx.lib[d] = fsx.lib[d] || []).push({ name: n, type: 'file', size: n === 'new1.mp4' ? 70 : 80, uri: 'file:///docs/' + o.to }); } } } }; });
  await lb.goto(base.replace('localhost', '127.0.0.1') + '/footage.html'); await lb.waitForFunction(() => window.MWLib && window.MWLocal && window.FT && FT.ui, null, { timeout: 20000 });
  await lb.click('nav button[data-p="set"]'); await lb.evaluate(() => { document.getElementById('locFold').open = true; }); await lb.click('#locScan'); await lb.waitForTimeout(700);
  await lb.evaluate(() => { document.getElementById('libFold').open = true; });
  const l0 = await lb.evaluate(() => ({ info: document.getElementById('libInfo').textContent, todo: MWLib.todo().map((f) => f.name) }));
  await lb.click('#libGo'); await lb.waitForTimeout(300);
  const lDlg = await lb.evaluate(() => document.body.textContent.includes('ก๊อป 2 คลิป') && document.body.textContent.includes('ต้นฉบับไม่ถูกแตะ'));
  await lb.getByRole('button', { name: 'เริ่มก๊อป', exact: true }).click(); await lb.waitForTimeout(1500);
  const l1 = await lb.evaluate(() => ({ ops: window.__fs.ops.filter((o) => o[0] === 'copy' || o[0] === 'rename').map((o) => o.slice(1).join('>')), info: document.getElementById('libInfo').textContent, todo: MWLib.todo().length, url: MWLocal.urlOf({ name: 'new1.mp4', size: 70 }), n: MWLocal.list().length, over: document.documentElement.scrollWidth > innerWidth + 1 }));
  check('เก็บคลิปไว้ในแอพ: ข้ามคลิปที่มีสำเนาแล้ว (old) · ถามก่อนพร้อมบอกว่าต้นฉบับไม่ถูกแตะ · ก๊อป 2 คลิปไปชื่อ .part แล้วเปลี่ยนชื่อ · สแกนใหม่แล้วเล่นจากสำเนา · ไม่ลบต้นฉบับ',
    l0.todo.join() === 'new1.mp4,new2.mp4' && l0.info.includes('1/3') === false && lDlg && l1.ops.length === 4 && l1.ops[0] === 'file:///storage/Pictures/Gallery/owner/luffy/new1.mp4>Meowrin/library/luffy/new1.mp4.part' && l1.ops[1] === 'Meowrin/library/luffy/new1.mp4.part>Meowrin/library/luffy/new1.mp4' && l1.todo === 0 && /ก๊อปครบแล้ว 3 คลิป/.test(l1.info) && /docs\/Meowrin\/library\/luffy\/new1\.mp4$/.test(l1.url || '') && l1.n === 3 && !l1.over && !lbE.length, JSON.stringify([l0, l1]) + lbE.join());
  await lb.close();
  // เสียงพากย์: สร้างแล้วเก็บเป็นไฟล์ใน Documents/Meowrin/voice ด้วย (mp3+json) · IndexedDB ว่าง + มีไฟล์ = ดึงกลับให้เอง
  const vcx = await browser.newContext({ viewport: { width: 380, height: 820 } }); const vp = await vcx.newPage();
  await vp.addInitScript(() => { window.__w = []; window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: () => true, Plugins: { Filesystem: { writeFile: async (o) => { window.__w.push([o.path, o.directory, o.data.length]); }, deleteFile: async (o) => { window.__w.push(['del', o.path]); } } } }; });
  await vp.goto(base + '/index.html'); await vp.waitForFunction(() => window.MWVoice, null, { timeout: 20000 });
  const vw = await vp.evaluate(async () => { await MWVoice.put({ id: 1700000000123, text: 'บท', name: 'a.mp3', blob: new Blob(['abc'], { type: 'audio/mpeg' }), align: null }); await new Promise((r) => setTimeout(r, 300)); await MWVoice.del(1700000000123); await new Promise((r) => setTimeout(r, 100)); return window.__w; });
  check('เสียงพากย์: เก็บไฟล์ mp3+json ลง Documents/Meowrin/voice แล้วลบไฟล์ตอนลบเทค', vw.length === 4 && vw[0][0] === 'Meowrin/voice/1700000000123.mp3' && vw[0][1] === 'DOCUMENTS' && vw[1][0] === 'Meowrin/voice/1700000000123.json' && vw.slice(2).every((x) => x[0] === 'del'), JSON.stringify(vw));
  await vcx.close();
  const vcy = await browser.newContext({ viewport: { width: 380, height: 820 } }); const vq = await vcy.newPage();
  await vq.addInitScript(() => { const mp3 = btoa('ID3data'), js = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify({ text: 'บทเดิม', name: 'v.mp3', align: null }))));
    window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: () => true, Plugins: { Filesystem: { writeFile: async () => {}, deleteFile: async () => {}, readdir: async () => ({ files: [{ name: '1700000000999.mp3' }, { name: '1700000000999.json' }] }), readFile: async (o) => ({ data: /mp3$/.test(o.path) ? mp3 : js }) } } }; });
  await vq.goto(base + '/index.html'); await vq.waitForFunction(() => window.MWVoice, null, { timeout: 20000 }); await vq.waitForFunction(async () => (await MWVoice.list()).length > 0, null, { timeout: 8000 }).catch(() => {});
  const vr = await vq.evaluate(async () => { const l = await MWVoice.list(); return l.map((r) => [r.id, r.text, r.name, r.blob.size]); });
  check('เสียงพากย์: IndexedDB ว่างแต่มีไฟล์ในโฟลเดอร์ → ดึงเทคกลับมาให้เอง (บท/ชื่อ/ไฟล์เสียงครบ)', vr.length === 1 && vr[0][0] === 1700000000999 && vr[0][1] === 'บทเดิม' && vr[0][2] === 'v.mp3' && vr[0][3] === 7, JSON.stringify(vr));
  await vcy.close();
  // R2 ปิดใช้ทั้งระบบ (v8.13): ตั้งค่าครบก็ไม่ทำงาน · ต้องมี on:true ถึงเปิด · แผง R2 ซ่อนอยู่
  const r2p = await context.newPage(); await r2p.goto(base + '/footage.html'); await r2p.waitForFunction(() => window.R2 && window.FT && FT.ui, null, { timeout: 20000 });
  const r2r = await r2p.evaluate(() => { const full = { account: 'a', bucket: 'b', keyId: 'k', secret: 's' }; const old = R2.cfg(); R2.setCfg({ ...full }); const off = R2.ready(); R2.setCfg({ ...full, on: true }); const on = R2.ready(); R2.setCfg(old); const f = [...document.querySelectorAll('details.fold')].find((d) => /Cloudflare R2/.test(d.textContent)); return { off, on, panelHidden: !!f && getComputedStyle(f).display === 'none', bg: getComputedStyle(document.getElementById('bgR2')).display }; });
  check('R2: ตั้งค่าครบแต่ไม่มี on → ไม่ทำงาน (ready=false) · on:true ถึงเปิดได้ · แผงตั้งค่า R2 และช่องเพดาน R2 ซ่อนอยู่', r2r.off === false && r2r.on === true && r2r.panelHidden && r2r.bg === 'none', JSON.stringify(r2r));
  await r2p.close();
  // หน้าไม่มีสไตล์ (css โหลดไม่ติดครั้งแรก) → โหลดซ้ำ 1 รอบเอง + จดลง log · ติดทุกครั้ง = ขึ้นปุ่มโหลดใหม่ ไม่วนลูป
  const csx = await browser.newContext({ viewport: { width: 380, height: 820 }, serviceWorkers: 'block' }); const csp = await csx.newPage(); let cssHits = 0;
  await csp.route(/\/style\.css/, (r) => { cssHits++; return cssHits === 1 ? r.abort() : r.continue(); });
  await csp.goto(base + '/index.html'); await csp.waitForFunction(() => window.MW, null, { timeout: 20000 }); await csp.waitForTimeout(500);
  const cs1 = await csp.evaluate(() => ({ styled: !!getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(), log: JSON.parse(localStorage.getItem('ota_state_v1') || '{}').css || '', btn: [...document.querySelectorAll('button')].some((b) => /โหลดไม่ครบ/.test(b.textContent)) }));
  check('css โหลดไม่ติดครั้งแรก → โหลดหน้าซ้ำเอง 1 รอบจนมีสไตล์ · จดลง log (ไม่ขึ้นปุ่มเตือน)', cs1.styled && /ครั้งแรก · style\.css/.test(cs1.log) && cssHits === 2 && !cs1.btn, JSON.stringify([cs1, cssHits]));
  await csp.close();
  const csq = await csx.newPage(); await csq.route(/\/style\.css/, (r) => r.abort());
  await csq.goto(base + '/index.html'); await csq.waitForFunction(() => window.MW, null, { timeout: 20000 }).catch(() => {}); await csq.waitForTimeout(1200);
  const cs2 = await csq.evaluate(() => ({ btn: [...document.querySelectorAll('button')].some((b) => /โหลดไม่ครบ/.test(b.textContent)), log: JSON.parse(localStorage.getItem('ota_state_v1') || '{}').css || '' }));
  check('css โหลดไม่ติดซ้ำสองรอบ → ขึ้นปุ่ม "แตะเพื่อโหลดใหม่" ไม่วนลูปโหลดหน้า', cs2.btn && /ซ้ำ/.test(cs2.log), JSON.stringify(cs2));
  await csq.close(); await csx.close();
  // ฟอนต์เก็บในแอพ (ไม่ดึงจาก Google ตอนเปิด: เน็ตช้า/ออฟไลน์ = สคริปต์รอสไตล์ภายนอกจนหน้าค้างเปล่า) · ทุกหน้าไม่อ้างโดเมนฟอนต์ของ Google · ฟอนต์โหลดได้จริงจากไฟล์ในแอพ
  const extFont = ['index.html', 'footage.html', 'check.html', 'sub/index.html'].filter((f) => /fonts\.(googleapis|gstatic)\.com/.test(text(f)));
  const fp = await context.newPage(); await fp.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await fp.goto(base + '/index.html'); await fp.waitForFunction(() => window.MW, null, { timeout: 20000 }); await fp.evaluate(() => document.fonts.load('500 16px "IBM Plex Sans Thai"', 'ก')); await fp.waitForTimeout(300);
  const fl = await fp.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/['"]/g, '')));
  check('ฟอนต์: ไม่มีหน้าไหนอ้าง Google Fonts · เก็บไว้ในแอพและโหลดใช้ได้แม้ต่อ Google ไม่ได้', !extFont.length && fl.some((n) => /IBM Plex Sans Thai/.test(n)), JSON.stringify([extFont, fl]));
  await fp.close();
  // ตัวเฝ้าหน้าค้าง: ถ้า app.js โหลดไม่ได้ → กล่องแดงบอกไฟล์ที่พัง · ปกติไม่โผล่
  const wd = await context.newPage(); await wd.addInitScript(() => { window.__MW_WATCH_MS = 1200; }); await wd.route(/\/app\.js/, (r) => r.abort());
  await wd.goto(base + '/index.html'); await wd.waitForTimeout(2500);
  const wdt = await wd.evaluate(() => (document.getElementById('mwWatch') || {}).textContent || '');
  const wk = await context.newPage(); await wk.addInitScript(() => { window.__MW_WATCH_MS = 1200; }); await wk.goto(base + '/index.html'); await wk.waitForTimeout(2500);
  const wkt = await wk.evaluate(() => document.querySelectorAll('#mwWatch').length);
  check('ตัวเฝ้าหน้าค้าง: app.js โหลดไม่ได้ → ขึ้นกล่องบอก "โหลดไม่ได้: app.js" · แอพปกติไม่ขึ้นกล่อง', /แอพยังไม่ขึ้น \(MW\)/.test(wdt) && /โหลดไม่ได้: .*app\.js/.test(wdt) && wkt === 0, JSON.stringify([wdt, wkt]));
  const ws = await context.newPage(); await ws.addInitScript(() => { window.__MW_WATCH_MS = 800; }); await ws.goto(base + '/sub/index.html'); await ws.waitForTimeout(2000);
  check('ตัวเฝ้าหน้าค้าง: หน้าซับ (sub/index.html) ไม่ขึ้นกล่องเตือนผิดๆ', (await ws.evaluate(() => document.querySelectorAll('#mwWatch').length)) === 0);
  await ws.close();
  await wd.close(); await wk.close();
  // ป้ายหัวข้อ สำรองข้อมูล (ในแอพ): เตือนเรื่องสำรองอย่างเดียว → บอกสาเหตุ "ยังไม่เคยสำรอง" / "สำรองนานแล้ว" ไม่ใช้คำกว้างๆ · สำรองสดๆ = ปกติ
  async function stTagFor(last) {
    const cx2 = await browser.newContext({ viewport: { width: 380, height: 820 }, serviceWorkers: 'block' }); const pg = await cx2.newPage();
    await pg.addInitScript((last) => { window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: () => true, Plugins: { Filesystem: {}, Share: {} } }; if (navigator.storage) { navigator.storage.persist = async () => true; navigator.storage.persisted = async () => true; } if (last) localStorage.setItem('mw_gdrive_v1', JSON.stringify({ last })); }, last);
    await pg.goto(base + '/index.html'); await pg.waitForFunction(() => window.MW, null, { timeout: 20000 }); await pg.waitForTimeout(800);
    const t = await pg.evaluate(() => document.getElementById('stTag').textContent); await cx2.close(); return t;
  }
  const tg = [await stTagFor(0), await stTagFor(Date.now() - 5 * 864e5), await stTagFor(Date.now() - 3600e3)];
  check('ป้ายสำรองข้อมูล (ในแอพ): ไม่เคยสำรอง = "ยังไม่เคยสำรอง" · เกิน 3 วัน = "สำรองนานแล้ว" · เพิ่งสำรอง = "ปกติ"', tg[0] === 'ยังไม่เคยสำรอง' && tg[1] === 'สำรองนานแล้ว' && tg[2] === 'ปกติ', JSON.stringify(tg));
  // ลิงก์ไปหน้าในโฟลเดอร์ต้องระบุ index.html ตรงๆ: ตัวเสิร์ฟของ Capacitor ตอบ index.html ของแอพหลักให้ทุก URL ที่ไม่มีนามสกุล (เช่น sub/) → ซับจอเขียวขึ้นเป็นหน้าแรกไม่มีสไตล์
  const dirLinks = [];
  for (const f of ['index.html', 'footage.html', 'check.html', 'sub/index.html', ...jsAll.filter((x) => !x.startsWith('sub') && !x.includes('vendor'))]) for (const m of text(f).matchAll(/(?:href=|\.href = )["']((?:\.\.\/|\.\/)?(?:sub\/)?)(\?[^"']*)?["']/g)) if (/^(sub\/|\.\.\/|\.\/)$/.test(m[1]) && f !== 'footage.html' && f !== 'check.html') dirLinks.push(f + ': ' + m[0]);
  check('ลิงก์ที่ชี้โฟลเดอร์ (sub/ หรือ ../) ต้องมี index.html — ไม่งั้นในแอพขึ้นหน้าแรกซ้อนแบบไม่มีสไตล์', !dirLinks.length, dirLinks.join(' | '));
  // ปุ่มย้อนในหน้าซับจอเขียว (sub/index.html): กลับหน้าแรก ไม่ใช่ถามออกแอพ
  const sb = await context.newPage();
  await sb.addInitScript(() => { window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: () => true, Plugins: { App: { addListener: (n, f) => { window.__bb = f; return Promise.resolve({ remove() {} }); }, exitApp: () => { window.__exit = 1; } } } }; });
  await sb.goto(base + '/index.html'); await sb.waitForFunction(() => window.MW, null, { timeout: 20000 }); await sb.goto(base + '/sub/index.html'); await sb.waitForFunction(() => window.__bb, null, { timeout: 20000 });
  await sb.evaluate(() => { window.__bb(); }); await sb.waitForTimeout(800);
  const sbr = await sb.evaluate(() => ({ path: location.pathname, dlg: document.body.textContent.includes('ออกจากแอพไหม') }));
  check('ปุ่มย้อนมือถือในหน้าซับจอเขียว → กลับหน้าแรก ไม่ถามออกแอพ', sbr.path === '/index.html' && !sbr.dlg, JSON.stringify(sbr));
  await sb.close();
  // ปุ่มย้อนของมือถือ (ปลั๊กอิน App): ปิดหน้าต่าง/กลับแท็บก่อน แล้วค่อยถามออกแอพ · เลือก "อยู่ต่อ" ไม่ออก
  const bk = await context.newPage(); const bkE = [];  bk.on('pageerror', (e) => bkE.push(e.message));
  await bk.addInitScript(() => { window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: () => true, Plugins: { App: { addListener: (n, f) => { window.__bb = f; return Promise.resolve({ remove() {} }); }, exitApp: () => { window.__exit = (window.__exit || 0) + 1; } } } }; });
  await bk.goto(base + '/index.html'); await bk.waitForFunction(() => window.MW && window.__bb, null, { timeout: 20000 });
  await bk.click('nav [data-tab=settings]'); await bk.evaluate(() => window.__bb()); await bk.waitForTimeout(200);
  const b1 = await bk.evaluate(() => document.querySelector('nav button[aria-selected=true]').dataset.tab);
  await bk.evaluate(() => { window.__bb(); }); await bk.waitForTimeout(300); /* ไม่รอผล: จะค้างที่กล่องถามออกแอพ */
  const b2 = await bk.evaluate(() => ({ ask: document.body.textContent.includes('ออกจากแอพไหม?'), exit: window.__exit || 0 }));
  await bk.getByRole('button', { name: 'อยู่ต่อ' }).click(); await bk.waitForTimeout(200);
  const b3 = await bk.evaluate(() => window.__exit || 0);
  await bk.evaluate(() => { window.__bb(); }); await bk.waitForTimeout(300); await bk.getByRole('button', { name: 'ออก', exact: true }).click(); await bk.waitForTimeout(200);
  const b4 = await bk.evaluate(() => window.__exit || 0);
  check('ปุ่มย้อนของมือถือ: ในแท็บตั้งค่า → กลับแท็บคลิป · ที่หน้าแรก → ถาม "ออกจากแอพไหม?" · อยู่ต่อ = ไม่ออก · ออก = ออกแอพ', b1 === 'clips' && b2.ask && b2.exit === 0 && b3 === 0 && b4 === 1 && !bkE.length, JSON.stringify([b1, b2, b3, b4]) + bkE.join());
  await bk.close();
  // อัปเดตแอพเอง (ota.js): เช็ก files.json → ดาวน์โหลดลงโฟลเดอร์ + ตรวจ sha1 → สลับ · ไฟล์ถูกแก้ = ยกเลิกทั้งชุดไม่สลับ · บูตสำเร็จ = จำชุดใหม่ + ลบชุดเก่า
  const { createHash } = await import('node:crypto'); const sha = (b) => createHash('sha1').update(b).digest('hex');
  const REM = 'https://hxyhan2006-code.github.io/Meowrin-apk/', NEWID = 'newid1234567890abcdef';
  const subset = ['version.js', 'icons.js', 'index.html', 'sub/vendor/mediabunny.LICENSE'].map((p) => { const b = readFileSync(join(ROOT, p)); return { p, h: sha(b), s: b.length }; });
  const otaCtx = await browser.newContext({ viewport: { width: 380, height: 820 }, serviceWorkers: 'block' }); // sw.js จะดึงคำขอข้ามโดเมนไปเอง ทำให้ page.route ดักไม่ได้
  async function otaPage(tamper, opt = {}) {
    const pg = await otaCtx.newPage();
    await pg.route(new RegExp('^' + REM.replace(/[.\/]/g, '\\$&')), (route) => {
      const p = decodeURIComponent(new URL(route.request().url()).pathname.replace('/Meowrin-apk/', '')), cors = { 'access-control-allow-origin': '*' };
      if (p === 'files.json') return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ id: NEWID, version: '9.9', files: subset }) });
      let body = readFileSync(join(ROOT, p)); if (tamper && p === 'icons.js') body = Buffer.concat([body, Buffer.from('x')]);
      return route.fulfill({ status: 200, body, headers: cors });
    });
    await pg.addInitScript(({ id, bp, state, exists, extra }) => { if (state) localStorage.setItem('ota_state_v1', JSON.stringify(state)); window.__o = { w: [], sb: [], persisted: 0, rm: [] }; window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: () => true, Plugins: {
      WebView: { setServerBasePath: async (o) => { window.__o.sb.push(o.path); }, getServerBasePath: async () => ({ path: bp || '/data/user/0/app/files/ota/' + id + '/' }), persistServerBasePath: async () => { window.__o.persisted++; } },
      Filesystem: { writeFile: async (o) => { window.__o.w.push([o.path, o.data.length]); }, stat: async (o) => { if (!(exists || []).includes(o.path) && !window.__o.w.some(([p]) => p === o.path)) throw new Error('nope'); return {}; }, rmdir: async (o) => { window.__o.rm.push(o.path); }, getUri: async (o) => ({ uri: 'file:///data/user/0/app/files/' + o.path }), readdir: async () => ({ files: [{ name: 'oldid' }, { name: id }, ...(extra || []).map((name) => ({ name }))] }) } } }; }, { id: NEWID, bp: opt.bp, state: opt.state, exists: opt.exists, extra: opt.extra });
    await pg.goto(base + '/index.html'); await pg.waitForFunction(() => window.MWOta && window.MW, null, { timeout: 20000 });
    return pg;
  }
  const o1p = await otaPage(false);
  const o1 = await o1p.evaluate(async () => { const c = await MWOta.check(); const d = await MWOta.download(); await MWOta.apply(); return { update: c.update, w: window.__o.w, sb: window.__o.sb }; });
  check('อัปเดตแอพ (ota.js): เจอเวอร์ชันใหม่ → ดาวน์โหลดครบ (ไฟล์+files.json) ตรวจ sha1 → สลับชุดไฟล์ (โฟลเดอร์ชื่อไม่ซ้ำ)', o1.update && o1.w.length === 5 && o1.w.every(([p]) => /^ota\/newid1234567-[a-z0-9]+\//.test(p)) && o1.w.some(([p]) => /\/files\.json$/.test(p)) && o1.sb.length === 1 && /^\/data\/user\/0\/app\/files\/ota\/newid1234567-[a-z0-9]+$/.test(o1.sb[0]), JSON.stringify(o1));
  await o1p.close();
  const o2p = await otaPage(true);
  const o2 = await o2p.evaluate(async () => { try { await MWOta.check(); await MWOta.download(); return { err: null, sb: window.__o.sb.length }; } catch (e) { return { err: e.message, sb: window.__o.sb.length, rm: window.__o.rm.length }; } });
  check('อัปเดตแอพ (ota.js): ไฟล์ไม่ตรง sha1 → ยกเลิกทั้งชุด ลบของค้าง ไม่สลับ', /sha1/.test(o2.err || '') && o2.sb === 0 && o2.rm >= 1, JSON.stringify(o2));
  await o2p.close();
  const o3p = await otaPage(false);
  const o3 = await o3p.evaluate(async () => { await MWOta.bootOk(); return { persisted: window.__o.persisted, rm: window.__o.rm }; });
  check('อัปเดตแอพ (ota.js): บูตจากชุด OTA สำเร็จ → จำชุดนี้ + ลบชุดเก่า (ไม่ลบชุดที่ใช้อยู่)', o3.persisted === 1 && o3.rm.includes('ota/oldid') && !o3.rm.includes('ota/' + NEWID), JSON.stringify(o3));
  await o3p.close();
  // ตัวกันพลาด: เปิดแอพมาเป็นชุดที่ห่อมากับ APK แต่เคยดาวน์โหลดชุดใหม่ไว้ → สลับให้เอง (นับรอบ) · ครบ 2 รอบไม่สำเร็จ = เลิก ไม่วนลูป
  const o4p = await otaPage(false, { bp: '/android_asset/public', state: { wanted: { id: 'abc', dir: 'ota/abc' }, tries: 0 }, exists: ['ota/abc/files.json'] });
  await o4p.waitForTimeout(300);
  const o4 = await o4p.evaluate(() => ({ sb: window.__o.sb, st: JSON.parse(localStorage.getItem('ota_state_v1')) }));
  check('อัปเดตแอพ (ota.js): เปิดแอพมายังเป็นชุดเดิมแต่มีชุดใหม่ที่ดาวน์โหลดไว้ → สลับให้เอง นับรอบ', o4.sb.length === 1 && o4.sb[0] === '/data/user/0/app/files/ota/abc' && o4.st.tries === 1, JSON.stringify(o4));
  await o4p.close();
  const o5p = await otaPage(false, { bp: '/android_asset/public', state: { wanted: { id: 'abc', dir: 'ota/abc' }, tries: 2 }, exists: ['ota/abc/files.json'] });
  await o5p.waitForTimeout(300);
  const o5 = await o5p.evaluate(() => ({ sb: window.__o.sb.length, st: JSON.parse(localStorage.getItem('ota_state_v1')) }));
  check('อัปเดตแอพ (ota.js): สลับตอนเปิดแอพไม่สำเร็จครบ 2 รอบ → เลิก ไม่วนลูป', o5.sb === 0 && !o5.st.wanted, JSON.stringify(o5));
  await o5p.close();
  // บั๊ก v8.5: บูตเสร็จแล้วลบชุดเก่าไปลบชุดใหม่ที่เพิ่งโหลดรอสลับด้วย → สลับแล้วหน้า ERR_CONNECTION_REFUSED
  const o6p = await otaPage(false, { state: { ready: { id: 'r1', dir: 'ota/readyset', version: '9' } }, extra: ['readyset'] });
  const o6 = await o6p.evaluate(async () => { await MWOta.bootOk(); return { rm: window.__o.rm }; });
  check('อัปเดตแอพ (ota.js): ลบชุดเก่าหลังบูต ไม่ลบชุดใหม่ที่ดาวน์โหลดรอสลับไว้ (แต่ลบชุดอื่นที่ค้าง)', o6.rm.includes('ota/oldid') && !o6.rm.includes('ota/readyset'), JSON.stringify(o6));
  await o6p.close();
  const o7p = await otaPage(false);
  const o7 = await o7p.evaluate(async () => { await MWOta.check(); await MWOta.download(); window.__o.w.length = 0; /* โฟลเดอร์ที่โหลดไว้หายไป (ไม่เจอ index.html) */ try { await MWOta.apply(); return { err: null, sb: window.__o.sb.length }; } catch (e) { return { err: e.message, sb: window.__o.sb.length }; } });
  check('อัปเดตแอพ (ota.js): ชุดที่ดาวน์โหลดไว้ไม่มี index.html → ไม่สลับ (ไม่ทำให้หน้าพัง)', /หาย/.test(o7.err || '') && o7.sb === 0, JSON.stringify(o7));
  await o7p.close();
  await otaCtx.close();
  // ไปหน้าเครื่องมือจากแท็บตั้งค่า แล้วกดย้อน → ต้องกลับมาแท็บตั้งค่า (ไม่ใช่แท็บคลิป)
  const hb = await browser.newPage({ viewport: { width: 380, height: 820 } });
  await hb.goto(base + '/index.html'); await hb.waitForFunction(() => window.MW, null, { timeout: 20000 });
  await hb.click('nav button[data-tab="settings"]'); await hb.click('#tab-settings .tool[href="footage.html"]'); await hb.waitForURL(/footage\.html/); await hb.waitForTimeout(400);
  await hb.goBack(); await hb.waitForFunction(() => window.MW, null, { timeout: 20000 }); await hb.waitForTimeout(400);
  check('ย้อนจากหน้าเครื่องมือ → กลับมาแท็บตั้งค่า (ไม่เด้งไปแท็บคลิป)', await hb.evaluate(() => document.querySelector('nav button[aria-selected=true]').dataset.tab === 'settings'));
  await hb.close();
  const hp = await browser.newPage({ viewport: { width: 380, height: 820 } });
  await hp.route(/\/app\.js/, (r) => r.abort()); // บล็อก app.js: ถ้าแท็บเป็นตั้งค่าแล้ว แปลว่า store.js ตั้งให้ก่อน
  await hp.goto(base + '/index.html#settings', { waitUntil: 'commit' });
  await hp.waitForSelector('#tab-settings', { state: 'attached' });
  await hp.waitForFunction(() => document.readyState !== 'loading'); await hp.waitForTimeout(300);
  const early = await hp.evaluate(() => document.getElementById('tab-settings').classList.contains('on') && !!document.getElementById('tab-clips') && !document.getElementById('tab-clips').classList.contains('on'));
  check('เปิดหน้าแรกด้วย #settings → วาดแท็บตั้งค่าเลย (store.js ตั้งก่อนข้อมูลโหลด ไม่แว้บแท็บคลิป)', early);
  await hp.close();
} finally { await browser.close(); server.close(); }
const bad = results.filter((x) => !x.ok);
console.log(`\n${bad.length ? 'มี ' + bad.length + ' ข้อไม่ผ่าน' : 'ผ่านทั้งหมด'} (${results.length} ข้อ)`);
process.exit(bad.length ? 1 : 0);
