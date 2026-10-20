/* streak.js (window.MWStreak) — ไฟวันต่อเนื่องแบบ Duolingo: ปุ่มไฟ+ตัวเลขบนหัวแอพ (#stkBtn) แตะแล้วเปิดหน้าเต็มจอ (#stkPage)
   นับจากคลิปที่ลงจริงบนช่องของ Han ผ่าน YouTube Data API (playlist Shorts UUSH… · videoPublishedAt) ไม่มีปุ่มกดนับเอง = โกงไม่ได้
   กติกา: วันละ GOAL คลิป = ไฟติด · คลิปเกิน GOAL ทุก 2 คลิป = กันไฟดับ 1 อัน (เก็บได้ MAX_FREEZE) · วันที่ไม่ครบใช้กันไฟดับอัตโนมัติ ไม่มีเหลือ = ไฟดับเริ่มนับใหม่
   คำนวณสตรีคใหม่ทั้งหมดจากจำนวนคลิปรายวัน (days) ทุกครั้ง ไม่เก็บตัวนับที่คลาดได้ · เก็บใน MWStore key mw_streak_v1
   { handle, chId, title, list, since:"YYYY-MM-DD" วันเริ่มนับ, days:{ "YYYY-MM-DD": จำนวนคลิป }, syncedAt, sprint: เวลาเริ่มจับ 10 นาที, cheered: วันที่ฉลองไฟติดแล้ว }
   วันตัดตามเวลาในมือถือ (ไทย) · โหลดหลัง app.js (ใช้ MW.toast/MW.esc) */
