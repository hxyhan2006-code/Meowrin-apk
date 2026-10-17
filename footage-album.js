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
      if(f.dir.indexOf(ROOT) < 0){ other[e.k] = e; return; } /* ไฟล์นอกโฟลเดอร์หลัก: โชว์เฉพาะที่อยู่ในดัชนี */
      byKey[e.k] = e; out.push(e);
    });
    U.lib().forEach(function(c){
      var k = c.name + "|" + c.size, e = byKey[k] || other[k];
      if(e){ e.c = c; if(!byKey[k]){ byKey[k] = e; out.push(e); } }
      else out.push({ k:k, name:c.name, size:c.size, album:loc.length ? MISSING : (c.album || "ไม่ระบุ"), uri:null, c:c });
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
  /* ---------- ภาค (arc) ---------- */
  var UNSURE = "ยังไม่แน่ใจ";
  var ARCS = ["Romance Dawn", "Orange Town", "Syrup Village", "Baratie", "Arlong Park", "Loguetown", "Reverse Mountain", "Whisky Peak", "Little Garden", "Drum Island", "Alabasta", "Jaya", "Skypiea", "Long Ring Long Land", "Water 7", "Enies Lobby", "Thriller Bark", "Sabaody Archipelago", "Amazon Lily", "Impel Down", "Marineford", "Return to Sabaody", "Fish-Man Island", "Punk Hazard", "Dressrosa", "Zou", "Whole Cake Island", "Wano Country", "Egghead"];
  var ARC_RX = [[/return to sabaody|post.?war/, "Return to Sabaody"], [/romance dawn|shells town|alvida/, "Romance Dawn"], [/orange town|buggy/, "Orange Town"], [/syrup|kuro|captain kuro/, "Syrup Village"], [/baratie|don krieg/, "Baratie"], [/arlong|cocoyasi/, "Arlong Park"], [/logue ?town/, "Loguetown"], [/reverse mountain|laboon/, "Reverse Mountain"], [/whisk?e?y ?peak|baroque works intro/, "Whisky Peak"], [/little garden/, "Little Garden"], [/drum/, "Drum Island"], [/alabasta|arabasta/, "Alabasta"], [/jaya/, "Jaya"], [/skypiea|sky island/, "Skypiea"], [/long ring|davy back/, "Long Ring Long Land"], [/water ?(7|seven)|galley.?la/, "Water 7"], [/enies|buster call|cp9/, "Enies Lobby"], [/thriller/, "Thriller Bark"], [/sabaody|human auction/, "Sabaody Archipelago"], [/amazon lily/, "Amazon Lily"], [/impel/, "Impel Down"], [/marine ?ford|summit war|paramount/, "Marineford"], [/fish.?man|hody/, "Fish-Man Island"], [/punk hazard/, "Punk Hazard"], [/dress ?rosa|colosseum/, "Dressrosa"], [/\bzou\b/, "Zou"], [/whole cake|big mom/, "Whole Cake Island"], [/wano|onigashima/, "Wano Country"], [/egghead|vegapunk/, "Egghead"]];
  function normArc(raw){
    var s = String(raw || "").trim().replace(/\s+arc$/i, ""), low = s.toLowerCase(); if(!low || /^(unknown|none|n\/a|na|-|unsure|unclear)$/.test(low)) return "";
    for(var i = 0; i < ARC_RX.length; i++) if(ARC_RX[i][0].test(low)) return ARC_RX[i][1];
    return s.replace(/(^| )\w/g, function(m){ return m.toUpperCase(); }); /* ภาคที่ไม่อยู่ในรายชื่อ (สะกดแปลก/ตอนพิเศษ) เก็บชื่อตามที่ AI ตอบ */
  }
  function arcRank(n){ if(n === UNSURE) return 1000; var i = ARCS.indexOf(n); return i < 0 ? 500 : i; }
  function arcOf(c){ /* { arc, sure } · ที่ผู้ใช้ตั้งเอง (c.arcFixed) ชนะเสมอ · AI: ต้องมีฉากที่บอกภาคพอ (≥25% ของฉาก) และภาคเดียวกัน ≥60% */
    if(c.arcFixed && c.arc) return { arc:c.arc, sure:true };
    var t = {}, n = 0; (c.scenes || []).forEach(function(sc){ var a = normArc(sc.ai && sc.ai.arc); if(a){ t[a] = (t[a] || 0) + 1; n++; } });
    if(!n) return { arc:"", sure:false };
    var top = Object.keys(t).sort(function(x, y){ return t[y] - t[x]; })[0];
    return { arc:top, sure:t[top] / n >= 0.6 && n >= Math.max(1, Math.ceil((c.scenes || []).length * 0.25)) };
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
    var native = window.MWLocal && MWLocal.native && MWLocal.native(), n = allE.filter(function(e){ return e.album !== MISSING; }).length, doneN = allE.filter(done).length;
    var base = mode === "phone" ? (albums.length ? albums.length + " อัลบั้ม · " + n + " คลิป" : "") : mode === "char" ? albums.length + " ตัวละคร (เจอตั้งแต่ 3 คลิป) · จากคลิปที่ AI ดูแล้ว " + doneN
      : albums.filter(function(x){ return x.name !== UNSURE; }).length + " ภาค" + (albums.some(function(x){ return x.name === UNSURE; }) ? " · ยังไม่แน่ใจ " + albums.find(function(x){ return x.name === UNSURE; }).items.length + " คลิป (เลือกแล้วย้ายเองได้)" : "");
    $("alSub").textContent = base + (scanning() ? (base ? " · " : "") + "กำลังสแกนหาคลิปใหม่..." : "");
    $("alScan").hidden = !native;
    $("alMsg").textContent = albums.length ? "" : mode !== "phone" ? "ยังไม่มีคลิปที่ AI ดูแล้ว · กด ให้ AI ทำที่เหลือ ด้านบน" : native ? "ยังไม่เจอคลิป · กด สแกนใหม่ (ครั้งแรกจะมีหน้าต่างขออนุญาตดูรูปและวิดีโอ ให้กดอนุญาต)" : "ใช้ปุ่มเลือกไฟล์ในแท็บ อัปโหลด เพื่อทำดัชนี แล้วคลิปจะขึ้นที่นี่";
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
        sel = null; dirty = true; history.back(); /* ปิดอัลบั้ม กลับหน้ารวมที่จัดกลุ่มใหม่แล้ว */
      } });
  });
  function closeAlbum(){ $("alView").hidden = true; $("alHome").hidden = false; curAlbum = null; view = "home"; sel = null; selUi(); if(dirty){ dirty = false; renderHome(); } }
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
  function refresh(){ if(view === "home") renderHome(); }
  document.addEventListener("ft:files", refresh); /* สแกนเสร็จ */
  document.addEventListener("ft:scan", refresh); /* เริ่ม/จบการสแกน (ข้อความกำลังสแกน) */
  document.addEventListener("ft:lib", refresh); /* ดัชนีโหลด/เปลี่ยน */
  document.querySelector(".tabs").addEventListener("click", function(e){ var b = e.target.closest('button[data-p="album"]'); if(b) refresh(); });
  refresh();
})();
