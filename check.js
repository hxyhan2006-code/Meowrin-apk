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


  /* --- ต้องแตะเอง --- */









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
    var card = ui[t.id].card; if($("tcVid") && t.id !== "media") $("tcVid").hidden = true; else card.appendChild($("tcVid"));
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
})();
