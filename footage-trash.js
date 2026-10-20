/* footage-trash.js — พับ "ลบคลิปที่ไม่ใช้" ในแท็บตั้งค่า: เอาคลิปที่ไฟล์หายจากมือถือ (ลบในแอพรูปภาพไปแล้ว) ออกจากแอพแบบสองขั้น
   ขั้น 1 เลือกจากรายการ "ไฟล์หาย" → ย้ายเข้าถังขยะ = c.hide = "trash" (ค้นหา/ถาม AI/จัดอัลบั้ม/ผู้กำกับไม่เห็น เหมือนซ่อนฟุตซ้ำ แต่ดัชนียังอยู่) · ขั้น 2 เลือกในถังขยะ → คืนกลับ หรือ ลบถาวร (ลบดัชนีของคลิป ไม่แตะไฟล์ในมือถือ)
   ไม่ลบไฟล์ในมือถือเลย (ลบที่แอพรูปภาพ) · ไม่ย้ายให้เอง: สแกนพลาด/เปลี่ยนชื่อไฟล์ ก็ดูเหมือนไฟล์หายได้ ให้ผู้ใช้เลือกเอง · ไฟล์กลับมา (เช่น กู้จากถังขยะแกลเลอรี) ชื่อ+ขนาดเดิม = คืนจากถังให้เองตอนสแกนเสร็จ
   c.hide มี 2 แบบ: true = ซ่อนเพราะซ้ำ (footage-dup.js) · "trash" = ถังขยะ (ไฟล์นี้) · โหลดหลัง footage-dup.js */
