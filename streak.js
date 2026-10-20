/* streak.js (window.MWStreak) — ไฟวันต่อเนื่องแบบ Duolingo บนหน้าคลิป (#stkCard)
   นับจากคลิปที่ลงจริงบนช่องของ Han ผ่าน YouTube Data API (playlist Shorts UUSH… · videoPublishedAt) ไม่มีปุ่มกดนับเอง = โกงไม่ได้
   กติกา: วันละ GOAL คลิป = ไฟติด · คลิปเกิน GOAL ทุก 2 คลิป = กันไฟดับ 1 อัน (เก็บได้ MAX_FREEZE) · วันที่ไม่ครบใช้กันไฟดับอัตโนมัติ ไม่มีเหลือ = ไฟดับเริ่มนับใหม่
   คำนวณสตรีคใหม่ทั้งหมดจากจำนวนคลิปรายวัน (days) ทุกครั้ง ไม่เก็บตัวนับที่คลาดได้ · เก็บใน MWStore key mw_streak_v1
   { handle, chId, title, list, since:"YYYY-MM-DD" วันเริ่มนับ, days:{ "YYYY-MM-DD": จำนวนคลิป }, syncedAt, sprint: เวลาเริ่มจับ 10 นาที, cheered: วันที่ฉลองไฟติดแล้ว }
   วันตัดตามเวลาในมือถือ (ไทย) · โหลดหลัง app.js (ใช้ MW.toast) */
