/* footage-organize.js — "จัดอัลบั้มใหม่": ย้ายไฟล์จริงในแกลเลอรีมือถือเข้าอัลบั้มที่ AI จัดให้ตามภาค/เรื่อง (CapCut เห็นอัลบั้มใหม่เลย ไม่ต้องก๊อป/ส่งออก)
   แผน (buildPlan): ไฟล์ในอัลบั้มจริงของแกลเลอรี (…/Gallery/owner/<อัลบั้ม>/) ที่ดัชนีรู้ภาคแน่นอน (U.arcOf sure) → โฟลเดอร์ "<เลข> <ภาค>" ข้างๆ กัน (เลขตามลำดับเนื้อเรื่อง เรียงในแกลเลอรีถูก) · ไม่รู้ภาค = ไม่แตะ (ให้ปุ่ม ให้ AI ดูภาค ในแถบภาคช่วยก่อน)
   ย้ายด้วยปลั๊กอินเนทีฟ MediaScan.move (rename + แจ้งแกลเลอรี) ต้องมี APK ใหม่ + สิทธิ์ "เข้าถึงไฟล์ทั้งหมด" · ไม่ลบอะไร · จดบันทึกทุกการย้าย (mw_org_v1) เลิกทำได้ · ชื่อซ้ำในโฟลเดอร์ปลายทาง = ข้าม */
