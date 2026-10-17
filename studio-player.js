/* studio-player.js (window.MWStudioPlayer) — ตัวเล่นพรีวิวของสตูดิโอ: วาดคลิปลง canvas ตามไทม์ไลน์ของโปรเจกต์ (MWStudio)
   ใช้ <video> 2 ตัวสลับกัน (ตัวที่เล่น + ตัวที่เตรียมคลิปถัดไปไว้) · มีเสียงพากย์ = ใช้เวลาของเสียงเป็นนาฬิกาหลัก ภาพตามเสียง
   ภาพในคลิปปิดเสียง (รอบนี้) · draw() = วิธีวางภาพลงกรอบ (เต็มกรอบไม่ตัดขอบ + พื้นหลังเบลอ/ดำ) ตัวส่งออกจะใช้ตัวเดียวกันในรอบหลัง */
(function(){
  "use strict";
  var PREVIEW = 960; /* ด้านยาวของพรีวิว (px) */
  var small = document.createElement("canvas"), sctx = small.getContext("2d");

  function draw(ctx, W, H, img, iw, ih, bg){ /* วางภาพทั้งภาพลงกรอบ W×H (ไม่ตัดขอบ) · ที่ว่าง = ภาพเดียวกันขยายเต็มแล้วเบลอ หรือสีดำ */
    if(!img || !iw || !ih){ ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); return; }
    if(bg === "blur"){ /* เบลอแบบถูก: ย่อภาพลงเล็กมากแล้วขยายกลับ (เร็วพอทุกเฟรมบนมือถือ ไม่ใช้ ctx.filter) */
      var sw = Math.max(4, Math.round(W / 24)), sh = Math.max(4, Math.round(H / 24)), c = Math.max(sw / iw, sh / ih);
      if(small.width !== sw || small.height !== sh){ small.width = sw; small.height = sh; }
      sctx.drawImage(img, (sw - iw * c) / 2, (sh - ih * c) / 2, iw * c, ih * c);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high"; ctx.drawImage(small, 0, 0, W, H);
      ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.fillRect(0, 0, W, H);
    }else{ ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); }
    var s = Math.min(W / iw, H / ih), w = iw * s, h = ih * s;
    ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
  }
  function size(ratio){ var r = (window.MWStudio && MWStudio.RATIOS[ratio]) || [1080, 1920], k = PREVIEW / Math.max(r[0], r[1]); return [Math.round(r[0] * k), Math.round(r[1] * k)]; }

  function Player(canvas, opt){
    var me = this; opt = opt || {};
    this.cv = canvas; this.ctx = canvas.getContext("2d", { alpha:false }); this.urlOf = opt.urlOf || function(c){ return c.uri; };
    this.onTime = opt.onTime || function(){}; this.onState = opt.onState || function(){};
    this.p = null; this.t = 0; this.playing = false; this.a = 0; this.raf = 0; this.base = { t:0, now:0 };
    this.slots = [0, 1].map(function(){
      var v = document.createElement("video"); v.muted = true; v.playsInline = true; v.preload = "auto"; v.setAttribute("playsinline", "");
      v.style.cssText = "position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none"; document.body.appendChild(v); /* อยู่ในหน้า: WebView บางรุ่นไม่ถอดรหัสวิดีโอที่ไม่ได้อยู่ในหน้า */
      var s = { v:v, idx:-1, url:"", want:0 };
      v.addEventListener("loadedmetadata", function(){ if(Math.abs(v.currentTime - s.want) > 0.05) v.currentTime = s.want; });
      ["seeked", "loadeddata"].forEach(function(ev){ v.addEventListener(ev, function(){ if(!me.playing && me.slots[me.a] === s) me.paint(); }); });
      return s;
    });
    this.audio = new Audio(); this.audio.preload = "auto";
  }
  Player.prototype.setProject = function(p){
    this.p = p; var wh = size(p.ratio); if(this.cv.width !== wh[0] || this.cv.height !== wh[1]){ this.cv.width = wh[0]; this.cv.height = wh[1]; }
    this.slots.forEach(function(s){ s.idx = -1; }); /* ลำดับคลิปอาจเปลี่ยน (แบ่ง/ลบ) ให้เตรียมใหม่ ไฟล์เดิมไม่ต้องโหลดซ้ำ */
    this.seek(Math.min(this.t, MWStudio.duration(p)));
  };
  Player.prototype.setVoice = function(url){ this.audio.src = url || ""; if(!url) this.audio.removeAttribute("src"); this.hasVoice = !!url; };
  Player.prototype.load = function(s, i, off){ /* เตรียมคลิป i ใน slot s ที่ตำแหน่ง off วินาทีจากต้นคลิป (บนไทม์ไลน์) */
    var c = this.p.clips[i]; s.idx = i; if(!c) return;
    var url = this.urlOf(c) || ""; s.want = c.from + off;
    if(!url){ s.url = ""; return; }
    if(s.url !== url){ s.url = url; s.v.src = url; return; } /* loadedmetadata จะไปที่ want ให้ */
    if(s.v.readyState >= 1 && Math.abs(s.v.currentTime - s.want) > 0.04) s.v.currentTime = s.want;
  };
  Player.prototype.paint = function(){
    var W = this.cv.width, H = this.cv.height, p = this.p; if(!p) return;
    var at = MWStudio.clipAt(p, this.t), s = this.slots[this.a], c = p.clips[at.i];
    if(!c || !this.urlOf(c)){ draw(this.ctx, W, H, null); return; } /* เลยท้ายแถวภาพ / ช็อตจอดำ */
    if(s.idx === at.i && s.url && s.v.readyState >= 2 && s.v.videoWidth) draw(this.ctx, W, H, s.v, s.v.videoWidth, s.v.videoHeight, p.bg);
    /* ยังโหลดไม่เสร็จ = คงภาพเดิมไว้ ไม่กะพริบดำ */
  };
  Player.prototype.seek = function(t){
    var p = this.p; if(!p) return; this.t = Math.max(0, Math.min(t, MWStudio.duration(p)));
    var at = MWStudio.clipAt(p, this.t), s = this.slots[this.a], o = this.slots[1 - this.a];
    if(at.i >= 0){
      if(s.idx !== at.i && o.idx === at.i){ this.a = 1 - this.a; s = o; o = this.slots[1 - this.a]; }
      this.load(s, at.i, at.off); if(at.i + 1 < p.clips.length && o.idx !== at.i + 1) this.load(o, at.i + 1, 0);
    }
    if(this.playing){ this.base = { t:this.t, now:performance.now() }; this.syncAudio(true); if(s.url) s.v.play().catch(function(){}); }
    this.paint(); this.onTime(this.t);
  };
  Player.prototype.syncAudio = function(force){
    var au = this.audio; if(!this.hasVoice) return;
    var vd = this.p.voice && this.p.voice.dur || au.duration || 0;
    if(!this.playing || this.t >= vd - 0.02){ if(!au.paused) au.pause(); return; }
    if(force || Math.abs(au.currentTime - this.t) > 0.3) au.currentTime = this.t;
    if(au.paused) au.play().catch(function(){});
  };
  Player.prototype.play = function(){
    if(!this.p || this.playing) return; var dur = MWStudio.duration(this.p); if(!(dur > 0)) return;
    if(this.t >= dur - 0.02) this.t = 0;
    this.playing = true; this.onState(true); this.seek(this.t);
    var me = this; cancelAnimationFrame(this.raf); this.raf = requestAnimationFrame(function f(){ if(!me.playing) return; me.tick(); me.raf = requestAnimationFrame(f); });
  };
  Player.prototype.pause = function(){
    if(!this.playing) return; this.playing = false; cancelAnimationFrame(this.raf);
    this.slots.forEach(function(s){ s.v.pause(); }); this.audio.pause(); this.onState(false); this.paint();
  };
  Player.prototype.toggle = function(){ if(this.playing) this.pause(); else this.play(); };
  Player.prototype.tick = function(){
    var p = this.p, now = performance.now(), au = this.audio, dur = MWStudio.duration(p);
    var t = this.base.t + (now - this.base.now) / 1000;
    if(this.hasVoice && !au.paused && !au.seeking && au.readyState >= 3){ t = au.currentTime; this.base = { t:t, now:now }; } /* เสียงเป็นนาฬิกาหลัก ภาพไม่หลุดจากเสียง */
    if(t >= dur){ this.t = dur; this.pause(); this.onTime(dur); return; }
    this.t = t; this.syncAudio(false);
    var at = MWStudio.clipAt(p, t), s = this.slots[this.a], o = this.slots[1 - this.a];
    if(at.i >= 0 && s.idx !== at.i){ /* ข้ามไปคลิปถัดไป: ใช้ตัวที่เตรียมไว้ แล้วให้อีกตัวเตรียมคลิปต่อไป */
      s.v.pause();
      if(o.idx === at.i){ this.a = 1 - this.a; s = o; o = this.slots[1 - this.a]; if(Math.abs(s.v.currentTime - (p.clips[at.i].from + at.off)) > 0.1) s.v.currentTime = p.clips[at.i].from + at.off; }
      else this.load(s, at.i, at.off);
      if(at.i + 1 < p.clips.length) this.load(o, at.i + 1, 0);
    }
    if(at.i >= 0 && s.url){
      var want = p.clips[at.i].from + at.off;
      if(!s.v.seeking && s.v.readyState >= 1 && !s.v.ended && Math.abs(s.v.currentTime - want) > 0.35) s.v.currentTime = want; /* ภาพช้า/เร็วกว่าเวลาไทม์ไลน์มาก = กระโดดไปให้ตรง */
      if(s.v.paused && !s.v.ended) s.v.play().catch(function(){});
    }
    this.paint(); this.onTime(t);
  };

  window.MWStudioPlayer = { Player:Player, draw:draw, size:size };
})();
