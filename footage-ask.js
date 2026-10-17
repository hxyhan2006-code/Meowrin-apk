/* footage-ask.js — ปุ่ม "ถาม AI" ในหน้าอัลบั้ม: พิมพ์คำถามภาษาคน เช่น "มีฉากที่ซันจิร้องไห้ไหม" "ฉากลูฟี่ชนะเอสอยู่คลิปไหน"
   ขั้น 1 askExpand: คำถาม → ชื่อตัวละคร + คำค้นไทย/คำใกล้เคียง (ข้อความล้วน)
   ขั้น 2 ค้นดัชนีในเครื่อง (ฟรี) เอาฉากผู้สมัคร ≤ MAXC (ใช้ตัวค้น/ตัวละคร/ป้ายของ footage-find.js)
   ขั้น 3 askPick: ให้ AI อ่านคำอธิบายฉากผู้สมัครแล้วเลือกที่ตรง + ตอบสั้นๆ (ไม่เจอ = บอกว่าไม่เจอ) → โชว์เป็นการ์ดฉาก (แตะดูรูปใหญ่/เล่น ใช้ตัวเดิมของการ์ดค้นหา)
   ทุกคำตอบมีรูปฉากให้ตรวจเสมอ (ป้าย AI ผิดได้) · ราคา ≈ $0.005 ต่อคำถาม */
(function(){
  "use strict";
  var FT = window.FT, U = FT && FT.ui; if(!U || !FT.askPick) return;
  function $(id){ return document.getElementById(id); }
  var MAXC = 40, PER_CLIP = 5, busy = false;

  function candidates(q, exp){ /* คืนฉากผู้สมัคร [{ c, sc, score }] จากดัชนีในเครื่อง */
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
    var per = {}, top = [];
    for(var i = 0; i < out.length && top.length < MAXC; i++){ var id = out[i].c.id; if((per[id] = (per[id] || 0) + 1) <= PER_CLIP) top.push(out[i]); } /* คลิปเดียวไม่เกิน PER_CLIP ฉาก ให้ผลหลากหลายคลิป */
    return top;
  }
  function describe(x, n){
    var a = x.sc.ai || {}, tags = (a.tags_th || []).slice(0, 6).join(","), extra = [a.event, a.mood, tags].filter(Boolean).join(" · ");
    return { n:n, clip:String(x.c.name || "").replace(/\.[a-z0-9]+$/i, ""), at:U.tm(x.sc.s), who:U.chars(x.sc).map(U.enName).join(","), sum:(a.summary_th || "(ไม่มีคำอธิบาย)") + (extra ? " [" + extra + "]" : "") };
  }
  function out(html){ $("askOut").innerHTML = html; $("askOut").hidden = !html; }
  function say(t){ out('<div class="askans">' + U.esc(t) + "</div>"); }

  async function ask(){
    if(busy) return;
    var q = $("q").value.trim();
    if(!q){ say("พิมพ์คำถามในช่องค้นหาก่อน เช่น \"มีฉากที่ซันจิร้องไห้ไหม\" หรือ \"ฉากลูฟี่ชนะเอสอยู่คลิปไหน\""); return; }
    if(!U.lib().some(function(c){ return c.status === "done"; })){ say("ยังไม่มีคลิปที่ทำดัชนีแล้ว · ไปที่ตั้งค่า > ทำดัชนี หรือกด \"ให้ AI ทำที่เหลือ\" ในอัลบั้มก่อน"); return; }
    if(!FT.orKey()){ say("ยังไม่มี OpenRouter key ในแอพนี้ (ตั้งค่า → OpenRouter API key)"); return; }
    busy = true; $("askBtn").disabled = true; var cost = 0;
    document.dispatchEvent(new CustomEvent("ft:search", { detail:{ active:true } })); /* ซ่อนตารางอัลบั้ม โชว์ผล */
    try{
      say("AI กำลังแปลคำถาม...");
      var exp = await FT.askExpand(q); cost += exp.cost;
      var cs = candidates(q, exp);
      if(!cs.length){ say("ไม่เจอฉากที่ตรงในคลังเลย (ค้นแล้วทั้งคำที่พิมพ์และคำใกล้เคียง) · อาจยังไม่ได้ทำดัชนีคลิปที่มีฉากนี้ หรือไม่มีฟุตนี้ในมือถือ"); $("results").innerHTML = ""; return; }
      say("เจอผู้สมัคร " + cs.length + " ฉาก AI กำลังคัดให้...");
      var r = await FT.askPick(q, cs.map(function(x, i){ return describe(x, i + 1); })); cost += r.cost;
      var picks = r.picks.filter(function(p){ return cs[p.n - 1]; }).filter(function(p, i, a){ return a.findIndex(function(z){ return z.n === p.n; }) === i; });
      out('<div class="askans">' + U.esc(r.answer || (picks.length ? "เจอ " + picks.length + " ฉาก" : "ไม่เจอฉากที่ตรง")) + '<small>ค้นจาก ' + cs.length + " ฉากผู้สมัคร · ใช้ไป " + U.money(cost) + " · รูปด้านล่างตรวจเองได้ ป้าย AI ผิดได้</small></div>");
      $("findInfo").textContent = r.none || !picks.length ? "" : "คำตอบของ AI: " + picks.length + " ฉาก (แตะรูปดูใหญ่/เล่น)";
      $("results").innerHTML = picks.length ? picks.map(function(p){ var x = cs[p.n - 1]; return U.card(x.c, x.sc, false, U.tm(x.sc.s) + (p.why ? " · " + p.why : "")); }).join("") : '<p class="empty">AI ดูแล้วไม่มีฉากไหนตรงจริง</p>';
    }catch(err){ say("ถาม AI ไม่ได้: " + err.message); }
    U.addCost(cost); busy = false; $("askBtn").disabled = false;
  }
  $("askBtn").addEventListener("click", ask);
  $("q").addEventListener("input", function(){ if(!$("q").value.trim()) out(""); }); /* ล้างคำค้น = ล้างคำตอบด้วย */
})();
