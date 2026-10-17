/* voicestore.js (window.MWVoice) — เก็บเทคเสียงพากย์ล่าสุดไว้ใน IndexedDB `mw_voice_v1` store `takes` ให้หน้าฟุตเทจ (แท็บผู้กำกับ) ใช้ต่อ
   + สำเนาเป็นไฟล์ Documents/Meowrin/voice/<id>.mp3+.json (เฉพาะในแอพ · ดึงกลับถ้าฐานข้อมูลว่าง) · v8.19: เลิกสำรองขึ้น R2 แล้ว
   แยกจาก MWStore เพราะเป็นไฟล์เสียง (Blob) ไม่ควรเข้าไฟล์สำรอง Drive · tts.js เขียนหลังสร้างเสียงทุกเทค · เก็บแค่ KEEP เทคล่าสุด
   record = { id, at, text, name, blob (mp3), align?:{ chars, st[], en[] } } · align = เวลาเริ่ม/จบของทุกตัวอักษร (ไม่รวมช่องว่าง) ของ "บท" เทียบกับต้นไฟล์ blob */
(function(){
  "use strict";
  var DB = "mw_voice_v1", ST = "takes", KEEP = 50, dbp = null;
  function open(){
    if(!dbp) dbp = new Promise(function(ok, no){
      var r = indexedDB.open(DB, 1);
      r.onupgradeneeded = function(){ r.result.createObjectStore(ST, { keyPath:"id" }); };
      r.onsuccess = function(){ ok(r.result); }; r.onerror = function(){ no(r.error); };
    });
    return dbp;
  }
  function run(mode, fn){ /* fn(store) → IDBRequest ที่ผลลัพธ์จะถูกคืน */
    return open().then(function(db){ return new Promise(function(ok, no){
      var t = db.transaction(ST, mode), req = fn(t.objectStore(ST));
      t.oncomplete = function(){ ok(req ? req.result : undefined); }; t.onerror = t.onabort = function(){ no(t.error); };
    }); });
  }
  function list(){ return run("readonly", function(s){ return s.getAll(); }).then(function(a){ return (a || []).sort(function(x, y){ return y.id - x.id; }); }); }
  function get(id){ return run("readonly", function(s){ return s.get(id); }); }
  function put(rec){
    rec.id = rec.id || Date.now();
    return run("readwrite", function(s){ return s.put(rec); }).then(list).then(function(a){
      return run("readwrite", function(s){ a.slice(KEEP).forEach(function(r){ if(r.id !== rec.id) s.delete(r.id); }); return null; }); /* เทคที่เพิ่งเขียน/ดึงมาไม่ถูกตัดทิ้ง */
    }).then(function(){ filePut(rec); return rec.id; });
  }
  /* ---------- สำเนาเป็นไฟล์ในแอพ (เฉพาะแอพ APK): Documents/Meowrin/voice/<id>.mp3 + .json · ล้างข้อมูลแอพแล้ว IndexedDB หายก็ดึงกลับจากไฟล์ได้ ---------- */
  var VDIR = "Meowrin/voice";
  function fsx(){ var c = window.Capacitor; return c && c.isNativePlatform && c.isNativePlatform() && c.Plugins && c.Plugins.Filesystem && (!c.isPluginAvailable || c.isPluginAvailable("Filesystem")) ? c.Plugins.Filesystem : null; }
  function b64(blob){ return new Promise(function(ok, no){ var r = new FileReader(); r.onload = function(){ ok(String(r.result).split(",")[1] || ""); }; r.onerror = function(){ no(r.error); }; r.readAsDataURL(blob); }); }
  async function filePut(rec){ var f = fsx(); if(!f) return false;
    try{
      await f.writeFile({ path:VDIR + "/" + rec.id + ".mp3", data:await b64(rec.blob), directory:"DOCUMENTS", recursive:true });
      await f.writeFile({ path:VDIR + "/" + rec.id + ".json", data:await b64(new Blob([JSON.stringify({ id:rec.id, text:rec.text, name:rec.name, align:rec.align || null })])), directory:"DOCUMENTS", recursive:true });
      return true;
    }catch(e){ return false; } /* เขียนไฟล์ไม่ได้ (ไฟล์ชื่อเดิมมีแล้ว/พื้นที่เต็ม) ไม่กระทบการสร้างเสียง */
  }
  async function fileRestore(){ /* IndexedDB ว่าง (เช่นล้างข้อมูลแอพ) แต่มีไฟล์ในโฟลเดอร์ → ดึงกลับ · คืนจำนวนเทคที่ได้คืน */
    var f = fsx(); if(!f || (await list()).length) return 0;
    var names; try{ names = ((await f.readdir({ path:VDIR, directory:"DOCUMENTS" })).files || []).map(function(x){ return typeof x === "string" ? x : x.name; }); }catch(e){ return 0; }
    var ids = names.map(function(n){ var m = /^(\d+)\.mp3$/.exec(n); return m ? +m[1] : 0; }).filter(Boolean).sort(function(a, c){ return c - a; }).slice(0, KEEP), n = 0;
    for(var i = 0; i < ids.length; i++){
      try{ var mp3 = await f.readFile({ path:VDIR + "/" + ids[i] + ".mp3", directory:"DOCUMENTS" }), meta = {};
        try{ var jb = atob((await f.readFile({ path:VDIR + "/" + ids[i] + ".json", directory:"DOCUMENTS" })).data); meta = JSON.parse(new TextDecoder().decode(Uint8Array.from(jb, function(ch){ return ch.charCodeAt(0); }))); }catch(e){} /* ไฟล์เป็น UTF-8 (บทภาษาไทย) */
        var bin = atob(mp3.data), u = new Uint8Array(bin.length); for(var k = 0; k < bin.length; k++) u[k] = bin.charCodeAt(k);
        await run("readwrite", function(s){ return s.put({ id:ids[i], text:meta.text || "", name:meta.name || ids[i] + ".mp3", blob:new Blob([u], { type:"audio/mpeg" }), align:meta.align || null }); }); n++;
      }catch(e){}
    }
    return n;
  }
  function del(id){ var f = fsx(); if(f) [".mp3", ".json"].forEach(function(e){ f.deleteFile({ path:VDIR + "/" + id + e, directory:"DOCUMENTS" }).catch(function(){}); });
    return run("readwrite", function(s){ return s.delete(id); }); }
  window.MWVoice = { restore:fileRestore, list:list, get:get, put:put, del:del };
  fileRestore().then(function(n){ if(n) document.dispatchEvent(new CustomEvent("mw:voices", { detail:n })); }).catch(function(){}); /* เปิดหน้าแล้วเช็กครั้งเดียว (ว่างแต่มีไฟล์ = ดึงกลับ) */
})();
