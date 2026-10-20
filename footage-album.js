/* footage-album.js — แท็บ "อัลบั้ม" (หน้าตาแบบแอพแกลเลอรี): ตารางอัลบั้ม → ตารางคลิปในอัลบั้ม → ตัวเล่นเต็มจอ
   3 แบบ: ในมือถือ (ตามอัลบั้มจริง) / ตัวละคร (ป้ายของ AI ในดัชนี) / ภาค (arc: AI ตัดสินจากป้าย arc ของฉาก มั่นใจ ≥60% เข้าเอง ไม่งั้น 'ยังไม่แน่ใจ' ให้ย้ายเอง เก็บที่ c.arc + c.arcFixed)
   แหล่งรายการ: ไฟล์ในมือถือที่ MWLocal สแกน (เฉพาะโฟลเดอร์ Pictures/Gallery/owner) + คลิปในดัชนี (ใช้ปก/ความยาวที่ทำไว้แล้ว) จับคู่ด้วย ชื่อ|ขนาด
   ภาพย่อ: สร้างจากเฟรมของไฟล์เอง 600px ตอนเลื่อนมาถึง (ทีละ 2 ไฟล์) เก็บใน IndexedDB mw_thumbs_v1 (เปิดครั้งถัดไปไม่ต้องสร้างใหม่) · ไม่มีไฟล์ในมือถือค่อยใช้ปกของดัชนี (240px)
   ปุ่มย้อนกลับของมือถือ: เปิดอัลบั้ม/ตัวเล่น = pushState → ย้อนแล้วปิดชั้นบนสุด (ไม่เด้งออกจากหน้า) */
