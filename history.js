/* history.js (window.MWHist) — ประวัติงานล่าสุดของทุกเครื่องมือ (ตัวเลขเก็บได้ตั้งค่าเอง ค่าเริ่ม 30 อันต่อชนิด)
   ชนิดข้อมูล (kind): "plan" ตารางช็อตของตัดต่ออัตโนมัติ · "studio" โปรเจกต์สตูดิโอ → เก็บ "สูตร" (JSON เล็กๆ) เปิดกลับมาทำต่อได้ · "file" ไฟล์ที่เซฟลง Documents/Meowrin (mp4/webm/mov/srt จาก MWNative.save) → เก็บแค่ที่อยู่
   เก็บใน MWStore key mw_hist_v1 { max, items:[{ id, kind, key, at, title, tool?, data?, file?:{ rel, uri, name, size } }] } + สำเนาเป็นไฟล์ Documents/Meowrin/history/<kind>-<key>.json (เฉพาะในแอพ APK)
   ล้างข้อมูลแอพ → ฐานข้อมูลว่าง = ดึงสูตรจากไฟล์กลับให้เอง + หาไฟล์วิดีโอ/srt ใน Documents/Meowrin มาใส่รายการ (restore)
   ลบเอง: เฉพาะ "สูตร" ที่เกิน max (เล็กและทำใหม่ได้) · ไฟล์วิดีโอไม่ถูกลบเอง ต้องกด "ล้างอันเก่า" หรือลบทีละอันในตั้งค่า */
