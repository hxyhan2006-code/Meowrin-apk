# Meowrin-apk

แอพส่วนตัวของ Han (ช่อง YouTube Shorts วันพีซไทย "meowrin") ใช้บนมือถือ Android 100% · repo นี้ = "เวอร์ชันแอป Android" ก๊อปจากเว็บแอป Meowrin-factory- (2026-10-17) · **ไม่แก้ repo เว็บแอปจากที่นี่** · ยึดโค้ดจริงเป็นหลักถ้าเอกสารไม่ตรง
- ประวัติรุ่น/บั๊กเก่า/รายละเอียดทุกฟีเจอร์: `docs/CLAUDE-history.md` (CLAUDE.md เดิม **ไม่โหลดอัตโนมัติ** บางส่วนตกรุ่น) · แก้ฟีเจอร์ไหน ให้ grep ชื่อไฟล์/ฟังก์ชันในนั้นดูบริบทก่อน

## ทิศทาง (2026-10-18): แอพคัดแยกฟุต ไม่ใช่ตัดต่ออัตโนมัติ
- ฟุตวันพีซ ~1,000 คลิปใน `Pictures/Gallery/owner/`: **ถาม AI** ว่าฉากนี้อยู่คลิปไหน (`footage-ask.js`) · **AI จัดอัลบั้ม**ตามภาค (`footage-organize.js`) · ตัดต่อเองใน CapCut · ทำในแอพเดิม ห้ามสร้างแอพใหม่
- ข้อมูล: ดัชนีภาพ (AI ดูเฟรม) + ดัชนีความหมาย + ฟังเสียงคลิป (`footage-speech.js` → `c.speech`: บทพูด/ใครพูด/คำบรรยายฉาก/ภาค) ใช้ร่วมกันทั้งค้น/ถาม AI/จัดอัลบั้ม · Han แก้เองได้ (`fixed` = AI ไม่ทับ)
- โค้ดตัดต่ออัตโนมัติ (`footage-plan/stitch`, `exporter.js`) และสตูดิโอ (`studio*`) ยังอยู่แต่การ์ดซ่อนไว้ (`.tool.exp` + `#expToggle`) · อย่าเอาของที่เคยรื้อทิ้ง (R2, ล็อกอิน Google Drive, กำแพงชิปตัวละคร) กลับโดยไม่ถาม Han
- **ยังไม่ได้ทดสอบบนมือถือจริง**: ตะกร้าฉาก (ความเร็ว/จุดเริ่มตัดของ H.264), ดัชนีความหมาย (OpenRouter embeddings), `MediaScan.move` + สิทธิ์ MANAGE_EXTERNAL_STORAGE, ตัวเล่นกรอ (`MWLocal.seekable`), คุณภาพถาม AI, ความแม่นคนพูด/ภาคจากเสียง, สำเนา `library/`+`.nomedia`, edge-to-edge, สตูดิโอ · ทดสอบกับ API จริงในเครื่อง cloud ไม่ได้ ให้บอกตรงๆ ว่าส่วนไหนยังไม่ได้ทดสอบจริง

## สถาปัตยกรรม: bundled + OTA (`ota.js`)
- APK ห่อโค้ดเว็บ (Capacitor, หน้าอยู่ที่ `https://localhost`) แล้วอัปเดตตัวเองจาก GitHub Pages `https://hxyhan2006-code.github.io/Meowrin-apk/` (repo Public)
- OTA: เช็ก `files.json` (ไฟล์+sha1+id จาก `tools/make-manifest.mjs`) → ดาวน์โหลดลง `DATA/ota/<id>` ตรวจ sha1 → `WebView.setServerBasePath` → บูตผ่านค่อย `persistServerBasePath` + ลบชุดเก่า · เช็กตอนเปิดแอพ (แถบ `#otaBar`) + ปุ่ม "ตรวจอัปเดตแอพ" · `intact()` ตรวจไฟล์ครบก่อน `ready`/`apply()`, `cleanOld` ห้ามลบชุด current/wanted/ready (ไม่งั้นหน้าเปล่าวนลูป)
- **แก้ไฟล์เว็บใดๆ แล้วต้อง `node bump-version.mjs X.Y` (เลข > เดิม) + `--check` ก่อน push** (บวก `version.js`/`?v=`/`files.json` ให้) ไม่งั้น OTA ไม่เห็นไฟล์ใหม่ · `.md .mjs .py .keystore` และ `tests/ tools/ .github/ docs/` ไม่อยู่ใน manifest (แก้เอกสารไม่ต้อง bump)
- **ต้องสร้าง APK ใหม่เฉพาะเมื่อเปลี่ยนปลั๊กอิน/สิทธิ์/config เนทีฟ** (ติดตั้ง APK ใหม่ = versionCode เปลี่ยน = ทิ้งชุด OTA กลับไปใช้ไฟล์ที่ห่อมา = ทางรีเซ็ตถ้า OTA พัง) · แก้ OTA เองมีผลหลังอัปเดตผ่านไปอีกรอบหนึ่ง

