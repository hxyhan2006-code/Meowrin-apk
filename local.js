/* local.js (window.MWLocal) — วิดีโอที่อยู่ในมือถือ (เฉพาะในแอพ APK)
   สแกนทุกอัลบั้มในเครื่อง (ปลั๊กอิน Media ขอสิทธิ์ดูรูป/วิดีโอ + บอกที่อยู่โฟลเดอร์, ปลั๊กอิน Filesystem อ่านรายชื่อไฟล์) → จับคู่กับคลิปในดัชนีด้วย ชื่อไฟล์|ขนาด
   แล้วให้ footage-find.js เล่น/ตัดต่อจากไฟล์ในเครื่องได้เลยโดยไม่ต้องเลือกไฟล์ทุกครั้ง · ไม่ได้อยู่ในแอพ (เบราว์เซอร์) = ไม่ทำอะไร ใช้ปุ่มเลือกไฟล์เดิม
   ตั้งค่า mw_local_v1 { auto } (สแกนสำเร็จครั้งแรกแล้ว = สแกนเองตอนเปิดหน้า) · แผงอยู่ footage.html แท็บตั้งค่า (#locScan #locInfo #tagLoc) */
(function(){
  "use strict";
  var KEY = "mw_local_v1", VEXT = /\.(mp4|mov|m4v|mkv|webm|3gp)$/i, map = {}, st = { albums:0, files:0, at:0 }, busy = false;
  var $ = function(id){ return document.getElementById(id); };
  function cap(){ return window.Capacitor || null; }
  function plug(n){ var c = cap(); return c && c.isNativePlatform && c.isNativePlatform() && c.Plugins && c.Plugins[n] && (!c.isPluginAvailable || c.isPluginAvailable(n)) ? c.Plugins[n] : null; }
  function native(){ return !!(plug("Media") && plug("Filesystem")); }
  function key(name, size){ return name + "|" + size; }
  function fileUrl(uri){ /* convertFileSrc ใช้ได้เมื่อหน้าอยู่ที่ https://localhost (แบบห่อโค้ด) · โหมด live หน้าอยู่ที่ github.io → ต้องชี้ตัวช่วยไฟล์ของแอพตรงๆ */
    if(location.hostname === "localhost") return cap().convertFileSrc(uri);
    return "https://localhost/_capacitor_file_" + uri.replace(/^file:\/\//, "").split("/").map(encodeURIComponent).join("/");
  }
  function urlOf(c){ var u = c && map[key(c.name, c.size)]; return u ? fileUrl(u) : null; } /* ที่อยู่ที่ <video> เล่นได้ หรือ null */
  async function scan(onStep){
    var M = plug("Media"), F = plug("Filesystem"); if(!M || !F) throw new Error("ใช้ได้เฉพาะในแอพ APK");
    var albums = (await M.getAlbums()).albums || [], next = {}, seen = {}, files = 0, n = 0;
    for(var i = 0; i < albums.length; i++){
      var p = albums[i].identifier; if(!p || seen[p]) continue; seen[p] = 1; n++; if(onStep) onStep(i + 1, albums.length);
      try{ ((await F.readdir({ path:p })).files || []).forEach(function(f){ if(f.type !== "directory" && f.uri && VEXT.test(f.name)){ next[key(f.name, f.size)] = f.uri; files++; } }); }
      catch(e){ /* โฟลเดอร์ที่อ่านไม่ได้ ข้าม */ }
    }
    map = next; st = { albums:n, files:files, at:Date.now() }; MWStore.set(KEY, { auto:true });
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
  async function run(){
    if(busy) return; busy = true; render("กำลังสแกน...");
    try{ await scan(function(i, n){ render("กำลังสแกนอัลบั้ม " + i + "/" + n + "..."); }); busy = false; render(); }
    catch(e){ busy = false; render("สแกนไม่ได้: " + (e && (e.message || e.errorMessage) || e) + " · ถ้าเคยกดไม่อนุญาต ให้เปิดสิทธิ์ที่ ตั้งค่ามือถือ > แอป > Meowrin > สิทธิ์ แล้วลองใหม่", true); }
  }
  window.MWLocal = { native:native, scan:scan, urlOf:urlOf, fileUrl:fileUrl, count:function(){ return st.files; } };
  if($("locScan")){
    $("locScan").addEventListener("click", run);
    $("locFold").addEventListener("toggle", function(){ if(this.open) render(); }); /* ดัชนีโหลดทีหลัง ตัวเลขจับคู่อัปเดตตอนเปิดแผง */
    render();
    if(native() && (MWStore.get(KEY, {}) || {}).auto) run(); /* เคยสแกนสำเร็จแล้ว (สิทธิ์ได้แล้ว) = สแกนเองตอนเปิดหน้า */
  }
})();
