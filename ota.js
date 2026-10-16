/* ota.js (window.MWOta) — อัปเดตโค้ดแอพตัวเองจาก GitHub Pages (เฉพาะแอพ APK ที่หน้าอยู่ที่ https://localhost)
   วิธี: เช็ก files.json บน Pages (รายการไฟล์+sha1) เทียบกับ files.json ของชุดไฟล์ที่กำลังใช้ → ถ้าต่าง ดาวน์โหลดไฟล์ทั้งหมดลง
   โฟลเดอร์ในมือถือ (Filesystem DATA/ota/<id>) ตรวจ sha1 ทุกไฟล์ → WebView.setServerBasePath ให้ตัวช่วยของแอพเสิร์ฟจากโฟลเดอร์นั้นแทนไฟล์ที่ห่อมากับ APK
   หน้าแอพยังอยู่ที่ https://localhost (อ่านไฟล์วิดีโอ/วาด canvas ได้ ไม่ติด CORS) และใช้ออฟไลน์ได้ · เปลี่ยนชุดไฟล์ = หน้าโหลดใหม่ทันที
   ความปลอดภัย: จำชุดไฟล์ใหม่ (persistServerBasePath) ต่อเมื่อบูตสำเร็จ (แอพเริ่มทำงาน window.MW) ถ้าพัง ครั้งต่อไปกลับไปใช้ชุดเดิมเอง
   ตัวกันพลาด: จำชุดที่ต้องการไว้ใน localStorage (ota_state_v1) ถ้าเปิดแอพมาแล้วยังเป็นชุดที่ห่อมากับ APK แต่ชุดใหม่ดาวน์โหลดไว้แล้ว = สลับให้เองตอนเปิด (ลองได้ 2 รอบ ไม่สำเร็จเลิก กันวนลูป)
   · ติดตั้ง APK ตัวใหม่ (versionCode เปลี่ยน) = Capacitor ทิ้งชุดที่จำไว้ กลับไปใช้ไฟล์ที่ห่อมากับ APK · ไม่ได้อยู่ในแอพ = ไม่ทำอะไร */
