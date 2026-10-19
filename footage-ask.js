/* footage-ask.js — ปุ่ม "ถาม AI" ในหน้าอัลบั้ม: พิมพ์คำถามภาษาคน เช่น "มีฉากที่ซันจิร้องไห้ไหม" "ฉากลูฟี่ชนะเอสอยู่คลิปไหน"
   ขั้น 1 askExpand: คำถาม → ชื่อตัวละคร + คำค้นไทย/คำใกล้เคียง (ข้อความล้วน)
   ขั้น 2 ค้นดัชนีในเครื่อง (ฟรี) เอาฉากผู้สมัคร ≤ MAXC (ใช้ตัวค้น/ตัวละคร/ป้ายของ footage-find.js)
   ขั้น 3 askPick: ให้ AI อ่านคำอธิบายฉากผู้สมัครแล้วเลือกที่ตรง + ตอบสั้นๆ (ไม่เจอ = บอกว่าไม่เจอ) → โชว์เป็นการ์ดฉาก (แตะดูรูปใหญ่/เล่น ใช้ตัวเดิมของการ์ดค้นหา)
   ทุกคำตอบมีรูปฉากให้ตรวจเสมอ (ป้าย AI ผิดได้) · ราคา ≈ $0.005 ต่อคำถาม */
(function(){
  "use strict";
  var FT = window.FT, U = FT && FT.ui; if(!U || !FT.askPick) return;
  function $(id){ return document.getElementById(id); }
  var MAXC = 40, PER_CLIP = 5, busy = false, shown = false; /* shown = #results กำลังโชว์คำตอบของ ถาม AI (ห้ามค้นทับอัตโนมัติ) */
  U.askActive = function(){ return shown; }; U.askReset = function(){ shown = false; }; /* ค้นหาแบบปกติ (ชิป/พิมพ์) เริ่มเมื่อไหร่ = ออกจากโหมดคำตอบ */

  async function candidates(q, exp){ /* คืนฉากผู้สมัคร [{ c, sc, score }] จากดัชนีในเครื่อง: ค้นด้วยคำ + (ถ้าทำดัชนีความหมายไว้) ฉากที่ความหมายใกล้คำถาม รวมกันแบบจัดอันดับ (RRF) · semErr/semCost/semN ติดที่ผลลัพธ์ */
    var ts = U.terms(q), ek = exp.keys.length ? U.terms(exp.keys.join(" ")) : [], want = [], out = [];
    exp.chars.forEach(function(n){ var k = U.charKey(n); if(k && want.indexOf(k) < 0) want.push(k); });
    U.lib().forEach(function(c){ if(c.status !== "done" || c.hide) return; c.scenes.forEach(function(sc){
      var h = U.hay(c, sc), s = 0, a = sc.ai || {};
      ts.forEach(function(v){ var k = U.matchIdx(v, h); if(k >= 0) s += [4, 2, 1][k] * 2; });
      ek.forEach(function(v){ var k = U.matchIdx(v, h); if(k >= 0) s += [4, 2, 1][k]; });
      if(want.length){ var cs = U.chars(sc), hit = want.filter(function(k){ return cs.indexOf(k) >= 0; }).length; if(!hit) return; s += hit * 8; } /* ถามถึงตัวละคร = ฉากต้องมีตัวละครนั้น */
      (a.issues || []).forEach(function(x){ if(/screen/.test(x)) s -= 3; });
      if(s > 0) out.push({ c:c, sc:sc, score:s });
    }); });
    out.sort(function(x, y){ return y.score - x.score; });
    var semErr = "", semCost = 0, semN = 0;
    if(FT.sem){ /* v8.63 ฉากที่ความหมายใกล้คำถาม (ไม่ต้องมีคำตรงกัน) */
      try{ if(!(await FT.sem.ready())) throw 0; /* ยังไม่มีดัชนีความหมาย = ข้ามเงียบๆ · ฐานเปิดไม่ได้ = ใช้ค้นด้วยคำ */
        var hits = await FT.sem.query(q + " " + exp.keys.join(" ") + (exp.chars.length ? " ตัวละคร: " + exp.chars.join(", ") : ""), 30); semCost = hits.cost || 0;
        var best = hits.length ? hits[0].sim : 0; hits = hits.filter(function(x){ return x.sim > 0 && x.sim >= best * 0.6; }); /* ไกลจากฉากที่ใกล้สุดมาก = ไม่ใช่ผู้สมัคร (ไม่ส่งฉากไม่เกี่ยวให้ AI) */
        hits = hits.filter(function(x){ if(!want.length) return true; var cs = U.chars(x.sc); return want.some(function(k){ return cs.indexOf(k) >= 0; }); }); semN = hits.length; /* ถามถึงตัวละคร = ฉากต้องมีตัวละครนั้น เหมือนฝั่งค้นด้วยคำ */
        var fused = new Map(), RK = 60; out.forEach(function(x, i){ fused.set(x.sc, { c:x.c, sc:x.sc, score:1 / (RK + i) }); });
        hits.forEach(function(x, i){ var f = fused.get(x.sc); if(f) f.score += 1 / (RK + i); else fused.set(x.sc, { c:x.c, sc:x.sc, score:1 / (RK + i), sem:true }); });
        out = Array.from(fused.values()); out.sort(function(x, y){ return y.score - x.score; });
      }catch(err){ if(err !== 0) semErr = (err && err.message) || String(err); } /* ล้ม = ใช้ผลค้นด้วยคำอย่างเดียว */
    }
    var per = {}, top = [];
    for(var i = 0; i < out.length && top.length < MAXC; i++){ var id = out[i].c.id; if((per[id] = (per[id] || 0) + 1) <= PER_CLIP) top.push(out[i]); } /* คลิปเดียวไม่เกิน PER_CLIP ฉาก ให้ผลหลากหลายคลิป */
    top.semErr = semErr; top.semCost = semCost; top.semN = semN; return top;
  }
  function speechFor(x, ws){ /* บทพูดของฉากที่ส่งให้ AI: สั้นพอก็ส่งทั้งหมด · ยาวเกิน = เอาบรรทัดที่มีคำของคำถามก่อน (เดิมตัดที่ 140 ตัวอักษรแรก → ประโยคที่ถามหาอยู่ท้ายๆ แล้วหลุด AI ตอบ 'ไม่มี') */
    var L = U.speechLines ? U.speechLines(x.c, x.sc).lines : [], MAX = 700, all = L.map(function(g){ return (g.who ? g.who + ": " : "") + g.t; });
    if(all.join(" / ").length <= MAX) return all.join(" / ");
    var hit = function(i){ var t = String(L[i].t).toLowerCase(); return ws.some(function(w){ return t.indexOf(w) >= 0; }); }, a = all.filter(function(t, i){ return hit(i); }), b = all.filter(function(t, i){ return !hit(i); }), o = ""; /* เทียบเฉพาะเนื้อบท ไม่รวมชื่อคนพูด (ชื่อตัวละครตรงทุกบรรทัด) */
    a.concat(b).forEach(function(t){ if(o.length + t.length < MAX) o += (o ? " / " : "") + t; }); return o;
  }
  function describe(x, n, ws){
    var a = x.sc.ai || {}, tags = (a.tags_th || []).slice(0, 6).join(","), extra = [a.event, a.mood, tags].filter(Boolean).join(" · "), sp = speechFor(x, ws || []); /* บทพูดของฉาก (ถ้าเคยให้ AI ฟังเสียง) */
    return { n:n, clip:String(x.c.name || "").replace(/\.[a-z0-9]+$/i, ""), at:U.tm(x.sc.s), who:U.chars(x.sc).map(U.enName).join(","), sum:(a.summary_th || "(ไม่มีคำอธิบาย)") + (extra ? " [" + extra + "]" : "") + (sp ? " · พูดว่า: \"" + sp + "\"" : "") };
  }
  function out(html){ $("askOut").innerHTML = html; $("askOut").hidden = !html; }
  function say(t){ out('<div class="askans">' + U.esc(t) + "</div>"); }

  async function ask(){
    if(busy) return;
    var q = $("q").value.trim();
    if(!q){ say("พิมพ์คำถามในช่องค้นหาก่อน เช่น \"มีฉากที่ซันจิร้องไห้ไหม\" หรือ \"ฉากลูฟี่ชนะเอสอยู่คลิปไหน\""); return; }
    if(!U.lib().some(function(c){ return c.status === "done"; })){ say("ยังไม่มีคลิปที่ทำดัชนีแล้ว · ไปที่ตั้งค่า > ทำดัชนี หรือกด \"ให้ AI ทำที่เหลือ\" ในอัลบั้มก่อน"); return; }
    if(!FT.orKey()){ say("ยังไม่มี OpenRouter key ในแอพนี้ (ตั้งค่า → OpenRouter API key)"); return; }
    busy = true; $("askBtn").disabled = true; var cost = 0; if(U.cancelSearch) U.cancelSearch(); /* ยกเลิกค้นหาที่ตั้งเวลาไว้ตอนพิมพ์ ไม่ให้มาทับคำตอบ */
    document.dispatchEvent(new CustomEvent("ft:search", { detail:{ active:true } })); /* ซ่อนตารางอัลบั้ม โชว์ผล */
    try{
      say("AI กำลังแปลคำถาม...");
      var exp = await FT.askExpand(q); cost += exp.cost;
      var cs = await candidates(q, exp); cost += cs.semCost || 0;
      var ws = U.terms(q + " " + exp.keys.join(" ")).map(function(v){ return v.map(function(w){ return String(w).toLowerCase(); }); }).reduce(function(a, v){ return a.concat(v); }, []).filter(function(w){ return w.length >= 2; });
      if(!cs.length){ say("ไม่เจอฉากที่ตรงในคลังเลย (ค้นแล้วทั้งคำที่พิมพ์และคำใกล้เคียง) · อาจยังไม่ได้ทำดัชนีคลิปที่มีฉากนี้ หรือไม่มีฟุตนี้ในมือถือ"); $("results").innerHTML = ""; return; }
      say("เจอผู้สมัคร " + cs.length + " ฉาก AI กำลังคัดให้...");
      var r = await FT.askPick(q, cs.map(function(x, i){ return describe(x, i + 1, ws); })); cost += r.cost;
      var picks = r.picks.filter(function(p){ return cs[p.n - 1]; }).filter(function(p, i, a){ return a.findIndex(function(z){ return z.n === p.n; }) === i; });
      out('<div class="askans">' + U.esc(r.answer || (picks.length ? "เจอ " + picks.length + " ฉาก" : "ไม่เจอฉากที่ตรง")) + '<small>ค้นจาก ' + cs.length + " ฉากผู้สมัคร" + (cs.semN ? " (รวมที่ค้นตามความหมาย " + cs.semN + " ฉาก)" : "") + (cs.semErr ? " · ค้นตามความหมายไม่ได้: " + U.esc(cs.semErr) : "") + " · ใช้ไป " + U.money(cost) + " · รูปด้านล่างตรวจเองได้ ป้าย AI ผิดได้</small></div>");
      $("findInfo").textContent = r.none || !picks.length ? "" : "คำตอบของ AI: " + picks.length + " ฉาก (แตะรูปดูใหญ่/เล่น)";
      shown = picks.length > 0;
      $("results").innerHTML = picks.length ? picks.map(function(p){ var x = cs[p.n - 1]; return U.card(x.c, x.sc, false, U.tm(x.sc.s) + (p.why ? " · " + p.why : "")); }).join("") : '<p class="empty">AI ดูแล้วไม่มีฉากไหนตรงจริง</p>';
    }catch(err){ say("ถาม AI ไม่ได้: " + err.message); }
    finally { U.addCost(cost); busy = false; $("askBtn").disabled = false; } /* finally: เดิมคำตอบ "ไม่เจอเลย" return ออกก่อน ปุ่มค้างกดไม่ได้จนโหลดหน้าใหม่ */
  }
  $("askBtn").addEventListener("click", ask);
  $("q").addEventListener("input", function(){ shown = false; if(!$("q").value.trim()) out(""); }, true); /* ล้างคำค้น = ล้างคำตอบด้วย · capture = ปลดโหมดคำตอบก่อนตัวค้นหาจะทำงาน */
})();