### สร้าง APK (`.github/workflows/apk.yml` ชื่อ `build-apk`)
- กดรันเอง: Actions → build-apk → Run workflow → โหลด artifact `meowrin-apk` · `mode`: **`bundled` (ค่าเริ่ม)** / `live` (โหลดจาก Pages ตลอด อ่านไฟล์ในมือถือไม่ได้ ติด CORS — ไม่ใช้)
- ทำอะไร: Capacitor 7 (`com.han.meowrin`, "Meowrin App") + ปลั๊กอิน filesystem/share/app/keep-awake/media@8.0.1 + `MediaScan` ของเราเอง (Java ฝังใน apk.yml: `scan hasAccess requestAccess move`) + สิทธิ์สตอเรจ/MANAGE_EXTERNAL_STORAGE + ไอคอนจาก `icon-512.png`
- **กุญแจเซ็น = `tools/debug.keystore` ชุดเดียวทุกครั้ง ห้ามเปลี่ยน/ลบ** (ติดตั้งทับได้ ข้อมูลไม่หาย · ท้ายงานตรวจลายเซ็น ไม่ตรง = งานล้ม) · APK จาก repo เว็บแอปเดิมคนละกุญแจ ต้องลบก่อนติดตั้งครั้งแรก

## ข้อจำกัด Android/WebView ที่ยืนยันแล้วบนมือถือจริง
- `<a download>` ไม่เซฟ · `navigator.share` ไม่มี · อ่าน clipboard ไม่ได้ (เขียนได้) · ล็อกอิน Google (GIS popup) ไม่ทำงาน · Media `getMedias` ใช้ไม่ได้
- เล่นไฟล์ในมือถือ: ใช้ `MWLocal.fileUrl` (`https://localhost/_capacitor_file_/<path>`) ไม่ใช่ `convertFileSrc`
- ลิงก์ไปโฟลเดอร์ต้องเป็น `sub/index.html` / `../index.html` (Capacitor ตอบ index ของแอพหลักให้ URL ที่ไม่มีนามสกุล → หน้าแรกซ้อนไร้สไตล์)
- Filesystem เขียน `Documents/` แต่ไม่สั่ง MediaStore สแกน (แกลเลอรี/CapCut ไม่เห็น; Media `saveVideo` สแกนแบบเก่าไม่ทำงานบน Android 10+) → ใช้ `MediaScan.scan` ผ่าน `MWNative` · APK เก่าไม่มี = ต้องบอกตรงๆ ไม่หลอกว่าอยู่ในแกลเลอรี
- ย้ายไฟล์ของแอพอื่นต้องมีสิทธิ์ "เข้าถึงไฟล์ทั้งหมด" → ไฟล์หนึ่งอยู่ได้โฟลเดอร์เดียว อัลบั้มจริงจัดตามภาคอย่างเดียว ตัวละคร/อารมณ์ใช้ค้นหา/ถาม AI
- CapCut แชร์วิดีโอที่ต่อจาก Brave ไม่ได้ (เปิดไฟล์ที่เซฟลงเครื่องได้) · สมมติฐานที่ยังไม่ยืนยัน: ตัวช่วยไฟล์ตอบ Range ไม่ครบ (กรอแล้วเด้ง 0:00) แก้ด้วย Blob ≤700 MB

