/* mascot.js (window.MWMascot) — มาสคอตแมวสามสี meowrin (พิกเซลอาร์ต 21 ท่า ภาพอยู่ mascot/<ท่า>.png · สร้างจาก tools/mascot/render.py)
   POOLS = ชุดท่าของแต่ละสถานการณ์ไฟวันต่อเนื่อง (streak.js ส่งชุดนี้ให้วิดเจ็ตเนทีฟตอน sync = แก้ผ่าน OTA ได้ ท่าต้องมีภาพใน APK ที่ห่อมาด้วย)
     z ยังไม่ได้ทำ · h ครึ่งทาง · d ไฟติดแล้ว · b เกินโควตา · m ไฟครบหลักไมล์ · e ค่ำไฟจะดับ · r ไฟเพิ่งดับ · f เมื่อวานใช้กันไฟดับ
   SCENES = ชื่อฉากพื้นหลังวิดเจ็ต (เพิ่มฉากใหม่ = เพิ่มภาพใน scenes.py + ชื่อที่นี่ + สร้าง APK ใหม่)
   pick: เลือกท่าคงที่ตลอดครึ่งชั่วโมง ไม่ซ้ำครึ่งชั่วโมงก่อนหน้า — สูตรเดียวกับ StreakCore.poseName ฝั่งเนทีฟเป๊ะ (วิดเจ็ตกับหน้าไฟในแอพโชว์ท่าเดียวกัน) */
(function(){
  "use strict";
  var POOLS = {
    z: ["sleepy", "phone", "coffee", "shrug", "music"],
    h: ["one", "work", "fish", "wink", "wave"],
    d: ["cheer", "cool", "love", "peace", "music", "fish"],
    b: ["crown", "torch", "cheer", "cool", "love", "wink"],
    m: ["crown", "torch", "cheer"],
    e: ["panic", "angry", "dizzy", "work"],
    r: ["cry", "dizzy", "shrug"],
    f: ["frozen"]
  };
  /* ฉากพื้นหลังวิดเจ็ต (ภาพ tools/android/res/drawable-nodpi/stk_bg_<ฉาก>_<n|d|e|f>.png จาก tools/widget/scenes.py ห่อใน APK · เนทีฟสลับทุก 3 ชั่วโมง) */
  var SCENES = ["meadow", "forest", "house", "room", "cafe", "paris", "japan", "seaside"];
  function hash(s){ var h = 0; for(var i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0; return h; } /* = String.hashCode ของ Java */
  function slot(len, day, half, key){ return ((hash(day + "|" + half + "|" + key) % len) + len) % len; }
  function pick(key, day, half, bump){
    var a = POOLS[key] || POOLS.d, n = a.length, i = slot(n, day, half, key);
    if(n > 1 && i === slot(n, day, half - 1, key)) i = (i + 1) % n;
    return a[(i + (bump || 0)) % n];
  }
  function src(name){ return "mascot/" + name + ".png?v=" + (window.MW_VERSION || ""); }
  window.MWMascot = { POOLS: POOLS, SCENES: SCENES, pick: pick, src: src };
})();