(function(){
  "use strict";
  var FT = window.FT, U = FT && FT.ui; if(!U || !window.MWLocal) return;
  var $ = function(id){ return document.getElementById(id); };
  var KEY = "mw_org_v1", KEEP = 5, TRIAL = 3, FAIL_STOP = 3, busy = false, plan = null, expanded = false;
  function plug(n){ var c = window.Capacitor; return c && c.isNativePlatform && c.isNativePlatform() && c.Plugins && c.Plugins[n] && (!c.isPluginAvailable || c.isPluginAvailable(n)) ? c.Plugins[n] : null; }
  function mover(){ var m = plug("MediaScan"); return m && m.move && m.hasAccess ? m : null; }
  function load(){ var j = MWStore.get(KEY, null); return j && Array.isArray(j.batches) ? j : { batches:[] }; }
  function pad(n){ return n < 10 ? "0" + n : String(n); }
  function nameOfArc(arc){ var i = U.ARCS.indexOf(arc); return (i < 0 ? "99" : pad(i + 1)) + " " + arc.replace(/[\\/:*?"<>|]/g, " ").trim(); } /* ชื่อโฟลเดอร์: เลขลำดับเนื้อเรื่อง + ภาค */
  function clipOf(it){ return U.lib().find(function(c){ return c.name === it.name && c.size === it.size && c.status === "done" && !c.hide; }); }

  function buildPlan(){ /* คืน { moves:[{ name, size, from, to, album, toAlbum, clipId }], byAlbum:{ ชื่อ:จำนวน }, unsure, dup, skipped } */
    var moves = [], byAlbum = {}, seenTo = {}, unsure = 0, dup = 0, same = 0, noIdx = []; /* noIdx = ไฟล์ในอัลบั้มจริงที่ยังไม่ได้ทำดัชนี (ย้ายไม่ได้ เพราะยังไม่รู้ภาค) */
    (MWLocal.list() || []).forEach(function(it){
      var m = /^(.*\/Gallery\/owner)\/([^\/]+)\/$/.exec(it.dir || ""); if(!m) return; /* เฉพาะอัลบั้มจริงของแกลเลอรี (สำเนาในแอพอยู่ Documents/Meowrin/library จึงไม่เข้า) · ห้ามกรองด้วย it.lib: local.js ติดป้าย lib ให้ "ต้นฉบับที่มีสำเนาแล้ว" ด้วย ไม่ได้แปลว่าเป็นสำเนา */
      var c = clipOf(it); if(!c){ noIdx.push({ name:it.name, size:it.size, uri:it.uri, album:it.album, mtime:it.mtime }); return; }
      var ar = U.arcOf(c); if(!ar.arc || !ar.sure){ unsure++; return; }
      var to = nameOfArc(ar.arc); if(to === m[2]){ same++; return; }
      var dest = m[1] + "/" + to + "/" + it.name; if(seenTo[dest]){ dup++; return; } /* ชื่อซ้ำ (ไฟล์เดียวกันกระจายหลายอัลบั้ม) ย้ายแค่ตัวแรก */
      seenTo[dest] = 1; byAlbum[to] = (byAlbum[to] || 0) + 1;
      moves.push({ name:it.name, size:it.size, from:m[1] + "/" + m[2] + "/" + it.name, to:dest, album:m[2], toAlbum:to, clipId:c.id });
    });
    return { moves:moves, byAlbum:byAlbum, unsure:unsure, dup:dup, same:same, noIdx:noIdx };
  }

  async function run(list, onStep){ /* ย้ายทีละไฟล์ · พลาดติดกัน FAIL_STOP ครั้งหยุด · คืน { done:[], fail, last } */
    var M = mover(), done = [], fail = 0, bad = 0, last = "";
    for(var i = 0; i < list.length; i++){
      if(onStep) onStep(i, list.length);
      try{ await M.move({ from:list[i].from, to:list[i].to }); done.push(list[i]); bad = 0; }
      catch(e){ fail++; bad++; last = (e && (e.message || e.errorMessage)) || String(e); if(bad >= FAIL_STOP) break; }
    }
    return { done:done, fail:fail, last:last };
  }
  async function afterMove(done){ /* ป้ายอัลบั้มในดัชนี = ชื่อใหม่ · สแกนมือถือใหม่ให้หน้าอัลบั้มวาดตามของจริง */
    var puts = []; done.forEach(function(x){ var c = U.lib().find(function(z){ return z.id === x.clipId; }); if(c && c.album !== x.toAlbum){ c.album = x.toAlbum; puts.push(FT.store.put(c)); } });
    try{ await Promise.all(puts); }catch(e){}
    var b = $("alScan"); if(b && !b.hidden) b.click(); else try{ await MWLocal.scan(); }catch(e){}
  }
  function journal(done){ if(!done.length) return; var j = load(); j.batches.unshift({ at:Date.now(), items:done.map(function(x){ return { from:x.from, to:x.to, name:x.name, album:x.album, toAlbum:x.toAlbum, clipId:x.clipId }; }) }); j.batches = j.batches.slice(0, KEEP); MWStore.set(KEY, j); }

  function box(html){ $("orgBox").innerHTML = html; $("orgBox").hidden = !html; }
  var say = function(t, cls){ var p = $("orgMsg"); if(p){ p.textContent = t; p.className = "hint" + (cls ? " " + cls : ""); } };
  async function render(){
    var native = !!plug("Filesystem"), M = mover(), j = load(), last = j.batches[0];
    plan = buildPlan();
    var h = '<div class="orghead"><b>จัดอัลบั้มใหม่ตามภาค/เรื่อง</b><small>ย้ายไฟล์จริงในแกลเลอรี CapCut จะเห็นอัลบั้มใหม่เลย · ไม่ลบอะไร · เลิกทำได้</small></div>';
    h += '<p class="hint">' + (plan.moves.length ? "จะย้าย <b>" + plan.moves.length + "</b> คลิป เข้า <b>" + Object.keys(plan.byAlbum).length + "</b> อัลบั้ม" : "ไม่มีคลิปที่ต้องย้ายตอนนี้") + (plan.noIdx.length ? " · ยังไม่ได้ทำดัชนี " + plan.noIdx.length + " คลิป" : "") + (plan.unsure ? " · ไม่แตะ " + plan.unsure + " คลิปที่ยังไม่แน่ใจภาค" : "") + (plan.dup ? " · ข้าม " + plan.dup + " ไฟล์ชื่อซ้ำ" : "") + "</p>";
    var names = Object.keys(plan.byAlbum).sort();
    if(names.length) h += '<div class="orglist">' + names.slice(0, expanded ? 999 : 6).map(function(n){ return "<span>" + U.esc(n) + " <em>" + plan.byAlbum[n] + "</em></span>"; }).join("") + (names.length > 6 ? '<button class="btn small ghost" id="orgMore" type="button">' + (expanded ? "ย่อ" : "ดูทั้งหมด " + names.length) + "</button>" : "") + "</div>";
    var nArc = U.arcTodoCount ? U.arcTodoCount() : 0; /* ช่วยให้แผนครบขึ้น: ทำดัชนีที่เหลือ → ให้ AI ดูภาคที่ยังไม่แน่ใจ */
    if(plan.noIdx.length || nArc) h += '<div class="orgbtns">' + (plan.noIdx.length ? '<button class="btn small" id="orgIdx" type="button">ให้ AI ทำดัชนีที่เหลือ (' + plan.noIdx.length + ")</button>" : "") + (nArc ? '<button class="btn small" id="orgArc" type="button">ให้ AI ดูภาค (' + nArc + ")</button>" : "") + "</div>";
    if(!native) h += '<p class="hint err">ใช้ได้เฉพาะในแอพ APK</p>';
    else if(!M) h += '<p class="hint err">ต้องติดตั้ง APK ใหม่ (สร้างจาก workflow build-apk) ก่อน ถึงจะย้ายไฟล์ได้ · ดูตัวอย่างแผนได้ตามด้านบน</p>';
    else {
      var ok = true; try{ ok = !!(await M.hasAccess()).granted; }catch(e){}
      if(!ok) h += '<p class="hint warn">ต้องเปิดสิทธิ์ "เข้าถึงไฟล์ทั้งหมด" ให้แอพนี้ก่อน (Android ไม่ให้ย้ายไฟล์ของแอพอื่นถ้าไม่เปิด)</p><button class="btn" id="orgPerm" type="button" style="width:100%">เปิดสิทธิ์เข้าถึงไฟล์ทั้งหมด</button>';
      else if(plan.moves.length) h += '<div class="orgbtns"><button class="btn ghost" id="orgTrial" type="button">ย้ายทดลอง ' + Math.min(TRIAL, plan.moves.length) + ' คลิป</button><button class="btn" id="orgAll" type="button">ย้ายทั้งหมด ' + plan.moves.length + "</button></div>";
    }
    if(last && M) h += '<button class="btn ghost small" id="orgUndo" type="button" style="width:100%;margin-top:8px">เลิกทำการย้ายล่าสุด (' + last.items.length + " คลิป · " + new Date(last.at).toLocaleString("th-TH", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" }) + ")</button>";
    h += '<p class="hint" id="orgMsg"></p>';
    box(h);
  }
  async function doMove(list, label){
    if(busy || !list.length) return; busy = true;
    var r = await run(list, function(i, n){ say("กำลังย้าย " + (i + 1) + "/" + n + "..."); });
    journal(r.done); await afterMove(r.done);
    await render(); say(label + ": ย้ายแล้ว " + r.done.length + " คลิป" + (r.fail ? " · พลาด " + r.fail + (r.last ? " (" + r.last + ")" : "") : "") + (r.done.length ? " · กด เลิกทำ ถ้าไม่ถูกใจ" : ""), r.fail ? "err" : "ok");
    busy = false;
  }
  async function undo(){
    if(busy) return; var j = load(), b = j.batches[0]; if(!b) return; busy = true;
    var M = mover(), back = [], fail = 0;
    for(var i = b.items.length - 1; i >= 0; i--){ var x = b.items[i]; say("กำลังย้ายกลับ " + (b.items.length - i) + "/" + b.items.length + "...");
      try{ await M.move({ from:x.to, to:x.from }); back.push({ clipId:x.clipId, toAlbum:x.album }); }catch(e){ fail++; } }
    j.batches.shift(); MWStore.set(KEY, j); await afterMove(back);
    await render(); say("เลิกทำแล้ว: ย้ายกลับ " + back.length + " คลิป" + (fail ? " · พลาด " + fail + " (ไฟล์ถูกย้าย/ลบไปแล้ว?)" : ""), fail ? "err" : "ok"); busy = false;
  }

  $("orgBtn").addEventListener("click", function(){ if($("orgBox").hidden) render(); else box(""); });
  $("orgBox").addEventListener("click", async function(e){
    var id = e.target.closest("button") && e.target.closest("button").id; if(!id) return;
    if(id === "orgMore"){ expanded = !expanded; render(); }
    else if(id === "orgPerm"){ try{ await mover().requestAccess(); say("เปิดหน้าตั้งค่าแล้ว · เปิดสวิตช์ให้แอพนี้ แล้วกลับมาแตะ จัดอัลบั้มใหม่ อีกครั้ง"); }catch(err){ say("เปิดหน้าตั้งค่าไม่ได้: " + (err && err.message || err), "err"); } }
    else if(id === "orgIdx") U.runIndexFor(plan.noIdx);
    else if(id === "orgArc") U.runArcs();
    else if(id === "orgTrial") doMove(plan.moves.slice(0, TRIAL), "ทดลอง");
    else if(id === "orgAll"){ if(await MWDialog.confirm("ย้าย " + plan.moves.length + " คลิปเข้าอัลบั้มตามภาค? (ไม่ลบอะไร เลิกทำได้ทั้งชุด)", { ok:"ย้ายเลย", cancel:"ยกเลิก" })) doMove(plan.moves, "ย้ายทั้งหมด"); }
    else if(id === "orgUndo") undo();
  });
  document.addEventListener("ft:lib", function(){ if(!$("orgBox").hidden && !busy) render(); });
  FT.organize = { buildPlan:buildPlan, nameOfArc:nameOfArc };
})();
