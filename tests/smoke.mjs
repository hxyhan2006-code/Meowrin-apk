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
  // เสียงที่อยู่แค่ในคลัง: ปุ่ม "ดึงมาเครื่องนี้" ต้องเห็นและกดได้ทันที (เดิมซ่อนอยู่ตามกฎการ์ดที่ยังไม่กาง แตะไม่ได้เลย)
  await main.page.evaluate(() => { MWVoice.cloudOn = () => true; MWVoice.cloudList = async () => [{ id: 1699999999999, size: 400000 }]; });
  await main.page.click('#vSavedBtn'); await main.page.waitForTimeout(1200);
  check('เสียงที่เก็บไว้: เสียงที่อยู่แค่ในคลังมีปุ่ม "ดึงมาเครื่องนี้" ที่มองเห็น', await main.page.isVisible('#vSavedCloud [data-vpull]'));
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
  const sub = await open('/sub/?voice=1700000000001', 'หน้าซับ');
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
  await foot.page.click('nav button[data-p="set"]'); await foot.page.waitForTimeout(300);
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
  check('footage.html?tab=plan: เปิดแท็บผู้กำกับตรง', await hm.evaluate(() => document.getElementById('p-plan').classList.contains('on') && document.querySelector('.tabs button[data-p="plan"]').classList.contains('on')));
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
  await al.close();
  // อัปเดตแอพเอง (ota.js): เช็ก files.json → ดาวน์โหลดลงโฟลเดอร์ + ตรวจ sha1 → สลับ · ไฟล์ถูกแก้ = ยกเลิกทั้งชุดไม่สลับ · บูตสำเร็จ = จำชุดใหม่ + ลบชุดเก่า
  const { createHash } = await import('node:crypto'); const sha = (b) => createHash('sha1').update(b).digest('hex');
  const REM = 'https://hxyhan2006-code.github.io/Meowrin-apk/', NEWID = 'newid1234567890abcdef';
  const subset = ['version.js', 'icons.js', 'sub/vendor/mediabunny.LICENSE'].map((p) => { const b = readFileSync(join(ROOT, p)); return { p, h: sha(b), s: b.length }; });
  const otaCtx = await browser.newContext({ viewport: { width: 380, height: 820 }, serviceWorkers: 'block' }); // sw.js จะดึงคำขอข้ามโดเมนไปเอง ทำให้ page.route ดักไม่ได้
  async function otaPage(tamper, opt = {}) {
    const pg = await otaCtx.newPage();
    await pg.route(new RegExp('^' + REM.replace(/[.\/]/g, '\\$&')), (route) => {
      const p = decodeURIComponent(new URL(route.request().url()).pathname.replace('/Meowrin-apk/', '')), cors = { 'access-control-allow-origin': '*' };
      if (p === 'files.json') return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ id: NEWID, version: '9.9', files: subset }) });
      let body = readFileSync(join(ROOT, p)); if (tamper && p === 'icons.js') body = Buffer.concat([body, Buffer.from('x')]);
      return route.fulfill({ status: 200, body, headers: cors });
    });
    await pg.addInitScript(({ id, bp, state, exists }) => { if (state) localStorage.setItem('ota_state_v1', JSON.stringify(state)); window.__o = { w: [], sb: [], persisted: 0, rm: [] }; window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: () => true, Plugins: {
      WebView: { setServerBasePath: async (o) => { window.__o.sb.push(o.path); }, getServerBasePath: async () => ({ path: bp || '/data/user/0/app/files/ota/' + id + '/' }), persistServerBasePath: async () => { window.__o.persisted++; } },
      Filesystem: { writeFile: async (o) => { window.__o.w.push([o.path, o.data.length]); }, stat: async (o) => { if (!(exists || []).includes(o.path)) throw new Error('nope'); return {}; }, rmdir: async (o) => { window.__o.rm.push(o.path); }, getUri: async (o) => ({ uri: 'file:///data/user/0/app/files/' + o.path }), readdir: async () => ({ files: [{ name: 'oldid' }, { name: id }] }) } } }; }, { id: NEWID, bp: opt.bp, state: opt.state, exists: opt.exists });
    await pg.goto(base + '/index.html'); await pg.waitForFunction(() => window.MWOta && window.MW, null, { timeout: 20000 });
    return pg;
  }
  const o1p = await otaPage(false);
  const o1 = await o1p.evaluate(async () => { const c = await MWOta.check(); const d = await MWOta.download(); await MWOta.apply(); return { update: c.update, w: window.__o.w, sb: window.__o.sb }; });
  check('อัปเดตแอพ (ota.js): เจอเวอร์ชันใหม่ → ดาวน์โหลดครบ (ไฟล์+files.json) ตรวจ sha1 → สลับชุดไฟล์ (โฟลเดอร์ชื่อไม่ซ้ำ)', o1.update && o1.w.length === 4 && o1.w.every(([p]) => /^ota\/newid1234567-[a-z0-9]+\//.test(p)) && o1.w.some(([p]) => /\/files\.json$/.test(p)) && o1.sb.length === 1 && /^\/data\/user\/0\/app\/files\/ota\/newid1234567-[a-z0-9]+$/.test(o1.sb[0]), JSON.stringify(o1));
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
  await o5p.close(); await otaCtx.close();
} finally { await browser.close(); server.close(); }
const bad = results.filter((x) => !x.ok);
console.log(`\n${bad.length ? 'มี ' + bad.length + ' ข้อไม่ผ่าน' : 'ผ่านทั้งหมด'} (${results.length} ข้อ)`);
process.exit(bad.length ? 1 : 0);
