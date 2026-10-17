/* history-ui.js — แผง "ผลงานล่าสุด" ในแท็บตั้งค่าของแอพหลัก (index.html #hsFold) · ข้อมูลอยู่ที่ history.js (MWHist)
   เปิด: ตัดต่ออัตโนมัติ = ใส่ตารางกลับ mw_footage_direct_v1 แล้วไป footage.html?tab=plan&hist=1 · สตูดิโอ = ใส่โปรเจกต์กลับ mw_studio_v1 แล้วไป studio.html · ไฟล์วิดีโอ = เล่นในแผง */
(function(){
  "use strict";
  var $ = function(id){ return document.getElementById(id); };
  if(!$("hsList") || !window.MWHist) return;
  var KIND = { plan:"ตัดต่ออัตโนมัติ", studio:"สตูดิโอ" };
  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"]/g, function(c){ return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]; }); }
  function when(t){ try{ return new Date(t).toLocaleString("th-TH", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" }); }catch(e){ return ""; } }
  function mb(n){ return n >= 1073741824 ? (n / 1073741824).toFixed(2) + " GB" : n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB"; }
  function msg(t){ var m = $("hsMsg"); m.className = "hint"; m.textContent = t || ""; }
  function render(){
    var items = MWHist.list(), box = $("hsList"), max = MWHist.max(), shown = {};
    $("hsMax").value = max;
    $("hsTag").textContent = items.length ? items.length + " รายการ" : ""; $("hsTag").className = "state " + (items.length ? "ok" : "idle");
    var rows = items.filter(function(x){ shown[x.kind] = (shown[x.kind] || 0) + 1; return shown[x.kind] <= max; });
    box.innerHTML = rows.length ? rows.map(function(x){
      var label = x.kind === "file" ? x.tool : KIND[x.kind], extra = x.kind === "file" && x.file.size ? " · " + mb(x.file.size) : "";
      var canPlay = x.kind === "file" && /\.(mp4|webm|mov)$/i.test(x.file.name);
      return '<div class="hs" data-id="' + esc(x.id) + '"><div class="hi"><b>' + esc(x.title || x.id) + "</b><small>" + esc(label) + " · " + when(x.at) + extra + "</small></div>"
        + '<div class="hb"><button class="btn ghost" data-o="1" type="button">' + (x.kind === "file" && !canPlay ? "ที่อยู่" : "เปิด") + '</button><button class="btn ghost" data-d="1" type="button">ลบ</button></div></div>';
    }).join("") : '<p class="hint">ยังไม่มีงาน · พอทำตัดต่อ/ซับ/สตูดิโอแล้วจะขึ้นที่นี่</p>';
    var extraFiles = items.filter(function(x){ return x.kind === "file"; }).length - max;
    $("hsPurge").hidden = extraFiles < 1; $("hsPurge").textContent = "ล้างไฟล์วิดีโอที่เก่ากว่า " + max + " อันล่าสุด (" + Math.max(0, extraFiles) + " ไฟล์)";
  }
  $("hsList").addEventListener("click", async function(e){
    var row = e.target.closest(".hs"), b = e.target.closest("button"); if(!row || !b) return;
    var it = MWHist.get(row.dataset.id); if(!it) return;
    if(b.dataset.d){
      var ok = await MWDialog.confirm(it.kind === "file" ? "ลบไฟล์ \"" + it.title + "\" ออกจากมือถือเลยไหม? (ลบแล้วกู้คืนไม่ได้)" : "ลบ \"" + (it.title || "งานนี้") + "\" ออกจากประวัติ?", { ok:"ลบ", cancel:"ไม่ลบ" });
      if(ok){ await MWHist.remove(it.id); render(); }
      return;
    }
    if(it.kind !== "file"){ MWHistSheet.openItem(it); return; } /* ตารางตัดต่อ/โปรเจกต์สตูดิโอ: ตัวเดียวกับปุ่มประวัติในแต่ละเครื่องมือ */
    /* ไฟล์ */
    var old = row.querySelector("video"); if(old){ old.pause(); old.remove(); return; }
    if(!/\.(mp4|webm|mov)$/i.test(it.file.name) || !window.Capacitor || !it.file.uri){ msg("ไฟล์อยู่ที่ Documents/" + it.file.rel + " (เปิดจากแอพไฟล์ของมือถือ)"); return; }
    var v = document.createElement("video"); v.controls = true; v.playsInline = true; v.src = Capacitor.convertFileSrc(it.file.uri); row.appendChild(v); v.play().catch(function(){});
    v.onerror = function(){ msg("เล่นไฟล์นี้ไม่ได้ (ไฟล์ถูกย้ายหรือลบไปแล้ว?) · ที่อยู่เดิม Documents/" + it.file.rel); v.remove(); };
  });
  $("hsMax").addEventListener("change", function(){ MWHist.setMax(this.value); render(); });
  $("hsPurge").addEventListener("click", async function(){
    var n = MWHist.list("file").length - MWHist.max(); if(n < 1) return;
    if(!(await MWDialog.confirm("ลบไฟล์วิดีโอ/srt ที่เก่ากว่า " + MWHist.max() + " อันล่าสุด " + n + " ไฟล์ ออกจากมือถือเลยไหม? (ลบแล้วกู้คืนไม่ได้)", { ok:"ลบเลย", cancel:"ไม่ลบ" }))) return;
    var d = await MWHist.purgeFiles(); msg("ลบแล้ว " + d + " ไฟล์"); render();
  });
  MWHist.onChange(render);
  MWHist.ready.then(function(n){ if(n) msg("ดึงประวัติงานกลับจากไฟล์ในมือถือ " + n + " รายการ"); render(); });
  render();
})();
