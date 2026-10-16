/* check.js — หน้า "ตรวจระบบแอพ" (check.html): ทดสอบว่าบนมือถือเครื่องนี้ (ในแอพ APK หรือเบราว์เซอร์) อะไรใช้ได้/ไม่ได้
   ไม่แตะข้อมูลของแอพ · ทดสอบแบบไม่เสียเงิน (เรียก API แบบอ่านอย่างเดียว) · ผลคัดลอกส่งต่อได้ที่ปุ่ม "คัดลอกผลทั้งหมด"
   ปลั๊กอินเนทีฟ (Filesystem/Share/KeepAwake/Media) เรียกผ่าน window.Capacitor.Plugins · ถ้าไม่ได้อยู่ในแอพ ข้อพวกนั้นจะขึ้น "ไม่มีปลั๊กอิน" */
(function(){
  "use strict";
  var $ = function(id){ return document.getElementById(id); };
  var res = {}, ui = {}, TESTS = [];

  function cap(){ return window.Capacitor || null; }
  function plug(n){ var c = cap(); return c && c.Plugins && c.Plugins[n] && (!c.isPluginAvailable || c.isPluginAvailable(n)) ? c.Plugins[n] : null; }
  function errText(e){ return e && (e.message || e.errorMessage || e.name) ? String(e.message || e.errorMessage || e.name) : String(e); }
  function gb(n){ return (n / 1073741824).toFixed(1) + " GB"; }
  function mb(n){ return (n / 1048576).toFixed(1) + " MB"; }
  function wait(ms){ return new Promise(function(ok){ setTimeout(ok, ms); }); }
  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]; }); }
  function ok(t){ return { s:"ok", t:t }; }
  function bad(t){ return { s:"bad", t:t }; }
  function info(t){ return { s:"info", t:t }; }
  function ask(t){ return { s:"ask", t:t }; }

  /* GET แบบไม่เสียเงิน · ติด CORS/เน็ตหลุด = TypeError */
  async function get(url, headers){
    var ac = new AbortController(), t = setTimeout(function(){ ac.abort(); }, 15000);
    try{
      var r = await fetch(url, { headers:headers || {}, signal:ac.signal });
      var body = ""; try{ body = (await r.text()).slice(0, 220); }catch(e){}
      return { status:r.status, body:body };
    }catch(e){ return { err: e && e.name === "AbortError" ? "หมดเวลา 15 วิ" : "ต่อไม่ได้ (เน็ตหลุดหรือถูกบล็อก/CORS): " + errText(e) }; }
    finally{ clearTimeout(t); }
  }
  function line(name, r, okWhen){
    if(r.err) return { ok:false, t:name + ": " + r.err };
    var good = okWhen ? okWhen(r) : r.status >= 200 && r.status < 300;
    return { ok:good, t:name + ": HTTP " + r.status + (good ? "" : " · " + r.body.replace(/\s+/g, " ")) };
  }

  /* ---------------- รายการทดสอบ ---------------- */
  TESTS.push({ id:"env", auto:true, title:"ข้อมูลเครื่อง/แอพ", run: async function(){
    var c = cap(), m = /Chrome\/([\d.]+)/.exec(navigator.userAgent);
    return info("WEBVIEW_SERVER_URL: " + (window.WEBVIEW_SERVER_URL || "-") + "\nแพลตฟอร์ม: " + (c && c.getPlatform ? c.getPlatform() : "เว็บล้วน (ไม่มี Capacitor)") + " · อยู่ในแอพ: " + (c && c.isNativePlatform ? c.isNativePlatform() : false)
      + "\nที่อยู่หน้า (origin): " + location.origin + "\nเบราว์เซอร์/WebView: Chrome " + (m ? m[1] : "?") + "\nจอ: " + innerWidth + "x" + innerHeight + " · dpr " + devicePixelRatio);
  } });

  TESTS.push({ id:"plug", auto:true, title:"ปลั๊กอินเนทีฟที่ติดมากับแอพ", run: async function(){
    var names = ["Filesystem", "Share", "KeepAwake", "Media"], miss = [], have = [];
    names.forEach(function(n){ (plug(n) ? have : miss).push(n); });
    return (miss.length ? bad : ok)("มี: " + (have.join(", ") || "-") + (miss.length ? "\nไม่มี: " + miss.join(", ") : ""));
  } });

  TESTS.push({ id:"store", auto:true, title:"ที่เก็บข้อมูลในแอพ", run: async function(){
    var out = [];
    MWStore.set("mw_check_tmp", { t:Date.now() }); var back = MWStore.get("mw_check_tmp", null); MWStore.del("mw_check_tmp");
    out.push("เขียน/อ่านค่า: " + (back && back.t ? "ได้" : "ไม่ได้"));
    if(navigator.storage && navigator.storage.estimate){ var e = await navigator.storage.estimate(); out.push("โควต้าที่เบราว์เซอร์ให้: " + gb(e.quota || 0) + " · ใช้ไปแล้ว " + mb(e.usage || 0)); }
    if(navigator.storage && navigator.storage.persist){ out.push("ขอเก็บถาวร (persist): " + (await navigator.storage.persist() ? "ได้" : "ไม่ได้")); }
    return (back && back.t ? ok : bad)(out.join("\n"));
  } });

  TESTS.push({ id:"api", auto:true, title:"ความสามารถของ WebView", run: async function(){
    var mr = window.MediaRecorder, ty = function(t){ return mr && mr.isTypeSupported && mr.isTypeSupported(t) ? "ได้" : "ไม่ได้"; };
    var cv = document.createElement("canvas");
    return info("wakeLock: " + !!(navigator.wakeLock) + " · share: " + !!navigator.share + " · canShare: " + !!navigator.canShare + " · clipboard.readText: " + !!(navigator.clipboard && navigator.clipboard.readText)
      + "\nMediaRecorder: " + !!mr + " · mp4(avc1): " + ty("video/mp4;codecs=avc1") + " · webm(vp9): " + ty("video/webm;codecs=vp9")
      + "\ncanvas.captureStream: " + !!cv.captureStream + " · AudioContext: " + !!(window.AudioContext || window.webkitAudioContext) + " · BroadcastChannel: " + !!window.BroadcastChannel);
  } });

  TESTS.push({ id:"codec", auto:true, title:"เข้ารหัสวิดีโอ (WebCodecs) สำหรับเรนเดอร์ซับ", run: async function(){
    if(!window.VideoEncoder) return bad("ไม่มี VideoEncoder ในเครื่องนี้ · หน้าซับเรนเดอร์ mp4 ไม่ได้");
    /* 1080x1080 ต้องระดับ H.264 ตั้งแต่ 4.0 ขึ้นไป (3.1 รับได้แค่ ~720p) */
    var list = [["avc1.640028", "High 4.0"], ["avc1.4d0028", "Main 4.0"], ["avc1.42002a", "Baseline 4.2"], ["avc1.640032", "High 5.0"]], out = [], any = false;
    for(var k = 0; k < list.length; k++){
      var r = await VideoEncoder.isConfigSupported({ codec:list[k][0], width:1080, height:1080, bitrate:5000000, framerate:30 });
      out.push("H.264 " + list[k][1] + " 1080x1080: " + (r.supported ? "ได้" : "ไม่ได้")); if(r.supported) any = true;
    }
    var a = window.AudioEncoder ? await AudioEncoder.isConfigSupported({ codec:"mp4a.40.2", sampleRate:48000, numberOfChannels:2, bitrate:128000 }) : { supported:false };
    out.push("เสียง AAC: " + (a.supported ? "ได้" : "ไม่ได้"));
    return (any ? ok : bad)(out.join("\n"));
  } });

  TESTS.push({ id:"net", auto:true, title:"เรียก API ด้วยคีย์ที่ตั้งไว้ (ไม่เสียเงิน)", run: async function(){
    var out = [], allOk = true, any = false;
    function add(r){ any = true; if(!r.ok) allOk = false; out.push((r.ok ? "ได้ · " : "ไม่ได้ · ") + r.t); }
    var yt = MWStore.get("mw_key_v1", ""), or = MWStore.get("mw_openrouter_key_v1", ""), gm = MWStore.get("mw_gemini_key_v1", ""), gr = MWStore.get("mw_groq_key_v1", ""), el = MWStore.get("mw_eleven_key_v1", "");
    if(yt) add(line("YouTube", await get("https://www.googleapis.com/youtube/v3/i18nLanguages?part=snippet&hl=en&key=" + encodeURIComponent(yt))));
    if(or) add(line("OpenRouter", await get("https://openrouter.ai/api/v1/key", { Authorization:"Bearer " + or })));
    if(gm) add(line("Gemini", await get("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=" + encodeURIComponent(gm))));
    if(gr) add(line("Groq", await get("https://api.groq.com/openai/v1/models", { Authorization:"Bearer " + gr })));
    if(el) add(line("ElevenLabs", await get("https://api.elevenlabs.io/v1/user", { "xi-api-key":el }), function(r){ return r.status === 200 || r.status === 401 && /missing_permissions/.test(r.body); }));
    if(!any) return info("ยังไม่มีคีย์ในแอพนี้ · ไปใส่คีย์ที่แท็บตั้งค่าของแอพก่อน (หรือกู้คืนไฟล์สำรอง) แล้วกดทดสอบข้อนี้ใหม่");
    return (allOk ? ok : bad)(out.join("\n"));
  } });

  TESTS.push({ id:"r2", auto:true, title:"คลังวิดีโอ R2", run: async function(){
    var c = window.R2 && R2.cfg ? R2.cfg() : null;
    if(!c || !c.account) return info("ยังไม่ได้ตั้งค่า R2 ในแอพนี้ · ตั้งที่หน้าฟุตเทจ > อัปโหลด/ตั้งค่า แล้วกดทดสอบใหม่");
    try{ await R2.test(); return ok("ต่อ R2 ได้"); }
    catch(e){ return bad("ต่อ R2 ไม่ได้: " + errText(e) + "\nถ้าเป็นเรื่อง CORS ให้เพิ่ม https://localhost ในการตั้งค่า CORS ของ R2"); }
  } });

  /* --- ต้องแตะเอง --- */
  TESTS.push({ id:"dl1", title:"ดาวน์โหลดไฟล์แบบหน้าเว็บ (ปุ่มเซฟ mp3/mp4/ไฟล์สำรองใช้วิธีนี้)", desc:"กดแล้วดูว่ามีไฟล์ meowrin-test.txt ในโฟลเดอร์ ดาวน์โหลด หรือไม่", run: async function(){
    var u = URL.createObjectURL(new Blob(["ทดสอบ meowrin " + Date.now()], { type:"text/plain" })), a = document.createElement("a");
    a.href = u; a.download = "meowrin-test.txt"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function(){ URL.revokeObjectURL(u); }, 5000);
    return ask("สั่งเซฟแล้ว · เปิดแอพไฟล์ดูโฟลเดอร์ ดาวน์โหลด (Download) มีไฟล์ meowrin-test.txt ไหม");
  } });

  TESTS.push({ id:"dl2", title:"เซฟไฟล์ด้วยปลั๊กอินแอพ (Filesystem)", desc:"ใช้แทนข้อบน ถ้าข้อบนไม่ทำงาน · เซฟลงโฟลเดอร์ Documents", run: async function(){
    var fs = plug("Filesystem"); if(!fs) return bad("ไม่มีปลั๊กอิน Filesystem (ต้องอยู่ในแอพ APK)");
    var r = await fs.writeFile({ path:"Meowrin/test-" + Date.now() + ".txt", data:"ทดสอบ meowrin " + Date.now(), directory:"DOCUMENTS", encoding:"utf8", recursive:true });
    return ask("เซฟแล้วที่ " + (r && r.uri) + "\nเปิดแอพไฟล์ดูโฟลเดอร์ Documents/Meowrin มีไฟล์ test-ตัวเลข.txt ไหม");
  } });

  TESTS.push({ id:"sh1", title:"แชร์ข้อความแบบหน้าเว็บ (navigator.share)", run: async function(){
    if(!navigator.share) return bad("ไม่มี navigator.share ในเครื่องนี้");
    try{ await navigator.share({ title:"meowrin", text:"ทดสอบแชร์ meowrin" }); return ask("หน้าต่างแชร์ขึ้นและปิดแล้ว · แชร์ได้จริงไหม"); }
    catch(e){ return bad("แชร์ไม่ได้: " + errText(e)); }
  } });

  TESTS.push({ id:"sh2", title:"แชร์ไฟล์ด้วยปลั๊กอินแอพ (Share)", desc:"สร้างไฟล์ข้อความเล็กๆ แล้วเปิดหน้าต่างแชร์ · ลองเลือก CapCut หรือแอพอื่นดู", run: async function(){
    var fs = plug("Filesystem"), sh = plug("Share"); if(!fs || !sh) return bad("ไม่มีปลั๊กอิน " + (!fs ? "Filesystem " : "") + (!sh ? "Share" : ""));
    var f = await fs.writeFile({ path:"meowrin-share.txt", data:"ทดสอบแชร์ไฟล์ meowrin", directory:"CACHE", encoding:"utf8" });
    await sh.share({ title:"meowrin", text:"ทดสอบแชร์ไฟล์", files:[f.uri], dialogTitle:"แชร์" });
    return ask("หน้าต่างแชร์ขึ้นแล้ว · เลือกแอพปลายทางแล้วไฟล์ไปถึงไหม");
  } });

  TESTS.push({ id:"wl1", title:"กันจอดับแบบหน้าเว็บ (Wake Lock)", desc:"ใช้ตอนทำดัชนีคิวยาวๆ", run: async function(){
    if(!navigator.wakeLock) return bad("ไม่มี wakeLock ในเครื่องนี้");
    try{ var s = await navigator.wakeLock.request("screen"); var rel = s.released; await s.release(); return ok("ขอกันจอดับได้ (released ก่อนปล่อย = " + rel + ")"); }
    catch(e){ return bad("ขอกันจอดับไม่ได้: " + errText(e)); }
  } });

  TESTS.push({ id:"wl2", title:"กันจอดับด้วยปลั๊กอินแอพ (KeepAwake)", run: async function(){
    var k = plug("KeepAwake"); if(!k) return bad("ไม่มีปลั๊กอิน KeepAwake");
    var sup = k.isSupported ? await k.isSupported() : { isSupported:true };
    await k.keepAwake(); var on = k.isKept ? await k.isKept() : { isKept:null }; await wait(1500); await k.allowSleep();
    return (on && on.isKept === false ? bad : ok)("รองรับ: " + (sup && sup.isSupported) + " · ตอนสั่งเปิด isKept = " + (on && on.isKept) + " (ปล่อยแล้ว)");
  } });

  TESTS.push({ id:"clip", title:"คัดลอก/วางข้อความ (clipboard)", run: async function(){
    var tx = "meowrin-check-" + Date.now(), w = false, r = "";
    try{ await navigator.clipboard.writeText(tx); w = true; }catch(e){ return bad("เขียน clipboard ไม่ได้: " + errText(e)); }
    try{ r = await navigator.clipboard.readText(); }catch(e){ return info("เขียนได้ แต่อ่านไม่ได้ (" + errText(e) + ") · แอพมีกล่องให้กดค้างคัดลอกสำรองอยู่แล้ว"); }
    return (r === tx ? ok : bad)("เขียน: " + w + " · อ่านกลับตรงกัน: " + (r === tx));
  } });

  TESTS.push({ id:"paste", title:"วางข้อความผ่านช่องพิมพ์ (ทางสำรองเมื่ออ่าน clipboard ไม่ได้)", desc:"คัดลอกข้อความอะไรก็ได้จากที่อื่น แล้วกดค้างช่องด้านล่างเลือก วาง จากนั้นกดทดสอบ", input:"pasteBox", ph:"กดค้างตรงนี้แล้วเลือก วาง", run: async function(){
    var v = ($("pasteBox").value || "").trim();
    return v ? ok("วางได้ " + v.length + " ตัวอักษร · ใช้ช่องพิมพ์แทนการอ่าน clipboard ตรงๆ ได้") : info("ช่องยังว่าง · วางข้อความลงช่องก่อนแล้วกดทดสอบ");
  } });

  var GIS = null;
  function gis(){
    if(GIS) return GIS;
    GIS = new Promise(function(okk, no){ if(window.google && google.accounts && google.accounts.oauth2){ okk(); return; }
      var s = document.createElement("script"); s.src = "https://accounts.google.com/gsi/client"; s.async = true;
      s.onload = function(){ okk(); }; s.onerror = function(){ GIS = null; no(new Error("โหลดสคริปต์ล็อกอิน Google ไม่ได้")); }; document.head.appendChild(s); });
    return GIS;
  }
  TESTS.push({ id:"gd", title:"ล็อกอิน Google Drive (สำรองข้อมูล)", desc:"ใส่ Client ID (อันเดียวกับที่ใช้ในเว็บแอป) แล้วกดทดสอบ · ไม่ส่งหรือเก็บ token", input:"gdClient", ph:"OAuth Client ID", run: async function(){
    var id = ($("gdClient").value || "").trim() || (MWStore.get("mw_gdrive_v1", {}) || {}).client;
    if(!id) return info("ยังไม่ได้ใส่ Client ID ในช่องด้านบน");
    await gis();
    return new Promise(function(done){
      var t = setTimeout(function(){ done(bad("ไม่มีการตอบกลับใน 60 วิ (หน้าต่างล็อกอินอาจไม่เปิด)")); }, 60000);
      try{
        google.accounts.oauth2.initTokenClient({ client_id:id, scope:"https://www.googleapis.com/auth/drive.file",
          callback:function(r){ clearTimeout(t); done(r && r.access_token ? ok("ล็อกอินได้ ได้ token (ความยาว " + r.access_token.length + ")") : bad("ไม่ได้ token: " + (r && (r.error_description || r.error) || "?"))); },
          error_callback:function(e){ clearTimeout(t); done(bad("ล็อกอินไม่ได้: " + (e && (e.type || e.message) || "?"))); } }).requestAccessToken({ prompt:"" });
      }catch(e){ clearTimeout(t); done(bad("เรียกล็อกอินไม่ได้: " + errText(e))); }
    });
  } });

  function pickFiles(){
    return new Promise(function(done){
      var inp = document.createElement("input"); inp.type = "file"; inp.accept = "video/*"; inp.multiple = true;
      inp.onchange = function(){ done(Array.prototype.slice.call(inp.files || [])); }; inp.oncancel = function(){ done([]); }; inp.click();
    });
  }
  function playTest(src, label){
    return new Promise(function(done){
      var v = $("tcVid"); v.hidden = false; v.muted = true; v.removeAttribute("src"); v.src = src; v.load();
      var t0 = Date.now(), t = setTimeout(function(){ done(bad(label + ": เปิดไม่ขึ้นใน 20 วิ")); }, 20000);
      v.onerror = function(){ clearTimeout(t); done(bad(label + ": เล่นไม่ได้ (" + (v.error && v.error.message || v.error && v.error.code || "?") + ")")); };
      v.onloadedmetadata = function(){
        var dur = v.duration, open = Date.now() - t0;
        v.currentTime = Math.min(dur / 2, dur - 1 > 0 ? dur / 2 : 0);
        var p = v.play(); if(p && p.catch) p.catch(function(){});
        setTimeout(function(){ clearTimeout(t); var moved = v.currentTime; v.pause();
          done(ok(label + ": เปิดได้ใน " + open + " ms · ยาว " + dur.toFixed(1) + " วิ · กรอไปกลางคลิปแล้วเล่นต่อได้ (ถึง " + moved.toFixed(1) + " วิ)")); }, 2500);
      };
    });
  }
  TESTS.push({ id:"pick", title:"เลือกวิดีโอจากเครื่อง แล้วเล่น", desc:"เลือกวิดีโอ 1 คลิปขึ้นไป (ถ้ามีหลายอัลบั้ม ลองเลือกจากอัลบั้ม Xiaomi ด้วย) · วัดว่าเลือกได้กี่ไฟล์และเล่น/กรอได้ไหม", run: async function(){
    var fl = await pickFiles(); if(!fl.length) return info("ไม่ได้เลือกไฟล์");
    var tot = fl.reduce(function(a, f){ return a + f.size; }, 0);
    var r = await playTest(URL.createObjectURL(fl[0]), "คลิปแรก (" + fl[0].name + " · " + mb(fl[0].size) + ")");
    return { s:r.s, t:"เลือกได้ " + fl.length + " ไฟล์ รวม " + mb(tot) + "\n" + r.t };
  } });

  async function askMedia(){ /* คืน { t:ข้อความบอกผลสิทธิ์, albums:รายการอัลบั้ม } */
    var m = plug("Media"); if(!m) return { t:"สิทธิ์ดูรูป/วิดีโอ: ไม่มีปลั๊กอิน Media", albums:[] };
    try{ var a = (await m.getAlbums()).albums || []; return { t:"สิทธิ์ดูรูป/วิดีโอ: ได้ (พบ " + a.length + " อัลบั้ม)", albums:a }; }
    catch(e){ return { t:"สิทธิ์ดูรูป/วิดีโอ: ไม่ได้ (" + errText(e) + ")", albums:[] }; }
  } /* ติดตั้งใหม่ยังไม่มีสิทธิ์ดูวิดีโอ → อ่านโฟลเดอร์ได้ 0 ไฟล์ · เรียกก่อนอ่านโฟลเดอร์ทุกครั้ง (มีสิทธิ์แล้ว = ไม่ถามซ้ำ) */
  var VEXT = /\.(mp4|mov|m4v|mkv|webm|3gp)$/i;
  /* อ่านโฟลเดอร์ด้วย Filesystem แล้วลองเล่นวิดีโอคลิปแรก · abs = ที่อยู่เต็ม (/storage/...) ไม่งั้นนับจากที่เก็บของเครื่อง */
  async function probeFolder(fs, p, abs){
    function rd(path){ return abs ? fs.readdir({ path:path }) : fs.readdir({ path:path, directory:"EXTERNAL_STORAGE" }); }
    await askMedia();
    var out = [], t0 = Date.now(), r;
    try{ r = await rd(p); }catch(e){ return bad("อ่านโฟลเดอร์ " + p + " ไม่ได้: " + errText(e)); }
    var fl = r.files || [], dirs = fl.filter(function(f){ return f.type === "directory"; }), vids = fl.filter(function(f){ return f.type !== "directory" && VEXT.test(f.name); });
    out.push("โฟลเดอร์ " + p + ": " + fl.length + " รายการ (โฟลเดอร์ย่อย " + dirs.length + ", วิดีโอ " + vids.length + ") · อ่านใช้ " + (Date.now() - t0) + " ms");
    if(!vids.length && dirs.length){
      out.push("โฟลเดอร์ย่อย: " + dirs.slice(0, 12).map(function(d){ return d.name; }).join(", "));
      for(var i = 0; i < dirs.length && !vids.length; i++){
        try{ var t1 = Date.now(), r2 = await rd(p + "/" + dirs[i].name);
          vids = (r2.files || []).filter(function(f){ return f.type !== "directory" && VEXT.test(f.name); });
          if(vids.length){ p = p + "/" + dirs[i].name; out.push("ลงไปดูใน " + dirs[i].name + ": วิดีโอ " + vids.length + " ไฟล์ · อ่านใช้ " + (Date.now() - t1) + " ms"); } }catch(e){}
      }
    }
    if(!vids.length) return bad(out.join("\n") + "\nไม่เจอวิดีโอ (นามสกุล mp4/mov/m4v/mkv/webm/3gp)" + (fl.length ? "" : " · โฟลเดอร์ว่างทั้งที่มีอยู่จริง มักแปลว่ายังไม่ได้อนุญาตให้แอพดูรูปและวิดีโอ (ตั้งค่ามือถือ > แอป > Meowrin > สิทธิ์)"));
    var tot = vids.reduce(function(a, f){ return a + (f.size || 0); }, 0), v = vids[0], uri = v.uri;
    out.push("วิดีโอ " + vids.length + " ไฟล์ รวม " + (tot >= 1073741824 ? gb(tot) : mb(tot)) + " · ตัวอย่าง: " + vids.slice(0, 5).map(function(f){ return f.name + " (" + mb(f.size || 0) + ")"; }).join(", "));
    if(!uri){ try{ uri = (await (abs ? fs.getUri({ path:p + "/" + v.name }) : fs.getUri({ path:p + "/" + v.name, directory:"EXTERNAL_STORAGE" }))).uri; }catch(e){ return bad(out.join("\n") + "\nขอที่อยู่ไฟล์ไม่ได้: " + errText(e)); } }
    out.push("ที่อยู่ไฟล์: " + uri);
    var enc = uri.replace(/^file:\/\//, "").split("/").map(encodeURIComponent).join("/");
    var tries = [["convertFileSrc", cap() && cap().convertFileSrc ? cap().convertFileSrc(uri) : uri], ["https://localhost/_capacitor_file_", "https://localhost/_capacitor_file_" + enc], ["http://localhost/_capacitor_file_", "http://localhost/_capacitor_file_" + enc]], pr;
    for(var t = 0; t < tries.length; t++){
      pr = await playTest(tries[t][1], "เล่น " + v.name + " ผ่าน " + tries[t][0]); out.push(pr.t);
      if(pr.s === "ok") break;
    }
    return { s:pr.s, t:out.join("\n") };
  }

  TESTS.push({ id:"media", title:"ขอสิทธิ์ดูวิดีโอ + หาอัลบั้มจากชื่อ แล้วเล่นจากโฟลเดอร์ — สำคัญที่สุด", desc:"ครั้งแรกจะมีหน้าต่างขออนุญาตดูรูปและวิดีโอ ให้กดอนุญาต · เว้นช่องว่างไว้ = ดูรายชื่ออัลบั้มทั้งหมด · พิมพ์ชื่ออัลบั้ม (เช่น luffy) = หาโฟลเดอร์ของอัลบั้มนั้นแล้วลองเล่นคลิปแรก", input:"mediaAlbum", ph:"ชื่ออัลบั้ม (เว้นว่างเพื่อดูรายชื่อ)", run: async function(){
    var m = plug("Media"), fs = plug("Filesystem"); if(!m || !fs) return bad("ไม่มีปลั๊กอิน " + (!m ? "Media " : "") + (!fs ? "Filesystem" : ""));
    var want = ($("mediaAlbum").value || "").trim(), albums;
    try{ albums = (await m.getAlbums()).albums || []; }catch(e){ return bad("ขอสิทธิ์/อ่านรายชื่ออัลบั้มไม่ได้: " + errText(e) + "\n(ถ้าเคยกดไม่อนุญาต ให้ไปเปิดที่ ตั้งค่ามือถือ > แอป > Meowrin > สิทธิ์ แล้วลองใหม่)"); }
    var head = "พบอัลบั้ม " + albums.length + " อัน";
    if(!want) return info(head + "\n" + albums.slice(0, 60).map(function(a){ return "- " + a.name + "  →  " + a.identifier; }).join("\n") + "\n\nพิมพ์ชื่ออัลบั้มในช่องแล้วกดทดสอบอีกครั้งเพื่อลองเล่นคลิป");
    var hit = albums.filter(function(a){ return (a.name || "").toLowerCase().indexOf(want.toLowerCase()) >= 0; });
    if(!hit.length) return bad(head + "\nไม่เจออัลบั้มที่ชื่อมี \"" + want + "\"" + (albums.length ? "" : " · ได้ 0 อัน มักแปลว่ายังไม่ได้อนุญาตสิทธิ์ดูรูป/วิดีโอ"));
    var a0 = hit.filter(function(a){ return a.name === want; })[0] || hit[0];
    var r = await probeFolder(fs, a0.identifier, true);
    return { s:r.s, t:head + " · ชื่อที่ตรง: " + hit.map(function(a){ return a.name; }).join(", ") + "\nใช้อัลบั้ม \"" + a0.name + "\" → " + a0.identifier + "\n" + r.t };
  } });

  TESTS.push({ id:"fsdir", title:"อ่านโฟลเดอร์ตามที่อยู่ที่พิมพ์เอง (Filesystem)", desc:"พิมพ์ที่อยู่ เช่น Pictures/Gallery/owner/ชื่ออัลบั้ม (นับจากที่เก็บของเครื่อง) หรือที่อยู่เต็มขึ้นต้นด้วย /storage/ · วิธีสำรองถ้าข้อบนหาอัลบั้มไม่เจอ", input:"fsPath", ph:"เช่น Pictures/Gallery/owner/ชื่ออัลบั้ม", run: async function(){
    var fs = plug("Filesystem"); if(!fs) return bad("ไม่มีปลั๊กอิน Filesystem");
    var raw = ($("fsPath").value || "").trim() || "Pictures/Gallery/owner", abs = /^(\/|file:)/.test(raw), p = abs ? raw.replace(/\/+$/, "") : raw.replace(/^\/+|\/+$/g, "");
    return probeFolder(fs, p, abs);
  } });

  TESTS.push({ id:"export", title:"ส่งออกวิดีโอเร็ว: ต่อคลิปจริงจากมือถือ (ตัวตัดต่อใหม่) — สำคัญ", desc:"ดึงวิดีโอ 5 ไฟล์แรกในอัลบั้มที่พิมพ์ (เช่น Pictures/Gallery/owner/luffy) มาต่อกัน ช็อตละ 3 วิ ส่งออกเป็น mp4 แนวตั้ง 1080x1920 แล้ววัดความเร็ว · ยังไม่มีเสียง · ไฟล์เซฟที่ Documents/Meowrin/meowrin-export-test.mp4 เปิดดูว่าภาพต่อกันถูกไหม", input:"expPath", ph:"Pictures/Gallery/owner/luffy", run: async function(){
    var fs = plug("Filesystem"); if(!fs) return bad("ไม่มีปลั๊กอิน Filesystem (ต้องอยู่ในแอพ)");
    var perm = await askMedia();
    var el = ui.export.out, p = ($("expPath").value || "").trim().replace(/^\/+|\/+$/g, "") || "Pictures/Gallery/owner/luffy", out = [perm.t], r;
    function pick(x){ return (x.files || []).filter(function(f){ return f.type !== "directory" && VEXT.test(f.name) && f.uri; }); }
    try{ r = await fs.readdir({ path:p, directory:"EXTERNAL_STORAGE" }); }catch(e){ return bad(out.join("\n") + "\nอ่านโฟลเดอร์ " + p + " ไม่ได้: " + errText(e)); }
    var vids = pick(r); out.push("อ่านด้วยที่อยู่สั้น " + p + ": " + (r.files || []).length + " รายการ (วิดีโอ " + vids.length + ")");
    if(vids.length < 2){ /* ลองที่อยู่เต็มของอัลบั้มชื่อเดียวกัน (ที่ได้จาก Media) */
      var nm = p.split("/").pop(), al = perm.albums.filter(function(a){ return a.name === nm; })[0];
      if(al){ try{ r = await fs.readdir({ path:al.identifier }); vids = pick(r); out.push("อ่านด้วยที่อยู่เต็ม " + al.identifier + ": " + (r.files || []).length + " รายการ (วิดีโอ " + vids.length + ")"); }catch(e){ out.push("อ่านด้วยที่อยู่เต็มไม่ได้: " + errText(e)); } }
      else out.push("ไม่เจออัลบั้มชื่อ \"" + nm + "\" ในรายการอัลบั้ม");
    }
    vids = vids.slice(0, 5);
    if(vids.length < 2) return bad(out.join("\n") + "\nมีวิดีโอไม่ถึง 2 ไฟล์ (เจอ " + vids.length + ")");
    var urls = vids.map(function(v){ return MWLocal.fileUrl(v.uri); });
    out.push("ใช้วิดีโอ " + vids.length + " ไฟล์: " + vids.map(function(v){ return v.name + " (" + mb(v.size || 0) + ")"; }).join(", "));
    try{ var pr0 = await fetch(urls[0], { headers:{ Range:"bytes=0-1023" } }); out.push("อ่านไฟล์ด้วย fetch ข้ามโดเมน: HTTP " + pr0.status + " ได้ " + (await pr0.arrayBuffer()).byteLength + " ไบต์ (รองรับ Range: " + (pr0.status === 206) + ")"); }
    catch(e){ return bad(out.join("\n") + "\nอ่านไฟล์ผ่าน fetch ไม่ได้ (น่าจะติด CORS ข้ามโดเมนในโหมด live): " + errText(e)); }
    var res;
    try{
      var mod = await import("./exporter.js");
      res = await mod.exportShots({ shots:urls.map(function(u){ return { url:u, start:0.5, dur:3 }; }), width:1080, height:1920, fps:30,
        onLog:function(t){ out.push(t); }, onProgress:function(x){ el.textContent = out.join("\n") + "\nกำลังส่งออก " + Math.round(x * 100) + "%"; } });
    }catch(e){ return bad(out.join("\n") + "\nส่งออกไม่สำเร็จ: " + errText(e)); }
    out.push("ส่งออกเสร็จ: ยาว " + res.seconds.toFixed(1) + " วิ · " + res.frames + " เฟรม · ใช้เวลา " + (res.ms / 1000).toFixed(1) + " วิ · เร็วกว่าเวลาจริง " + (res.seconds * 1000 / res.ms).toFixed(1) + " เท่า · ไฟล์ " + mb(res.blob.size));
    try{ var sv = await MWNative.save(res.blob, "meowrin-export-test.mp4"); out.push("เซฟแล้วที่ " + sv.path); }catch(e){ out.push("เซฟไม่ได้: " + errText(e)); }
    var pr = await playTest(URL.createObjectURL(res.blob), "เล่นไฟล์ที่ส่งออก"); out.push(pr.t);
    return ask(out.join("\n") + "\nเปิดไฟล์ดู: ภาพ 5 ช็อตต่อกันถูกต้อง ไม่ค้าง ไม่เพี้ยนไหม");
  } });

  /* ---------------- วาดหน้า ---------------- */
  var LABEL = { ok:"ได้", bad:"ไม่ได้", info:"ข้อมูล", ask:"รอคุณตอบ", run:"กำลังทดสอบ", idle:"ยังไม่ได้ลอง" };
  function render(t){
    var r = res[t.id] || { s:"idle", t:"" }, c = ui[t.id];
    c.card.dataset.s = r.s; c.tag.textContent = LABEL[r.s] || r.s; c.out.textContent = r.t || "";
    c.ans.hidden = r.s !== "ask"; c.btn.disabled = r.s === "run";
  }
  function setRes(t, r){ res[t.id] = r; render(t); }
  async function runOne(t){
    setRes(t, { s:"run", t:"" });
    var card = ui[t.id].card; if($("tcVid") && t.id !== "pick" && t.id !== "media" && t.id !== "fsdir" && t.id !== "export") $("tcVid").hidden = true; else card.appendChild($("tcVid"));
    try{ setRes(t, await t.run()); }catch(e){ setRes(t, bad("พังกลางทาง: " + errText(e))); }
  }
  function build(){
    var box = $("list");
    TESTS.forEach(function(t){
      var card = document.createElement("div"); card.className = "tc";
      card.innerHTML = '<div class="tc-h"><h3>' + esc(t.title) + '</h3><span class="tag"></span></div>' + (t.desc ? '<p class="tc-d">' + esc(t.desc) + '</p>' : "")
        + (t.input ? '<input type="text" id="' + t.input + '" placeholder="' + esc(t.ph || "") + '" autocomplete="off">' : "")
        + '<div class="tc-r"></div><div class="tc-b"><button class="btn small" type="button">ทดสอบ</button></div>'
        + '<div class="tc-b" hidden><button class="btn small" data-a="ok" type="button">ได้ผลตามนั้น</button><button class="btn small ghost" data-a="bad" type="button">ไม่ได้ผล</button></div>';
      box.appendChild(card);
      var bs = card.querySelectorAll(".tc-b");
      ui[t.id] = { card:card, tag:card.querySelector(".tag"), out:card.querySelector(".tc-r"), btn:bs[0].querySelector("button"), ans:bs[1] };
      ui[t.id].btn.addEventListener("click", function(){ runOne(t); });
      bs[1].addEventListener("click", function(e){ var a = e.target.dataset && e.target.dataset.a; if(!a) return; var o = res[t.id].t; setRes(t, { s:a, t:o + "\nคุณตอบ: " + (a === "ok" ? "ได้ผล" : "ไม่ได้ผล") }); });
      render(t);
    });
  }
  function report(){
    var L = ["ผลตรวจระบบ Meowrin · " + new Date().toLocaleString("th-TH")];
    TESTS.forEach(function(t){ var r = res[t.id] || { s:"idle", t:"" }; L.push("", "[" + (LABEL[r.s] || r.s) + "] " + t.title + (r.t ? "\n" + r.t : "")); });
    return L.join("\n");
  }
  $("runAuto").addEventListener("click", async function(){ var b = this; b.disabled = true; for(var i = 0; i < TESTS.length; i++) if(TESTS[i].auto) await runOne(TESTS[i]); b.disabled = false; });
  $("copyAll").addEventListener("click", async function(){
    var tx = report();
    try{ await navigator.clipboard.writeText(tx); this.textContent = "คัดลอกแล้ว"; var b = this; setTimeout(function(){ b.textContent = "คัดลอกผลทั้งหมด"; }, 2000); }
    catch(e){ if(window.MWDialog) MWDialog.copy(tx); }
  });
  build();
  gis().catch(function(){});
})();
