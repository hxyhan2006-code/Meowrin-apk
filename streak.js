/* streak.js (window.MWStreak) — ไฟวันต่อเนื่องแบบ Duolingo: ปุ่มไฟ+ตัวเลขบนหัวแอพ (#stkBtn) แตะแล้วเปิดหน้าเต็มจอ (#stkPage)
   นับจากคลิปที่ลงจริงบนช่องของ Han ผ่าน YouTube Data API (playlist Shorts UUSH… · videoPublishedAt) ไม่มีปุ่มกดนับเอง = โกงไม่ได้
   กติกา: วันละ GOAL คลิป = ไฟติด · คลิปเกิน GOAL ทุก 2 คลิป = กันไฟดับ 1 อัน (เก็บได้ MAX_FREEZE) · วันที่ไม่ครบใช้กันไฟดับอัตโนมัติ ไม่มีเหลือ = ไฟดับเริ่มนับใหม่
   คำนวณสตรีคใหม่ทั้งหมดจากจำนวนคลิปรายวัน (days) ทุกครั้ง ไม่เก็บตัวนับที่คลาดได้ · เก็บใน MWStore key mw_streak_v1
   ข้อความแจ้งเตือน/วิดเจ็ตอยู่ใน streak-msgs.js (MWStreakMsgs) · Han วางชุดของตัวเองได้ (แถบ "ข้อความของฉัน": คำตอบจาก AI นอกแอพ หัวหมวด [11:00] [w_d] …)
   แถบ "Prompt ของฉัน" เก็บ prompt สั่ง AI ไว้ (mw_streak_prompt_v1 ข้อความล้วน บันทึกเองทุกครั้งที่พิมพ์/วาง) มี วาง/คัดลอก/ลบ
   เก็บใน mw_streak_msgs_v1 { raw ข้อความที่วาง, pools หมวดที่แยกได้, at } · หมวดที่ไม่ได้วางใช้ของเดิม · ลบทั้งหมด = กลับไปใช้ชุดเริ่มต้น
   { handle, chId, title, list, since:"YYYY-MM-DD" วันเริ่มนับ, days:{ "YYYY-MM-DD": จำนวนคลิป }, syncedAt, sprint: เวลาเริ่มจับ 10 นาที, cheered: วันที่ฉลองไฟติดแล้ว }
   notif: { on, times:["HH:MM"] } แจ้งเตือน (ส่งเฉพาะวันที่ยังไม่ครบ)
   วิดเจ็ต/แจ้งเตือนอยู่ฝั่งเนทีฟ (ปลั๊กอิน Streak ใน APK · ซอร์ส tools/android/) — ที่นี่ส่ง base (สตรีคถึงเมื่อวาน) + กันไฟดับ + ยอดวันนี้ + ข้อความไปให้ (sync)
   APK เก่าไม่มีปลั๊กอิน = บอกตรงๆ ในหน้านี้ว่าต้องลง APK ใหม่
   วันตัดตามเวลาในมือถือ (ไทย) · โหลดหลัง app.js (ใช้ MW.toast/MW.esc) */
