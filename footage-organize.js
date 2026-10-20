/* footage-organize.js — "จัดอัลบั้มใหม่" (หน้าเต็มจอ): ย้ายไฟล์จริงในแกลเลอรีมือถือเข้าอัลบั้มเดิมของ Han ตามกติกาของ Han (ไม่ใช่ตามภาค)
   กติกา (mw_albrules_v1): { general:ข้อความกติการวม, desc:{ ชื่ออัลบั้มตัวเล็ก:คำอธิบาย }, state:{ ชื่อ:"use"|"lock"|"inbox" }, avg:ค่า AI ต่อคลิป }
     use = รับเข้า/ย้ายออกได้ · lock = ไม่แตะเลย (Oda, อัลบั้มที่ไม่ใช่ฟุตวันพีซ) · inbox = ย้ายออกอย่างเดียว ไม่รับเข้า (ยังไม่แยก) · Han แก้คำอธิบาย/สถานะเองได้ในหน้านี้
   AI (FT.sortAlbums) อ่านดัชนี+บทพูดของคลิป → c.albAi = { a, sure, why, rv, at } (rv = ลายนิ้วมือกติกาตอนที่ดู) · Han เลือกเอง = { a, sure:true, fixed:true } · ไม่ย้าย = { keep:true }
   แผน (buildPlan): ไฟล์ในอัลบั้มจริง (…/Gallery/owner/<อัลบั้ม>/) ที่ AI แน่ใจ และอัลบั้มปลายทางต่างจากเดิม → ย้ายเข้าโฟลเดอร์อัลบั้มนั้น · ไม่แน่ใจ = ไม่แตะ ให้ Han เลือก
   ย้ายด้วยปลั๊กอินเนทีฟ MediaScan.move (rename + แจ้งแกลเลอรี) ต้องมีสิทธิ์ "เข้าถึงไฟล์ทั้งหมด" · ไม่ลบอะไร · จดบันทึกทุกการย้าย (mw_org_v1) เลิกทำได้ · ชื่อซ้ำในโฟลเดอร์ปลายทาง = ข้าม */
