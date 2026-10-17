/* local.js (window.MWLocal) — วิดีโอที่อยู่ในมือถือ (เฉพาะในแอพ APK)
   สแกนทุกอัลบั้มในเครื่อง (ปลั๊กอิน Media ขอสิทธิ์ดูรูป/วิดีโอ + บอกที่อยู่โฟลเดอร์, ปลั๊กอิน Filesystem อ่านรายชื่อไฟล์) → จับคู่กับคลิปในดัชนีด้วย ชื่อไฟล์|ขนาด
   แล้วให้ footage-find.js เล่น/ตัดต่อจากไฟล์ในเครื่องได้เลยโดยไม่ต้องเลือกไฟล์ทุกครั้ง · ไม่ได้อยู่ในแอพ (เบราว์เซอร์) = ไม่ทำอะไร ใช้ปุ่มเลือกไฟล์เดิม
   ตั้งค่า mw_local_v1 { auto } (สแกนสำเร็จครั้งแรกแล้ว = สแกนเองตอนเปิดหน้า) · แผงอยู่ footage.html แท็บตั้งค่า (#locScan #locInfo #tagLoc) */
(function(){
  "use strict";
  var KEY = "mw_local_v1", LIBROOT = "Meowrin/library", VEXT = /\.(mp4|mov|m4v|mkv|webm|3gp)$/i, map = {}, all = [], st = { albums:0, files:0, at:0 }, busy = false;
  var $ = function(id){ return document.getElementById(id); };
  function cap(){ return window.Capacitor || null; }
  function plug(n){ var c = cap(); return c && c.isNativePlatform && c.isNativePlatform() && c.Plugins && c.Plugins[n] && (!c.isPluginAvailable || c.isPluginAvailable(n)) ? c.Plugins[n] : null; }
  function native(){ return !!(plug("Media") && plug("Filesystem")); }
  function key(name, size){ return name + "|" + size; }
  function fileUrl(uri){ /* convertFileSrc ใช้ได้เมื่อหน้าอยู่ที่ https://localhost (แบบห่อโค้ด) · โหมด live หน้าอยู่ที่ github.io → ต้องชี้ตัวช่วยไฟล์ของแอพตรงๆ */
    if(location.hostname === "localhost") return cap().convertFileSrc(uri);
    return "https://localhost/_capacitor_file_" + uri.replace(/^file:\/\//, "").split("/").map(encodeURIComponent).join("/");
  }
  function uriOf(c){ return c && map[key(c.name, c.size)] || null; } /* ที่อยู่ไฟล์ (file://) ให้สตูดิโอเก็บลงโปรเจกต์ */
  function urlOf(c){ var u = c && map[key(c.name, c.size)]; return u ? fileUrl(u) : null; } /* ที่อยู่ที่ <video> เล่นได้ หรือ null */
  async function scan(onStep){
    var M = plug("Media"), F = plug("Filesystem"); if(!M || !F) throw new Error("ใช้ได้เฉพาะในแอพ APK");
    var albums = (await M.getAlbums()).albums || [], next = {}, items = [], seen = {}, files = 0, n = 0;
    for(var i = 0; i < albums.length; i++){
      var p = albums[i].identifier; if(!p || seen[p] || /\/Meowrin\/library(\/|$)/.test(p)) continue; /* โฟลเดอร์สำเนาของแอพ MediaStore ก็ลิสต์เป็นอัลบั้ม · ข้ามตรงนี้ เพราะสแกนแยกด้านล่าง ไม่งั้นคลิปขึ้นซ้ำ 2 ชุด */ seen[p] = 1; n++; if(onStep) onStep(i + 1, albums.length);
      try{ ((await F.readdir({ path:p })).files || []).forEach(function(f){ if(f.type !== "directory" && f.uri && VEXT.test(f.name)){ next[key(f.name, f.size)] = f.uri; items.push({ name:f.name, size:f.size, mtime:f.mtime || 0, uri:f.uri, album:albums[i].name || p.split("/").pop(), dir:p + "/" }); files++; } }); }
      catch(e){ /* โฟลเดอร์ที่อ่านไม่ได้ ข้าม */ }
    }
    var byK = {}; items.forEach(function(it){ var k0 = key(it.name, it.size); (byK[k0] = byK[k0] || []).push(it); }); var inLib = 0, libBad = []; /* คลิปชื่อ+ขนาดเดียวกันอยู่ได้หลายอัลบั้ม → เก็บเป็นลิสต์ ติดป้าย lib ให้ทุกอัน (เดิมติดแค่อันสุดท้าย อันอื่นถูกนับว่าขาดสำเนา) */
    try{ var top = (await F.readdir({ path:LIBROOT, directory:"DOCUMENTS" })).files || []; /* สำเนาในแอพ (v8.10): เล่นจากสำเนาก่อนไฟล์ต้นฉบับ · ต้นฉบับถูกลบแล้วก็ยังอยู่ในอัลบั้ม */
      for(var d = 0; d < top.length; d++){ if(top[d].type !== "directory") continue;
        try{ ((await F.readdir({ path:LIBROOT + "/" + top[d].name, directory:"DOCUMENTS" })).files || []).forEach(function(f){ if(f.type === "directory" || !f.uri || !VEXT.test(f.name)) return; var k = key(f.name, f.size), ex = byK[k]; inLib++; next[k] = f.uri;
          if(ex) ex.forEach(function(x){ x.lib = true; }); else { var it = { name:f.name, size:f.size, mtime:f.mtime || 0, uri:f.uri, album:top[d].name, dir:LIBROOT + "/" + top[d].name + "/", lib:true }; items.push(it); byK[k] = [it]; files++; } }); }catch(e){ libBad.push(top[d].name + ": " + ((e && (e.message || e.errorMessage)) || e)); } /* อ่านโฟลเดอร์สำเนาไหนไม่ได้ จดไว้ให้แผงบอก */
      } }catch(e){ /* ยังไม่มีโฟลเดอร์สำเนา */ }
    map = next; all = items; st = { albums:n, files:files, lib:inLib, libBad:libBad, at:Date.now() }; MWStore.set(KEY, { auto:true, st:st, list:items }); /* จำรายการไว้ เปิดหน้าครั้งถัดไปโชว์ได้ทันทีก่อนสแกนเสร็จ */
    document.dispatchEvent(new CustomEvent("ft:files", { detail:files })); /* แท็บผู้กำกับอัปเดตสถานะไฟล์ที่พร้อมใช้ */
    return st;
  }
  function lib(){ return window.FT && FT.ui && FT.ui.lib ? FT.ui.lib() : []; }
  function render(msg, bad){
    var info = $("locInfo"), tag = $("tagLoc"), btn = $("locScan"); if(!info) return;
    var ok = st.at > 0, m = ok ? lib().filter(function(c){ return map[key(c.name, c.size)]; }).length : 0;
    info.textContent = msg || (!native() ? "ใช้ได้เฉพาะในแอพ APK · ในเบราว์เซอร์ใช้ปุ่มเลือกไฟล์แทน"
      : ok ? "สแกนแล้ว " + st.albums + " อัลบั้ม · วิดีโอ " + st.files + " ไฟล์ · ตรงกับดัชนี " + m + "/" + lib().length + " คลิป (เล่น/ตัดต่อจากไฟล์ในเครื่องได้เลย)"
      : "ยังไม่ได้สแกน · ครั้งแรกจะมีหน้าต่างขออนุญาตดูรูปและวิดีโอ ให้กดอนุญาต");
    info.className = "hint" + (bad ? " bad" : "");
    tag.textContent = !native() ? "เฉพาะแอพ" : busy ? "กำลังสแกน" : ok ? m + "/" + lib().length : "ยังไม่สแกน"; tag.className = "state " + (ok && native() ? "ok" : "idle");
    btn.disabled = busy || !native();
  }
  (function restore(){ var s = MWStore.get(KEY, {}) || {}; if(!Array.isArray(s.list)) return; /* ผลสแกนรอบก่อน (ไฟล์ที่ย้าย/ลบไปแล้วจะหายตอนสแกนรอบใหม่เสร็จ) */
    all = s.list; s.list.forEach(function(f){ map[key(f.name, f.size)] = f.uri; }); if(s.st) st = s.st; })();
  function ping(){ document.dispatchEvent(new CustomEvent("ft:scan")); } /* หน้าอัลบั้มขึ้น/เอาคำว่า "กำลังสแกน" ออก */
  async function run(){
    if(busy) return; busy = true; render("กำลังสแกน..."); ping();
    try{ await scan(function(i, n){ render("กำลังสแกนอัลบั้ม " + i + "/" + n + "..."); }); busy = false; render(); ping(); }
    catch(e){ busy = false; ping(); render("สแกนไม่ได้: " + (e && (e.message || e.errorMessage) || e) + " · ถ้าเคยกดไม่อนุญาต ให้เปิดสิทธิ์ที่ ตั้งค่ามือถือ > แอป > Meowrin > สิทธิ์ แล้วลองใหม่", true); }
  }
  window.MWLocal = { LIBROOT:LIBROOT, plug:plug, native:native, scan:scan, list:function(){ return all; }, scanning:function(){ return busy; }, urlOf:urlOf, uriOf:uriOf, fileUrl:fileUrl, count:function(){ return st.files; }, libInfo:function(){ return { files:st.lib || 0, bad:st.libBad || [] }; } };
  if($("locScan")){
    $("locScan").addEventListener("click", run);
    $("locFold").addEventListener("toggle", function(){ if(this.open) render(); }); /* ดัชนีโหลดทีหลัง ตัวเลขจับคู่อัปเดตตอนเปิดแผง */
    render();
    if(native() && (MWStore.get(KEY, {}) || {}).auto) run(); /* เคยสแกนสำเร็จแล้ว (สิทธิ์ได้แล้ว) = สแกนเองตอนเปิดหน้า */
  }
})();
