/* footage-basket.js (FT.basket) — ตะกร้าฉาก + ตัดส่งออกไป CapCut (v8.64)
   ค้นเจอฉากไหน กด "เก็บฉาก" บนการ์ด → ตะกร้า (แถบลอย #bskBar ล่างจอ) → เปิดชีต #bskSheet → "ตัดเป็นไฟล์" = ตัดแต่ละฉากจากคลิปต้นฉบับเป็นไฟล์ mp4 สั้นๆ (ไม่แตะต้นฉบับ มีเสียงในคลิปติดไปด้วย)
   บันทึกลง Documents/Meowrin/picks/ ผ่าน MWNative.save (สั่งสแกนสื่อให้แกลเลอรี/CapCut เห็น) · ตัดด้วย mediabunny Conversion {trim} (โหลด Blob ทั้งไฟล์ก่อนต่อคลิป เหมือนฟังเสียง ไม่พึ่ง Range ของตัวช่วยไฟล์)
   เก็บตะกร้าที่ mw_basket_v1 { items:[{ id, cid, i, s, e, name, album, sum }], pad } · id = id คลิป#ลำดับฉาก
   ยังไม่ทดสอบบนมือถือจริง: ความเร็ว/ความถูกต้องของจุดเริ่มตัด (ต้นฉบับ H.264 ที่ไม่เริ่มที่ keyframe) · ไม่ใช่ไฟล์ H.264 ในเครื่องทดสอบ (Chromium) จึงทดสอบด้วย WebM */
