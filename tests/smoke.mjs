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
for (const f of [...jsAll.filter((x) => !x.startsWith('sub')), 'index.html', 'footage.html', 'studio.html']) for (const m of text(f).matchAll(/MWIcon\("([a-z]+)"\)|#i-([a-z]+)/g)) used.add(m[1] || m[2]);
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
  check('เสียงที่เก็บไว้: ไม่เหลือส่วนของคลังออนไลน์ · มีปุ่มดาวน์โหลด (data-vdl)', !svr.cloudLeft && svr.hasDl && !svr.api.length, JSON.stringify(svr));
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
      Filesystem: { readdir: async ({ path }) => { if (path === '/s/bad') throw new Error('EACCES'); return { files: [{ name: 'a.mp4', type: 'file', size: 100, uri: 'file:///s/a/a.mp4' }, { name: 'ก b.mp4', type: 'file', size: 7, uri: 'file:///s/a/ก b.mp4' }, { name: 'p.jpg', type: 'file', size: 5, uri: 'file:///s/a/p.jpg' }, { name: '.trashed-1999999999-a.mp4', type: 'file', size: 100, uri: 'file:///s/a/.trashed-1999999999-a.mp4' }] }; } } } }; });
  // เปิดที่ 127.0.0.1 = จำลองโหมด live (หน้าไม่ได้อยู่ที่ localhost)
  await nat.goto(base.replace('localhost', '127.0.0.1') + '/footage.html'); await nat.waitForFunction(() => window.MWLocal && window.FT && FT.ui, null, { timeout: 20000 }); await nat.click('nav button[data-p="set"]'); await nat.evaluate(() => { document.getElementById('locFold').open = true; }); await nat.click('#locScan'); await nat.waitForTimeout(800);
  const loc = await nat.evaluate(() => ({ info: document.getElementById('locInfo').textContent, a: MWLocal.urlOf({ name: 'a.mp4', size: 100 }), thai: MWLocal.urlOf({ name: 'ก b.mp4', size: 7 }), miss: MWLocal.urlOf({ name: 'a.mp4', size: 101 }), trashed: MWLocal.urlOf({ name: '.trashed-1999999999-a.mp4', size: 100 }), listed: MWLocal.list().some((x) => /^\./.test(x.name)), has: FT.ui.hasSrc({ name: 'a.mp4', size: 100 }), over: document.documentElement.scrollWidth > innerWidth + 1 }));
  check('หน้าฟุตเทจ (ในแอพ): สแกนวิดีโอในมือถือ จับคู่ชื่อ|ขนาด เล่นจากไฟล์ในเครื่องได้ ข้ามโฟลเดอร์ที่อ่านไม่ได้ · ไฟล์ซ่อน (.trashed-… จากถังขยะของแอนดรอยด์) ไม่นับเป็นคลิป', /สแกนแล้ว 2 อัลบั้ม · วิดีโอ 2 ไฟล์/.test(loc.info) && loc.a === 'https://localhost/_capacitor_file_/s/a/a.mp4' && loc.thai === 'https://localhost/_capacitor_file_/s/a/' + encodeURIComponent('ก b.mp4') && loc.miss === null && loc.has === true && loc.trashed === null && loc.listed === false && !natErr.length && !loc.over, JSON.stringify(loc) + natErr.join(';'));
  await nat.close();
  // บันทึก/แชร์ไฟล์ (MWNative): เบราว์เซอร์ = ดาวน์โหลดตามเดิม · ในแอพ = Filesystem เขียนทีละก้อน (ชื่อเดิมเขียนไม่ได้ → ชื่อใหม่) + Share ผ่านแคช
  const [webDl] = await Promise.all([foot.page.waitForEvent('download', { timeout: 5000 }).catch(() => null), foot.page.evaluate(() => MWNative.save(new Blob(['x']), 't.txt'))]);
  check('บันทึกไฟล์ (เบราว์เซอร์): ดาวน์โหลดตามเดิม', !!webDl && webDl.suggestedFilename() === 't.txt');
  const nv = await context.newPage(); const nvErr = [];
  nv.on('pageerror', (e) => nvErr.push(e.message));
  await nv.addInitScript(() => { window.__w = []; window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: () => true,
    Plugins: { Filesystem: { writeFile: async (o) => { if (o.path === 'Meowrin/blocked.txt') throw new Error('EACCES'); window.__w.push(['w', o.path, o.directory, o.data.length]); },
      appendFile: async (o) => { window.__w.push(['a', o.path, o.directory, o.data.length]); }, getUri: async (o) => ({ uri: 'file:///x/' + o.path }) },
      Share: { share: async (o) => { window.__w.push(['share', o.files[0]]); } },
      Media: { getAlbums: async () => ({ albums: window.__al || [] }), createAlbum: async (o) => { window.__al = [{ name: o.name, identifier: '/s/' + o.name }]; window.__w.push(['album', o.name]); }, saveVideo: async (o) => { window.__w.push(['gal', o.path, o.albumIdentifier, o.fileName]); } } } }; });
  await nv.goto(base + '/footage.html'); await nv.waitForTimeout(1200);
  const nres = await nv.evaluate(async () => {
    const r1 = await MWNative.save(new Blob([new Uint8Array(13 * 1024 * 1024)]), 'big.mp4'), r2 = await MWNative.save(new Blob(['x']), 'blocked.txt');
    await MWNative.share(new Blob(['y']), 'a.mp3', 'a'); return { r1, r2, w: window.__w, can: MWNative.canShare() };
  });
  const big = nres.w.filter((x) => x[1] === 'Meowrin/big.mp4');
  check('บันทึกไฟล์ (ในแอพ): เขียน 13 MB เป็น 3 ก้อน ลง Documents/Meowrin ต่อกันได้', big.length === 3 && big[0][0] === 'w' && big[1][0] === 'a' && big[2][0] === 'a' && big[0][3] === 8388608 && big[0][2] === 'DOCUMENTS' && nres.r1.path === 'Documents/Meowrin/big.mp4', JSON.stringify(nres.r1) + JSON.stringify(big));
  check('บันทึกวิดีโอ (ในแอพ): ก๊อปเข้าแกลเลอรี อัลบั้ม Meowrin ให้ CapCut เห็น · ไฟล์ที่ไม่ใช่วิดีโอไม่เข้า', nres.r1.gallery === true && nres.w.some((x) => x[0] === 'gal' && x[1] === 'file:///x/Meowrin/big.mp4' && x[2] === '/s/Meowrin' && x[3] === 'big') && nres.w.some((x) => x[0] === 'album') && !nres.w.some((x) => x[0] === 'gal' && /blocked/.test(x[1])), JSON.stringify(nres.w.filter((x) => /^(gal|album)$/.test(x[0]))));
  /* APK ใหม่ที่มีปลั๊กอิน MediaScan: สั่งสแกนไฟล์ใน Documents ตรงๆ (ไม่ก๊อปซ้ำเข้าแกลเลอรี) · ไม่มี stat = ไม่อ้างว่าตรวจขนาดแล้ว */
  const ms = await context.newPage();
  await ms.addInitScript(() => { window.__w = []; window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: () => true,
    Plugins: { Filesystem: { writeFile: async () => {}, appendFile: async () => {}, getUri: async (o) => ({ uri: 'file:///x/' + o.path }) },
      MediaScan: { scan: async (o) => { window.__w.push(['scan', o.path, o.mime]); return { indexed: true }; } },
      Media: { getAlbums: async () => ({ albums: [] }), createAlbum: async () => {}, saveVideo: async () => { window.__w.push(['gal']); } } } }; });
  await ms.goto(base + '/footage.html'); await ms.waitForTimeout(1000);
  const msr = await ms.evaluate(async () => { const r = await MWNative.save(new Blob(['abc']), 'v.mp4'); return { r, w: window.__w }; });
  check('บันทึกวิดีโอ (ในแอพ, APK ใหม่): สแกนไฟล์ใน Documents ให้แกลเลอรีเห็น ไม่ก๊อปซ้ำ · ไม่มี stat = ไม่อ้างว่าตรวจขนาดแล้ว', msr.r.scanned === true && msr.r.verified === false && msr.r.gallery === false && msr.w.some((x) => x[0] === 'scan' && x[1] === 'file:///x/Meowrin/v.mp4' && x[2] === 'video/mp4') && !msr.w.some((x) => x[0] === 'gal'), JSON.stringify(msr));
  await ms.close();
  check('บันทึกไฟล์ (ในแอพ): ชื่อเดิมเขียนไม่ได้ → ใช้ชื่อใหม่', /^Documents\/Meowrin\/blocked-\d+\.txt$/.test(nres.r2.path) && nres.w.some((x) => /^Meowrin\/blocked-\d+\.txt$/.test(x[1])), JSON.stringify(nres.r2));
  check('แชร์ไฟล์ (ในแอพ): เขียนลงแคชแล้วเปิดหน้าต่างแชร์', nres.can === true && nres.w.some((x) => x[0] === 'w' && x[2] === 'CACHE') && nres.w.some((x) => x[0] === 'share' && /^file:\/\/\/x\/share\//.test(x[1])) && !nvErr.length, JSON.stringify(nres.w.slice(-3)) + nvErr.join(';'));
  await nv.close();
  // สำรองเป็นไฟล์แล้วแชร์ (ในแอพ ล็อกอิน Google ไม่ได้): แถบสำรองด่วนของหน้าหลักกับหน้าฟุตเทจ + ซ่อนส่วน Google Drive
  for (const [pg, qid, nm] of [['index.html', 'gdQuick', 'meowrin-factory-backup.json'], ['footage.html', 'gdFootQuick', 'meowrin-footage-index.json']]) {
    const bk = await context.newPage(); const bkErr = []; bk.on('pageerror', (e) => bkErr.push(e.message));
    await bk.addInitScript(() => { window.__w = []; window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: () => true,
      Plugins: { Filesystem: { writeFile: async (o) => { window.__w.push(['w', o.path, o.directory]); }, appendFile: async () => {}, getUri: async (o) => ({ uri: 'file:///x/' + o.path }) },
        Share: { share: async (o) => { window.__w.push(['share', o.files[0]]); } } } }; });
    await bk.goto(base + '/' + pg); await bk.waitForFunction(() => (window.MW || (window.FT && FT.ui)), null, { timeout: 20000 }); await bk.waitForTimeout(500);
    await bk.click(pg === 'footage.html' ? 'nav button[data-p="set"]' : 'nav button[data-tab="settings"]');
    await bk.click('#' + qid); await bk.waitForTimeout(1500);
    const br = await bk.evaluate(() => ({ w: window.__w, last: (MWStore.get('mw_gdrive_v1', {}) || {}), msg: (document.querySelector('#gdQuickMsg, #gdFootQuickMsg') || {}).textContent || '', gone: ['gdConnect', 'gdFold', 'gdClient', 'gdFootNow', 'gdFootRestore', 'gdRestore'].filter((x) => document.getElementById(x)).length === 0 && !('MWDrive' in window) }));
    check('สำรองเป็นไฟล์ (ในแอพ ' + pg + '): เขียนแคช ' + nm + ' แล้วเปิดหน้าต่างแชร์ + จดเวลา + ไม่มีส่วน Google Drive เหลือ', br.w.some((x) => x[0] === 'w' && x[2] === 'CACHE' && x[1].endsWith(nm)) && br.w.some((x) => x[0] === 'share') && (pg === 'index.html' ? br.last.last : br.last.lastFoot) > 0 && br.gone && bkErr.length === 0, JSON.stringify(br).slice(0, 200) + bkErr.join());
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
    /* end = ท้ายฉาก: คลิปแดง 0-1 วิ ต่อด้วยน้ำเงิน · ช็อต start 0.5 end 1 ยาว 1 วิ → ครึ่งหลังต้องค้างแดง ไม่ไหลไปน้ำเงิน */
    { const c = document.createElement('canvas'); c.width = 320; c.height = 180; const x = c.getContext('2d'); const o = new mb.Output({ format: new mb.Mp4OutputFormat(), target: new mb.BufferTarget() }); const vs = new mb.CanvasSource(c, { codec: 'vp9', quality: mb.QUALITY_HIGH }); o.addVideoTrack(vs); await o.start(); for (let i = 0; i < 60; i++){ x.fillStyle = i < 30 ? '#c00' : '#00c'; x.fillRect(0, 0, 320, 180); await vs.add(i / 30, 1 / 30); } await o.finalize();
      const rb = URL.createObjectURL(new Blob([o.target.buffer], { type: 'video/mp4' }));
      const re = await exportShots({ shots: [{ url: rb, start: 0.5, end: 1, dur: 1 }, { url: blue, start: 0, dur: 0.3 }], width: 270, height: 480, fps: 30, codec: 'vp9' });
      v.src = URL.createObjectURL(re.blob); await new Promise((ok) => { v.onloadedmetadata = ok; }); out.endClamp = (await at(0.3)) + (await at(0.9)) + (await at(1.15)); }
    /* ตรวจจุดตัดฉาก: คลิปขาว 0-1 วิ ต่อด้วยดำ · ช็อต A เริ่ม 0.6 ยาว 1 วิ → ต้องค้างขาวไม่ไหลเข้าดำ · ช็อต B เริ่ม 0.9 (หัวติดฉากเดิม ตัดที่ 1.0) → ต้องเริ่มที่ดำเลย */
    { const c = document.createElement('canvas'); c.width = 320; c.height = 180; const x = c.getContext('2d'); const o = new mb.Output({ format: new mb.Mp4OutputFormat(), target: new mb.BufferTarget() }); const vs = new mb.CanvasSource(c, { codec: 'vp9', quality: mb.QUALITY_HIGH }); o.addVideoTrack(vs); await o.start(); for (let i = 0; i < 90; i++){ x.fillStyle = i < 30 ? '#fff' : '#000'; x.fillRect(0, 0, 320, 180); await vs.add(i / 30, 1 / 30); } await o.finalize();
      const wb = URL.createObjectURL(new Blob([o.target.buffer], { type: 'video/mp4' })), lum = async (t) => { v.currentTime = t; await new Promise((ok) => v.onseeked = ok); cx.drawImage(v, 0, 0, 27, 48); return cx.getImageData(1, 1, 1, 1).data[0] > 128 ? 'W' : 'K'; };
      const ra = await exportShots({ shots: [{ url: wb, start: 0.6, dur: 1 }], width: 270, height: 480, fps: 30, codec: 'vp9' });
      v.src = URL.createObjectURL(ra.blob); await new Promise((ok) => { v.onloadedmetadata = ok; }); out.cutHold = (await lum(0.1)) + (await lum(0.5)) + (await lum(0.9));
      const rb2 = await exportShots({ shots: [{ url: wb, start: 0.9, dur: 0.6 }], width: 270, height: 480, fps: 30, codec: 'vp9' });
      v.src = URL.createObjectURL(rb2.blob); await new Promise((ok) => { v.onloadedmetadata = ok; }); out.cutLead = (await lum(0.05)) + (await lum(0.4));
      const rc = await exportShots({ shots: [{ url: wb, start: 0.6, dur: 1, cuts: false }], width: 270, height: 480, fps: 30, codec: 'vp9' });
      v.src = URL.createObjectURL(rc.blob); await new Promise((ok) => { v.onloadedmetadata = ok; }); out.cutOff = (await lum(0.1)) + (await lum(0.9)); }
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
  check('ส่งออกวิดีโอเร็ว (exporter.js): ช็อตยาวกว่าฉาก (end) ค้างเฟรมท้ายฉาก ไม่ไหลไปฉากถัดไปในไฟล์', exr.endClamp === 'RRB', String(exr.endClamp));
  check('ส่งออกวิดีโอเร็ว: ตรวจจุดตัดฉาก — ช็อตที่จะไหลเข้าฉากอื่น ค้างเฟรมสุดท้ายแทน', exr.cutHold === 'WWW', String(exr.cutHold));
  check('ส่งออกวิดีโอเร็ว: หัวช็อตติดฉากก่อนหน้า (ตัดที่ 0.1 วิ) ขยับเริ่มหลังจุดตัด', exr.cutLead === 'KK', String(exr.cutLead));
  check('ส่งออกวิดีโอเร็ว: cuts:false (สตูดิโอ) ไม่ตรวจ ไหลตามช่วงที่เลือก', exr.cutOff === 'WK', String(exr.cutOff));
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
    /* แบบ 2 สไตล์ช่อง (square): ไฟล์ 1080x1080 */
    const m3 = []; const r3 = await FT.stitch.make(list, () => {}, (m) => m3.push(m), { voice, square: true }).catch((e) => { throw new Error(e.message + ' / ' + m3.join(' / ')); });
    const vt3 = await new mb.Input({ source: new mb.BlobSource(r3.file), formats: mb.ALL_FORMATS }).getPrimaryVideoTrack(); out.sq = { fast: r3.fast, w: vt3.displayWidth, h: vt3.displayHeight };
    /* pan: ภาพแนวนอน ซ้ายแดง ขวาน้ำเงิน วาดลงจัตุรัส → ภาพคู่ (i=0) เริ่มเห็นฝั่งขวา (น้ำเงิน) แล้วเลื่อนไปฝั่งซ้าย (แดง) · ภาพคี่กลับทิศ · ไม่มีขอบดำ */
    { const im = document.createElement('canvas'); im.width = 320; im.height = 180; const ix = im.getContext('2d'); ix.fillStyle = '#c00'; ix.fillRect(0, 0, 160, 180); ix.fillStyle = '#00c'; ix.fillRect(160, 0, 160, 180);
      const cv = document.createElement('canvas'); cv.width = 100; cv.height = 100; const g = cv.getContext('2d');
      const px = (p, i, x) => { FT.stitch.pan(g, 100, 100, im, 320, 180, p, i); const d = g.getImageData(x, 50, 1, 1).data; return d[0] > 100 ? 'R' : d[2] > 100 ? 'B' : 'K'; };
      out.panFx = [px(0, 0, 5), px(1, 0, 5), px(0, 1, 5), px(1, 1, 5)].join('') + '|' + [(FT.stitch.pan(g, 100, 100, im, 320, 180, 0.5, 0, 0.9), g.getImageData(95, 50, 1, 1).data[2] > 100 ? 'B' : 'K'), (FT.stitch.pan(g, 100, 100, im, 320, 180, 0.5, 0, 0.1), g.getImageData(5, 50, 1, 1).data[0] > 100 ? 'R' : 'K')].join('');
      out.pan = px(0, 0, 50) + px(1, 0, 50) + px(0, 1, 50) + px(1, 1, 50) + px(0, 0, 0) + px(1, 0, 99); }
    FT.ui.srcUrl = async () => ({ url: '/ไม่มีไฟล์นี้.mp4' });
    try { const r2 = await FT.stitch.make(list, () => {}, (m) => msgs.push(m), { voice }); out.fb = { fast: !!r2.fast, msgs }; } catch (e) { out.fb = { err: e.message, msgs }; }
    return out;
  });
  check('ตัดต่อในแท็บผู้กำกับ (มีเสียงพากย์): ใช้ทางเร็ว ได้ mp4 ยาว 2 วิ มีเสียง ลำดับช็อตถูก', sfr.fast === true && /\.mp4$/.test(sfr.name) && sfr.steps.join() === '0,1' && Math.abs(sfr.ad - 2) < 0.15 && Math.abs(sfr.vd - 2) < 0.1 && sfr.marks.length === 2 && sfr.marks[0][1] === 1, JSON.stringify(sfr).slice(0, 400));
  check('ตัดต่อแบบ 2 สไตล์ช่อง (square): ไฟล์ 1:1 ขนาด 1080x1080 ทางเร็ว', !!sfr.sq && sfr.sq.fast === true && sfr.sq.w === 1080 && sfr.sq.h === 1080, JSON.stringify(sfr.sq));
  check('ตัดต่อแบบ 2: ตัวละครอยู่ขอบขวา/ซ้าย (fx) หน้าต่างครอปเกาะตัวละคร ไม่ตัดหลุด', /\|BR$/.test(sfr.panFx || ''), String(sfr.panFx));
  check('ตัดต่อแบบ 2: ภาพเลื่อนซ้าย/ขวา (pan) สลับทิศทุกภาพ ไม่มีขอบดำ', sfr.pan === 'BRRBRB', String(sfr.pan));
  check('ตัดต่อในแท็บผู้กำกับ: ไฟล์ต้นทางเปิดไม่ได้ → บอกข้อความว่าตัดแบบเร็วไม่ได้ แล้วถอยไปแบบเดิม (ไม่เงียบ)', !!sfr.fb && sfr.fb.msgs.some((m) => /ตัดแบบเร็วไม่ได้/.test(m)) && sfr.fb.fast !== true, JSON.stringify(sfr.fb).slice(0, 300));
  await sf.close();
  // หน้าตั้งค่าแบบใหม่: เครื่องมือ = อัลบั้ม / ตัดต่ออัตโนมัติ / ซับจอเขียว · ตรวจระบบแอพเป็นแถบเล็กท้ายหน้า (ไม่ใช่กล่องใหญ่) · footage.html?tab=plan เปิดแท็บผู้กำกับตรง · หน้าตรวจระบบเหลือ 3 ข้อ
  const hm = await context.newPage(); const hmErr = []; hm.on('pageerror', (e) => hmErr.push(e.message));
  await hm.goto(base + '/index.html'); await hm.waitForFunction(() => window.MW, null, { timeout: 20000 }); await hm.click('nav [data-tab=settings]');
  const tl = await hm.evaluate(() => ({ tiles: [...document.querySelectorAll('#tab-settings .tool b')].map((b) => b.textContent), plan: document.querySelector('#tab-settings .tool[href="footage.html?tab=plan"]') ? 1 : 0, chk: [...document.querySelectorAll('#tab-settings a.btn')].some((a) => a.getAttribute('href') === 'check.html' && /ตรวจระบบแอพ/.test(a.textContent)) }));
  check('ตั้งค่า: เครื่องมือเป็น อัลบั้ม / ตัดต่ออัตโนมัติ / ซับจอเขียว / สตูดิโอ และตรวจระบบเป็นแถบเล็กท้ายหน้า', tl.tiles.join('|') === 'อัลบั้ม|ตัดต่ออัตโนมัติ|ซับจอเขียว|สตูดิโอ' && tl.plan === 1 && tl.chk && !hmErr.length, JSON.stringify(tl) + hmErr.join());
  const ex1 = await hm.evaluate(() => [...document.querySelectorAll('#tab-settings .tool')].filter((a) => a.offsetParent).map((a) => a.querySelector('b').textContent).join('|'));
  await hm.evaluate(() => document.getElementById('expToggle').click());
  const ex2 = await hm.evaluate(() => [...document.querySelectorAll('#tab-settings .tool')].filter((a) => a.offsetParent).map((a) => a.querySelector('b').textContent).join('|'));
  check('ตั้งค่า: ตัดต่ออัตโนมัติ/สตูดิโอซ่อนไว้ (เห็นแค่ อัลบั้ม/ซับจอเขียว) · แตะ เครื่องมือทดลอง = แสดงครบ', ex1 === 'อัลบั้ม|ซับจอเขียว' && ex2 === 'อัลบั้ม|ตัดต่ออัตโนมัติ|ซับจอเขียว|สตูดิโอ', ex1 + ' // ' + ex2);
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
  const dlg = await al.evaluate(() => document.body.textContent.includes('ให้ AI ทำดัชนี 2 คลิป') && document.body.textContent.includes('ประมาณ') && /• \w+\.mp4/.test(document.body.textContent));
  await al.getByRole('button', { name: 'เริ่ม', exact: true }).click(); await al.waitForTimeout(1500);
  const qi = await al.evaluate(() => ({ q: FT.ui.queueInfo(), runMsg: document.getElementById('queue') ? document.querySelectorAll('#queue li').length : -1 }));
  check('อัลบั้ม: กด ให้ AI ทำที่เหลือ → ไม่มีคีย์เตือนก่อน → มีคีย์ถามราคาประมาณ → ต่อคิว 2 คลิป (เฉพาะที่ยังไม่ทำ) เริ่มทำ', nokey && dlg && qi.q.total === 2 && qi.runMsg === 2, JSON.stringify({ nokey, dlg, qi }));
  await al.waitForFunction(() => document.body.textContent.includes('ทำไม่สำเร็จ'), null, { timeout: 20000 }).catch(() => {});
  const idxFail = await al.evaluate(() => ({ txt: document.body.textContent.includes('ทำไม่สำเร็จ'), names: /• \w+\.mp4/.test(document.body.textContent) }));
  check('อัลบั้ม: ทำดัชนีพลาด → ขึ้นกล่องบอกชื่อคลิปที่พลาด + เหตุผล (ไม่ค้างเงียบๆ) · กล่องยืนยันก่อนเริ่มโชว์ชื่อคลิปที่จะทำ', idxFail.txt && idxFail.names, JSON.stringify(idxFail));
  await al.getByRole('button', { name: /ตกลง|ปิด|OK/ }).first().click().catch(() => {}); await al.waitForTimeout(200);
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
  await v8p.goto(base + '/footage.html'); await v8p.waitForFunction(() => window.FT && FT.ui && document.getElementById('alGrid'), null, { timeout: 20000 }); await v8p.waitForSelector('#alGrid .album', { timeout: 8000 }).catch(() => {}); await v8p.waitForTimeout(300); // รอจนอัลบั้มขึ้นจริง (เดิมรอเวลาตายตัว เครื่องช้าแล้วพลาดเป็นครั้งคราว)
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
  // v8.84 ค้นชื่อตัวละครตัวเดียว = มีป้ายทางลัดไปอัลบั้ม · การ์ดผลค้นหาเรียงแนวตั้ง รูปฉากกว้างกว่าเดิม ไม่ล้นจอ · ช่องค้นหากับปุ่มถาม AI อยู่แถวเดียวกัน
  await sq.evaluate(() => document.dispatchEvent(new CustomEvent('ft:lib')));
  await sq.fill('#q', 'ลูฟี่'); await sq.waitForTimeout(700);
  const bn = await sq.evaluate(() => { const b = document.querySelector('#results .albanner'), sc = document.querySelector('#results .card .scene, #results .card .cover'), q = document.getElementById('q').getBoundingClientRect(), a = document.getElementById('askBtn').getBoundingClientRect(); return { txt: b ? b.textContent : '', cardW: document.querySelector('#results .card') ? document.querySelector('#results .card').getBoundingClientRect().width : 0, tW: document.querySelector('#results .card .t') ? document.querySelector('#results .card .t').getBoundingClientRect().width : 0, sameRow: Math.abs(q.top - a.top) < 6, over: document.documentElement.scrollWidth > innerWidth + 1, has: !!sc }; });
  await sq.click('#results .albanner'); await sq.waitForTimeout(400);
  const bn2 = await sq.evaluate(() => ({ view: !document.getElementById('alView').hidden, title: document.getElementById('alvTitle').textContent, q: document.getElementById('q').value }));
  check('ค้น "ลูฟี่" = มีป้าย "อัลบั้ม luffy" กดแล้วเปิดอัลบั้มนั้น (ล้างคำค้น) · การ์ดข้อความกว้างเกือบเต็มการ์ด · ช่องค้นหา+ปุ่มถาม AI แถวเดียว · ไม่ล้นจอ', /luffy/.test(bn.txt) && bn.sameRow && !bn.over && bn.tW > bn.cardW * 0.8 && bn2.view && bn2.title === 'luffy' && !bn2.q && !sqErr.length, JSON.stringify([bn, bn2]) + sqErr.join());
  await sq.click('#alBack'); await sq.waitForTimeout(300); // ปิดอัลบั้ม กลับตาราง ให้เทสต์ถัดไปเริ่มจากหน้ารวม
  // ถาม AI หาฟุต (footage-ask.js): คำถามไทย → AI แปลงเป็นตัวละคร+คำค้น → ค้นดัชนีในเครื่อง (ฉากซันจิเท่านั้นเข้า AI) → AI เลือก → การ์ดฉาก · ไม่เจอเลย = บอกว่าไม่เจอโดยไม่เรียก AI ขั้นเลือก · AI บอกไม่ตรง = ไม่โชว์ฉากหลอก
  const ak = await context.newPage(); const akErr = []; ak.on('pageerror', (e) => akErr.push(e.message));
  await ak.goto(base + '/footage.html'); await ak.waitForFunction(() => window.FT && FT.ui && document.getElementById('askBtn'), null, { timeout: 20000 }); await ak.waitForTimeout(400);
  await ak.evaluate(() => {
    const mk = (id, name, chars, th, sum, emo) => ({ id, name, size: 5, album: 'x', duration: 20, status: 'done', lastModified: 1, cover: '', scenes: [{ s: 4, e: 9, thumb: '', ai: { characters: chars, characters_th: th, emotion: emo, summary_th: sum } }] });
    FT.ui.lib().push(mk('a1', 'sanji_cry.mp4', ['Sanji'], ['ซันจิ'], 'ซันจิร้องไห้น้ำตาไหล', 'crying'), mk('a2', 'sanji_laugh.mp4', ['Sanji'], ['ซันจิ'], 'ซันจิหัวเราะ', 'laughing'), mk('a3', 'zoro_cry.mp4', ['Zoro'], ['โซโร'], 'โซโรร้องไห้', 'crying'));
    MWStore.set('mw_openrouter_key_v1', 'k'); window.__bodies = []; window.__mode = 'ok';
    const real = window.fetch; window.fetch = async (u, o) => {
      if (!/openrouter/.test(String(u))) return real(u, o);
      const t = JSON.parse(o.body).messages[0].content; window.__bodies.push(t);
      const out = /search terms/.test(t) ? (window.__mode === 'none' ? { chars: [], keys: ['กินเค้ก'], arc: '' } : { chars: ['Sanji'], keys: ['ร้องไห้', 'น้ำตา'], arc: '' }) : (window.__mode === 'nopick' ? { answer: 'ดูแล้วไม่มีฉากไหนตรง', none: true, picks: [] } : { answer: 'เจอ 1 ฉากใน sanji_cry นาที 0:04', none: false, picks: [{ n: 1, why: 'ซันจิร้องไห้' }] });
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(out) } }], usage: { cost: 0.002 } }) };
    };
  });
  await ak.fill('#q', 'ซันจิร้องไห้อยู่คลิปไหน'); await ak.click('#askBtn'); await ak.waitForFunction(() => /เจอ 1 ฉาก/.test(document.getElementById('askOut').textContent), null, { timeout: 10000 });
  const ak1 = await ak.evaluate(() => ({ cards: document.querySelectorAll('#results .card').length, txt: document.getElementById('results').textContent, pick: window.__bodies[1], main: document.getElementById('alMain').hidden }));
  check('ถาม AI: AI เห็นเฉพาะฉากซันจิที่เกี่ยวข้อง (ไม่มีโซโร) · โชว์การ์ดฉากที่ AI เลือก 1 ใบ พร้อมชื่อคลิป · ตารางอัลบั้มซ่อน', ak1.cards === 1 && /sanji_cry/.test(ak1.txt) && /sanji_cry/.test(ak1.pick) && !/zoro_cry/.test(ak1.pick) && ak1.main, JSON.stringify(ak1).slice(0, 400));
  const akl = await ak.evaluate(async () => { const c = { id: 'a9', name: 'long_talk.mp4', size: 9, album: 'x', duration: 40, status: 'done', lastModified: 1, cover: '', scenes: [{ s: 0, e: 30, thumb: '', ai: { characters: ['Sanji', 'Luffy'], characters_th: ['ซันจิ', 'ลูฟี่'], summary_th: 'ซันจิคุยกับลูฟี่' } }], speech: { segs: Array.from({ length: 14 }, (_, i) => ({ s: i * 2, e: i * 2 + 1.5, who: 'Sanji', t: i === 12 ? 'ฉันเตรียมเสบียงของแปดคนไว้แล้ว' : 'พูดเรื่องอื่นยาวๆ ไปเรื่อยๆ ' + i + ' เพื่อให้บทยาวเกินกำหนด' })), looks: {} } }; FT.ui.lib().push(c); window.__bodies = []; window.__mode = 'ok'; document.getElementById('q').value = 'ซันจิถามเสบียง'; document.getElementById('askBtn').click(); await new Promise((r) => setTimeout(r, 1500)); const pick = window.__bodies.find((b) => /Candidates/.test(b)) || ''; FT.ui.lib().splice(FT.ui.lib().indexOf(c), 1); return /เสบียงของแปดคน/.test(pick); });
  check('ถาม AI: บทพูดฉากยาว ส่งบรรทัดที่ตรงคำถามให้ AI ด้วย (เดิมตัดแค่ 140 ตัวอักษรแรก → ประโยคท้ายๆ หลุด ตอบ "ไม่มี")', akl === true);
  const akr = await ak.evaluate(async () => { const L = FT.ui.lib(), add = [], mk = (id, who, th, t) => ({ id, name: id + '.mp4', size: 7, album: 'x', duration: 30, status: 'done', lastModified: 1, cover: '', scenes: [{ s: 0, e: 20, thumb: '', ai: { characters: who, characters_th: th, summary_th: 'คุยกัน' } }], speech: { segs: [{ s: 1, e: 5, who: who[0], t }], looks: {} } });
    for (let i = 0; i < 70; i++) add.push(mk('rr' + i, ['Sanji', 'Luffy'], ['ซันจิ', 'ลูฟี่'], 'ถามเรื่องนี้เรื่องนั้นเรื่องโน้น ' + i)); add.push(mk('rrtarget', ['Sanji', 'Luffy'], ['ซันจิ', 'ลูฟี่'], 'เสบียงของแปดคนหายไป')); L.push(...add); window.__bodies = []; window.__mode = 'ok'; document.getElementById('q').value = 'ซันจิถามลูฟี่เรื่องเสบียง'; document.getElementById('askBtn').click(); await new Promise((r) => setTimeout(r, 1800)); const pick = window.__bodies.find((b) => /Candidates/.test(b)) || ''; add.forEach((c) => L.splice(L.indexOf(c), 1)); return /rrtarget/.test(pick); });
  check('ถาม AI: คำหายาก (เสบียง) มีน้ำหนักกว่าคำที่เจอทุกฉาก (เรื่อง/ถาม) → ฉากที่มีคำนั้นไม่หลุดจากผู้สมัครแม้มีฉากซันจิ+ลูฟี่คล้ายๆ 70 ฉาก', akr === true);
  const akt = await ak.evaluate(() => ({ a: FT.ui.terms('ซันจิกำลังถามลูฟี่เรื่องเสบียง').map((v) => v.join('|')).join(' + '), b: FT.ui.terms('เรือเดินทะเล').map((v) => v.join('|')).join(' + ') }));
  check('ค้นหา: "เรื่อง" ไม่ไปจับกลุ่มคำพ้อง เรือ/พายเรือ (nzk ตัดวรรณยุกต์ เรื่อง=เรือง) · แต่ "เรือ" จริงยังจับได้', !/เรือ/.test(akt.a) && /เรือ/.test(akt.b), JSON.stringify(akt));
  const akg = await ak.evaluate(async () => { const before = document.querySelectorAll('#results .card').length, act = FT.ui.askActive(); FT.ui.renderAll(); await new Promise((r) => setTimeout(r, 200)); return { before, act, after: document.querySelectorAll('#results .card').length }; });
  check('ถาม AI: คำตอบที่โชว์อยู่ไม่ถูกค้นหาอัตโนมัติทับ (เช่น ตอนคลิปทำดัชนีเสร็จ/โหลดคลังใหม่)', akg.act === true && akg.before === 1 && akg.after === 1, JSON.stringify(akg));
  await ak.evaluate(() => { window.__mode = 'nopick'; window.__bodies = []; }); await ak.click('#askBtn'); await ak.waitForFunction(() => /ไม่มีฉากไหนตรง/.test(document.getElementById('askOut').textContent), null, { timeout: 10000 });
  check('ถาม AI: AI บอกไม่มีฉากไหนตรง → ไม่โชว์การ์ดหลอก บอกตรงๆ', (await ak.evaluate(() => document.querySelectorAll('#results .card').length)) === 0 && /ไม่มีฉากไหนตรง/.test(await ak.evaluate(() => document.getElementById('results').textContent)));
  await ak.evaluate(() => { window.__mode = 'none'; window.__bodies = []; }); await ak.fill('#q', 'ฉากกินเค้ก'); await ak.click('#askBtn'); await ak.waitForFunction(() => /ไม่เจอฉากที่ตรงในคลังเลย/.test(document.getElementById('askOut').textContent), null, { timeout: 10000 });
  check('ถาม AI: ค้นในคลังไม่เจอผู้สมัครเลย = บอกว่าไม่เจอ และไม่เรียก AI ขั้นเลือก (ไม่เสียเงินเพิ่ม)', (await ak.evaluate(() => window.__bodies.length)) === 1 && !akErr.length, akErr.join());
  check('ถาม AI: ตอบ "ไม่เจอเลย" แล้วปุ่ม ถาม AI กดใหม่ได้ (เดิมค้างกดไม่ได้จนโหลดหน้าใหม่)', !(await ak.evaluate(() => document.getElementById('askBtn').disabled)));
  await ak.fill('#q', ''); await ak.waitForTimeout(300);
  check('ถาม AI: ล้างคำค้น = ล้างคำตอบ', await ak.evaluate(() => document.getElementById('askOut').hidden));
  // v8.63 ค้นหาแบบเข้าใจความหมาย (footage-embed.js): ทำเวกเตอร์ (จำลอง embed: คำพ้องความหมายลงมิติเดียวกัน) → ถาม AI เจอฉากที่ไม่มีคำตรงกันเลย · ทำเฉพาะฉากที่ข้อความเปลี่ยน · ลบดัชนี = ถอยไปค้นด้วยคำ
  await ak.evaluate(() => {
    const mk = (id, name, sum) => ({ id, name, size: 5, album: 'x', duration: 20, status: 'done', lastModified: 1, cover: '', scenes: [{ s: 1, e: 6, thumb: '', ai: { characters: [], characters_th: [], summary_th: sum } }] });
    FT.ui.lib().push(mk('e1', 'nami_sad.mp4', 'นามิน้ำตาคลอเศร้า'), mk('e2', 'luffy_fun.mp4', 'ลูฟี่หัวเราะเสียงดัง')); window.__embCalls = []; window.__embQ = [];
    const dim = (w) => /ร้องไห้|น้ำตา|เสียใจ|เศร้า/.test(w) ? 0 : /หัวเราะ|ยิ้ม|ตลก/.test(w) ? 1 : 2 + (w.length % 20);
    FT.embed = async (texts) => { window.__embCalls.push(texts.length); texts.forEach((t) => window.__embQ.push(t)); return { vecs: texts.map((t) => { const v = new Float32Array(32); (t.match(/ร้องไห้|น้ำตา|เสียใจ|เศร้า|หัวเราะ|ยิ้ม|ตลก|[ก-๙a-z_]+/g) || []).forEach((w) => { v[dim(w)] += 1; }); return v; }), tokens: texts.length * 100, cost: 0.0001 }; };
    const prev = window.fetch; window.fetch = async (u, o) => { if (window.__mode !== 'sem' || !/openrouter/.test(String(u))) return prev(u, o); const t = JSON.parse(o.body).messages[0].content; window.__bodies.push(t);
      const out = /search terms/.test(t) ? { chars: [], keys: ['เสียใจ'], arc: '' } : { answer: 'เจอ 1 ฉากความหมายใกล้', picks: [{ n: 1, why: 'น้ำตา' }], none: false };
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(out) } }], usage: { cost: 0.002 } }) }; };
  });
  const em1 = await ak.evaluate(async () => { const r = await FT.sem.build(); const st = await FT.sem.stat(); const again = await FT.sem.build(); document.getElementById('emPanel').open = true; document.dispatchEvent(new CustomEvent('ft:lib')); await new Promise((r) => setTimeout(r, 400)); return { r: { done: r.done, fail: r.fail }, st, again: again.done, calls: window.__embCalls.length, info: document.getElementById('emInfo').textContent }; });
  check('ดัชนีความหมาย: ทำเวกเตอร์ให้ฉากที่มีข้อความ (ทุกฉากในคลัง) · ทำซ้ำ = ไม่เรียกซ้ำ (0 ฉาก) · แผงโชว์จำนวน', em1.r.fail === 0 && em1.r.done === em1.st.have && em1.st.have >= 2 && em1.again === 0 && /ทำดัชนีความหมายแล้ว \d+\/\d+/.test(em1.info), JSON.stringify(em1));
  await ak.evaluate(() => { window.__mode = 'sem'; window.__bodies = []; }); await ak.fill('#q', 'ใครเสียใจ'); await ak.click('#askBtn'); await ak.waitForFunction(() => /ความหมายใกล้/.test(document.getElementById('askOut').textContent), null, { timeout: 10000 });
  const em2 = await ak.evaluate(() => ({ pick: window.__bodies[1] || '', note: document.getElementById('askOut').textContent, cards: document.querySelectorAll('#results .card').length }));
  check('ถาม AI + ความหมาย: คำถาม "ใครเสียใจ" ไม่มีคำตรงในคำอธิบาย แต่เจอฉาก nami_sad (น้ำตาคลอ) ผ่านเวกเตอร์ · ไม่เอาฉากหัวเราะ · บอกว่ารวมที่ค้นตามความหมายกี่ฉาก', /nami_sad/.test(em2.pick) && !/luffy_fun/.test(em2.pick) && /ค้นตามความหมาย \d+ ฉาก/.test(em2.note) && em2.cards === 1, JSON.stringify(em2));
  const em3 = await ak.evaluate(async () => { const c = FT.ui.lib().find((x) => x.id === 'e1'); c.scenes[0].ai.summary_th = 'นามิยิ้มตลก'; const t = await FT.sem.todo(); await FT.sem.clear(); const t2 = await FT.sem.todo(); window.__bodies = []; return { changed: t.length, afterClear: t2.length, ready: await FT.sem.ready() }; });
  check('ดัชนีความหมาย: ข้อความฉากเปลี่ยน = ทำใหม่เฉพาะฉากนั้น (1 ฉาก) · ลบดัชนี = ทำใหม่ทั้งหมด และ ready=false', em3.changed === 1 && em3.afterClear >= 2 && em3.ready === false, JSON.stringify(em3));
  await ak.evaluate(() => { window.__bodies = []; }); await ak.click('#askBtn'); await ak.waitForFunction(() => /ความหมายใกล้|ไม่เจอฉากที่ตรง/.test(document.getElementById('askOut').textContent), null, { timeout: 10000 });
  check('ถาม AI: ยังไม่มีดัชนีความหมาย = ค้นด้วยคำอย่างเดียว ไม่พัง (ไม่มี error)', !akErr.length, akErr.join());
  // ไฟล์ชื่อ+ขนาดเดียวกันในหลายโฟลเดอร์ (ก๊อปซ้ำ) มีดัชนีคลิปเดียว → นับว่าทำแล้วทั้งคู่ (บั๊กเดิม: อีกไฟล์ค้าง "ยังไม่ทำ" 1-2 คลิป กดทำที่เหลือก็ไม่หาย)
  const dp = await context.newPage(); const dpErr = []; dp.on('pageerror', (e) => dpErr.push(e.message));
  await dp.goto(base + '/footage.html'); await dp.waitForFunction(() => window.FT && FT.ui && document.getElementById('alAi'), null, { timeout: 20000 }); await dp.waitForTimeout(400);
  await dp.evaluate(() => { const D = '/storage/emulated/0/Pictures/Gallery/owner/'; const f = (n, s, a) => ({ name: n, size: s, dir: D + a + '/', album: a, uri: 'file://' + D + a + '/' + n, mtime: 1 });
    window.MWLocal.list = () => [f('dup.mp4', 9, 'strawhat gang'), f('dup.mp4', 9, 'luffy'), f('solo.mp4', 7, 'luffy'), f('new.mp4', 5, 'luffy')];
    FT.ui.lib().push({ id: 'dd1', name: 'dup.mp4', size: 9, album: 'luffy', duration: 5, status: 'done', scenes: [], lastModified: 1 }, { id: 'dd2', name: 'solo.mp4', size: 7, album: 'luffy', duration: 5, status: 'done', scenes: [], lastModified: 1 }); document.dispatchEvent(new CustomEvent('ft:lib')); });
  await dp.waitForTimeout(300);
  const dpr = await dp.evaluate(() => document.getElementById('alAi').textContent);
  check('อัลบั้ม: ไฟล์ชื่อ+ขนาดเดียวกัน 2 โฟลเดอร์ + ดัชนี 1 คลิป = นับว่าทำแล้วทั้ง 2 ไฟล์ (ทำแล้ว 3/4 เหลือ 1 ไม่ใช่ 2)', /AI ทำแล้ว 3\/4 คลิป/.test(dpr) && /ทำที่เหลือ \(1\)/.test(dpr) && !dpErr.length, dpr + dpErr.join());
  // รวมคลิปซ้ำ (ขนาด+ความยาวเท่ากัน ชื่อต่าง) ต้องจำชื่อที่ถูกรวมเป็น aliases · ไฟล์ชื่อนั้นยังนับว่าทำแล้ว ไม่ถูกขอทำใหม่ (บั๊กเดิม: ทำแล้วหาย → กดทำใหม่เสียเงิน → เปิดหน้าใหม่ถูกรวมทิ้งอีก วนไม่จบ)
  const dm = await dp.evaluate(() => {
    const lib = FT.ui.lib(); lib.length = 0;
    lib.push({ id: 'm1', name: 'a.mp4', size: 50, album: 'luffy', duration: 5, status: 'done', scenes: [], at: 1 }, { id: 'm2', name: 'b.mp4', size: 50, album: 'luffy', duration: 5, status: 'done', scenes: [], at: 2 }, { id: 'm3', name: 'c.mp4', size: 60, album: 'luffy', duration: 7, status: 'done', scenes: [], at: 3 });
    const d = FT.ui.findDupes(); const keep = d.fix[0]; lib.splice(0, lib.length, ...lib.filter((c) => !d.del.includes(c.id)));
    const D = '/storage/emulated/0/Pictures/Gallery/owner/', f = (n, s) => ({ name: n, size: s, dir: D + 'luffy/', album: 'luffy', uri: 'file://' + D + n, mtime: 1 }); window.MWLocal.list = () => [f('a.mp4', 50), f('b.mp4', 50), f('c.mp4', 60), f('n.mp4', 70)];
    document.dispatchEvent(new CustomEvent('ft:lib')); return { del: d.del, keepName: keep && keep.name, al: keep && keep.aliases, n: lib.length, url: MWLocal.urlOf({ name: 'zzz.mp4', size: 1, aliases: [{ name: 'b.mp4', size: 50 }] }) };
  });
  await dp.waitForTimeout(300);
  const dm2 = await dp.evaluate(() => document.getElementById('alAi').textContent);
  check('รวมคลิปซ้ำ: เก็บตัวที่ทำล่าสุด (b) ใส่ aliases ของ a · ไฟล์ a และ b ในมือถือนับว่าทำแล้วทั้งคู่ (ทำแล้ว 3/4 เหลือ 1)', dm.del.join() === 'm1' && dm.keepName === 'b.mp4' && dm.al.length === 1 && dm.al[0].name === 'a.mp4' && /AI ทำแล้ว 3\/4 คลิป/.test(dm2) && /ทำที่เหลือ \(1\)/.test(dm2), JSON.stringify([dm, dm2]));
  // v8.71 ตัวจับคู่ไฟล์↔ดัชนีที่เดียว: แผงจัดอัลบั้มใหม่ต้องนับ "ยังไม่ได้ทำดัชนี" ตรงกับแถบ AI (เคสจริง: แผงบอก 1 แต่แถบบอกครบ เพราะแผงไม่รู้จัก aliases) · คลิปที่ซ่อนไว้ไม่นับว่ายังไม่ทำ
  const orgCnt = await dp.evaluate(() => { const strip = document.getElementById('alAi').textContent, p = FT.organize.buildPlan(); const lib = FT.ui.lib(); lib.push({ id: 'hid1', name: 'n.mp4', size: 70, album: 'luffy', duration: 9, status: 'done', hide: true, scenes: [], at: 9 }); const p2 = FT.organize.buildPlan(); lib.pop();
    return { strip, noIdx: p.noIdx.map((x) => x.name).join(), noIdx2: p2.noIdx.length, hidden2: p2.hidden, a: FT.ui.clipFor('a.mp4', 50) && FT.ui.clipFor('a.mp4', 50).name }; });
  check('จัดอัลบั้มใหม่นับ "ยังไม่ทำดัชนี" ตรงกับแถบ AI: ไฟล์ a (alias ของ b) ไม่นับ เหลือแค่ n · คลิปที่ซ่อนไว้ไม่นับว่ายังไม่ทำ · U.clipFor หา a ผ่าน alias ได้', orgCnt.noIdx === 'n.mp4' && /ทำที่เหลือ \(1\)/.test(orgCnt.strip) && orgCnt.noIdx2 === 0 && orgCnt.hidden2 === 1 && orgCnt.a === 'b.mp4', JSON.stringify(orgCnt));
  // อัปเกรดดัชนีละเอียด: คลิปเก่าที่ไฟล์อยู่ในมือถือ (MWLocal) ต้องนับว่า "พร้อมอัปเกรด" (เดิมนับเฉพาะไฟล์ที่เลือกในรอบนี้ → ในแอพขึ้น 0)
  const up = await dp.evaluate(async () => { FT.ui.lib().push({ id: 'up1', name: 'old.mp4', size: 3, album: 'x', duration: 5, status: 'done', aiV: 1, scenes: [], lastModified: 1 }); const prev = MWLocal.urlOf; MWLocal.urlOf = (c) => c.id === 'up1' ? 'https://localhost/_capacitor_file_/x' : prev(c);
    document.getElementById('godModel').dispatchEvent(new Event('change')); await new Promise((r) => setTimeout(r, 200)); return { info: document.getElementById('deepInfo').textContent, dis: document.getElementById('deepBtn').disabled }; });
  check('อัปเกรดดัชนีละเอียด: คลิปเก่าที่ไฟล์อยู่ในมือถือนับว่าพร้อมอัปเกรด (ปุ่มกดได้) ไม่ใช่ 0', /พร้อมอัปเกรด [1-9]/.test(up.info) && !up.dis, JSON.stringify(up));
  // คิวไม่ใส่ไฟล์ซ้ำ: ไฟล์เดียวกันก๊อปไว้ 2 โฟลเดอร์ (mtime ต่างกัน) ส่งเข้าทำดัชนีพร้อมกัน = ทำครั้งเดียว ไม่จ่ายซ้ำ · ส่งซ้ำอีกรอบก็ไม่เพิ่ม
  const qd = await dp.evaluate(() => { MWLocal.fileUrl = (u) => 'https://localhost/_capacitor_file_' + u; const f = (u, m) => ({ name: 'zz.mp4', size: 11, uri: 'file://' + u, album: 'x', mtime: m }); const a = FT.ui.indexLocal([f('a/zz.mp4', 1), f('b/zz.mp4', 2)]), b = FT.ui.indexLocal([f('c/zz.mp4', 3)]); return { a, b, total: FT.ui.queueInfo().total }; });
  check('ทำดัชนี: ไฟล์ชื่อ+ขนาดเดียวกันหลายโฟลเดอร์เข้าคิวครั้งเดียว (ไม่จ่ายซ้ำ) · ส่งซ้ำไม่เพิ่ม', qd.a === 1 && qd.b === 0, JSON.stringify(qd));
  // ให้ AI ดูภาค: คำตอบมีข้อความ/ปีกกาต่อท้าย JSON ต้องอ่านได้ · ตอบเพี้ยนครั้งแรก = ลองใหม่ ไม่ล้มทั้งงาน (บั๊กจริง: "Unexpected non-whitespace character after JSON" แล้วทำไปแล้ว 0 คลิปทุกรอบ)
  await dp.evaluate(() => { MWStore.set('mw_openrouter_key_v1', 'k'); window.__arcN = 0; FT.ui.lib().push({ id: 'ar1', name: 'arc1.mp4', size: 81, album: 'x', duration: 5, status: 'done', scenes: [{ s: 0, e: 2, thumb: 'data:image/jpeg;base64,/9j/4AAQ', ai: {} }], lastModified: 1 }); document.dispatchEvent(new CustomEvent('ft:lib'));
    const prev = window.fetch; window.fetch = async (u, o) => { if (!/openrouter/.test(String(u))) return prev(u, o); const n = ++window.__arcN; const text = n === 1 ? 'ขออภัย ตอบไม่เป็น JSON' : '{"r":[{"i":1,"arc":"Alabasta"}]}\n\nหมายเหตุ: ตอบตามภาพ {ตัวอย่าง}'; return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: text } }], usage: { cost: 0.001 } }) }; }; });
  await dp.waitForTimeout(300); await dp.evaluate(() => { FT.ui.runArcs(); }); await dp.waitForTimeout(300); await dp.getByRole('button', { name: 'เริ่ม', exact: true }).click();
  await dp.waitForFunction(() => { const c = FT.ui.lib().find((x) => x.id === 'ar1'); return c && c.arcAi; }, null, { timeout: 15000 });
  const arcR = await dp.evaluate(() => ({ arc: FT.ui.lib().find((x) => x.id === 'ar1').arcAi.arc, calls: window.__arcN }));
  check('ให้ AI ดูภาค: ตอบเพี้ยนครั้งแรกแล้วลองใหม่สำเร็จ · JSON ที่มีข้อความ/ปีกกาต่อท้ายอ่านได้ → ได้ภาค Alabasta', arcR.arc === 'Alabasta' && arcR.calls === 2, JSON.stringify(arcR));
  await dp.close();
  // v8.87 จัดอัลบั้มใหม่ (footage-organize.js) ตามอัลบั้มเดิมของ Han + กติกาที่แก้ได้: หน้าเต็มจอ · AI อ่านดัชนี+บทพูดแล้วบอกอัลบั้ม (ไม่ส่งรูป) · ไม่แน่ใจ = ไม่ย้าย ให้เลือกเอง · อัลบั้มล็อก (Oda) ไม่แตะ · ยังไม่แยก = ย้ายออกอย่างเดียว · ย้ายด้วย MediaScan.move · ย้ายทดลอง · เลิกทำ · ไม่มีสิทธิ์ = ปุ่มขอสิทธิ์
  const og = await context.newPage(); const ogErr = []; og.on('pageerror', (e) => ogErr.push(e.message));
  await og.addInitScript(() => { window.__mv = []; window.__perm = { granted: true }; window.__req = 0; window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: () => true,
    Plugins: { Filesystem: {}, Media: { getAlbums: async () => ({ albums: [] }) }, MediaScan: { hasAccess: async () => window.__perm, requestAccess: async () => { window.__req++; }, move: async (o) => { const er = window.__mvErr && window.__mvErr(o); if (er) throw new Error(er); window.__mv.push([o.from, o.to]); } } } }; });
  await og.goto(base + '/footage.html'); await og.waitForFunction(() => window.FT && FT.organize && document.getElementById('orgBtn'), null, { timeout: 20000 }); await og.waitForTimeout(500);
  await og.evaluate(() => {
    const D = '/storage/emulated/0/Pictures/Gallery/owner/', mk = (id, name, size, album, who, sum) => ({ id, name, size, album, duration: 9, status: 'done', lastModified: 1, cover: '', scenes: [{ s: 0, e: 3, thumb: '', ai: { characters: [who], summary_th: sum } }], speech: { segs: [{ s: 0, e: 2, t: 'ประโยคทดสอบ ' + id, who }] } });
    FT.ui.lib().push(mk('o1', 'a.mp4', 1, 'luffy', 'Zoro', 'โซโลฟันดาบ'), mk('o2', 'b.mp4', 2, 'luffy', 'Luffy', 'ลูฟี่กินเนื้อ'), mk('o3', 'c.mp4', 3, 'ยังไม่แยก', 'Sanji', 'ซันจิเตะ'), mk('o4', 'd.mp4', 4, 'zoro', 'Luffy', 'ไม่ชัด'), mk('o5', 'f.mp4', 6, 'sanji', 'Sanji', 'ซันจิทำอาหาร'), mk('o6', 'x.mp4', 7, 'Oda', 'Oda', 'อาจารย์โอดะ'));
    MWLocal.list = () => [{ name: 'a.mp4', size: 1, dir: D + 'luffy/', uri: 'file://a' }, { name: 'a.mp4', size: 1, dir: D + 'zoro/', uri: 'file://a2' }, { name: 'b.mp4', size: 2, dir: D + 'luffy/', uri: 'file://b', lib: true }, { name: 'c.mp4', size: 3, dir: D + 'ยังไม่แยก/', uri: 'file://c' }, { name: 'd.mp4', size: 4, dir: D + 'zoro/', uri: 'file://d' }, { name: 'f.mp4', size: 6, dir: D + 'sanji/', uri: 'file://f' }, { name: 'x.mp4', size: 7, dir: D + 'Oda/', uri: 'file://x' }, { name: 'a.mp4', size: 1, dir: '/storage/emulated/0/Documents/Meowrin/library/luffy/', lib: true, uri: 'file://l' }, { name: 'e.mp4', size: 5, dir: D + 'luffy/', uri: 'file://e' }];
    window.__idxCalls = []; FT.ui.runIndexFor = async (l) => { window.__idxCalls.push(l.length + ':' + l[0].name); };
    MWStore.set('mw_openrouter_key_v1', 'k'); window.__or = [];
    const prev = window.fetch; window.fetch = async (u, o) => { if (!/openrouter/.test(String(u))) return prev(u, o); window.__or.push(JSON.parse(o.body).messages[0].content);
      const text = '{"r":[{"i":1,"a":"zoro","sure":true,"why":"โซโลเด่น"},{"i":2,"a":"luffy","sure":true,"why":"ลูฟี่"},{"i":3,"a":"Sanji","sure":true,"why":"ซันจิเด่น"},{"i":4,"a":"Oda","sure":true,"why":"ผิด"},{"i":5,"a":"sanji","sure":false,"why":""}]}';
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: text } }], usage: { cost: 0.002 } }) }; };
    document.getElementById('orgBtn').hidden = false;
  });
  await og.click('#orgBtn'); await og.waitForFunction(() => document.querySelector('#orgBox #orgTry'), null, { timeout: 8000 });
  await og.click('#orgBox [data-g="rules"]'); // กติกาพับเก็บอยู่ · เปิดก่อนเช็กช่องคำอธิบาย
  const og0 = await og.evaluate(() => { const b = document.getElementById('orgBox').getBoundingClientRect(); return { t: document.getElementById('orgBox').textContent, full: b.top <= 1 && b.height >= innerHeight - 1 && getComputedStyle(document.getElementById('orgBox')).position === 'fixed', ov: document.getElementById('orgBox').scrollWidth > document.getElementById('orgBox').clientWidth + 1, rules: document.querySelectorAll('#orgBox [data-desc]').length, oda: [...document.querySelectorAll('#orgBox [data-st]')].find((x) => x.dataset.st === 'Oda').textContent }; });
  check('จัดอัลบั้มใหม่: เปิดเป็นหน้าเต็มจอ ไม่ล้นจอ · บอกยังไม่ทำดัชนี 1 · ไม่แตะอัลบั้มล็อก (Oda) · กติกามีช่องคำอธิบายเฉพาะอัลบั้มที่ใช้ (luffy zoro sanji = 3)', og0.full && !og0.ov && /ยังไม่ทำดัชนี 1 คลิป/.test(og0.t) && /ไม่แตะ 1 คลิปในอัลบั้มที่ล็อก/.test(og0.t) && og0.rules === 3 && /ล็อก/.test(og0.oda), JSON.stringify(og0).slice(0, 400));
  await og.click('#orgIdx');
  check('จัดอัลบั้มใหม่: ปุ่มทำดัชนีที่เหลือ ส่งไฟล์ e.mp4 เท่านั้น', (await og.evaluate(() => window.__idxCalls.join())) === '1:e.mp4');
  await og.click('#orgTry'); await og.getByRole('button', { name: 'เริ่ม', exact: true }).click();
  await og.waitForFunction(() => document.getElementById('orgTrial'), null, { timeout: 15000 });
  const og1 = await og.evaluate(() => { const p = FT.organize.buildPlan(); return { t: document.getElementById('orgBox').textContent, mv: p.moves.map((x) => x.name + ':' + x.album + '>' + x.toAlbum).join(), un: p.unsure.map((x) => x.name).join(), prompt: window.__or[0], calls: window.__or.length, rules: MWStore.get('mw_albrules_v1', null) }; });
  check('จัดอัลบั้มใหม่: AI ได้กติกา (ภาพจำ) + รายชื่ออัลบั้มที่ใช้ได้ (ไม่มี Oda/ยังไม่แยก) + บทพูดของคลิป · แผน = a luffy→zoro, c ยังไม่แยก→sanji (ชื่อตัวพิมพ์ต่างได้) · ตอบ Oda (ล็อก) หรือ sure:false = ไม่แน่ใจ ไม่ย้าย · จดราคาต่อคลิป', og1.calls === 1 && /ภาพจำ/.test(og1.prompt) && /- zoro/.test(og1.prompt) && !/- Oda/.test(og1.prompt) && !/- ยังไม่แยก/.test(og1.prompt) && /ประโยคทดสอบ o1/.test(og1.prompt) && og1.mv === 'a.mp4:luffy>zoro,c.mp4:ยังไม่แยก>sanji' && og1.un === 'd.mp4,f.mp4' && /จะย้าย 2 คลิป/.test(og1.t) && og1.rules && og1.rules.avg > 0, JSON.stringify(og1).slice(0, 600));
  await og.click('#orgTrial'); await og.waitForFunction(() => window.__mv.length === 2 && /ย้ายแล้ว 2 คลิป/.test(document.getElementById('orgMsg').textContent), null, { timeout: 8000 });
  const og2 = await og.evaluate(() => ({ mv: window.__mv, j: MWStore.get('mw_org_v1', null), alb: FT.ui.lib().find((c) => c.id === 'o1').album }));
  check('จัดอัลบั้มใหม่: ย้ายทดลองด้วย MediaScan.move จากอัลบั้มเดิมไปอัลบั้มที่ AI บอก · จดบันทึกการย้าย · ป้ายอัลบั้มในดัชนีเปลี่ยน', og2.mv.length === 2 && og2.mv[0][0].endsWith('/owner/luffy/a.mp4') && og2.mv[0][1].endsWith('/owner/zoro/a.mp4') && og2.mv[1][1].endsWith('/owner/sanji/c.mp4') && og2.j && og2.j.batches[0].items.length === 2 && og2.alb === 'zoro', JSON.stringify(og2).slice(0, 400));
  await og.evaluate(() => { window.__mv = []; }); await og.click('#orgUndo'); await og.waitForFunction(() => window.__mv.length === 2 && /เลิกทำแล้ว/.test(document.getElementById('orgMsg').textContent), null, { timeout: 8000 });
  const og3 = await og.evaluate(() => ({ mv: window.__mv, j: MWStore.get('mw_org_v1', null).batches.length, alb: FT.ui.lib().find((c) => c.id === 'o1').album }));
  check('จัดอัลบั้มใหม่: เลิกทำ = ย้ายกลับที่เดิมทุกไฟล์ · ลบบันทึก · ป้ายอัลบั้มกลับเดิม', og3.mv.length === 2 && /\/owner\/luffy\/a\.mp4$/.test(og3.mv.find((m) => /a\.mp4/.test(m[1]))[1]) && og3.j === 0 && og3.alb === 'luffy', JSON.stringify(og3));
  // ปลายทางชื่อซ้ำ = ข้าม (ไม่นับว่าพัง ไม่หยุดทั้งชุด ไม่จดบันทึก) · เลิกทำที่ย้ายกลับไม่ครบ = เก็บที่ค้างไว้ในชุดเดิม
  await og.evaluate(() => { window.__mvErr = () => 'target exists: /x'; }); await og.click('#orgTrial'); await og.waitForFunction(() => /ย้ายแล้ว 0 คลิป/.test(document.getElementById('orgMsg').textContent), null, { timeout: 8000 });
  const og4 = await og.evaluate(() => ({ msg: document.getElementById('orgMsg').textContent, cls: document.getElementById('orgMsg').className, b: MWStore.get('mw_org_v1', null).batches.length }));
  check('จัดอัลบั้มใหม่: ปลายทางมีชื่อซ้ำ = ข้าม 2 คลิป ไม่ขึ้นพลาด ไม่จดบันทึก', /ข้าม 2/.test(og4.msg) && !/พลาด/.test(og4.msg) && !/err/.test(og4.cls) && og4.b === 0, JSON.stringify(og4));
  await og.evaluate(() => { window.__mvErr = null; window.__mv = []; }); await og.click('#orgTrial'); await og.waitForFunction(() => window.__mv.length === 2 && /ย้ายแล้ว 2 คลิป/.test(document.getElementById('orgMsg').textContent), null, { timeout: 8000 });
  await og.evaluate(() => { window.__mvErr = (o) => /a\.mp4/.test(o.from) ? 'boom' : null; }); await og.click('#orgUndo'); await og.waitForFunction(() => /เลิกทำแล้ว/.test(document.getElementById('orgMsg').textContent), null, { timeout: 8000 });
  const og5 = await og.evaluate(() => ({ msg: document.getElementById('orgMsg').textContent, b: MWStore.get('mw_org_v1', null).batches.map((x) => x.items.length) }));
  await og.evaluate(() => { window.__mvErr = null; }); await og.click('#orgUndo'); await og.waitForFunction(() => MWStore.get('mw_org_v1', null).batches.length === 0, null, { timeout: 8000 });
  check('จัดอัลบั้มใหม่: เลิกทำย้ายกลับได้ 1 จาก 2 = ชุดเดิมเหลือ 1 คลิปที่ค้าง · กดเลิกทำซ้ำจนหมด', /ย้ายกลับ 1 คลิป/.test(og5.msg) && /พลาด 1/.test(og5.msg) && og5.b.length === 1 && og5.b[0] === 1, JSON.stringify(og5));
  // เลือกอัลบั้มเองให้คลิปที่ AI ไม่แน่ใจ (fixed) · แก้กติกา = บันทึก + นับคลิปที่ต้องดูใหม่ · สลับสถานะอัลบั้ม · ปุ่มย้อนปิดหน้า
  await og.click('#orgBox [data-g="unsure"]'); await og.click('#orgBox [data-pick="o4"]'); await og.locator('#pkList .alrow', { hasText: 'luffy' }).first().click(); await og.waitForTimeout(400);
  const og6 = await og.evaluate(() => { const p = FT.organize.buildPlan(), d = p.moves.find((x) => x.name === 'd.mp4'); return { d: d && d.album + '>' + d.toAlbum + ':' + d.fixed, ai: FT.ui.lib().find((c) => c.id === 'o4').albAi }; });
  check('จัดอัลบั้มใหม่: แตะคลิปที่ AI ไม่แน่ใจ → เลือก luffy เอง = เข้าแผน zoro→luffy (เลือกเอง AI ไม่ทับ)', og6.d === 'zoro>luffy:true' && og6.ai.fixed, JSON.stringify(og6));
  await og.fill('#orgBox textarea[data-desc="luffy"]', 'ฉากลูฟี่เท่านั้น'); await og.evaluate(() => document.querySelector('#orgBox textarea[data-desc="luffy"]').dispatchEvent(new Event('change', { bubbles: true })));
  const og7a = await og.evaluate(() => { document.dispatchEvent(new CustomEvent('ft:lib')); return document.querySelector('#orgBox textarea[data-desc="luffy"]').isConnected; }); /* กำลังพิมพ์อยู่ = ไม่วาดทับ (แป้นพิมพ์ไม่หลุด) */
  await og.evaluate(() => { document.activeElement.blur(); document.dispatchEvent(new CustomEvent('ft:lib')); }); await og.waitForTimeout(300);
  const og7 = await og.evaluate(() => ({ desc: MWStore.get('mw_albrules_v1', null).desc.luffy, stale: FT.organize.buildPlan().stale.length, btn: !!document.getElementById('orgStale') }));
  check('จัดอัลบั้มใหม่: แก้คำอธิบายอัลบั้ม = บันทึกทันที · คลิปที่ AI ดูด้วยกติกาเก่านับเป็น ดูใหม่ (ไม่รวมที่เลือกเอง) แต่ไม่ดูใหม่เองให้เสียเงิน', og7.desc === 'ฉากลูฟี่เท่านั้น' && og7.stale === 4 && og7.btn && og7a, JSON.stringify([og7, og7a]));
  await og.click('#orgBox [data-st="zoro"]'); await og.waitForTimeout(300);
  const og8 = await og.evaluate(() => { const p = FT.organize.buildPlan(); return { st: MWStore.get('mw_albrules_v1', null).state.zoro, mv: p.moves.map((x) => x.name).join() }; });
  check('จัดอัลบั้มใหม่: กดสถานะ zoro = ล็อก → ไฟล์ใน zoro ไม่ถูกย้าย และไม่มีอะไรย้ายเข้า zoro', og8.st === 'lock' && og8.mv === 'c.mp4', JSON.stringify(og8));
  await og.click('#orgBox [data-st="zoro"]'); await og.click('#orgBox [data-st="zoro"]'); /* inbox → use (วนกลับ) */
  await og.evaluate(() => { window.__perm = { granted: false }; document.dispatchEvent(new CustomEvent('ft:lib')); }); await og.waitForFunction(() => document.getElementById('orgPerm'), null, { timeout: 8000 });
  await og.click('#orgPerm'); await og.waitForTimeout(300);
  check('จัดอัลบั้มใหม่: ไม่มีสิทธิ์เข้าถึงไฟล์ทั้งหมด = ไม่มีปุ่มย้าย มีปุ่มขอสิทธิ์ที่เปิดหน้าตั้งค่า', (await og.evaluate(() => window.__req)) === 1 && !(await og.evaluate(() => !!document.getElementById('orgTrial') || !!document.querySelector('[data-mvg]'))));
  await og.evaluate(() => window.MWBackHook()); await og.waitForTimeout(300);
  check('จัดอัลบั้มใหม่: ปุ่มย้อนของมือถือ = ปิดหน้าจัดอัลบั้ม กลับหน้าอัลบั้ม · ไม่มี error', await og.evaluate(() => document.getElementById('orgBox').hidden && !FT.organize.isOpen() && !document.documentElement.classList.contains('orgopen')) && !ogErr.length, ogErr.join());
  await og.evaluate(async () => { await FT.store.del(['o1', 'o2', 'o3', 'o4', 'o5', 'o6']); MWStore.del('mw_albrules_v1'); }); /* คลิปจำลองมีบทพูด: ไม่ลบ = ไปโผล่ในแผงฟังเสียงของเทสต์หน้าอื่น (ใช้ฐานข้อมูลเดียวกัน) */
  await og.close();
  // v8.92 ลบคลิปที่ไม่ใช้ (footage-trash.js): คลิปที่ไฟล์หายโผล่ในรายการ → เลือกย้ายเข้าถังขยะ (ซ่อนจากค้นหา/อัลบั้ม ดัชนียังอยู่) → คืนกลับ/ลบถาวร (ลบแค่ดัชนี) · ไฟล์กลับมา = คืนเอง · ซ่อนฟุตซ้ำคนละเรื่องกัน · ยังไม่สแกน = บอกให้สแกนก่อน
  const tr = await context.newPage(); const trErr = []; tr.on('pageerror', (e) => trErr.push(e.message));
  await tr.goto(base + '/footage.html'); await tr.waitForFunction(() => window.FT && FT.ui && document.getElementById('trOut'), null, { timeout: 20000 }); await tr.waitForTimeout(400);
  await tr.evaluate(async () => {
    const mk = (id, name, size, who) => ({ id, name, size, album: 'luffy', duration: 12, status: 'done', lastModified: 1, cover: '', scenes: [{ s: 0, e: 3, thumb: '', ai: { characters: [who], summary_th: 'ทดสอบถังขยะ ' + id } }] });
    const cl = [mk('tr1', 'keep.mp4', 501, 'Luffy'), mk('tr2', 'gone_a.mp4', 502, 'Luffy'), mk('tr3', 'gone_b.mp4', 503, 'Luffy'), Object.assign(mk('tr4', 'dup.mp4', 504, 'Luffy'), { hide: true })]; await FT.store.putMany(cl); FT.ui.lib().push(...cl); /* บันทึกลงฐานด้วย: ลบถาวรแล้วโหลดคลังใหม่จากฐาน */
    window.__files = { 'keep.mp4': 1 }; MWLocal.native = () => true; MWLocal.list = () => [{ name: 'keep.mp4', size: 501, dir: '/storage/emulated/0/Pictures/Gallery/owner/luffy/', uri: 'file://k' }]; MWLocal.urlOf = (c) => window.__files[c.name] ? 'file://x' : null;
    document.dispatchEvent(new CustomEvent('ft:lib'));
  });
  const tr0 = await tr.evaluate(() => ({ t: document.getElementById('trOut').textContent, tag: document.getElementById('tagTr').textContent, rows: [...document.querySelectorAll('#trOut .trrow')].map((r) => r.querySelector('b').textContent).join() }));
  await tr.click('.tabs [data-p=set]'); await tr.evaluate(() => { document.getElementById('trFold').open = true; });
  await tr.click('#trOut .trrow >> text=gone_a.mp4'); await tr.click('#trOut [data-act=trash]'); await tr.waitForTimeout(300);
  const tr1 = await tr.evaluate(() => { const a = FT.ui.lib().find((c) => c.id === 'tr2'), b = FT.ui.lib().find((c) => c.id === 'tr3'); return { a: a.hide, at: !!a.trashAt, b: b.hide, t: document.getElementById('trOut').textContent, ov: document.documentElement.scrollWidth > innerWidth + 1 }; });
  await tr.click('.tabs [data-p=album]'); await tr.fill('#q', 'ทดสอบถังขยะ'); await tr.waitForTimeout(600);
  const tr2 = await tr.evaluate(() => document.querySelectorAll('#results .card').length);
  await tr.fill('#q', ''); await tr.click('.tabs [data-p=set]'); await tr.waitForTimeout(300);
  await tr.click('#trOut .trlist[data-l=t] .trrow'); await tr.click('#trOut [data-act=restore]'); await tr.waitForTimeout(300);
  const tr3 = await tr.evaluate(() => ({ a: FT.ui.lib().find((c) => c.id === 'tr2').hide, at: FT.ui.lib().find((c) => c.id === 'tr2').trashAt }));
  await tr.click('#trOut .trrow >> text=gone_a.mp4'); await tr.click('#trOut [data-act=trash]'); await tr.waitForTimeout(250);
  await tr.evaluate(() => { window.__files['gone_a.mp4'] = 1; document.dispatchEvent(new CustomEvent('ft:files', { detail: 1 })); }); await tr.waitForTimeout(400);
  const tr4 = await tr.evaluate(() => ({ a: FT.ui.lib().find((c) => c.id === 'tr2').hide, dupKept: FT.ui.lib().find((c) => c.id === 'tr4').hide, msg: document.getElementById('trOut').textContent.includes('เจอไฟล์ในมือถืออีกครั้ง') }));
  await tr.evaluate(() => { window.__files['gone_a.mp4'] = 0; document.dispatchEvent(new CustomEvent('ft:lib')); }); await tr.click('#trOut .trrow >> text=gone_a.mp4'); await tr.click('#trOut .trrow >> text=gone_b.mp4'); await tr.click('#trOut [data-act=trash]'); await tr.waitForTimeout(250);
  await tr.click('#trOut .trlist[data-l=t] .trrow >> nth=0'); await tr.click('#trOut [data-act=purge]'); await tr.getByRole('button', { name: 'ลบถาวร', exact: true }).click(); await tr.waitForTimeout(500);
  const tr5 = await tr.evaluate(() => ({ ids: FT.ui.lib().map((c) => c.id).filter((i) => /^tr\d/.test(i)).sort().join(), trashN: FT.ui.lib().filter((c) => c.hide === 'trash').length, kept: !!FT.ui.lib().find((c) => c.id === 'tr1') }));
  await tr.evaluate(() => { MWLocal.list = () => []; document.dispatchEvent(new CustomEvent('ft:lib')); });
  const tr6 = await tr.evaluate(() => document.getElementById('trOut').textContent);
  check('ลบคลิปที่ไม่ใช้: ไฟล์หายโผล่ในรายการ (gone_a/gone_b ไม่รวมคลิปที่ไฟล์ยังอยู่/ซ่อนฟุตซ้ำ) · ย้ายเข้าถังขยะ = ซ่อนจากค้นหา · คืนกลับได้ · ไฟล์กลับมา = คืนเอง · ลบถาวรลบแค่ดัชนีคลิปที่เลือก · ยังไม่สแกน = บอกให้สแกนก่อน · ไม่แตะซ่อนฟุตซ้ำ',
    /gone_a\.mp4/.test(tr0.rows) && /gone_b\.mp4/.test(tr0.rows) && !/keep\.mp4/.test(tr0.rows) && !/dup\.mp4/.test(tr0.rows) && /ไฟล์หาย \d/.test(tr0.tag) /* คลิปจากเทสต์ก่อนหน้าในฐานเดียวกันก็นับว่าไฟล์หาย (จำลองสแกนว่าง) */ && tr1.a === 'trash' && tr1.at && !tr1.b && tr1.t.includes('ถังขยะ 1 คลิป') && !tr1.ov && tr2 === 2 && !tr3.a && !tr3.at && !tr4.a && tr4.dupKept === true && tr4.msg && tr5.trashN === 1 && tr5.ids.split(',').length === 3 && /tr1/.test(tr5.ids) && /tr4/.test(tr5.ids) && tr5.kept && /ยังไม่เคยสแกน/.test(tr6) && !trErr.length, JSON.stringify([tr0, tr1, tr2, tr3, tr4, tr5, tr6.slice(0, 80)]) + trErr.join());
  // ลบถาวร: ระหว่างรอกล่องยืนยัน ไฟล์กลับมา (สแกนเสร็จ) → ไม่ลบคลิปนั้น (เช็กใหม่หลังยืนยัน) · หายเยอะผิดปกติ = เตือนและปิดเลือกทั้งหมด
  await tr.evaluate(() => { MWLocal.list = () => [{ name: 'keep.mp4', size: 501, dir: '/x/', uri: 'file://k' }]; document.dispatchEvent(new CustomEvent('ft:lib')); });
  const rcName = await tr.evaluate(() => { const t = FT.ui.lib().find((c) => c.hide === 'trash' && /^tr\d$/.test(c.id)); return t ? t.name : ''; });
  await tr.click('#trOut .trlist[data-l=t] .trrow >> text=' + rcName); await tr.click('#trOut [data-act=purge]'); await tr.evaluate((n) => { window.__files[n] = 1; }, rcName);
  await tr.getByRole('button', { name: 'ลบถาวร', exact: true }).click(); await tr.waitForTimeout(500);
  const rc = await tr.evaluate((n) => ({ still: FT.ui.lib().some((c) => c.name === n), msg: document.getElementById('trOut').textContent.includes('ไม่ได้ลบ') }), rcName);
  await tr.evaluate(() => { const l = FT.ui.lib(); const mk = (i) => ({ id: 'trm' + i, name: 'trm' + i + '.mp4', size: 900 + i, album: 'x', duration: 5, status: 'done', lastModified: 1, cover: '', scenes: [] }); for (let i = 0; i < 40; i++) l.push(mk(i)); window.__files = {}; document.dispatchEvent(new CustomEvent('ft:lib')); });
  const many = await tr.evaluate(() => ({ warn: /ไฟล์หายเยอะผิดปกติ/.test(document.getElementById('trOut').textContent), dis: document.querySelector('#trOut [data-all=m]').disabled }));
  check('ลบถาวร: คลิปที่ไฟล์กลับมาระหว่างรอยืนยัน ไม่ถูกลบ (บอกว่าไม่ได้ลบ) · หายเกิน ~20% ของคลัง = เตือนว่าสแกนไม่ครบ และปิดปุ่มเลือกทั้งหมด', rc.still && rc.msg && many.warn && many.dis && !trErr.length, JSON.stringify([rcName, rc, many]) + trErr.join());
  await tr.evaluate(() => { const l = FT.ui.lib(); for (let i = l.length - 1; i >= 0; i--) if (/^trm\d+$/.test(l[i].id)) l.splice(i, 1); });
  await tr.evaluate(async () => { await FT.store.del(['tr1', 'tr2', 'tr3', 'tr4']); const l = FT.ui.lib(); for (let i = l.length - 1; i >= 0; i--) if (/^tr\d$/.test(l[i].id)) l.splice(i, 1); });
  await tr.close();
  // v8.89 รูปฉากในการ์ดผลค้นหาไม่แตก: เลื่อนมาถึงการ์ด → อ่านเฟรมกลางฉากจากไฟล์จริงในมือถือ 720px (แคชไว้) แทนรูปในดัชนี 240px · ไม่มีไฟล์ = ใช้รูปเดิมไม่พัง
  const sh = await context.newPage(); const shErr = []; sh.on('pageerror', (e) => shErr.push(e.message));
  await sh.goto(base + '/footage.html'); await sh.waitForFunction(() => window.FT && FT.ui && FT.ui.sharpen, null, { timeout: 20000 }); await sh.waitForTimeout(400);
  await sh.evaluate(async () => {
    const cv = document.createElement('canvas'); cv.width = 320; cv.height = 180; const x = cv.getContext('2d'), st = cv.captureStream(15), rec = new MediaRecorder(st, { mimeType: 'video/webm;codecs=vp8' }), ch = [];
    rec.ondataavailable = (e) => ch.push(e.data); rec.start(100); let n = 0; const iv = setInterval(() => { x.fillStyle = `hsl(${n * 20 % 360},80%,50%)`; x.fillRect(0, 0, 320, 180); n++; }, 60);
    await new Promise((r) => setTimeout(r, 2200)); clearInterval(iv); const done = new Promise((r) => { rec.onstop = r; }); rec.stop(); await done;
    const url = URL.createObjectURL(new Blob(ch, { type: 'video/webm' }));
    FT.ui.lib().push({ id: 'shp1', name: 'shp.webm', size: 77, album: 'x', duration: 2, status: 'done', lastModified: 1, cover: '', scenes: [{ s: 0, e: 1.6, thumb: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', img: '', ai: { characters: ['Usopp'], summary_th: 'อุซปวิ่งหนีทดสอบรูปคม' } }] }, { id: 'shp2', name: 'none.webm', size: 78, album: 'x', duration: 2, status: 'done', lastModified: 1, cover: '', scenes: [{ s: 0, e: 1, thumb: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', ai: { characters: ['Usopp'], summary_th: 'อุซปวิ่งหนีไม่มีไฟล์' } }] });
    MWLocal.list = () => [{ name: 'shp.webm', size: 77, dir: '/storage/emulated/0/Pictures/Gallery/owner/x/', uri: 'file://shp', album: 'x' }]; MWLocal.fileUrl = () => url;
    document.dispatchEvent(new CustomEvent('ft:lib'));
  });
  await sh.fill('#q', 'อุซปวิ่งหนี'); await sh.waitForFunction(() => document.querySelectorAll('#results img.scene').length === 2 && [...document.querySelectorAll('#results img.scene')].some((i) => /^blob:/.test(i.src)), null, { timeout: 15000 }).catch(() => {});
  const shr = await sh.evaluate(() => [...document.querySelectorAll('#results .card')].map((c) => { const i = c.querySelector('img.scene'); return { t: c.textContent.includes('ไม่มีไฟล์') ? 'none' : 'file', blob: /^blob:/.test(i.src), w: i.naturalWidth }; }));
  check('รูปฉากในการ์ด: คลิปที่มีไฟล์ในมือถือได้เฟรมคมจากไฟล์จริง (กว้าง 720) · คลิปที่ไม่มีไฟล์ใช้รูปเดิม · ไม่มี error', shr.length === 2 && shr.find((x) => x.t === 'file').blob && shr.find((x) => x.t === 'file').w === 720 && !shr.find((x) => x.t === 'none').blob && !shErr.length, JSON.stringify(shr) + shErr.join());
  // v8.91 ตัวดูฉาก: กรอออกนอกฉากได้ (เดิมกรอเลยท้ายฉาก = ดีดกลับต้นฉาก/หยุดทันที) · เล่นถึงท้ายฉากเอง = วนซ้ำ · สื่อเต็มความกว้าง ปุ่มเล่นติดล่างไม่ทับข้อความ · แตะพื้นดำไม่ปิด · ตัวละครพับเก็บ
  await sh.evaluate(() => { MWLocal.urlOf = (c) => c.id === 'shp1' ? MWLocal.fileUrl() : null; });
  await sh.click('#results .card img.scene'); await sh.waitForTimeout(300);
  const bg0 = await sh.evaluate(() => { const m = document.querySelector('#big .bigmedia img, #big #bigImg').getBoundingClientRect(), f = document.querySelector('.bigfoot').getBoundingClientRect(), t = document.getElementById('bigTxt').getBoundingClientRect(), d = document.getElementById('bigDet'); return { w: Math.round(m.width), fw: innerWidth, footTop: Math.round(f.top), txtBottom: Math.round(t.bottom), detOpen: d.open, detHidden: d.hidden, sum: document.getElementById('bigDetS').textContent, ov: document.documentElement.scrollWidth > innerWidth + 1 }; });
  await sh.click('#playBtn'); await sh.waitForFunction(() => !document.getElementById('bigVid').hidden && document.getElementById('bigVid').readyState >= 1, null, { timeout: 10000 });
  const bg1 = await sh.evaluate(() => { const v = document.getElementById('bigVid'); let t = 0.2, paused = 0, jumps = []; Object.defineProperty(v, 'currentTime', { get: () => t, set: (x) => { t = x; jumps.push(x); v.onseeking && v.onseeking(); }, configurable: true }); v.pause = () => { paused++; };
    v.onloadedmetadata = null; const sc = FT.ui.lib().find((c) => c.id === 'shp1').scenes[0], e = sc.e;
    jumps.length = 0; t = e + 3; v.onseeking(); v.ontimeupdate(); /* ผู้ใช้กรอเลยท้ายฉาก */ const free = { jumps: jumps.slice(), paused };
    t = 0.5; jumps.length = 0; v.onseeking(); t = e + 0.01; v.ontimeupdate(); /* กรอกลับเข้าฉาก แล้วเล่นถึงท้ายฉากเอง = วนซ้ำ */ const loop = { jumps: jumps.slice(), paused };
    document.getElementById('loopSc').checked = false; t = 0.5; v.onseeking(); t = e + 0.01; v.ontimeupdate(); return { free, loop, off: paused, big: !document.getElementById('big').hidden }; });
  await sh.mouse.click(4, 400); await sh.waitForTimeout(200);
  const bg2 = await sh.evaluate(() => !document.getElementById('big').hidden);
  check('ตัวดูฉาก: กรอเลยท้ายฉาก = ไม่ดีดกลับ/ไม่หยุด · เล่นถึงท้ายฉากเอง = วนซ้ำฉาก · ปิดวนซ้ำ = หยุด · สื่อเต็มความกว้างจอ · ข้อความอยู่เหนือปุ่มเล่น (ไม่ทับ) · ตัวละครพับเก็บและบอกชื่อ · แตะพื้นดำข้างวิดีโอไม่ปิด', bg1.free.jumps.length === 0 && bg1.free.paused === 0 && bg1.loop.jumps.length === 1 && bg1.loop.jumps[0] === 0 && bg1.off === 1 && bg0.w >= bg0.fw - 2 && bg0.txtBottom <= bg0.footTop && !bg0.detOpen && !bg0.detHidden && /Usopp/.test(bg0.sum) && !bg0.ov && bg1.big && bg2 && !shErr.length, JSON.stringify([bg0, bg1, bg2]) + shErr.join());
  await sh.evaluate(() => { const l = FT.ui.lib(); for (let i = l.length - 1; i >= 0; i--) if (/^shp/.test(l[i].id)) l.splice(i, 1); });
  await sh.close();
  // v8.52 ฟังเสียงคลิป (footage-speech.js): ถอดเสียงจริงจากไฟล์ wav จำลอง (สเตอริโอ 24 kHz → โมโน 16 kHz) · เงียบ = ไม่เรียก AI · บทพูดเข้าฉากที่ทับเวลา · แผงโชว์บทพูด
  const sp = await context.newPage(); const spErr = []; sp.on('pageerror', (e) => spErr.push(e.message));
  await sp.goto(base + '/footage.html'); await sp.waitForFunction(() => window.FT && FT.speech && document.getElementById('spTrial'), null, { timeout: 20000 }); await sp.waitForTimeout(400);
  await sp.evaluate(() => {
    const wav = (sec, amp) => { const sr = 24000, n = sr * sec, b = new DataView(new ArrayBuffer(44 + n * 4)); const S = (o, t) => [...t].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)));
      S(0, 'RIFF'); b.setUint32(4, 36 + n * 4, true); S(8, 'WAVE'); S(12, 'fmt '); b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 2, true); b.setUint32(24, sr, true); b.setUint32(28, sr * 4, true); b.setUint16(32, 4, true); b.setUint16(34, 16, true); S(36, 'data'); b.setUint32(40, n * 4, true);
      for (let i = 0; i < n; i++) { const v = Math.round(Math.sin(i * 2 * Math.PI * 440 / sr) * amp * 32767); b.setInt16(44 + i * 4, v, true); b.setInt16(46 + i * 4, v, true); } return new Blob([b], { type: 'audio/wav' }); };
    const urls = { 'v1.wav': URL.createObjectURL(wav(3, 0.3)), 'v2.wav': URL.createObjectURL(wav(2, 0)) };
    const mk = (id, name) => ({ id, name, size: 5, album: 'luffy', duration: 3, status: 'done', lastModified: 1, cover: '', scenes: [{ s: 0, e: 2, thumb: '', img: 'data:image/jpeg;base64,AAAA', ai: { characters: ['Luffy'] } }, { s: 2, e: 3, thumb: '', img: 'data:image/jpeg;base64,AAAA', ai: { characters: ['Luffy'] } }] });
    FT.ui.lib().push(mk('sp1', 'v1.wav'), mk('sp2', 'v2.wav')); window.__tr = [];
    FT.ui.hasSrc = (c) => /^sp[12]$/.test(c.id); FT.ui.srcUrl = async (c) => ({ url: urls[c.name], done() {} });
    FT.transcribe = async (b64, dur, hint, frames, scenes, arcs) => { window.__tr.push({ arcs: arcs ? arcs.length : 0, scn: scenes ? scenes.map((x) => x.n).join() : null, head: atob(b64.slice(0, 16)).slice(0, 4), bytes: Math.round(atob(b64).length), dur, frames: frames ? frames.map((f) => f.n + ':' + f.s + '-' + f.e).join() : null }); return { cost: 0.002, json: { segments: [{ s: 0.5, e: 1.5, t: 'ทดสอบ บทพูด', who: 'Luffy' }, { s: 2.1, e: 2.8, t: 'เย้', who: ['Chopper', 'Carrot'], sure: true }, { s: 9, e: 99, t: '' }], scenes: [{ i: 1, t: 'ยิ้มกว้างชูกำปั้น' }, { i: 99, t: 'เกินขอบ' }], arc: 'Alabasta', summary_th: 'สรุปทดสอบ' } }; };
    FT.ui.search && FT.ui.search(); document.dispatchEvent(new CustomEvent('ft:lib'));
  });
  await sp.click('nav button[data-p="set"]'); await sp.evaluate(() => { document.getElementById('spPanel').open = true; }); await sp.waitForTimeout(200);
  await sp.click('#spTrial'); await sp.waitForTimeout(300); await sp.getByRole('button', { name: 'เริ่ม', exact: true }).click();
  await sp.waitForFunction(() => /ทดลอง: ฟังเสร็จ 2/.test(document.getElementById('spMsg').textContent), null, { timeout: 20000 });
  const sp1 = await sp.evaluate(() => { const [a, b] = FT.ui.lib().filter((c) => /^sp[12]$/.test(c.id)); return { tr: window.__tr, a: a.speech, b: b.speech, s0: FT.ui.speechOf(a, a.scenes[0]), s1: FT.ui.speechOf(a, a.scenes[1]), hay: FT.ui.hay(a, a.scenes[0]).join('|').includes('ทดสอบ'), list: document.getElementById('spList').textContent, info: document.getElementById('spInfo').textContent, over: document.documentElement.scrollWidth > innerWidth + 1 }; });
  check('ฟังเสียงคลิป: ส่ง wav โมโน 16 kHz (3 วิ ≈ 96 KB + หัว 44) ให้ AI 1 ครั้ง (คลิปเงียบไม่เรียก AI) · บทพูดเก็บที่คลิปพร้อมเวลา (ตัดบรรทัดว่างทิ้ง) · เงียบ = silent', sp1.tr.length === 1 && sp1.tr[0].head === 'RIFF' && Math.abs(sp1.tr[0].bytes - (44 + 3 * 16000 * 2)) < 400 && sp1.a.segs.length === 2 && sp1.a.segs[1].who === 'Chopper, Carrot' && sp1.a.segs[0].t === 'ทดสอบ บทพูด' && sp1.a.segs[0].who === 'Luffy' && /^1:0-2,2:2-2\.99/.test(sp1.tr[0].frames) && sp1.a.watch === true && sp1.a.wv === 3 && sp1.tr[0].scn === '1,2' && sp1.a.segs[0].sure === true && sp1.a.looks[0] === 'ยิ้มกว้างชูกำปั้น' && Object.keys(sp1.a.looks).length === 1 && sp1.a.sum === 'สรุปทดสอบ' && sp1.b.silent === true && sp1.b.segs.length === 0, JSON.stringify([sp1.tr, sp1.a, sp1.b]));
  check('ฟังเสียงคลิป: บทพูดเข้าเฉพาะฉากที่เวลาทับ (ฉาก 0-2 มี · ฉาก 2-3 ไม่มี) · ค้นหา hay รวมบทพูด · แผงโชว์บทพูดและตัวเลข · หน้าไม่ล้น', /ทดสอบ/.test(sp1.s0) && /Luffy/.test(sp1.s0) && /ลูฟี่/.test(sp1.s0) && /ยิ้มกว้าง/.test(sp1.s0) && /Chopper, Carrot/.test(sp1.s1) && /เย้/.test(sp1.s1) && !/ทดสอบ/.test(sp1.s1) && sp1.hay && /ทดสอบ บทพูด/.test(sp1.list) && /ดู\+ฟังแล้ว 2\/\d+ คลิป/.test(sp1.info) && !sp1.over && !spErr.length, JSON.stringify([sp1.s0, sp1.s1, sp1.info, spErr]));
  // v8.59 ภาคจากเสียง: AI ตอบภาคในคำขอเดียวกัน (ส่งรายชื่อภาคไป) · ป้ายฉากไม่พอ → ใช้ภาคจากเสียง · ชื่อสถานที่ในบทพูด ≥2 ครั้งภาคเดียว = แน่ใจ · เอ่ยหลายภาค/ครั้งเดียว = ไม่ใช้ · คิวฟังเสียงเอาคลิปภาคไม่แน่ใจขึ้นก่อน
  const sa = await sp.evaluate(() => { const U = FT.ui, a = U.lib().find((c) => c.id === 'sp1'), mk = (segs, arcLab) => ({ id: 'x' + Math.random(), scenes: [{ s: 0, e: 1, ai: { arc: arcLab || '' } }, { s: 1, e: 2, ai: {} }, { s: 2, e: 3, ai: {} }, { s: 3, e: 4, ai: {} }, { s: 4, e: 5, ai: {} }], speech: { segs: segs.map((t) => ({ s: 0, e: 1, t })), sum: '' } });
    return { tr: window.__tr[0].arcs, n: U.ARCS.length, a: a.speech.arc, aArc: U.arcOf(a), two: U.arcOf(mk(['ไปวอเตอร์เซเว่นกัน', 'ที่วอเตอร์ 7 นี่แหละ'])), one: U.arcOf(mk(['ไปอลาบาสต้า'])), oneLab: U.arcOf(mk(['ไปอลาบาสต้า'], 'Alabasta arc')), mix: U.arcOf(mk(['อลาบาสต้า อลาบาสต้า', 'เกาะดรัม'])), fixed: U.arcOf(Object.assign(mk(['วอเตอร์เซเว่น วอเตอร์เซเว่น']), { arcFixed: true, arc: 'Wano Country' })) }; });
  check('ภาคจากเสียง: ส่งรายชื่อภาคให้ AI · AI ตอบ Alabasta = คลิปเข้าภาคนั้น (by speech) · เอ่ยวอเตอร์เซเว่น 2 ครั้ง = แน่ใจ · ครั้งเดียว = ไม่แน่ใจ (ตรงป้ายฉาก = แน่ใจ) · เอ่ยหลายภาค = ไม่ใช้ · ผู้ใช้ตั้งเองชนะ', sa.tr === sa.n && sa.a === 'Alabasta' && sa.aArc.arc === 'Alabasta' && sa.aArc.sure && sa.aArc.by === 'speech' && sa.two.arc === 'Water 7' && sa.two.sure && !sa.one.sure && sa.oneLab.sure && sa.oneLab.arc === 'Alabasta' && !sa.mix.sure && sa.fixed.arc === 'Wano Country', JSON.stringify(sa));
  // v8.61 การ์ดฉากโชว์บทพูด+คำบรรยาย · แตะชื่อคนพูดแล้วแก้ (ตัวหลัก/พิมพ์บทบาทเอง/ทั้งคลิป) · ล็อกชื่อ รอดตอนทำเสียงซ้ำ
  const ec = await sp.evaluate(() => { const U = FT.ui, a = U.lib().find((c) => c.id === 'sp1'), h = document.createElement('div'); h.innerHTML = U.card(a, a.scenes[0]); const sps = h.querySelector('.sps'); return { txt: sps && sps.textContent, n: U.speechLines(a, a.scenes[0]).lines.length }; });
  check('การ์ดฉาก: โชว์คำบรรยายฉาก + บทพูดพร้อมชื่อคนพูด (ไม่ต้องกดเข้าไปดู)', ec && /ยิ้มกว้างชูกำปั้น/.test(ec.txt) && /Luffy/.test(ec.txt) && /ทดสอบ บทพูด/.test(ec.txt) && ec.n === 2, JSON.stringify(ec));
  await sp.evaluate(() => { document.querySelectorAll('#spList details').forEach((d) => { d.open = true; }); });
  await sp.locator('#spList .spwho').first().click(); await sp.waitForSelector('#pkSheet:not([hidden])', { timeout: 5000 });
  await sp.fill('#pkQ', 'พ่อค้า'); await sp.waitForTimeout(150); await sp.locator('#pkList button', { hasText: 'ใช้ "พ่อค้า"' }).first().click(); await sp.waitForTimeout(400);
  const ew1 = await sp.evaluate(() => { const a = FT.ui.lib().find((c) => c.id === 'sp1'); return { s: a.speech.segs.map((g) => [g.who, g.fixed === true, g.sure]), hay: FT.ui.speechOf(a, a.scenes[0]).includes('พ่อค้า'), chip: document.querySelector('#spList .spwho').textContent }; });
  check('แก้ชื่อคนพูด: พิมพ์บทบาทเอง "พ่อค้า" → บรรทัดนั้นเปลี่ยน + ล็อก (fixed) · ค้นหาเจอด้วยชื่อใหม่ · แผงอัปเดตตาม', ew1.s[0][0] === 'พ่อค้า' && ew1.s[0][1] === true && ew1.s[1][0] === 'Chopper, Carrot' && ew1.hay && ew1.chip === 'พ่อค้า', JSON.stringify(ew1));
  await sp.evaluate(() => { document.querySelectorAll('#spList details').forEach((d) => { d.open = true; }); });
  await sp.locator('#spList .spwho').nth(1).click(); await sp.waitForSelector('#pkSheet:not([hidden])', { timeout: 5000 }); await sp.fill('#pkQ', 'zoro'); await sp.waitForTimeout(150); await sp.locator('#pkList button', { hasText: 'Zoro' }).first().click(); await sp.waitForTimeout(400);
  const ew2 = await sp.evaluate(async () => { const a = FT.ui.lib().find((c) => c.id === 'sp1'); const before = a.speech.segs.map((g) => g.who); window.__tr = []; await FT.speech.doClip(a); return { before, after: a.speech.segs.map((g) => [g.who, g.fixed === true]) }; });
  check('แก้ชื่อคนพูด: เลือกตัวหลัก Zoro จากรายการ · ทำเสียงซ้ำแล้วชื่อที่แก้เองไม่ถูกทับ (ได้ชื่อเดิมกลับมา ติดล็อก)', ew2.before[1] === 'Zoro' && ew2.after[0][0] === 'พ่อค้า' && ew2.after[0][1] && ew2.after[1][0] === 'Zoro' && ew2.after[1][1], JSON.stringify(ew2));
  // v8.62 คนพูดช่วยบอกตัวละครของฉาก (ตัวหลักที่ AI แน่ใจ) · แก้ชื่อคนพูดจากการ์ดโดยตรง
  const spk = await sp.evaluate(() => { const U = FT.ui, mk = (sure, fixed) => ({ id: 'spk' + Math.random(), name: 'x', scenes: [{ s: 0, e: 2, ai: { characters: ['Luffy'], fixed } }], speech: { segs: [{ s: 0.5, e: 1.5, t: 'ฮึ่ม', who: 'Zoro', sure }] } });
    const ch = (c) => { U.syncSpeakers(c); return U.chars(c.scenes[0]).slice(); }; return { z: ch(mk(true, false)), unsure: ch(mk(false, false)), fixed: ch(mk(true, true)) }; });
  check('คนพูดช่วยบอกตัวละคร: Zoro พูดอย่างแน่ใจ = ฉากนั้นมี Zoro เพิ่ม (นอกจาก Luffy) · ไม่แน่ใจ = ไม่เพิ่ม · ฉากที่ Han แก้ตัวละครเอง (fixed) = ไม่เพิ่ม', spk.z.includes('zoro') && spk.z.includes('luffy') && !spk.unsure.includes('zoro') && !spk.fixed.includes('zoro'), JSON.stringify(spk));
  const spx = await sp.evaluate(() => { const U = FT.ui, c = { id: 'thx', name: 'x', scenes: [{ s: 0, e: 2, ai: { characters: [] } }], speech: { segs: [{ s: 0.5, e: 1, t: 'ฮ่า', who: 'ลุงปลอมตัว', sure: true }, { s: 1, e: 1.5, t: 'โย่', who: 'ลอ', sure: true }] } }; U.syncSpeakers(c); return U.chars(c.scenes[0]).slice(); });
  check('คนพูดช่วยบอกตัวละคร: ชื่อไทยต้องตรงทั้งคำ ("ลุงปลอมตัว" ไม่กลายเป็น Law แต่ "ลอ" เป็น Law)', spx.length === 1 && spx[0] === 'law', JSON.stringify(spx));
  const cd = await sp.evaluate(() => { const U = FT.ui, a = U.lib().find((c) => c.id === 'sp1'); const host = document.createElement('div'); host.id = 'cardHost'; host.innerHTML = U.card(a, a.scenes[0]); document.querySelector('main').appendChild(host); return host.querySelectorAll('.spwho').length; });
  await sp.evaluate(() => { document.getElementById('cardHost').scrollIntoView(); }); await sp.locator('#cardHost .spwho').first().click(); await sp.waitForSelector('#pkSheet:not([hidden])', { timeout: 5000 });
  await sp.fill('#pkQ', 'ลุงเกาะ'); await sp.waitForTimeout(150); await sp.locator('#pkList button', { hasText: 'ใช้ "ลุงเกาะ"' }).first().click(); await sp.waitForTimeout(400);
  const cd2 = await sp.evaluate(() => ({ txt: document.querySelector('#cardHost .sps').textContent, who: FT.ui.lib().find((c) => c.id === 'sp1').speech.segs[0].who, big: !document.getElementById('big').hidden }));
  check('แก้ชื่อคนพูดจากการ์ด: แตะชื่อบนการ์ด → ชีตเลือก → พิมพ์บทบาทเอง → กล่องบทพูดบนการ์ดเปลี่ยนทันที + บันทึกลงคลิป · ไม่เปิดรูปใหญ่', cd === 2 && /ลุงเกาะ/.test(cd2.txt) && cd2.who === 'ลุงเกาะ' && !cd2.big && !spErr.length, JSON.stringify([cd, cd2, spErr]));
  await sp.evaluate(() => document.getElementById('cardHost').remove());
  // ภาพถี่จากวิดีโอจริง (webm สร้างในเบราว์เซอร์) → JPEG กว้าง 384 ตามเวลา
  const df = await sp.evaluate(async () => {
    const cv = document.createElement('canvas'); cv.width = 320; cv.height = 180; const x = cv.getContext('2d'), st = cv.captureStream(15), rec = new MediaRecorder(st, { mimeType: 'video/webm;codecs=vp8' }), ch = [];
    rec.ondataavailable = (e) => ch.push(e.data); rec.start(100); let n = 0; const iv = setInterval(() => { x.fillStyle = `hsl(${n * 30 % 360},80%,50%)`; x.fillRect(0, 0, 320, 180); n++; }, 60);
    await new Promise((r) => setTimeout(r, 2200)); clearInterval(iv); const done = new Promise((r) => { rec.onstop = r; }); rec.stop(); await done;
    const blob = new Blob(ch, { type: 'video/webm' }); const fr = await FT.speech.denseFrames(blob, 0, 2);
    return { size: blob.size, n: fr.length, head: fr[0] && fr[0].img.slice(0, 23), s0: fr[0] && fr[0].s };
  });
  check('ฟังเสียงคลิป: ดึงภาพถี่จากวิดีโอจริงได้ (JPEG data URL ตามเวลา)', df.n >= 1 && df.head === 'data:image/jpeg;base64,' && df.s0 > 0, JSON.stringify(df));
  const se = await sp.evaluate(() => { const L = FT.ui.lib(), mk = (id) => ({ id, name: id + '.mp4', size: 1, album: 'x', duration: 3, status: 'done', lastModified: 1, scenes: [{ s: 0, e: 3, ai: { arc: 'Alabasta' } }] });
    const a = mk('se1'), b = mk('se2'); a.speechErr = { wv: 3, msg: 'ไฟล์ใหญ่เกิน' }; L.push(a, b); const prev = FT.ui.hasSrc; FT.ui.hasSrc = (c) => /^se\d$/.test(c.id) || prev(c);
    const ids = FT.speech.pending().map((c) => c.id).filter((x) => /^se\d$/.test(x)); FT.ui.hasSrc = prev; L.splice(L.indexOf(a), 1); L.splice(L.indexOf(b), 1); return ids; });
  check('ฟังเสียงที่เหลือ: คลิปที่เคยพลาด (ไฟล์ใหญ่เกิน/ถอดเสียงไม่ได้) ไปอยู่ท้ายคิว ไม่ขวางคลิปอื่นทุกรอบ', se.join() === 'se2,se1', JSON.stringify(se));
  const oldGenT = await sp.evaluate(async () => { const L = FT.ui.lib(), added = []; for (let i = 0; i < 6; i++) { const c = { id: 'wv2_' + i, name: 'wv2_' + i + '.mp4', size: 1, album: 'x', duration: 3, status: 'done', lastModified: 1, scenes: [{ s: 0, e: 3, ai: {} }], speech: { wv: 2, watch: true, segs: [], cost: 0.03, sec: 10, at: 1 } }; L.push(c); added.push(c); }
    const prev = FT.ui.hasSrc; FT.ui.hasSrc = (c) => /^wv2_/.test(c.id) || prev(c); document.dispatchEvent(new CustomEvent('ft:lib')); await new Promise((r) => setTimeout(r, 300));
    const pend = FT.speech.pending().map((c) => c.id).filter((x) => /^wv2_/.test(x)).length, info = document.getElementById('spInfo').textContent, old = document.getElementById('spOld'), all = document.getElementById('spAll');
    const r = { pend, oldTxt: old.hidden ? '' : old.textContent, allHidden: all.hidden, info }; FT.ui.hasSrc = prev; added.forEach((c) => L.splice(L.indexOf(c), 1)); document.dispatchEvent(new CustomEvent('ft:lib')); return r; });
  check('ฟังเสียง: คลิปที่ฟังด้วยรุ่นก่อน (wv 2) นับว่าทำแล้ว ไม่บังคับทำซ้ำ (ไม่อยู่ในคิวที่เหลือ) · มีปุ่ม ทำซ้ำคลิปรุ่นก่อน 6 คลิป · ปุ่มที่เหลือทั้งหมดโผล่ (เพราะมีสถิติราคาแล้ว)', oldGenT.pend === 0 && /ทำซ้ำคลิปรุ่นก่อน 6 คลิป/.test(oldGenT.oldTxt) && /ดู\+ฟังแล้ว [6-9]|ดู\+ฟังแล้ว \d{2,}/.test(oldGenT.info), JSON.stringify(oldGenT));
  const sfT = await sp.evaluate(async () => { const prev = FT.transcribe, SR = 16000, d = new Int16Array(SR * 100), calls = []; FT.transcribe = async (b64, dur) => { calls.push(Math.round(dur)); if (dur > 40) throw new Error('OpenRouter error 403: SAFETY'); return { json: { segments: [{ s: 1, e: 2, t: 'x', who: '' }], summary_th: 's' }, cost: 0.001 }; };
    const sp1 = {}, r = await FT.speech.txSafe(d, 0, SR * 100, null, null, null, sp1); FT.transcribe = async () => { throw new Error('OpenRouter error 403: SAFETY'); }; const sp2 = {}, r2 = await FT.speech.txSafe(d, 0, SR * 20, null, null, null, sp2); FT.transcribe = async () => { throw new Error('OpenRouter error 500'); }; let thrown = false; try { await FT.speech.txSafe(d, 0, SR * 20, null, null, null, {}); } catch (e) { thrown = true; } FT.transcribe = prev;
    return { calls, segs: r.json.segments.map((g) => g.s), blocked: sp1.blocked || 0, b2: sp2.blocked, e2: r2.json.segments.length, thrown }; });
  check('ฟังเสียงโดน SAFETY: แบ่งท่อนละ 30 วิลองใหม่ ได้บทครบทุกท่อน (เวลาบวกชดเชย) · คลิปสั้นโดนบล็อกหมด = บทว่าง ไม่ error · error อื่นยังโยนตามเดิม', sfT.calls[0] === 100 && sfT.segs.join() === '1,31,61,91' && sfT.blocked === 0 && sfT.b2 === 1 && sfT.e2 === 0 && sfT.thrown, JSON.stringify(sfT));
  // v8.64 ตะกร้าฉาก: เก็บฉากจากการ์ด → แถบลอย → ตัดเป็นไฟล์ (mediabunny Conversion trim, WebM ในเครื่องทดสอบ) → MWNative.save · ฉากที่ตัดสำเร็จออกจากตะกร้า
  const bk0 = await sp.evaluate(async () => {
    const cv = document.createElement('canvas'); cv.width = 320; cv.height = 180; const x = cv.getContext('2d'), st = cv.captureStream(15), rec = new MediaRecorder(st, { mimeType: 'video/webm;codecs=vp8' }), ch = [];
    rec.ondataavailable = (e) => ch.push(e.data); rec.start(100); let n = 0; const iv = setInterval(() => { x.fillStyle = `hsl(${n * 20 % 360},80%,50%)`; x.fillRect(0, 0, 320, 180); n++; }, 60);
    await new Promise((r) => setTimeout(r, 3200)); clearInterval(iv); const done = new Promise((r) => { rec.onstop = r; }); rec.stop(); await done;
    const blob = new Blob(ch, { type: 'video/webm' }), url = URL.createObjectURL(blob), prev = FT.ui.srcUrl;
    FT.ui.srcUrl = async (c) => c.id === 'bk1' ? { url, done() {} } : prev(c);
    FT.ui.lib().push({ id: 'bk1', name: 'bk_clip.webm', size: blob.size, album: 'x', duration: 3, status: 'done', lastModified: 1, cover: '', scenes: [{ s: 0.5, e: 1.5, thumb: '', ai: { characters: [], summary_th: 'ฉากทดสอบตะกร้า' } }] });
    window.__saved = []; MWNative.save = async (b, nm, opt) => { window.__saved.push({ nm, size: b.size, noHist: !!(opt && opt.noHist), blob: b }); return { name: nm, path: 'Documents/Meowrin/' + nm, scanned: true }; }; FT.basket.setFormat('webm');
    const host = document.createElement('div'); host.id = 'bkHost'; host.innerHTML = FT.ui.card(FT.ui.lib().find((c) => c.id === 'bk1'), FT.ui.lib().find((c) => c.id === 'bk1').scenes[0]); document.querySelector('main').appendChild(host);
    return { size: blob.size, btn: !!host.querySelector('.bskadd') };
  });
  await sp.evaluate(() => document.getElementById('bkHost').scrollIntoView()); await sp.locator('#bkHost .bskadd').click(); await sp.waitForTimeout(200);
  const bk1 = await sp.evaluate(() => ({ bar: !document.getElementById('bskBar').hidden, txt: document.getElementById('bskBar').textContent, on: document.querySelector('#bkHost .bskadd').classList.contains('on'), big: !document.getElementById('big').hidden, n: FT.basket.list().length }));
  check('ตะกร้าฉาก: การ์ดมีปุ่ม เก็บฉาก · กดแล้วปุ่มเป็น ในตะกร้า + แถบลอยขึ้นพร้อมจำนวน · ไม่เปิดรูปใหญ่', bk0.btn && bk1.bar && /1 ฉาก/.test(bk1.txt) && bk1.on && !bk1.big && bk1.n === 1, JSON.stringify([bk0, bk1]));
  await sp.click('#bskBar'); await sp.waitForSelector('#bskSheet:not([hidden])', { timeout: 4000 }); await sp.locator('#bskList [data-rm]').first().click(); await sp.waitForTimeout(150);
  const bkr = await sp.evaluate(() => ({ on: document.querySelector('#bkHost .bskadd').classList.contains('on'), txt: document.querySelector('#bkHost .bskadd').textContent, n: FT.basket.list().length }));
  check('ตะกร้าฉาก: เอาฉากออกจากชีต → ดาวบนการ์ดกลับเป็น เก็บฉาก ทันที (บั๊กเดิม: ดาวค้าง)', !bkr.on && /เก็บฉาก/.test(bkr.txt) && bkr.n === 0, JSON.stringify(bkr));
  await sp.evaluate(() => { const c = FT.ui.lib().find((x) => x.id === 'bk1'); FT.basket.add(c, c.scenes[0]); document.getElementById('bskBar').dispatchEvent(new Event('click')); }); await sp.waitForSelector('#bskSheet:not([hidden])', { timeout: 4000 }); await sp.click('#bskRun');
  await sp.waitForFunction(() => /ตัดเสร็จ/.test(document.getElementById('bskMsg').textContent), null, { timeout: 30000 });
  const bk2 = await sp.evaluate(async () => { const sv = window.__saved[0], mb = await FT.speech.loadMB(); let dur = -1, err = ''; try { const inp = new mb.Input({ source: new mb.BlobSource(sv.blob), formats: mb.ALL_FORMATS }); dur = await inp.computeDuration(); } catch (e) { err = e.message; }
    return { n: window.__saved.length, nm: sv.nm, size: sv.size, noHist: sv.noHist, dur, err, msg: document.getElementById('bskMsg').textContent, left: FT.basket.list().length, over: document.documentElement.scrollWidth > innerWidth + 1 }; });
  check('ตะกร้าฉาก: ตัดฉาก 0.5–1.5 วิ ของคลิปเป็นไฟล์ใหม่ (ยาวราว 1 วิ) · ชื่อไฟล์มีลำดับ/ชื่อคลิป/เวลา · ไม่จดประวัติงาน · ฉากที่ตัดแล้วออกจากตะกร้า · หน้าไม่ล้น', bk2.n === 1 && /^picks\/01_bk_clip_0m01s-0m02s\.webm$/.test(bk2.nm) && bk2.size > 500 && bk2.noHist && bk2.dur > 0.5 && bk2.dur < 1.8 && bk2.left === 0 && /ตัดเสร็จ 1 ไฟล์/.test(bk2.msg) && !bk2.over && !spErr.length, JSON.stringify(bk2));
  await sp.click('#bskDone'); await sp.evaluate(() => document.getElementById('bkHost').remove());
  await sp.evaluate(() => { document.querySelectorAll('#spList details').forEach((d) => { d.open = true; }); });
  await sp.locator('#spList .spln').first().click(); await sp.waitForFunction(() => !document.getElementById('alPlay').hidden && /^blob:/.test(document.getElementById('alVid').src), null, { timeout: 8000 });
  const sp2 = await sp.evaluate(() => ({ t: document.getElementById('alpT').textContent, line: document.getElementById('alpLine').textContent, btn: document.querySelectorAll('#spList .spplay').length }));
  check('ฟังเสียงคลิป: กดบรรทัดบทพูด = เปิดตัวเล่นเต็มจอของคลิปนั้น (ชื่อคลิปตรง) · มีปุ่ม เล่นคลิปเทียบเสียง ทุกคลิปที่มีเสียง', sp2.t === 'v1.wav' && sp2.btn === 1 && !spErr.length, JSON.stringify([sp2, spErr]));
  await sp.close();
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
  // v8.48 ชีตภาค: ทุกภาคในรายชื่อรวมภาคพิเศษ (Movies/TV Specials/Filler) · เรียงตามเนื้อเรื่อง/จำนวน · ซ่อนภาคที่ 0
  await sq.click('#chips [data-open=r]'); await sq.waitForTimeout(200);
  const rowsOf = () => sq.evaluate(() => [...document.querySelectorAll('#pkList .alrow b')].map((b) => b.textContent));
  const apA = await rowsOf(); await sq.click('#pkBar [data-b=order]'); await sq.waitForTimeout(100); const apB = await rowsOf();
  await sq.click('#pkBar [data-b=hide0]'); await sq.waitForTimeout(100); const apC = await rowsOf(); await sq.click('#pkBar [data-b=hide0]'); await sq.waitForTimeout(100);
  const apBar = await sq.evaluate(() => [...document.querySelectorAll('#pkBar button')].map((b) => b.textContent + (b.classList.contains('on') ? '*' : '')).join('|'));
  const pkFit = await sq.evaluate(() => { const r = document.getElementById('pkDone').getBoundingClientRect(), b = document.getElementById('pkBar').getBoundingClientRect(); return { bottom: Math.round(r.bottom), h: innerHeight, barH: Math.round(b.height) }; });
  check('ชีตเลือก (มีแถบตัวเลือก): ปุ่ม เสร็จ ไม่ตกขอบจอ (เหลือที่ว่างใต้ปุ่ม ≥ 12px) · แถบตัวเลือกบรรทัดเดียว', pkFit.bottom <= pkFit.h - 12 && pkFit.barH <= 40, JSON.stringify(pkFit));
  await sq.click('#pkDone'); await sq.waitForTimeout(200);
  check('ชีตภาค: มีภาคพิเศษ Movies/TV Specials/Filler ครบแม้ 0 ฉาก · เรียงตามเนื้อเรื่อง (Alabasta ก่อน Skypiea ก่อน Movies) · ซ่อนภาคที่ 0 เหลือเฉพาะที่มีฉาก', ['Movies', 'TV Specials', 'Filler', 'Romance Dawn'].every((n) => apA.includes(n)) && apB.indexOf('Alabasta') < apB.indexOf('Skypiea') && apB.indexOf('Skypiea') < apB.indexOf('Movies') && apC.length < apA.length && !apC.includes('Movies') && /ตามเนื้อเรื่อง\*/.test(apBar), JSON.stringify([apA.length, apB.slice(0, 14), apC, apBar]));
  // v8.48 หัวแถวปุ่ม จัดอัลบั้มใหม่/สแกนใหม่ ไม่แตกบรรทัดในแถบตัวละคร/ภาค (ข้อความสั้นลง + ปุ่ม nowrap)
  // v8.49 หมวดฉาก: จัดจากคำที่ AI เขียน (ฟรี) · เรือเมอร์รี่/ทะเล/ภายใน · ไม่มีตัวละคร · ใช้ร่วมกับตัวกรองอื่น
  await sq.click('#chips [data-clr]'); await sq.waitForTimeout(300);
  await sq.evaluate(() => { FT.ui.lib().push({ id: 'ct1', name: 'ct1.mp4', size: 11, album: 'luffy', duration: 30, status: 'done', lastModified: 3, cover: '', scenes: [
    { s: 0, e: 4, thumb: '', ai: { characters: [], location: 'Going Merry deck', summary_th: 'เรือเมอร์รี่แล่นกลางทะเลสีฟ้า' } },
    { s: 4, e: 9, thumb: '', ai: { characters: [], summary_th: 'ทางเดินภายในอาคารว่างเปล่า' } },
    { s: 9, e: 14, thumb: '', ai: { characters: ['Luffy'], summary_th: 'ลูฟี่ยิ้มกว้างบนเรือซันนี่' } },
    { s: 14, e: 20, thumb: '', ai: { characters: [], summary_th: 'ใบหน้าตัวละครใกล้ชิด' } }] }); FT.ui.search(); });
  await sq.click('#chips [data-open=t]'); await sq.waitForTimeout(200);
  const ctRows = await sq.evaluate(() => [...document.querySelectorAll('#pkList .alrow')].map((r) => r.textContent.replace(/\s+/g, ' ').trim()));
  await sq.locator('#pkList .alrow', { hasText: 'เรือเมอร์รี่' }).click(); await sq.waitForTimeout(200);
  const ctInfo = await sq.evaluate(() => document.getElementById('pkInfo').textContent); /* เรือเมอร์รี่ = 1 ฉาก */
  await sq.locator('#pkList .alrow', { hasText: 'เรือเมอร์รี่' }).click(); await sq.locator('#pkList .alrow', { hasText: 'ภายใน' }).click(); await sq.click('#pkBar [data-b=noChar]'); await sq.waitForTimeout(200);
  const ctInfo2 = await sq.evaluate(() => document.getElementById('pkInfo').textContent); /* ภายใน + ไม่มีตัวละคร = 1 ฉาก */
  await sq.locator('#pkList .alrow', { hasText: 'ภายใน' }).click(); await sq.locator('#pkList .alrow', { hasText: 'จัดหมวดไม่ได้' }).click(); await sq.waitForTimeout(200);
  const ctInfo3 = await sq.evaluate(() => document.getElementById('pkInfo').textContent); /* อื่นๆ + ไม่มีตัวละคร: ฉากไม่มีตัวละครที่จัดหมวดไม่ได้ */
  await sq.locator('#pkList .alrow', { hasText: 'จัดหมวดไม่ได้' }).click(); await sq.locator('#pkList .alrow', { hasText: 'เรืออื่น' }).click(); await sq.click('#pkBar [data-b=noChar]'); await sq.waitForTimeout(200);
  const ctInfo4 = await sq.evaluate(() => document.getElementById('pkInfo').textContent); /* เรืออื่นๆ = เรือซันนี่ไม่ซ้ำ → 0 (ซันนี่มีหมวดของตัวเอง) */
  await sq.locator('#pkList .alrow', { hasText: 'เรืออื่น' }).click(); await sq.locator('#pkList .alrow', { hasText: 'เรือซันนี่' }).click(); await sq.click('#pkDone'); await sq.waitForTimeout(300);
  const ctRes = await sq.evaluate(() => ({ cards: document.querySelectorAll('#results .card').length, chip: [...document.querySelectorAll('#chips .chip')].some((c) => /เรือซันนี่/.test(c.textContent)) }));
  check('หมวดฉาก: ปุ่ม "ฉาก" ในแผงค้นหา · มีหมวดเรือเมอร์รี่/ทะเล/ภายใน/อื่นๆ · เรือเมอร์รี่=1 ฉาก · ภายใน+ไม่มีตัวละคร=1 · เรือซันนี่ (ฉากที่มีตัวละคร) = 1 ใบ · ป้ายบนปุ่ม', ['เรือเมอร์รี่', 'เรือซันนี่', 'ทะเล', 'ภายใน / ห้อง'].every((n) => ctRows.some((r) => r.includes(n))) && /1 ฉาก/.test(ctInfo) && /1 ฉาก/.test(ctInfo2) && /ฉาก/.test(ctInfo3) && /0 ฉาก/.test(ctInfo4) && ctRes.cards === 1 && ctRes.chip, JSON.stringify([ctRows.slice(0, 5), ctInfo, ctInfo2, ctInfo3, ctInfo4, ctRes]));
  const hd = {}; await sq.click('#chips [data-clr]'); await sq.waitForTimeout(300); /* ล้างตัวกรอง = กลับตารางอัลบั้ม */
  for (const m of ['char', 'arc', 'phone']) { await sq.click(`#alSeg [data-m=${m}]`); await sq.waitForTimeout(250); hd[m] = await sq.evaluate(() => { document.getElementById('orgBtn').hidden = false; document.getElementById('alScan').hidden = false; return [...document.querySelectorAll('.alhead .btn')].filter((b) => b.offsetParent).map((b) => Math.round(b.getBoundingClientRect().height)); }); }
  check('หัวแถวอัลบั้ม: ปุ่ม จัดอัลบั้มใหม่/สแกนใหม่ บรรทัดเดียว (สูงไม่เกิน 44px) ทั้งโหมดตัวละคร/ภาค/ในมือถือ', Object.values(hd).every((a) => a.length >= 2 && a.every((h) => h <= 44)), JSON.stringify(hd));
  // v8.48 ตัวเล่น: กรอแล้วเด้งไป 0:00 (ไฟล์ _capacitor_file_ ตอบ Range ไม่ครบ) → โหลดเป็น Blob แล้วกรอไปที่เดิม
  const sk = await sq.evaluate(async () => {
    const v = new EventTarget(); v.currentSrc = 'https://localhost/_capacitor_file_/a.mp4'; v.currentTime = 0; v.paused = false; v.duration = 100; v.play = () => Promise.resolve();
    Object.defineProperty(v, 'src', { set(u) { v._set = u; setTimeout(() => v.dispatchEvent(new Event('loadedmetadata')), 5); }, get() { return v._set; } });
    const f0 = window.fetch; window.fetch = async () => ({ headers: { get: () => null }, blob: async () => new Blob(['x']) });
    const msgs = []; MWLocal.seekable(v, (m) => msgs.push(m));
    v.currentTime = 30; v.dispatchEvent(new Event('seeking')); v.currentTime = 0; v.dispatchEvent(new Event('seeked'));
    await new Promise((r) => setTimeout(r, 150)); window.fetch = f0;
    const out = { src: String(v._set).slice(0, 5), t: v.currentTime, blob: !!v._blob, msgs };
    MWLocal.release(v); out.freed = !v._blob; return out;
  });
  check('ตัวเล่น: กรอไป 30 วิแล้วเด้งกลับ 0 = โหลดเป็น Blob แล้วกรอไป 30 วิให้ · ปิดตัวเล่นคืนหน่วยความจำ', sk.src === 'blob:' && sk.t === 30 && sk.blob && sk.freed && sk.msgs.length === 2, JSON.stringify(sk));
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
        stat: async (o) => { if (fsx.hidden && o.path === 'Meowrin/library/.nomedia') return {}; throw new Error('nope'); }, writeFile: async (o) => { fsx.ops.push(['write', o.path, o.directory]); if (o.path === 'Meowrin/library/.nomedia') fsx.hidden = 1; },
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
  const nm = await lb.evaluate(() => window.__fs.ops.filter((o) => o[0] === 'write').map((o) => o.join('|')));
  const nmInfo = await lb.evaluate(() => document.getElementById('libInfo').textContent);
  check('เก็บคลิปไว้ในแอพ: แผงบอกผลการซ่อนจากแกลเลอรี (ให้ Han เห็นเองไม่ต้องเปิดดูไฟล์)', /สร้างไฟล์ \.nomedia แล้ว|ซ่อนจากแกลเลอรีแล้ว/.test(nmInfo), nmInfo);
  check('เก็บคลิปไว้ในแอพ: สร้าง .nomedia ในโฟลเดอร์สำเนา (ซ่อนจากแกลเลอรี) ครั้งเดียว ไม่เขียนซ้ำ', nm.length === 1 && nm[0] === 'write|Meowrin/library/.nomedia|DOCUMENTS', JSON.stringify(nm));
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
  // R2 ถูกเอาออกทั้งระบบ (v8.21): ไม่มีไฟล์/ตัวแปร/แผง R2 เหลือ และหน้าฟุตเทจเปิดได้ปกติ
  const r2p = await context.newPage(); const r2e = []; r2p.on('pageerror', (e) => r2e.push(e.message));
  await r2p.goto(base + '/footage.html'); await r2p.waitForFunction(() => window.FT && FT.ui, null, { timeout: 20000 }); await r2p.waitForTimeout(500);
  const r2r = await r2p.evaluate(() => ({ g: ['R2'].filter((k) => k in window), cloud: !!FT.cloud, ids: ['r2Save', 'r2Account', 'cloudBox', 'cloudList', 'bgR2', 'tagR2'].filter((i) => document.getElementById(i)), budget: Object.keys(MWBudget).filter((k) => /r2/i.test(k)) }));
  const r2files = ['r2.js', 'footage-cloud.js'].filter((f) => existsSync(join(ROOT, f)));
  check('R2: ไม่มีไฟล์ r2.js/footage-cloud.js · ไม่มี window.R2/FT.cloud · ไม่มีแผง/ช่อง R2 ในหน้า · หน้าฟุตเทจไม่มี error', !r2files.length && !r2r.g.length && !r2r.cloud && !r2r.ids.length && !r2r.budget.length && !r2e.length, JSON.stringify([r2files, r2r, r2e]));
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
  // คลิปชื่อ+ขนาดเดียวกันอยู่ 2 อัลบั้ม (ซ้ำข้ามอัลบั้ม) + มีสำเนาในโฟลเดอร์สำเนา → ทั้งสองรายการต้องนับว่ามีสำเนา (เดิมนับตกอันหนึ่ง = "ยังไม่มีสำเนา 99") · โฟลเดอร์สำเนาอ่านไม่ได้ต้องจดไว้
  const dq = await context.newPage();
  await dq.addInitScript(() => { window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: () => true, Plugins: { Media: { getAlbums: async () => ({ albums: [{ name: 'luffy', identifier: '/s/Pictures/Gallery/owner/luffy' }, { name: 'zoro', identifier: '/s/Pictures/Gallery/owner/zoro' }] }) },
    Filesystem: { stat: async () => { throw new Error('nope'); }, writeFile: async () => {}, readdir: async ({ path, directory }) => { if (directory === 'DOCUMENTS') { if (path === 'Meowrin/library') return { files: [{ name: 'luffy', type: 'directory' }, { name: 'bad', type: 'directory' }] }; if (path === 'Meowrin/library/luffy') return { files: [{ name: 'dup.mp4', type: 'file', size: 90, uri: 'file:///docs/Meowrin/library/luffy/dup.mp4' }] }; throw new Error('EACCES'); }
      return { files: [{ name: 'dup.mp4', type: 'file', size: 90, uri: 'file:///s/Pictures/Gallery/owner/x/dup.mp4' }] }; } } } }; });
  await dq.goto(base.replace('localhost', '127.0.0.1') + '/footage.html'); await dq.waitForFunction(() => window.MWLib && window.MWLocal && window.FT && FT.ui, null, { timeout: 20000 });
  const dqr = await dq.evaluate(async () => { await MWLocal.scan(); return { todo: MWLib.todo().length, list: MWLocal.list().filter((f) => f.name === 'dup.mp4').length, bad: MWLocal.libInfo().bad }; });
  check('สแกนสำเนา: คลิปซ้ำข้ามอัลบั้มนับว่ามีสำเนาทั้งสองรายการ · โฟลเดอร์สำเนาที่อ่านไม่ได้ถูกจดไว้', dqr.todo === 0 && dqr.list === 2 && dqr.bad.length === 1 && /^bad:/.test(dqr.bad[0]), JSON.stringify(dqr));
  await dq.close();
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
  const otaCtx = await browser.newContext({ viewport: { width: 380, height: 820 }, serviceWorkers: 'block' });
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
  check('อัปเดตแอพ (ota.js): ชุดที่ดาวน์โหลดไว้ไม่มีไฟล์ → ไม่สลับ (ไม่ทำให้หน้าพัง)', /ไม่ครบ/.test(o7.err || '') && o7.sb === 0, JSON.stringify(o7));
  await o7p.close();
  // ไฟล์ต้นๆ ของชุดที่โหลดหายไปแค่ไฟล์เดียว (เคยเกิดจริง: ลบกลางทาง → หน้าเปล่า) → ไม่สลับ
  const o8p = await otaPage(false);
  const o8 = await o8p.evaluate(async () => { await MWOta.check(); await MWOta.download(); const i = window.__o.w.findIndex(([p]) => /icons\.js$/.test(p)); window.__o.w.splice(i, 1); try { await MWOta.apply(); return { err: null, sb: window.__o.sb.length }; } catch (e) { return { err: e.message, sb: window.__o.sb.length }; } });
  check('อัปเดตแอพ (ota.js): ไฟล์ในชุดที่โหลดหายไปแค่ 1 ไฟล์ก็ไม่สลับ', /ไม่ครบ/.test(o8.err || '') && o8.sb === 0, JSON.stringify(o8));
  await o8p.close();
  // ดาวน์โหลดซ้อน/ลบชุดเก่าระหว่างโหลด: เรียก download 2 ครั้งพร้อมกันเขียนไฟล์ชุดเดียว · bootOk ระหว่างโหลดห้ามลบโฟลเดอร์ใดๆ
  const o9p = await otaPage(false);
  const o9 = await o9p.evaluate(async () => { await MWOta.check(); const a = MWOta.download(), b = MWOta.download(); await MWOta.bootOk(); const ra = await a, rb = await b; return { same: ra.dir === rb.dir, writes: window.__o.w.length, rmDuring: window.__o.rm.slice() }; });
  check('อัปเดตแอพ (ota.js): โหลดซ้อนใช้งานเดียวกัน (เขียนไฟล์ชุดเดียว) · bootOk ระหว่างโหลดไม่ลบชุดที่กำลังเขียน', o9.same && o9.writes === 5 && !o9.rmDuring.some((x) => /newid/.test(x)), JSON.stringify(o9));
  await o9p.close();
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
  // สตูดิโอ (studio.html): ไม่มีโปรเจกต์ = หน้าว่างบอกทาง · fromPlan รวมช็อตค้างภาพ · พรีวิววาดคลิปถูกตัว เต็มกรอบไม่ตัดขอบ · แบ่ง/ลบ/เลิกทำ/ทำซ้ำ · ส่งออกได้ไฟล์
  {
  const se = await open('/studio.html', 'หน้าสตูดิโอ (ว่าง)');
  check('สตูดิโอ: ยังไม่มีโปรเจกต์ = หน้าว่างพร้อมลิงก์ไปตัดต่ออัตโนมัติ', await se.page.evaluate(() => !document.getElementById('stEmpty').hidden && document.getElementById('stMain').hidden && !!document.querySelector('#stEmpty a[href="footage.html?tab=plan"]')));
  const clipsB64 = await se.page.evaluate(async () => {
    const mb = await import('/sub/vendor/mediabunny.min.js');
    async function make(color){ const c = document.createElement('canvas'); c.width = 320; c.height = 180; const x = c.getContext('2d'); const o = new mb.Output({ format: new mb.Mp4OutputFormat(), target: new mb.BufferTarget() }); const v = new mb.CanvasSource(c, { codec: 'vp9', quality: mb.QUALITY_HIGH }); o.addVideoTrack(v); await o.start();
      for (let i = 0; i < 60; i++){ x.fillStyle = color; x.fillRect(0, 0, 320, 180); await v.add(i / 30, 1 / 30); } await o.finalize(); const b = new Uint8Array(o.target.buffer); let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); }
    const fp = MWStudio.fromPlan([{ c: { name: 'a.mp4', size: 1 }, at: 0, from: 1, to: 2, t: 'หนึ่ง' }, { c: null, at: 1.2, from: 0, to: 0, t: 'ค้าง' }, { c: { name: 'b.mp4', size: 2 }, at: 2, from: 5, to: 6, t: 'สาม' }], { voice: { id: 9, dur: 3 }, uriOf: (c) => 'file:///x/' + c.name });
    return { red: await make('#d00'), blue: await make('#00d'), fp: { lens: fp.clips.map((c) => c.len), uri: fp.clips[1].uri, texts: fp.texts.length, dur: MWStudio.duration(fp) } };
  });
  await finishPage(se); await se.page.close();
  check('สตูดิโอ: fromPlan มีเสียงพากย์ → ช็อตค้างภาพรวมเข้าช็อตก่อนหน้า ช็อตสุดท้ายยาวถึงท้ายเสียง', JSON.stringify(clipsB64.fp.lens) === '[2,1]' && clipsB64.fp.uri === 'file:///x/b.mp4' && clipsB64.fp.texts === 3 && clipsB64.fp.dur === 3, JSON.stringify(clipsB64.fp));
  const sp = await context.newPage(); const spErr = []; sp.on('pageerror', (e) => spErr.push(e.message));
  await sp.route(/\/t\/(red|blue)\.mp4/, (rt) => rt.fulfill({ status: 200, contentType: 'video/mp4', body: Buffer.from(clipsB64[/red/.test(rt.request().url()) ? 'red' : 'blue'], 'base64') }));
  await sp.goto(base + '/studio.html'); await sp.waitForFunction(() => window.MWStudio, null, { timeout: 20000 });
  await sp.evaluate(async (b) => { await MWStore.ready; const p = MWStudio.blank('ทดสอบสตูดิโอ'); p.bg = 'black'; p.clips = [{ id: 'a', uri: b + '/t/red.mp4', name: 'red', size: 1, from: 0.2, len: 1, thumb: '', t: '' }, { id: 'b', uri: b + '/t/blue.mp4', name: 'blue', size: 1, from: 0, len: 1, thumb: '', t: '' }]; p.texts = [{ at: 0, len: 1, t: 'แดง' }, { at: 1, len: 1, t: 'น้ำเงิน' }]; MWStudio.save(p); }, base);
  await sp.reload(); await sp.waitForFunction(() => window.MWStudioUI, null, { timeout: 20000 });
  const px = (t) => sp.evaluate(async (t) => { const pl = MWStudioUI.player(); pl.seek(t); await new Promise((ok) => setTimeout(ok, 700)); pl.paint(); const c = document.getElementById('stCanvas'), x = c.getContext('2d'); const mid = x.getImageData(c.width / 2, c.height / 2, 1, 1).data, top = x.getImageData(c.width / 2, 10, 1, 1).data; return { mid: mid[0] > 120 && mid[2] < 80 ? 'R' : mid[2] > 120 && mid[0] < 80 ? 'B' : '?', top: top[0] + top[1] + top[2], w: c.width, h: c.height }; }, t);
  const s1 = await px(0.5), s2 = await px(1.5);
  check('สตูดิโอ: พรีวิววาดคลิปตามเวลา (แดง → น้ำเงิน) ภาพเต็มกรอบ ไม่ตัดขอบ (บน/ล่างเป็นพื้นดำ) กรอบ 9:16', s1.mid === 'R' && s2.mid === 'B' && s1.top < 30 && s1.w === 540 && s1.h === 960, JSON.stringify([s1, s2]));
  await sp.evaluate(() => { const p = MWStudioUI.ed().p; p.bg = 'blur'; MWStudioUI.player().setProject(p); });
  const s3 = await px(0.5);
  check('สตูดิโอ: พื้นหลังเบลอ = ขอบบนเป็นสีจากภาพ ไม่ใช่ดำ', s3.mid === 'R' && s3.top > 60, JSON.stringify(s3));
  const ui = await sp.evaluate(async () => {
    const pl = MWStudioUI.player(), n = () => document.querySelectorAll('#stTlIn .clip').length, out = { clips0: n(), texts: document.querySelectorAll('#stTlIn .tx').length };
    pl.seek(0.5); document.getElementById('stSplit').click(); out.split = n(); out.lens = MWStudioUI.ed().p.clips.map((c) => c.len); out.from2 = MWStudioUI.ed().p.clips[1].from;
    document.getElementById('stUndo').click(); out.undo = n(); document.getElementById('stRedo').click(); out.redo = n();
    document.querySelector('#stTlIn .clip[data-i="2"]').click(); out.sel = !!document.querySelector('#stTlIn .clip.sel[data-i="2"]');
    document.getElementById('stDel').click(); out.del = n(); out.saved = MWStore.get('mw_studio_v1').cur.clips.length;
    pl.seek(0); pl.play(); await new Promise((ok) => setTimeout(ok, 800)); out.moved = pl.t; out.playing = pl.playing; pl.pause();
    out.scroll = document.getElementById('stTl').scrollLeft;
    return out;
  });
  check('สตูดิโอ: ไทม์ไลน์มี 2 คลิป + ข้อความ · แบ่งตรงเส้นเล่น → 3 คลิป (0.5+0.5 วิ ต้นคลิปที่ 2 เลื่อนตาม) · เลิกทำ/ทำซ้ำ · เลือกแล้วลบ · บันทึกลงเครื่อง', ui.clips0 === 2 && ui.texts === 2 && ui.split === 3 && JSON.stringify(ui.lens) === '[0.5,0.5,1]' && Math.abs(ui.from2 - 0.7) < 0.001 && ui.undo === 2 && ui.redo === 3 && ui.sel && ui.del === 2 && ui.saved === 2, JSON.stringify(ui));
  check('สตูดิโอ: กดเล่นแล้วเวลาเดิน ไทม์ไลน์เลื่อนตาม', ui.moved > 0.3 && ui.playing && ui.scroll > 10, JSON.stringify(ui));
  const sx = await sp.evaluate(async () => { const pr = await import('/exporter.js'); const p = MWStudioUI.ed().p; const r = await pr.exportShots({ shots: p.clips.map((c) => ({ url: c.uri, start: c.from, dur: c.len })), width: 270, height: 480, fps: 30, codec: 'vp9', draw: (ctx, W, H, img) => MWStudioPlayer.draw(ctx, W, H, img, img.width, img.height, 'black') });
    const v = document.createElement('video'); v.muted = true; v.src = URL.createObjectURL(r.blob); await new Promise((ok) => v.onloadeddata = ok); v.currentTime = 0.2; await new Promise((ok) => v.onseeked = ok);
    const c = document.createElement('canvas'); c.width = 27; c.height = 48; const x = c.getContext('2d'); x.drawImage(v, 0, 0, 27, 48); const top = x.getImageData(13, 2, 1, 1).data, mid = x.getImageData(13, 24, 1, 1).data; return { frames: r.frames, top: top[0] + top[1] + top[2], midR: mid[0] }; });
  check('สตูดิโอ: ส่งออกใช้วิธีวางภาพเดียวกับพรีวิว (เต็มกรอบ ไม่ตัดขอบ)', sx.frames === 30 && sx.top < 40 && sx.midR > 120, JSON.stringify(sx));
  const over = await sp.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, tb: document.querySelector('.tools').getBoundingClientRect().bottom, ih: innerHeight }));
  check('สตูดิโอ: ไม่มี error · หน้าไม่ล้นจอ · แถบเครื่องมืออยู่ในจอ', !spErr.length && over.sw <= over.iw + 1 && over.tb <= over.ih + 1, spErr.join(' | ') + JSON.stringify(over));
  // สตูดิโอรอบ 2: ลากขอบยืด/หด (ขอบซ้ายตัดหัว ขอบขวายืดท้าย ไม่เกินความยาวคลิปต้นทาง) · ทำซ้ำ · ย้ายซ้าย/ขวา · เลิกทำ
  await sp.evaluate(async () => { await MWStore.ready; const p = MWStudio.blank('รอบสอง'); p.bg = 'black'; const mk = (id, from, len, max) => ({ id, uri: null, name: id, size: 1, from, len, max, thumb: '', t: id }); p.clips = [mk('a', 2, 2, 10), mk('b', 0, 1, 10), mk('c', 0, 1, 0)]; MWStudio.save(p); });
  await sp.reload(); await sp.waitForFunction(() => window.MWStudioUI, null, { timeout: 20000 });
  const pure = await sp.evaluate(() => { const c = { from: 2, len: 2, max: 10 }, t = MWStudio.trimTo; return [t(c, 'end', 3), t(c, 'end', 99), t(c, 'end', -5), t(c, 'start', 1), t(c, 'start', -5), t(c, 'start', 9), t({ from: 0, len: 1, max: 0 }, 'end', 50)].map((r) => r.from + '/' + r.len).join(' '); });
  check('สตูดิโอ: คำนวณลากขอบถูก (ยืดท้ายไม่เกินคลิปต้นทาง · ตัดหัวแล้วช่วงท้ายคงเดิม · สั้นสุด 0.1 วิ · ไม่รู้ความยาวต้นทาง = ยืดได้)', pure === '2/5 2/8 2/0.1 3/1 0/4 3.9/0.1 0/51', pure);
  const sel0 = await sp.evaluate(() => { document.querySelector('#stTlIn .clip[data-i="0"]').click(); return !!document.querySelector('#stTlIn .clip.sel .gl') && !!document.querySelector('#stTlIn .clip.sel .gr'); });
  check('สตูดิโอ: เลือกคลิป → ขึ้นมือจับซ้าย/ขวา (เฉพาะคลิปที่เลือก)', sel0 && (await sp.evaluate(() => document.querySelectorAll('#stTlIn .gl').length)) === 1);
  const drag = async (cls, dx) => { const b = await sp.locator('#stTlIn .clip.sel ' + cls).boundingBox(); await sp.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await sp.mouse.down(); await sp.mouse.move(b.x + b.width / 2 + dx / 2, b.y + b.height / 2, { steps: 4 }); await sp.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2, { steps: 4 }); await sp.mouse.up(); await sp.waitForTimeout(150); return sp.evaluate(() => MWStudioUI.ed().p.clips.map((c) => c.from + '/' + c.len).join(' ')); };
  const pps = await sp.evaluate(() => { const c = document.querySelector('#stTlIn .clip[data-i="0"]'); return (c.getBoundingClientRect().width + 2) / 2; });
  const d1 = await drag('.gr', pps); /* ลากขอบขวาไปขวา 1 วิ → ยาว 3 */
  const d2 = await drag('.gl', pps / 2); /* ลากขอบซ้ายไปขวา 0.5 วิ → เริ่ม 2.5 ยาว 2.5 */
  check('สตูดิโอ: ลากขอบขวา +1 วิ → ยาว 3 วิ · ลากขอบซ้าย +0.5 วิ → ตัดหัว (เริ่ม 2.5 ท้ายคงเดิม) · คลิปถัดไปขยับตามเอง', /^2\/3 /.test(d1) && /^2\.5\/2\.5 /.test(d2) && (await sp.evaluate(() => MWStudio.starts(MWStudioUI.ed().p).join(','))) === '0,2.5,3.5', d1 + ' | ' + d2);
  await sp.evaluate(() => document.getElementById('stUndo').click());
  check('สตูดิโอ: เลิกทำลากขอบ = กลับครั้งละขั้น', (await sp.evaluate(() => MWStudioUI.ed().p.clips[0].from + '/' + MWStudioUI.ed().p.clips[0].len)) === '2/3');
  const ops = await sp.evaluate(() => { const ed = MWStudioUI.ed(), ids = () => ed.p.clips.map((c) => c.name).join(''), o = {};
    document.querySelector('#stTlIn .clip[data-i="0"]').click(); document.getElementById('stDup').click(); o.dup = ids(); o.dupSel = document.querySelector('#stTlIn .clip.sel').dataset.i; o.uniq = new Set(ed.p.clips.map((c) => c.id)).size === 4;
    document.getElementById('stRight').click(); o.right = ids(); o.rightSel = document.querySelector('#stTlIn .clip.sel').dataset.i;
    document.getElementById('stLeft').click(); document.getElementById('stLeft').click(); o.left = ids(); document.getElementById('stLeft').click(); o.edge = ids() === o.left; o.msg = document.getElementById('stMsg').textContent;
    document.getElementById('stUndo').click(); document.getElementById('stUndo').click(); o.undo = ids(); return o; });
  check('สตูดิโอ: ทำซ้ำคลิป (ต่อท้ายอันเดิม รหัสไม่ซ้ำ) · ย้ายซ้าย/ขวาตามที่เลือก · สุดทางไม่ย้าย · เลิกทำ', ops.dup === 'aabc' && ops.dupSel === '1' && ops.uniq && ops.right === 'abac' && ops.rightSel === '2' && ops.left === 'aabc' && ops.edge && /หน้าสุด/.test(ops.msg), JSON.stringify(ops));
  await sp.evaluate(() => MWStore.del('mw_studio_v1'));
  await sp.close();
  }
  // ประวัติงาน (history.js + history-ui.js): เก็บ N อันล่าสุดต่อชนิด · key เดิม = แก้ของเดิม · เก็บเฉพาะวิดีโอ/srt (ไม่เก็บ mp3) · สูตรที่เกินถูกลบพร้อมไฟล์สำรอง · ไฟล์วิดีโอไม่ลบเอง · ล้างข้อมูลแล้วดึงกลับจากไฟล์ · แผงในตั้งค่า · เปิดตารางกลับในตัดต่ออัตโนมัติ
  {
    const hp = await context.newPage(); const hErr = []; hp.on('pageerror', (e) => hErr.push(e.message));
    await hp.goto(base + '/index.html'); await hp.waitForFunction(() => window.MW && window.MWHist, null, { timeout: 20000 });
    const h = await hp.evaluate(async () => {
      MWStore.del('mw_hist_v1'); const out = {}, files = {}, dels = [];
      window.Capacitor = { isNativePlatform: () => true, Plugins: { Filesystem: {
        writeFile: async ({ path, data }) => { files[path] = data; }, deleteFile: async ({ path }) => { dels.push(path); delete files[path]; },
        readdir: async ({ path }) => path === 'Meowrin/history' ? { files: Object.keys(files).filter((p) => p.startsWith('Meowrin/history/')).map((p) => ({ name: p.split('/').pop(), type: 'file' })) } : { files: [{ name: 'meowrin_studio_2201.mp4', type: 'file', size: 5, uri: 'file:///d/a.mp4', mtime: 5 }, { name: 'x.mp3', type: 'file', size: 1, mtime: 6 }, { name: 'history', type: 'directory' }] },
        readFile: async ({ path }) => ({ data: files[path] }) } } };
      const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
      MWHist.setMax(5);
      for (let i = 0; i < 8; i++) MWHist.add('plan', { key: 100 + i, title: 'บทที่ ' + i, data: { script: 'ก' + i } });
      MWHist.add('plan', { key: 107, title: 'แก้ซ้ำ', data: { script: 'ใหม่' } });
      out.plan = MWHist.list('plan').map((x) => x.key).join(','); out.top = MWHist.list('plan')[0].title;
      MWHist.addFile({ name: 'voice.mp3', rel: 'Meowrin/voice.mp3', uri: 'u', size: 1 });
      for (let i = 0; i < 7; i++) MWHist.addFile({ name: 'meowrin_' + (1000 + i) + '.mp4', rel: 'Meowrin/meowrin_' + (1000 + i) + '.mp4', uri: 'file:///d/' + i + '.mp4', size: 1000 + i });
      MWHist.addFile({ name: 'subtitle.srt', rel: 'Meowrin/subtitle.srt', uri: 'u2', size: 3 });
      MWHist.addFile({ name: 'meowrin_studio_2200.mp4', rel: 'Meowrin/meowrin_studio_2200.mp4', uri: 'u3', size: 4 });
      out.files = MWHist.list('file').length; out.tools = [...new Set(MWHist.list('file').map((x) => x.tool))].sort().join('|'); out.mp3 = MWHist.list('file').some((x) => /mp3/.test(x.title));
      await sleep(1500); out.mirror = Object.keys(files).filter((p) => p.startsWith('Meowrin/history/')).sort().join(','); out.pruneDel = dels.filter((p) => p.startsWith('Meowrin/history/')).length;
      out.noAutoDelVideo = !dels.some((p) => /\.mp4$/.test(p));
      const purged = await MWHist.purgeFiles(); out.purged = purged; out.delFiles = dels.filter((p) => /\.(mp4|srt)$/.test(p)).length; out.left = MWHist.list('file').length;
      const first = MWHist.list('plan')[0].id; await MWHist.remove(first); out.removed = MWHist.list('plan').length;
      MWStore.del('mw_hist_v1'); out.restored = await MWHist.restore(); out.afterPlan = MWHist.list('plan').length; out.afterFile = MWHist.list('file').map((x) => x.title).join('|'); out.title = MWHist.list('plan').map((x) => x.title).join('|');
      delete window.Capacitor; return out;
    });
    check('ประวัติงาน: เก็บสูตรแค่ 5 ล่าสุดต่อชนิด · key เดิมแก้ของเดิมแล้วขึ้นบนสุด', h.plan === '107,106,105,104,103' && h.top === 'แก้ซ้ำ', JSON.stringify(h));
    check('ประวัติงาน: ไฟล์เก็บเฉพาะ mp4/srt (ไม่เก็บ mp3) · จัดชนิดตามชื่อไฟล์ (สตูดิโอ/ตัดต่ออัตโนมัติ/ซับ)', h.files === 9 && !h.mp3 && h.tools === 'ซับจอเขียว|ตัดต่ออัตโนมัติ|สตูดิโอ', JSON.stringify(h));
    check('ประวัติงาน: สูตรเขียนสำเนาลงไฟล์ ที่เกิน max ถูกลบไฟล์สำรองด้วย แต่ไฟล์วิดีโอไม่ถูกลบเอง', h.mirror.split(',').length === 5 && h.pruneDel === 3 && h.noAutoDelVideo, JSON.stringify(h));
    check('ประวัติงาน: ล้างไฟล์เก่า = ลบเฉพาะที่เกิน 5 ล่าสุด (4 ไฟล์) · ลบทีละอัน · ล้างข้อมูลแล้วดึงสูตร+ไฟล์กลับจาก Documents', h.purged === 4 && h.delFiles === 4 && h.left === 5 && h.removed === 4 && h.restored === 5 && h.afterPlan === 4 && h.afterFile === 'meowrin_studio_2201.mp4' && /บทที่ 6/.test(h.title), JSON.stringify(h));
    await hp.evaluate(() => { MWHist.setMax(30); MWStore.set('mw_hist_v1', { max: 30, items: [] }); MWHist.add('plan', { key: 1, title: 'ตารางทดสอบ', data: { mode: 'fast', script: 'บทจากประวัติ', at: 1, shots: [] } }); MWHist.add('studio', { key: 'p1', title: 'โปรเจกต์ทดสอบ', data: { v: 1, id: 'p1', name: 'โปรเจกต์ทดสอบ', clips: [], texts: [], ratio: '9:16', bg: 'blur', voice: null } }); MWHist.addFile({ name: 'meowrin_1234.mp4', rel: 'Meowrin/meowrin_1234.mp4', uri: 'file:///x.mp4', size: 3145728 }); });
    await hp.click('nav button[data-tab="settings"]'); await hp.evaluate(() => { document.getElementById('hsFold').open = true; }); await hp.waitForTimeout(300);
    const ui = await hp.evaluate(() => ({ rows: [...document.querySelectorAll('#hsList .hs b')].map((b) => b.textContent).join('|'), tag: document.getElementById('hsTag').textContent, small: [...document.querySelectorAll('#hsList .hs small')].map((s) => s.textContent).join('|'), max: document.getElementById('hsMax').value, over: document.documentElement.scrollWidth > innerWidth + 1 }));
    check('ประวัติงาน: แผง "ผลงานล่าสุด" ในตั้งค่าโชว์ตัดต่อ/สตูดิโอ/ไฟล์ พร้อมชนิด ขนาด ไม่ล้นจอ', ui.rows.includes('ตารางทดสอบ') && ui.rows.includes('โปรเจกต์ทดสอบ') && ui.rows.includes('meowrin_1234.mp4') && ui.tag === '3 รายการ' && /3\.0 MB/.test(ui.small) && ui.max === '30' && !ui.over, JSON.stringify(ui));
    await hp.evaluate(() => { document.querySelector('#hsList .hs[data-id="plan-1"] [data-o]').click(); });
    await hp.waitForURL(/footage\.html\?tab=plan&hist=1/); await hp.waitForFunction(() => window.FT && document.getElementById('plText'), null, { timeout: 20000 }); await hp.waitForTimeout(600);
    const back = await hp.evaluate(() => ({ text: document.getElementById('plText').value, url: location.search, mode: document.getElementById('plModeBtn').textContent }));
    check('ประวัติงาน: เปิดตารางเก่าจากประวัติ → ตัดต่ออัตโนมัติใส่บท/แบบของรอบนั้นกลับมา', back.text === 'บทจากประวัติ' && back.url === '?tab=plan' && /แบบ 2/.test(back.mode), JSON.stringify(back));
    await hp.goto(base + '/index.html'); await hp.waitForFunction(() => window.MWHist, null, { timeout: 20000 });
    await hp.evaluate(() => { MWStore.del('mw_studio_v1'); });
    await hp.click('nav button[data-tab="settings"]'); await hp.evaluate(() => { document.getElementById('hsFold').open = true; document.querySelector('#hsList .hs[data-id="studio-p1"] [data-o]').click(); });
    await hp.waitForURL(/studio\.html/); await hp.waitForFunction(() => window.MWStudioUI, null, { timeout: 20000 });
    check('ประวัติงาน: เปิดโปรเจกต์สตูดิโอเก่าจากประวัติ → สตูดิโอเปิดโปรเจกต์นั้น · ไม่มี error', (await hp.evaluate(() => document.getElementById('stName').textContent)) === 'โปรเจกต์ทดสอบ' && !hErr.length, hErr.join(' | '));
    // ปุ่มประวัติสามขีดในแต่ละเครื่องมือ (history-sheet.js): สตูดิโอ (ว่างก็มี) · ตัดต่ออัตโนมัติ (เฉพาะโหมดตัดต่อ) · ซับจอเขียว
    const rows = (p) => p.evaluate(() => [...document.querySelectorAll('.mwhs .mwhs-r b')].map((b) => b.textContent).join('|'));
    const badge = (p, sel) => p.evaluate((sel) => { const b = document.querySelector(sel + ' .mwhs-n'); return b && !b.hidden ? b.textContent : ''; }, sel);
    await hp.evaluate(() => { MWStore.del('mw_studio_v1'); }); await hp.reload(); await hp.waitForFunction(() => window.MWHistSheet && document.getElementById('stEmpty'), null, { timeout: 20000 }); await hp.waitForTimeout(400);
    const st0 = await hp.evaluate(() => ({ empty: !document.getElementById('stEmpty').hidden, btn: !!document.getElementById('stHist').offsetParent }));
    await hp.click('#stHist'); await hp.waitForTimeout(200);
    const stb = await badge(hp, '#stHist'), strows = await rows(hp);
    check('ประวัติในสตูดิโอ: ไม่มีโปรเจกต์ก็มีปุ่มสามขีด + ป้ายจำนวน · ชีตโชว์โปรเจกต์เก่า (มีรูปย่อ/จำนวนคลิป)', st0.empty && st0.btn && stb === '1' && strows === 'โปรเจกต์ทดสอบ', JSON.stringify([st0, stb, strows]));
    await hp.evaluate(() => document.querySelector('.mwhs [data-o]').click()); await hp.waitForFunction(() => window.MWStudioUI, null, { timeout: 20000 });
    check('ประวัติในสตูดิโอ: แตะ "เปิด" → โปรเจกต์นั้นเปิดขึ้นมา', (await hp.evaluate(() => document.getElementById('stName').textContent)) === 'โปรเจกต์ทดสอบ');
    await hp.goto(base + '/footage.html?tab=plan'); await hp.waitForFunction(() => window.FT && window.MWHistSheet, null, { timeout: 20000 }); await hp.waitForTimeout(400);
    await hp.click('#planHistBtn'); await hp.waitForTimeout(200);
    const pb = await badge(hp, '#planHistBtn'), prows = await rows(hp);
    check('ประวัติในตัดต่ออัตโนมัติ: ปุ่มสามขีดโชว์เฉพาะโหมดตัดต่อ · ชีตมีตารางช็อต + วิดีโอที่ส่งออกของเครื่องมือนี้ (ไม่มีโปรเจกต์สตูดิโอปน)', pb === '2' && /ตารางทดสอบ/.test(prows) && /meowrin_1234\.mp4/.test(prows) && !/โปรเจกต์ทดสอบ/.test(prows), JSON.stringify([pb, prows]));
    await hp.evaluate(() => document.querySelector('.mwhs [data-id="plan-1"] [data-o]').click()); await hp.waitForURL(/hist=1/); await hp.waitForFunction(() => document.getElementById('plText'), null, { timeout: 20000 }); await hp.waitForTimeout(500);
    check('ประวัติในตัดต่ออัตโนมัติ: แตะ "เปิด" ตาราง → ใส่บทกลับมา', (await hp.evaluate(() => document.getElementById('plText').value)) === 'บทจากประวัติ');
    /* ลบรอบนี้จากประวัติ → ตารางช็อตที่ค้างอยู่ (mw_footage_direct_v1) หายไปด้วย · ตารางที่ไม่มีในประวัติ (ของรุ่นก่อนมีประวัติ) ไม่โดนลบ */
    await hp.evaluate(() => { MWStore.set('mw_footage_direct_v1', { mode: 'fast', at: 555, script: 'บทซ้ำ', shots: [] }); MWHist.add('plan', { key: 555, title: 'บทซ้ำ', data: { mode: 'fast', at: 555, script: 'บทซ้ำ', shots: [] } }); });
    await hp.goto(base + '/footage.html?tab=plan'); await hp.waitForFunction(() => window.FT && window.MWHist && document.getElementById('plText'), null, { timeout: 20000 }); await hp.waitForTimeout(800);
    await hp.evaluate(() => MWHist.remove('plan-555')); await hp.waitForTimeout(300);
    check('ลบประวัติของรอบนี้ → ตารางช็อตที่ค้างหายไปด้วย (บทเดิมกำกับใหม่ได้)', (await hp.evaluate(() => MWStore.get('mw_footage_direct_v1', null))) === null);
    await hp.evaluate(() => { MWStore.set('mw_footage_direct_v1', { mode: 'fast', at: 777, script: 'เก่า', shots: [] }); });
    await hp.goto(base + '/footage.html?tab=plan'); await hp.waitForFunction(() => window.FT && window.MWHist && document.getElementById('plText'), null, { timeout: 20000 }); await hp.waitForTimeout(800);
    await hp.evaluate(() => MWHist.remove('plan-1')); await hp.waitForTimeout(300);
    check('ตารางที่ไม่เคยอยู่ในประวัติ ไม่ถูกลบเมื่อลบประวัติอันอื่น', !!(await hp.evaluate(() => MWStore.get('mw_footage_direct_v1', null))));
    await hp.goto(base + '/footage.html'); await hp.waitForFunction(() => window.FT, null, { timeout: 20000 });
    check('ประวัติ: หน้าอัลบั้ม (ไม่ใช่โหมดตัดต่อ) ไม่มีปุ่มสามขีดของตัดต่ออัตโนมัติ', !(await hp.evaluate(() => !!document.getElementById('planHistBtn').offsetParent)));
    await hp.goto(base + '/sub/index.html'); await hp.waitForFunction(() => window.MWHistSheet && window.MWHist, null, { timeout: 20000 });
    await hp.evaluate(() => { MWHist.addFile({ name: 'green_screen_subtitle.mp4', rel: 'Meowrin/green_screen_subtitle.mp4', uri: 'file:///g.mp4', size: 2097152 }); MWHist.addFile({ name: 'subtitle.srt', rel: 'Meowrin/subtitle.srt', uri: 'file:///s.srt', size: 900 }); }); await hp.waitForTimeout(300);
    await hp.click('#subHist'); await hp.waitForTimeout(200);
    const sb = await badge(hp, '#subHist'), srows = await rows(hp), sov = await hp.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    check('ประวัติในซับจอเขียว: ปุ่มสามขีด + ชีตโชว์ไฟล์ซับ (mp4/srt) เท่านั้น · หน้าไม่ล้นจอ', sb === '2' && /green_screen_subtitle\.mp4/.test(srows) && /subtitle\.srt/.test(srows) && !/ตารางทดสอบ|meowrin_1234/.test(srows) && !sov, JSON.stringify([sb, srows, sov]));
    await hp.evaluate(() => { const d = document.querySelector('.mwhs [data-d]'); d.click(); d.click(); }); await hp.waitForTimeout(150);
    check('ประวัติ: ลบด้วยการแตะสองครั้ง (แตะครั้งเดียวไม่ลบ)', (await rows(hp)).split('|').length === 1);
    // เล่นวิดีโอจากประวัติ = เต็มจอ (ปุ่มปิด + ย้อนของมือถือปิดก่อน) ไม่ยัดในแถว
    await hp.evaluate(() => { window.Capacitor = { convertFileSrc: (u) => 'about:blank#' + u }; }); await hp.waitForTimeout(100);
    await hp.evaluate(() => document.querySelector('.mwhs [data-o]').click()); await hp.waitForTimeout(200);
    const pl = await hp.evaluate(() => { const p = document.querySelector('.mwhp'); return { has: !!p, src: p && p.querySelector('video').getAttribute('src'), inRow: !!document.querySelector('.mwhs-r video'), full: p && getComputedStyle(p).position === 'fixed' }; });
    const hooked = await hp.evaluate(async () => { const r = await window.MWBackHook(); return { r, gone: !document.querySelector('.mwhp') }; });
    check('ประวัติ: กดเปิดวิดีโอ = เต็มจอ (ไม่ยัดในแถว) · ปุ่มย้อนของมือถือปิดตัวเล่นก่อน', pl.has && /subtitle|green_screen|file:/.test(pl.src || '') && !pl.inRow && pl.full && hooked.r === true && hooked.gone, JSON.stringify([pl, hooked]));
    await hp.evaluate(() => { delete window.Capacitor; });
    // ปุ่มลูกศรมุมซ้ายบน = ย้อน 1 ขั้นเหมือนปุ่มย้อนของมือถือ (ไม่ใช่ไปหน้าแรกของแอพ) · ให้หน้านั้นปิดชั้นของตัวเองก่อน · เปิดหน้านี้ตรงๆ = ไปหน้าสำรอง
    await hp.goto(base + '/footage.html?tab=plan'); await hp.waitForFunction(() => window.FT && window.MWNative, null, { timeout: 20000 });
    await hp.evaluate(() => { location.href = 'studio.html'; }); await hp.waitForURL(/studio\.html/); await hp.waitForFunction(() => window.MWNative && window.MWHistSheet, null, { timeout: 20000 });
    await hp.click('#stHist'); await hp.waitForTimeout(200);
    await hp.evaluate(() => document.querySelector('a.back').click()); await hp.waitForTimeout(300);
    const b1 = await hp.evaluate(() => ({ url: location.pathname, sheet: !document.querySelector('.mwhs').hidden }));
    await hp.evaluate(() => document.querySelector('a.back').click()); await hp.waitForURL(/footage\.html/, { timeout: 8000 });
    const b2 = hp.url();
    const direct = await context.newPage(); await direct.goto(base + '/studio.html'); await direct.waitForFunction(() => window.MWNative, null, { timeout: 20000 }); await direct.evaluate(() => { Object.defineProperty(history, 'length', { get: () => 1 }); document.querySelector('a.back').click(); }); /* หน้าแรกของแอพจริงมี history.length = 1 (เบราว์เซอร์ทดสอบนับ about:blank ด้วย เลยจำลอง) */ await direct.waitForURL(/index\.html/, { timeout: 8000 });
    check('ปุ่มลูกศรย้อนกลับ: ปิดชีตก่อน แล้วย้อน 1 ขั้นไปหน้าที่มา (ตัดต่ออัตโนมัติ ไม่ใช่หน้าแรก) · เปิดตรงๆ ไม่มีประวัติ = ไปหน้าสำรอง', b1.url === '/studio.html' && !b1.sheet && /footage\.html\?tab=plan/.test(b2) && /#settings$/.test(direct.url()), JSON.stringify([b1, b2, direct.url()]));
    await direct.close();
    // ปุ่ม "สตูดิโอ" ในแถวตารางตัดต่อของประวัติ: ส่งเข้าสตูดิโอตรงๆ (รอดัชนีโหลด → แปลงตาราง → ไปสตูดิโอ) · เปิดตารางจากประวัติแล้วเลื่อนไปที่ผลลัพธ์
    await hp.goto(base + '/footage.html?tab=plan'); await hp.waitForFunction(() => window.FT && FT.store && window.MWHist, null, { timeout: 20000 });
    await hp.evaluate(async () => {
      await FT.store.put({ id: 'c-st|10|1', name: 'a.mp4', size: 10, lastModified: 1, album: 'x', duration: 8, w: 1, h: 1, status: 'done', imgV: 2, aiV: 2, cover: '', scenes: [{ s: 0, e: 5, thumb: '', img: '', ai: {} }] });
      const plan = { mode: 'long', voice: null, at: 777, script: 'บทสตูดิโอ', shots: [{ t: 'ช็อตหนึ่ง', want: '', chars: [], keys: [], shot: '', dur: 2, at: 0, why: '', use: true, cands: [{ id: 'c-st|10|1', si: 0 }] }] };
      MWStore.set('mw_footage_direct_v1', plan); MWHist.add('plan', { key: 777, title: 'บทสตูดิโอ', data: plan });
    });
    await hp.reload(); await hp.waitForFunction(() => window.FT && window.MWHistSheet, null, { timeout: 20000 }); await hp.waitForTimeout(400);
    await hp.click('#planHistBtn'); await hp.waitForTimeout(200);
    const hasBtn = await hp.evaluate(() => !!document.querySelector('.mwhs [data-id="plan-777"] [data-s]'));
    await hp.evaluate(() => document.querySelector('.mwhs [data-id="plan-777"] [data-s]').click()); await hp.waitForURL(/studio\.html/, { timeout: 15000 }); await hp.waitForFunction(() => window.MWStudioUI, null, { timeout: 20000 });
    const proj2 = await hp.evaluate(() => { const p = MWStore.get('mw_studio_v1').cur; return { n: p.clips.length, name: p.clips[0].name, t: p.texts[0] && p.texts[0].t, title: document.getElementById('stName').textContent }; });
    check('ประวัติตัดต่ออัตโนมัติ: แถวตารางมีปุ่ม "สตูดิโอ" → กดแล้วส่งเข้าสตูดิโอเลย (ได้โปรเจกต์จากตารางนั้น)', hasBtn && proj2.n === 1 && proj2.name === 'a.mp4' && proj2.t === 'ช็อตหนึ่ง' && /บทสตูดิโอ/.test(proj2.title), JSON.stringify([hasBtn, proj2]));
    await hp.evaluate(() => { MWStore.del('mw_footage_direct_v1'); });
    await hp.evaluate(() => { MWStore.del('mw_hist_v1'); MWStore.del('mw_studio_v1'); MWStore.del('mw_footage_direct_v1'); });
    await hp.close();
  }
  // ทำดัชนีหลายคลิปพร้อมกัน (footage.js worker + exclusive): อ่านเฟรมทีละคลิป (ใช้ <video> ตัวเดียว) แต่ระหว่างรอ AI ของคลิปหนึ่ง อ่านเฟรมคลิปถัดไปไปก่อน · ไม่หยิบคลิปซ้ำ · clipPar=1 = ทีละคลิปเหมือนเดิม
  {
    const fp = await context.newPage(); const fErr = []; fp.on('pageerror', (e) => fErr.push(e.message));
    await fp.goto(base + '/footage.html'); await fp.waitForFunction(() => window.FT && FT.ui && document.getElementById('filesDocs'), null, { timeout: 20000 });
    const runCase = async (clipPar, tag) => {
      await fp.evaluate(async (clipPar) => {
        MWStore.set('mw_openrouter_key_v1', 'test-key'); FT.cfg.clipPar = clipPar; FT.cfg.budget = 50; if (!window.__libHook) { window.__libHook = 1; window.__libEv = 0; document.addEventListener('ft:lib', () => { window.__libEv++; }); } window.__libEv = 0; window.__ev = []; window.__act = 0; window.__maxAct = 0; window.__scanning = 0; window.__maxScan = 0; window.__seen = {};
        const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
        FT.scan = async (v, f, onStep) => { __act++; __maxAct = Math.max(__maxAct, __act); __scanning++; __maxScan = Math.max(__maxScan, __scanning); __seen[f.name] = (__seen[f.name] || 0) + 1; __ev.push('scan+' + f.name); await sleep(150); onStep && onStep(1); __scanning--; __ev.push('scan-' + f.name);
          return { duration: 5, w: 10, h: 10, cover: '', scenes: [{ s: 0, e: 2, thumb: '', img: '' }, { s: 2, e: 5, thumb: '', img: '' }] }; };
        FT.describe = async (ch) => { __ev.push('ai+'); await sleep(400); __ev.push('ai-'); return { cost: 0.01, tin: 1, tout: 1, text: 'x', json: { clip_summary_th: 'ทดสอบ', scenes: ch.map((x) => ({ i: x.n, characters: ['Luffy'] })) } }; };
        const act = FT.scan; FT.scan = async function(){ try{ return await act.apply(this, arguments); } finally { __act--; } };
      }, clipPar);
      const files = [1, 2, 3, 4, 5].map((i) => ({ name: tag + i + '.mp4', mimeType: 'video/mp4', buffer: Buffer.from('v' + tag + i) }));
      await fp.setInputFiles('#filesDocs', files); await fp.waitForTimeout(200);
      const t0 = Date.now(); await fp.evaluate(() => document.getElementById('startBtn').click()); await fp.waitForFunction(() => /เสร็จ 5\/5/.test(document.getElementById('progTxt').textContent), null, { timeout: 20000 }); const ms = Date.now() - t0;
      await fp.waitForTimeout(900);
      return fp.evaluate((ms) => ({ libEv: __libEv, libHas: FT.ui.lib().filter((c) => /^\w\d\.mp4$/.test(c.name)).length, ms, maxAct: __maxAct, maxScan: __maxScan, seen: Object.values(__seen).join(''), ev: __ev.join(' ') }), ms);
    };
    const par2 = await runCase(2, 'p'), ser = await runCase(1, 's');
    check('ทำดัชนี 2 คลิปพร้อมกัน: ครบ 5 คลิป ไม่หยิบซ้ำ อ่านเฟรมทีละคลิป (ไม่ทับกัน) แต่ซ้อนกับรอ AI · เร็วกว่าทีละคลิปชัดเจน', par2.seen === '11111' && par2.maxScan === 1 && par2.maxAct <= 2 && par2.ms < ser.ms * 0.8 && /scan\+p2.*ai\+.*scan-p2|ai\+ scan\+/.test(par2.ev), JSON.stringify([par2, ser]));
    check('ทำดัชนีเสร็จ → แจ้งหน้าอัลบั้ม (ft:lib) อย่างน้อย 1 ครั้ง แต่รวมครั้ง ไม่ยิงทุกคลิป (≤3 สำหรับ 5 คลิป) · คลิปเข้า lib ครบ (บั๊กเดิม: อัลบั้มค้าง ทำแล้ว 1036/1037)', par2.libEv >= 1 && par2.libEv <= 3 && par2.libHas >= 5, JSON.stringify([par2.libEv, par2.libHas]));
    check('ทำดัชนีตั้ง 1 คลิป = ทีละคลิปเหมือนเดิม (ไม่ซ้อนกัน)', ser.seen === '11111' && ser.maxAct === 1 && !/scan\+s\d scan\+s\d/.test(ser.ev.replace(/ai[+-] /g, '')), ser.ev);
    check('ทำดัชนีหลายคลิปพร้อมกัน: ไม่มี error · ช่องตั้งค่า "ทำพร้อมกันกี่คลิป" มีและบันทึกค่า', !fErr.length && (await fp.evaluate(() => { const i = document.getElementById('clipPar'); i.value = '3'; i.dispatchEvent(new Event('change')); return FT.cfg.clipPar === 3; })), fErr.join(' | '));
    await fp.evaluate(() => { MWStore.del('mw_openrouter_key_v1'); });
    await fp.close();
  }
} finally { await browser.close(); server.close(); }
const bad = results.filter((x) => !x.ok);
console.log(`\n${bad.length ? 'มี ' + bad.length + ' ข้อไม่ผ่าน' : 'ผ่านทั้งหมด'} (${results.length} ข้อ)`);
process.exit(bad.length ? 1 : 0);
