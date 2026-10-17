/* history-sheet.js (window.MWHistSheet) — ปุ่มสามขีด "ผลงานล่าสุด" ของแต่ละเครื่องมือ (แบบโปรเจกต์ล่าสุดของ CapCut) · ข้อมูลอยู่ที่ history.js (MWHist)
   ใช้: ใส่ <button data-hist="plan|studio|sub"> ในหัวหน้า (ตัวนี้เติมป้ายตัวเลขและเปิดชีตให้เอง) · plan = ตารางช็อตตัดต่ออัตโนมัติ + วิดีโอที่ส่งออก · studio = โปรเจกต์สตูดิโอ + วิดีโอ · sub = ไฟล์ซับจอเขียว (mp4/srt)
   ไม่พึ่ง CSS/ไอคอนของหน้า (ฝังสไตล์เอง ใช้ได้ทั้งหน้าหลัก ฟุตเทจ สตูดิโอ ซับ) · openItem(it) ใช้ร่วมกับแผงในตั้งค่า (history-ui.js) */
(function(){
  "use strict";
  var TOOLS = { plan:{ kinds:["plan"], tool:"ตัดต่ออัตโนมัติ", title:"ผลงานตัดต่ออัตโนมัติ" }, studio:{ kinds:["studio"], tool:"สตูดิโอ", title:"โปรเจกต์สตูดิโอ" }, sub:{ kinds:[], tool:"ซับจอเขียว", title:"งานซับจอเขียว" } };
  var P = /\/sub\//.test(location.pathname) ? "../" : "", sheet = null, cur = "", playId = "", prevHook = null;
  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"]/g, function(c){ return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]; }); }
  function when(t){ try{ return new Date(t).toLocaleString("th-TH", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" }); }catch(e){ return ""; } }
  function mb(n){ return n >= 1073741824 ? (n / 1073741824).toFixed(2) + " GB" : n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB"; }
  function items(k){ var c = TOOLS[k], n = {}, max = MWHist.max(); return MWHist.list().filter(function(x){ return c.kinds.indexOf(x.kind) >= 0 || (x.kind === "file" && x.tool === c.tool); }).filter(function(x){ n[x.kind] = (n[x.kind] || 0) + 1; return n[x.kind] <= max; }); }

  var CSS = '[data-hist]{position:relative}.mwhs-n{position:absolute;top:-6px;right:-6px;min-width:18px;height:18px;padding:0 4px;border-radius:9px;background:#39d98a;color:#06120b;font:600 11px/18px "IBM Plex Sans Thai",sans-serif;text-align:center;font-style:normal;pointer-events:none}'
    + '.mwhs{position:fixed;inset:0;z-index:9000;display:flex;flex-direction:column;justify-content:flex-end;background:rgba(0,0,0,.6)}.mwhs[hidden]{display:none}'
    + '.mwhs-p{background:#131917;border:1px solid rgba(255,255,255,.12);border-radius:20px 20px 0 0;max-height:82vh;display:flex;flex-direction:column;color:#f4f4f5;font:15px/1.45 "IBM Plex Sans Thai",system-ui,sans-serif;padding-bottom:env(safe-area-inset-bottom)}'
    + '.mwhs-h{display:flex;align-items:center;gap:10px;padding:14px 16px 8px}.mwhs-h b{flex:1;font:500 17px Mitr,"IBM Plex Sans Thai",sans-serif}'
    + '.mwhs-x{width:40px;height:40px;border:0;border-radius:10px;background:#1a221f;color:#f4f4f5;font-size:0;position:relative}.mwhs-x:after,.mwhs-x:before{content:"";position:absolute;left:11px;top:19px;width:18px;height:2px;background:#f4f4f5;transform:rotate(45deg)}.mwhs-x:before{transform:rotate(-45deg)}'
    + '.mwhs-l{overflow-y:auto;overscroll-behavior:contain;padding:0 16px 16px}.mwhs-e{color:#a1a1aa;padding:18px 0;text-align:center}'
    + '.mwhs-r{display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:10px 0;border-top:1px solid rgba(255,255,255,.08)}.mwhs-r:first-child{border-top:0}'
    + '.mwhs-t{flex:none;width:52px;height:68px;border-radius:8px;background:#1a221f center/cover no-repeat;display:flex;align-items:center;justify-content:center;color:#a1a1aa}.mwhs-t svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.8}'
    + '.mwhs-i{flex:1;min-width:0}.mwhs-i b{display:block;font-weight:500;overflow-wrap:anywhere}.mwhs-i small{color:#a1a1aa;font-size:12.5px}'
    + '.mwhs-b{display:flex;gap:6px;flex:none}.mwhs-b button{min-height:40px;padding:0 14px;border-radius:10px;border:1px solid rgba(57,217,138,.55);background:rgba(57,217,138,.14);color:#39d98a;font:600 14px "IBM Plex Sans Thai",sans-serif}'
    + '.mwhs-b button[data-s]{border-color:rgba(255,255,255,.14);background:#1a221f;color:#f4f4f5;font-weight:400}.mwhs-b button.d{border-color:rgba(255,255,255,.14);background:#1a221f;color:#f4f4f5;font-weight:400}.mwhs-b button.d.arm{border-color:#f59e0b;color:#f59e0b}'
    + '.mwhs-m{width:100%;margin:0;color:#f59e0b;font-size:12.5px}'
    + '.mwhp{position:fixed;inset:0;z-index:9500;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:16px}'
    + '.mwhp-c{width:min(100%,340px);background:#131917;border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:10px;display:flex;flex-direction:column;gap:8px}'
    + '.mwhp-h{display:flex;align-items:center;gap:8px;color:#f4f4f5;font:500 14px "IBM Plex Sans Thai",sans-serif}.mwhp-h b{flex:1;min-width:0;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mwhp .mwhs-x{width:36px;height:36px}.mwhp .mwhs-x:after,.mwhp .mwhs-x:before{left:9px;top:17px}'
    + '.mwhp video{display:block;width:100%;max-height:54vh;object-fit:contain;background:#000;border-radius:10px}.mwhp .mwhs-m{padding:0 4px}';
  function ensure(){
    if(sheet) return;
    sheet = document.createElement("div"); sheet.className = "mwhs"; sheet.hidden = true;
    sheet.innerHTML = '<div class="mwhs-p" role="dialog" aria-modal="true"><div class="mwhs-h"><b id="mwhsT"></b><button class="mwhs-x" type="button" aria-label="ปิด">ปิด</button></div><div class="mwhs-l" id="mwhsL"></div></div>';
    document.body.appendChild(sheet);
    sheet.addEventListener("click", function(e){ if(e.target === sheet || e.target.closest(".mwhs-x")) close(); });
    sheet.addEventListener("click", onRow);
    MWHist.onChange(function(){ if(!sheet.hidden) render(); });
  }
  function render(){
    var list = items(cur), box = document.getElementById("mwhsL");
    box.innerHTML = list.length ? list.map(function(x){
      var th = x.kind === "studio" && x.data && x.data.clips && x.data.clips[0] && x.data.clips[0].thumb, isFile = x.kind === "file", vid = isFile && /\.(mp4|webm|mov)$/i.test(x.file.name);
      var meta = x.kind === "plan" ? "ตารางช็อต " + ((x.data && x.data.shots || []).length) + " ช็อต" + (x.data && x.data.mode === "fast" ? " · แบบ 2" : " · แบบ 1")
        : x.kind === "studio" ? ((x.data && x.data.clips || []).length) + " คลิป" : (x.file.size ? mb(x.file.size) : x.file.name.split(".").pop());
      return '<div class="mwhs-r" data-id="' + esc(x.id) + '"><div class="mwhs-t"' + (th ? ' style="background-image:url(' + th + ')"' : "") + '>' + (th ? "" : '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 3v18M16 3v18M3 8h5M3 16h5M16 8h5M16 16h5"/></svg>') + '</div>'
        + '<div class="mwhs-i"><b>' + esc(x.title || x.id) + "</b><small>" + when(x.at) + " · " + esc(meta) + (isFile ? " · วิดีโอที่ส่งออก" : "") + '</small></div>'
        + '<div class="mwhs-b"><button type="button" data-o="1">' + (isFile && !vid ? "ที่อยู่" : "เปิด") + '</button>' + (x.kind === "plan" ? '<button type="button" data-s="1">สตูดิโอ</button>' : "") + '<button type="button" class="d" data-d="1">ลบ</button></div></div>';
    }).join("") : '<p class="mwhs-e">ยังไม่มีงาน · พอทำงานเสร็จจะขึ้นที่นี่ (เก็บล่าสุด ' + MWHist.max() + ' อัน ตั้งเลขได้ที่ ตั้งค่า > ผลงานล่าสุด)</p>';
  }
  function say(row, t){ var m = row.querySelector(".mwhs-m"); if(!m){ m = document.createElement("p"); m.className = "mwhs-m"; row.appendChild(m); } m.textContent = t; }
  async function onRow(e){
    var row = e.target.closest(".mwhs-r"), b = e.target.closest("button"); if(!row || !b) return;
    var it = MWHist.get(row.dataset.id); if(!it) return;
    if(b.dataset.d){ /* ลบ = แตะสองครั้ง (ไม่พึ่งกล่องยืนยันของหน้า) · ไฟล์วิดีโอ = ลบไฟล์จริงออกจากมือถือ */
      if(!b.classList.contains("arm")){ b.classList.add("arm"); b.textContent = it.kind === "file" ? "ลบไฟล์จริง?" : "แน่ใจนะ?"; setTimeout(function(){ b.classList.remove("arm"); b.textContent = "ลบ"; }, 3000); return; }
      await MWHist.remove(it.id); render(); return;
    }
    if(it.kind !== "file"){ close(); openItem(it, b.dataset.s ? "studio" : ""); return; }
    var msg = playFile(it); if(msg) say(row, msg);
  }
  var player = null, playHook = null;
  function closePlayer(){ if(!player) return; var v = player.querySelector("video"); if(v){ v.pause(); v.removeAttribute("src"); v.load(); } player.remove(); player = null; if(window.MWBackHook === playHook) window.MWBackHook = playHook.prev; }
  function playFile(it){ /* เล่นวิดีโอที่ส่งออกแบบเต็มจอ (ปุ่มปิด + ปุ่มย้อนของมือถือ) · คืนข้อความถ้าเล่นไม่ได้ */
    if(!/\.(mp4|webm|mov)$/i.test(it.file.name) || !window.Capacitor || !Capacitor.convertFileSrc || !it.file.uri) return "ไฟล์อยู่ที่ Documents/" + it.file.rel + " (เปิดจากแอพไฟล์ของมือถือ)";
    ensure(); closePlayer();
    player = document.createElement("div"); player.className = "mwhp";
    player.innerHTML = '<div class="mwhp-c"><div class="mwhp-h"><b></b><button class="mwhs-x" type="button" aria-label="ปิด">ปิด</button></div><video controls playsinline autoplay></video><p class="mwhs-m" hidden></p></div>';
    player.querySelector("b").textContent = it.title || it.file.name;
    var v = player.querySelector("video"); v.src = Capacitor.convertFileSrc(it.file.uri);
    v.onerror = function(){ var m = player.querySelector(".mwhs-m"); m.hidden = false; m.textContent = "เล่นไฟล์นี้ไม่ได้ (ไฟล์ถูกย้ายหรือลบไปแล้ว?) · Documents/" + it.file.rel; };
    player.querySelector(".mwhs-x").addEventListener("click", closePlayer);
    player.addEventListener("click", function(e){ if(e.target === player) closePlayer(); }); /* แตะพื้นที่มืดข้างนอก = ปิด */
    document.body.appendChild(player);
    var prev = window.MWBackHook; playHook = function(){ if(player){ closePlayer(); return true; } return prev ? prev() : false; }; playHook.prev = prev; window.MWBackHook = playHook;
    return "";
  }
  function openItem(it, then){ /* เปิดงานเก่ากลับมาทำต่อ · then = "studio": ตารางตัดต่อ → ส่งเข้าสตูดิโอต่อเลย · รอเขียนฐานข้อมูลแป๊บก่อนเปลี่ยนหน้า */
    if(it.kind === "plan"){ MWStore.set("mw_footage_direct_v1", it.data); setTimeout(function(){ location.href = P + "footage.html?tab=plan&hist=1" + (then === "studio" ? "&studio=1" : ""); }, 200); }
    else if(it.kind === "studio"){ MWStore.set("mw_studio_v1", { cur:it.data }); setTimeout(function(){ if(/\/studio\.html$/.test(location.pathname)) location.reload(); else location.href = P + "studio.html"; }, 200); }
  }
  function open(k){
    ensure(); cur = k; document.getElementById("mwhsT").textContent = TOOLS[k].title + " ล่าสุด"; render(); sheet.hidden = false;
    prevHook = window.MWBackHook; window.MWBackHook = function(){ if(!sheet.hidden){ close(); return true; } return prevHook ? prevHook() : false; }; /* ปุ่มย้อนของมือถือปิดชีตก่อน */
  }
  function close(){ if(!sheet || sheet.hidden) return; sheet.hidden = true; window.MWBackHook = prevHook; }
  function badge(btn){ var n = items(btn.dataset.hist).length, i = btn.querySelector(".mwhs-n"); if(!i){ i = document.createElement("i"); i.className = "mwhs-n"; btn.appendChild(i); } i.hidden = !n; i.textContent = n > 99 ? "99+" : n; }
  function init(){
    if(!document.querySelector("[data-hist]")) return;
    var st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st); /* ฝังสไตล์ครั้งเดียว (ป้ายตัวเลข + ชีต) */
    document.querySelectorAll("[data-hist]").forEach(function(btn){
      if(!TOOLS[btn.dataset.hist]) return; btn.addEventListener("click", function(){ open(btn.dataset.hist); }); badge(btn);
      MWHist.onChange(function(){ badge(btn); }); MWHist.ready.then(function(){ badge(btn); });
    });
  }
  window.MWHistSheet = { open:open, close:close, openItem:openItem, playFile:playFile };
  if(window.MWHist) init();
})();