(function(){
  "use strict";
  var REMOTE = "https://hxyhan2006-code.github.io/Meowrin-apk/", DIR = "ota", KEY = "ota_state_v1", LOCAL = null, st = { remote:null, ready:null }, PATH = "";
  function meta(){ try{ return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; }catch(e){ return {}; } }
  function saveMeta(m){ try{ localStorage.setItem(KEY, JSON.stringify(m)); }catch(e){} }
  function note(m, text){ m.log = text; saveMeta(m); }
  function cap(){ return window.Capacitor || null; }
  function plug(n){ var c = cap(); return c && c.isNativePlatform && c.isNativePlatform() && c.Plugins && c.Plugins[n] && (!c.isPluginAvailable || c.isPluginAvailable(n)) ? c.Plugins[n] : null; }
  function usable(){ return location.hostname === "localhost" && !!plug("WebView") && !!plug("Filesystem"); }
  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]; }); }
  async function sha1(buf){ return Array.prototype.map.call(new Uint8Array(await crypto.subtle.digest("SHA-1", buf)), function(b){ return ("0" + b.toString(16)).slice(-2); }).join(""); }
  function b64(blob){ return new Promise(function(ok, no){ var r = new FileReader(); r.onload = function(){ var s = String(r.result); ok(s.slice(s.indexOf(",") + 1)); }; r.onerror = function(){ no(r.error); }; r.readAsDataURL(blob); }); }
  async function getRemote(path){ var r = await fetch(REMOTE + path + (path.indexOf("?") < 0 ? "?" : "&") + "t=" + Date.now(), { cache:"no-store" }); if(!r.ok) throw new Error(path + ": HTTP " + r.status); return r; }
  async function localManifest(){
    if(LOCAL) return LOCAL;
    try{ LOCAL = await (await fetch("files.json", { cache:"no-store" })).json(); }catch(e){ LOCAL = { id:"", version:window.MW_VERSION || "" }; }
    return LOCAL;
  }
  async function check(){
    var l = await localManifest(), r = await (await getRemote("files.json")).json(); st.remote = r;
    return { update: !!r.id && r.id !== l.id, local:l, remote:r };
  }
  async function cleanOld(keep){ /* ลบโฟลเดอร์ชุดไฟล์ทั้งหมดใต้ ota/ ยกเว้นชุดที่กำลังใช้ (keep = ชื่อโฟลเดอร์) */
    var fs = plug("Filesystem");
    try{ var list = (await fs.readdir({ path:DIR, directory:"DATA" })).files || [];
      for(var i = 0; i < list.length; i++){ var n = typeof list[i] === "string" ? list[i] : list[i].name; if(n && n !== keep) await fs.rmdir({ path:DIR + "/" + n, directory:"DATA", recursive:true }).catch(function(){}); } }catch(e){}
  }
  async function download(onProgress){ /* ดาวน์โหลดชุดไฟล์ใหม่ลงโฟลเดอร์ (ยังไม่สลับ) · ตรวจ sha1 ทุกไฟล์ ผิดแม้ไฟล์เดียว = ยกเลิกทั้งชุด */
    var fs = plug("Filesystem"), r = st.remote || (await check()).remote, m = meta();
    if(m.ready && m.ready.id === r.id){ try{ await fs.stat({ path:m.ready.dir + "/files.json", directory:"DATA" }); st.ready = m.ready; return st.ready; }catch(e){} } /* โหลดครบไว้แล้ว (files.json เขียนเป็นไฟล์สุดท้าย) */
    var cur = (PATH || (await curPath())).split("/").pop(); await cleanOld(PATH.indexOf("/" + DIR + "/") >= 0 ? cur : "");
    var dir = DIR + "/" + r.id.slice(0, 12) + "-" + Date.now().toString(36); /* ชื่อไม่ซ้ำทุกรอบ ไม่ชนของค้าง */
    var q = r.files.slice(), done = 0, fail = null, chain = Promise.resolve();
    function serial(fn){ var p = chain.then(fn); chain = p.catch(function(){}); return p; } /* เขียนไฟล์ทีละไฟล์ (เขียนขนานทำให้สร้างโฟลเดอร์แย่งกัน) */
    async function worker(){ /* ดึงจากเว็บ+ตรวจ sha1 ขนานกันได้ */
      while(q.length && !fail){
        var f = q.shift();
        try{
          var buf = await (await getRemote(f.p + "?v=" + r.id.slice(0, 8))).arrayBuffer();
          if((await sha1(buf)) !== f.h) throw new Error("ไฟล์ " + f.p + " ไม่ตรงกับรายการ (sha1 ผิด)");
          var data = await b64(new Blob([buf]));
          await serial(function(){ return fs.writeFile({ path:dir + "/" + f.p, data:data, directory:"DATA", recursive:true }); });
          done++; if(onProgress) onProgress(done / r.files.length);
        }catch(e){ fail = e; }
      }
    }
    await Promise.all([worker(), worker(), worker(), worker()]);
    if(fail){ try{ await fs.rmdir({ path:dir, directory:"DATA", recursive:true }); }catch(e){} throw fail; }
    await fs.writeFile({ path:dir + "/files.json", data:await b64(new Blob([JSON.stringify(r) + "\n"])), directory:"DATA", recursive:true });
    st.ready = { id:r.id, dir:dir, version:r.version }; m = meta(); m.ready = st.ready; saveMeta(m); return st.ready;
  }
  async function apply(){ /* สลับไปใช้ชุดไฟล์ที่ดาวน์โหลดไว้ · หน้าโหลดใหม่ทันที */
    if(!st.ready) throw new Error("ยังไม่ได้ดาวน์โหลดชุดไฟล์ใหม่");
    var u = (await plug("Filesystem").getUri({ path:st.ready.dir, directory:"DATA" })).uri.replace(/^file:\/\//, ""), m = meta();
    m.wanted = { id:st.ready.id, dir:st.ready.dir, version:st.ready.version }; m.tries = 0; note(m, "สลับไปชุด " + st.ready.id.slice(0, 8));
    await plug("WebView").setServerBasePath({ path:u });
  }
  async function curPath(){ try{ return ((await plug("WebView").getServerBasePath()) || {}).path || ""; }catch(e){ return ""; } }
  async function early(){ /* เปิดแอพมาแล้วยังเป็นชุดที่ห่อมากับ APK แต่เคยดาวน์โหลดชุดใหม่ไว้ (จำไม่ติด) → สลับให้เอง */
    if(!usable()) return;
    PATH = await curPath(); if(PATH.indexOf("/" + DIR + "/") >= 0) return;
    var m = meta(); if(!m.wanted) return;
    if((m.tries || 0) >= 2){ m.wanted = null; note(m, "สลับตอนเปิดแอพไม่สำเร็จ 2 รอบ เลิกใช้ชุดที่ดาวน์โหลด"); return; }
    try{ await plug("Filesystem").stat({ path:m.wanted.dir + "/files.json", directory:"DATA" }); }catch(e){ m.wanted = null; note(m, "ไม่เจอโฟลเดอร์ชุดที่ดาวน์โหลดไว้"); return; }
    m.tries = (m.tries || 0) + 1; note(m, "สลับตอนเปิดแอพ รอบที่ " + m.tries);
    var u = (await plug("Filesystem").getUri({ path:m.wanted.dir, directory:"DATA" })).uri.replace(/^file:\/\//, "");
    await plug("WebView").setServerBasePath({ path:u });
  }
  async function bootOk(){ /* ชุดไฟล์จากโฟลเดอร์ OTA บูตสำเร็จ → จำไว้ใช้ครั้งต่อไป + ลบชุดเก่า */
    if(!usable() || !window.MW) return;
    var wv = plug("WebView"), fs = plug("Filesystem"), p = await curPath(); PATH = p;
    if(p.indexOf("/" + DIR + "/") < 0) return; /* ยังใช้ไฟล์ที่ห่อมากับ APK */
    var m = meta(), id = p.split("/").pop();
    m.wanted = { id:id, dir:DIR + "/" + id, version:(LOCAL || {}).version }; saveMeta(m); /* ชุดที่บูตผ่านแล้ว = ชุดที่ต้องใช้ (ถ้า persist ไม่ติด early() จะสลับให้ตอนเปิดแอพ) */
    if(m.persisted !== p){
      try{ await wv.persistServerBasePath(); m.persisted = p; m.tries = 0; note(m, "บูตจากชุด " + id.slice(0, 8) + " สำเร็จ จำไว้แล้ว"); }
      catch(e){ note(m, "จำชุดไม่สำเร็จ: " + (e && e.message || e)); return; }
    }
    await cleanOld(p.split("/").pop()); render();
  }

  /* ---------- ส่วนหน้าจอ ---------- */
  function bar(text, onTap){
    var el = document.getElementById("otaBar"); if(!el){ el = document.createElement("button"); el.id = "otaBar"; el.type = "button"; el.className = "ota-bar"; document.body.appendChild(el); }
    el.textContent = text; el.onclick = onTap; el.hidden = false;
  }
  function render(msg, bad){
    var info = document.getElementById("otaInfo"), row = document.getElementById("otaRow"); if(!info) return;
    row.hidden = !usable();
    var l = LOCAL || {}, m = meta(); info.className = "hint" + (bad ? " bad" : "");
    info.textContent = msg || ("ชุดไฟล์ที่ใช้: v" + (l.version || window.MW_VERSION || "?") + (l.id ? " (" + l.id.slice(0, 8) + ")" : "") + " · " + (PATH.indexOf("/" + DIR + "/") >= 0 ? "จากโฟลเดอร์ที่ดาวน์โหลด" : "จากไฟล์ที่ห่อมากับ APK") + (m.persisted ? " · จำไว้แล้ว" : "") + (m.log ? " · " + m.log : ""));
  }
  async function manual(){
    var btn = document.getElementById("otaBtn"); btn.disabled = true;
    try{
      render("กำลังเช็กเวอร์ชัน...");
      var r = await check();
      if(!r.update){ render("เป็นเวอร์ชันล่าสุดแล้ว (v" + (r.local.version || "?") + ")"); return; }
      await download(function(p){ render("กำลังดาวน์โหลด v" + r.remote.version + "... " + Math.round(p * 100) + "%"); });
      render("ดาวน์โหลดแล้ว กำลังเปิดใหม่..."); await apply();
    }catch(e){ render("อัปเดตไม่ได้: " + (e && e.message || e), true); }
    finally{ btn.disabled = false; }
  }
  async function auto(){ /* เช็กเงียบๆ ตอนเปิดแอพ: มีของใหม่ = โหลดรอไว้ แล้วขึ้นแถบให้แตะเพื่อสลับ (ไม่สลับเองกลางการใช้งาน) */
    try{
      var r = await check(); if(!r.update) return;
      await download();
      bar("มีเวอร์ชันใหม่ v" + r.remote.version + " พร้อมแล้ว · แตะเพื่ออัปเดต", function(){ this.textContent = "กำลังเปิดใหม่..."; apply().catch(function(e){ bar("อัปเดตไม่ได้: " + (e && e.message || e), function(){ this.hidden = true; }); }); });
    }catch(e){ /* ไม่มีเน็ต/เว็บล่ม = ใช้ชุดเดิมต่อ */ }
  }
  window.MWOta = { usable:usable, check:check, download:download, apply:apply, bootOk:bootOk, early:early };
  early().catch(function(){}); /* รันทันทีที่โหลดสคริปต์ (ไม่รอ load) จะได้สลับก่อนผู้ใช้เห็นหน้า */
  function init(){
    localManifest().then(function(){ return usable() ? curPath() : ""; }).then(function(p){ PATH = p; render(); });
    var b = document.getElementById("otaBtn"); if(b) b.addEventListener("click", manual);
    if(!usable()) return;
    setTimeout(function(){ bootOk().catch(function(){}); }, 700); /* จำชุดไฟล์ให้เร็ว (ผู้ใช้ปิดแอพเร็วก็ยังจำทัน) */
    setTimeout(function(){ bootOk().catch(function(){}); }, 4000); /* รอบสำรอง เผื่อรอบแรกแอพยังบูตไม่เสร็จ */
    setTimeout(auto, 5000);
  }
  if(document.readyState === "complete") init(); else window.addEventListener("load", init);
})();