(function(){
  "use strict";
  var KEY = "mw_streak_v1", GOAL = 2, BONUS_PER_FREEZE = 2, MAX_FREEZE = 2, START_FREEZE = 1;
  var SPRINT_MS = 10 * 60e3, AUTO_MS = 3 * 60e3, MAX_PAGES = 20;
  var MILESTONES = [3, 7, 14, 30, 50, 100, 150, 200, 365, 500, 730, 1000];
  var WD = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
  var MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
  var btn = document.getElementById("stkBtn"), page = document.getElementById("stkPage");
  var st = MWStore.get(KEY, null) || {};
  var busy = false, err = "", tick = 0, view = null, prevHook = null;

  function save(){ MWStore.set(KEY, st); }
  function pad(n){ return (n < 10 ? "0" : "") + n; }
  function dayKey(t){ var d = new Date(t); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function addDay(k, n){ var p = k.split("-"), d = new Date(+p[0], p[1] - 1, +p[2] + n); return dayKey(d.getTime()); }

  /* สตรีคจากจำนวนคลิปรายวัน: เดินตั้งแต่วันเริ่มนับถึงเมื่อวาน แล้วดูวันนี้แยก (วันนี้ยังไม่ครบ ≠ ไฟดับ ยังมีเวลาถึงเที่ยงคืน)
     marks = สถานะรายวันสำหรับปฏิทิน: lit ไฟติด · frz ใช้กันไฟดับ · miss ไฟดับ */
  function calc(s, today){
    var days = s.days || {}, streak = 0, best = 0, freeze = START_FREEZE, bonus = 0, lastFrozen = "", marks = {};
    function earn(n){ bonus += n - GOAL; while(bonus >= BONUS_PER_FREEZE){ bonus -= BONUS_PER_FREEZE; if(freeze < MAX_FREEZE) freeze++; } if(freeze >= MAX_FREEZE) bonus = 0; }
    for(var k = s.since; k && k < today; k = addDay(k, 1)){
      var n = days[k] || 0;
      if(n >= GOAL){ streak++; earn(n); marks[k] = "lit"; }
      else if(freeze > 0){ freeze--; lastFrozen = k; marks[k] = "frz"; }
      else { streak = 0; marks[k] = "miss"; }
      if(streak > best) best = streak;
    }
    var t = days[today] || 0, done = t >= GOAL;
    if(done){ streak++; earn(t); if(streak > best) best = streak; marks[today] = "lit"; }
    return { streak: streak, best: best, freeze: freeze, bonus: bonus, today: t, done: done, lastFrozen: lastFrozen, marks: marks };
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
  function clock(ms){ return Math.floor(ms / 60e3) + ":" + pad(Math.floor(ms / 1000) % 60); }

  /* ปฏิทินเดือน: วันไฟติดต่อกันเป็นแถบส้ม (โค้งหัวท้ายแถบในแต่ละสัปดาห์) · ใช้กันไฟดับ = วงฟ้า · วันนี้ = วงขอบ */
  function calendar(s, today){
    var y = view.y, m = view.m, first = new Date(y, m, 1).getDay(), n = new Date(y, m + 1, 0).getDate();
    var cells = WD.map(function(w){ return '<b class="wd">' + w + '</b>'; }).join("");
    for(var i = 0; i < first; i++) cells += '<span></span>';
    for(var d = 1; d <= n; d++){
      var k = y + "-" + pad(m + 1) + "-" + pad(d), mk = s.marks[k], col = (first + d - 1) % 7, c = ["day"];
      if(mk) c.push(mk);
      if(mk === "lit"){
        if(col === 0 || d === 1 || s.marks[addDay(k, -1)] !== "lit") c.push("l");
        if(col === 6 || d === n || s.marks[addDay(k, 1)] !== "lit") c.push("r");
      }
      if(k === today) c.push("now");
      if(k > today || (st.since && k < st.since)) c.push("off");
      var cnt = (st.days || {})[k];
      cells += '<span class="' + c.join(" ") + '"><i>' + d + '</i>' + (cnt && k >= st.since ? '<small>' + cnt + '</small>' : "") + '</span>';
    }
    var min = st.since ? st.since.slice(0, 7) : "", cur = y + "-" + pad(m + 1), max = today.slice(0, 7);
    return '<div class="stk-cal"><div class="stk-calh"><button class="btn small ghost" data-stk="prev" aria-label="เดือนก่อน"' + (cur <= min ? " disabled" : "") + '>' + MWIcon("back") + '</button>'
      + '<b>' + MONTHS[m] + ' ' + y + '</b><button class="btn small ghost" data-stk="next" aria-label="เดือนถัดไป"' + (cur >= max ? " disabled" : "") + '>' + MWIcon("fwd") + '</button></div>'
      + '<div class="stk-grid">' + cells + '</div>'
      + '<div class="stk-legend"><span class="lit">ไฟติด</span><span class="frz">ใช้กันไฟดับ</span><small>ตัวเลขเล็ก = คลิปที่ลงวันนั้น</small></div></div>';
  }

  function milestone(n){
    var next = MILESTONES.filter(function(x){ return x > n; })[0] || Math.ceil((n + 1) / 500) * 500;
    var prev = MILESTONES.filter(function(x){ return x <= n; }).pop() || 0, f = (n - prev) / (next - prev);
    return '<div class="stk-box"><h3>เป้าหมายถัดไป</h3><div class="stk-ms"><span class="pin on">' + prev + '</span><div class="bar"><i style="width:' + Math.round(f * 100) + '%"></i></div><span class="pin">' + next + '</span></div>'
      + '<small>' + n + '/' + next + ' วัน · อีก ' + (next - n) + ' วัน</small></div>';
  }

  function renderBtn(s){
    if(!btn) return;
    btn.classList.toggle("lit", !!(s && s.done));
    btn.innerHTML = MWIcon("flame") + (s ? '<b>' + s.streak + '</b>' : "");
    btn.setAttribute("aria-label", s ? "ไฟวันต่อเนื่อง " + s.streak + " วัน" + (s.done ? " วันนี้ไฟติดแล้ว" : " วันนี้ยังไม่ติด") : "ตั้งไฟวันต่อเนื่อง");
  }

  function renderPage(s, today){
    var esc = MW.esc, head = '<div class="stk-head"><button class="btn small ghost" data-stk="close" aria-label="ปิด">' + MWIcon("x") + '</button><b>วันต่อเนื่อง</b><span></span></div>';
    if(!s){
      page.innerHTML = head + '<div class="stk-hero"><div><b class="big">0</b><span>วันต่อเนื่อง</span></div><span class="stk-fire">' + MWIcon("flame") + '</span></div>'
        + '<div class="stk-box"><h3>เริ่มนับไฟ</h3><p class="hint tip">ใส่ช่องของคุณ แอพจะนับคลิปที่ลงจริงบน YouTube · ลงครบวันละ ' + GOAL + ' คลิป = ไฟติด · กดนับเองไม่ได้</p>'
        + '<div class="row"><input data-stk="handle" placeholder="@meowrin" autocapitalize="none" autocomplete="off" aria-label="ช่องของคุณ">'
        + '<button class="btn" data-stk="setup"' + (busy ? " disabled" : "") + '>' + (busy ? "กำลังหา..." : "เริ่มนับ") + '</button></div>'
        + (err ? '<div class="msg err">' + esc(err) + '</div>' : "") + '</div>';
      return;
    }
    var left = sprintLeft(), need = GOAL - s.today, hrs = 24 - new Date().getHours();
    var line = s.done ? (s.today > GOAL ? "ไฟติดแล้ว! โบนัส +" + (s.today - GOAL) + " คลิป" : "ไฟติดแล้ววันนี้ ทำเกินได้โบนัสกันไฟดับ")
      : "วันนี้ลงแล้ว " + s.today + "/" + GOAL + " · อีก " + need + " คลิปไฟติด" + (hrs <= 12 ? " · เหลือ " + hrs + " ชม." : "");
    var push = s.done ? "เก่งมาก ไฟวันนี้ติดแล้ว พรุ่งนี้มาต่อกัน" : s.today ? "อีกนิดเดียว ลงอีก " + need + " คลิปไฟก็ติด" : "วันนี้ยังไม่ได้ลง เริ่มแค่ 10 นาทีก่อนก็พอ";
    var snow = ""; for(var i = 0; i < MAX_FREEZE; i++) snow += '<span class="stk-snow' + (i < s.freeze ? " on" : "") + '">' + MWIcon("snow") + '</span>';
    var month = 0, pre = today.slice(0, 7); Object.keys(st.days || {}).forEach(function(k){ if(k.slice(0, 7) === pre && k >= st.since) month += st.days[k]; });
    page.innerHTML = head
      + '<div class="stk-hero' + (s.done ? " lit" : "") + '"><div><b class="big">' + s.streak + '</b><span>วันต่อเนื่อง!</span>'
      + '<small>ดีสุด ' + s.best + ' วัน · เดือนนี้ลง ' + month + ' คลิป</small></div><span class="stk-fire">' + MWIcon("flame") + '</span></div>'
      + '<div class="stk-box stk-today"><div class="stk-trow"><div class="stk-goal">' + ring(s.today) + '<span>' + s.today + '/' + GOAL + '</span></div>'
      + '<div><b>' + esc(push) + '</b><small>' + esc(line) + '</small></div></div>'
      + (s.lastFrozen === addDay(today, -1) ? '<div class="stk-note">' + MWIcon("snow") + 'เมื่อวานใช้กันไฟดับไป 1 อัน ไฟยังไม่ดับ</div>' : "")
      + '<div class="row stk-act">' + (st.sprint
          ? '<button class="btn ghost" data-stk="stop">' + MWIcon("clock") + '<span data-stk="left">' + clock(left) + '</span>&nbsp;· หยุด</button><a class="btn" href="footage.html">เปิดอัลบั้ม</a>'
          : '<button class="btn" data-stk="sprint">' + MWIcon("play") + 'เริ่ม 10 นาที</button>')
      + '<button class="btn ghost sq" data-stk="refresh" aria-label="เช็กคลิปที่ลงวันนี้"' + (busy ? " disabled" : "") + '>' + MWIcon("repeat") + '</button></div>'
      + (err ? '<div class="msg err">' + esc(err) + '</div>' : "") + '</div>'
      + '<h2 class="stk-h2">ปฏิทินวันต่อเนื่อง</h2>' + calendar(s, today)
      + milestone(s.streak)
      + '<div class="stk-box"><h3>กันไฟดับ ' + s.freeze + '/' + MAX_FREEZE + '</h3><div class="stk-frz">' + snow + '</div>'
      + '<p class="hint tip">วันที่ลงไม่ครบ ' + GOAL + ' คลิป แอพใช้กันไฟดับให้เอง ไฟไม่ดับ · ได้เพิ่มจากการลงเกินวันละ ' + GOAL + ' คลิป ทุก ' + BONUS_PER_FREEZE + ' คลิป = 1 อัน'
      + (s.freeze < MAX_FREEZE ? ' · อีก ' + (BONUS_PER_FREEZE - s.bonus) + ' คลิปได้อันต่อไป' : ' · เต็มแล้ว') + '</p></div>'
      + '<div class="stk-foot">' + esc(st.handle) + ' · ' + (busy ? "กำลังเช็ก..." : st.syncedAt ? "เช็กล่าสุด " + ago(st.syncedAt) : "ยังไม่ได้เช็ก") + '<button type="button" class="stk-link" data-stk="change">เปลี่ยนช่อง</button></div>';
  }

  function render(){
    var today = dayKey(Date.now()), s = st.list ? calc(st, today) : null;
    if(st.sprint && sprintLeft() <= 0){ st.sprint = 0; save(); MW.toast("ครบ 10 นาทีแล้ว! ไปต่ออีกนิดไหม"); }
    if(s && s.done && st.cheered !== today){ st.cheered = today; save(); MW.toast("ไฟติดแล้ว! วันที่ " + s.streak, false, 3500); if(btn){ btn.classList.add("cheer"); } }
    renderBtn(s);
    clearInterval(tick); tick = 0;
    if(!page || page.hidden) return;
    var y = page.scrollTop; renderPage(s, today); page.scrollTop = y;
    if(st.sprint) tick = setInterval(function(){
      var el = page.querySelector('[data-stk="left"]'), l = sprintLeft();
      if(l <= 0 || !el){ render(); return; }
      el.textContent = clock(l);
    }, 1000);
  }

  function open(){
    var d = new Date(); view = { y: d.getFullYear(), m: d.getMonth() };
    page.hidden = false; document.body.classList.add("stk-open"); page.scrollTop = 0; render(); check(false);
    prevHook = window.MWBackHook; window.MWBackHook = function(){ if(!page.hidden){ close(); return true; } return prevHook ? prevHook() : false; }; /* ปุ่มย้อนของมือถือปิดหน้านี้ก่อน */
  }
  function close(){ if(page.hidden) return; page.hidden = true; document.body.classList.remove("stk-open"); window.MWBackHook = prevHook; render(); }

  if(btn && page){
    btn.addEventListener("click", open);
    btn.addEventListener("animationend", function(){ btn.classList.remove("cheer"); });
    page.addEventListener("click", async function(e){
      var b = e.target.closest("[data-stk]"); if(!b) return;
      var a = b.dataset.stk;
      if(a === "close") close();
      else if(a === "setup") setup(page.querySelector('[data-stk="handle"]').value);
      else if(a === "refresh") check(true);
      else if(a === "sprint"){ st.sprint = Date.now(); save(); render(); }
      else if(a === "stop"){ st.sprint = 0; save(); render(); }
      else if(a === "prev" || a === "next"){ var d = new Date(view.y, view.m + (a === "next" ? 1 : -1), 1); view = { y: d.getFullYear(), m: d.getMonth() }; render(); }
      else if(a === "change"){
        if(!await MWDialog.confirm("เปลี่ยนช่อง = เริ่มนับไฟวันต่อเนื่องใหม่ตั้งแต่วันนี้ ตกลงไหม?")) return;
        st = {}; err = ""; save(); render();
      }
    });
    page.addEventListener("keydown", function(e){ if(e.key === "Enter" && e.target.dataset.stk === "handle") setup(e.target.value); });
    document.addEventListener("visibilitychange", function(){ if(!document.hidden){ render(); check(false); } }); /* กลับจาก CapCut/YouTube = เช็กยอดวันนี้ใหม่ (เว้น 3 นาที) */
    render(); check(false);
  }

  window.MWStreak = { calc: calc, check: check, open: open, GOAL: GOAL };
})();
