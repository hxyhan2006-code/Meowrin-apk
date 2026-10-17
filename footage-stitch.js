/* footage-stitch.js — ต่อฉากเป็นวิดีโอยาวไฟล์เดียวในเบราว์เซอร์ (แท็บผู้กำกับ) · โหลดหลัง footage-find.js (ใช้ FT.ui)
   FT.stitch = { ok(), make(list, onStep, onMsg, opt) → { file, marks, rate, mime }, save(file, say) }
   list = [{ c, sc, from?, to? }] (from/to = ช่วงที่ตัด ถ้าไม่ใส่ใช้ทั้งฉาก) · opt.sep = วินาทีของจอเขียว + เสียงตื๊ด คั่นระหว่างช็อต (0 = ไม่คั่น)
   opt.square = แบบ 2 สไตล์ช่อง: ไฟล์ 1080x1080 ภาพครอปเต็มกรอบ + เลื่อนซ้าย/ขวาช้าๆ ในส่วนที่เหลือ (pan) สลับทิศทุกภาพ · ไม่ใส่ = ขนาดเท่าคลิปต้นทาง วางทั้งภาพ (แบบ 1 ไปตัดเอง)
   opt.voice = Blob เสียงพากย์ → โหมดตัดตามเสียง: list = [{ c|null, from, to, at }] (at = วินาทีที่ช็อตเริ่มในเสียง · c ว่าง = ค้างภาพก่อนหน้า) อัดต่อเนื่องไม่ pause เสียงพากย์เล่นเป็นเส้นเวลาหลัก ภาพของฉากปิดเสียง
   ไม่มีปุ่มแชร์: ทดสอบแล้ว CapCut ขึ้น "ไม่รองรับไฟล์" ทุกครั้งที่แชร์จาก Brave แต่เปิดไฟล์ที่บันทึกลงเครื่องได้ */