(function(){
  "use strict";
  var FT = window.FT, U = FT && FT.ui; if(!U) return;
  var $ = function(id){ return document.getElementById(id); };
  var ROOT = "/Gallery/owner/"; /* อัลบั้มวันพีซอยู่ใต้ Pictures/Gallery/owner/ (อัลบั้มอื่นในมือถือไม่โชว์) */
  var albums = [], allE = [], mode = "phone", curAlbum = null, urls = {}; /* urls = key → blob URL ของภาพย่อ (ในหน่วยความจำ) */

  /* ---------- รายการ ---------- */
  var MISSING = "ไม่เจอในมือถือ"; /* คลิปที่มีในดัชนีแต่หาไฟล์ในมือถือไม่เจอ (ถูกย้าย/ลบ/ชื่อต่าง) แยกเป็นอัลบั้มของมันเอง ไม่ปนกับอัลบั้มจริง */
  function build(){
    var byKey = {}, other = {}, out = [], loc = window.MWLocal && MWLocal.list ? MWLocal.list() : [];
    loc.forEach(function(f){
      var e = { k:f.name + "|" + f.size, name:f.name, size:f.size, mtime:f.mtime, album:f.album, uri:f.uri, c:null };
      if(f.dir.indexOf(ROOT) < 0 && !f.lib){ other[e.k] = e; return; } /* ไฟล์นอกโฟลเดอร์หลัก: โชว์เฉพาะที่อยู่ในดัชนี */
      (byKey[e.k] = byKey[e.k] || []).push(e); out.push(e); /* ไฟล์ชื่อ+ขนาดเดียวกันอยู่ได้หลายโฟลเดอร์ (ก๊อปซ้ำ) = รายการละไฟล์ แต่ใช้ดัชนีของคลิปเดียวกัน */
    });
    U.lib().forEach(function(c){
      var ks = U.keysOf(c), k = ks[0], hit = false; /* กุญแจชุดเดียวกับ U.clipFor (ชื่อ|ขนาด + aliases) */
      ks.forEach(function(kk){
        var es = byKey[kk];
        if(es){ hit = true; es.forEach(function(e){ if(U.clipFor(e.name, e.size) === c) e.c = c; }); } /* หลายคลิปกุญแจเดียวกัน = ให้ไฟล์ได้คลิปที่ U.clipFor เลือก (ตรงกับทุกที่) */ /* ทุกไฟล์ที่ซ้ำกันนับว่าทำดัชนีแล้ว (เดิมติดแค่ตัวสุดท้าย → อีกตัวค้าง "ยังไม่ทำ" และกดทำใหม่ไม่ได้เพราะดัชนีมีอยู่แล้ว) */
        else if(other[kk]){ hit = true; other[kk].c = c; byKey[kk] = [other[kk]]; out.push(other[kk]); }
      });
      if(!hit && c.hide !== "trash") out.push({ k:k, name:c.name, size:c.size, album:loc.length ? MISSING : (c.album || "ไม่ระบุ"), uri:null, c:c });
    });
    allE = out; albums = groupFor(mode);
  }
  function sortAlbums(list){ return list.sort(function(a, b){ return b.items.length - a.items.length; }); }
  function groupFor(m){
    var g = {};
    function put(n, e){ (g[n] = g[n] || []).push(e); }
    function mk(order){ return Object.keys(g).map(function(n){ return { name:n, items:g[n].sort(function(a, b){ return a.name < b.name ? -1 : 1; }) }; }).sort(order); }
    if(m === "char"){ /* ตัวละครจากป้ายที่ AI ติดไว้ในดัชนี (ฟรี) · คลิปอยู่ได้หลายอัลบั้ม · เจอน้อยกว่า 3 คลิปไม่ทำอัลบั้ม */
      var none = [];
      allE.forEach(function(e){ if(!done(e)) return; var ks = {}; e.c.scenes.forEach(function(sc){ U.chars(sc).forEach(function(k){ ks[k] = 1; }); });
        var l = Object.keys(ks); if(!l.length) none.push(e); else l.forEach(function(k){ put(U.enName(k), e); }); });
      var out = mk(function(a, b){ return b.items.length - a.items.length; }).filter(function(x){ return x.items.length >= 3; });
      if(none.length) out.push({ name:"ไม่ระบุตัวละคร", items:none.sort(function(a, b){ return a.name < b.name ? -1 : 1; }) });
      return out;
    }
    if(m === "arc"){ /* ภาค: มั่นใจ = เข้าอัลบั้มภาคเอง · ไม่มั่นใจ = "ยังไม่แน่ใจ" ให้ผู้ใช้ย้ายเอง */
      allE.forEach(function(e){ if(!done(e)) return; var r = arcOf(e.c); put(r.sure ? r.arc : UNSURE, e); });
      return mk(function(a, b){ var ia = arcRank(a.name), ib = arcRank(b.name); return ia - ib || b.items.length - a.items.length; });
    }
    allE.forEach(function(e){ put(e.album, e); });
    return mk(function(a, b){ return b.items.length - a.items.length; });
  }
  var UNSURE = U.UNSURE, ARCS = U.ARCS, arcRank = U.arcRank, arcOf = U.arcOf; /* นิยามภาคอยู่ footage-find.js (ใช้ร่วมกับตัวกรองภาคในช่องค้นหา) */
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
  function gen(url, at, w0){ /* เฟรมกลางๆ ของคลิป (หรือที่วินาที at) กว้าง w0 (ค่าเริ่ม 600) → { d:ความยาว, b:JPEG } หรือ null ถ้าเปิดไม่ได้ */
    return new Promise(function(ok){
      var v = document.createElement("video"), done = false, t;
      function fin(r){ if(done) return; done = true; clearTimeout(t); try{ v.removeAttribute("src"); v.load(); }catch(e){} ok(r); }
      t = setTimeout(function(){ fin(null); }, 12000);
      v.muted = true; v.playsInline = true; v.preload = "auto";
      v.onerror = function(){ fin(null); };
      v.onloadedmetadata = function(){ var d = v.duration || 2; v.currentTime = at == null ? Math.min(1, d / 2) : Math.max(0.05, Math.min(at, d - 0.05)); };
      v.onseeked = function(){
        var w = w0 || 600, h = Math.round(w * (v.videoHeight || 1) / (v.videoWidth || 1)), c = document.createElement("canvas"); c.width = w; c.height = h;
        try{ c.getContext("2d").drawImage(v, 0, 0, w, h); c.toBlob(function(b){ fin(b ? { d:v.duration, b:b } : null); }, "image/jpeg", 0.82); }catch(e){ fin(null); }
      };
      v.src = url;
    });
  }
  var queue = [], running = 0;
  function pump(){ while(running < 2 && queue.length){ var j = queue.shift(); running++; j.fn().then(function(j){ return function(r){ running--; j.ok(r); pump(); }; }(j), function(){ running--; j.ok(null); pump(); }); } }
  async function work(e){
    var rec = await dbGet("t2:" + e.k); /* t2 = ภาพย่อ 600px (รุ่นเก่า 240px ไม่ใช้แล้ว) */
    if(!rec){ var u = fileUrl(e); if(!u) return null; var g = await gen(u); if(!g) return null; rec = { k:"t2:" + e.k, d:g.d, b:g.b }; dbPut(rec); }
    return { url:urls[e.k] || (urls[e.k] = URL.createObjectURL(rec.b)), d:rec.d };
  }
  function thumbOf(e){ return new Promise(function(ok){ queue.push({ fn:function(){ return work(e); }, ok:ok }); pump(); }); }
  /* รูปฉากคมๆ ในการ์ดผลค้นหา/รูปใหญ่: รูปในดัชนีกว้างแค่ 240/480px ขยายแล้วแตก → อ่านเฟรมกลางฉากจากไฟล์จริงในมือถือ 720px เก็บแคช (คิวเดียวกับภาพย่ออัลบั้ม) · ไม่มีไฟล์ = ใช้รูปเดิม */
  async function sceneWork(c, t){
    var e = allE.find(function(x){ return x.c && x.c.id === c.id && x.uri; }); if(!e) return null;
    var k = "s2:" + e.k + ":" + t.toFixed(2); if(urls[k]) return urls[k];
    var rec = await dbGet(k);
    if(!rec){ var u = fileUrl(e); if(!u) return null; var g = await gen(u, t, 720); if(!g) return null; rec = { k:k, b:g.b }; dbPut(rec); }
    return urls[k] || (urls[k] = URL.createObjectURL(rec.b));
  }
  function sceneSharp(c, sc){ if(!c || !sc || !window.MWLocal) return Promise.resolve(null); var t = Math.max(0.05, (sc.s + sc.e) / 2); return new Promise(function(ok){ queue.push({ fn:function(){ return sceneWork(c, t); }, ok:ok }); pump(); }); } /* เวลาเดียวกับที่ทำดัชนีเก็บรูปไว้ (กลางฉาก) */
  var sio = "IntersectionObserver" in window ? new IntersectionObserver(function(list){ list.forEach(function(x){ if(!x.isIntersecting) return; sio.unobserve(x.target); sharpImg(x.target); }); }, { rootMargin:"200px" }) : null;
  function sharpImg(el){ var h = U.shownAt(+el.dataset.k); if(!h || !h.sc) return; sceneSharp(h.c, h.sc).then(function(u){ if(u && el.isConnected) el.src = u; }); }
  function sharpen(root){ if(!root) return; root.querySelectorAll("img.scene[data-k]").forEach(function(el){ if(sio) sio.observe(el); else sharpImg(el); }); } /* เรียกหลังวาดการ์ด (ค้นหา/ตัวกรอง/ถาม AI) · โหลดเฉพาะการ์ดที่เลื่อนมาถึง */
  var io = "IntersectionObserver" in window ? new IntersectionObserver(function(list){
    list.forEach(function(x){ if(!x.isIntersecting) return; io.unobserve(x.target); fill(x.target); });
  }, { rootMargin:"300px" }) : null;
  function fill(el){
    if(el._cands){ pickCover(el); return; }
    var e = el._e; if(!e) return;
    if(!e.uri && e.c && e.c.cover){ el.querySelector("img").src = e.c.cover; return; } /* ไม่มีไฟล์ในมือถือ = ใช้ปกจากดัชนี (240px ค่อนข้างเบลอ) */
    thumbOf(e).then(function(t){ if(!el.isConnected) return; if(!t){ if(e.c && e.c.cover) el.querySelector("img").src = e.c.cover; return; } el.querySelector("img").src = t.url; /* อ่านเฟรมจากไฟล์ไม่ได้ = ใช้ปกจากดัชนี (เดิมช่องว่างเปล่า) */ var b = el.querySelector(".dur"); if(b && !b.textContent) b.textContent = dur(e, t); });
  }
  function imgFor(e){ return !e.uri && e.c && e.c.cover ? Promise.resolve(e.c.cover) : thumbOf(e).then(function(t){ return t ? t.url : e.c && e.c.cover || null; }); }
  function score(url){ /* ภาพที่ไม่ขาว/ดำล้วน และมีรายละเอียด (ส่วนเบี่ยงเบนของความสว่างสูง) ได้คะแนนสูง */
    return new Promise(function(ok){ var im = new Image(); im.onload = function(){ try{ var c = document.createElement("canvas"); c.width = c.height = 16; var x = c.getContext("2d"); x.drawImage(im, 0, 0, 16, 16); var d = x.getImageData(0, 0, 16, 16).data, m = 0, v = 0, L = [], i;
        for(i = 0; i < d.length; i += 4){ var l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; L.push(l); m += l; } m /= L.length; L.forEach(function(l){ v += (l - m) * (l - m); }); var sd = Math.sqrt(v / L.length); ok(m > 25 && m < 225 ? sd : sd / 4); }catch(e){ ok(0); } }; im.onerror = function(){ ok(-1); }; im.src = url; });
  }
  async function pickCover(el){ /* ปกอัลบั้ม = ภาพที่ดีที่สุดจาก 3 คลิปแรก (ภาพย่อแคชไว้ ไม่เสียเวลาซ้ำ) */
    var urls = await Promise.all(el._cands.map(imgFor)), best = null, bs = -2;
    for(var i = 0; i < urls.length; i++){ if(!urls[i]) continue; var s = await score(urls[i]); if(s > bs){ bs = s; best = urls[i]; } }
    if(best && el.isConnected) el.querySelector("img").src = best;
  }
  function watch(root, entryOf){
    root.querySelectorAll("[data-i]").forEach(function(el){ el._e = entryOf(+el.dataset.i); if(io) io.observe(el); else fill(el); });
  }

  /* ---------- หน้าจอ ---------- */
  var view = "home"; /* home | album | player */
  function renderHome(){
    build();
    var native = window.MWLocal && MWLocal.native && MWLocal.native(), n = allE.filter(function(e){ return e.album !== MISSING; }).length, doneN = allE.filter(done).length;
    var base = mode === "phone" ? (albums.length ? albums.filter(function(x){ return x.name !== MISSING; }).length + " อัลบั้ม · " + n + " คลิป" : "") /* ไม่นับอัลบั้ม "ไม่เจอในมือถือ" (ไม่ใช่อัลบั้มจริง และคลิปในนั้นไม่รวมใน n) */ : mode === "char" ? albums.length + " ตัวละคร · AI ดูแล้ว " + doneN + " คลิป" /* ข้อความสั้น: หัวแถวมีปุ่ม 2 ปุ่ม ข้อความยาวจะบีบปุ่มจนแตกบรรทัด */
      : albums.filter(function(x){ return x.name !== UNSURE; }).length + " ภาค" + (albums.some(function(x){ return x.name === UNSURE; }) ? " · ยังไม่แน่ใจ " + albums.find(function(x){ return x.name === UNSURE; }).items.length + " คลิป" : "");
    $("alSub").textContent = base + (scanning() ? (base ? " · " : "") + "กำลังสแกนหาคลิปใหม่..." : "");
    $("alScan").hidden = !native; $("orgBtn").hidden = !native; /* จัดอัลบั้มใหม่ (footage-organize.js) ใช้ได้เฉพาะในแอพ */
    $("alMsg").textContent = albums.length ? "" : mode !== "phone" ? "ยังไม่มีคลิปที่ AI ดูแล้ว · กด ให้ AI ทำที่เหลือ ด้านบน" : native ? "ยังไม่เจอคลิป · กด สแกนใหม่ (ครั้งแรกจะมีหน้าต่างขออนุญาตดูรูปและวิดีโอ ให้กดอนุญาต)" : "ใช้ปุ่มเลือกไฟล์ในแท็บ อัปโหลด เพื่อทำดัชนี แล้วคลิปจะขึ้นที่นี่";
    $("alGrid").innerHTML = albums.map(function(a, i){
      return '<button class="alt album" data-i="' + i + '" type="button"><span class="alimg"><img alt="" decoding="async"><i class="alph"></i></span><b>' + esc(a.name) + "</b><small>" + a.items.length + " คลิป" + (mode === "phone" && a.items.some(done) ? " · AI " + a.items.filter(done).length : "") + "</small></button>";
    }).join("");
    strips(); arcStrip();
    $("alGrid").querySelectorAll("[data-i]").forEach(function(el){ el._cands = albums[+el.dataset.i].items.slice(0, 3); if(io) io.observe(el); else fill(el); });
  }
  function openAlbum(i){
    var a = albums[i]; if(!a) return; curAlbum = a;
    $("alvTitle").textContent = a.name; $("alvSub").textContent = a.items.length + " คลิป · AI ทำแล้ว " + a.items.filter(done).length;
    $("alvGrid").innerHTML = a.items.map(function(e, k){
      return '<button class="alt clip" data-i="' + k + '" type="button"><span class="alimg"><img alt="" decoding="async"><i class="alph"></i>' + (done(e) ? '<i class="aid" title="AI ทำดัชนีแล้ว"></i>' : "") + '<i class="ack"></i>' + '<em class="dur">' + dur(e, null) + "</em></span></button>";
    }).join("");
    watch($("alvGrid"), function(k){ return a.items[k]; });
    strips(); $("alHome").hidden = true; $("alView").hidden = false; window.scrollTo(0, 0);
    if(view === "home") history.pushState({ al:1 }, ""); view = "album"; sel = null; selUi();
  }
  /* ---------- แถบ AI (สถานะดัชนี + ปุ่มให้ AI ทำที่เหลือ) ---------- */
  function strip(el, items, label){
    var q = U.queueInfo(), rem = items.filter(function(e){ return e.uri && !done(e); }), nDone = items.filter(done).length;
    if(q.running){ el.innerHTML = "<span>AI กำลังทำดัชนี " + q.fin + "/" + q.total + " คลิป · ใช้ไป " + U.money(q.cost) + "</span>" + (q.paused ? "<span>จะพักหลังคลิปนี้...</span>" : '<button class="btn small ghost" data-act="stop" type="button">พัก</button>'); return; }
    if(!rem.length){ el.innerHTML = items.length ? "<span>" + label + "AI ทำดัชนีครบทุกคลิปแล้ว (" + nDone + ")</span>" : ""; return; }
    el.innerHTML = "<span>" + label + "AI ทำแล้ว " + nDone + "/" + items.length + " คลิป</span>" + '<button class="btn small" data-act="run" type="button">ให้ AI ทำที่เหลือ (' + rem.length + ")</button>";
  }
  function allItems(){ return allE.filter(function(e){ return e.album !== MISSING; }); }
  function strips(){ strip($("alAi"), allItems(), ""); if(curAlbum) strip($("alvAi"), curAlbum.items, ""); }
  async function runFor(items){
    var rem = items.filter(function(e){ return e.uri && !done(e); }); if(!rem.length) return;
    if(!FT.orKey()){ await MWDialog.alert("ยังไม่มี OpenRouter key ในแอพ ไปใส่ที่ ตั้งค่า > คีย์ API ก่อน"); return; }
    var avg = U.queueInfo().avg;
    var names = rem.slice(0, 6).map(function(e){ return "• " + e.name; }).join("\n") + (rem.length > 6 ? "\n• ...อีก " + (rem.length - 6) + " คลิป" : ""); /* เห็นว่าเหลือคลิปไหน (ค้างเพราะเคยพลาดหรือยังไม่เคยทำ) */
    var ok = await MWDialog.confirm("ให้ AI ทำดัชนี " + rem.length + " คลิป?\n\n" + names + "\n\nประมาณ " + U.money(rem.length * avg) + " (ประมาณการจากค่าเฉลี่ยของคลิปที่เคยทำ " + U.money(avg) + " ต่อคลิป ราคาจริงอาจต่างไป)\n\nต้องเปิดแอพค้างไว้จนเสร็จ พักและทำต่อได้ ไม่ทำคลิปเดิมซ้ำ", { ok:"เริ่ม" });
    if(!ok) return;
    U.indexLocal(rem.map(function(e){ return { name:e.name, size:e.size, uri:e.uri, album:e.album, mtime:e.mtime }; }));
    var p = U.runQueue(); strips(); await p; strips();
    var el = U.queueInfo().errList; /* คลิปที่ทำไม่สำเร็จ: บอกชื่อกับเหตุผลตรงๆ (ไม่งั้นค้างเหลืออยู่โดยไม่รู้สาเหตุ) */
    if(el && el.length) await MWDialog.alert("ทำไม่สำเร็จ " + el.length + " คลิป:\n\n" + el.slice(0, 5).map(function(x){ return "• " + x.name + "\n  " + (x.err || "ไม่ทราบสาเหตุ"); }).join("\n") + (el.length > 5 ? "\n...อีก " + (el.length - 5) + " คลิป" : "") + "\n\nคลิปที่พลาดจะยังค้างในรายการ ลองกดอีกครั้ง ถ้ายังพลาดซ้ำ ส่งข้อความด้านบนมาให้ผมดู");
    var qi = U.queueInfo(), rm = document.getElementById("runMsg"); /* คิวพักกลางทาง (ถึงเพดานงบ/สลับแอพ/พลาดติดกัน) = บอกตรงๆ ไม่เงียบ */
    if(qi.wait && !qi.running) await MWDialog.alert("ยังเหลือ " + qi.wait + " คลิปที่ยังไม่ได้ทำ\n\n" + ((rm && rm.textContent) || "คิวพักไว้") + "\n\nกด ให้ AI ทำที่เหลือ อีกครั้งเพื่อทำต่อ");
  }
  function onStrip(items){ return function(e){ var b = e.target.closest("[data-act]"); if(!b) return; if(b.dataset.act === "stop") U.stopQueue(); else runFor(items()); }; }
  $("alAi").addEventListener("click", onStrip(allItems));
  $("alvAi").addEventListener("click", onStrip(function(){ return curAlbum ? curAlbum.items : []; }));
  document.addEventListener("ft:search", function(e){ /* พิมพ์ค้น/เลือกชิป = โชว์ผลค้นหา · ว่าง = กลับตารางอัลบั้ม */
    var on = !!(e.detail && e.detail.active); $("alMain").hidden = on; $("results").hidden = !on; $("findInfo").hidden = !on && !$("findInfo").textContent;
  });
  /* ---------- ให้ AI ดูภาคของคลิปที่ยังไม่แน่ใจ (โหมดภาค) · ไม่เดา: ไม่แน่ใจ = ว่าง · ผลเก็บที่ c.arcAi · ลองแล้วไม่ซ้ำ ---------- */
  var arcRun = false, arcStopF = false, arcMsg = "";
  function arcTodo(){ var seen = new Set(); return allE.filter(function(e){ if(!done(e) || e.c.hide || seen.has(e.c)) return false; seen.add(e.c); return !arcOf(e.c).sure && !e.c.arcAi && e.c.scenes.some(function(sc){ return sc.img || sc.thumb; }); }); } /* คลิปละครั้ง (ไฟล์ก๊อปหลายโฟลเดอร์ใช้ดัชนีเดียวกัน ไม่จ่ายซ้ำ) · ข้ามคลิปที่ซ่อน */
  function arcFrames(c){ var s = c.scenes.filter(function(x){ return x.img || x.thumb; }), pick = s.length <= 3 ? s : [s[0], s[Math.floor(s.length / 2)], s[s.length - 1]]; return pick.map(function(x){ return x.img || x.thumb; }); }
  function arcStrip(){
    var el = $("alArc"); el.hidden = mode !== "arc"; if(mode !== "arc") return;
    var todo = arcTodo().length;
    el.innerHTML = arcRun ? "<span>AI กำลังดูภาค " + arcMsg + "</span>" + '<button class="btn small ghost" data-act="stop" type="button">หยุด</button>'
      : todo ? "<span>" + (arcMsg ? arcMsg + " · " : "") + "ยังไม่แน่ใจ " + todo + " คลิป</span>" + '<button class="btn small" data-act="run" type="button">ให้ AI ดูภาค (' + todo + ")</button>"
      : "<span>" + (arcMsg || "ไม่มีคลิปที่รอ AI ดูภาค") + "</span>";
  }
  $("alArc").addEventListener("click", function(e){ var b = e.target.closest("[data-act]"); if(!b) return; if(b.dataset.act === "stop"){ arcStopF = true; return; } runArcs(); });
  async function runArcs(){ /* ปุ่มในแถบภาค (โหมดภาค) */
    var todo = arcTodo(); if(!todo.length || arcRun) return;
    if(!FT.orKey()){ await MWDialog.alert("ยังไม่มี OpenRouter key ในแอพ ไปใส่ที่ ตั้งค่า > คีย์ API ก่อน"); return; }
    if(!await MWDialog.confirm("ให้ AI ดูภาคของ " + todo.length + " คลิปที่ยังไม่แน่ใจ?\n\nประมาณ " + U.money(todo.length * 3 * 0.0012) + " (ประมาณการจากราคาต่อรูปของการตรวจตัวละครซ้ำ $0.0012 คูณ 3 รูปต่อคลิป ราคาจริงอาจต่างไป)\n\nAI จะไม่เดา: คลิปที่ไม่แน่ใจจะยังอยู่ในอัลบั้ม ยังไม่แน่ใจ และจะไม่ถูกลองซ้ำ ผลที่ AI ตอบไม่ทับภาคที่คุณย้ายเอง · พักและทำต่อได้ ต้องเปิดแอพค้างไว้", { ok:"เริ่ม" })) return;
    arcRun = true; arcStopF = false; arcMsg = ""; var n = 0, hit = 0, cost = 0, dirty = [], failB = 0, lastErr = null; arcStrip(); await U.wake(true);
    try{
      for(var i = 0; i < todo.length && !arcStopF; i += 8){
        var g = todo.slice(i, i + 8), r = null, items = g.map(function(en, k){ return { n:k + 1, imgs:arcFrames(en.c), hint:en.c.album }; });
        for(var t = 0; t < 2 && !r; t++){ /* ตอบเพี้ยน (ไม่ใช่ JSON) = ลองอีกรอบ ไม่ล้มทั้งงาน · ค่าที่จ่ายไปแล้วนับด้วย */
          try{ r = await FT.classifyArcs(items, ARCS); }catch(err){ if(err.cost) cost += err.cost; if(err.budget) throw err; lastErr = err; } }
        if(!r){ failB++; if(failB >= 3) throw lastErr; n += g.length; arcMsg = n + "/" + todo.length + " · ข้ามชุดที่ AI ตอบไม่ได้ " + failB + " ชุด (คลิปเหล่านั้นยังค้าง กดทำใหม่ได้)"; arcStrip(); continue; }
        failB = 0; cost += r.cost; g.forEach(function(en, k){ var ar = r.map[k + 1] || ""; en.c.arcAi = { arc:ar, at:Date.now() }; if(ar) hit++; dirty.push(en.c); });
        await FT.store.putMany(dirty); dirty = []; n += g.length; arcMsg = n + "/" + todo.length + " · ได้ภาค " + hit + " · ใช้ " + U.money(cost); build(); arcStrip();
      }
      arcMsg = (arcStopF ? "หยุดแล้ว" : "เสร็จรอบนี้") + ": ดู " + n + " คลิป ได้ภาค " + hit + " คลิป ใช้ " + U.money(cost);
    }catch(err){ arcMsg = (err.budget ? "ถึงเพดานงบ: " : "ไม่สำเร็จ: ") + (err.message || err) + " · ทำไปแล้ว " + n + " คลิป (กดใหม่ทำต่อ)"; }
    arcRun = false; await U.wake(false); build(); if(view === "home") renderHome(); document.dispatchEvent(new CustomEvent("ft:lib")); /* แผงจัดอัลบั้มใหม่/ตัวกรองภาค เห็นภาคใหม่ */
  }
  function albumHit(n){ n = String(n).toLowerCase(); var a = groupFor("phone").find(function(x){ return x.name !== MISSING && x.name.toLowerCase().split(/\s+/).indexOf(n) >= 0; }); return a ? { name:a.name, n:a.items.length } : null; } /* "nami" เจอ "nami robin" */
  function openAlbumNamed(name){ /* ล้างคำค้น → ตารางอัลบั้มแบบในมือถือ → เปิดอัลบั้มนั้น */
    $("q").value = ""; if(U.search) U.search();
    if(mode !== "phone") $("alSeg").querySelector('[data-m="phone"]').click(); else renderHome();
    var i = albums.findIndex(function(a){ return a.name === name; }); if(i >= 0) openAlbum(i);
  }
  Object.assign(U, { sharpen:sharpen, sceneSharp:sceneSharp, albumHit:albumHit, openAlbumNamed:openAlbumNamed, playAt:playAt, runIndexFor:runFor, runArcs:runArcs }); /* runIndexFor = หน้าจัดอัลบั้มใหม่สั่ง ทำดัชนีที่เหลือ ได้เลย */
  var wasRunning = false;
  document.addEventListener("ft:queue", function(){ /* คิวเดินอยู่: อัปเดตแค่แถบ · จบรอบค่อยวาดตารางใหม่ (ไม่ให้กะพริบทุกวินาที) */
    var r = U.queueInfo().running; build(); if(curAlbum) curAlbum = albums.find(function(a){ return a.name === curAlbum.name; }) || null; strips();
    if(wasRunning && !r){ if(view === "home") renderHome(); else if(view === "album" && curAlbum) openAlbum(albums.indexOf(curAlbum)); else dirty = true; } /* กำลังดูตัวเล่นอยู่ = ไม่วาดทับ (เดิม openAlbum ตั้ง view=album ทั้งที่ตัวเล่นยังเปิด → ปิดตัวเล่นไม่ได้) */
    wasRunning = r;
  });
  /* ---------- แถบ 3 แบบ: ในมือถือ / ตัวละคร / ภาค ---------- */
  $("alSeg").addEventListener("click", function(e){
    var b = e.target.closest("[data-m]"); if(!b || b.dataset.m === mode) return;
    mode = b.dataset.m; $("alSeg").querySelectorAll("button").forEach(function(x){ x.classList.toggle("on", x === b); }); renderHome();
  });
  /* ---------- เลือกหลายคลิป → ย้ายเข้าภาค (ใช้ได้ในโหมดภาค) ---------- */
  var sel = null, dirty = false; /* sel = { key → entry } เมื่ออยู่ในโหมดเลือก */
  function selUi(){
    $("alSel").hidden = !(view === "album" && mode === "arc"); $("alSel").textContent = sel ? "เสร็จ" : "เลือก";
    $("alSelBar").hidden = !sel; if(sel) $("alSelN").textContent = "เลือกแล้ว " + Object.keys(sel).length + " คลิป";
    $("alvGrid").classList.toggle("selecting", !!sel);
    $("alvGrid").querySelectorAll(".clip").forEach(function(el){ el.classList.toggle("on", !!(sel && curAlbum && sel[curAlbum.items[+el.dataset.i].k])); });
  }
  $("alSel").addEventListener("click", function(){ sel = sel ? null : {}; selUi(); });
  $("alSelX").addEventListener("click", function(){ sel = null; selUi(); });
  $("alMove").addEventListener("click", function(){
    var picks = sel ? Object.keys(sel).map(function(k){ return sel[k]; }).filter(done) : []; if(!picks.length){ $("alSelN").textContent = "เลือกคลิปที่ AI ทำดัชนีแล้วก่อน"; return; }
    FT.pick.open({ title:"ย้าย " + picks.length + " คลิปเข้าภาค", placeholder:"พิมพ์ชื่อภาคเพื่อหา", icon:"folder",
      items:function(q){ var rows = [{ k:"", name:"ให้ AI ตัดสินใจ (ล้างที่ตั้งเอง)", sub:"", on:false }].concat(ARCS.map(function(n){ return { k:n, name:n, sub:"", on:false }; }));
        return rows.filter(function(r){ return !q || r.name.toLowerCase().indexOf(q) >= 0; }); },
      onPick:async function(k){
        try{ for(var i = 0; i < picks.length; i++){ var c = picks[i].c; if(k){ c.arc = k; c.arcFixed = true; } else { c.arc = ""; c.arcFixed = false; } await FT.store.put(c); } }
        catch(err){ await MWDialog.alert("บันทึกไม่ได้: " + (err.message || err)); return; }
        sel = null; dirty = true; history.back(); document.dispatchEvent(new CustomEvent("ft:lib")); /* ปิดอัลบั้ม กลับหน้ารวมที่จัดกลุ่มใหม่แล้ว · แผงจัดอัลบั้มใหม่เห็นภาคที่ตั้งเอง */
      } });
  });
  function closeAlbum(){ $("alView").hidden = true; $("alHome").hidden = false; curAlbum = null; view = "home"; sel = null; selUi(); if(dirty){ dirty = false; renderHome(); } }
  var playDone = null;
  async function openPlayer(e, t0){ /* t0 = เริ่มเล่นที่วินาทีนี้ (กดบรรทัดบทพูดจากแผงฟังเสียง) */
    var v = $("alVid"); $("alpT").textContent = e.name; $("alpS").textContent = (curAlbum ? curAlbum.name + " · " : "") + dur(e, null); $("alpMsg").textContent = ""; $("alpLine").textContent = "";
    $("alPlay").hidden = false; history.pushState({ al:2 }, ""); view = "player";
    var url = fileUrl(e);
    if(!url && e.c){ try{ var s = await U.srcUrl(e.c); if(s){ url = s.url; playDone = s.done; } }catch(err){} }
    if(!url){ $("alpMsg").textContent = "ไม่เจอไฟล์ของคลิปนี้ในมือถือ (ลองสแกนใหม่)"; return; }
    v.onerror = function(){ $("alpMsg").textContent = "เล่นไฟล์นี้ไม่ได้"; };
    if(window.MWLocal) MWLocal.seekable(v, function(m){ $("alpMsg").textContent = m; }); /* กรอแล้วเด้งไป 0:00 = โหลดเป็น Blob ให้กรอได้ */
    var sp = e.c && e.c.speech && e.c.speech.segs && e.c.speech.segs.length ? e.c.speech.segs : null; /* มีบทพูด = โชว์บรรทัดที่กำลังพูดใต้วิดีโอ ไว้เทียบกับเสียงจริง */
    v.ontimeupdate = sp ? function(){ var t = v.currentTime, g = sp.find(function(x){ return t >= x.s - 0.2 && t <= x.e + 0.5; }); $("alpLine").textContent = g ? U.tm(g.s) + "  " + (g.who ? g.who + ": " : "") + g.t : ""; } : null;
    v.onloadedmetadata = t0 ? function(){ v.onloadedmetadata = null; v.currentTime = Math.min(t0, Math.max(0, v.duration - 0.1)); } : null;
    v.src = url; v.play().catch(function(){});
  }
  function playAt(c, t){ /* เปิดตัวเล่นเต็มจอของคลิปนี้ ที่วินาที t (ใช้จากแผงฟังเสียง) */
    var en = allE.find(function(x){ return x.c === c; }) || { name:c.name, size:c.size, c:c, uri:null }; return openPlayer(en, t);
  }
  function stopPlayer(){ var v = $("alVid"); v.ontimeupdate = v.onloadedmetadata = null; try{ v.pause(); }catch(e){} if(window.MWLocal) MWLocal.release(v); if(playDone){ playDone(); playDone = null; } v.removeAttribute("src"); v.load(); $("alPlay").hidden = true; }
  window.addEventListener("popstate", function(){ /* ปุ่มย้อนของมือถือ/ของหน้า: ปิดชั้นบนสุดก่อน */
    if(view === "player"){ stopPlayer(); view = curAlbum ? "album" : "home"; }
    else if(view === "album") closeAlbum();
  });
  $("alGrid").addEventListener("click", function(e){ var b = e.target.closest("[data-i]"); if(b) openAlbum(+b.dataset.i); });
  $("alvGrid").addEventListener("click", function(e){ var b = e.target.closest("[data-i]"); if(!b || !curAlbum) return; var en = curAlbum.items[+b.dataset.i];
    if(sel){ if(sel[en.k]) delete sel[en.k]; else sel[en.k] = en; selUi(); return; }
    openPlayer(en); });
  $("alBack").addEventListener("click", function(){ history.back(); });
  $("alPlayX").addEventListener("click", function(){ history.back(); });
  $("alScan").addEventListener("click", async function(){
    var b = this; b.disabled = true; $("alMsg").textContent = "กำลังสแกน...";
    try{ await MWLocal.scan(function(i, n){ $("alMsg").textContent = "กำลังสแกนอัลบั้ม " + i + "/" + n + "..."; }); }
    catch(err){ $("alMsg").textContent = "สแกนไม่ได้: " + (err && (err.message || err.errorMessage) || err) + " · ถ้าเคยกดไม่อนุญาต ให้เปิดสิทธิ์ดูรูป/วิดีโอที่ตั้งค่าของมือถือ"; b.disabled = false; return; }
    b.disabled = false; renderHome();
  });
  window.MWBackHook = async function(){ /* native.js เรียกเมื่อกดปุ่มย้อนของมือถือ */
    var sh = document.querySelector(".asheet:not([hidden])"); if(sh){ sh.click(); return true; } /* ชีตเลือก/แก้ไข: แตะพื้นหลัง = ปิด */
    if(!$("big").hidden){ $("bigX").click(); return true; }
    if(FT.organize && FT.organize.isOpen()){ history.back(); return true; } /* หน้าจัดอัลบั้มใหม่: popstate ใน footage-organize.js ปิดให้ */
    if(view !== "home"){ history.back(); return true; } /* ตัวเล่น/อัลบั้ม: popstate ปิดทีละชั้น */
    if($("q").value.trim()){ $("q").value = ""; $("q").dispatchEvent(new Event("input")); return true; } /* กำลังค้นหา: ล้างคำค้นก่อน */
    return false;
  };
  function refresh(){ if(view === "home") renderHome(); }
  document.addEventListener("ft:files", refresh); /* สแกนเสร็จ */
  document.addEventListener("ft:scan", refresh); /* เริ่ม/จบการสแกน (ข้อความกำลังสแกน) */
  document.addEventListener("ft:lib", refresh); /* ดัชนีโหลด/เปลี่ยน */
  document.querySelector(".tabs").addEventListener("click", function(e){ var b = e.target.closest('button[data-p="album"]'); if(b) refresh(); });
  U.search && U.search(); /* ตั้งสถานะแถบค้นหา/ตารางอัลบั้มตั้งแต่เปิดหน้า */
  refresh();
})();
