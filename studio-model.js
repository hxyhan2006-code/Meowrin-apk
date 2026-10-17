/* studio-model.js (window.MWStudio) — "ไฟล์โปรเจกต์" ของสตูดิโอตัดต่อ (studio.html) ที่เดียว
   ทุกการแก้ (Han กดเอง หรือ AI สั่งในรอบหลัง) ผ่านฟังก์ชันในไฟล์นี้ → เลิกทำ/ทำซ้ำได้หมด · ไม่แตะ DOM (หน้าฟุตเทจโหลดไว้ใช้ fromPlan ด้วย)
   เก็บใน MWStore key mw_studio_v1 { cur: โปรเจกต์ที่เปิดอยู่ }
   โปรเจกต์ = { v:1, id, name, at, ratio:"9:16", bg:"blur"|"black", voice:{ id, name, dur }|null,
     clips:[{ id, uri, name, size, from, len, max, thumb, t }]  แถวภาพ ต่อกันเรียงตามลำดับ (uri ว่าง = จอดำ) from = วินาทีในคลิปต้นทาง, len = ยาวบนไทม์ไลน์, max = ความยาวคลิปต้นทาง (0 = ไม่รู้ ยืดได้ไม่จำกัด)
     texts:[{ at, len, t }] }  ข้อความของแต่ละช็อต (รอบนี้ใช้ดูอย่างเดียว) */