(function(){
  "use strict";
  var KEY = "mw_hist_v1", DIR = "Meowrin/history", FILE_META_MAX = 300, MIN_MAX = 5, MAX_MAX = 500, EXT = /\.(mp4|webm|mov|srt)$/i;
  var timers = {}, listeners = [];
  function fsx(){ var c = window.Capacitor; return c && c.isNativePlatform && c.isNativePlatform() && c.Plugins && c.Plugins.Filesystem && (!c.isPluginAvailable || c.isPluginAvailable("Filesystem")) ? c.Plugins.Filesystem : null; }
  function st(){ var s = MWStore.get(KEY, {}) || {}; if(!Array.isArray(s.items)) s.items = []; if(!(s.max >= MIN_MAX)) s.max = 30; return s; }
  function stamp(s){ var t = Date.now(); s.items.forEach(function(x){ if(x.at >= t) t = x.at + 1; }); return t; } /* เวลาไม่ซ้ำกัน (เพิ่มเร็วกว่า 1 มิลลิวิ = เรียงลำดับเพี้ยน ตัดผิดอัน) */
  function put(s){ MWStore.set(KEY, s); listeners.forEach(function(f){ try{ f(); }catch(e){} }); }
  function safe(k){ return String(k).replace(/[^\w-]/g, "_"); }
  function mname(it){ return it.kind + "-" + safe(it.key) + ".json"; }
  function utf8b64(text){ var u = new TextEncoder().encode(text), s = ""; for(var i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
  function unb64(b){ var bin = atob(b), u = Uint8Array.from(bin, function(c){ return c.charCodeAt(0); }); return new TextDecoder().decode(u); }

  function toolOf(name){
    if(/^meowrin_studio/i.test(name)) return "สตูดิโอ";
    if(/^meowrin_\d/.test(name)) return "ตัดต่ออัตโนมัติ";
    if(/green_screen|subtitle|\.srt$/i.test(name)) return "ซับจอเขียว";
    return "ไฟล์อื่น";
  }
  /* ---------- สำเนาไฟล์ของ "สูตร" ---------- */
  function mirror(it){ /* เขียนช้าลง 1.2 วิ: สตูดิโอแก้ถี่ ไม่ต้องเขียนไฟล์ทุกครั้ง */
    var f = fsx(); if(!f || it.kind === "file") return;
    clearTimeout(timers[it.id]);
    timers[it.id] = setTimeout(function(){
      var cur = st().items.find(function(x){ return x.id === it.id; }); if(!cur) return;
      f.writeFile({ path:DIR + "/" + mname(cur), data:utf8b64(JSON.stringify({ kind:cur.kind, key:cur.key, at:cur.at, title:cur.title, data:cur.data })), directory:"DOCUMENTS", recursive:true }).catch(function(){});
    }, 1200);
  }
  function unmirror(it){ var f = fsx(); if(f && it.kind !== "file") f.deleteFile({ path:DIR + "/" + mname(it), directory:"DOCUMENTS" }).catch(function(){}); clearTimeout(timers[it.id]); }

  /* ---------- เพิ่ม / แก้ ---------- */
  function prune(s){ /* สูตรที่เกิน max (เก่าสุดก่อน) ลบเอง · เมตาของไฟล์เก็บเยอะหน่อย (ไม่ลบไฟล์จริง) */
    ["plan", "studio"].forEach(function(k){
      var a = s.items.filter(function(x){ return x.kind === k; }).sort(function(x, y){ return y.at - x.at; });
      a.slice(s.max).forEach(function(x){ unmirror(x); s.items.splice(s.items.indexOf(x), 1); });
    });
    var fl = s.items.filter(function(x){ return x.kind === "file"; }).sort(function(x, y){ return y.at - x.at; });
    fl.slice(FILE_META_MAX).forEach(function(x){ s.items.splice(s.items.indexOf(x), 1); });
  }
  function add(kind, o){ /* o = { key, title, data } · key เดิม = แก้ของเดิมแล้วขึ้นบนสุด */
    var s = st(), key = String(o.key), old = s.items.find(function(x){ return x.kind === kind && String(x.key) === key; });
    if(old) s.items.splice(s.items.indexOf(old), 1);
    var it = { id:kind + "-" + key, kind:kind, key:key, at:stamp(s), title:o.title || "", data:o.data };
    s.items.push(it); prune(s); put(s); mirror(it); return it;
  }
  function addFile(o){ /* o = { name, uri, rel, size } จาก MWNative.save · ไม่ใช่วิดีโอ/srt = ไม่เก็บ */
    if(!o || !o.name || !EXT.test(o.name)) return null;
    var s = st(), id = "file-" + (o.rel || o.name), old = s.items.find(function(x){ return x.id === id; });
    if(old) s.items.splice(s.items.indexOf(old), 1);
    var it = { id:id, kind:"file", key:o.rel || o.name, at:stamp(s), title:o.name, tool:toolOf(o.name), file:{ rel:o.rel || "Meowrin/" + o.name, uri:o.uri || "", name:o.name, size:o.size || 0 } };
    s.items.push(it); prune(s); put(s); return it;
  }

  /* ---------- อ่าน / ลบ ---------- */
  function list(kind){ return st().items.filter(function(x){ return !kind || x.kind === kind; }).sort(function(x, y){ return y.at - x.at; }); }
  function get(id){ return st().items.find(function(x){ return x.id === id; }) || null; }
  function max(){ return st().max; }
  function setMax(n){ n = Math.round(+n); if(!(n >= MIN_MAX)) n = MIN_MAX; if(n > MAX_MAX) n = MAX_MAX; var s = st(); s.max = n; prune(s); put(s); return n; }
  async function delFile(f){ var fs = fsx(); if(!fs || !f || !f.rel) return; try{ await fs.deleteFile({ path:f.rel, directory:"DOCUMENTS" }); }catch(e){} }
  async function remove(id){ /* ไฟล์วิดีโอ = ลบไฟล์จริงด้วย (ผู้ใช้กดลบเอง) */
    var s = st(), it = s.items.find(function(x){ return x.id === id; }); if(!it) return false;
    s.items.splice(s.items.indexOf(it), 1); unmirror(it); if(it.kind === "file") await delFile(it.file); put(s); return true;
  }
  async function purgeFiles(){ /* ไฟล์ที่เก่ากว่า max อันล่าสุด: ลบไฟล์จริง + เมตา · คืนจำนวน */
    var s = st(), old = list("file").slice(s.max), gone = {};
    for(var i = 0; i < old.length; i++){ await delFile(old[i].file); gone[old[i].id] = 1; }
    s.items = s.items.filter(function(x){ return !gone[x.id]; });
    if(old.length) put(s); return old.length;
  }
  function size(){ return list("file").reduce(function(a, x){ return a + (x.file.size || 0); }, 0); }
  function onChange(f){ listeners.push(f); }

  /* ---------- ดึงกลับหลังล้างข้อมูลแอพ ---------- */
  async function restore(){ /* ฐานข้อมูลว่าง + มีไฟล์ในเครื่อง → สูตรจาก history/*.json · ไฟล์วิดีโอ/srt ใน Documents/Meowrin · คืนจำนวนที่ดึงได้ */
    var f = fsx(), s = st(); if(!f || s.items.length) return 0;
    var n = 0, names = [];
    try{ names = ((await f.readdir({ path:DIR, directory:"DOCUMENTS" })).files || []).map(function(x){ return typeof x === "string" ? x : x.name; }); }catch(e){}
    for(var i = 0; i < names.length; i++){
      if(!/\.json$/.test(names[i])) continue;
      try{ var j = JSON.parse(unb64((await f.readFile({ path:DIR + "/" + names[i], directory:"DOCUMENTS" })).data));
        if(j && (j.kind === "plan" || j.kind === "studio") && j.data){ s.items.push({ id:j.kind + "-" + j.key, kind:j.kind, key:String(j.key), at:j.at || 0, title:j.title || "", data:j.data }); n++; } }catch(e){}
    }
    try{ ((await f.readdir({ path:"Meowrin", directory:"DOCUMENTS" })).files || []).forEach(function(x){
      if(typeof x === "string" || x.type === "directory" || !EXT.test(x.name)) return;
      s.items.push({ id:"file-Meowrin/" + x.name, kind:"file", key:"Meowrin/" + x.name, at:x.mtime || 0, title:x.name, tool:toolOf(x.name), file:{ rel:"Meowrin/" + x.name, uri:x.uri || "", name:x.name, size:x.size || 0 } }); n++; }); }catch(e){}
    if(n){ prune(s); put(s); }
    return n;
  }
  var ready = restore().catch(function(){ return 0; });

  window.MWHist = { add:add, addFile:addFile, list:list, get:get, remove:remove, purgeFiles:purgeFiles, max:max, setMax:setMax, size:size, toolOf:toolOf, restore:restore, ready:ready, onChange:onChange };
})();
