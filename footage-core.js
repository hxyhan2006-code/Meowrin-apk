/* footage-core.js — ส่วนไม่มีหน้าจอของหน้า "ดัชนีฟุตเทจ" (ทดสอบ)
   ตั้งค่า (MWStore mw_footage_cfg_v1) · ฐานข้อมูล (IndexedDB mw_footage_v1) · อ่านเฟรม/ตัดฉากจาก <video> · เรียก AI ดูรูปผ่าน OpenRouter
   ใช้ OpenRouter key ตัวเดียวกับแอพหลัก (mw_openrouter_key_v1) · ส่งออก window.FT */
(function(){
  "use strict";
  function load(k, d){ return MWStore.get(k, d); } /* store.js: IndexedDB + แคช */
  function save(k, v){ return MWStore.set(k, v); }
  var sleep = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };

  /* ---------- ตั้งค่า ---------- */
  var CFG = "mw_footage_cfg_v1";
  var cfg = Object.assign({ model:"google/gemini-3.8-flash", thr:0.18, maxScenes:30, budget:1, par:2, clipPar:2, aiQuery:false, aiRank:false, godModel:"", godNew:false, fine:false }, load(CFG, {}));
  function saveCfg(){ return save(CFG, cfg); }
  function orKey(){ return load("mw_openrouter_key_v1", ""); }

  /* ---------- IndexedDB: store "clips" (1 รายการต่อคลิป เก็บฉากไว้ในตัว) ----------
     { id, name, album, size, type, lastModified, duration, w, h, cover, summary_th, scenes:[{s,e,thumb,img,ai}],
       raw:[คำตอบดิบ AI], cost, tokens:{in,out}, ms, model, at, status:"done"|"error", err } */
  var dbp = null;
  function db(){
    if(dbp) return dbp;
    dbp = new Promise(function(res, rej){
      var r = indexedDB.open("mw_footage_v1", 1);
      r.onupgradeneeded = function(){ r.result.createObjectStore("clips", { keyPath:"id" }); };
      r.onsuccess = function(){ res(r.result); };
      r.onerror = function(){ rej(r.error || new Error("เปิดฐานข้อมูลไม่ได้")); };
    });
    return dbp;
  }
  function tx(mode, fn){
    return db().then(function(d){ return new Promise(function(res, rej){
      var t = d.transaction("clips", mode), st = t.objectStore("clips"), out = fn(st);
      t.oncomplete = function(){ res(out && "result" in out ? out.result : undefined); };
      t.onerror = t.onabort = function(){ rej(t.error || new Error("บันทึกไม่ได้ (พื้นที่เต็ม?)")); };
    }); });
  }
  var store = {
    all: function(){ return tx("readonly", function(s){ return s.getAll(); }); },
    put: function(c){ return tx("readwrite", function(s){ s.put(c); }); },
    putMany: function(arr){ return tx("readwrite", function(s){ arr.forEach(function(c){ s.put(c); }); }); },
    del: function(ids){ return tx("readwrite", function(s){ ids.forEach(function(id){ s.delete(id); }); }); },
    clear: function(){ return tx("readwrite", function(s){ s.clear(); }); }
  };
  function clipId(f){ return f.name + "|" + f.size + "|" + f.lastModified; }

  /* ---------- อ่านวิดีโอ ---------- */
  function once(v, ok, ms, what){
    return new Promise(function(res, rej){
      var to = setTimeout(function(){ clean(); rej(new Error(what + " ช้าเกินไป")); }, ms);
      function done(){ clean(); res(); }
      function fail(){ clean(); rej(new Error("เบราว์เซอร์เปิดวิดีโอนี้ไม่ได้ (รูปแบบไฟล์ไม่รองรับ?)")); }
      function clean(){ clearTimeout(to); v.removeEventListener(ok, done); v.removeEventListener("error", fail); }
      v.addEventListener(ok, done); v.addEventListener("error", fail);
    });
  }
  function seek(v, t){ var p = once(v, "seeked", 10000, "เลื่อนวิดีโอ"); v.currentTime = t; return p; }
  async function openVideo(v, file){ /* file = File ในเครื่อง หรือ string = ลิงก์สตรีมจากคลัง (อ่านเฉพาะช่วงที่ seek ไม่โหลดทั้งไฟล์) */
    if(v.src && v.src.indexOf("blob:") === 0) URL.revokeObjectURL(v.src);
    var p = once(v, "loadeddata", 30000, "เปิดวิดีโอ");
    v.crossOrigin = "anonymous"; /* ลิงก์ไฟล์ในแอพ (https://localhost/_capacitor_file_/...) : ให้วาดลง canvas ได้ */
    v.src = typeof file === "string" ? file : URL.createObjectURL(file); v.load(); await p;
    if(!isFinite(v.duration)){ await seek(v, 1e7); await seek(v, 0.05); } /* บางไฟล์ไม่บอกความยาว ต้องเลื่อนไปท้ายก่อน */
    if(!(v.duration > 0) || !v.videoWidth) throw new Error("อ่านความยาว/ขนาดวิดีโอไม่ได้");
  }
  var cv = document.createElement("canvas"), cx = cv.getContext("2d", { willReadFrequently:true });
  function grab(v, w){ /* วาดเฟรมปัจจุบันลง canvas กว้าง w (สูงตามสัดส่วน) */
    cv.width = w; cv.height = Math.max(1, Math.round(w * v.videoHeight / v.videoWidth));
    cx.drawImage(v, 0, 0, cv.width, cv.height);
  }
  function jpeg(v, w, q){ grab(v, w); return cv.toDataURL("image/jpeg", q); }
  function gray(v){ grab(v, 64); var d = cx.getImageData(0, 0, cv.width, cv.height).data, g = new Uint8Array(d.length / 4);
    for(var i = 0, j = 0; i < d.length; i += 4, j++) g[j] = (d[i] * 3 + d[i+1] * 6 + d[i+2]) / 10; return g; }
  /* ภาพให้ AI ดู: เฟรมต้น/กลาง/ท้ายของฉาก (1-3 เฟรมตามความยาว) วางเรียงซ้าย→ขวาในรูปเดียว (ประหยัดกว่าส่งหลายรูป) */
  var cv2 = document.createElement("canvas"), cx2 = cv2.getContext("2d"), FW = 320;
  function frameTimes(sc, dur){ var len = sc.e - sc.s, n = len < 1.5 ? 1 : len < 4 ? 2 : 3, out = [];
    for(var i = 0; i < n; i++) out.push(Math.max(0.05, Math.min(dur - 0.05, sc.s + len * (i + 0.5) / n))); return out; }
  async function strip(v, sc){
    var ts = frameTimes(sc, v.duration), h = Math.max(1, Math.round(FW * v.videoHeight / v.videoWidth));
    cv2.width = FW * ts.length + 6 * (ts.length - 1); cv2.height = h; cx2.fillStyle = "#fff"; cx2.fillRect(0, 0, cv2.width, h); /* เส้นขาวคั่นเฟรม */
    for(var i = 0; i < ts.length; i++){ await seek(v, ts[i]); cx2.drawImage(v, i * (FW + 6), 0, FW, h); }
    return { img:cv2.toDataURL("image/jpeg", 0.72), n:ts.length };
  }
  /* โหมดขั้นเทพ: ส่งเฟรมแยกรูป 3-5 เฟรมต่อฉาก (กว้าง 448) ให้ AI ดูละเอียดทุกช่วงของฉาก */
  var GOD_W = 448, cv3 = document.createElement("canvas"), cx3 = cv3.getContext("2d");
  function godN(sc){ var len = sc.e - sc.s; return len < 1 ? 2 : len < 3 ? 3 : len < 6 ? 4 : 5; }
  async function godFrames(v, sc){
    var n = godN(sc), len = sc.e - sc.s, h = Math.max(1, Math.round(GOD_W * v.videoHeight / v.videoWidth)), out = []; cv3.width = GOD_W; cv3.height = h;
    for(var i = 0; i < n; i++){ await seek(v, Math.max(0.05, Math.min(v.duration - 0.05, sc.s + len * (i + 0.5) / n))); cx3.drawImage(v, 0, 0, GOD_W, h); out.push(cv3.toDataURL("image/jpeg", 0.78)); }
    return out;
  }
  function diff(a, b){ var s = 0; for(var i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length / 255; }

  /* สุ่มเฟรมทุก 1 วิ → หาจุดตัดฉาก → รวมฉากสั้น/ฉากเกินเพดาน → จับเฟรมกลางฉาก
     คืน { duration, w, h, cover, scenes:[{s,e,thumb,img,aiImg,nf}] } (aiImg = รูปเรียงเฟรมให้ AI ดู ไม่เก็บลงฐานข้อมูล) */
  var STEP = 1, MIN_SCENE = 1; /* cfg.fine = เฟรมทุก 0.5 วิ + ฉากสั้นสุด 0.5 วิ (คลิปตัดไว) · ช้าลงราว 2 เท่า */
  var IMG = { cover:240, thumb:240, big:480, v:2 }; /* ขนาดรูปที่เก็บ (px กว้าง) · v = รุ่นของรูป (รุ่น 1 เล็กกว่า เบลอบนจอมือถือ) */
  var AI_V = 2, AI_GOD = 3; /* 3 = ขั้นเทพ: เฟรมแยก 2-5 รูปต่อฉาก + รายชื่อตัวละครพร้อมลักษณะเด่นในคำสั่งหลัก + โมเดลที่ตั้งไว้ (godModel) + ป้ายคุณภาพ/หลายช็อตปน/เฟรมต่อเฟรม */ /* รุ่นของดัชนี: 1 = AI ดู 1 เฟรม/ฉาก · 2 = ดูเฟรมต้น/กลาง/ท้าย + ป้ายระยะภาพ/ความแรง/อารมณ์/เหตุการณ์/ปัญหาภาพ */
  async function scan(v, file, onStep){
    await openVideo(v, file);
    var dur = v.duration, ts = [], step = cfg.fine ? 0.5 : STEP, minScene = cfg.fine ? 0.5 : MIN_SCENE;
    for(var t = 0.05; t < dur - 0.05; t += step) ts.push(t);
    if(!ts.length) ts.push(Math.min(0.05, dur / 2));
    await seek(v, ts[0]);
    var cover = jpeg(v, IMG.cover, 0.75), gs = [gray(v)], scenes = [{ s:0, score:1, idx:0 }];
    for(var i = 1; i < ts.length; i++){
      await seek(v, ts[i]); gs[i] = gray(v);
      var d = diff(gs[i-1], gs[i]);
      if(d > cfg.thr) scenes.push({ s:(ts[i-1] + ts[i]) / 2, score:d, idx:i });
      if(onStep) onStep(i / ts.length * 0.6);
    }
    scenes.forEach(function(sc, k){ sc.e = k + 1 < scenes.length ? scenes[k+1].s : dur; });
    function mergeAt(k){ scenes[k-1].e = scenes[k].e; scenes.splice(k, 1); } /* รวมฉาก k เข้าฉากก่อนหน้า */
    for(var k = scenes.length - 1; k >= 0 && scenes.length > 1; k--){
      if(scenes[k].e - scenes[k].s < minScene) mergeAt(k > 0 ? k : 1);
    }
    while(scenes.length > cfg.maxScenes){ /* เกินเพดาน → รวมจุดตัดที่ต่างกันน้อยที่สุด */
      var m = 1; for(k = 2; k < scenes.length; k++) if(scenes[k].score < scenes[m].score) m = k;
      mergeAt(m);
    }
    /* จุดตัดที่เหลือ: แบ่งครึ่งช่วง 1 วิ อีก 3 รอบ ให้แม่น ~0.06 วิ (ไว้ตัดใน CapCut ตรงจุด) */
    for(k = 1; k < scenes.length; k++){
      var j = scenes[k].idx, lo = ts[j-1], hi = ts[j], gl = gs[j-1], gh = gs[j];
      for(var n = 0; n < 3; n++){
        var md = (lo + hi) / 2; await seek(v, md); var gm = gray(v);
        if(diff(gl, gm) > diff(gm, gh)){ hi = md; gh = gm; } else { lo = md; gl = gm; }
      }
      scenes[k].s = scenes[k-1].e = (lo + hi) / 2;
      if(onStep) onStep(0.6 + k / scenes.length * 0.1);
    }
    for(k = 0; k < scenes.length; k++){
      var sc = scenes[k], mid = Math.min(dur - 0.05, (sc.s + sc.e) / 2);
      await seek(v, Math.max(0.05, mid));
      sc.img = jpeg(v, IMG.big, 0.78); sc.thumb = jpeg(v, IMG.thumb, 0.75); delete sc.score; delete sc.idx;
      if(cfg.godNew){ sc.aiFrames = await godFrames(v, sc); sc.nf = sc.aiFrames.length; } else { var st = await strip(v, sc); sc.aiImg = st.img; sc.nf = st.n; }
      if(onStep) onStep(0.7 + (k + 1) / scenes.length * 0.3);
    }
    return { duration:dur, w:v.videoWidth, h:v.videoHeight, cover:cover, scenes:scenes };
  }

  /* วาดรูปใหม่ให้คมขึ้นตามช่วงฉากเดิมที่เก็บไว้ (ไม่เรียก AI ไม่เสียค่า) คืน { cover, imgs:[{img,thumb}] } */
  async function refreshImages(v, file, rec, onStep){
    await openVideo(v, file);
    await seek(v, Math.min(0.05, v.duration / 2));
    var cover = jpeg(v, IMG.cover, 0.75), imgs = [];
    for(var k = 0; k < rec.scenes.length; k++){
      var sc = rec.scenes[k]; await seek(v, Math.max(0.05, Math.min(v.duration - 0.05, (sc.s + sc.e) / 2)));
      imgs.push({ img:jpeg(v, IMG.big, 0.78), thumb:jpeg(v, IMG.thumb, 0.75) });
      if(onStep) onStep((k + 1) / rec.scenes.length);
    }
    return { cover:cover, imgs:imgs };
  }

  /* อัปเกรดคลิปที่ทำดัชนีไว้แล้วเป็นรุ่นละเอียด: ใช้ช่วงฉากเดิม แค่จับเฟรมใหม่ให้ AI ดู · src = File หรือลิงก์คลัง → [{ aiImg, nf }] ต่อฉาก */
  async function deepFrames(v, src, rec, onStep, god){ /* god = ขั้นเทพ: คืน { frames:[...], n } ต่อฉาก · ปกติ { img, n } (strip) */
    await openVideo(v, src); var out = [];
    for(var k = 0; k < rec.scenes.length; k++){ if(god){ var fr = await godFrames(v, rec.scenes[k]); out.push({ frames:fr, n:fr.length }); } else out.push(await strip(v, rec.scenes[k])); if(onStep) onStep((k + 1) / rec.scenes.length); }
    return out;
  }

  /* ---------- OpenRouter ---------- */
  var URL_OR = "https://openrouter.ai/api/v1/chat/completions";
  async function post(body){
    var key = orKey(); if(!key) throw new Error("ยังไม่ได้ใส่ OpenRouter key ในแอพหลัก (ตั้งค่า → OpenRouter API key) บนเบราว์เซอร์นี้");
    MWBudget.check(); /* เพดานค่า AI รวมทั้งสองหน้า (budget.js) · เกิน = โยน error ที่มี budget:true → คิวทำดัชนีพักเอง */
    var res, j;
    for(var a = 0; ; a++){
      res = await fetch(URL_OR, { method:"POST", headers:{ "Content-Type":"application/json", "Authorization":"Bearer " + key }, body: JSON.stringify(body) });
      j = await res.json().catch(function(){ return {}; });
      if((res.status === 502 || res.status === 503) && a < 1){ await sleep(2500); continue; }
      if(res.status === 429 && a < 3){ await sleep(3000 * (a + 1)); continue; } /* ส่งถี่เกิน (ทำหลายคลิปพร้อมกัน) = รอแล้วลองใหม่เอง ครั้งที่ 4 ค่อยแจ้ง error */
      break;
    }
    var er = j.error || (j.choices && j.choices[0] && j.choices[0].error);
    if(!res.ok || er){
      var st = (er && typeof er.code === "number") ? er.code : res.status, m = (er && er.message) || "";
      if(st === 400 && body.reasoning && /reasoning|thinking/i.test(m)){ delete body.reasoning; return post(body); }
      if(st === 401) throw new Error("OpenRouter key ใช้ไม่ได้");
      if(st === 402) throw new Error("เครดิต OpenRouter ไม่พอ");
      if(st === 429) throw new Error("ส่งถี่เกิน/โควตาเต็ม ลองใหม่อีกสักพัก");
      throw new Error("OpenRouter error " + st + (m ? ": " + m.slice(0, 160) : ""));
    }
    var t = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    if(typeof t !== "string" || !t.trim()) throw new Error("AI ไม่ตอบ");
    var u = j.usage || {};
    MWBudget.add(typeof u.cost === "number" ? u.cost : 0);
    return { text:t, cost: typeof u.cost === "number" ? u.cost : 0, tin:u.prompt_tokens || 0, tout:u.completion_tokens || 0 };
  }
  function parseJSON(t){
    var s = t.replace(/```(?:json)?/gi, ""), a = s.indexOf("{"), b = s.lastIndexOf("}");
    if(a < 0 || b <= a) throw new Error("AI ไม่ได้ตอบเป็น JSON");
    return JSON.parse(s.slice(a, b + 1));
  }
  var PROMPT = [
    "You are indexing anime footage clips (mostly One Piece, Thai dub) for a video editor's search tool and an AI director that picks shots for narration.",
    "Album label set loosely by the user (often WRONG: a Luffy scene may sit in a Zoro album, and scenes mix many characters): \"{album}\". Identify characters ONLY from what you see; use the label just to break ties. Clip length: {dur}s.",
    "Below are {n} scenes in order. Each scene is ONE image showing 1-3 frames side by side (left = start, middle, right = end of the scene, separated by white lines). Describe what happens across the frames, not just one frame. Each image is preceded by its scene number.",
    "Return ONLY JSON, no markdown:",
    "{\"clip_summary_th\":\"one short Thai sentence about what happens in these scenes\",",
    " \"scenes\":[{\"i\":<scene number>,\"characters\":[\"English common names e.g. Luffy, Zoro, Nami, Usopp, Sanji, Chopper, Robin, Franky, Brook, Jinbe, Ace, Sabo, Shanks, Garp, Buggy, Hancock, Law\"],",
    " \"characters_th\":[\"same characters in Thai as Thai fans write, e.g. ลูฟี่, โซโร, นามิ, อุซป, ซันจิ, ช็อปเปอร์, โรบิน, แฟรงกี้, บรู๊ค, จินเบ, เอส, ซาโบ้, แชงคูส, การ์ป\"],",
    " \"action\":\"short English\",\"emotion\":\"short English (the main character's)\",\"location\":\"short English\",",
    " \"shot\":\"close|medium|wide (framing of the main subject)\",\"intensity\":<1 calm .. 5 explosive action>,\"motion\":\"still|slow|fast\",\"mood\":\"one English word e.g. funny, tense, sad, heroic, scary, warm\",",
    " \"arc\":\"One Piece arc name if you recognize it, else empty\",\"event\":\"short English name of the canon moment if you recognize it (e.g. Luffy punches Arlong), else empty\",",
    " \"issues\":[\"only those present: watermark, subtitles, blurry, text, black, screen (screen-recording artifacts: video-player play button/progress bar/timestamp, browser or phone UI, app borders, phone status bar)\"],",
    " \"tags_en\":[\"3-8 lowercase tags\"],\"tags_th\":[\"3-8 Thai tags e.g. ตกใจ, หัวเราะ, ต่อสู้, ร้องไห้, กิน\"],\"summary_th\":\"one short Thai sentence saying WHO does or feels WHAT (and how it changes from start to end if it does), starting with that character's Thai name, e.g. ลูฟี่ตกใจแล้วหัวเราะ (do not bury the subject: if a marine is shocked by Luffy, say ทหารเรือตกใจ, not ลูฟี่ตกใจ)\"}]}",
    "Rules: name a character only when reasonably sure, otherwise describe them in tags (e.g. marine soldier). Never guess arc/event: leave empty if unsure.",
    "List every notable visible character. One entry per scene number."
  ].join("\n");
  /* ส่งหลายฉากในคำขอเดียว (ประหยัดกว่า และ AI เห็นบริบทต่อเนื่องของคลิป) */
  function godPrompt(album, dur, n){
    return [
      "You are the best possible frame-by-frame analyst of One Piece anime footage (mostly Thai dub) for an AI film director and a video editor's search tool. Be exhaustive and precise.",
      "Album label set loosely by the user (often WRONG): \"" + (album || "-") + "\". Clip length: " + dur.toFixed(1) + "s. Identify characters ONLY from what you see.",
      "Known roster with distinguishing looks (use these names exactly when you recognize them; other characters: use their English name if you are sure, else describe them in tags):\n" + ROSTER.map(function(r){ return r[0] + ": " + r[1]; }).join("\n"),
      "Below are " + n + " scenes. Each scene gives several frames in order (start→end of the scene), each labelled. Look at EVERY frame of every scene: a character may appear only in some frames, in the background, or small. List all of them.",
      "Return ONLY JSON: {\"clip_summary_th\":\"one short Thai sentence\",\"scenes\":[{\"i\":<scene number>,",
      " \"characters\":[\"English names of EVERY recognizable character in any frame\"],\"characters_th\":[\"same in Thai as Thai fans write\"],",
      " \"frames\":[{\"c\":[\"characters visible in this frame\"],\"d\":\"≤8 English words: what is shown\"}] (one entry per frame, same order),",
      " \"action\":\"short English\",\"emotion\":\"main character's emotion, short English\",\"location\":\"short English\",",
      " \"shot\":\"close|medium|wide\",\"intensity\":<1 calm..5 explosive>,\"motion\":\"still|slow|fast\",\"mood\":\"one English word\",",
      " \"arc\":\"arc name if sure else empty\",\"event\":\"canon moment if sure else empty\",",
      " \"usable\":<1 unusable..5 perfect for editing: sharp, clean, well framed>,\"multi\":<true if frames show clearly different shots/cuts inside this scene>,",
      " \"issues\":[\"watermark|subtitles|blurry|text|black|screen (video-player UI / screen-recording artifacts: play button, progress bar, phone or browser UI)\"],\"objects\":[\"key props/vehicles: sword, ship, hat...\"],\"text\":\"readable on-screen text or empty\",",
      " \"tags_en\":[\"3-8 lowercase tags\"],\"tags_th\":[\"3-8 Thai tags\"],\"summary_th\":\"one short Thai sentence: WHO does or feels WHAT, and how it changes from start to end; start with the character's Thai name\"}]}",
      "Never guess arc/event: leave empty if unsure. One entry per scene number."
    ].join("\n");
  }
  async function describe(chunk, album, dur){
    if(chunk.length && chunk[0].aiFrames) return describeGod(chunk, album, dur);
    var content = [{ type:"text", text: PROMPT.replace("{album}", album || "-").replace("{dur}", dur.toFixed(1)).replace("{n}", chunk.length) }];
    chunk.forEach(function(sc){
      content.push({ type:"text", text:"Scene " + sc.n + " (" + sc.s.toFixed(1) + "-" + sc.e.toFixed(1) + "s):" });
      content.push({ type:"image_url", image_url:{ url: sc.aiImg } });
    });
    var body = { model:cfg.model, messages:[{ role:"user", content:content }], usage:{ include:true } };
    if(/^google\//.test(cfg.model)) body.reasoning = { effort:"low" }; /* งานติดป้ายไม่ต้องคิดนาน ประหยัดโทเคน */
    var r = await post(body), j;
    try{ j = parseJSON(r.text); }catch(err){ err.raw = r.text; err.cost = r.cost; throw err; }
    r.json = j; return r;
  }
  /* ---------- ตรวจตัวละครซ้ำ (ใช้รูปที่เก็บไว้ ไม่ต้องเปิดไฟล์วิดีโอ) ----------
     ถามเจาะจงอย่างเดียว: ในรูปมีตัวละครไหนในรายชื่อบ้าง (พร้อมลักษณะเด่นของแต่ละตัว) → ช่วยตัวละครที่ดัชนีแรกมองข้าม/จำไม่ได้ (เช่น แชงคูส) · key ต้องตรงกับ NAMES ใน footage-find.js */
  var ROSTER = [
    ["luffy","straw hat, small scar under left eye, red vest, shorts, rubber body"],["zoro","green hair, three swords, green haramaki, scar on left eye"],["nami","orange hair, female navigator, tattoo on left shoulder"],
    ["usopp","very long nose, curly black hair, bandana/goggles, overalls, slingshot (also Sogeking: mask+cape)"],["sanji","blond hair covering one eye, black suit, cigarette, curly eyebrow"],["chopper","small reindeer doctor, pink hat with X, blue nose"],
    ["robin","black hair, tall woman, archaeologist, often sunglasses or cowboy hat"],["franky","huge blue pompadour, star sunglasses, cyborg, speedo/open shirt"],["brook","skeleton with afro, top hat, suit, cane sword"],["jinbe","large blue fishman, shark features, kimono/karate"],
    ["ace","orange cowboy hat, freckles, shirtless with tattoos, black hair"],["sabo","blond hair, top hat with goggles, blue coat, burn scar on left eye"],["shanks","red hair, three scars over left eye, missing left arm, black cloak, straw hat on his head only in flashbacks"],
    ["garp","old muscular marine vice admiral, gray hair, marine coat, sometimes dog mask, huge fists"],["buggy","clown with big red round nose, blue hair, makeup"],["hancock","very tall woman, long black hair, snake earrings, pirate empress dress"],
    ["law","spotted hat, goatee, tattoos on hands, long sword, yellow hoodie"],["kid","red hair spiked up, goggles, metal arm, heavy makeup"],["yamato","horns, white-blue hair, kimono, female oni"],["kaido","giant man with horns, tattoos, dragon form"],
    ["big mom","giant pink-haired old woman, huge, hat"],["blackbeard","black beard, big belly, missing front teeth, laughing"],["whitebeard","giant old man with white crescent mustache, bandage, naginata"],["vivi","blue hair, princess, Alabasta"],
    ["shirahoshi","giant mermaid princess, pink hair"],["mihawk","hawk eyes, black hat with feather, huge sword, long coat"],["dragon","hooded man with face tattoo, revolutionary"],["koby","pink hair, round glasses, marine uniform"],
    ["smoker","white hair, two cigars, marine coat, jitte"],["crocodile","scar across face, hook hand, long black coat with fur, cigar"],["arlong","blue sawfish fishman with long saw nose, sharp teeth"],["enel","sky island god, long earlobes, drums on back"],
    ["lucci","CP9 agent, pigeon on shoulder, top hat, mask"],["doflamingo","pink feather coat, blond hair, sunglasses, wide grin"],["akainu","marine admiral, red suit, magma"],["aokiji","marine admiral, tall, eye mask, ice"],["kizaru","marine admiral, yellow suit, light"],["rebecca","young woman gladiator with blond hair, Dressrosa"]
  ];
  async function recognize(items){ /* items:[{ n, img }] → map n → [key] */
    var content = [{ type:"text", text:"These are frames from One Piece anime. For EACH numbered image list which of the following characters are clearly visible (face or very distinctive look; a character partly in frame or in the background still counts if recognizable). Use ONLY these keys; skip anyone you are not reasonably sure about.\nRoster (key: look):\n" + ROSTER.map(function(r){ return r[0] + ": " + r[1]; }).join("\n") + "\nReturn ONLY JSON: {\"r\":[{\"i\":<image number>,\"c\":[\"key\",...]}]} with one entry per image (empty list if none)." }];
    items.forEach(function(it){ content.push({ type:"text", text:"Image " + it.n + ":" }); content.push({ type:"image_url", image_url:{ url:it.img } }); });
    var body = { model:cfg.model, usage:{ include:true }, messages:[{ role:"user", content:content }] };
    if(/^google\//.test(cfg.model)) body.reasoning = { effort:"low" };
    var r = await post(body), j;
    try{ j = parseJSON(r.text); }catch(err){ err.cost = r.cost; throw err; }
    var ok = {}; ROSTER.forEach(function(x){ ok[x[0]] = 1; });
    r.map = {}; (Array.isArray(j.r) ? j.r : []).forEach(function(x){ r.map[Number(x.i)] = (Array.isArray(x.c) ? x.c : []).map(function(k){ return String(k).toLowerCase().trim(); }).filter(function(k){ return ok[k]; }); });
    return r;
  }

  async function classifyArcs(items, arcs){ /* items:[{ n, imgs:[รูป ≤3 ฉากต่างกัน], hint }] → r.map: n → ชื่อภาค (ต้องอยู่ใน arcs) หรือ "" = ไม่แน่ใจ · ไม่เดา */
    var content = [{ type:"text", text:"These are frames from One Piece anime clips. For EACH numbered clip (a few frames from different scenes of the same clip), decide which story arc the clip belongs to, choosing ONLY from this list: " + arcs.join(", ") + ". Decide from recognizable characters in their arc-specific looks/outfits, locations, and canon events. If you are not clearly sure, answer an empty string for that clip (do NOT guess; a wrong arc is worse than an empty one). Return ONLY JSON: {\"r\":[{\"i\":1,\"arc\":\"Alabasta\"}]}" }];
    items.forEach(function(it){ content.push({ type:"text", text:"Clip " + it.n + (it.hint ? " (" + it.hint + ")" : "") + ":" }); it.imgs.forEach(function(u){ content.push({ type:"image_url", image_url:{ url:u } }); }); });
    var body = { model:cfg.model, usage:{ include:true }, messages:[{ role:"user", content:content }] };
    if(/^google\//.test(cfg.model)) body.reasoning = { effort:"low" };
    var r = await post(body), j;
    try{ j = parseJSON(r.text); }catch(err){ err.cost = r.cost; throw err; }
    var ok = {}; arcs.forEach(function(a){ ok[a.toLowerCase()] = a; });
    r.map = {}; (Array.isArray(j.r) ? j.r : []).forEach(function(x){ r.map[Number(x.i)] = ok[String(x.arc || "").toLowerCase().trim()] || ""; });
    return r;
  }
  /* ---------- ผู้กำกับ AI ----------
     1) beats: แบ่งบทเป็นช็อตสั้นๆ (fast: วลี ~1.5-2.5 วิ เริ่มช็อตใหม่ตรงคำที่เอ่ยชื่อ) ตามสไตล์ช่อง: เอ่ยชื่อใคร/อะไร ภาพต้องเป็นสิ่งนั้น (ข้อความล้วน)
     2) direct: ส่งรูปผู้สมัครของแต่ละช็อต (ค้นจากดัชนีในเครื่องแล้ว) ให้ AI ดูภาพจริงแล้วเลือก ทีละชุดหลายช็อต (เห็นบทเต็มเพื่อความต่อเนื่อง) */
  var BEATS = {
    long: "Split the Thai narration below into shots, one shot per sentence or natural clause (about 2-8 seconds spoken, roughly 15-80 Thai characters). The editor will cut these shots themselves, so each shot needs one clear footage idea that fits the whole sentence.",
    fast: "House style (square 1:1 Shorts, fast keyword cuts): a new picture every 1.5-2.5 seconds of narration, never longer than 3 seconds. Split the Thai narration below into short phrases of about 12-32 Thai characters. Cut on keywords: whenever the narration names a character, crew, place, object or event, START a new shot exactly at that word, so the picture switches the moment it is said, and that shot shows exactly it (e.g. \"ลูฟี่กำลังโม้ว่า | เอซชนะเอสได้\"). A list of names becomes one shot per name. Fragments shorter than about 8 characters join the neighbouring shot. When a phrase has no named subject, show whoever the sentence is about doing the described action or emotion."
  };
  var BEATS_RULES = [
    "Rules: keep the original words in the original order; every word goes into exactly one shot (no rewriting, no skipping, no adding).",
    "For each shot describe the ideal anime footage for that exact moment (who is on screen, doing what, with what emotion). Prefer recognizable canon One Piece moments. Never output episode numbers. The footage is always a PERSON/CHARACTER moment unless the narration is explicitly about a place or object.",
    "Return ONLY JSON: {\"shots\":[{\"t\":\"exact Thai text of this shot\",\"want\":\"Thai: who + action + emotion (+ place)\",\"chars\":[\"English names that must be on screen\"],\"keys\":[\"4-8 short Thai keywords incl. synonyms: emotion, action, place, who\"],\"shot\":\"close|medium|wide|any\"}]}",
    "Narration:"
  ].join("\n");
  async function beats(script, mode){ /* mode: long = ช็อตละประโยค (แบบตัดเอง) · fast = สับไว 1-3 วิ (แบบ AI ตัดให้) */
    var head = "You are the director of a Thai One Piece YouTube Shorts channel.\n" + (BEATS[mode] || BEATS.long) + "\n" + BEATS_RULES;
    var body = { model:cfg.model, usage:{ include:true }, messages:[{ role:"user", content:head + "\n" + script }] };
    if(/^google\//.test(cfg.model)) body.reasoning = { effort:"low" };
    var r = await post(body), j;
    try{ j = parseJSON(r.text); }catch(err){ err.cost = r.cost; throw err; }
    var str = function(x){ return Array.isArray(x) ? x.map(String).filter(Boolean).slice(0, 8) : []; };
    r.shots = (Array.isArray(j.shots) ? j.shots : []).map(function(x){ return { t:String(x.t || "").trim(), want:String(x.want || ""), chars:str(x.chars), keys:str(x.keys), shot:String(x.shot || "any") }; }).filter(function(x){ return x.t; });
    return r;
  }
  var DIRECT = [
    "You are a strict film editor picking anime footage for a Thai One Piece YouTube Short (fast, pleasant cuts; the picture must match what the narration says at that moment).",
    "Full narration for context: \"{script}\"",
    "For each shot below you get its narration, the wanted footage, and lettered candidate frames from the editor's own library (each with an automatic description that can be imperfect; trust the image).",
    "Choose the best candidate per shot: 1) the right character(s) clearly on screen, 2) matching emotion/action, 3) a clear, striking frame. Do not pick the same frame as the previous shot; vary close-ups and wide shots across the sequence. NEVER pick empty scenery, objects, backs of heads, or frames where the required character is cut off or tiny. NEVER pick a frame that shows video-player or screen-recording UI (play button, red/white progress bar, timestamps, phone/browser bars, app borders) even if the content fits. If NO candidate truly shows what the shot needs, set best to \"none\" (do not force a bad match).",
    "Also give fx = horizontal position of the main subject (face/body) inside the chosen frame, 0 = left edge, 0.5 = center, 1 = right edge (it is used to crop to a square).",
    "Return ONLY JSON: {\"picks\":[{\"s\":<shot number>,\"best\":\"<candidate id e.g. 3b or none>\",\"fx\":0.5,\"alts\":[\"<id>\",\"<id>\"],\"why\":\"short Thai reason\"}]}"
  ].join("\n");
  /* items:[{ n, t, want, chars, cands:[{ id, who, sum, img }] }] → picks:[{ s, best, alts, why }] */
  async function direct(script, items, prev){
    var content = [{ type:"text", text:DIRECT.replace("{script}", script.replace(/\s+/g, " ").slice(0, 2500)) + (prev ? "\nPrevious shot used: " + prev : "") }];
    items.forEach(function(it){
      content.push({ type:"text", text:"\nShot " + it.n + ": \"" + it.t + "\" | want: " + it.want + (it.chars.length ? " | must show: " + it.chars.join(", ") : "") });
      it.cands.forEach(function(cd){
        content.push({ type:"text", text:cd.id + " — " + cd.who + " · " + cd.sum });
        content.push({ type:"image_url", image_url:{ url:cd.img } });
      });
    });
    var body = { model:cfg.model, usage:{ include:true }, messages:[{ role:"user", content:content }] };
    if(/^google\//.test(cfg.model)) body.reasoning = { effort:"low" };
    var r = await post(body), j;
    try{ j = parseJSON(r.text); }catch(err){ err.cost = r.cost; throw err; }
    r.picks = (Array.isArray(j.picks) ? j.picks : []).map(function(p){ return { s:Number(p.s), fx:isFinite(parseFloat(p.fx)) ? Math.max(0, Math.min(1, parseFloat(p.fx))) : null, best:String(p.best || ""), alts:Array.isArray(p.alts) ? p.alts.map(String) : [], why:String(p.why || "") }; });
    return r;
  }

  /* ---------- ถาม AI หาฟุต (footage-ask.js) · ข้อความล้วน ไม่ส่งรูป ราคาถูก ----------
     askExpand: คำถามไทย → ชื่อตัวละคร + คำค้นไทย/คำใกล้เคียง (ไว้ให้ค้นในดัชนีในเครื่อง) · askPick: รายการฉากผู้สมัคร (คำอธิบายจากดัชนี) → AI เลือกที่ตรง + ตอบสั้นๆ ไม่เจอก็ตอบว่าไม่เจอ */
  async function askText(prompt, effort){
    var body = { model:cfg.model, usage:{ include:true }, messages:[{ role:"user", content:prompt }] };
    if(/^google\//.test(cfg.model)) body.reasoning = { effort:effort || "low" };
    var r = await post(body), j;
    try{ j = parseJSON(r.text); }catch(err){ err.cost = r.cost; throw err; }
    r.json = j; return r;
  }
  /* ---------- ฟังเสียงคลิป (footage-speech.js) · ส่งเสียงโมโน 16 kHz (wav base64 ≤ ~3 นาที) ให้โมเดลที่รับเสียงได้ (Gemini) ถอดบทพูดพร้อมเวลา ---------- */
  async function transcribe(b64, dur, hint, frames, scenes, arcs){ /* arcs = รายชื่อภาค (v8.59) → AI ตอบภาคของคลิปมาด้วยในคำขอเดียว ไม่เสียเพิ่ม */ /* frames = [{ s, img } | { n, s, e, img }] ภาพตามเวลา (s/e = วินาทีนับจากต้นเสียงท่อนนี้; มี n = ภาพของฉากที่ n) · scenes = [{ n, s, e }] ขอบเขตฉากในท่อนนี้ → ดูพร้อมฟัง: ใครพูด + ใครทำอะไรที่ไหนยังไงต่อฉาก */
    var watch = frames && frames.length, roster = "Luffy, Zoro, Nami, Usopp, Sanji, Chopper, Robin, Franky, Brook, Jinbe, Ace, Sabo, Shanks, Garp, Buggy, Hancock, Law, Kid, Mihawk, Crocodile, Doflamingo, Kaido, Big Mom, Blackbeard, Whitebeard, Akainu, Aokiji, Kizaru, Smoker, Tashigi, Vivi, Carrot, Yamato, Perona, Rayleigh";
    var prompt = [
      "This is the audio track of a short One Piece anime clip" + (watch ? ", together with picture frames of the clip in time order" : "") + ". The dialogue is almost always a THAI dub (sometimes Japanese or English). Audio length: " + Math.round(dur) + "s." + (hint ? " Context from the editor (may be wrong): " + hint : ""),
      "Transcribe ONLY the spoken words (dialogue, narration, shouted attack names) in the language spoken, Thai in Thai script. Ignore music, sound effects and silence. Do not invent words: if a part is unclear or there is no speech, leave it out.",
      "Group the speech into short segments (one sentence or breath each). s and e are seconds from the START OF THIS AUDIO (e.g. 3.4)."
    ];
    if(watch){
      prompt.push("Each picture is labelled with its time (seconds from the start of this audio). Use BOTH the pictures and the voice to say WHO speaks each segment: look at the frames at that segment's time and pick the character whose mouth is open / who is gesturing or shouting; also use names called in the words, self-introductions, speech bubbles and the Thai-dub voice you recognise. Put the English name in \"who\" (prefer: " + roster + "). A speaker who is NOT a known main character (shopkeeper, bank clerk, marine soldier, villager, old man, old woman, child, king, pirate, etc.) must NEVER be left empty: write a short Thai role label instead, e.g. \"พนักงานธนาคาร\", \"พ่อค้า\", \"ลุง\", \"ป้า\", \"ทหารเรือ\", \"เด็กชาย\", \"ชาวบ้าน\", \"โจรสลัด\" (add \"ชาย\"/\"หญิง\" if useful, and a name if one is said or shown, e.g. \"ลุงเกาะ (ชาย)\"). If the speaker is not visible, say what kind of voice it is, e.g. \"เสียงผู้ชายนอกจอ\"; leave \"who\" empty only if you truly cannot tell. Narrator voice = \"Narrator\". Set \"sure\": true only when you are confident; if unsure still give your best guess but \"sure\": false; if you have no idea leave \"who\" empty. Several characters on screen: the speaker is NOT necessarily the one in the centre. If SEVERAL characters speak/shout the same words at the same time (cheering, laughing together), put ALL of them in \"who\" separated by commas (e.g. \"Carrot, Chopper, Brook\"); if different characters say different lines that overlap in time, output separate segments with overlapping s/e.");
      if(scenes && scenes.length) prompt.push("Scene boundaries of this clip (scene number: start-end seconds): " + scenes.map(function(x){ return x.n + ": " + x.s.toFixed(1) + "-" + x.e.toFixed(1); }).join("; ") + ". For EVERY scene number listed, write \"t\": 1-2 short Thai sentences saying WHO (by name) does WHAT, WHERE (place/setting) and HOW (expression, emotion, manner), e.g. \"ซันจิยืนคาบบุหรี่บนดาดฟ้าเรือ สีหน้าจริงจัง ส่งจดหมายให้นามิ\". Name EVERY visible person, including unnamed side characters by role (พนักงานธนาคาร, พ่อค้า, ลุง, ทหารเรือ, ชาวบ้าน), and mention small but useful details: notable objects (กระสอบสมบัติ, ธนบัตร, อาวุธ), signs or on-screen text, number of people, clothing, weather/time of day, camera view. Be specific, do not repeat the dialogue.");
      if(arcs && arcs.length) prompt.push("Also say which One Piece story arc this clip is from in \"arc\", copying EXACTLY one name from this list: " + arcs.join(", ") + ". Decide from the place/setting, the crew's outfits and looks (before/after the 2-year timeskip), the enemies, and places or events named in the dialogue. Only answer when you are confident; otherwise \"arc\": \"\". Do not guess.");
      prompt.push("Return ONLY JSON, no markdown: {\"segments\":[{\"s\":0.0,\"e\":2.1,\"t\":\"text\",\"who\":\"Sanji\",\"sure\":true}],\"scenes\":[{\"i\":<scene number>,\"t\":\"Thai description\"}]," + (arcs && arcs.length ? "\"arc\":\"arc name or empty\"," : "") + "\"summary_th\":\"one short Thai sentence about what happens (empty if nothing)\"}");
    } else {
      prompt.push("Add \"who\" only when the speaker is clearly named in the speech or obvious, else leave it empty.");
      prompt.push("Return ONLY JSON, no markdown: {\"segments\":[{\"s\":0.0,\"e\":2.1,\"t\":\"text\",\"who\":\"\"}],\"summary_th\":\"one short Thai sentence about what is being said (empty if no speech)\"}");
    }
    var content = [{ type:"text", text:prompt.join("\n") }];
    if(watch) frames.forEach(function(f){ content.push({ type:"text", text:(f.n ? "Scene " + f.n + " (" + f.s.toFixed(1) + "s-" + f.e.toFixed(1) + "s):" : "t=" + f.s.toFixed(1) + "s") }); content.push({ type:"image_url", image_url:{ url:f.img } }); });
    content.push({ type:"input_audio", input_audio:{ data:b64, format:"wav" } });
    var body = { model:cfg.model, usage:{ include:true }, messages:[{ role:"user", content:content }] };
    if(/^google\//.test(cfg.model)) body.reasoning = { effort:watch ? "medium" : "low" };
    var r = await post(body), j;
    try{ j = parseJSON(r.text); }catch(err){ err.cost = r.cost; err.raw = r.text; throw err; }
    r.json = j; return r;
  }
  async function askExpand(question){
    var r = await askText([
      "You help a Thai One Piece video editor search his own footage library (anime clips, scenes described in Thai/English). Turn his question into search terms.",
      "Return ONLY JSON: {\"chars\":[\"English character names that must be in the scene, [] if none\"],\"keys\":[\"6-14 short Thai keywords/synonyms: emotion, action, event, place, what is seen (e.g. ร้องไห้, น้ำตา, เศร้า)\"],\"arc\":\"English arc name or empty\"}",
      "Question: " + question ].join("\n"));
    var j = r.json, arr = function(x){ return Array.isArray(x) ? x.map(String).filter(Boolean).slice(0, 16) : []; };
    r.chars = arr(j.chars); r.keys = arr(j.keys); r.arc = String(j.arc || ""); return r;
  }
  /* cands:[{ n, clip, album, at, who, sum }] → { answer, picks:[{ n, why }], none } */
  async function askPick(question, cands){
    var list = cands.map(function(c){ return c.n + ". [" + c.clip + " · " + c.at + "] " + (c.who ? c.who + " · " : "") + c.sum; }).join("\n");
    var r = await askText([
      "You are the footage librarian for a Thai One Piece editor. He asks a question about his footage. Below are candidate scenes from his library, each with an automatic description (it can be imperfect).",
      "Pick the scenes that truly answer the question (best first, at most 12). If nothing truly matches, say so honestly: none=true and picks=[]. Never invent scenes not in the list.",
      "Write answer in short casual Thai (1-3 sentences): how many matching scenes and in which clips (name + minute), or that there is none. For each pick give a short Thai reason.",
      "Return ONLY JSON: {\"answer\":\"Thai\",\"none\":false,\"picks\":[{\"n\":<number>,\"why\":\"short Thai\"}]}",
      "Question: " + question, "Candidates:", list ].join("\n"), "medium");
    var j = r.json;
    r.answer = String(j.answer || ""); r.none = !!j.none;
    r.picks = (Array.isArray(j.picks) ? j.picks : []).map(function(p){ return { n:Number(p.n), why:String(p.why || "") }; }).filter(function(p){ return p.n > 0; });
    return r;
  }

  async function describeGod(chunk, album, dur){
    var model = cfg.godModel || cfg.model, content = [{ type:"text", text:godPrompt(album, dur, chunk.length) }];
    chunk.forEach(function(sc){
      content.push({ type:"text", text:"\nScene " + sc.n + " (" + sc.s.toFixed(1) + "-" + sc.e.toFixed(1) + "s), " + sc.aiFrames.length + " frames:" });
      sc.aiFrames.forEach(function(u, k){ content.push({ type:"text", text:"frame " + (k + 1) + "/" + sc.aiFrames.length + ":" }); content.push({ type:"image_url", image_url:{ url:u } }); });
    });
    var body = { model:model, messages:[{ role:"user", content:content }], usage:{ include:true } };
    if(/^google\//.test(model)) body.reasoning = { effort:"medium" };
    var r = await post(body), j;
    try{ j = parseJSON(r.text); }catch(err){ err.raw = r.text; err.cost = r.cost; throw err; }
    r.json = j; return r;
  }

  window.FT = { classifyArcs:classifyArcs, cfg:cfg, saveCfg:saveCfg, orKey:orKey, store:store, clipId:clipId, scan:scan, refreshImages:refreshImages, IMG_V:IMG.v, AI_V:AI_V, AI_GOD:AI_GOD, deepFrames:deepFrames, describe:describe, beats:beats, direct:direct, recognize:recognize, askExpand:askExpand, transcribe:transcribe, askPick:askPick };
})();