(function(){
  "use strict";
  var FT = window.FT, U = FT && FT.ui; if(!U) return;
  /* เล่นทีละช็อต (เฉพาะช่วง) วาดลง canvas + เสียงผ่าน WebAudio แล้วอัดต่อกันด้วย MediaRecorder ตัวเดียว (pause ระหว่างเปิดไฟล์ถัดไป)
     อัดเวลาจริง ต้องเปิดหน้าค้างไว้ · ไฟล์ไม่ต้องแชร์แล้ว จึงไม่บีบให้เล็ก */
  var RATE = 6e6, BEEP_HZ = 1000, GREEN = "#00ff00", SQ = 1080, PAN = 0.28, ZOOM = 0.06;
  function pan(g, W, H, img, iw, ih, p, i, fx){ /* วาดแบบสไตล์ช่อง: ครอปเต็มกรอบ แล้วเลื่อนในส่วนที่เหลือ ≤ PAN ของความกว้าง (ภาพคู่ไปขวา ภาพคี่ไปซ้าย, ค่อยๆ เร่ง-ชะลอ) · ภาพที่ไม่มีส่วนเหลือ (ภาพจัตุรัส/แนวตั้ง) = ซูมเบาๆ แทน */
    if(!iw || !ih) return;
    p = Math.max(0, Math.min(1, p || 0)); p = 0.5 - 0.5 * Math.cos(Math.PI * p);
    var s = Math.max(W / iw, H / ih), w = iw * s, h = ih * s, dir = i % 2 ? -1 : 1, ex = w - W, ey = h - H, x, y;
    if(ex > W * 0.06){ /* เลื่อนในหน่วยสัดส่วนความกว้างภาพ: c = จุดกึ่งกลางหน้าต่างที่เห็น · fx = ตำแหน่งตัวละคร (0-1) ถ้ามี หน้าต่างจะเกาะตัวละครไว้ ไม่ตัดหลุดเฟรม */
      var vf = W / w, R = Math.min(ex, W * PAN) / w, f = fx == null || !isFinite(fx) ? 0.5 : Math.max(0, Math.min(1, fx)), c = f - dir * R * (p - 0.5);
      if(fx != null && isFinite(fx)){ c = Math.max(c, f - vf * 0.32); c = Math.min(c, f + vf * 0.32); } /* ตัวละครอยู่ในช่วงกลาง ~64% ของหน้าต่างเสมอ */
      c = Math.max(vf / 2, Math.min(1 - vf / 2, c)); x = -(c - vf / 2) * w; y = (H - h) / 2; }
    else if(ey > H * 0.06){ x = (W - w) / 2; y = (H - h) / 2 + dir * Math.min(ey, H * PAN) * (p - 0.5); }
    else { var z = 1 + ZOOM * (dir > 0 ? p : 1 - p); w *= z; h *= z; x = (W - w) / 2; y = (H - h) / 2; }
    g.fillStyle = "#000"; g.fillRect(0, 0, W, H); g.drawImage(img, x, y, w, h);
  }
  function fit(g, W, H, v){ var r = Math.min(W / v.videoWidth, H / v.videoHeight), w = v.videoWidth * r, h = v.videoHeight * r; g.fillStyle = "#000"; g.fillRect(0, 0, W, H); g.drawImage(v, (W - w) / 2, (H - h) / 2, w, h); }
  function recMime(){
    var c = ["video/mp4;codecs=avc1.640028,mp4a.40.2", "video/mp4;codecs=avc1,mp4a.40.2", "video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
    return window.MediaRecorder ? c.find(function(m){ return MediaRecorder.isTypeSupported(m); }) || "" : null;
  }
  function once(el, ev){ return new Promise(function(ok, no){ el.addEventListener(ev, ok, { once:true }); el.addEventListener("error", function(){ no(new Error("เปิดไฟล์วิดีโอไม่ได้")); }, { once:true }); }); }
  async function openVid(c){ /* ไฟล์ในเครื่อง หรือสตรีมจากคลัง (crossOrigin ให้วาดลง canvas/อัดเสียงได้ — คลังต้องตั้ง CORS) */
    var src = await U.srcUrl(c); if(!src) throw new Error("ไม่มีไฟล์ " + c.name);
    var v = document.createElement("video"); v.playsInline = true; v.preload = "auto"; v.crossOrigin = "anonymous"; v._done = src.done;
    v.style.cssText = "position:fixed;left:-9999px;width:2px;height:2px"; document.body.appendChild(v);
    v.src = src.url; await once(v, "loadedmetadata"); return v;
  }
  function closeVid(v){ v.pause(); if(v._done) v._done(); v.removeAttribute("src"); v.load(); v.remove(); }
  async function record(list, mime, ac, onStep, sep, sq){
    var first = await openVid(list[0].c), W = sq ? SQ : first.videoWidth || 1080, H = sq ? SQ : first.videoHeight || 1080; closeVid(first);
    var cv = document.createElement("canvas"); cv.width = W; cv.height = H; var g = cv.getContext("2d");
    var dest = ac.createMediaStreamDestination();
    var stream = new MediaStream(cv.captureStream(30).getVideoTracks().concat(dest.stream.getAudioTracks()));
    var rec = new MediaRecorder(stream, { mimeType:mime, videoBitsPerSecond:RATE, audioBitsPerSecond:128000 }), parts = [], marks = [], at = 0;
    rec.ondataavailable = function(ev){ if(ev.data && ev.data.size) parts.push(ev.data); };
    var stopped = new Promise(function(ok){ rec.onstop = ok; });
    async function separator(){ /* จอเขียว + เสียงตื๊ดยาว = จุดเปลี่ยนช็อต ให้เห็นง่ายตอนตัดใน CapCut */
      var osc = ac.createOscillator(), gn = ac.createGain(); osc.type = "sine"; osc.frequency.value = BEEP_HZ; gn.gain.value = 0.25; osc.connect(gn); gn.connect(dest);
      g.fillStyle = GREEN; g.fillRect(0, 0, W, H); rec.resume(); osc.start();
      var t0 = performance.now();
      await new Promise(function(ok){ (function tick(){ g.fillStyle = GREEN; g.fillRect(0, 0, W, H); if(performance.now() - t0 >= sep * 1000) ok(); else requestAnimationFrame(tick); })(); });
      rec.pause(); osc.stop(); osc.disconnect(); gn.disconnect();
      at += (performance.now() - t0) / 1000;
    }
    try{
      for(var i = 0; i < list.length; i++){
        var x = list[i], v = await openVid(x.c), src = null;
        try{
          var s = x.from != null ? x.from : x.sc.s, e = Math.min(x.to != null ? x.to : x.sc.e, v.duration);
          v.currentTime = s; await once(v, "seeked");
          try{ src = ac.createMediaElementSource(v); src.connect(dest); }catch(err){ v.muted = true; } /* เสียงไปเข้าไฟล์อย่างเดียว ไม่ออกลำโพง */
          var draw = function(){ if(sq) pan(g, W, H, v, v.videoWidth, v.videoHeight, (v.currentTime - s) / Math.max(0.1, e - s), i, x.fx); else fit(g, W, H, v); };
          draw();
          onStep(i, x);
          if(i && sep) await separator(); /* คั่นก่อนช็อตที่ 2 เป็นต้นไป (ไฟล์ถัดไปเปิดรอไว้แล้ว) */
          if(rec.state === "inactive") rec.start(); else rec.resume();
          try{ await v.play(); }catch(err){ v.muted = true; await v.play(); } /* เล่นมีเสียงไม่ได้ → อัดภาพอย่างเดียวช็อตนี้ */
          var t0 = performance.now();
          await new Promise(function(ok){
            function tick(){ draw(); if(v.currentTime >= e - 0.03 || v.ended){ ok(); return; } if(v.requestVideoFrameCallback) v.requestVideoFrameCallback(tick); else requestAnimationFrame(tick); }
            tick(); v.onended = ok;
          });
          rec.pause(); v.pause();
          var len = (performance.now() - t0) / 1000;
          marks.push({ i:i, at:at, len:len, x:x }); at += len;
        }finally{ if(src) src.disconnect(); closeVid(v); }
      }
      rec.stop(); await stopped;
    }finally{ stream.getTracks().forEach(function(t){ t.stop(); }); if(rec.state !== "inactive") rec.stop(); }
    return { blob:new Blob(parts, { type:mime.split(";")[0] }), marks:marks, rate:RATE };
  }
  async function recordVoice(list, mime, ac, voiceBlob, onStep, sq){ /* ตัดตามเสียง: เสียงพากย์เดินต่อเนื่อง ภาพเปลี่ยนตามเวลา at ของแต่ละช็อต (เตรียมคลิปถัดไปล่วงหน้า LOOK ช็อต) */
    var LOOK = 3, buf = await ac.decodeAudioData(await voiceBlob.arrayBuffer()), total = buf.duration;
    var f0 = list.find(function(x){ return x.c; }); if(!f0) throw new Error("ไม่มีช็อตที่มีฉากเลย");
    var first = await openVid(f0.c), W = sq ? SQ : first.videoWidth || 1080, H = sq ? SQ : first.videoHeight || 1080; closeVid(first);
    var cv = document.createElement("canvas"); cv.width = W; cv.height = H; var g = cv.getContext("2d"); g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
    var dest = ac.createMediaStreamDestination();
    var stream = new MediaStream(cv.captureStream(30).getVideoTracks().concat(dest.stream.getAudioTracks()));
    var rec = new MediaRecorder(stream, { mimeType:mime, videoBitsPerSecond:RATE, audioBitsPerSecond:128000 }), parts = [], marks = [];
    rec.ondataavailable = function(ev){ if(ev.data && ev.data.size) parts.push(ev.data); };
    var stopped = new Promise(function(ok){ rec.onstop = ok; });
    var prepared = {};
    function prep(i){ if(i >= list.length || prepared[i] || !list[i].c) return;
      prepared[i] = (async function(){ var v = await openVid(list[i].c); v.muted = true; v.currentTime = list[i].from; await once(v, "seeked"); return v; })();
      prepared[i].catch(function(){}); }
    function draw(v, p, i){ if(sq) pan(g, W, H, v, v.videoWidth, v.videoHeight, p, i, list[i].fx); else fit(g, W, H, v); }
    for(var k = 0; k <= LOOK; k++) prep(k);
    var firstIdx = list.indexOf(f0); if(prepared[firstIdx]) await prepared[firstIdx].catch(function(){});
    var src = ac.createBufferSource(); src.buffer = buf; src.connect(dest);
    var t0 = ac.currentTime + 0.2; rec.start(); src.start(t0);
    var now = function(){ return ac.currentTime - t0; };
    try{
      for(var i = 0; i < list.length; i++){
        var x = list[i], end = i + 1 < list.length ? list[i + 1].at : total, v = null;
        for(var q = 1; q <= LOOK; q++) prep(i + q);
        if(x.c){ try{ v = await prepared[i]; }catch(err){ v = null; } }
        onStep(i, x);
        if(v){ try{ await v.play(); }catch(err){} }
        var ts = now();
        await new Promise(function(ok){
          (function tick(){
            if(v && v.readyState >= 2){ draw(v, (now() - ts) / Math.max(0.1, end - ts), i); if(v.currentTime >= x.to - 0.03) v.pause(); } /* ฉากสั้นกว่าช็อต = ค้างภาพสุดท้าย (ภาพยังเลื่อนต่อ) */
            if(now() >= end){ ok(); return; } requestAnimationFrame(tick);
          })();
        });
        marks.push({ i:i, at:Math.max(0, ts), len:Math.max(0, now() - ts), x:x });
        if(v){ closeVid(v); delete prepared[i]; }
      }
      while(now() < total + 0.15) await new Promise(function(ok){ setTimeout(ok, 50); });
      rec.stop(); await stopped;
    }finally{
      Object.keys(prepared).forEach(function(i){ prepared[i].then(closeVid, function(){}); });
      try{ src.stop(); }catch(err){} stream.getTracks().forEach(function(t){ t.stop(); }); if(rec.state !== "inactive") rec.stop();
    }
    return { blob:new Blob(parts, { type:mime.split(";")[0] }), marks:marks, rate:RATE };
  }
  async function makeFast(list, onStep, onMsg, voice, sq){ /* ตัดต่อแบบเร็ว (ไม่อัดเวลาจริง): ถอดรหัสเฟรมจากไฟล์ต้นทางด้วย WebCodecs ผ่าน exporter.js แล้วใส่เสียงพากย์ · list แบบเดียวกับ recordVoice */
    var mod = await import("./exporter.js?v=" + (window.MW_VERSION || "0")), shots = [], dones = [], DEFAULT_DUR = 1;
    try{
      for(var i = 0; i < list.length; i++){
        var x = list[i], sh = { at:x.at, start:x.from, end:x.to, dur:DEFAULT_DUR, url:null };
        if(x.c){ var s = await U.srcUrl(x.c); if(!s) throw new Error("ไม่มีไฟล์ " + x.c.name); sh.url = s.url; if(s.done) dones.push(s.done); }
        shots.push(sh);
      }
      var r = await mod.exportShots({ shots:shots, voice:voice, width:sq ? SQ : 1080, height:sq ? SQ : 1920, fps:30, draw:sq ? function(g, W, H, img, p, i){ pan(g, W, H, img, img.width, img.height, p, i, list[i].fx); } : null, onLog:function(t){ if(onMsg) onMsg(t); }, onShot:function(i){ onStep(i, list[i]); } });
      var marks = list.map(function(x, i){ return { i:i, at:x.at, len:r.durs[i], x:x }; });
      return { blob:r.blob, marks:marks, rate:0, ms:r.ms, codec:r.codec + "/" + r.audio };
    }finally{ dones.forEach(function(d){ try{ d(); }catch(e){} }); }
  }
  function fastOk(){ return !!(window.VideoEncoder && window.AudioEncoder && window.AudioContext && window.fetch); }
  function ok(){ var AC = window.AudioContext || window.webkitAudioContext; return fastOk() || !!(recMime() && AC && HTMLCanvasElement.prototype.captureStream); }
  async function make(list, onStep, onMsg, opt){ /* เรียกตรงจากการแตะปุ่ม (ต้องสร้าง AudioContext ตอนมีการแตะ) */
    var mime = recMime(), AC = window.AudioContext || window.webkitAudioContext, ac = new AC(); ac.resume();
    await U.wake(true);
    try{
      var r = null;
      if(opt && opt.voice && fastOk()){
        try{ r = await makeFast(list, onStep, onMsg, opt.voice, !!opt.square); r.fast = true; }
        catch(err){ if(onMsg) onMsg("ตัดแบบเร็วไม่ได้ (" + err.message + ") ใช้แบบอัดเวลาจริงแทน"); r = null; } /* ถอยไปแบบเดิม ไม่เงียบ */
      }
      if(!r) r = opt && opt.voice ? await recordVoice(list, mime, ac, opt.voice, onStep, !!opt.square) : await record(list, mime, ac, onStep, (opt && opt.sep) || 0, !!(opt && opt.square));
      if(!r.blob.size) throw new Error("อัดได้ไฟล์ว่าง");
      var d = new Date(), ext = r.fast || mime.indexOf("mp4") >= 0 ? "mp4" : "webm", out = r.blob;
      if(!r.fast && ext === "mp4" && window.MP4Fix){ if(onMsg) onMsg("กำลังจัดไฟล์ให้ CapCut อ่านได้..."); out = await MP4Fix.remux(r.blob); } /* MediaRecorder ให้ fragmented MP4 ซึ่ง CapCut ไม่รับ */
      var file = new File([out], "meowrin_" + String(d.getHours()).padStart(2, "0") + String(d.getMinutes()).padStart(2, "0") + "." + ext, { type:out.type || r.blob.type });
      return { file:file, marks:r.marks, rate:r.rate, mime:r.fast ? "video/mp4" : mime, fast:!!r.fast, ms:r.ms };
    }finally{ ac.close(); await U.wake(false); }
  }
  function save(file, say){ /* บันทึกลงโฟลเดอร์ Download แล้วเปิดจากแกลเลอรีใน CapCut · ในแอพ APK เซฟลง Documents/Meowrin ด้วยปลั๊กอิน */
    if(window.MWNative && MWNative.isNative()){
      MWNative.save(file, file.name).then(function(r){ var mb = (r.size / 1048576).toFixed(1) + " MB" + (r.verified ? " (ตรวจขนาดตรงแล้ว)" : "");
        say(r.scanned ? "บันทึกแล้ว " + mb + " ที่ " + r.path + " และแจ้งแกลเลอรีแล้ว · เปิด CapCut → โปรเจกต์ใหม่ → เลือกจากแกลเลอรี (ถ้ายังไม่เห็น รอสักครู่หรือกดแชร์ไฟล์)"
          : r.gallery ? "บันทึกแล้ว " + mb + " ที่ " + r.path + " และก๊อปไว้ที่ Pictures/Meowrin แต่แกลเลอรีกับ CapCut อาจยังไม่เห็นจนกว่าจะรีสตาร์ทเครื่อง (Android รุ่นใหม่ไม่สแกนให้) · ใช้ปุ่ม แชร์ไฟล์ ส่งเข้า CapCut ได้ทันที หรือเปิดแอพ ไฟล์ ไปที่ Documents/Meowrin"
          : "บันทึกแล้ว " + mb + " ที่ " + r.path + " (" + r.name + ") · แกลเลอรี/CapCut จะยังไม่เห็นไฟล์นี้ ใช้ปุ่ม แชร์ไฟล์ แล้วเลือก CapCut หรือเปิดแอพ ไฟล์ ไปที่ Documents/Meowrin", r.scanned || r.gallery ? "ok" : ""); },
                                          function(e){ say("บันทึกไม่ได้: " + e.message); });
      return;
    }
    var url = URL.createObjectURL(file), a = document.createElement("a"); a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 4000);
    say("สั่งบันทึกแล้ว ดูในโฟลเดอร์ Download ของมือถือ (" + file.name + ") แล้วเปิด CapCut → โปรเจกต์ใหม่ → เลือกจากแกลเลอรี", "ok");
  }
  function canShare(){ return !!(window.MWNative && MWNative.canShare()); }
  FT.stitch = { ok:ok, fastOk:fastOk, make:make, save:save, pan:pan, canShare:canShare };
})();
