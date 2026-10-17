/* studio.js — หน้าสตูดิโอตัดต่อ (studio.html) รอบ 1-2: เปิดโปรเจกต์ที่ส่งมาจากตัดต่ออัตโนมัติ · พรีวิว (studio-player.js) · ไทม์ไลน์
   (เส้นเล่นอยู่กลางจอ เลื่อนไทม์ไลน์ = กรอ, สองนิ้ว = ซูม) · แตะคลิป = เลือก · แบ่ง/ลบ/ทำซ้ำคลิป/ย้ายซ้ายขวา/ลากขอบยืดหด/เลิกทำ (studio-model.js) · ส่งออก mp4 (exporter.js)
   ข้อมูลโปรเจกต์ทั้งหมดอยู่ใน MWStudio ไฟล์นี้วาดหน้าจออย่างเดียว */
(function(){
  "use strict";
  var $ = function(id){ return document.getElementById(id); };
  var proj = MWStudio.load(), ed = null, player = null, sel = -1, pps = 60, lockX = -1, busy = false;
  var PPS_MIN = 15, PPS_MAX = 240;

  function fmt(t){ t = Math.max(0, t || 0); var m = Math.floor(t / 60), s = t - m * 60; return String(m).padStart(2, "0") + ":" + (s < 10 ? "0" : "") + s.toFixed(1); }
  function say(t, bad){ var m = $("stMsg"); m.textContent = t || ""; m.className = "msg" + (bad ? " err" : ""); }
  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"]/g, function(c){ return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]; }); }
  function urlOf(c){ /* ที่อยู่ที่ <video>/ตัวส่งออกอ่านได้ · ไฟล์ในมือถือผ่านตัวช่วยไฟล์ของแอพ · ลิงก์ http/blob ใช้ตรง (เทสต์) */
    if(!c || !c.uri) return null;
    if(/^(https?|blob):/.test(c.uri)) return c.uri;
    return window.MWLocal && window.Capacitor ? MWLocal.fileUrl(c.uri) : null;
  }

  if(!proj){ $("stEmpty").hidden = false; return; }
  $("stMain").hidden = false; $("stExport").hidden = false; $("stName").textContent = proj.name;

  /* ---------- ตัวเล่น ---------- */
  player = new MWStudioPlayer.Player($("stCanvas"), {
    urlOf:urlOf,
    onTime:function(t){ $("stNow").textContent = fmt(t); if(player && player.playing) scrollTo(t); },
    onState:function(on){ $("stPlay").innerHTML = MWIcon(on ? "pause" : "play"); $("stPlay").setAttribute("aria-label", on ? "หยุด" : "เล่น"); }
  });
  ed = new MWStudio.Editor(proj, function(p){ proj = p; player.setProject(p); render(); });
  player.setProject(proj);
  if(proj.voice && window.MWVoice) MWVoice.get(proj.voice.id).then(function(r){
    if(r && r.blob) player.setVoice(URL.createObjectURL(r.blob)); else say("ไม่เจอเสียงพากย์ของโปรเจกต์นี้แล้ว (ถูกลบ) พรีวิวจะไม่มีเสียง", true);
  }).catch(function(){});

  /* ---------- ไทม์ไลน์ ---------- */
  function pad(){ return Math.round($("stTl").clientWidth / 2); }
  function render(){
    var dur = MWStudio.duration(proj), P = pad(), st = MWStudio.starts(proj), h = [];
    $("stTlIn").style.width = (P * 2 + dur * pps) + "px";
    var step = pps >= 90 ? 1 : pps >= 40 ? 2 : 5; /* ป้ายเวลาไม่ซ้อนกันเมื่อซูมออก */
    for(var s = 0; s <= dur + 0.001; s += step / 2){ var x = P + s * pps;
      h.push(Math.round(s * 2) % (step * 2) === 0 ? '<span class="tk" style="left:' + x + 'px">' + fmt(s).slice(0, 5) + "</span>" : '<span class="tk dot" style="left:' + x + 'px"></span>'); }
    proj.clips.forEach(function(c, i){
      var w = Math.max(6, c.len * pps - 2), bg = c.thumb ? ' style="left:' + (P + st[i] * pps) + "px;width:" + w + "px;background-image:url(" + c.thumb + ')"' : ' style="left:' + (P + st[i] * pps) + "px;width:" + w + 'px"';
      h.push('<div class="clip' + (i === sel ? " sel" : "") + (c.uri ? "" : " black") + '" data-i="' + i + '"' + bg + "><span>" + c.len.toFixed(1) + "s</span>" + (i === sel ? '<i class="gl" aria-label="ลากขอบซ้าย ตัดหัวคลิป"></i><i class="gr" aria-label="ลากขอบขวา ยืดหดท้ายคลิป"></i>' : "") + "</div>");
    });
    if(proj.voice) h.push('<div class="vo" style="left:' + P + "px;width:" + Math.max(6, proj.voice.dur * pps) + 'px">เสียงพากย์ · ' + esc(proj.voice.name || "เทคที่เลือก") + "</div>");
    proj.texts.forEach(function(x){ h.push('<div class="tx" style="left:' + (P + x.at * pps) + "px;width:" + Math.max(4, x.len * pps) + 'px">' + esc(x.t) + "</div>"); });
    $("stTlIn").innerHTML = h.join("");
    $("stDur").textContent = fmt(dur); $("stUndo").disabled = !ed.canUndo(); $("stRedo").disabled = !ed.canRedo();
    scrollTo(player.t);
  }
  function scrollTo(t){ var x = Math.round(t * pps); if(Math.abs($("stTl").scrollLeft - x) < 1) return; lockX = x; $("stTl").scrollLeft = x; }
  $("stTl").addEventListener("scroll", function(){ /* Han เลื่อนไทม์ไลน์เอง = กรอ (หยุดเล่นก่อน) · ที่โค้ดเลื่อนให้ตอนเล่น ไม่นับ */
    var x = this.scrollLeft; if(lockX >= 0 && Math.abs(x - lockX) <= 1){ lockX = -1; return; } lockX = -1;
    if(player.playing) player.pause();
    player.seek(x / pps);
  }, { passive:true });
  $("stTlIn").addEventListener("click", function(e){
    var c = e.target.closest(".clip"); sel = c ? +c.dataset.i : -1; render();
  });
  $("stTlIn").addEventListener("pointerdown", function(e){ /* ลากขอบคลิปที่เลือกอยู่ = ยืด/หดคลิป (คลิปหลังจากนั้นขยับตาม) · ปล่อยแล้วค่อยบันทึก = เลิกทำได้ทีเดียว */
    var g = e.target.closest(".gl,.gr"); if(!g) return;
    var el = g.parentNode, i = +el.dataset.i, c = proj.clips[i], side = g.classList.contains("gl") ? "start" : "end", x0 = e.clientX, d = 0;
    e.preventDefault(); player.pause(); g.setPointerCapture(e.pointerId);
    function mv(ev){ d = (ev.clientX - x0) / pps; var r = MWStudio.trimTo(c, side, d); el.style.width = Math.max(6, r.len * pps - 2) + "px"; el.querySelector("span").textContent = r.len.toFixed(1) + "s"; }
    function up(){
      g.removeEventListener("pointermove", mv); g.removeEventListener("pointerup", up); g.removeEventListener("pointercancel", up);
      var at = MWStudio.starts(proj)[i];
      if(ed.trim(i, side, d)){ var n = proj.clips[i]; player.seek(side === "start" ? at : at + n.len - 0.05); say(side === "start" ? "ตัดหัวคลิปแล้ว (ช่วงท้ายยังเหมือนเดิม)" : "ปรับความยาวท้ายคลิปแล้ว"); }
      else{ render(); if(Math.abs(d) > 0.02) say(side === "end" && c.max > 0 ? "คลิปต้นทางมีแค่นี้ ยืดต่อไม่ได้" : "สั้นสุดแล้ว", true); }
    }
    g.addEventListener("pointermove", mv); g.addEventListener("pointerup", up); g.addEventListener("pointercancel", up);
  });
  (function pinch(){ /* สองนิ้วบนไทม์ไลน์ = ซูมเข้า/ออก (เวลาที่เส้นเล่นอยู่คงที่) */
    var d0 = 0, p0 = pps, tl = $("stTl");
    function dist(e){ var a = e.touches[0], b = e.touches[1]; return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); }
    tl.addEventListener("touchstart", function(e){ if(e.touches.length === 2){ d0 = dist(e); p0 = pps; } }, { passive:true });
    tl.addEventListener("touchmove", function(e){
      if(e.touches.length !== 2 || !d0) return; e.preventDefault();
      var n = Math.max(PPS_MIN, Math.min(PPS_MAX, p0 * dist(e) / d0)); if(Math.abs(n - pps) < 0.5) return; pps = n; render();
    }, { passive:false });
    tl.addEventListener("touchend", function(e){ if(e.touches.length < 2) d0 = 0; }, { passive:true });
  })();
  window.addEventListener("resize", render);

  /* ---------- ปุ่ม ---------- */
  $("stPlay").addEventListener("click", function(){ player.toggle(); });
  $("stUndo").addEventListener("click", function(){ if(ed.undo()) say("เลิกทำแล้ว"); });
  $("stRedo").addEventListener("click", function(){ if(ed.redo()) say("ทำซ้ำแล้ว"); });
  $("stSplit").addEventListener("click", function(){
    player.pause(); var at = MWStudio.clipAt(proj, player.t);
    if(ed.split(player.t)){ sel = at.i + 1; render(); say("แบ่งคลิปตรงเส้นเล่นแล้ว"); }
    else say(at.i < 0 ? "เลื่อนเส้นเล่นไปไว้บนคลิปที่จะแบ่งก่อน" : "เส้นเล่นชิดขอบคลิปเกินไป เลื่อนเข้าไปกลางคลิปอีกนิด", true);
  });
  function picked(){ return sel >= 0 ? sel : MWStudio.clipAt(proj, player.t).i; }
  $("stDup").addEventListener("click", function(){ player.pause(); var i = picked(); if(i < 0){ say("แตะเลือกคลิปที่จะทำซ้ำก่อน", true); return; } if(ed.duplicate(i)){ sel = i + 1; render(); say("ทำซ้ำคลิปแล้ว (ต่อท้ายคลิปเดิม)"); } });
  [["stLeft", -1], ["stRight", 1]].forEach(function(b){ $(b[0]).addEventListener("click", function(){
    player.pause(); var i = picked(); if(i < 0){ say("แตะเลือกคลิปที่จะย้ายก่อน", true); return; }
    if(ed.move(i, b[1])){ sel = i + b[1]; render(); player.seek(MWStudio.starts(proj)[sel]); say("ย้ายคลิปไป" + (b[1] < 0 ? "ซ้าย" : "ขวา") + "แล้ว"); } else say("อยู่" + (b[1] < 0 ? "หน้าสุด" : "ท้ายสุด") + "แล้ว", true);
  }); });
  $("stDel").addEventListener("click", function(){
    player.pause(); var i = sel >= 0 ? sel : MWStudio.clipAt(proj, player.t).i;
    if(proj.clips.length < 2){ say("ต้องเหลืออย่างน้อย 1 คลิป", true); return; }
    if(ed.remove(i)){ sel = -1; render(); say("ลบคลิปแล้ว (กดเลิกทำได้)"); } else say("แตะเลือกคลิปที่จะลบก่อน", true);
  });

  /* ---------- ส่งออก (ภาพเต็มกรอบไม่ตัดขอบ + พื้นหลังแบบเดียวกับพรีวิว) ---------- */
  $("stExport").addEventListener("click", async function(){
    if(busy) return; player.pause();
    var size = MWStudio.RATIOS[proj.ratio] || [1080, 1920], st = MWStudio.starts(proj), voice = null;
    var missing = proj.clips.filter(function(c){ return c.uri && !urlOf(c); }).length;
    if(missing){ say("มี " + missing + " คลิปที่หาไฟล์ในมือถือไม่เจอ ส่งออกได้เฉพาะในแอพ", true); return; }
    busy = true; this.disabled = true; say("กำลังเตรียม...");
    try{
      if(proj.voice && window.MWVoice){ var r = await MWVoice.get(proj.voice.id); voice = r && r.blob || null; }
      var mod = await import("./exporter.js?v=" + (window.MW_VERSION || "0"));
      var shots = proj.clips.map(function(c, i){ return { url:urlOf(c), start:c.from, dur:c.len, at:voice ? st[i] : undefined }; });
      var res = await mod.exportShots({ shots:shots, voice:voice, width:size[0], height:size[1], fps:30,
        draw:function(ctx, W, H, img){ MWStudioPlayer.draw(ctx, W, H, img, img.width, img.height, proj.bg); },
        onProgress:function(p){ say("กำลังส่งออก " + Math.round(p * 100) + "% (เปิดหน้าจอไว้)"); } });
      var d = new Date(), name = "meowrin_studio_" + String(d.getHours()).padStart(2, "0") + String(d.getMinutes()).padStart(2, "0") + ".mp4";
      var sv = await MWNative.save(res.blob, name);
      say((sv && sv.path ? "บันทึกแล้วที่ " + sv.path + " (" + sv.name + ")" : "สั่งบันทึกแล้ว (" + name + ")") + " · ใช้เวลา " + Math.round(res.ms / 1000) + " วิ");
    }catch(err){ say("ส่งออกไม่ได้: " + (err && err.message || err), true); }
    busy = false; this.disabled = false;
  });

  window.MWBackHook = function(){ if(player.playing){ player.pause(); return true; } if(sel >= 0){ sel = -1; render(); return true; } return false; }; /* ปุ่มย้อนของมือถือ: หยุดเล่น/ยกเลิกเลือกก่อน */
  window.MWStudioUI = { ed:function(){ return ed; }, player:function(){ return player; } };
  render();
})();
