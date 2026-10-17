/* library.js (window.MWLib) — ก๊อปคลิปจาก Pictures/Gallery/owner เข้าโฟลเดอร์ของแอพ Documents/Meowrin/library/<อัลบั้ม>/ (เฉพาะในแอพ APK)
   ต้นฉบับไม่ถูกแตะ · ข้ามไฟล์ที่ก๊อปแล้ว (ชื่อ+ขนาดตรง) · ก๊อปไปชื่อ .part ก่อนแล้วค่อยเปลี่ยนชื่อ (ปิดแอพกลางทางก็ไม่ได้ไฟล์ครึ่งๆ กลางๆ) · หยุด/ทำต่อได้
   หลังก๊อปเสร็จสแกนใหม่ → local.js เล่นจากสำเนาก่อน · แผงอยู่ footage.html แท็บตั้งค่า (#libGo #libStop #libInfo #tagLib) */
(function(){
  "use strict";
  var $ = function(id){ return document.getElementById(id); }, busy = false, stopF = false, msg = "", hidMsg = ""; /* hidMsg = ผลการซ่อนจากแกลเลอรี โชว์ท้ายข้อความในแผง */
  var ROOT = "/Gallery/owner/";
  function F(){ return window.MWLocal && MWLocal.plug ? MWLocal.plug("Filesystem") : null; }
  function safe(n){ return String(n).replace(/[\\/:*?"<>|]/g, "_").trim() || "ไม่ระบุ"; }
  function gb(b){ return b >= 1e9 ? (b / 1e9).toFixed(1) + " GB" : Math.max(1, Math.round(b / 1e6)) + " MB"; }
  async function hide(){ /* ไฟล์ .nomedia ในโฟลเดอร์สำเนา: แกลเลอรีของมือถือไม่แสดงสำเนา (ไม่งั้นสำเนาที่สร้างวันนี้ลอยขึ้นบนสุดดันรูปส่วนตัวลงล่าง) · แอพอ่านไฟล์ตรงจากโฟลเดอร์ ไม่ผ่านแกลเลอรี จึงยังเล่นได้ปกติ · ลบไฟล์นี้ = แกลเลอรีเห็นสำเนากลับมา */
    var fs = F(); if(!fs) return; var path = MWLocal.LIBROOT + "/.nomedia";
    try{ await fs.stat({ path:path, directory:"DOCUMENTS" }); hidMsg = "ซ่อนจากแกลเลอรีแล้ว (มีไฟล์ .nomedia อยู่)"; }
    catch(e){
      try{ await fs.writeFile({ path:path, data:"\n", directory:"DOCUMENTS", encoding:"utf8", recursive:true }); hidMsg = "สร้างไฟล์ .nomedia แล้ว (แกลเลอรีจะซ่อนสำเนาหลังสแกนใหม่/รีสตาร์ทมือถือ)"; }
      catch(err){ hidMsg = "สร้างไฟล์ .nomedia ไม่ได้: " + ((err && (err.message || err.errorMessage)) || err); }
    }
    render();
  }
  function todo(){ return (window.MWLocal ? MWLocal.list() : []).filter(function(f){ return !f.lib && f.dir && f.dir.indexOf(ROOT) >= 0; }); } /* ยังไม่มีสำเนาในแอพ */
  function total(){ return (window.MWLocal ? MWLocal.list() : []).filter(function(f){ return f.dir && f.dir.indexOf(ROOT) >= 0 || f.lib; }); }
  function render(){
    var info = $("libInfo"); if(!info) return;
    var t = todo(), all = total(), bytes = t.reduce(function(a, f){ return a + (f.size || 0); }, 0), ok = !!F();
    info.textContent = (msg || (!ok ? "ใช้ได้เฉพาะในแอพ APK" : !all.length ? "ยังไม่ได้สแกน · สแกนวิดีโอในมือถือก่อน (แผงด้านบน)" : t.length ? "ยังไม่มีสำเนา " + t.length + "/" + all.length + " คลิป (" + gb(bytes) + ") · ต้นฉบับไม่ถูกแตะ ก๊อปแล้วจะกินพื้นที่เพิ่มเท่ากัน" : "ก๊อปครบแล้ว " + all.length + " คลิป")) + (hidMsg ? " · " + hidMsg : "");
    $("tagLib").textContent = !ok ? "เฉพาะแอพ" : busy ? "กำลังก๊อป" : all.length ? (all.length - t.length) + "/" + all.length : "-"; $("tagLib").className = "state " + (ok && all.length && !t.length ? "ok" : "idle");
    $("libGo").disabled = busy || !ok || !t.length; $("libStop").hidden = !busy;
  }
  async function one(fs, f){
    var dir = MWLocal.LIBROOT + "/" + safe(f.album), to = dir + "/" + safe(f.name);
    await fs.mkdir({ path:dir, directory:"DOCUMENTS", recursive:true }).catch(function(){}); /* มีอยู่แล้ว = ไม่เป็นไร */
    await fs.deleteFile({ path:to + ".part", directory:"DOCUMENTS" }).catch(function(){}); /* เศษจากรอบที่ถูกปิดกลางทาง */
    await fs.copy({ from:f.uri, to:to + ".part", toDirectory:"DOCUMENTS" });
    await fs.rename({ from:to + ".part", to:to, directory:"DOCUMENTS", toDirectory:"DOCUMENTS" });
  }
  async function run(){
    var fs = F(); if(busy || !fs) return; var t = todo(); if(!t.length) return;
    var bytes = t.reduce(function(a, f){ return a + (f.size || 0); }, 0);
    if(!(await MWDialog.confirm("ก๊อป " + t.length + " คลิป (" + gb(bytes) + ") เข้าแอพ?\nต้นฉบับไม่ถูกแตะ แต่จะกินพื้นที่มือถือเพิ่มเท่ากัน · หยุดได้ ทำต่อได้ · ใช้เวลาสักพัก ควรเสียบสายชาร์จ", { ok:"เริ่มก๊อป", cancel:"ยกเลิก" }))) return;
    busy = true; stopF = false; var done = 0, doneB = 0, fail = 0, last = "";
    await hide();
    try{ if(window.FT && FT.ui && FT.ui.wake) await FT.ui.wake(true); }catch(e){}
    render();
    for(var i = 0; i < t.length && !stopF; i++){
      msg = "กำลังก๊อป " + (i + 1) + "/" + t.length + " · " + gb(doneB) + "/" + gb(bytes) + " · " + t[i].album; render();
      try{ await one(fs, t[i]); done++; doneB += t[i].size || 0; }
      catch(e){ fail++; last = (e && (e.message || e.errorMessage)) || String(e); if(fail >= 3){ break; } } /* พลาดติดๆ กัน = เลิก (มักเป็นเพราะพื้นที่เต็ม) ไม่ก๊อปรัวๆ ต่อ */
    }
    try{ if(window.FT && FT.ui && FT.ui.wake) await FT.ui.wake(false); }catch(e){}
    busy = false; msg = "ก๊อปแล้ว " + done + " คลิป (" + gb(doneB) + ")" + (stopF ? " · หยุดไว้ ทำต่อได้" : "") + (fail ? " · ก๊อปไม่ได้ " + fail + " คลิป: " + last + (fail >= 3 ? " (หยุดเอง · เช็กพื้นที่มือถือ)" : "") : ""); render();
    try{ await MWLocal.scan(); }catch(e){} if(!fail && !stopF) msg = ""; /* ก๊อปครบ = ให้สถานะ "ก๊อปครบแล้ว" แทน */ render();
    document.dispatchEvent(new CustomEvent("ft:scan"));
  }
  window.MWLib = { todo:todo, run:run, busy:function(){ return busy; } };
  if($("libGo")){
    $("libGo").addEventListener("click", run); $("libStop").addEventListener("click", function(){ stopF = true; msg = "กำลังหยุดหลังคลิปนี้..."; render(); });
    $("libFold").addEventListener("toggle", function(){ if(this.open){ if(!busy) render(); } });
    document.addEventListener("ft:scan", function(){ if(!busy) render(); }); render();
    setTimeout(function(){ hide().catch(function(){}); }, 1500); /* เปิดหน้ามาแล้วยังไม่มีไฟล์ = สร้างให้ (คนที่ก๊อปไว้ก่อนอัปเดตนี้ก็ได้ด้วย) */
  }
})();