## ข้อห้ามโค้ด
- **ข้อมูลผ่าน `MWStore` เท่านั้น** (`store.js` IndexedDB `mw_store_v1`; `get/set/del/keys/raw/on`) ห้ามเรียก localStorage ตรงๆ · ดัชนีคลิปอยู่ IndexedDB `mw_footage_v1` (`FT.store`) · เวกเตอร์ความหมายอยู่ IndexedDB แยก `mw_embed_v1` (`FT.sem`)
- **ห้ามเปลี่ยนชื่อ key `mw_*` โดยไม่ทำ migration** (ข้อมูล Han หาย): `mw_key_v1 mw_data_v1 mw_cache_v1 mw_ai_cfg_v1 mw_openrouter_key_v1 mw_gemini_key_v1 mw_groq_key_v1 mw_eleven_key_v1 mw_history_v1 mw_cost_v1 mw_spend_v1 mw_budget_v1 mw_tts_cfg_v1 mw_footage_cfg_v1 mw_footage_audit_v1 mw_footage_direct_v1 mw_footage_v1 mw_voice_v1 mw_hist_v1 mw_studio_v1 mw_org_v1 mw_speech_v1 mw_arcpick_v1 mw_local_v1 mw_thumbs_v1 mw_gemini_last_v1 mw_sub_cfg_v1 mw_embed_cfg_v1 mw_basket_v1 mw_gdrive_v1` (`mw_gdrive_v1` ชื่อเดิม ตอนนี้เก็บเวลาสำรองล่าสุดของ `backup.js`)
- **เซฟ/แชร์ไฟล์ = `MWNative.save/share`** ห้าม `<a download>`/`navigator.share`
- **กล่องโต้ตอบ = `MWDialog`** ห้าม `window.confirm/alert/prompt` (ลบแตะสองครั้ง = `MW.confirmTap`) · ตัวเลือก = `FT.pick.open` (`footage-pick.js`) ห้ามใช้ `<select>`/`<datalist>` ห้ามทำชีตซ้ำ
- **ไอคอน = `MWIcon("ชื่อ")`** (`icons.js`) ห้ามอีโมจิภาพ และห้าม ★ ☆ ✓ ✗ ▶ ✕ (ใช้ `star check x play pause`) · อย่าใส่ใน `esc()`/`<option>` · ปุ่มไอคอนล้วนใส่ `margin:0` ให้ `.ic` · หน้า `sub/` มี sprite ของตัวเอง
- **ห้ามใส่ API key/ความลับในโค้ดหรือ commit** (repo Public)
- **ห้ามใส่ `<link>`/สคริปต์ภายนอกแบบบล็อกก่อน `store.js`** (ฟอนต์อยู่ใน `fonts/` ผ่าน `fonts.css`; เคยทำหน้าค้างเป็น HTML ดิบ) · html มี `<script>` แค่ `store.js` สคริปต์อื่นอยู่ใน `data-boot` (เรียงลำดับ+`?v=`) ไม่มี inline script
- ลูกศรย้อนใส่ `<a data-back href="หน้าสำรอง">` · ปุ่มย้อนมือถือเรียก `window.MWBackHook()` ก่อน (หน้าที่มีชีต/ชั้นซ้อนต้องรองรับ)
- ห้ามตั้ง class `.chk` (ชน footage.css) · ห้ามใส่ class `alai` ให้ `#orgBox` · คำอธิบายถาวรใช้ `class="hint tip"` · ข้อความหน้าจอเป็นภาษาไทยพูด · ต้องใช้ได้ที่จอ ~380px
- `ai.js` `reflow`: ห้ามตัดบรรทัดบทตามความกว้างจอ (ทุกขึ้นบรรทัดถูกส่ง ElevenLabs เป็นจังหวะหยุด)
- เรียก OpenRouter ผ่าน `MWBudget.check/add` เสมอ · ใช้ของเดิมที่มี (`U.card`, `FT.pick`, `MWLocal`, `MWHist.add`) อย่าเขียนซ้ำ