(function(){
  "use strict";
  var KEY = "mw_streak_v1", GOAL = 2, BONUS_PER_FREEZE = 2, MAX_FREEZE = 2, START_FREEZE = 1;
  var SPRINT_MS = 10 * 60e3, AUTO_MS = 3 * 60e3, MAX_PAGES = 20;
  var card = document.getElementById("stkCard");
  var st = MWStore.get(KEY, null) || {};
  var busy = false, err = "", tick = 0;

  function save(){ MWStore.set(KEY, st); }
  function pad(n){ return (n < 10 ? "0" : "") + n; }
  function dayKey(t){ var d = new Date(t); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function addDay(k, n){ var p = k.split("-"), d = new Date(+p[0], p[1] - 1, +p[2] + n); return dayKey(d.getTime()); }

  /* สตรีคจากจำนวนคลิปรายวัน: เดินตั้งแต่วันเริ่มนับถึงเมื่อวาน แล้วดูวันนี้แยก (วันนี้ยังไม่ครบ ≠ ไฟดับ ยังมีเวลาถึงเที่ยงคืน) */
  function calc(s, today){
    var days = s.days || {}, streak = 0, best = 0, freeze = START_FREEZE, bonus = 0, lastFrozen = "";
    function earn(n){ bonus += n - GOAL; while(bonus >= BONUS_PER_FREEZE){ bonus -= BONUS_PER_FREEZE; if(freeze < MAX_FREEZE) freeze++; } if(freeze >= MAX_FREEZE) bonus = 0; }
    for(var k = s.since; k && k < today; k = addDay(k, 1)){
      var n = days[k] || 0;
      if(n >= GOAL){ streak++; earn(n); }
      else if(freeze > 0){ freeze--; lastFrozen = k; }
      else streak = 0;
      if(streak > best) best = streak;
    }
    var t = days[today] || 0, done = t >= GOAL;
    if(done){ streak++; earn(t); if(streak > best) best = streak; }
    return { streak: streak, best: best, freeze: freeze, bonus: bonus, today: t, done: done, lastFrozen: lastFrozen };
  }

  /* ดึงจำนวนคลิปรายวันจาก playlist ของช่อง: ไล่จากใหม่ไปเก่าจนเลยวันที่ต้องดู (เช็กครั้งก่อนลบ 2 วัน เผื่อคลิปถูกลบ/ตั้งเวลาลง) */
  async function fetchDays(){
    var from = st.syncedAt ? addDay(dayKey(st.syncedAt), -2) : st.since;
    if(from < st.since) from = st.since;
    var counts = {}, token = "", oldest = "", oldPages = 0, pages = 0, seen = 0;
    for(;;){
      var p = { part: "contentDetails", playlistId: st.list, maxResults: 50 }; if(token) p.pageToken = token;
      var r = await MWSync.yt("playlistItems", p), fresh = 0;
      (r.items || []).forEach(function(it){
        var at = it.contentDetails && it.contentDetails.videoPublishedAt; if(!at) return; /* คลิปที่ลบ/ตั้งเป็นส่วนตัวไม่มีเวลาลง */
        var k = dayKey(at); seen++; if(!oldest || k < oldest) oldest = k;
        if(k < from) return;
        fresh++; counts[k] = (counts[k] || 0) + 1;
      });
      token = r.nextPageToken; pages++;
      /* playlist เรียงตามวันอัปโหลด ไม่ใช่วันลง: คลิปตั้งเวลาลงล่วงหน้าอยู่ลึกกว่าคลิปเก่าได้ → หยุดเมื่อเจอหน้าที่เก่าทั้งหน้า 2 หน้าติด ไม่ใช่คลิปเก่าคลิปแรก */
      oldPages = fresh ? 0 : oldPages + 1;
      if(oldPages >= 2 || !token) break;
      if(pages >= MAX_PAGES){ if(!oldest) return; from = addDay(oldest, 1); break; } /* ดูไม่ถึง: วันเก่าสุดที่เห็นอาจนับไม่ครบ → ไม่ทับของเดิมตั้งแต่วันนั้นลงไป */
    }
    if(!seen && Object.keys(st.days || {}).some(function(k){ return k >= from; })) throw new Error("YouTube ไม่ส่งรายการคลิปมา ลองใหม่อีกที"); /* ได้ว่างเปล่าผิดปกติ → ไม่ลบยอดที่นับไว้แล้ว */
    var days = st.days || {};
    Object.keys(days).forEach(function(k){ if(k >= from) delete days[k]; });
    Object.keys(counts).forEach(function(k){ if(k >= from) days[k] = counts[k]; });
    st.days = days; st.syncedAt = Date.now();
  }

  async function check(manual){
    if(busy || !st.list) return;
    if(!manual && st.syncedAt && Date.now() - st.syncedAt < AUTO_MS) return;
    if(!MWSync.getKey()){ err = "ยังไม่ได้ใส่ YouTube API key (ตั้งค่า → คีย์ API)"; render(); return; }
    busy = true; err = ""; render();
    try{ await fetchDays(); save(); }
    catch(e){ err = "เช็ก YouTube ไม่ได้: " + e.message; }
    busy = false; render();
  }

  async function setup(input){
    var h = String(input || "").trim().replace(/^https?:\/\/(www\.)?youtube\.com\//, "").replace(/\/.*$/, "");
    if(!h) return;
    if(h[0] !== "@") h = "@" + h;
    if(!MWSync.getKey()){ err = "ใส่ YouTube API key ในตั้งค่าก่อน"; render(); return; }
    busy = true; err = ""; render();
    try{
      var r = await MWSync.yt("channels", { part: "snippet,contentDetails", forHandle: h });
      var it = r.items && r.items[0];
      if(!it) throw new Error("ไม่เจอช่อง " + h + " เช็กตัวสะกด");
      var list = "UUSH" + it.id.slice(2); /* playlist Shorts ล้วนของช่อง · ไม่มี (ช่องใหม่มาก) ถอยไปใช้อัปโหลดทั้งหมด */
      try{ var t = await MWSync.yt("playlistItems", { part: "contentDetails", playlistId: list, maxResults: 1 }); if(!(t.items || []).length) throw 0; }
      catch(e2){ if(e2 && MWSync.fatal(e2)) throw e2; list = it.contentDetails.relatedPlaylists.uploads; }
      st = { handle: h, chId: it.id, title: it.snippet.title, list: list, since: dayKey(Date.now()), days: {}, syncedAt: 0, sprint: 0, cheered: "" };
      save(); busy = false;
      await check(true);
    }catch(e){ err = e.message; busy = false; render(); }
  }

  function ring(n){
    var r = 19, c = 2 * Math.PI * r, f = Math.min(n / GOAL, 1);
    return '<svg class="stk-ring" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="' + r + '" class="bg"/>'
      + '<circle cx="24" cy="24" r="' + r + '" class="fg" stroke-dasharray="' + (c * f).toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 24 24)"/></svg>';
  }
  function ago(t){ var m = Math.round((Date.now() - t) / 60e3); return m < 1 ? "เมื่อกี้" : m < 60 ? m + " นาทีก่อน" : Math.round(m / 60) + " ชม.ก่อน"; }
  function sprintLeft(){ return st.sprint ? SPRINT_MS - (Date.now() - st.sprint) : 0; }

  function render(){
    if(!card) return;
    var esc = MW.esc;
    if(!st.list){
      card.innerHTML = '<div class="stk-top"><span class="stk-fire">' + MWIcon("flame") + '</span><b class="stk-title">ไฟวันต่อเนื่อง</b></div>'
        + '<p class="hint tip">ใส่ช่องของคุณ แอพจะนับคลิปที่ลงจริงบน YouTube · ลงครบวันละ ' + GOAL + ' คลิป = ไฟติด</p>'
        + '<div class="row"><input data-stk="handle" placeholder="@meowrin" autocapitalize="none" autocomplete="off" aria-label="ช่องของคุณ">'
        + '<button class="btn" data-stk="setup"' + (busy ? " disabled" : "") + '>' + (busy ? "กำลังหา..." : "เริ่มนับ") + '</button></div>'
        + (err ? '<div class="msg err">' + esc(err) + '</div>' : "");
      return;
    }
    var today = dayKey(Date.now()), s = calc(st, today), left = sprintLeft();
    if(st.sprint && left <= 0){ st.sprint = 0; save(); MW.toast("ครบ 10 นาทีแล้ว! ไปต่ออีกนิดไหม"); }
    if(s.done && st.cheered !== today){ st.cheered = today; save(); MW.toast("ไฟติดแล้ว! วันที่ " + s.streak, false, 3500); card.classList.add("cheer"); }
    var need = GOAL - s.today, hrs = 24 - new Date().getHours();
    var line = s.done ? (s.today > GOAL ? "ไฟติดแล้ว · โบนัส +" + (s.today - GOAL) + " คลิป" : "ไฟติดแล้ววันนี้ · ทำเกินได้โบนัสกันไฟดับ")
      : "วันนี้ลงแล้ว " + s.today + "/" + GOAL + " · อีก " + need + " คลิปไฟติด" + (hrs <= 12 ? " · เหลือ " + hrs + " ชม." : "");
    var frozeNote = s.lastFrozen === addDay(today, -1) ? '<div class="stk-note">เมื่อวานใช้กันไฟดับไป 1 อัน ไฟยังไม่ดับ</div>' : "";
    var snow = ""; for(var i = 0; i < MAX_FREEZE; i++) snow += '<span class="stk-snow' + (i < s.freeze ? " on" : "") + '">' + MWIcon("snow") + '</span>';
    var m = Math.floor(left / 60e3), sec = Math.floor(left / 1000) % 60;
    card.classList.toggle("lit", s.done);
    card.innerHTML = '<div class="stk-top"><span class="stk-fire">' + MWIcon("flame") + '</span>'
      + '<div class="stk-num"><b>' + s.streak + '</b><small>วันติด' + (s.best > s.streak ? " · ดีสุด " + s.best : "") + '</small></div>'
      + '<div class="stk-goal">' + ring(s.today) + '<span>' + s.today + '/' + GOAL + '</span></div></div>'
      + '<div class="stk-line">' + esc(line) + '</div>' + frozeNote
      + '<div class="stk-frz">' + snow + '<small>กันไฟดับ ' + s.freeze + '/' + MAX_FREEZE + (s.freeze < MAX_FREEZE ? " · ทำเกินอีก " + (BONUS_PER_FREEZE - s.bonus) + " คลิปได้เพิ่ม" : "") + '</small></div>'
      + '<div class="row stk-act">' + (st.sprint
          ? '<button class="btn ghost" data-stk="stop">' + MWIcon("clock") + '<span data-stk="left">' + m + ':' + pad(sec) + '</span>&nbsp;· หยุด</button><a class="btn" href="footage.html">เปิดอัลบั้ม</a>'
          : '<button class="btn" data-stk="sprint">' + MWIcon("play") + 'เริ่ม 10 นาที</button>')
      + '<button class="btn ghost sq" data-stk="refresh" aria-label="เช็กคลิปที่ลงวันนี้"' + (busy ? " disabled" : "") + '>' + MWIcon("repeat") + '</button></div>'
      + (err ? '<div class="msg err">' + esc(err) + '</div>' : "")
      + '<div class="stk-foot">' + esc(st.handle) + ' · ' + (busy ? "กำลังเช็ก..." : st.syncedAt ? "เช็กล่าสุด " + ago(st.syncedAt) : "ยังไม่ได้เช็ก") + '<button type="button" class="stk-link" data-stk="change">เปลี่ยนช่อง</button></div>';
    clearInterval(tick); tick = 0;
    if(st.sprint) tick = setInterval(function(){
      var el = card.querySelector('[data-stk="left"]'), l = sprintLeft();
      if(l <= 0 || !el){ render(); return; }
      el.textContent = Math.floor(l / 60e3) + ":" + pad(Math.floor(l / 1000) % 60);
    }, 1000);
  }

  if(card){
    card.addEventListener("click", async function(e){
      var b = e.target.closest("[data-stk]"); if(!b) return;
      var a = b.dataset.stk;
      if(a === "setup") setup(card.querySelector('[data-stk="handle"]').value);
      else if(a === "refresh") check(true);
      else if(a === "sprint"){ st.sprint = Date.now(); save(); render(); }
      else if(a === "stop"){ st.sprint = 0; save(); render(); }
      else if(a === "change"){
        if(!await MWDialog.confirm("เปลี่ยนช่อง = เริ่มนับไฟวันต่อเนื่องใหม่ตั้งแต่วันนี้ ตกลงไหม?")) return;
        st = {}; err = ""; save(); render();
      }
    });
    card.addEventListener("keydown", function(e){ if(e.key === "Enter" && e.target.dataset.stk === "handle") setup(e.target.value); });
    card.addEventListener("animationend", function(){ card.classList.remove("cheer"); });
    document.addEventListener("visibilitychange", function(){ if(!document.hidden){ render(); check(false); } }); /* กลับจาก CapCut/YouTube = เช็กยอดวันนี้ใหม่ (เว้น 3 นาที) */
    render(); check(false);
  }

  window.MWStreak = { calc: calc, check: check, GOAL: GOAL };
})();