(function(){
  "use strict";
  var FT = window.FT, U = FT && FT.ui; if(!U || !$("trOut")) return;
  function $(id){ return document.getElementById(id); }
  var esc = U.esc, selM = {}, selT = {}, busy = false, msg = "";
  function scanned(){ return !!(window.MWLocal && MWLocal.native && MWLocal.native() && MWLocal.list && MWLocal.list().length); } /* ยังไม่เคยสแกน = ไม่รู้ว่าไฟล์ไหนหาย */
  function hasFile(c){ try{ return !!(window.MWLocal && MWLocal.urlOf(c)); }catch(e){ return false; } } /* ตัวจับคู่เดียวกับทั้งแอพ (ชื่อ+ขนาด + aliases) */
  function missing(){ return scanned() ? U.lib().filter(function(c){ return c.status === "done" && !c.hide && !hasFile(c); }).sort(byName) : []; }
  function trashed(){ return U.lib().filter(function(c){ return c.hide === "trash"; }).sort(function(a, b){ return (b.trashAt || 0) - (a.trashAt || 0); }); }
  function byName(a, b){ return a.name < b.name ? -1 : 1; }
  function dur(c){ var d = Math.round(c.duration || 0); return d ? Math.floor(d / 60) + ":" + String(d % 60).padStart(2, "0") : ""; }
  function day(ms){ return ms ? new Date(ms).toLocaleDateString("th-TH", { day:"numeric", month:"short" }) : ""; }
  function row(c, on, sub){ return '<button type="button" class="trrow' + (on ? " on" : "") + '" data-k="' + esc(c.id) + '"><img src="' + (c.cover || "") + '" alt=""><span><b>' + esc(c.name) + "</b><small>" + esc(sub) + '</small></span><i class="trck">' + (on ? MWIcon("check") : "") + "</i></button>"; }
  function count(sel){ return Object.keys(sel).length; }
  function render(){
    var M = missing(), T = trashed(), nm = 0, nt = 0, h = "";
    Object.keys(selM).forEach(function(k){ if(M.some(function(c){ return c.id === k; })) nm++; else delete selM[k]; }); /* รายการเปลี่ยน (สแกนใหม่/คืนกลับ) = ทิ้งที่เลือกค้าง */
    Object.keys(selT).forEach(function(k){ if(T.some(function(c){ return c.id === k; })) nt++; else delete selT[k]; });
    var tag = $("tagTr"); tag.className = "state " + (M.length ? "warn" : T.length ? "idle" : "idle"); tag.textContent = M.length ? "ไฟล์หาย " + M.length : T.length ? "ถังขยะ " + T.length : "";
    if(!window.MWLocal || !MWLocal.native || !MWLocal.native()) h += '<p class="hint">ใช้ได้เฉพาะในแอพ APK (ต้องสแกนหาไฟล์ในมือถือ)</p>';
    else if(!scanned()) h += '<p class="hint">ยังไม่เคยสแกนวิดีโอในมือถือ · กด สแกนวิดีโอในมือถือ ก่อน แล้วกลับมาที่นี่</p>';
    else {
      h += '<h3 class="trh">ไฟล์หาย ' + M.length + " คลิป</h3>";
      if(!M.length) h += '<p class="hint">ไม่มีคลิปที่ไฟล์หาย (ลบไฟล์ในแอพรูปภาพแล้วสแกนใหม่ จะโผล่ที่นี่)</p>';
      else h += '<div class="trbtns"><button class="btn ghost small" type="button" data-all="m">' + (nm === M.length ? "ไม่เลือกเลย" : "เลือกทั้งหมด") + '</button><button class="btn small" type="button" data-act="trash"' + (nm ? "" : " disabled") + ">" + MWIcon("trash") + "ย้ายเข้าถังขยะ" + (nm ? " (" + nm + ")" : "") + "</button></div>"
        + '<div class="trlist" data-l="m">' + M.map(function(c){ return row(c, !!selM[c.id], (c.album || "ไม่ระบุ") + (dur(c) ? " · " + dur(c) : "")); }).join("") + "</div>"
        + '<p class="hint tip">ถ้าไฟล์ยังอยู่แต่ขึ้นที่นี่ (ถูกเปลี่ยนชื่อ/อยู่โฟลเดอร์ที่สแกนไม่เจอ) อย่าเลือก</p>';
    }
    h += '<h3 class="trh">ถังขยะ ' + T.length + " คลิป</h3>";
    if(!T.length) h += '<p class="hint">ถังขยะว่าง</p>';
    else h += '<div class="trbtns"><button class="btn ghost small" type="button" data-all="t">' + (nt === T.length ? "ไม่เลือกเลย" : "เลือกทั้งหมด") + '</button><button class="btn ghost small" type="button" data-act="restore"' + (nt ? "" : " disabled") + ">คืนกลับ" + (nt ? " (" + nt + ")" : "") + '</button><button class="btn small" type="button" data-act="purge"' + (nt ? "" : " disabled") + ">" + MWIcon("trash") + "ลบถาวร" + (nt ? " (" + nt + ")" : "") + "</button></div>"
      + '<div class="trlist" data-l="t">' + T.map(function(c){ return row(c, !!selT[c.id], "ทิ้งเมื่อ " + day(c.trashAt) + (c.trashFrom ? " · จาก " + c.trashFrom : "")); }).join("") + "</div>"
      + '<p class="hint tip">ลบถาวร = ลบดัชนีของคลิปออกจากแอพ (ภาพฉาก บทพูด ตัวละคร) ย้อนกลับไม่ได้ · ไม่แตะไฟล์ในมือถือ</p>';
    if(msg) h += '<p class="hint ok">' + esc(msg) + "</p>";
    $("trOut").innerHTML = h;
  }
  async function save(clips, text){
    busy = true; try{ await FT.store.putMany(clips); msg = text; }catch(err){ msg = "บันทึกไม่ได้: " + (err.message || err); } busy = false;
    render(); document.dispatchEvent(new CustomEvent("ft:lib")); if(U.search) U.search(); /* หน้าอัลบั้ม/ค้นหา/จัดอัลบั้มเห็นสถานะใหม่ */
  }
  function pickedOf(sel){ return U.lib().filter(function(c){ return sel[c.id]; }); }
  $("trOut").addEventListener("click", async function(e){
    if(busy) return;
    var r = e.target.closest(".trrow");
    if(r){ var sel = r.closest(".trlist").dataset.l === "m" ? selM : selT, k = r.dataset.k; if(sel[k]) delete sel[k]; else sel[k] = 1; msg = ""; render(); return; }
    var b = e.target.closest("button"); if(!b) return;
    if(b.dataset.all){ var isM = b.dataset.all === "m", list = isM ? missing() : trashed(), s = isM ? selM : selT, all = count(s) === list.length; Object.keys(s).forEach(function(k){ delete s[k]; }); if(!all) list.forEach(function(c){ s[c.id] = 1; }); msg = ""; render(); return; }
    if(b.dataset.act === "trash"){ var cs = pickedOf(selM).filter(function(c){ return !c.hide; }); if(!cs.length) return; var now = Date.now(); cs.forEach(function(c){ c.hide = "trash"; c.trashAt = now; c.trashFrom = c.album || ""; }); selM = {}; await save(cs, "ย้าย " + cs.length + " คลิปเข้าถังขยะแล้ว"); }
    else if(b.dataset.act === "restore"){ var rs = pickedOf(selT).filter(function(c){ return c.hide === "trash"; }); if(!rs.length) return; rs.forEach(function(c){ delete c.hide; delete c.trashAt; delete c.trashFrom; }); selT = {}; await save(rs, "คืน " + rs.length + " คลิปกลับแล้ว"); }
    else if(b.dataset.act === "purge"){
      var ids = pickedOf(selT).filter(function(c){ return c.hide === "trash"; }).map(function(c){ return c.id; }); if(!ids.length) return;
      if(!await MWDialog.confirm("ลบดัชนีของ " + ids.length + " คลิปถาวร?\n\nภาพฉาก บทพูด ตัวละครที่ AI ทำไว้จะหายและกู้ไม่ได้ (ไฟล์ในมือถือไม่ถูกแตะ)", { ok:"ลบถาวร", cancel:"ยกเลิก" })) return;
      busy = true; try{ await FT.store.del(ids); selT = {}; msg = "ลบถาวร " + ids.length + " คลิปแล้ว"; if(U.refresh) await U.refresh(); }catch(err){ msg = "ลบไม่ได้: " + (err.message || err); } busy = false; render(); document.dispatchEvent(new CustomEvent("ft:lib"));
    }
  });
  /* ไฟล์กลับมา (กู้จากถังขยะแกลเลอรี/ก๊อปกลับ) = คืนจากถังให้เองตอนสแกนเสร็จ */
  async function autoRestore(){
    if(!scanned() || busy) return; var back = trashed().filter(hasFile); if(!back.length) return;
    back.forEach(function(c){ delete c.hide; delete c.trashAt; delete c.trashFrom; }); await save(back, "คืน " + back.length + " คลิปจากถังขยะแล้ว (เจอไฟล์ในมือถืออีกครั้ง)");
  }
  document.addEventListener("ft:files", function(){ autoRestore(); render(); }); /* สแกนมือถือเสร็จ */
  document.addEventListener("ft:lib", function(){ if(!busy) render(); });
  document.addEventListener("ft:scan", function(){ render(); });
  render();
})();