(function(){
  "use strict";
  var FT = window.FT, U = FT && FT.ui; if(!FT || !U || !document.getElementById("bskSheet")) return;
  var $ = function(id){ return document.getElementById(id); }, KEY = "mw_basket_v1", PAD = 0.5, MIN = 0.3;
  var st = MWStore.get(KEY, null) || { items:[], pad:false }; if(!Array.isArray(st.items)) st.items = [];
  var run = false, stopF = false, fmt = "mp4";
  function save(){ MWStore.set(KEY, st); }
  function idOf(c, sc){ return c.id + "#" + c.scenes.indexOf(sc); }
  function has(c, sc){ var id = idOf(c, sc); return st.items.some(function(x){ return x.id === id; }); }
  function add(c, sc){ var id = idOf(c, sc); if(st.items.some(function(x){ return x.id === id; })) return; var a = sc.ai || {};
    st.items.push({ id:id, cid:c.id, i:c.scenes.indexOf(sc), s:sc.s, e:sc.e, name:c.name, album:c.album || "", sum:String(a.summary_th || "").slice(0, 80) }); save(); }
  function remove(id){ st.items = st.items.filter(function(x){ return x.id !== id; }); save(); }
  function toggle(c, sc){ if(has(c, sc)) remove(idOf(c, sc)); else add(c, sc); renderBar(); return has(c, sc); }
  function clear(){ st.items = []; save(); renderBar(); }
  function len(x){ return Math.max(0, x.e - x.s); }
  function nameFor(x, n){ var base = String(x.name || "clip").replace(/\.[a-z0-9]+$/i, "").replace(/[\\/:*?"<>|]+/g, "_").slice(0, 40), t = function(v){ var r = Math.round(v); return Math.floor(r / 60) + "m" + ("0" + (r % 60)).slice(-2) + "s"; };
    return String(n).padStart(2, "0") + "_" + base + "_" + t(x.s) + "-" + t(x.e) + "." + (fmt === "webm" ? "webm" : "mp4"); }

  function syncButtons(){ /* ปุ่ม เก็บฉาก ทุกใบบนหน้าให้ตรงกับตะกร้า (ลบ/ล้าง/ตัดเสร็จในชีตแล้วดาวบนการ์ดต้องหาย) */
    document.querySelectorAll(".bskadd[data-bk]").forEach(function(b){ var h = U.shownAt(+b.dataset.bk), on = !!(h && h.sc && has(h.c, h.sc)); b.classList.toggle("on", on); b.innerHTML = MWIcon("star") + (on ? "ในตะกร้า" : "เก็บฉาก"); });
  }
  function renderBar(){ var n = st.items.length, b = $("bskBar"); b.hidden = !n; document.body.classList.toggle("hasbsk", n > 0); syncButtons(); b.querySelector("span").textContent = "ตะกร้าฉาก " + n + " ฉาก"; if(!$("bskSheet").hidden) renderList(); }
  function renderList(msg){
    var tot = st.items.reduce(function(s, x){ return s + len(x); }, 0);
    $("bskInfo").textContent = st.items.length ? st.items.length + " ฉาก · รวม " + U.tm(tot) + " นาที" : "ตะกร้าว่าง · กด เก็บฉาก บนการ์ดฉากตอนค้นหา";
    $("bskList").innerHTML = st.items.map(function(x){ return '<div class="bskrow"><div class="tx"><b>' + U.esc(String(x.name).replace(/\.[a-z0-9]+$/i, "")) + "</b><small>" + U.tm(x.s) + "–" + U.tm(x.e) + " (" + len(x).toFixed(1) + " วิ)" + (x.sum ? " · " + U.esc(x.sum) : "") + '</small></div><button type="button" class="btn ghost small" data-rm="' + U.esc(x.id) + '" aria-label="เอาออก">' + MWIcon("x") + "</button></div>"; }).join("") || '<p class="hint">ยังไม่มีฉากในตะกร้า</p>';
    $("bskPad").checked = !!st.pad; $("bskRun").disabled = run || !st.items.length; $("bskRun").textContent = "ตัดเป็นไฟล์ส่งไป CapCut" + (st.items.length ? " (" + st.items.length + " ฉาก)" : ""); $("bskStop").hidden = !run;
    $("bskCopy").disabled = !st.items.length; $("bskClear").disabled = run || !st.items.length;
    if(msg !== undefined){ $("bskMsg").textContent = msg; }
  }

  async function cutOne(mb, blob, x, dur){ /* ตัดช่วง [s-pad, e+pad] ของ blob เป็นไฟล์ใหม่ → Blob */
    var input = new mb.Input({ source:new mb.BlobSource(blob), formats:mb.ALL_FORMATS });
    try{
      var a = Math.max(0, x.s - (st.pad ? PAD : 0)), b = x.e + (st.pad ? PAD : 0); if(dur) b = Math.min(b, dur); if(b - a < MIN) b = a + MIN;
      var output = new mb.Output({ format:fmt === "webm" ? new mb.WebMOutputFormat() : new mb.Mp4OutputFormat(), target:new mb.BufferTarget() });
      var conv = await mb.Conversion.init({ input:input, output:output, trim:{ start:a, end:b } });
      if(!conv.isValid) throw new Error("ตัดไม่ได้ (" + ((conv.discardedTracks || []).map(function(d){ return d.reason; }).join(",") || "ไฟล์ไม่รองรับ") + ")");
      await conv.execute(); return new Blob([output.target.buffer], { type:fmt === "webm" ? "video/webm" : "video/mp4" });
    } finally { try{ input.dispose(); }catch(e){} }
  }
  async function exportAll(){ /* ตัดทีละฉาก (จัดกลุ่มตามคลิป โหลดไฟล์ครั้งเดียวต่อคลิป) → MWNative.save · คืน { ok, fail, names } */
    if(run || !st.items.length) return null; run = true; stopF = false; renderList("");
    var mb = await FT.speech.loadMB(), items = st.items.slice(), by = {}, order = [], r = { ok:0, fail:0, names:[], err:"", saved:null }, n = 0, bad = 0;
    items.forEach(function(x){ if(!by[x.cid]){ by[x.cid] = []; order.push(x.cid); } by[x.cid].push(x); });
    try{
      for(var k = 0; k < order.length && !stopF; k++){
        var group = by[order[k]], c = U.lib().find(function(z){ return z.id === order[k]; }), src = null, blob = null;
        try{
          if(!c) throw new Error("ไม่เจอคลิปในดัชนี"); src = await U.srcUrl(c); if(!src) throw new Error("ไม่เจอไฟล์ของคลิปนี้ในมือถือ"); blob = await FT.speech.blobOf(src.url);
        }catch(err){ r.fail += group.length; r.err = (err && err.message) || String(err); n += group.length; bad++; if(src) src.done(); if(bad >= 3) break; continue; }
        try{
          for(var j = 0; j < group.length && !stopF; j++){
            n++; $("bskMsg").textContent = "กำลังตัด " + n + "/" + items.length + " · " + group[j].name;
            try{ var o = await cutOne(mb, blob, group[j], c.duration), nm = nameFor(group[j], n), sv = await MWNative.save(o, nm, { noHist:true }); r.ok++; r.names.push(sv.name || nm); r.saved = sv; bad = 0; remove(group[j].id); }
            catch(err){ r.fail++; r.err = (err && err.message) || String(err); }
          }
        } finally { blob = null; if(src) src.done(); }
        renderBar();
      }
    } finally { run = false; }
    return r;
  }

  /* ---------- ปุ่มบนการ์ดฉาก (footage-find.js `.bskadd[data-bk]`) · แถบลอย · ชีต ---------- */
  document.querySelector("main").addEventListener("click", function(e){
    var b = e.target.closest(".bskadd[data-bk]"); if(!b) return; e.stopPropagation(); var h = U.shownAt(+b.dataset.bk); if(!h || !h.sc) return;
    var on = toggle(h.c, h.sc); b.classList.toggle("on", on); b.innerHTML = MWIcon("star") + (on ? "ในตะกร้า" : "เก็บฉาก");
  }, true);
  $("bskBar").addEventListener("click", function(){ renderList(""); $("bskSheet").hidden = false; });
  $("bskSheet").addEventListener("click", function(e){ if(e.target === this && !run) this.hidden = true; });
  $("bskDone").addEventListener("click", function(){ if(!run) $("bskSheet").hidden = true; });
  $("bskList").addEventListener("click", function(e){ var b = e.target.closest("[data-rm]"); if(!b || run) return; remove(b.dataset.rm); renderBar(); renderList(); });
  $("bskPad").addEventListener("change", function(){ st.pad = this.checked; save(); });
  $("bskStop").addEventListener("click", function(){ stopF = true; $("bskStop").hidden = true; });
  $("bskClear").addEventListener("click", async function(){ if(!await MWDialog.confirm("ล้างตะกร้าทั้งหมด?", { ok:"ล้าง" })) return; clear(); renderList(""); });
  $("bskCopy").addEventListener("click", async function(){
    var t = st.items.map(function(x, i){ return (i + 1) + ". " + x.name + " · " + U.tm(x.s) + "–" + U.tm(x.e) + (x.sum ? " · " + x.sum : ""); }).join("\n");
    try{ await navigator.clipboard.writeText(t); $("bskMsg").textContent = "คัดลอกรายการแล้ว"; }catch(e){ await MWDialog.copy(t); }
  });
  $("bskRun").addEventListener("click", async function(){
    var r = await exportAll(); if(!r) return;
    var where = r.saved ? (r.saved.scanned || r.saved.gallery ? "อยู่ในแกลเลอรี/CapCut (โฟลเดอร์ Meowrin/picks)" : "บันทึกที่ " + (r.saved.path || "Documents/Meowrin") + " (APK เก่า: แกลเลอรีอาจยังไม่เห็น ใช้แอพไฟล์หาได้)") : "";
    renderList("ตัดเสร็จ " + r.ok + " ไฟล์" + (r.fail ? " · พลาด " + r.fail + (r.err ? " (" + r.err + ")" : "") : "") + (stopF ? " · พักไว้" : "") + (r.ok ? " · " + where + " · ฉากที่ตัดสำเร็จออกจากตะกร้าแล้ว" : ""));
  });
  FT.basket = { has:has, add:add, remove:remove, toggle:toggle, clear:clear, list:function(){ return st.items.slice(); }, exportAll:exportAll, setFormat:function(f){ fmt = f; }, cutOne:cutOne, nameFor:nameFor };
  renderBar();
})();