(function(){
  "use strict";
  var KEY = "mw_studio_v1", MIN = 0.1, MAXH = 50;
  var RATIOS = { "9:16":[1080, 1920], "1:1":[1080, 1080], "4:5":[1080, 1350], "16:9":[1920, 1080] };
  function uid(){ return Math.random().toString(36).slice(2, 9); }
  function r2(x){ return Math.round(x * 1000) / 1000; }

  function blank(name){ return { v:1, id:uid(), name:name || "โปรเจกต์ใหม่", at:Date.now(), ratio:"9:16", bg:"blur", voice:null, clips:[], texts:[] }; }
  function clipsLen(p){ return p.clips.reduce(function(a, c){ return a + c.len; }, 0); }
  function duration(p){ return Math.max(clipsLen(p), p.voice ? p.voice.dur || 0 : 0); }
  function starts(p){ var t = 0; return p.clips.map(function(c){ var s = t; t += c.len; return s; }); }
  function clipAt(p, t){ /* { i, start, off } ของคลิปที่เวลา t · เลยท้ายแถวภาพ = i:-1 */
    var s = 0;
    for(var i = 0; i < p.clips.length; i++){ var c = p.clips[i]; if(t < s + c.len || i === p.clips.length - 1 && t <= s + c.len) return { i:i, start:s, off:Math.max(0, t - s) }; s += c.len; }
    return { i:-1, start:s, off:0 };
  }

  /* ---------- จากผลผู้กำกับ (footage-plan.js) ----------
     list = picked() [{ c, sc, from, to, at, t }] (c ว่าง = ช็อตค้างภาพ) · uriOf(c) = ที่อยู่ไฟล์ในมือถือ หรือ null
     มีเสียงพากย์: ช็อตยาวถึงช็อตถัดไป (ช็อตสุดท้ายยาวถึงท้ายเสียง) ช็อตค้างภาพรวมเข้าช็อตก่อนหน้า (เล่นต่อไป) · ไม่มีเสียง: ยาว to-from ต่อกัน */
  function fromPlan(list, opt){
    opt = opt || {}; var p = blank(opt.name); if(RATIOS[opt.ratio]) p.ratio = opt.ratio; var voice = opt.voice || null, uriOf = opt.uriOf || function(){ return null; };
    p.voice = voice ? { id:voice.id, name:voice.name || "", dur:voice.dur || 0 } : null;
    list.forEach(function(x, k){
      var len = voice ? (k + 1 < list.length ? list[k + 1].at : voice.dur) - x.at : x.to - x.from;
      if(!(len > 0)) len = Math.max(MIN, (x.to - x.from) || 1);
      var prev = p.clips[p.clips.length - 1];
      if(!x.c && voice && prev){ prev.len = r2(prev.len + len); }
      else p.clips.push({ id:uid(), uri:x.c ? uriOf(x.c) : null, name:x.c ? x.c.name : "", size:x.c ? x.c.size : 0, from:r2(x.from || 0), len:r2(len), max:x.c && x.c.duration || 0, thumb:x.sc && x.sc.thumb || "", t:x.t || "" });
      var lt = p.texts[p.texts.length - 1]; if(x.j && lt){ lt.len = r2(lt.len + len); return; } /* ภาพที่ 2+ ของช็อตที่ถูกแบ่ง = ข้อความเดียวกัน ยืดต่อ */
      p.texts.push({ at:r2(voice ? x.at : (p.texts.length ? p.texts[p.texts.length - 1].at + p.texts[p.texts.length - 1].len : 0)), len:r2(len), t:x.t || "" });
    });
    return p;
  }

  /* ---------- เก็บ / เปิด ---------- */
  function load(){ var s = MWStore.get(KEY, {}) || {}; return s.cur && Array.isArray(s.cur.clips) ? s.cur : null; }
  function save(p){ p.at = Date.now(); MWStore.set(KEY, { cur:p }); if(window.MWHist) MWHist.add("studio", { key:p.id, title:p.name, data:p }); } /* ประวัติงานเก็บทุกโปรเจกต์ (ล่าสุด N อัน) */

  /* ---------- ตัวแก้ + เลิกทำ/ทำซ้ำ (เก็บภาพรวมของโปรเจกต์ก่อนแก้ทุกครั้ง) ---------- */
  function Editor(p, onChange){
    this.p = p; this.undoS = []; this.redoS = []; this.onChange = onChange || function(){};
  }
  Editor.prototype.snap = function(){ this.undoS.push(JSON.stringify(this.p)); if(this.undoS.length > MAXH) this.undoS.shift(); this.redoS = []; };
  Editor.prototype.done = function(){ save(this.p); this.onChange(this.p); return true; };
  Editor.prototype.canUndo = function(){ return this.undoS.length > 0; };
  Editor.prototype.canRedo = function(){ return this.redoS.length > 0; };
  Editor.prototype.undo = function(){ if(!this.undoS.length) return false; this.redoS.push(JSON.stringify(this.p)); this.p = JSON.parse(this.undoS.pop()); return this.done(); };
  Editor.prototype.redo = function(){ if(!this.redoS.length) return false; this.undoS.push(JSON.stringify(this.p)); this.p = JSON.parse(this.redoS.pop()); return this.done(); };
  Editor.prototype.split = function(t){ /* แบ่งคลิปที่เวลา t บนไทม์ไลน์ · ใกล้ขอบเกินไป = ไม่แบ่ง (คืน false) */
    var a = clipAt(this.p, t); if(a.i < 0) return false; var c = this.p.clips[a.i];
    if(a.off < MIN || c.len - a.off < MIN) return false;
    this.snap();
    var b = JSON.parse(JSON.stringify(c)); b.id = uid(); b.from = r2(c.from + a.off); b.len = r2(c.len - a.off); c.len = r2(a.off);
    this.p.clips.splice(a.i + 1, 0, b); return this.done();
  };
  function trimTo(c, side, d){ /* ผลของการลากขอบ: side "start" = ลากขอบซ้าย (ตัดหัวคลิป เล่นช่วงท้ายเหมือนเดิม) "end" = ลากขอบขวา (ยืด/หดท้ายคลิป) · d วินาที (+ = ไปทางขวา) · คืน { from, len } ที่ปรับให้อยู่ในช่วงเป็นไปได้ */
    var from = c.from, len = c.len;
    if(side === "end"){ len += d; if(c.max > 0) len = Math.min(len, c.max - c.from); }
    else { d = Math.min(Math.max(d, -from), len - MIN); from += d; len -= d; }
    return { from:r2(Math.max(0, from)), len:r2(Math.max(MIN, len)) };
  }
  Editor.prototype.trim = function(i, side, d){ var c = this.p.clips[i]; if(!c) return false; var r = trimTo(c, side, d); if(r.from === c.from && r.len === c.len) return false; this.snap(); c.from = r.from; c.len = r.len; return this.done(); };
  Editor.prototype.move = function(i, dir){ /* dir -1 = ไปทางซ้าย (เร็วขึ้น) · +1 = ไปทางขวา */
    var j = i + dir, a = this.p.clips; if(i < 0 || i >= a.length || j < 0 || j >= a.length) return false;
    this.snap(); var t = a[i]; a[i] = a[j]; a[j] = t; return this.done();
  };
  Editor.prototype.duplicate = function(i){ var c = this.p.clips[i]; if(!c) return false; this.snap(); var b = JSON.parse(JSON.stringify(c)); b.id = uid(); this.p.clips.splice(i + 1, 0, b); return this.done(); };
  Editor.prototype.remove = function(i){ if(i < 0 || i >= this.p.clips.length) return false; this.snap(); this.p.clips.splice(i, 1); return this.done(); };

  window.MWStudio = { KEY:KEY, RATIOS:RATIOS, blank:blank, duration:duration, clipsLen:clipsLen, starts:starts, clipAt:clipAt, trimTo:trimTo, MIN:MIN, fromPlan:fromPlan, load:load, save:save, Editor:Editor };
})();
