/* footage-embed.js (FT.sem) — ค้นหาแบบเข้าใจความหมาย (v8.63)
   ทำ "ดัชนีความหมาย" จากข้อความที่มีอยู่แล้วของทุกฉาก (คำบรรยาย ตัวละคร ป้าย บทพูด คำบรรยายจากการฟังเสียง) ด้วย OpenRouter /embeddings (FT.embed) ครั้งเดียว ไม่ต้องดูวิดีโอใหม่
   เก็บเวกเตอร์ (ทำให้ยาว 1 แล้วบีบเป็น Int8) ใน IndexedDB แยก `mw_embed_v1` store `v` (key = id คลิป#ลำดับฉาก, ค่า = { h: แฮชข้อความ, d: จำนวนมิติ, v: Int8Array }) · ข้อความฉากเปลี่ยน (เช่นเพิ่งฟังเสียงเสร็จ) = แฮชไม่ตรง = ทำใหม่เฉพาะฉากนั้น
   ใช้ที่ footage-ask.js: คำถาม → เวกเตอร์ → ฉากที่ใกล้สุด รวมกับผลค้นด้วยคำ · ทำไม่ได้/ยังไม่ได้ทำ = ค้นด้วยคำเหมือนเดิม ไม่พัง
   โมเดลตั้งที่ #emModel (จำที่ mw_embed_cfg_v1) ค่าเริ่ม openai/text-embedding-3-small · เปลี่ยนโมเดล = ต้องทำใหม่ทั้งหมด (มิติต่างกัน) */
