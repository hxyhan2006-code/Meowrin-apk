/* footage-album.js — แท็บ "อัลบั้ม" (หน้าตาแบบแอพแกลเลอรี): ตารางอัลบั้ม → ตารางคลิปในอัลบั้ม → ตัวเล่นเต็มจอ
   แหล่งรายการ: ไฟล์ในมือถือที่ MWLocal สแกน (เฉพาะโฟลเดอร์ Pictures/Gallery/owner) + คลิปในดัชนี (ใช้ปก/ความยาวที่ทำไว้แล้ว) จับคู่ด้วย ชื่อ|ขนาด
   ภาพย่อ: สร้างจากเฟรมของไฟล์เอง 600px ตอนเลื่อนมาถึง (ทีละ 2 ไฟล์) เก็บใน IndexedDB mw_thumbs_v1 (เปิดครั้งถัดไปไม่ต้องสร้างใหม่) · ไม่มีไฟล์ในมือถือค่อยใช้ปกของดัชนี (240px)
   ปุ่มย้อนกลับของมือถือ: เปิดอัลบั้ม/ตัวเล่น = pushState → ย้อนแล้วปิดชั้นบนสุด (ไม่เด้งออกจากหน้า) */
(function(){
  "use strict";
  var FT = window.FT, U = FT && FT.ui; if(!U) return;
  var $ = function(id){ return document.getElementById(id); };
  var ROOT = "/Gallery/owner/"; /* อัลบั้มวันพีซอยู่ใต้ Pictures/Gallery/owner/ (อัลบั้มอื่นในมือถือไม่โชว์) */
  var albums = [], curAlbum = null, urls = {}; /* urls = key → blob URL ของภาพย่อ (ในหน่วยความจำ) */

  /* ---------- รายการ ---------- */
  var MISSING = "ไม่เจอในมือถือ"; /* คลิปที่มีในดัชนีแต่หาไฟล์ในมือถือไม่เจอ (ถูกย้าย/ลบ/ชื่อต่าง) แยกเป็นอัลบั้มของมันเอง ไม่ปนกับอัลบั้มจริง */
  function build(){
    var byKey = {}, other = {}, out = [], loc = window.MWLocal && MWLocal.list ? MWLocal.list() : [];
    loc.forEach(function(f){
      var e = { k:f.name + "|" + f.size, name:f.name, size:f.size, mtime:f.mtime, album:f.album, uri:f.uri, c:null };
      if(f.dir.indexOf(ROOT) < 0){ other[e.k] = e; return; } /* ไฟล์นอกโฟลเดอร์หลัก: โชว์เฉพาะที่อยู่ในดัชนี */
      byKey[e.k] = e; out.push(e);
    });
    U.lib().forEach(function(c){
      var k = c.name + "|" + c.size, e = byKey[k] || other[k];
      if(e){ e.c = c; if(!byKey[k]){ byKey[k] = e; out.push(e); } }
      else out.push({ k:k, name:c.name, size:c.size, album:loc.length ? MISSING : (c.album || "ไม่ระบุ"), uri:null, c:c });
    });
    var g = {};
    out.forEach(function(e){ (g[e.album] = g[e.album] || []).push(e); });
    albums = Object.keys(g).map(function(n){ var it = g[n].sort(function(a, b){ return a.name < b.name ? -1 : 1; }); return { name:n, items:it }; })
      .sort(function(a, b){ return b.items.length - a.items.length; });
  }
  function done(e){ return !!(e.c && e.c.status === "done"); } /* AI ทำดัชนีคลิปนี้แล้ว */
  function fileUrl(e){ try{ return e.uri && window.MWLocal ? MWLocal.fileUrl(e.uri) : null; }catch(err){ return null; } }
  function dur(e, t){ var d = e.c && e.c.duration || t && t.d; if(!d) return ""; d = Math.round(d); return Math.floor(d / 60) + ":" + String(d % 60).padStart(2, "0"); }
  function esc(s){ return U.esc(String(s)); }
  function scanning(){ return !!(window.MWLocal && MWLocal.scanning && MWLocal.scanning()); }

  /* ---------- ภาพย่อ (แคชใน IndexedDB) ---------- */
  var db = null;
  function idb(){ return db || (db = new Promise(function(ok){ try{ var r = indexedDB.open("mw_thumbs_v1", 1); r.onupgradeneeded = function(){ r.result.createObjectStore("t", { keyPath:"k" }); }; r.onsuccess = function(){ ok(r.result); }; r.onerror = function(){ ok(null); }; }catch(e){ ok(null); } })); }
  async function dbGet(k){ var d = await idb(); return d ? new Promise(function(ok){ var q = d.transaction("t").objectStore("t").get(k); q.onsuccess = function(){ ok(q.result || null); }; q.onerror = function(){ ok(null); }; }) : null; }
  async function dbPut(rec){ var d = await idb(); if(d) try{ d.transaction("t", "readwrite").objectStore("t").put(rec); }catch(e){} }
  function gen(url){ /* เฟรมกลางๆ ของคลิป → { d:ความยาว, b:JPEG } หรือ null ถ้าเปิดไม่ได้ */
    return new Promise(function(ok){
      var v = document.createElement("video"), done = false, t;
      function fin(r){ if(done) return; done = true; clearTimeout(t); try{ v.removeAttribute("src"); v.load(); }catch(e){} ok(r); }
      t = setTimeout(function(){ fin(null); }, 12000);
      v.muted = true; v.playsInline = true; v.preload = "auto";
      v.onerror = function(){ fin(null); };
      v.onloadedmetadata = function(){ v.currentTime = Math.min(1, (v.duration || 2) / 2); };
      v.onseeked = function(){
        var w = 600, h = Math.round(w * (v.videoHeight || 1) / (v.videoWidth || 1)), c = document.createElement("canvas"); c.width = w; c.height = h;
        try{ c.getContext("2d").drawImage(v, 0, 0, w, h); c.toBlob(function(b){ fin(b ? { d:v.duration, b:b } : null); }, "image/jpeg", 0.82); }catch(e){ fin(null); }
      };
      v.src = url;
    });
  }
  var queue = [], running = 0;
  function pump(){ while(running < 2 && queue.length){ var j = queue.shift(); running++; work(j.e).then(function(j){ return function(r){ running--; j.ok(r); pump(); }; }(j)); } }
  async function work(e){
    var rec = await dbGet("t2:" + e.k); /* t2 = ภาพย่อ 600px (รุ่นเก่า 240px ไม่ใช้แล้ว) */
    if(!rec){ var u = fileUrl(e); if(!u) return null; var g = await gen(u); if(!g) return null; rec = { k:"t2:" + e.k, d:g.d, b:g.b }; dbPut(rec); }
    return { url:urls[e.k] || (urls[e.k] = URL.createObjectURL(rec.b)), d:rec.d };
  }
  function thumbOf(e){ return new Promise(function(ok){ queue.push({ e:e, ok:ok }); pump(); }); }
  var io = "IntersectionObserver" in window ? new IntersectionObserver(function(list){
    list.forEach(function(x){ if(!x.isIntersecting) return; io.unobserve(x.target); fill(x.target); });
  }, { rootMargin:"300px" }) : null;
  function fill(el){
    var e = el._e; if(!e) return;
    if(!e.uri && e.c && e.c.cover){ el.querySelector("img").src = e.c.cover; return; } /* ไม่มีไฟล์ในมือถือ = ใช้ปกจากดัชนี (240px ค่อนข้างเบลอ) */
    thumbOf(e).then(function(t){ if(!t || !el.isConnected) return; el.querySelector("img").src = t.url; var b = el.querySelector(".dur"); if(b && !b.textContent) b.textContent = dur(e, t); });
  }
  function watch(root, entryOf){
    root.querySelectorAll("[data-i]").forEach(function(el){ el._e = entryOf(+el.dataset.i); if(io) io.observe(el); else fill(el); });
  }

  /* ---------- หน้าจอ ---------- */
  var view = "home"; /* home | album | player */
  function renderHome(){
    build();
    var n = albums.reduce(function(a, x){ return a + x.items.length; }, 0), native = window.MWLocal && MWLocal.native && MWLocal.native();
    $("alSub").textContent = (albums.length ? albums.length + " อัลบั้ม · " + n + " คลิป" : "") + (scanning() ? (albums.length ? " · " : "") + "กำลังสแกนหาคลิปใหม่..." : "");
    $("alScan").hidden = !native;
    $("alMsg").textContent = albums.length ? "" : native ? "ยังไม่เจอคลิป · กด สแกนใหม่ (ครั้งแรกจะมีหน้าต่างขออนุญาตดูรูปและวิดีโอ ให้กดอนุญาต)" : "ใช้ปุ่มเลือกไฟล์ในแท็บ อัปโหลด เพื่อทำดัชนี แล้วคลิปจะขึ้นที่นี่";
    $("alGrid").innerHTML = albums.map(function(a, i){
      return '<button class="alt album" data-i="' + i + '" type="button"><span class="alimg"><img alt="" decoding="async"><i class="alph"></i></span><b>' + esc(a.name) + "</b><small>" + a.items.length + " คลิป" + (a.items.some(done) ? " · AI " + a.items.filter(done).length : "") + "</small></button>";
    }).join("");
    strips();
    $("alGrid").querySelectorAll("[data-i]").forEach(function(el){ el._e = albums[+el.dataset.i].items[0]; if(io) io.observe(el); else fill(el); });
  }
  function openAlbum(i){
    var a = albums[i]; if(!a) return; curAlbum = a;
    $("alvTitle").textContent = a.name; $("alvSub").textContent = a.items.length + " คลิป · AI ทำแล้ว " + a.items.filter(done).length;
    $("alvGrid").innerHTML = a.items.map(function(e, k){
      return '<button class="alt clip" data-i="' + k + '" type="button"><span class="alimg"><img alt="" decoding="async"><i class="alph"></i>' + (done(e) ? '<i class="aid" title="AI ทำดัชนีแล้ว"></i>' : "") + '<em class="dur">' + dur(e, null) + "</em></span></button>";
    }).join("");
    watch($("alvGrid"), function(k){ return a.items[k]; });
    strips(); $("alHome").hidden = true; $("alView").hidden = false; window.scrollTo(0, 0);
    if(view === "home") history.pushState({ al:1 }, ""); view = "album";
  }
  /* ---------- แถบ AI (สถานะดัชนี + ปุ่มให้ AI ทำที่เหลือ) ---------- */
  function strip(el, items, label){
    var q = U.queueInfo(), rem = items.filter(function(e){ return e.uri && !done(e); }), nDone = items.filter(done).length;
    if(q.running){ el.innerHTML = "<span>AI กำลังทำดัชนี " + q.fin + "/" + q.total + " คลิป · ใช้ไป " + U.money(q.cost) + "</span>" + (q.paused ? "<span>จะพักหลังคลิปนี้...</span>" : '<button class="btn small ghost" data-act="stop" type="button">พัก</button>'); return; }
    if(!rem.length){ el.innerHTML = items.length ? "<span>" + label + "AI ทำดัชนีครบทุกคลิปแล้ว (" + nDone + ")</span>" : ""; return; }
    el.innerHTML = "<span>" + label + "AI ทำแล้ว " + nDone + "/" + items.length + " คลิป</span>" + '<button class="btn small" data-act="run" type="button">ให้ AI ทำที่เหลือ (' + rem.length + ")</button>";
  }
  function allItems(){ return albums.reduce(function(a, x){ return a.concat(x.items); }, []).filter(function(e){ return e.album !== MISSING; }); }
  function strips(){ strip($("alAi"), allItems(), ""); if(curAlbum) strip($("alvAi"), curAlbum.items, ""); }
  async function runFor(items){
    var rem = items.filter(function(e){ return e.uri && !done(e); }); if(!rem.length) return;
    if(!FT.orKey()){ await MWDialog.alert("ยังไม่มี OpenRouter key ในแอพ ไปใส่ที่ ตั้งค่า > คีย์ API ก่อน"); return; }
    var avg = U.queueInfo().avg;
    var ok = await MWDialog.confirm("ให้ AI ทำดัชนี " + rem.length + " คลิป?\n\nประมาณ " + U.money(rem.length * avg) + " (ประมาณการจากค่าเฉลี่ยของคลิปที่เคยทำ " + U.money(avg) + " ต่อคลิป ราคาจริงอาจต่างไป)\n\nต้องเปิดแอพค้างไว้จนเสร็จ พักและทำต่อได้ ไม่ทำคลิปเดิมซ้ำ", { ok:"เริ่ม" });
    if(!ok) return;
    U.indexLocal(rem.map(function(e){ return { name:e.name, size:e.size, uri:e.uri, album:e.album, mtime:e.mtime }; }));
    U.runQueue(); strips();
  }
  function onStrip(items){ return function(e){ var b = e.target.closest("[data-act]"); if(!b) return; if(b.dataset.act === "stop") U.stopQueue(); else runFor(items()); }; }
  $("alAi").addEventListener("click", onStrip(allItems));
  $("alvAi").addEventListener("click", onStrip(function(){ return curAlbum ? curAlbum.items : []; }));
  var wasRunning = false;
  document.addEventListener("ft:queue", function(){ /* คิวเดินอยู่: อัปเดตแค่แถบ · จบรอบค่อยวาดตารางใหม่ (ไม่ให้กะพริบทุกวินาที) */
    var r = U.queueInfo().running; build(); if(curAlbum) curAlbum = albums.find(function(a){ return a.name === curAlbum.name; }) || null; strips();
    if(wasRunning && !r){ if(view === "home") renderHome(); else if(curAlbum) openAlbum(albums.indexOf(curAlbum)); }
    wasRunning = r;
  });
  function closeAlbum(){ $("alView").hidden = true; $("alHome").hidden = false; curAlbum = null; view = "home"; }
  var playDone = null;
  async function openPlayer(e){
    var v = $("alVid"); $("alpT").textContent = e.name; $("alpS").textContent = (curAlbum ? curAlbum.name + " · " : "") + dur(e, null); $("alpMsg").textContent = "";
    $("alPlay").hidden = false; history.pushState({ al:2 }, ""); view = "player";
    var url = fileUrl(e);
    if(!url && e.c){ try{ var s = await U.srcUrl(e.c); if(s){ url = s.url; playDone = s.done; $("alpMsg").textContent = s.cloud ? "เล่นจากคลัง" : ""; } }catch(err){} }
    if(!url){ $("alpMsg").textContent = "ไม่เจอไฟล์ของคลิปนี้ในมือถือ (ลองสแกนใหม่)"; return; }
    v.onerror = function(){ $("alpMsg").textContent = "เล่นไฟล์นี้ไม่ได้"; };
    v.src = url; v.play().catch(function(){});
  }
  function stopPlayer(){ var v = $("alVid"); try{ v.pause(); }catch(e){} if(playDone){ playDone(); playDone = null; } v.removeAttribute("src"); v.load(); $("alPlay").hidden = true; }
  window.addEventListener("popstate", function(){ /* ปุ่มย้อนของมือถือ/ของหน้า: ปิดชั้นบนสุดก่อน */
    if(view === "player"){ stopPlayer(); view = curAlbum ? "album" : "home"; }
    else if(view === "album") closeAlbum();
  });
  $("alGrid").addEventListener("click", function(e){ var b = e.target.closest("[data-i]"); if(b) openAlbum(+b.dataset.i); });
  $("alvGrid").addEventListener("click", function(e){ var b = e.target.closest("[data-i]"); if(b && curAlbum) openPlayer(curAlbum.items[+b.dataset.i]); });
  $("alBack").addEventListener("click", function(){ history.back(); });
  $("alPlayX").addEventListener("click", function(){ history.back(); });
  $("alScan").addEventListener("click", async function(){
    var b = this; b.disabled = true; $("alMsg").textContent = "กำลังสแกน...";
    try{ await MWLocal.scan(function(i, n){ $("alMsg").textContent = "กำลังสแกนอัลบั้ม " + i + "/" + n + "..."; }); }
    catch(err){ $("alMsg").textContent = "สแกนไม่ได้: " + (err && (err.message || err.errorMessage) || err) + " · ถ้าเคยกดไม่อนุญาต ให้เปิดสิทธิ์ดูรูป/วิดีโอที่ตั้งค่าของมือถือ"; b.disabled = false; return; }
    b.disabled = false; renderHome();
  });
  function refresh(){ if(view === "home") renderHome(); }
  document.addEventListener("ft:files", refresh); /* สแกนเสร็จ */
  document.addEventListener("ft:scan", refresh); /* เริ่ม/จบการสแกน (ข้อความกำลังสแกน) */
  document.addEventListener("ft:lib", refresh); /* ดัชนีโหลด/เปลี่ยน */
  document.querySelector(".tabs").addEventListener("click", function(e){ var b = e.target.closest('button[data-p="album"]'); if(b) refresh(); });
  refresh();
})();