(function(){
  "use strict";
  var KEY = "mw_streak_v1", GOAL = 2, BONUS_PER_FREEZE = 2, MAX_FREEZE = 2, START_FREEZE = 1;
  var SPRINT_MS = 10 * 60e3, AUTO_MS = 15e3, MAX_PAGES = 20;
  var MILESTONES = [3, 7, 14, 30, 50, 100, 150, 200, 365, 500, 730, 1000];
  var WTEST = [["z", "ยังไม่ได้ทำ"], ["h", "ทำไปครึ่งทาง"], ["d", "ไฟติดแล้ว"], ["b", "ทำเกินโควตา"], ["e", "ค่ำ ไฟจะดับ"], ["r", "ไฟเพิ่งดับ"], ["f", "เมื่อวานใช้กันไฟดับ"], ["m", "ไฟครบหลักไมล์"]], wtI = 0; /* ปุ่ม ทดสอบวิดเจ็ต วนทีละสถานการณ์ */
  var TIMES = ["11:00", "13:00", "16:30", "21:00"];
  var WD = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
  var MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
  var btn = document.getElementById("stkBtn"), page = document.getElementById("stkPage");
  var st = MWStore.get(KEY, null) || {};
  var busy = false, err = "", tick = 0, view = null, prevHook = null, nst = null, sent = "", nOpen = false; /* nOpen = แถบ วิดเจ็ต+แจ้งเตือน เปิดอยู่ไหม (วาดหน้าใหม่แล้วไม่หุบเอง) */
  /* ค่าที่เก็บไว้ผิดรูป (ไม่ใช่ { raw, pools:{หมวด:[ข้อความ]} }) = ทิ้งส่วนที่เสีย ไม่ให้หน้าไฟพังทั้งหน้า */
  function cleanMy(v){
    if(!v || typeof v !== "object" || !v.pools || typeof v.pools !== "object") return null;
    var pools = {};
    Object.keys(v.pools).forEach(function(k){ var a = Array.isArray(v.pools[k]) ? v.pools[k].filter(function(t){ return typeof t === "string" && t.trim(); }) : []; if(a.length) pools[k] = a; });
    return Object.keys(pools).length ? { raw: typeof v.raw === "string" ? v.raw : "", pools: pools, at: v.at || 0 } : null;
  }
  var MKEY = "mw_streak_msgs_v1", my = cleanMy(MWStore.get(MKEY, null)), draft = my ? my.raw : "", mOpen = false, mMsg = "", mErr = false;
  var PKEY = "mw_streak_prompt_v1", pr = String(MWStore.get(PKEY, "") || ""), pOpen = false;
  /* คัดลอก: clipboard เขียนได้ในแอพ · ไม่ได้ = เปิดกล่องให้ก๊อปเอง (MWDialog.copy) */
  async function copyOut(t, what){
    if(!t){ MW.toast(what + "ว่างอยู่ ไม่มีอะไรให้คัดลอก", true); return; }
    try{ await navigator.clipboard.writeText(t); MW.toast("คัดลอก" + what + "แล้ว"); }catch(e){ await MWDialog.copy(t); }
  }
  function msgs(){ return Object.assign({}, window.MWStreakMsgs || {}, my ? my.pools : {}); } /* ชุดของ Han ทับเฉพาะหมวดที่วาง (cleanMy รับประกันว่าเป็นอาร์เรย์ไม่ว่าง) */
  function vis(t){ return t.replace(/\{streak\}/g, "000").replace(/\{\w+\}/g, "0").replace(/[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/g, "").length; } /* ความยาวที่มองเห็น ไม่นับสระบน/ล่าง วรรณยุกต์ */
  /* แยกคำตอบจาก AI: บรรทัด [หมวด] = หัว (มี ** ครอบได้) · บรรทัดถัดไป = ข้อความ (ตัดเลขข้อ/ขีด/จุด/เครื่องหมายคำพูดออก) · หัวที่ไม่รู้จัก = ข้ามทั้งหมวด */
  function parseMsgs(raw){
    var known = Object.keys(window.MWStreakMsgs || {}), pools = {}, cur = null, unknown = [], n = 0, long = 0;
    String(raw || "").split(/\r?\n/).forEach(function(line){
      var t = line.trim(); if(!t) return;
      var h = /^[*#\s]*\[\s*([^\]]+?)\s*\][*\s]*$/.exec(t);
      if(h){ var k = known.filter(function(x){ return x.toLowerCase() === h[1].toLowerCase(); })[0]; cur = k || null; if(!k && unknown.indexOf(h[1]) < 0) unknown.push(h[1]); return; }
      if(!cur) return;
      t = t.replace(/^(\d+[.)]\s*|[-*•]\s*)/, "").replace(/^["“'](.*)["”']$/, "$1").trim();
      if(!t) return;
      var a = pools[cur] || (pools[cur] = []);
      if(a.indexOf(t) >= 0) return;
      a.push(t); n++; if(vis(t) > (/^w_/.test(cur) ? 16 : 36)) long++;
    });
    return { pools: pools, n: n, cats: Object.keys(pools).length, unknown: unknown, long: long };
  }
  function plugin(){ return window.MWNative && MWNative.plug ? MWNative.plug("Streak") : null; }
  function notif(){ return st.notif || { on: true, times: TIMES.slice() }; }

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
    return { streak: streak, best: best, freeze: freeze, bonus: bonus, today: t, done: done, lastFrozen: lastFrozen, marks: marks, broke: marks[addDay(today, -1)] === "miss" };
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

  /* เช็กเองทุกครั้งที่เปิดแอพ/กลับเข้าแอพ/เปิดหน้านี้ (ห่างกันน้อยกว่า AUTO_MS = ข้าม กันยิงซ้ำตอนสลับแอพรัวๆ) → ยอดวันนี้เปลี่ยน = ส่งให้วิดเจ็ตอัปเดตเองใน render/pushNative ไม่ต้องกดปุ่มเช็ก */
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
      st = { handle: h, chId: it.id, title: it.snippet.title, list: list, since: dayKey(Date.now()), days: {}, syncedAt: 0, sprint: 0, cheered: "", notif: st.notif };
      save(); busy = false;
      await check(true);
      if(notif().on) askNotify(); /* Android 13+ ถามสิทธิ์แจ้งเตือนครั้งแรก */
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

  /* ส่งค่าให้วิดเจ็ต/แจ้งเตือนฝั่งเนทีฟ (เฉพาะตอนค่าเปลี่ยน) · base = สตรีคถึงเมื่อวาน (เนทีฟบวก 1 เองเมื่อวันนี้ครบ) */
  function pushNative(s, today){
    var P = plugin(); if(!P || !P.sync) return;
    var n = notif(), arg = { key: st.list ? MWSync.getKey() : "", list: st.list || "", goal: GOAL, base: s ? (s.done ? s.streak - 1 : s.streak) : 0,
      freeze: s ? s.freeze : 0, today: s ? s.today : 0, day: today, notify: !!n.on, times: n.on ? n.times : [], msgs: msgs(), poses: MWMascot.POOLS, scenes: MWMascot.SCENES, broke: s && s.broke ? today : "", froze: s && !s.done && s.lastFrozen === addDay(today, -1) ? today : "" };
    var k = JSON.stringify(arg); if(k === sent) return; sent = k;
    P.sync(arg).then(function(r){ nst = r; if(page && !page.hidden) render(); }).catch(function(){ sent = ""; });
  }
  function refreshStatus(){ var P = plugin(); if(P && P.status) P.status().then(function(r){ nst = r; render(); }).catch(function(){}); }

  /* แถบพับได้แบบเดียวกับตั้งค่า (details.fold.top) · ป้ายสถานะโชว์เฉพาะตอนมีเรื่องให้ดูแล (สิทธิ์/แบต/ต้องลง APK ใหม่) */
  function notifBox(){
    var P = plugin(), n = notif(), tag, kind = "warn", body = "";
    if(!P){ tag = "ต้องลง APK ใหม่"; body = '<p class="hint tip">ต้องลง APK ใหม่ (สร้างหลัง v8.98) ถึงจะมีวิดเจ็ตบนหน้าจอหลักและแจ้งเตือนเรียกตัว · GitHub → Actions → build-apk → Run workflow</p>'; }
    else {
      var needPerm = nst && n.on && !nst.notify, needBat = nst && !nst.battery;
      tag = needPerm ? "ยังไม่อนุญาตแจ้งเตือน" : needBat ? "แบตจำกัดอยู่" : n.on ? "เปิดอยู่" : "ปิดอยู่"; kind = needPerm || needBat ? "warn" : "idle";
      body = '<label class="stk-sw"><input type="checkbox" data-stk="on"' + (n.on ? " checked" : "") + '> แจ้งเตือนเมื่อวันนี้ยังทำงานไม่ครบ</label>';
      if(n.on) body += '<div class="stk-times">' + TIMES.map(function(t){ return '<button type="button" class="stk-chip' + (n.times.indexOf(t) >= 0 ? " on" : "") + '" data-stk="time" data-t="' + t + '">' + t + '</button>'; }).join("") + '</div>';
      if(needPerm) body += '<div class="stk-warn">' + MWIcon("warn") + '<span>ยังไม่ได้อนุญาตแจ้งเตือน</span><button class="btn small" data-stk="perm">อนุญาต</button></div>';
      if(needBat) body += '<div class="stk-warn">' + MWIcon("warn") + '<span>แอพถูกจำกัดแบต แจ้งเตือน/วิดเจ็ตอาจไม่อัปเดต · ตั้งค่าแอพ → แบตเตอรี่ → ไม่จำกัด/อนุญาตทำงานเบื้องหลัง</span><button class="btn small ghost" data-stk="settings">เปิด</button></div>';
      body += '<div class="row stk-act">' + (nst && nst.widgets ? '<span class="stk-ok">' + MWIcon("check") + 'มีวิดเจ็ตบนหน้าจอแล้ว</span>' : '<button class="btn ghost" data-stk="pin">เพิ่มวิดเจ็ตบนหน้าจอ</button>') + '</div>'
        + '<div class="row stk-act"><button class="btn ghost" data-stk="test">ทดสอบแจ้งเตือน</button><button class="btn ghost" data-stk="wtest">ทดสอบวิดเจ็ต</button></div>'
        + '<p class="hint tip">มือถือเช็กยอดวันนี้เองทุก 30 นาที (10:00–23:30) แม้ไม่ได้เปิดแอพ · ทำครบแล้วแจ้งเตือนที่เหลือของวันนั้นเงียบเอง · ข้อความสุ่มไม่ซ้ำ</p>';
    }
    return '<details class="fold top stk-fold" id="stkNotif"' + (nOpen ? " open" : "") + '><summary><span>วิดเจ็ต + แจ้งเตือน</span><em class="state ' + kind + '">' + tag + '</em></summary><div class="fbody">' + body + '</div></details>';
  }

  function myBox(){
    var cnt = 0; if(my) Object.keys(my.pools).forEach(function(k){ cnt += my.pools[k].length; });
    return '<details class="fold top stk-fold" id="stkMsgs"' + (mOpen ? " open" : "") + '><summary><span>ข้อความของฉัน</span><em class="state idle">' + (my ? "ชุดของคุณ" : "") + '</em></summary><div class="fbody">'
      + '<p class="hint tip">วางคำตอบจาก AI (ที่มีหัวหมวด [11:00] [any] [w_d] …) แล้วกด ใช้ข้อความนี้ · หมวดที่ไม่ได้วางใช้ของเดิม · ลบทั้งหมด = กลับไปใช้ชุดเริ่มต้นของแอพ</p>'
      + '<textarea data-stk="mtext" rows="8" spellcheck="false" placeholder="[11:00]&#10;ข้อความ&#10;ข้อความ&#10;[w_d]&#10;ข้อความ" aria-label="ข้อความของฉัน">' + MW.esc(draft) + '</textarea>'
      + '<div class="row stk-act"><button type="button" class="btn ghost" data-stk="mpaste">วาง</button><button type="button" class="btn ghost" data-stk="mcopy">คัดลอก</button><button type="button" class="btn ghost" data-stk="mclear">ลบทั้งหมด</button></div>'
      + '<button type="button" class="btn stk-wide" data-stk="msave">ใช้ข้อความนี้</button>'
      + (mMsg ? '<div class="msg' + (mErr ? " err" : "") + '">' + MW.esc(mMsg) + '</div>' : "")
      + '<p class="hint">ตอนนี้ใช้: ' + (my ? "ชุดของคุณ " + Object.keys(my.pools).length + " หมวด · " + cnt + " ข้อความ (หมวดอื่นใช้ของเดิม)" : "ชุดเริ่มต้นของแอพ") + '</p></div></details>';
  }

  function promptBox(){
    return '<details class="fold top stk-fold" id="stkPrompt"' + (pOpen ? " open" : "") + '><summary><span>Prompt ของฉัน</span><em class="state idle"></em></summary><div class="fbody">'
      + '<p class="hint tip">เก็บ prompt ที่ใช้สั่ง AI เจนข้อความไว้ที่นี่ กลัวหาย · บันทึกเองทุกครั้งที่พิมพ์หรือวาง · ไม่ส่งไปไหน เก็บในเครื่อง</p>'
      + '<textarea data-stk="ptext" rows="8" spellcheck="false" placeholder="วาง prompt ของคุณตรงนี้" aria-label="Prompt ของฉัน">' + MW.esc(pr) + '</textarea>'
      + '<div class="row stk-act"><button type="button" class="btn ghost" data-stk="ppaste">วาง</button><button type="button" class="btn ghost" data-stk="pcopy">คัดลอก</button><button type="button" class="btn ghost" data-stk="pclear">ลบ</button></div>'
      + '<p class="hint">' + (pr ? "บันทึกอยู่ " + pr.length + " ตัวอักษร" : "ยังไม่มี prompt") + '</p></div></details>';
  }

  /* ท่ามาสคอตตามสถานการณ์ — ลำดับเดียวกับ StreakCore.poseKey ฝั่งเนทีฟ · ท่าเปลี่ยนทุกครึ่งชั่วโมง (สูตรเดียวกับวิดเจ็ต) + แตะมาสคอตเพื่อดูท่าถัดไป */
  var mTap = 0;
  function poseKey(s, today){
    if(s.done) return MILESTONES.indexOf(s.streak) >= 0 ? "m" : s.today > GOAL ? "b" : "d";
    if(s.lastFrozen === addDay(today, -1)) return "f";
    if(s.broke) return "r";
    return new Date().getHours() >= 19 && s.streak > 0 ? "e" : s.today >= 1 ? "h" : "z";
  }
  function mascotBtn(s, today){
    var d = new Date(), name = s ? MWMascot.pick(poseKey(s, today), today, d.getHours() * 2 + (d.getMinutes() >= 30 ? 1 : 0), mTap) : "peace";
    return '<button type="button" class="stk-mascot" data-stk="mascot" aria-label="เปลี่ยนท่ามาสคอต"><img src="' + MWMascot.src(name) + '" alt="" width="112" height="112"></button>';
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
      page.innerHTML = head + '<div class="stk-hero"><div><b class="big">0</b><span>วันต่อเนื่อง</span></div>' + mascotBtn(null, today) + '</div>'
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
      + '<small>ดีสุด ' + s.best + ' วัน · เดือนนี้ลง ' + month + ' คลิป</small></div>' + mascotBtn(s, today) + '</div>'
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
      + notifBox() + myBox() + promptBox()
      + '<div class="stk-foot">' + esc(st.handle) + ' · ' + (busy ? "กำลังเช็ก..." : st.syncedAt ? "เช็กล่าสุด " + ago(st.syncedAt) : "ยังไม่ได้เช็ก") + '<button type="button" class="stk-link" data-stk="change">เปลี่ยนช่อง</button></div>';
  }

  function render(){
    var today = dayKey(Date.now()), s = st.list ? calc(st, today) : null;
    if(st.sprint && sprintLeft() <= 0){ st.sprint = 0; save(); MW.toast("ครบ 10 นาทีแล้ว! ไปต่ออีกนิดไหม"); }
    if(s && s.done && st.cheered !== today){ st.cheered = today; save(); MW.toast("ไฟติดแล้ว! วันที่ " + s.streak, false, 3500); if(btn){ btn.classList.add("cheer"); } }
    renderBtn(s); pushNative(s, today);
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
    page.hidden = false; document.body.classList.add("stk-open"); page.scrollTop = 0; render(); check(false); refreshStatus();
    prevHook = window.MWBackHook; window.MWBackHook = function(){ if(!page.hidden){ close(); return true; } return prevHook ? prevHook() : false; }; /* ปุ่มย้อนของมือถือปิดหน้านี้ก่อน */
  }
  function askNotify(){ var P = plugin(); if(P && P.requestNotify) P.requestNotify().then(function(r){ nst = r; render(); if(r && !r.notify) MW.toast("ยังไม่ได้อนุญาต เปิดเองได้ที่ ตั้งค่าแอพ → การแจ้งเตือน", true, 4000); }).catch(function(){}); }
  function close(){ if(page.hidden) return; page.hidden = true; document.body.classList.remove("stk-open"); window.MWBackHook = prevHook; render(); }

  if(btn && page){
    btn.addEventListener("click", open);
    btn.addEventListener("animationend", function(){ btn.classList.remove("cheer"); });
    page.addEventListener("click", async function(e){
      var b = e.target.closest("[data-stk]"); if(!b) return;
      var a = b.dataset.stk;
      if(a === "close") close();
      else if(a === "mascot"){ mTap++; render(); }
      else if(a === "setup") setup(page.querySelector('[data-stk="handle"]').value);
      else if(a === "refresh") check(true);
      else if(a === "sprint"){ st.sprint = Date.now(); save(); render(); }
      else if(a === "stop"){ st.sprint = 0; save(); render(); }
      else if(a === "on"){ var n = notif(); n.on = b.checked; st.notif = n; save(); render(); if(n.on && nst && !nst.notify) askNotify(); }
      else if(a === "time"){ var n2 = notif(), t = b.dataset.t, i = n2.times.indexOf(t); if(i >= 0) n2.times.splice(i, 1); else n2.times = TIMES.filter(function(x){ return x === t || n2.times.indexOf(x) >= 0; }); st.notif = n2; save(); render(); }
      else if(a === "perm") askNotify();
      else if(a === "settings") plugin().openSettings();
      else if(a === "pin") plugin().pinWidget().then(function(r){ if(!r || !r.ok) MW.toast("เพิ่มจากแอพไม่ได้ กดค้างที่หน้าจอหลัก → วิดเจ็ต → Meowrin App", true, 4500); else setTimeout(refreshStatus, 4000); });
      else if(a === "mpaste"){
        try{ var t = await navigator.clipboard.readText(); if(!t){ MW.toast("คลิปบอร์ดว่างอยู่", true); return; } draft = t; mMsg = ""; render(); }
        catch(e2){ MW.toast("ปุ่มวางใช้ไม่ได้ในเครื่องนี้ กดค้างในช่องแล้วเลือก วาง แทน", true, 4000); }
      }
      else if(a === "mcopy") copyOut(draft, "ข้อความ");
      else if(a === "ppaste"){
        var pt; try{ pt = await navigator.clipboard.readText(); }catch(e3){ MW.toast("ปุ่มวางใช้ไม่ได้ในเครื่องนี้ กดค้างในช่องแล้วเลือก วาง แทน", true, 4000); return; }
        if(!pt){ MW.toast("คลิปบอร์ดว่างอยู่", true); return; }
        if(pr && pr !== pt && !await MWDialog.confirm("แทนที่ prompt เดิมด้วยที่เพิ่งวางไหม?")) return; /* ไม่ทับ prompt ที่เก็บไว้เงียบๆ */
        pr = pt; MWStore.set(PKEY, pr); render();
      }
      else if(a === "pcopy") copyOut(pr, " prompt".trim());
      else if(a === "pclear") MW.confirmTap(b, "ลบ", function(){ pr = ""; MWStore.del(PKEY); render(); });
      else if(a === "mclear") MW.confirmTap(b, "ลบทั้งหมด", function(){ draft = ""; my = null; MWStore.del(MKEY); mMsg = "ลบแล้ว กลับไปใช้ชุดเริ่มต้นของแอพ"; mErr = false; render(); });
      else if(a === "msave"){
        var r = parseMsgs(draft);
        if(!r.n){ mMsg = "ไม่เจอข้อความใต้หัวหมวดที่รู้จัก เช่น [11:00] [any] [w_d] · เช็กว่าวางครบทั้งคำตอบ" + (r.unknown.length ? " · หัวที่ไม่รู้จัก: " + r.unknown.join(", ") : "") + " · ข้อความเดิมยังใช้อยู่"; mErr = true; render(); return; }
        my = { raw: draft, pools: r.pools, at: Date.now() }; MWStore.set(MKEY, my);
        mMsg = "ใช้แล้ว " + r.cats + " หมวด " + r.n + " ข้อความ" + (r.long ? " · ยาวเกิน " + r.long + " อัน (บนจอจะถูกตัดด้วย …)" : "") + (r.unknown.length ? " · ข้ามหัวที่ไม่รู้จัก: " + r.unknown.join(", ") : "");
        mErr = false; render();
      }
      else if(a === "wtest"){
        var P = plugin();
        if(nst && !nst.widgets){ MW.toast("ยังไม่มีวิดเจ็ตบนหน้าจอหลัก กดเพิ่มวิดเจ็ตก่อน", true, 3500); return; }
        if(!P.testWidget){ MW.toast("ต้องลง APK ใหม่ (สร้างหลัง v9.00) ถึงจะทดสอบวิดเจ็ตได้", true, 4000); return; }
        var st1 = WTEST[wtI++ % WTEST.length];
        P.testWidget({ state: st1[0] }).then(function(r){ if(r && r.widgets === 0){ MW.toast("ยังไม่มีวิดเจ็ตบนหน้าจอหลัก กดเพิ่มวิดเจ็ตก่อน", true, 3500); return; } MW.toast("วิดเจ็ตโชว์ตัวอย่าง \"" + st1[1] + "\" · กดโฮมไปดู ค้าง 20 วินาที · กดอีกทีเพื่อดูแบบถัดไป", false, 4500); }).catch(function(){ MW.toast("ทดสอบวิดเจ็ตไม่ได้", true); });
      }
      else if(a === "test"){ if(nst && !nst.notify){ askNotify(); return; } plugin().test({ slot: "any" }); }
      else if(a === "prev" || a === "next"){ var d = new Date(view.y, view.m + (a === "next" ? 1 : -1), 1); view = { y: d.getFullYear(), m: d.getMonth() }; render(); }
      else if(a === "change"){
        if(!await MWDialog.confirm("เปลี่ยนช่อง = เริ่มนับไฟวันต่อเนื่องใหม่ตั้งแต่วันนี้ ตกลงไหม?")) return;
        st = { notif: st.notif }; err = ""; save(); render();
      }
    });
    page.addEventListener("toggle", function(e){ if(e.target.id === "stkNotif") nOpen = e.target.open; if(e.target.id === "stkMsgs") mOpen = e.target.open; if(e.target.id === "stkPrompt") pOpen = e.target.open; }, true); /* toggle ไม่ลอยขึ้น ต้องดักตอนจับ */
    page.addEventListener("input", function(e){ var k = e.target.dataset.stk; if(k === "mtext") draft = e.target.value; if(k === "ptext"){ pr = e.target.value; if(pr) MWStore.set(PKEY, pr); else MWStore.del(PKEY); var h = page.querySelector("#stkPrompt .fbody > .hint:last-child"); if(h) h.textContent = pr ? "บันทึกอยู่ " + pr.length + " ตัวอักษร" : "ยังไม่มี prompt"; } }); /* จำที่พิมพ์/วางไว้ วาดหน้าใหม่แล้วไม่หาย */
    page.addEventListener("keydown", function(e){ if(e.key === "Enter" && e.target.dataset.stk === "handle") setup(e.target.value); });
    document.addEventListener("visibilitychange", function(){ if(!document.hidden){ render(); check(false); if(!page.hidden) refreshStatus(); } }); /* กลับจากหน้าตั้งค่าแอพ = อ่านสิทธิ์ใหม่ */ /* กลับจาก CapCut/YouTube = เช็กยอดวันนี้ใหม่ (เว้น 3 นาที) */
    render(); check(false);
    /* แตะวิดเจ็ต/แจ้งเตือน = เปิดหน้าวันต่อเนื่อง (เปิดแอพใหม่ = consumeOpen · แอพเปิดค้างอยู่ = event open) */
    var P0 = plugin();
    function takeOpen(){ if(P0 && P0.consumeOpen) P0.consumeOpen().then(function(r){ if(r && r.open && page.hidden) open(); }).catch(function(){}); } /* อ่านแล้วล้าง = ไม่เปิดซ้ำตอนโหลดหน้าใหม่ */
    if(P0 && P0.addListener) P0.addListener("open", takeOpen);
    takeOpen(); document.addEventListener("visibilitychange", function(){ if(!document.hidden) takeOpen(); });
  }

  window.MWStreak = { calc: calc, check: check, open: open, GOAL: GOAL };
})();
