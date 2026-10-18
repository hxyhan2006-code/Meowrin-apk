/* footage-speech.js — "ฟังเสียงคลิป": ถอดบทพูด (ส่วนใหญ่พากย์ไทย) ด้วย Gemini แล้วเก็บไว้ที่คลิป (c.speech) ให้ค้นหา/ถาม AI ใช้
   ขั้นตอนต่อคลิป: โหลดไฟล์เป็น Blob (ไม่ใช้ Range ของตัวช่วยไฟล์ที่กรอไม่ได้) → mediabunny ถอดเสียง → โมโน 16 kHz → wav ท่อนละ ≤ 3 นาที → FT.transcribe (OpenRouter input_audio)
   เสียงเงียบเกือบทั้งคลิป = ไม่เรียก AI (บันทึกว่าไม่มีบทพูด) · c.speech = { at, model, segs:[{s,e,t,who}], sum, cost, sec, silent }
   แผงอยู่ footage.html ตั้งค่า > ทำดัชนี "ฟังเสียงคลิป (ทดลอง)": ทดลอง 10 คลิป (สุ่ม) ดูบทพูดที่ได้ → ค่อยทำที่เหลือทั้งหมด */
(function(){
  "use strict";
  var WV = 3; /* รุ่นวิธีดู+ฟัง: 3 = ตัวประกอบไม่มีชื่อได้ป้ายบทบาท (พ่อค้า ลุง ฯลฯ) + รายละเอียดฉากครบขึ้น · เปลี่ยนเลขนี้ = คลิปรุ่นก่อนนับเป็นยังไม่ทำ */
  var FT = window.FT, U = FT && FT.ui; if(!U || !$("spTrial")) return;
  function $(id){ return document.getElementById(id); }
  var WK = "mw_speech_v1", watchOn = (MWStore.get(WK, null) || { watch:true }).watch !== false, MAXIMG = 24, DENSE = 60, ecoOn = !!(MWStore.get(WK, null) || {}).eco, DSTEP = 1.5, SR = 16000, CH_SEC = 180, MAXB = 700 * 1048576, TRIAL = 10, FAIL_STOP = 3, GUESS = 0.004, GUESSW = 0.03, mbP = null, run = false, stopF = false;
  function loadMB(){ return mbP || (mbP = import("./sub/vendor/mediabunny.min.js")); }
  function tm(s){ s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }

  async function blobOf(url){
    var r = await fetch(url); if(!r.ok) throw new Error("เปิดไฟล์ไม่ได้ (" + r.status + ")");
    var n = +r.headers.get("content-length") || 0; if(n > MAXB) throw new Error("ไฟล์ใหญ่เกิน " + Math.round(MAXB / 1048576) + " MB");
    var b = await r.blob(); if(b.size > MAXB) throw new Error("ไฟล์ใหญ่เกิน " + Math.round(MAXB / 1048576) + " MB"); return b;
  }
  async function pcm(blob){ /* → { sec, data:Int16Array โมโน 16 kHz } · ไม่มีแทร็กเสียง = sec 0 */
    var mb = await loadMB(), input = new mb.Input({ source:new mb.BlobSource(blob), formats:mb.ALL_FORMATS });
    try{
      var tr = await input.getPrimaryAudioTrack(); if(!tr) return { sec:0, data:new Int16Array(0) };
      if(!(await tr.canDecode())) throw new Error("เครื่องนี้ถอดรหัสเสียงของคลิปไม่ได้");
      var sink = new mb.AudioBufferSink(tr), BS = SR * 60, blocks = [], maxK = 0;
      for await (var w of sink.buffers()){
        var ab = w.buffer, sr = ab.sampleRate, n = ab.length, nc = ab.numberOfChannels, ch = [], c, k;
        for(c = 0; c < nc; c++) ch.push(ab.getChannelData(c));
        var k0 = Math.max(0, Math.ceil(w.timestamp * SR)), k1 = Math.floor((w.timestamp + n / sr) * SR);
        for(k = k0; k < k1; k++){
          var pos = (k / SR - w.timestamp) * sr, i = Math.floor(pos), fr = pos - i, a = 0;
          for(c = 0; c < nc; c++){ var d = ch[c], x0 = d[i] || 0, x1 = i + 1 < n ? d[i + 1] : x0; a += x0 + (x1 - x0) * fr; }
          a /= nc; a = a < -1 ? -1 : a > 1 ? 1 : a;
          var bi = (k / BS) | 0; while(blocks.length <= bi) blocks.push(new Int16Array(BS));
          blocks[bi][k - bi * BS] = a < 0 ? a * 32768 : a * 32767; if(k + 1 > maxK) maxK = k + 1;
        }
      }
      var data = new Int16Array(maxK); blocks.forEach(function(b, i){ data.set(b.subarray(0, Math.min(BS, maxK - i * BS)), i * BS); });
      return { sec:maxK / SR, data:data };
    } finally { try{ input.dispose(); }catch(e){} }
  }
  function rms(d){ var s = 0, n = Math.min(d.length, SR * 600), st = Math.max(1, Math.floor(d.length / n)), c = 0; for(var i = 0; i < d.length; i += st){ s += d[i] * d[i]; c++; } return c ? Math.sqrt(s / c) / 32768 : 0; }
  function wavB64(d, a, b){ /* 16-bit PCM โมโน → base64 (ไม่มี data: นำหน้า) */
    var n = b - a, h = new DataView(new ArrayBuffer(44)), S = function(o, t){ for(var i = 0; i < t.length; i++) h.setUint8(o + i, t.charCodeAt(i)); };
    S(0, "RIFF"); h.setUint32(4, 36 + n * 2, true); S(8, "WAVE"); S(12, "fmt "); h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 1, true); h.setUint32(24, SR, true); h.setUint32(28, SR * 2, true); h.setUint16(32, 2, true); h.setUint16(34, 16, true); S(36, "data"); h.setUint32(40, n * 2, true);
    var blob = new Blob([h, d.subarray(a, b)], { type:"audio/wav" });
    return new Promise(function(ok, bad){ var fr = new FileReader(); fr.onload = function(){ ok(String(fr.result).replace(/^data:[^,]*,/, "")); }; fr.onerror = function(){ bad(fr.error); }; fr.readAsDataURL(blob); });
  }
  function cleanSegs(arr, off, max){
    return (Array.isArray(arr) ? arr : []).map(function(g){ var s = Number(g && g.s), e = Number(g && g.e), t = String(g && g.t || "").trim();
      if(!t || !isFinite(s)) return null; if(!isFinite(e) || e < s) e = s + 1; return { s:Math.max(0, +(s + off).toFixed(1)), e:Math.min(max, +(e + off).toFixed(1)), t:t.slice(0, 300), who:(Array.isArray(g && g.who) ? g.who.join(", ") : String(g && g.who || "")).replace(/\s*(,|;|&| and )\s*/gi, ", ").trim().slice(0, 80), sure:!(g && g.sure === false) }; }).filter(Boolean);
  }

  async function denseFrames(blob, t0, t1){ /* ภาพจากวิดีโอทุก ~1.5 วิ (กว้าง 384) ตลอดท่อน ≤ DENSE รูป → [{ s:วินาทีนับจากต้นท่อน, img }] · เปิดภาพไม่ได้ = [] (ใช้ภาพฉากที่เก็บไว้แทน) */
    try{
      var mb = await loadMB(), input = new mb.Input({ source:new mb.BlobSource(blob), formats:mb.ALL_FORMATS });
      try{
        var tr = await input.getPrimaryVideoTrack(); if(!tr || !(await tr.canDecode())) return [];
        var step = Math.max(ecoOn ? 3 : DSTEP, (t1 - t0) / DENSE), ts = []; for(var t = t0 + 0.2; t < t1 - 0.05; t += step) ts.push(t);
        var sink = new mb.CanvasSink(tr, { width:384 }), out = [], k = 0;
        for await (var w of sink.canvasesAtTimestamps(ts)){ var tt = ts[k++]; if(w && w.canvas) out.push({ s:tt - t0, img:w.canvas.toDataURL("image/jpeg", 0.6) }); }
        return out;
      } finally { try{ input.dispose(); }catch(e){} }
    }catch(e){ return []; }
  }
  function sceneList(c, t0, t1){ var l = []; c.scenes.forEach(function(sc, i){ if(sc.s >= t0 - 0.01 && sc.s < t1) l.push({ n:i + 1, s:Math.max(0, sc.s - t0), e:Math.min(t1 - t0, sc.e - t0) }); }); return l.slice(0, 80); }
  function framesOf(c, t0, t1){ /* ภาพของฉากที่เริ่มในช่วงเสียงท่อนนี้ (ที่เก็บไว้ในดัชนีแล้ว ไม่ต้องเปิดวิดีโอ) · เกิน MAXIMG = เลือกห่างๆ ให้ครอบทั้งท่อน · เวลานับจากต้นท่อนเสียง */
    var l = []; c.scenes.forEach(function(sc, i){ var img = sc.img || sc.thumb; if(img && sc.s >= t0 - 0.01 && sc.s < t1) l.push({ n:i + 1, s:Math.max(0, sc.s - t0), e:Math.min(t1 - t0, sc.e - t0), img:img }); });
    if(l.length > MAXIMG){ var step = l.length / MAXIMG; l = Array.from({ length:MAXIMG }, function(_, k){ return l[Math.floor(k * step)]; }); }
    return l;
  }
  async function doClip(c){ /* ถอดบทพูดของคลิปเดียว · เก็บที่ c.speech · โยน error ถ้าพลาด */
    var src = await U.srcUrl(c); if(!src) throw new Error("ไม่เจอไฟล์ของคลิปนี้ในมือถือ (ลองสแกนใหม่)");
    try{
      var blob = await blobOf(src.url), p = await pcm(blob);
      var sp = { at:Date.now(), model:FT.cfg.model, segs:[], sum:"", cost:0, sec:Math.round(p.sec * 10) / 10, watch:watchOn, wv:watchOn ? WV : 0 };
      if(!p.sec || rms(p.data) < 0.003){ blob = null; sp.silent = true; c.speech = sp; await FT.store.put(c); return sp; } /* ไม่มีเสียง/เงียบ = ไม่เสียเงิน */
      var sums = [], arcs = {};
      for(var a = 0; a < p.data.length; a += CH_SEC * SR){
        var b = Math.min(p.data.length, a + CH_SEC * SR); if(b - a < SR) continue; /* เศษสั้นกว่า 1 วิ ข้าม */
        var frames = null, scenes = null;
        if(watchOn){ scenes = sceneList(c, a / SR, b / SR); frames = await denseFrames(blob, a / SR, b / SR); if(!frames.length) frames = framesOf(c, a / SR, b / SR); } /* ภาพถี่จากวิดีโอก่อน · ไม่ได้ = ภาพฉากในดัชนี */
        var r = await FT.transcribe(await wavB64(p.data, a, b), (b - a) / SR, "", frames, scenes, watchOn ? U.ARCS : null);
        var ar = String(r.json.arc || "").trim(); if(ar && U.ARCS.indexOf(ar) >= 0) arcs[ar] = (arcs[ar] || 0) + (b - a); /* ภาคที่ AI ตอบ · นับตามความยาวท่อน (คลิปยาวหลายท่อน) */
        sp.cost += r.cost || 0; sp.segs = sp.segs.concat(cleanSegs(r.json.segments, a / SR, p.sec)); if(r.json.summary_th) sums.push(String(r.json.summary_th).trim());
        (Array.isArray(r.json.scenes) ? r.json.scenes : Array.isArray(r.json.looks) ? r.json.looks : []).forEach(function(l){ var i = Number(l && l.i) - 1, t = String(l && l.t || "").trim(); if(t && i >= 0 && i < c.scenes.length){ sp.looks = sp.looks || {}; sp.looks[i] = t.slice(0, 200); } });
      }
      var ak = Object.keys(arcs); if(ak.length === 1) sp.arc = ak[0]; /* หลายท่อนตอบคนละภาค = ไม่ใช้ */
      blob = null; sp.sum = sums.join(" ").slice(0, 300); c.speech = sp; await FT.store.put(c); return sp;
    } finally { src.done(); }
  }

  /* ---------- แผง ---------- */
  function clips(){ return U.lib().filter(function(c){ return c.status === "done" && !c.hide; }); }
  function done1(c){ return c.speech && (!watchOn || c.speech.wv === WV); } /* โหมดดูพร้อมฟัง: คลิปที่ฟังเสียงล้วนมาก่อนถือว่ายังไม่ได้ทำ (ทำซ้ำให้ได้ชื่อคนพูด) */
  function unsureArc(c){ return !U.arcOf(c).sure; }
  function pending(){ /* v8.59 คลิปที่ภาคยังไม่แน่ใจมาก่อน (เสียงช่วยบอกภาค → จัดอัลบั้มได้มากขึ้นเร็วที่สุด) */
    var l = clips().filter(function(c){ return !done1(c) && U.hasSrc(c); }), u = l.filter(unsureArc); return u.concat(l.filter(function(c){ return u.indexOf(c) < 0; })); }
  function stats(){ var d = clips().filter(function(c){ return c.speech; }), paid = d.filter(function(c){ return !c.speech.silent && (c.speech.wv === WV) === watchOn; }), cost = paid.reduce(function(s, c){ return s + (c.speech.cost || 0); }, 0);
    return { done:d.filter(done1).length, paid:paid.length, avg:paid.length ? cost / paid.length : 0, cost:cost, withText:d.filter(function(c){ return c.speech.segs.length; }).length }; }
  function timeline(c){ /* บทพูดกับคำบรรยายฉาก (ใครทำอะไรที่ไหนยังไง) เรียงตามเวลาในแผ่นเดียว */
    var s = c.speech, rows = (s.segs || []).map(function(g){ return { t:g.s, k:1, g:g }; });
    Object.keys(s.looks || {}).forEach(function(i){ var sc = c.scenes[i]; if(sc) rows.push({ t:sc.s, k:0, d:s.looks[i] }); });
    rows.sort(function(a, b){ return a.t - b.t || a.k - b.k; });
    return rows.map(function(r){ if(!r.g) return "<div class=\"splook\"><i>" + tm(r.t) + "</i>" + U.esc(r.d) + "</div>"; var g = r.g;
      return "<button type=\"button\" class=\"spln\" data-id=\"" + U.esc(c.id) + "\" data-t=\"" + g.s + "\"><i>" + tm(g.s) + "</i>" + (g.who ? "<b" + (g.sure === false ? " class=\"un\"" : "") + ">" + U.esc(g.who) + (g.sure === false ? "?" : "") + "</b> " : "") + U.esc(g.t) + "</button>"; }).join("");
  }
  var lastMsg = ["", ""];
  function render(msg, cls){
    var st = stats(), pend = pending(), all = clips().length, est = st.avg || (watchOn ? GUESSW : GUESS);
    $("spWatch").checked = watchOn; $("spEco").checked = ecoOn; $("spEco").parentNode.hidden = !watchOn; $("spInfo").textContent = (watchOn ? "ดู+ฟัง" : "ฟังเสียง") + "แล้ว " + st.done + "/" + all + " คลิป" + (st.done ? " · มีบทพูด " + st.withText : "") + (st.paid ? " · เฉลี่ย " + U.money(st.avg) + "/คลิป" : "") + (pend.length ? " · ยังไม่ได้ฟัง " + pend.length : ""); var bySp = clips().filter(function(c){ return c.speech && U.arcOf(c).by === "speech"; }).length; if(bySp) $("spInfo").textContent += " · รู้ภาคจากเสียง " + bySp + " คลิป";
    if(msg === undefined){ msg = lastMsg[0]; cls = lastMsg[1]; } else lastMsg = [msg, cls]; /* วาดใหม่เพราะคลังเปลี่ยน (ft:lib) = คงข้อความเดิม */
    var m = $("spMsg"); m.textContent = msg || ""; m.className = "hint" + (cls ? " " + cls : "");
    $("spTrial").disabled = run || !pend.length; $("spTrial").textContent = "ทดลอง" + (watchOn ? "ดู+ฟัง " : "ฟังเสียง ") + Math.min(TRIAL, pend.length) + " คลิป";
    $("spAll").hidden = !(st.paid >= 5 && pend.length); $("spAll").disabled = run; $("spAll").textContent = (watchOn ? "ดู+ฟัง" : "ฟังเสียง") + "ที่เหลือทั้งหมด (" + pend.length + ") · ประมาณ " + U.money(pend.length * est);
    $("spStop").hidden = !run;
    var recent = clips().filter(function(c){ return c.speech; }).sort(function(a, b){ return b.speech.at - a.speech.at; }).slice(0, TRIAL);
    $("spList").innerHTML = recent.map(function(c){ var s = c.speech;
      var body = s.silent ? "<p class=\"hint\">ไม่มีเสียงพูด (เงียบ/ไม่มีแทร็กเสียง)</p>" : (s.segs.length || s.looks) ? (s.sum ? "<p class=\"hint\">สรุป: " + U.esc(s.sum) + "</p>" : "") + "<div class=\"splines\">" + timeline(c) + "</div>" : "<p class=\"hint\">AI ไม่พบบทพูด</p>";
      var playBtn = s.silent ? "" : "<button type=\"button\" class=\"btn small spplay\" data-id=\"" + U.esc(c.id) + "\" data-t=\"0\">" + MWIcon("play") + "เล่นคลิปเทียบเสียง</button>";
      return "<details class=\"spc\"><summary><b>" + U.esc(c.name) + "</b><small>" + tm(s.sec) + " · " + (s.silent ? "เงียบ" : s.segs.length + " บรรทัด · " + U.money(s.cost || 0)) + "</small></summary>" + playBtn + body + "</details>"; }).join("");
  }
  async function runList(list, label){
    if(run || !list.length) return; run = true; stopF = false; var done = 0, fail = 0, bad = 0, cost0 = stats().cost, last = "";
    for(var i = 0; i < list.length && !stopF; i++){
      render(label + " " + (i + 1) + "/" + list.length + " · " + list[i].name + (last ? " · ล่าสุดพลาด: " + last : ""));
      try{ await doClip(list[i]); done++; bad = 0; }
      catch(e){ fail++; bad++; last = (e && e.message) || String(e); if((e && e.budget) || bad >= FAIL_STOP) break; }
    }
    run = false; var used = stats().cost - cost0; if(done && U.refresh) U.refresh(); /* ภาคจากเสียง → อัลบั้ม/จัดอัลบั้มใหม่ วาดใหม่ */
    render(label + ": ฟังเสร็จ " + done + " คลิป" + (fail ? " · พลาด " + fail + (last ? " (" + last + ")" : "") : "") + " · ใช้ " + U.money(used) + (stopF ? " · พักไว้" : ""), fail ? "err" : "ok");
  }
  $("spTrial").addEventListener("click", async function(){
    if(!FT.orKey()){ await MWDialog.alert("ยังไม่มี OpenRouter key ในแอพ ไปใส่ที่ ตั้งค่า > คีย์ API ก่อน"); return; }
    var pend = pending(), pick = []; while(pick.length < TRIAL && pend.length){ pick.push(pend.splice(Math.floor(Math.random() * pend.length), 1)[0]); }
    if(!await MWDialog.confirm("ให้ AI ฟังเสียง " + pick.length + " คลิป (สุ่ม)?\n\nประมาณ " + U.money(pick.length * (stats().avg || (watchOn ? GUESSW : GUESS))) + (stats().avg ? " (จากค่าเฉลี่ยที่ฟังไปแล้ว)" : " (ประมาณการหยาบ ยังไม่เคยวัดจริง)") + "\n\nต้องเปิดหน้านี้ค้างไว้จนเสร็จ ผลที่ได้จะโชว์บทพูดให้ตรวจ", { ok:"เริ่ม" })) return;
    runList(pick, "ทดลอง");
  });
  $("spAll").addEventListener("click", async function(){
    var pend = pending(); if(!pend.length) return; var nu = pend.filter(unsureArc).length;
    if(!await MWDialog.confirm("ให้ AI ฟังเสียงที่เหลือ " + pend.length + " คลิป?" + (nu ? "\n\nเริ่มจากคลิปที่ยังไม่แน่ใจภาค " + nu + " คลิปก่อน (เสียงช่วยบอกภาค จัดอัลบั้มได้มากขึ้น)" : "") + "\n\nประมาณ " + U.money(pend.length * (stats().avg || (watchOn ? GUESSW : GUESS))) + " (จากค่าเฉลี่ยที่ฟังไปแล้ว " + U.money(stats().avg) + " ต่อคลิป ราคาจริงอาจต่างไป)\n\nต้องเปิดแอพค้างไว้ พักและทำต่อได้ ไม่ฟังคลิปเดิมซ้ำ", { ok:"เริ่ม" })) return;
    runList(pend, "ฟังเสียง");
  });
  $("spList").addEventListener("click", function(e){ /* กดบรรทัดบทพูด/ปุ่มเล่น = เปิดตัวเล่นเต็มจอของคลิปนั้นที่เวลานั้น (เทียบกับเสียงจริง) */
    var b = e.target.closest("[data-id]"); if(!b || !U.playAt) return; var c = U.lib().find(function(x){ return x.id === b.dataset.id; }); if(c) U.playAt(c, Math.max(0, parseFloat(b.dataset.t) - 0.3));
  });
  $("spWatch").addEventListener("change", function(){ watchOn = this.checked; MWStore.set(WK, { watch:watchOn, eco:ecoOn }); render(); });
  $("spEco").addEventListener("change", function(){ ecoOn = this.checked; MWStore.set(WK, { watch:watchOn, eco:ecoOn }); });
  $("spStop").addEventListener("click", function(){ stopF = true; $("spStop").hidden = true; });
  document.addEventListener("ft:lib", function(){ if(!run) render(); });
  document.addEventListener("ft:files", function(){ if(!run) render(); });
  FT.speech = { doClip:doClip, stats:stats, denseFrames:denseFrames };
  render();
})();
