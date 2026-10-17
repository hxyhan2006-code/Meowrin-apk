/* backup.js — สำรองเป็นไฟล์ (หน้าแอพหลัก + หน้าฟุตเทจ) · โหลดหลัง store.js
   แอพ APK: สร้างไฟล์ JSON แล้วเปิดหน้าต่างแชร์ให้ Han เลือกที่เก็บเอง (เช่น Drive) · v8.22 ตัดโค้ด Google Drive ออกทั้งหมด (ล็อกอิน Google ในแอพใช้ไม่ได้)
   - ปุ่มสำรองด่วน #gdQuick (ข้อมูลแอพ) / #gdFootQuick (ดัชนีฟุตเทจ) · ป้าย #stTag หัวข้อ สำรองข้อมูล บอกสาเหตุ (ยังไม่เคยสำรอง/สำรองนานแล้ว/เรื่องพื้นที่)
   ตั้งค่าอยู่ใน MWStore key mw_gdrive_v1 { last, lastFoot } (ชื่อ key เดิม ห้ามเปลี่ยน: ข้อมูลเวลาสำรองล่าสุดของ Han อยู่ในนี้) */
(function(){
  "use strict";
  var KEY = "mw_gdrive_v1", $ = function(id){ return document.getElementById(id); };
  var cfg = MWStore.get(KEY, {}) || {}, busy = false;
  function saveCfg(){ MWStore.set(KEY, cfg); }

  function ago(t){ if(!t) return "ยังไม่เคย"; var m = Math.round((Date.now() - t) / 60000); return m < 1 ? "เมื่อกี้" : m < 60 ? m + " นาทีที่แล้ว" : m < 1440 ? Math.round(m / 60) + " ชม.ที่แล้ว" : Math.round(m / 1440) + " วันที่แล้ว"; }

  function show(text, kind){ var html = text ? '<div class="msg ' + (kind || "") + '">' + text.replace(/</g, "&lt;") + "</div>" : ""; ["gdQuickMsg", "gdFootQuickMsg"].forEach(function(id){ var el = $(id); if(el) el.innerHTML = html; }); }

  /* ---------- สถานะ (ป้ายสี: เขียว = ปกติ · เหลือง = ควรดู/ต้องกดอะไรสักอย่าง · แดง = มีปัญหา · เทา = ยังไม่ได้ตั้ง) ---------- */
  function pill(kind, text){ return '<span class="pill ' + kind + '">' + text + "</span>"; }
  function row(label, kind, text, extra){ return '<div class="strow"><span>' + label + "</span>" + pill(kind, text) + (extra ? '<small>' + extra + "</small>" : "") + "</div>"; }
  function tag(id, kind, text){ var el = $(id); if(el){ el.className = "state " + kind; el.textContent = text; } }
  var RANK = { idle:1, ok:0, warn:2, err:3 };
  function worst(list){ return list.reduce(function(a, b){ return RANK[b] > RANK[a] ? b : a; }, "ok"); }

  function ageKind(t){ return !t ? "idle" : Date.now() - t > 3 * 864e5 ? "warn" : "ok"; }
  function ageText(t){ return !t ? "ยังไม่เคยสำรอง" : ageKind(t) === "warn" ? ago(t) + " (นานแล้ว)" : ago(t); }
  function render(){
    ["gdQuick", "gdFootQuick"].forEach(function(id){ if($(id)) $(id).disabled = busy; });
    var kd = ageKind(cfg.last), kf = ageKind(cfg.lastFoot);
    if(kd === "idle") kd = "warn";
    if(kf === "idle") kf = "warn";
    tag("gdTag", kf, cfg.lastFoot ? (kf === "warn" ? "สำรองนานแล้ว" : "สำรองแล้ว") : "ยังไม่เคยสำรอง"); /* ป้ายหัวข้อ สำรอง / กู้คืนดัชนี (หน้าฟุตเทจ) */
    var qi = $("gdQuickInfo"); if(qi) qi.textContent = "ล่าสุด " + ageText(cfg.last) + " · สำรองแล้วเลือกที่เก็บ (เช่น Drive)";
    var fi = $("gdFootQuickInfo"); if(fi) fi.textContent = "ดัชนีฟุตเทจ ล่าสุด " + ageText(cfg.lastFoot) + " · สำรองแล้วเลือกที่เก็บ (เช่น Drive)";
    renderStorage(kd);
  }
  function renderStorage(kd){
    MWStore.info().then(function(i){
      var idb = i.mode === "idb", full = i.quota && i.used / i.quota > 0.8, kinds = [];
      var html = row("เก็บในเครื่อง", idb ? "ok" : "err", idb ? "IndexedDB" : "ใช้ได้แค่ localStorage", idb ? "" : "เบราว์เซอร์นี้ใช้ IndexedDB ไม่ได้ (โหมดส่วนตัว?) พื้นที่จำกัด")
        + row("กันระบบลบเอง", i.persisted ? "ok" : "warn", i.persisted ? "ได้แล้ว" : "ยังไม่ได้", i.persisted ? "" : "ระบบอาจลบข้อมูลแอพเมื่อเครื่องพื้นที่น้อย")
        + row("พื้นที่", full ? "warn" : "ok", (i.used / 1048576).toFixed(1) + " MB" + (i.quota ? " / " + (i.quota / 1073741824).toFixed(1) + " GB" : ""), full ? "ใกล้เต็ม" : "");
      kinds = [idb ? "ok" : "err", i.persisted ? "ok" : "warn", full ? "warn" : "ok"];
      var el = $("stInfo"); if(el) el.innerHTML = html;
      var all = worst(kinds.concat([kd]));
      var onlyBackup = all === "warn" && kinds.every(function(k){ return k === "ok"; }); /* เตือนเพราะเรื่องสำรองอย่างเดียว → บอกสาเหตุตรงๆ ไม่ใช้คำกว้างๆ */
      tag("stTag", all, all === "ok" ? "ปกติ" : all === "err" ? "มีปัญหา" : onlyBackup ? (cfg.last ? "สำรองนานแล้ว" : "ยังไม่เคยสำรอง") : "ควรดูแล");
    });
  }
  async function act(btn, fn){
    if(busy) return; busy = true; render(); var t = btn.textContent;
    try{ show(await fn(), "ok"); }catch(err){ show(err.message, "err"); }
    busy = false; render(); btn.textContent = t;
  }
  function bind(id, fn){ var el = $(id); if(el) el.addEventListener("click", function(){ act(el, fn); }); }
  bind("gdQuick", async function(){
    var blob = MW.backupBlob();
    await MWNative.share(blob, "meowrin-factory-backup.json", "สำรองข้อมูล Meowrin"); /* ผู้ใช้เลือกที่เก็บเอง (แตะ Drive) · ถ้ายกเลิกจะโยน error ไม่นับว่าสำรองแล้ว */
    cfg.last = Date.now(); saveCfg(); return "ส่งไฟล์สำรองออกไปแล้ว (" + (blob.size / 1024).toFixed(0) + " KB) ถ้าเลือก Drive ให้รอให้อัปโหลดเสร็จ";
  });
  bind("gdFootQuick", async function(){
    if(!window.FT || !FT.ui) throw new Error("ดัชนียังโหลดไม่เสร็จ");
    var blob = new Blob([JSON.stringify({ v:1, at:Date.now(), clips:FT.ui.lib() })], { type:"application/json" }); /* ไฟล์เดียวกับปุ่ม โหลดไฟล์สำรอง (กู้คืนด้วยปุ่ม กู้คืน) */
    await MWNative.share(blob, "meowrin-footage-index.json", "สำรองดัชนีฟุตเทจ");
    cfg.lastFoot = Date.now(); saveCfg(); return "ส่งไฟล์ดัชนีออกไปแล้ว (" + (blob.size / 1048576).toFixed(1) + " MB) ถ้าเลือก Drive ให้รอให้อัปโหลดเสร็จ";
  });
  render(); setInterval(render, 60000);
})();
