// exporter.js — ส่งออกคลิปแบบเร็ว (ไม่อัดเวลาจริง): ถอดรหัสเฟรมจากคลิปต้นทางทีละช็อตด้วย WebCodecs (ผ่าน mediabunny)
// วาดลง canvas เดียวกัน แล้วเข้ารหัสต่อกันเป็น mp4 · เครื่องช้า = ใช้เวลานานขึ้น แต่ผลลัพธ์เหมือนเดิมทุกครั้ง ไม่ต้องเปิดหน้าค้างให้เล่นจริง
// ใช้: const { blob, seconds, ms } = await exportShots({ shots:[{ url, start, dur }], width:1080, height:1920, fps:30, onProgress(p), onLog(text) })
// url = ที่อยู่คลิป (ไฟล์ในมือถือใช้ MWLocal.fileUrl) · start/dur = วินาที · ตอนนี้ยังไม่มีเสียง (เพิ่มทีหลังพร้อมเสียงพากย์)
const MB_URL = "./sub/vendor/mediabunny.min.js";
let mbPromise = null;
export function loadMediabunny(){ return mbPromise || (mbPromise = import(MB_URL)); }

export async function exportShots({ shots, width = 1080, height = 1920, fps = 30, codec = "avc", onProgress, onLog }){
  const mb = await loadMediabunny(), t0 = performance.now(), log = onLog || function(){};
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  const output = new mb.Output({ format: new mb.Mp4OutputFormat(), target: new mb.BufferTarget() });
  const video = new mb.CanvasSource(canvas, { codec, quality: mb.QUALITY_HIGH });
  output.addVideoTrack(video);
  await output.start();

  const frameDur = 1 / fps, total = shots.reduce(function(a, s){ return a + Math.round(s.dur * fps); }, 0);
  let outT = 0, done = 0;
  for(let i = 0; i < shots.length; i++){
    const s = shots[i], n = Math.round(s.dur * fps), ts0 = performance.now();
    const input = new mb.Input({ source: new mb.UrlSource(s.url), formats: mb.ALL_FORMATS });
    try{
      const track = await input.getPrimaryVideoTrack();
      if(!track) throw new Error("ช็อต " + (i + 1) + ": ไม่เจอแทร็กภาพในไฟล์");
      const sink = new mb.CanvasSink(track, { width, height, fit: "cover" });
      const stamps = []; for(let k = 0; k < n; k++) stamps.push(s.start + k * frameDur);
      let got = 0, last = null;
      for await (const w of sink.canvasesAtTimestamps(stamps)){
        const c = w ? w.canvas : last; /* เฟรมหาย (เลยท้ายคลิป) = ค้างเฟรมก่อนหน้า */
        if(!c) continue; last = c; got++;
        ctx.drawImage(c, 0, 0, width, height);
        await video.add(outT, frameDur); outT += frameDur; done++;
        if(onProgress && done % 5 === 0) onProgress(done / total);
      }
      log("ช็อต " + (i + 1) + ": " + got + "/" + n + " เฟรม ใช้ " + Math.round(performance.now() - ts0) + " ms");
    } finally { try{ input.dispose(); }catch(e){} }
  }
  const tf = performance.now();
  await output.finalize();
  log("ปิดไฟล์ใช้ " + Math.round(performance.now() - tf) + " ms");
  if(onProgress) onProgress(1);
  return { blob: new Blob([output.target.buffer], { type: "video/mp4" }), seconds: outT, frames: done, ms: performance.now() - t0 };
}