(function(){
  "use strict";
  var FT = window.FT, U = FT && FT.ui; if(!U || !window.MWLocal) return;
  var $ = function(id){ return document.getElementById(id); };
  var KEY = "mw_org_v1", RKEY = "mw_albrules_v1", KEEP = 5, TRIAL = 3, FAIL_STOP = 3, BATCH = 10, TRY_N = 20, busy = false, plan = null, open = false, aiRun = false, aiStop = false, aiMsg = "";
  var STATES = { use:"ใช้", lock:"ล็อก ไม่แตะ", inbox:"ย้ายออกอย่างเดียว" };
  var DEF = { /* กติกาเริ่มต้นจากที่ Han เล่า (2026-10-20) · Han แก้ต่อในแอพได้ */
    general: [
      "เลือกจาก \"ฉากนี้เป็นภาพจำของใคร/เรื่องอะไร\" ไม่ใช่นับหัวตัวละคร",
      "หมวกฟางหลายคน (3 คนขึ้นไป) อยู่ด้วยกัน → strawhat gang · ถ้าแค่ 2 คน (เช่น โซโลกับซันจิทะเลาะกัน) → อัลบั้มของคนที่เด่นกว่า จะได้หาง่าย",
      "คนที่เกี่ยวข้องกับตัวละครไหนโดยตรง (ครอบครัว อาจารย์ บ้านเกิด ลูกเรือเก่า) → อัลบั้มตัวละครนั้น เช่น เซฟขาแดง วินสโมค → sanji, ลาบูน โจรสลัดรัมบาร์ → brook",
      "ย้อนอดีตสั้นๆ แต่เห็นตัวละครปัจจุบันมากกว่า → อัลบั้มตัวละครนั้น · ย้อนอดีตนานกว่าฉากปัจจุบัน → อัลบั้มอดีต (เช่น ASL)",
      "ไม่แน่ใจ หรือเข้าได้หลายอัลบั้มพอๆ กัน → ตอบไม่แน่ใจ ให้ Han เลือกเอง"
    ].join("\n"),
    desc: {
      "luffy": "ฉากที่ลูฟี่ (ปัจจุบัน) เด่น · ฉากสองคนที่ลูฟี่เด่นกว่า",
      "zoro": "ฉากที่โซโลเด่น · ฉากสองคนที่โซโลเด่นกว่า (เช่น โซโลกับซันจิทะเลาะกัน) · คนที่เกี่ยวกับโซโลโดยตรง เช่น คุอินะ",
      "sanji": "ฉากที่ซันจิเด่น · เซฟขาแดง บาราติเอ ครอบครัววินสโมค",
      "usopp": "ฉากที่อุซปเด่น · คนที่เกี่ยวกับอุซปโดยตรง เช่น คายะ",
      "nami robin": "ฉากที่นามิหรือโรบินเด่น · คนที่เกี่ยวกับนามิ (เบลเมล โนจิโกะ) หรือโรบิน (โอฮาร่า)",
      "chopper franky": "ฉากที่ช็อปเปอร์หรือแฟรงกี้เด่น · คนที่เกี่ยวกับช็อปเปอร์ (ฮิลูลุค คุเรฮะ) หรือแฟรงกี้ (ทอม)",
      "brook jinbae": "ฉากที่บรู๊คหรือจินเบเด่น · ลาบูน โจรสลัดรัมบาร์ (บรู๊ค) · มนุษย์เงือกที่เกี่ยวกับจินเบ เช่น ฟิชเชอร์ ไทเกอร์ โจรสลัดอาทิตย์",
      "strawhat gang": "หมวกฟางหลายคน (3 คนขึ้นไป) อยู่ด้วยกัน",
      "asl": "เอส ซาโบ้ ลูฟี่ ส่วนใหญ่ย้อนอดีต · ลูฟี่วัยเด็ก ดาดัน โจรภูเขา มากิโนะ · ซาโบ้เจอลูฟี่",
      "pirates": "โจรสลัดอื่นที่ไม่ใช่หมวกฟาง เช่น แชงคูส หนวดขาว (มีแชงคูสกับลูฟี่เด็กก็ลงที่นี่) · มนุษย์เงือกที่ไม่เกี่ยวกับจินเบ เช่น แจ็ค",
      "marines": "ทหารเรือ กองทัพเรือ รวมการ์ป",
      "great power": "มังกรฟ้า ห้าผู้เฒ่า ท่านอิม ราชา 20 ประเทศ คนชั้นสูง ราชวงศ์ เช่น วีวี่",
      "other": "ชาวบ้าน คนบนเกาะ เช่น ชาว Water 7 · ตัวประกอบที่ไม่เข้าอัลบั้มอื่น",
      "7 warlords of the sea": "เจ็ดเทพโจรสลัด (เมื่อฉากนั้นไม่ได้เป็นภาพจำของตัวละครในอัลบั้มอื่น)",
      "revolutionary council": "กองทัพปฏิวัติ ดราก้อน · ซาโบ้ในฐานะกองทัพปฏิวัติ (ถ้าซาโบ้เจอลูฟี่/ย้อนวัยเด็ก → ASL)",
      "oda": "ของอาจารย์โอดะ"
    },
    state: { "oda":"lock", "ความคิดสร้างสรรค์":"lock", "ยังไม่แยก":"inbox" }
  };
  function plug(n){ var c = window.Capacitor; return c && c.isNativePlatform && c.isNativePlatform() && c.Plugins && c.Plugins[n] && (!c.isPluginAvailable || c.isPluginAvailable(n)) ? c.Plugins[n] : null; }
  function mover(){ var m = plug("MediaScan"); return m && m.move && m.hasAccess ? m : null; }
  function load(){ var j = MWStore.get(KEY, null); return j && Array.isArray(j.batches) ? j : { batches:[] }; }
  function low(n){ return String(n || "").toLowerCase().trim(); }
  function rules(){ var r = MWStore.get(RKEY, null) || {}; return { general:typeof r.general === "string" ? r.general : DEF.general, desc:Object.assign({}, DEF.desc, r.desc || {}), state:Object.assign({}, DEF.state, r.state || {}), avg:r.avg || 0 }; }
  function stateOf(R, name){ return R.state[low(name)] || "use"; }
  function rv(R, al){ var s = R.general + "|" + al.filter(function(a){ return stateOf(R, a.name) === "use"; }).map(function(a){ return a.name + ":" + (R.desc[low(a.name)] || ""); }).join("|"), h = 0; for(var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return String(h >>> 0); } /* กติกาเปลี่ยน = เลขเปลี่ยน → บอกว่ามีคลิปที่ AI ดูด้วยกติกาเก่า (ไม่ดูใหม่เองให้เสียเงิน) */
  function clipOf(it){ var c = U.clipFor(it.name, it.size); return c && c.status === "done" ? c : null; } /* ตัวจับคู่เดียวกับหน้าอัลบั้ม (ชื่อ|ขนาด + aliases) */
  function inOwner(it){ return /^(.*\/Gallery\/owner)\/([^\/]+)\/$/.exec(it.dir || ""); } /* เฉพาะอัลบั้มจริงของแกลเลอรี (สำเนาในแอพอยู่ Documents/Meowrin/library จึงไม่เข้า) · ห้ามกรองด้วย it.lib: local.js ติดป้าย lib ให้ "ต้นฉบับที่มีสำเนาแล้ว" ด้วย */
  function albums(){ /* อัลบั้มจริงในมือถือ [{ name, n }] เรียงตามจำนวนคลิป */
    var m = {}; (MWLocal.list() || []).forEach(function(it){ var x = inOwner(it); if(x) m[x[2]] = (m[x[2]] || 0) + 1; });
    return Object.keys(m).map(function(n){ return { name:n, n:m[n] }; }).sort(function(a, b){ return b.n - a.n; });
  }

  function buildPlan(){ /* คืน { moves:[{ name, size, from, to, album, toAlbum, clipId, why }], unsure:[], todo:[{c,album}], stale:[], noIdx, same, dup, hidden, locked, seen, total } */
    var R = rules(), al = albums(), byLow = {}, cur = rv(R, al), moves = [], unsure = [], todo = [], stale = [], noIdx = [], seenTo = {}, seenC = new Set(), same = 0, dup = 0, hidden = 0, locked = 0, seen = 0, total = 0;
    al.forEach(function(a){ byLow[low(a.name)] = a; });
    (MWLocal.list() || []).forEach(function(it){
      var m = inOwner(it); if(!m) return;
      if(stateOf(R, m[2]) === "lock"){ locked++; return; }
      var c = clipOf(it); if(c && c.hide){ hidden++; return; } /* คลิปที่ซ่อนไว้ (ฟุตซ้ำ) ไม่ย้าย และไม่นับว่ายังไม่ทำดัชนี */
      if(!c){ noIdx.push({ name:it.name, size:it.size, uri:it.uri, album:it.album, mtime:it.mtime }); return; }
      total++; var g = c.albAi, first = !seenC.has(c); seenC.add(c);
      if(!g){ if(first) todo.push({ c:c, album:m[2] }); return; }
      seen++; if(first && !g.fixed && !g.keep && g.rv !== cur) stale.push({ c:c, album:m[2] });
      if(g.keep){ same++; return; }
      var to = byLow[low(g.a)];
      if(!g.sure || !to || stateOf(R, to.name) !== "use"){ unsure.push({ name:it.name, size:it.size, album:m[2], clipId:c.id, why:g.why || "" }); return; } /* อัลบั้มปลายทางหายไป/ถูกล็อกหลัง AI ดู = ให้ Han เลือกใหม่ */
      if(to.name === m[2]){ same++; return; }
      var dest = m[1] + "/" + to.name + "/" + it.name; if(seenTo[dest]){ dup++; return; } /* ชื่อซ้ำ (ไฟล์เดียวกันกระจายหลายอัลบั้ม) ย้ายแค่ตัวแรก */
      seenTo[dest] = 1;
      moves.push({ name:it.name, size:it.size, from:m[1] + "/" + m[2] + "/" + it.name, to:dest, album:m[2], toAlbum:to.name, clipId:c.id, why:g.why || "", fixed:!!g.fixed });
    });
    return { moves:moves, unsure:unsure, todo:todo, stale:stale, noIdx:noIdx, same:same, dup:dup, hidden:hidden, locked:locked, seen:seen, total:total, albums:al, rv:cur };
  }

  /* ---------- ให้ AI ดูว่าแต่ละคลิปควรอยู่อัลบั้มไหน ---------- */
  function brief(c){ /* สรุปคลิปเป็นข้อความสั้นจากดัชนีที่มีอยู่ (ตัวละคร+คำอธิบายฉาก+บทพูด) · ไม่ส่งรูป ราคาถูก */
    var sc = c.scenes || [], pick = sc.length <= 8 ? sc : [0, 1, 2, 3, 4, 5, 6, 7].map(function(i){ return sc[Math.round(i * (sc.length - 1) / 7)]; });
    var ar = U.arcOf(c), out = ["length " + Math.round(c.duration || 0) + "s" + (ar.arc ? " · arc: " + ar.arc : "")];
    pick.forEach(function(s){ var a = s.ai || {}; out.push("[" + U.tm(s.s) + "] " + (U.chars(s).map(U.enName).join(", ") || "-") + " · " + String(a.summary_th || "").slice(0, 140)); });
    var sp = c.speech && !c.speech.silent && c.speech.segs ? c.speech.segs.slice(0, 16).map(function(g){ return (g.who ? g.who + ": " : "") + g.t; }).join(" / ").slice(0, 600) : "";
    if(c.speech && c.speech.sum) out.push("scene summary from audio: " + String(c.speech.sum).slice(0, 200));
    if(sp) out.push("dialogue: " + sp);
    return out.join("\n");
  }
  async function classify(list){
    if(aiRun || !list.length) return;
    if(!FT.orKey()){ await MWDialog.alert("ยังไม่มี OpenRouter key ในแอพ ไปใส่ที่ ตั้งค่า > คีย์ API ก่อน"); return; }
    var R = rules(), al = albums(), targets = al.filter(function(a){ return stateOf(R, a.name) === "use"; }).map(function(a){ return { name:a.name, desc:R.desc[low(a.name)] || "" }; }), cur = rv(R, al);
    if(!targets.length){ await MWDialog.alert("ยังไม่มีอัลบั้มที่ตั้งเป็น \"ใช้\" (ดูที่ กติกาจัดอัลบั้ม)"); return; }
    if(!await MWDialog.confirm("ให้ AI ดูว่า " + list.length + " คลิปควรอยู่อัลบั้มไหน?\n\n" + (R.avg ? "ประมาณ " + U.money(R.avg * list.length) + " (จากรอบก่อน)" : "ยังไม่รู้ราคา: ลองชุดเล็กก่อนจะเห็นราคาจริงต่อคลิป") + "\nAI อ่านดัชนี+บทพูดที่มีอยู่ ไม่ส่งรูป · ยังไม่ย้ายไฟล์ ดูแผนก่อนได้", { ok:"เริ่ม", cancel:"ยกเลิก" })) return;
    aiRun = true; aiStop = false; aiMsg = ""; var n = 0, cost = 0, failB = 0, lastErr = null; render(); await U.wake(true);
    try{
      for(var i = 0; i < list.length && !aiStop; i += BATCH){
        var g = list.slice(i, i + BATCH), r = null, items = g.map(function(x, k){ return { n:k + 1, album:x.album, brief:brief(x.c) }; });
        for(var t = 0; t < 2 && !r; t++){ /* ตอบเพี้ยน (ไม่ใช่ JSON) = ลองอีกรอบ · ค่าที่จ่ายไปแล้วนับด้วย */
          try{ r = await FT.sortAlbums(items, targets, R.general); }catch(err){ if(err.cost) cost += err.cost; if(err.budget) throw err; lastErr = err; } }
        if(!r){ failB++; if(failB >= 3) throw lastErr; n += g.length; aiMsg = n + "/" + list.length + " · ข้ามชุดที่ AI ตอบไม่ได้ " + failB + " ชุด"; render(); continue; }
        failB = 0; cost += r.cost;
        g.forEach(function(x, k){ var a = r.map[k + 1] || { a:"", sure:false, why:"" }; x.c.albAi = { a:a.a, sure:a.sure, why:a.why, rv:cur, at:Date.now() }; });
        await FT.store.putMany(g.map(function(x){ return x.c; })); n += g.length;
        aiMsg = "AI ดูแล้ว " + n + "/" + list.length + " คลิป · ใช้ " + U.money(cost); render();
      }
      aiMsg = (aiStop ? "หยุดแล้ว" : "เสร็จ") + ": AI ดู " + n + " คลิป ใช้ " + U.money(cost);
      if(n){ var Rs = MWStore.get(RKEY, null) || {}; Rs.avg = cost / n; MWStore.set(RKEY, Rs); }
    }catch(err){ aiMsg = (err.budget ? "ถึงเพดานงบ: " : "ไม่สำเร็จ: ") + (err.message || err) + " · ดูไปแล้ว " + n + " คลิป (กดใหม่ทำต่อ)"; }
    U.addCost(cost); aiRun = false; await U.wake(false); render();
  }

  /* ---------- ย้ายไฟล์ + บันทึก + เลิกทำ ---------- */
  async function run(list, onStep, onDone){ /* ย้ายทีละไฟล์ · พลาดติดกัน FAIL_STOP ครั้งหยุด · คืน { done:[], fail, last } */
    var M = mover(), done = [], fail = 0, skip = 0, bad = 0, last = "";
    for(var i = 0; i < list.length; i++){
      if(onStep) onStep(i, list.length);
      try{ await M.move({ from:list[i].from, to:list[i].to }); done.push(list[i]); bad = 0; if(onDone) onDone(list[i]); }
      catch(e){ last = (e && (e.message || e.errorMessage)) || String(e);
        if(/target exists|source missing/.test(last)){ skip++; continue; } /* ปลายทางมีชื่อนี้แล้ว/ต้นทางหายไปแล้ว = ข้ามคลิปนั้น ไม่นับว่าระบบพัง (ไม่ให้ไปหยุดทั้งชุด) */
        fail++; bad++; if(bad >= FAIL_STOP) break; }
    }
    return { done:done, fail:fail, skip:skip, last:last };
  }
  async function afterMove(done){ /* ป้ายอัลบั้มในดัชนี = ชื่อใหม่ · สแกนมือถือใหม่ให้หน้าอัลบั้มวาดตามของจริง */
    var puts = []; done.forEach(function(x){ var c = U.lib().find(function(z){ return z.id === x.clipId; }); if(c && c.album !== x.toAlbum){ c.album = x.toAlbum; puts.push(FT.store.put(c)); } });
    try{ await Promise.all(puts); }catch(e){}
    try{ await MWLocal.scan(); }catch(e){} /* รอสแกนเสร็จจริงก่อนวาดแผนใหม่ (ไม่งั้นเสนอย้ายไฟล์ที่ย้ายไปแล้ว) */
    document.dispatchEvent(new CustomEvent("ft:lib"));
  }
  function rec(x){ return { from:x.from, to:x.to, name:x.name, album:x.album, toAlbum:x.toAlbum, clipId:x.clipId }; }
  function journalStart(){ var j = load(), at = Date.now(); j.batches.unshift({ at:at, items:[] }); j.batches = j.batches.slice(0, KEEP); MWStore.set(KEY, j); return at; }
  function journalAdd(at, x){ var j = load(), b = j.batches.find(function(z){ return z.at === at; }); if(b){ b.items.push(rec(x)); MWStore.set(KEY, j); } } /* จดทีละไฟล์ทันทีที่ย้ายสำเร็จ: แอพถูกปิดกลางทาง ยังเลิกทำส่วนที่ย้ายไปแล้วได้ */
  function journalEnd(at){ var j = load(); j.batches = j.batches.filter(function(z){ return z.at !== at || z.items.length; }); MWStore.set(KEY, j); }
  async function doMove(list, label){
    if(busy || !list.length) return; busy = true;
    var at = journalStart(), r = await run(list, function(i, n){ say("กำลังย้าย " + (i + 1) + "/" + n + "..."); }, function(x){ journalAdd(at, x); });
    journalEnd(at); await afterMove(r.done);
    busy = false; await render(); say(label + ": ย้ายแล้ว " + r.done.length + " คลิป" + (r.skip ? " · ข้าม " + r.skip + " (ชื่อซ้ำที่ปลายทาง/ไฟล์หาย)" : "") + (r.fail ? " · พลาด " + r.fail + (r.last ? " (" + r.last + ")" : "") : "") + (r.done.length ? " · กด เลิกทำ ถ้าไม่ถูกใจ" : ""), r.fail ? "err" : "ok");
  }
  async function undo(){
    if(busy) return; var j = load(), b = j.batches[0]; if(!b) return; busy = true;
    var M = mover(), back = [], fail = 0, left = [];
    for(var i = b.items.length - 1; i >= 0; i--){ var x = b.items[i]; say("กำลังย้ายกลับ " + (b.items.length - i) + "/" + b.items.length + "...");
      try{ await M.move({ from:x.to, to:x.from }); back.push({ clipId:x.clipId, toAlbum:x.album }); }catch(e){ fail++; if(!/source missing/.test((e && (e.message || e.errorMessage)) || "")) left.unshift(x); } } /* ไฟล์ไม่อยู่ที่ปลายทางแล้ว (ถูกย้าย/ลบเอง) = ทิ้งจากบันทึก ไม่ค้างขวางการเลิกทำชุดเก่า */
    if(left.length) b.items = left; else j.batches.shift(); /* ที่ย้ายกลับไม่สำเร็จเก็บไว้ในชุดเดิม กดเลิกทำซ้ำได้ */
    MWStore.set(KEY, j); await afterMove(back);
    busy = false; await render(); say("เลิกทำแล้ว: ย้ายกลับ " + back.length + " คลิป" + (fail ? " · พลาด " + fail + " (ไฟล์ถูกย้าย/ลบไปแล้ว?)" : ""), fail ? "err" : "ok");
  }

  /* ---------- หน้าจอ (เต็มจอ ทับหน้าอัลบั้ม · ปุ่มย้อน = ปิด) ---------- */
  var esc = function(s){ return U.esc(String(s == null ? "" : s)); };
  var say = function(t, cls){ var p = $("orgMsg"); if(p){ p.textContent = t; p.className = "hint" + (cls ? " " + cls : ""); } };
  var openG = {}; /* กลุ่มที่กางอยู่ (จำไว้ตอนวาดใหม่) */
  function row(x, kind){ return '<button type="button" class="orgrow" data-pick="' + esc(x.clipId) + '" data-kind="' + kind + '"><b>' + esc(x.name) + "</b><small>" + esc(x.album) + (kind === "mv" ? " → " + esc(x.toAlbum) : "") + (x.why ? " · " + esc(x.why) : "") + (x.fixed ? " · เลือกเอง" : "") + "</small></button>"; }
  function group(id, title, rows, extra){ var on = !!openG[id]; return '<div class="orggrp"><div class="orggh"><button type="button" class="orgtg" data-g="' + id + '">' + title + "<span>" + (on ? "ย่อ" : "ดู") + "</span></button>" + (extra || "") + "</div>" + (on ? '<div class="orgrows">' + rows.join("") + "</div>" : "") + "</div>"; }
  async function render(){
    if(!open) return;
    var native = !!plug("Filesystem"), M = mover(), j = load(), last = j.batches[0], R = rules();
    plan = buildPlan();
    var h = '<div class="orgtop"><button class="alback" id="orgX" type="button" aria-label="กลับ"><svg class="ic" aria-hidden="true"><use href="#i-back"/></svg></button><div><b>จัดอัลบั้มใหม่</b><small>ตามอัลบั้มเดิมของคุณ · ย้ายไฟล์จริง ไม่ลบอะไร เลิกทำได้</small></div></div>';
    /* 1) ให้ AI ดู */
    h += '<section class="orgsec"><h3>1. ให้ AI ดูว่าคลิปไหนควรอยู่อัลบั้มไหน</h3><p class="hint">AI ดูแล้ว <b>' + plan.seen + "</b>/" + plan.total + " คลิป" + (plan.noIdx.length ? " · ยังไม่ทำดัชนี " + plan.noIdx.length + " คลิป (AI ยังไม่รู้ว่าเป็นฉากอะไร)" : "") + (plan.locked ? " · ไม่แตะ " + plan.locked + " คลิปในอัลบั้มที่ล็อก" : "") + "</p>";
    if(aiRun) h += '<div class="orgbtns"><button class="btn ghost" id="orgAiStop" type="button">หยุด</button></div>';
    else {
      var b = [];
      if(plan.todo.length) b.push('<button class="btn' + (plan.seen ? " ghost" : "") + '" id="orgTry" type="button">ลองก่อน ' + Math.min(TRY_N, plan.todo.length) + " คลิป</button>");
      if(plan.todo.length > TRY_N || plan.seen && plan.todo.length) b.push('<button class="btn" id="orgAiAll" type="button">ดูที่เหลือ ' + plan.todo.length + "</button>");
      if(plan.stale.length) b.push('<button class="btn ghost" id="orgStale" type="button">ดูใหม่ตามกติกาใหม่ (' + plan.stale.length + ")</button>");
      if(plan.noIdx.length) b.push('<button class="btn ghost" id="orgIdx" type="button">ทำดัชนีที่เหลือ (' + plan.noIdx.length + ")</button>");
      if(b.length) h += '<div class="orgbtns">' + b.join("") + "</div>";
    }
    if(aiMsg) h += '<p class="hint">' + esc(aiMsg) + "</p>";
    if(plan.stale.length && !aiRun) h += '<p class="hint">กติกาเปลี่ยนหลังจาก AI ดู ' + plan.stale.length + " คลิป · แผนข้างล่างยังใช้คำตอบเดิม</p>";
    h += "</section>";
    /* 2) แผนย้าย */
    var by = {}; plan.moves.forEach(function(x){ (by[x.toAlbum] = by[x.toAlbum] || []).push(x); });
    var names = Object.keys(by).sort(function(a, b){ return by[b].length - by[a].length; });
    h += '<section class="orgsec"><h3>2. ดูแผน แล้วย้าย</h3><p class="hint">' + (plan.moves.length ? "จะย้าย <b>" + plan.moves.length + "</b> คลิป เข้า <b>" + names.length + "</b> อัลบั้ม" : "ยังไม่มีคลิปที่ต้องย้าย") + (plan.same ? " · อยู่ถูกแล้ว " + plan.same : "") + (plan.dup ? " · ข้าม " + plan.dup + " ไฟล์ชื่อซ้ำ" : "") + "</p>";
    if(names.length) h += '<p class="hint tip">แตะคลิปเพื่อเลือกอัลบั้มเอง หรือสั่งไม่ย้าย</p>';
    var canMove = false;
    if(!native) h += '<p class="hint err">ย้ายไฟล์ได้เฉพาะในแอพ APK</p>';
    else if(!M) h += '<p class="hint err">ต้องติดตั้ง APK ใหม่ (สร้างจาก workflow build-apk) ก่อน ถึงจะย้ายไฟล์ได้</p>';
    else {
      var ok = true; try{ ok = !!(await M.hasAccess()).granted; }catch(e){}
      if(!ok) h += '<p class="hint warn">ต้องเปิดสิทธิ์ "เข้าถึงไฟล์ทั้งหมด" ให้แอพนี้ก่อน (Android ไม่ให้ย้ายไฟล์ของแอพอื่นถ้าไม่เปิด)</p><button class="btn" id="orgPerm" type="button" style="width:100%">เปิดสิทธิ์เข้าถึงไฟล์ทั้งหมด</button>';
      else canMove = true;
    }
    names.forEach(function(n){ h += group("m:" + n, "→ " + esc(n) + " <em>" + by[n].length + "</em>", by[n].map(function(x){ return row(x, "mv"); }), canMove ? '<button class="btn small" type="button" data-mvg="' + esc(n) + '">ย้าย</button>' : ""); });
    if(canMove && plan.moves.length) h += '<div class="orgbtns"><button class="btn ghost" id="orgTrial" type="button">ย้ายทดลอง ' + Math.min(TRIAL, plan.moves.length) + ' คลิป</button><button class="btn" id="orgAll" type="button">ย้ายทั้งหมด ' + plan.moves.length + "</button></div>";
    if(last && M) h += '<button class="btn ghost small" id="orgUndo" type="button" style="width:100%;margin-top:8px">เลิกทำการย้ายล่าสุด (' + last.items.length + " คลิป · " + new Date(last.at).toLocaleString("th-TH", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" }) + ")</button>";
    h += '<p class="hint" id="orgMsg"></p>';
    if(plan.unsure.length) h += group("unsure", "AI ไม่แน่ใจ <em>" + plan.unsure.length + "</em>", plan.unsure.map(function(x){ return row(x, "un"); }), "") + '<p class="hint tip">คลิปที่ AI ไม่แน่ใจ จะไม่ถูกย้าย จนกว่าคุณจะแตะเลือกอัลบั้มให้</p>';
    h += "</section>";
    /* 3) กติกา */
    var al = plan.albums;
    h += '<section class="orgsec"><h3>3. กติกาจัดอัลบั้ม</h3><p class="hint tip">AI ใช้ข้อความพวกนี้ตัดสิน แก้ได้ตลอด (บันทึกเอง) · แก้แล้วกด ดูใหม่ตามกติกาใหม่ ถ้าอยากให้คลิปที่ดูแล้วถูกดูใหม่</p>';
    h += '<label class="orglab">กติการวม</label><textarea class="orgta" rows="6" data-gen="1">' + esc(R.general) + "</textarea>";
    h += al.map(function(a){ var st = stateOf(R, a.name); return '<div class="orgal"><div class="orgalh"><b>' + esc(a.name) + " <em>" + a.n + '</em></b><button type="button" class="orgst st-' + st + '" data-st="' + esc(a.name) + '">' + STATES[st] + "</button></div>" + (st === "use" ? '<textarea class="orgta" rows="2" data-desc="' + esc(a.name) + '" placeholder="อัลบั้มนี้เก็บฉากแบบไหน (ว่าง = AI เดาจากชื่อ)">' + esc(R.desc[low(a.name)] || "") + "</textarea>" : "") + "</div>"; }).join("");
    h += "</section>";
    var box = $("orgBox"), y = box.scrollTop; box.innerHTML = h; box.scrollTop = y;
  }
  function setOpen(on){
    if(on === open) return; open = on; $("orgBox").hidden = !on; document.documentElement.classList.toggle("orgopen", on);
    if(on){ history.pushState({ org:1 }, ""); $("orgBox").scrollTop = 0; render(); }
  }
  function saveRule(fn){ var r = MWStore.get(RKEY, null) || {}; fn(r); MWStore.set(RKEY, r); }
  function pickFor(clipId){ /* แตะคลิปในแผน/ที่ไม่แน่ใจ = เลือกอัลบั้มเอง (fixed: AI ไม่ทับ) หรือไม่ย้าย */
    var c = U.lib().find(function(z){ return z.id === clipId; }); if(!c) return;
    var R = rules(), al = plan.albums.filter(function(a){ return stateOf(R, a.name) === "use"; });
    FT.pick.open({ title:"ย้าย " + c.name + " ไปที่", placeholder:"พิมพ์ชื่ออัลบั้ม", icon:"folder",
      items:function(q){ var rows = [{ k:"\u0000keep", name:"ไม่ย้าย (อยู่ที่เดิม)", sub:"", on:!!(c.albAi && c.albAi.keep) }, { k:"\u0000ai", name:"ให้ AI ตัดสินใหม่", sub:"", on:false }].concat(al.map(function(a){ return { k:a.name, name:a.name, sub:a.n + " คลิป", on:!!(c.albAi && c.albAi.fixed && c.albAi.a === a.name) }; }));
        return rows.filter(function(r){ return !q || r.name.toLowerCase().indexOf(q) >= 0; }); },
      onPick:async function(k){
        c.albAi = k === "\u0000keep" ? { keep:true, at:Date.now() } : k === "\u0000ai" ? null : { a:k, sure:true, fixed:true, why:"เลือกเอง", at:Date.now() };
        if(!c.albAi) delete c.albAi;
        try{ await FT.store.put(c); }catch(err){ await MWDialog.alert("บันทึกไม่ได้: " + (err.message || err)); }
        render();
      } });
  }
  $("orgBtn").addEventListener("click", function(){ setOpen(true); });
  window.addEventListener("popstate", function(){ if(open) setOpen(false); }); /* ปุ่มย้อน/ลูกศร = ปิดหน้านี้ กลับหน้าอัลบั้ม */
  $("orgBox").addEventListener("click", async function(e){
    var t = e.target.closest("[data-g]"); if(t){ openG[t.dataset.g] = !openG[t.dataset.g]; render(); return; }
    t = e.target.closest("[data-pick]"); if(t){ pickFor(t.dataset.pick); return; }
    t = e.target.closest("[data-st]"); if(t){ var n = low(t.dataset.st), R = rules(), order = ["use", "lock", "inbox"], nx = order[(order.indexOf(stateOf(R, n)) + 1) % 3]; saveRule(function(r){ r.state = Object.assign({}, r.state || {}); r.state[n] = nx; }); render(); return; }
    t = e.target.closest("[data-mvg]"); if(t){ var g = plan.moves.filter(function(x){ return x.toAlbum === t.dataset.mvg; }); if(await MWDialog.confirm("ย้าย " + g.length + " คลิปเข้า " + t.dataset.mvg + "? (ไม่ลบอะไร เลิกทำได้ทั้งชุด)", { ok:"ย้ายเลย", cancel:"ยกเลิก" })) doMove(g, "ย้ายเข้า " + t.dataset.mvg); return; }
    var id = e.target.closest("button") && e.target.closest("button").id; if(!id) return;
    if(id === "orgX") history.back();
    else if(id === "orgTry") classify(plan.todo.slice(0, TRY_N));
    else if(id === "orgAiAll") classify(plan.todo);
    else if(id === "orgStale") classify(plan.stale);
    else if(id === "orgAiStop"){ aiStop = true; aiMsg = "จะหยุดหลังชุดนี้..."; render(); }
    else if(id === "orgIdx") U.runIndexFor(plan.noIdx);
    else if(id === "orgPerm"){ try{ await mover().requestAccess(); say("เปิดหน้าตั้งค่าแล้ว · เปิดสวิตช์ให้แอพนี้ แล้วกลับมาที่นี่"); }catch(err){ say("เปิดหน้าตั้งค่าไม่ได้: " + (err && err.message || err), "err"); } }
    else if(id === "orgTrial") doMove(plan.moves.slice(0, TRIAL), "ทดลอง");
    else if(id === "orgAll"){ if(await MWDialog.confirm("ย้าย " + plan.moves.length + " คลิปเข้าอัลบั้มตามแผน? (ไม่ลบอะไร เลิกทำได้ทั้งชุด)", { ok:"ย้ายเลย", cancel:"ยกเลิก" })) doMove(plan.moves, "ย้ายทั้งหมด"); }
    else if(id === "orgUndo") undo();
  });
  $("orgBox").addEventListener("change", function(e){ /* แก้กติกา = บันทึกทันที · ไม่วาดใหม่ (ไม่ให้แป้นพิมพ์หลุด) */
    var t = e.target; if(t.dataset.gen) saveRule(function(r){ r.general = t.value; });
    else if(t.dataset.desc) saveRule(function(r){ r.desc = Object.assign({}, r.desc || {}); r.desc[low(t.dataset.desc)] = t.value.trim(); });
  });
  function again(){ if(open && !busy && !aiRun && !($("orgBox").contains(document.activeElement) && document.activeElement.tagName === "TEXTAREA")) render(); } /* กำลังพิมพ์กติกาอยู่ = ไม่วาดทับ */
  document.addEventListener("ft:lib", again);
  document.addEventListener("ft:files", again); /* สแกนมือถือเสร็จ = แผนใหม่ตามไฟล์จริง */
  document.addEventListener("visibilitychange", function(){ if(!document.hidden) again(); }); /* กลับจากหน้าตั้งค่าสิทธิ์ = ตรวจสิทธิ์ใหม่ให้เอง */
  FT.organize = { buildPlan:buildPlan, rules:rules, brief:brief, isOpen:function(){ return open; } };
})();