## แผนที่ไฟล์
- **หน้า:** `index.html` แอพหลัก (คลิป|บท|เสียง|ตั้งค่า) · `footage.html` กล่องอัลบั้ม (`?tab=plan`/`?voice=` = โหมดตัดต่ออัตโนมัติ `body.mode-plan`) · `studio.html` · `check.html` (ตรวจปลั๊กอิน/สิทธิ์บนมือถือจริง) · `sub/index.html` ซับจอเขียว
- **แกน:** `store.js` (+ตัวเฝ้าหน้าค้าง `#mwWatch`) · `version.js` (เลขรุ่น แก้ด้วย bump เท่านั้น) · `ota.js` · `native.js` `MWNative` · `dialog.js` · `icons.js` · `budget.js` `MWBudget` (เพดานค่า AI) · `backup.js` สำรองเป็นไฟล์ผ่าน `MWNative.share` (`#gdQuick` `#gdFootQuick` `#stTag`)
- **แอพหลัก:** `app.js` (ส่ง `window.MW`) · `sync.js` YouTube API · `llm.js` `MW.llm.call` · `ai.js` ทำบท/prompt · `tts.js` ElevenLabs · `voicestore.js` `MWVoice` เทคเสียง (+ไฟล์ `Documents/Meowrin/voice`) · `history.js`/`history-sheet.js`/`history-ui.js` `MWHist` ประวัติงาน (`data-hist=plan|studio|sub`)
- **ฟุตเทจ (`window.FT`/`FT.ui`):** `footage-core.js` ตั้งค่า/DB/อ่านเฟรม/เรียก AI (`describe transcribe askExpand askPick classifyArcs beats direct`) · `footage.js` คิวทำดัชนี/ตั้งค่า (event `ft:lib`) · `local.js` `MWLocal` วิดีโอในมือถือ · `library.js` `MWLib` สำเนาเข้า `Documents/Meowrin/library/` · `footage-find.js` ค้นหา/ตัวกรอง/การ์ดฉาก/`arcOf`/`speechOf` · `footage-album.js` อัลบั้ม 3 แบบ+ตัวเล่น · `footage-ask.js` · `footage-organize.js` · `footage-speech.js` · `footage-embed.js` `FT.sem` ดัชนีความหมาย (OpenRouter embeddings, ผสมกับค้นด้วยคำใน ถาม AI) · `footage-basket.js` `FT.basket` ตะกร้าฉาก→ตัดเป็นไฟล์สั้นลง `Documents/Meowrin/picks` (mediabunny `Conversion` trim + `MWNative.save`) · `footage-pick.js` · `footage-dup.js` ฟุตซ้ำ · `footage-audit.js` ความแม่น AI · `footage-plan.js` ผู้กำกับ · `footage-stitch.js` · `exporter.js` ส่งออกเร็ว (mediabunny, `import()` จาก stitch/studio) · `mp4fix.js`
- **สตูดิโอ:** `studio-model.js` `MWStudio` · `studio-player.js` · `studio.js` · `studio.css` · **ตรวจระบบ:** `check.js` `check.css`
- **ซับ `sub/` (ES module):** `app.js` · `ai.js` (Groq Whisper+Gemini) · `aligner.js` · `render.js` · `media.js` · `srt.js` · `waveform.js` · `ui.js` · `voicepick.js` · `vendor/mediabunny.min.js`+ไฟล์ลิขสิทธิ์ **ห้ามลบ** · เทสต์ `cd sub && node aligner.energy.test.mjs && node ai.test.mjs`
- **สไตล์:** `style.css` (`--accent:#39d98a` เขียว; เตือนใช้ `--warn` ส้ม ห้ามเอา accent แทนความหมายเตือน) · `sheet.css` · `footage.css` · `fonts*.css` · ไอคอนแอพ `icon.svg`→`icon-192/512.png` (`node tools/render-icons.mjs`) แก้เมื่อ Han สั่งเท่านั้น ห้ามขยายตัว M
- **เครื่องมือ:** `bump-version.mjs` · `tools/make-manifest.mjs` · `tests/smoke.mjs`
- เกิน ~600 บรรทัด: `sub/waveform.js` (614) `sub/app.js` (600) · footage-*.js มีบรรทัดยาวมาก ใช้ `grep -n`/`sed -n`

