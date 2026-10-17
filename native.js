/* native.js (window.MWNative) — บันทึก/แชร์ไฟล์ ให้ใช้ได้ทั้งในแอพ APK และในเบราว์เซอร์
   ในแอพ: <a download> ไม่เซฟจริง และ navigator.share ไม่มี → ใช้ปลั๊กอิน Filesystem (เซฟลง Documents/Meowrin เขียนทีละก้อน 6 MB ไฟล์ใหญ่ไม่กินแรม)
   กับ Share (เขียนไฟล์ลงแคชก่อนแล้วเปิดหน้าต่างแชร์) · ในเบราว์เซอร์: ทำแบบเดิม (ดาวน์โหลดผ่านลิงก์ / navigator.share)
   save(blob, name) → { path, uri } (ในแอพ) หรือ { web:true } · share(blob, name, title) · canShare(file) · isNative() */
(function(){
  "use strict";
  var DIR = "Meowrin", CHUNK = 6 * 1024 * 1024; /* ต้องหารด้วย 3 ลงตัว ไม่งั้น base64 ที่ต่อกันจะเพี้ยน */
  function cap(){ return window.Capacitor || null; }
  function plug(n){ var c = cap(); return c && c.isNativePlatform && c.isNativePlatform() && c.Plugins && c.Plugins[n] && (!c.isPluginAvailable || c.isPluginAvailable(n)) ? c.Plugins[n] : null; }
  function isNative(){ return !!plug("Filesystem"); }
  function b64(blob){
    return new Promise(function(ok, no){ var r = new FileReader();
      r.onload = function(){ var s = String(r.result); ok(s.slice(s.indexOf(",") + 1)); };
      r.onerror = function(){ no(r.error || new Error("อ่านไฟล์ไม่ได้")); }; r.readAsDataURL(blob); });
  }
  async function writeChunked(fs, path, directory, blob){
    for(var off = 0, first = true; first || off < blob.size; off += CHUNK, first = false){
      var data = await b64(blob.slice(off, off + CHUNK));
      if(first) await fs.writeFile({ path:path, data:data, directory:directory, recursive:true });
      else await fs.appendFile({ path:path, data:data, directory:directory });
    }
    return (await fs.getUri({ path:path, directory:directory })).uri;
  }
  function altName(name){ var d = name.lastIndexOf("."); return (d > 0 ? name.slice(0, d) : name) + "-" + Date.now() + (d > 0 ? name.slice(d) : ""); }
  async function toGallery(uri, name){ /* วิดีโอ: ก๊อปเข้าแกลเลอรีของมือถือ (อัลบั้ม Meowrin) ให้ CapCut/แกลเลอรีเห็น · ไฟล์ใน Documents ไม่โผล่ในแกลเลอรีเพราะไม่มีการสแกนสื่อ · พลาด = false ไม่ล้มการบันทึก */
    var m = plug("Media"); if(!m || !m.saveVideo) return false;
    try{
      var find = async function(){ return ((await m.getAlbums()).albums || []).find(function(a){ return a.name === "Meowrin"; }); };
      var al = await find(); if(!al){ await m.createAlbum({ name:"Meowrin" }); al = await find(); }
      if(!al) return false;
      var o = { albumIdentifier:al.identifier, fileName:name.replace(/\.[^.]+$/, "") };
      try{ await m.saveVideo(Object.assign({ path:uri }, o)); }catch(e){ await m.saveVideo(Object.assign({ path:uri.replace(/^file:\/\//, "") }, o)); }
      return true;
    }catch(e){ return false; }
  }
  async function save(blob, name){
    var fs = plug("Filesystem");
    if(!fs){ var u = URL.createObjectURL(blob), a = document.createElement("a"); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function(){ URL.revokeObjectURL(u); }, 4000); return { web:true, name:name }; }
    var path = DIR + "/" + name, uri;
    try{ uri = await writeChunked(fs, path, "DOCUMENTS", blob); }
    catch(e){ path = DIR + "/" + altName(name); uri = await writeChunked(fs, path, "DOCUMENTS", blob); } /* ชื่อเดิมเขียนทับไม่ได้ (ไฟล์ค้างจากการติดตั้งรอบก่อน) → ใช้ชื่อใหม่ */
    var out = { path:"Documents/" + path, uri:uri, name:path.slice(DIR.length + 1), gallery:false };
    if(/\.(mp4|mov|webm)$/i.test(name)) out.gallery = await toGallery(uri, out.name);
    if(window.MWHist) try{ MWHist.addFile({ name:out.name, uri:uri, rel:path, size:blob.size }); }catch(e){} /* ประวัติงาน: จดไฟล์วิดีโอ/srt ที่เซฟ */
    return out;
  }
  function canShare(file){
    if(plug("Filesystem") && plug("Share")) return true;
    try{ return !!(navigator.canShare && (file ? navigator.canShare({ files:[file] }) : true)); }catch(e){ return false; }
  }
  async function share(blob, name, title){
    var fs = plug("Filesystem"), sh = plug("Share");
    if(fs && sh){ var uri = await writeChunked(fs, "share/" + Date.now() + "-" + name, "CACHE", blob); await sh.share({ title:title || name, files:[uri], dialogTitle:"แชร์" }); return; }
    if(navigator.share){ await navigator.share({ files:[new File([blob], name, { type:blob.type })], title:title || name }); return; }
    throw new Error("เครื่องนี้แชร์ไฟล์ไม่ได้ ใช้ปุ่มบันทึกแทน");
  }
  /* ย้อนกลับ 1 ขั้นเหมือนกดปุ่มย้อนของมือถือ: ให้หน้านั้นปิดชั้นของตัวเองก่อน (window.MWBackHook: ชีต/หน้าต่าง/ชั้นอัลบั้ม ฯลฯ) ไม่มีอะไรให้ปิด = history.back() · เปิดหน้านี้ตรงๆ (ไม่มีประวัติ) = ไปที่ fallback
     ปุ่มลูกศรมุมซ้ายบนของทุกหน้าใส่ data-back (href = fallback) ตัวนี้จับคลิกให้เอง ไม่ใช่ลิงก์ไปหน้าแรกของแอพอีกต่อไป */
  async function goBack(fallback){
    try{ if(window.MWBackHook && await window.MWBackHook()) return; }catch(e){}
    if(history.length > 1) history.back(); else location.href = fallback || "/";
  }
  document.addEventListener("click", function(e){ var a = e.target.closest && e.target.closest("a[data-back]"); if(!a) return; e.preventDefault(); goBack(a.getAttribute("href")); });
  /* ปุ่มย้อนของมือถือ (ปลั๊กอิน @capacitor/app): หน้าที่ลงทะเบียน window.MWBackHook ปิดชั้นของตัวเองก่อน (คืน true) · ไม่มีอะไรให้ปิด: หน้าย่อย → ย้อนไปหน้าก่อนหน้า · หน้าแรก → ถามก่อนออกแอพ
     (ไม่มีปลั๊กอิน = ใช้พฤติกรรมเดิมของ Android ย้อนแล้วออกเลย · ต้องติดตั้ง APK ที่มีปลั๊กอินนี้) */
  (function(){
    var App = plug("App"); if(!App || !App.addListener) return;
    var busy = false;
    App.addListener("backButton", async function(){
      if(busy) return; busy = true;
      try{
        if(window.MWBackHook && await window.MWBackHook()) return;
        var path = location.pathname.replace(/\/+$/, "");
        if(path !== "" && path !== "/index.html"){ /* หน้าแรกจริงๆ เท่านั้นที่ถามออกแอพ · sub/index.html ก็ลงท้าย index.html แต่ไม่ใช่หน้าแรก */ await goBack("/"); return; }
        var ok = window.MWDialog ? await MWDialog.confirm("ออกจากแอพไหม?", { ok:"ออก", cancel:"อยู่ต่อ" }) : true;
        if(ok) App.exitApp();
      } finally { busy = false; }
    });
  })();
  window.MWNative = { goBack:goBack, isNative:isNative, save:save, share:share, canShare:canShare };
})();
