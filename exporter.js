// exporter.js — ส่งออกคลิปแบบเร็ว (ไม่อัดเวลาจริง): ถอดรหัสเฟรมจากคลิปต้นทางทีละช็อตด้วย WebCodecs (ผ่าน mediabunny)
// วาดลง canvas เดียวกัน แล้วเข้ารหัสต่อกันเป็น mp4 · เครื่องช้า = ใช้เวลานานขึ้น แต่ผลลัพธ์เหมือนเดิมทุกครั้ง ไม่ต้องเปิดหน้าค้างให้เล่นจริง
// ใช้: const { blob, seconds, ms } = await exportShots({ shots:[{ url, start, dur }], width:1080, height:1920, fps:30, onProgress(p), onLog(text) })
// url = ที่อยู่คลิป (ไฟล์ในมือถือใช้ MWLocal.fileUrl) · start/dur = วินาที · ช็อตที่ไม่มี url = ค้างภาพก่อนหน้า (ภาพแรกสุดเป็นสีดำ)
// voice = Blob เสียงพากย์ (ใส่เป็นแทร็กเสียงของไฟล์) → ช็อตกำหนดเวลาด้วย `at` (วินาทีที่ช็อตเริ่มในเสียง) แทน dur: ยาวถึงช็อตถัดไป ช็อตสุดท้ายยาวถึงจบเสียง
// codec = "auto" เลือกตัวที่เครื่องเข้ารหัสได้ (avc ก่อน เพื่อให้ CapCut อ่านได้) · คืน { blob, seconds, frames, ms, codec, audio }
const MB_URL = "./sub/vendor/mediabunny.min.js";
let mbPromise = null;
export function loadMediabunny(){ return mbPromise || (mbPromise = import(MB_URL)); }

async function decodeVoice(voice){
  const AC = window.AudioContext || window.webkitAudioContext, ac = new AC();
  try{ return await ac.decodeAudioData(await voice.arrayBuffer()); } finally { try{ ac.close(); }catch(e){} }
}

export async function exportShots({ shots, voice, width = 1080, height = 1920, fps = 30, codec = "auto", onProgress, onLog, onShot }){
  const mb = await loadMediabunny(), t0 = performance.now(), log = onLog || function(){};
  const buf = voice ? await decodeVoice(voice) : null;
  if(codec === "auto"){
    codec = await mb.getFirstEncodableVideoCodec(["avc", "vp9", "av1"], { width, height });
    if(!codec) throw new Error("เครื่องนี้เข้ารหัสวิดีโอไม่ได้");
  }
  const durs = shots.map(function(s, i){ return s.at != null ? Math.max(0.05, (i + 1 < shots.length ? shots[i + 1].at : buf ? buf.duration : s.at + (s.dur || 1)) - s.at) : s.dur; });
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false }); ctx.fillStyle = "#000"; ctx.fillRect(0, 0, width, height);
  const output = new mb.Output({ format: new mb.Mp4OutputFormat(), target: new mb.BufferTarget() });
  const video = new mb.CanvasSource(canvas, { codec, quality: mb.QUALITY_HIGH });
  output.addVideoTrack(video);
  let audio = null, audioCodec = null;
  if(buf){
    audioCodec = await mb.getFirstEncodableAudioCodec(["aac", "opus"], { numberOfChannels: buf.numberOfChannels, sampleRate: buf.sampleRate });
    if(!audioCodec) throw new Error("เครื่องนี้เข้ารหัสเสียงไม่ได้");
    audio = new mb.AudioBufferSource({ codec: audioCodec, bitrate: 128000 }); output.addAudioTrack(audio);
  }
  await output.start();
  if(audio) await audio.add(buf);

  const frameDur = 1 / fps, total = Math.round(durs.reduce(function(a, d){ return a + d; }, 0) * fps);
  let cum = 0, frames = 0;
  for(let i = 0; i < shots.length; i++){
    const s = shots[i]; cum += durs[i];
    const n = Math.max(1, Math.round(cum * fps) - frames), ts0 = performance.now(); /* นับเฟรมสะสม ไม่ให้เวลาเพี้ยนจากเสียงทีละช็อต */
    if(onShot) onShot(i, s);
    let got = 0;
    if(s.url){
      const input = new mb.Input({ source: new mb.UrlSource(s.url), formats: mb.ALL_FORMATS });
      try{
        const track = await input.getPrimaryVideoTrack();
        if(!track) throw new Error("ช็อต " + (i + 1) + ": ไม่เจอแทร็กภาพในไฟล์");
        const sink = new mb.CanvasSink(track, { width, height, fit: "cover" });
        const stamps = []; for(let k = 0; k < n; k++) stamps.push(s.start + k * frameDur);
        for await (const w of sink.canvasesAtTimestamps(stamps)){
          if(w){ ctx.drawImage(w.canvas, 0, 0, width, height); got++; } /* เฟรมหาย (เลยท้ายคลิป) = ไม่วาดใหม่ ค้างภาพล่าสุด */
          await video.add(frames * frameDur, frameDur); frames++;
          if(onProgress && frames % 5 === 0) onProgress(frames / total);
        }
      } finally { try{ input.dispose(); }catch(e){} }
    }
    while(frames < Math.round(cum * fps)){ await video.add(frames * frameDur, frameDur); frames++; } /* ช็อตไม่มีภาพ/เฟรมขาด = ค้างภาพ */
    log("ช็อต " + (i + 1) + ": " + got + "/" + n + " เฟรม ใช้ " + Math.round(performance.now() - ts0) + " ms");
  }
  const tf = performance.now();
  await output.finalize();
  log("ปิดไฟล์ใช้ " + Math.round(performance.now() - tf) + " ms");
  if(onProgress) onProgress(1);
  return { blob: new Blob([output.target.buffer], { type: "video/mp4" }), seconds: frames * frameDur, frames, ms: performance.now() - t0, codec, audio: audioCodec, durs };
}