## กฎการแก้โค้ด (ต้องทำตามทุกข้อ)
1. ก่อนแก้ ค้นหาในไฟล์ก่อนว่ามีฟังก์ชัน/สคริปต์ที่เกี่ยวข้องอยู่แล้วหรือไม่ (grep id, class, function) ถ้ามีให้แก้ที่ของเดิม ห้ามเขียนใหม่ซ้อนทับ
2. ห้ามแก้ปัญหาด้วยการเพิ่ม `<script>` หรือโค้ด patch ต่อท้าย (setInterval, MutationObserver, addEventListener ซ้ำ ที่คอยบังคับ state/class/style ทับของเดิม) ให้แก้ที่ต้นตอ
3. ถ้าการแก้ทำให้ patch/workaround เดิมไม่จำเป็น ให้ลบของเก่าออกด้วย
4. ถ้าบั๊กเดิมเคยแก้มาแล้ว 2 ครั้งขึ้นไปแต่ยังไม่หาย ให้หยุดแล้วบอกว่า "โค้ดจุดนี้อาจต้อง refactor"
5. หลังแก้ สรุปสั้นๆ เป็นภาษาไทย: แก้ตรงไหน (ฟังก์ชัน/บรรทัดคร่าวๆ), ลบ/รวม patch ไหนไป, และเตือนถ้าไฟล์ไหนเกิน ~600 บรรทัด ควรแยกได้แล้ว
6. ตอบผู้ใช้เป็นภาษาไทยเสมอ (ทั้งคำอธิบาย คำถาม และสรุปงาน) ยกเว้นโค้ดและชื่อเทคนิค

## ก่อนส่งงาน
- เช็ก syntax ทุกไฟล์ JS ที่แก้: `node -e "new Function(require('fs').readFileSync('ai.js','utf8'))"` (ไฟล์ใน `sub/` ใช้ `node --check`) · เช็กว่าทุก `$("id")` ใน JS มี element id นั้นจริงใน html
- **รัน `node tests/smoke.mjs` ก่อน push ทุกครั้ง** (Playwright เปิดทุกหน้าที่ 380px: เลขรุ่นตรง, ไอคอนครบ, ไม่มี confirm/alert/prompt, ไม่มี error/ไฟล์หาย/หน้าล้นจอ/อีโมจิ ★✓▶ ค้าง, ฟีเจอร์ฟุตเทจ) ต้องผ่านทั้งหมด (ล่าสุด 180 ข้อ; ข้อ "ส่งออกวิดีโอเร็ว" เคยล้มเป็นช่วงๆ มาก่อน ถ้าล้มข้อเดียวให้รันซ้ำ) · เพิ่มฟีเจอร์ที่เสี่ยงพัง = เพิ่มข้อเช็กใน smoke
- **เลขรุ่นมีเลขเดียวทั้งระบบ** แสดงที่เดียวท้ายตั้งค่า (`#appVersion`) · แก้ css/js/html แล้ว `node bump-version.mjs X.Y` + `--check` ก่อน push · ไฟล์ใหม่ที่ใช้ `?v=` นอก html ที่ตรวจอยู่ ใส่ชื่อใน `FILES` ของ `bump-version.mjs`
- ห้ามใส่ API key จริงลงในโค้ดหรือ commit

## การส่งงาน (Git)
- แก้เสร็จทุกครั้ง ให้ commit แล้ว push เข้า `main` ตรงๆ เลย ไม่ต้องสร้าง branch หรือ PR เพราะ Han ต้องเช็กบนเว็บจริง (GitHub Pages)
- ถ้า Han บอกว่า "ย้อน" ให้ `git revert` commit ล่าสุดแล้ว push เข้า `main` (ห้าม force push / reset)