(function(){
  "use strict";
  var FT = window.FT, U = FT && FT.ui; if(!FT || !U || !FT.embed) return;
  var CK = "mw_embed_cfg_v1", DEF = "openai/text-embedding-3-small", BATCH = 48, MAXCH = 700, FAIL_STOP = 3;
  var db = null, mem = null, run = false, stopF = false;

  function cfg(){ var c = MWStore.get(CK, {}) || {}; return { model:String(c.model || DEF).trim() || DEF }; }
  function saveModel(m){ MWStore.set(CK, { model:m }); }
  function open(){
    if(db) return db;
    db = new Promise(function(res, rej){ /* ล้ม = ลืม promise ให้ลองใหม่ได้ */ var r = indexedDB.open("mw_embed_v1", 1); r.onupgradeneeded = function(){ r.result.createObjectStore("v", { keyPath:"k" }); }; r.onsuccess = function(){ res(r.result); }; r.onerror = function(){ rej(r.error); }; });
    db.catch(function(){ db = null; }); return db;
  }
  async function load(){ /* อ่านทั้งหมดเข้าหน่วยความจำครั้งเดียว (≈ 10k ฉาก × 1.5 KB) */
    if(mem) return mem; var d = await open();
    mem = await new Promise(function(res, rej){ var m = new Map(), q = d.transaction("v").objectStore("v").openCursor(); q.onsuccess = function(){ var c = q.result; if(c){ m.set(c.value.k, c.value); c.continue(); } else res(m); }; q.onerror = function(){ rej(q.error); }; });
    return mem;
  }
  async function putMany(rows){ var d = await open(); await new Promise(function(res, rej){ var t = d.transaction("v", "readwrite"), st = t.objectStore("v"); rows.forEach(function(r){ st.put(r); }); t.oncomplete = res; t.onerror = function(){ rej(t.error); }; }); }
  async function clearAll(){ var d = await open(); await new Promise(function(res, rej){ var t = d.transaction("v", "readwrite"); t.objectStore("v").clear(); t.oncomplete = res; t.onerror = function(){ rej(t.error); }; }); mem = new Map(); }

  function hash(t){ var h = 5381; for(var i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0; return (h >>> 0).toString(36) + "." + t.length; }
  function kOf(c, i){ return c.id + "#" + i; }
  function textOf(c, sc){ /* ข้อความของฉาก (ภาษาไทย+อังกฤษปนได้) ≤ MAXCH ตัวอักษร */
    var a = sc.ai || {}, ch = U.chars(sc).map(U.enName).join(", "), sp = U.speechOf ? U.speechOf(c, sc) : "";
    return [a.summary_th, ch && "ตัวละคร: " + ch, [a.location, a.event, a.action, a.emotion, a.mood].filter(Boolean).join(" · "), (a.tags_th || []).join(" "), (a.objects || []).join(" "), a.text && "ข้อความบนจอ: " + a.text, (a.fr || []).map(function(f){ return f.d; }).join(" "), sp]
      .filter(Boolean).join(" | ").replace(/\s+/g, " ").trim().slice(0, MAXCH);
  }
  function eligible(){ return U.lib().filter(function(c){ return c.status === "done" && !c.hide; }); }
  async function todo(){ /* ฉากที่ยังไม่มีเวกเตอร์ หรือข้อความเปลี่ยน (ฉากที่ไม่มีข้อความเลย ข้าม) */
    var m = await load(), model = cfg().model, l = [];
    eligible().forEach(function(c){ c.scenes.forEach(function(sc, i){ var t = textOf(c, sc); if(t.length < 6) return; var h = hash(model + "|" + t), e = m.get(kOf(c, i)); if(!e || e.h !== h) l.push({ k:kOf(c, i), t:t, h:h }); }); });
    return l;
  }
  function quant(v){ var n = 0, i; for(i = 0; i < v.length; i++) n += v[i] * v[i]; n = Math.sqrt(n) || 1; var q = new Int8Array(v.length); for(i = 0; i < v.length; i++) q[i] = Math.max(-127, Math.min(127, Math.round(v[i] / n * 127))); return q; }
  function dot(a, b){ var s = 0, n = Math.min(a.length, b.length); for(var i = 0; i < n; i++) s += a[i] * b[i]; return s / (127 * 127); }

  async function build(onProg){ /* ทำเวกเตอร์ที่ขาด · คืน { done, fail, cost, tokens } · หยุดเอง: พลาดติดกัน 3 / เกินงบ */
    if(run) return null; run = true; stopF = false; var l = [], m = null, model = cfg().model, r = { done:0, fail:0, cost:0, tokens:0, total:0, err:"" }, bad = 0;
    try{
      l = await todo(); m = await load(); r.total = l.length; /* อยู่ใน try → run ถูกปลดเสมอแม้ฐานข้อมูลเปิดไม่ได้ */
      for(var i = 0; i < l.length && !stopF; i += BATCH){
        var part = l.slice(i, i + BATCH);
        try{
          var e = await FT.embed(part.map(function(x){ return x.t; }), model); bad = 0; r.cost += e.cost; r.tokens += e.tokens;
          var rows = part.map(function(x, j){ return { k:x.k, h:x.h, d:e.vecs[j].length, v:quant(e.vecs[j]) }; }); await putMany(rows); rows.forEach(function(w){ m.set(w.k, w); }); r.done += rows.length;
        }catch(err){ r.fail += part.length; bad++; r.err = (err && err.message) || String(err); if((err && err.budget) || bad >= FAIL_STOP) break; }
        if(onProg) onProg(r);
      }
    } finally { run = false; }
    return r;
  }
  async function query(text, n){ /* → [{ c, sc, sim }] ใกล้ที่สุด n ฉาก · ยังไม่มีดัชนี = [] · embed ล้ม = โยน error */
    var m = await load(); if(!m.size) return [];
    var e = await FT.embed([String(text).slice(0, 1200)], cfg().model), qv = quant(e.vecs[0]), res = [];
    eligible().forEach(function(c){ c.scenes.forEach(function(sc, i){ var w = m.get(kOf(c, i)); if(w && w.d === qv.length) res.push({ c:c, sc:sc, sim:dot(qv, w.v) }); }); });
    res.sort(function(a, b){ return b.sim - a.sim; }); var o = res.slice(0, n); o.cost = e.cost; return o; /* slice ทิ้ง property เดิม → ต้องติด cost ที่ตัวที่คืน */
  }
  async function stat(){ var m = await load(), el = eligible(), have = 0, total = 0, model = cfg().model; el.forEach(function(c){ c.scenes.forEach(function(sc, i){ if(textOf(c, sc).length < 6) return; total++; var w = m.get(kOf(c, i)); if(w) have++; }); }); return { have:have, total:total, size:m.size, model:model }; }

  FT.sem = { cfg:cfg, saveModel:saveModel, build:build, stop:function(){ stopF = true; }, running:function(){ return run; }, query:query, stat:stat, clear:clearAll, todo:todo, textOf:textOf, ready:async function(){ var m = await load(); return m.size > 0; } };

  /* ---------- แผงในตั้งค่า (ขั้น 5) ---------- */
  var $ = function(id){ return document.getElementById(id); };
  if(!$("emPanel")) return;
  function money(x){ return U.money ? U.money(x) : "$" + x.toFixed(4); }
  async function render(msg, cls){
    var st = await stat(), left = st.total - st.have, est = Math.max(left, 0) * 250 * 0.02 / 1e6 * 2; /* ≈ 250 โทเคน/ฉาก ราคา ≤ $0.04/ล้านโทเคน (ประมาณหยาบ) */
    $("emInfo").textContent = st.total ? "ทำดัชนีความหมายแล้ว " + st.have + "/" + st.total + " ฉาก" + (left > 0 ? " · เหลือ " + left + " ฉาก (ประมาณไม่เกิน " + money(est) + ")" : " · ครบแล้ว") : "ยังไม่มีคลิปที่ทำดัชนีแล้ว";
    $("emModel").value = $("emModel").value || st.model; $("emRun").disabled = run || left <= 0; $("emStop").hidden = !run; $("emClear").disabled = run || !st.size;
    var m = $("emMsg"); m.textContent = msg || ""; m.className = "hint" + (cls ? " " + cls : "");
  }
  $("emModel").addEventListener("change", async function(){ var v = this.value.trim() || DEF; if(v === cfg().model) return; if(!await MWDialog.confirm("เปลี่ยนโมเดลเป็น " + v + " ?\n\nเวกเตอร์เดิมของโมเดลก่อนใช้ร่วมกันไม่ได้ ต้องทำดัชนีความหมายใหม่ทั้งหมด (ราคาไม่กี่เซ็นต์)", { ok:"เปลี่ยน" })){ this.value = cfg().model; return; } saveModel(v); await clearAll(); render("เปลี่ยนโมเดลแล้ว · กด ทำดัชนีความหมาย อีกครั้ง"); });
  $("emRun").addEventListener("click", async function(){
    if(!FT.orKey()){ await MWDialog.alert("ยังไม่มี OpenRouter key ในแอพ ไปใส่ที่ ตั้งค่า > คีย์ API ก่อน"); return; }
    render("กำลังทำ...");
    var r = await build(function(p){ $("emMsg").textContent = "กำลังทำ " + p.done + "/" + p.total + " ฉาก · ใช้ " + money(p.cost) + (p.fail ? " · พลาด " + p.fail : ""); });
    if(!r) return; render("เสร็จ " + r.done + " ฉาก · ใช้ " + money(r.cost) + (r.fail ? " · พลาด " + r.fail + (r.err ? " (" + r.err + ")" : "") : "") + (stopF ? " · พักไว้" : ""), r.fail ? "err" : "ok");
  });
  $("emStop").addEventListener("click", function(){ stopF = true; $("emStop").hidden = true; });
  $("emClear").addEventListener("click", async function(){ if(!await MWDialog.confirm("ลบดัชนีความหมายทั้งหมด? (ทำใหม่ได้ ราคาไม่กี่เซ็นต์ · ค้นหาด้วยคำยังใช้ได้ปกติ)", { ok:"ลบ" })) return; await clearAll(); render("ลบแล้ว", "ok"); });
  document.addEventListener("ft:lib", function(){ if(!run && $("emPanel").open) render(); }); /* คำนวณจำนวนฉากทุกครั้งที่ lib เปลี่ยนหนัก · เปิดแผงอยู่ค่อยวาด */
  $("emPanel").addEventListener("toggle", function(){ if(this.open && !run) render(); });
  if($("emPanel").open) render();
})();
