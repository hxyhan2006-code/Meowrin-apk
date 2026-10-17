// exporter.js — ส่งออกคลิปแบบเร็ว (ไม่อัดเวลาจริง): ถอดรหัสเฟรมจากคลิปต้นทางทีละช็อตด้วย WebCodecs (ผ่าน mediabunny)
// วาดลง canvas เดียวกัน แล้วเข้ารหัสต่อกันเป็น mp4 · เครื่องช้า = ใช้เวลานานขึ้น แต่ผลลัพธ์เหมือนเดิมทุกครั้ง ไม่ต้องเปิดหน้าค้างให้เล่นจริง
// ใช้: const { blob, seconds, ms } = await exportShots({ shots:[{ url, start, dur }], width:1080, height:1920, fps:30, onProgress(p), onLog(text) })
// shot.cuts:false = ไม่ตรวจจุดตัดฉาก (สตูดิโอ: ผู้ใช้เลือกช่วงเอง) · ไม่ใส่ = ตรวจ แล้วไม่เล่นข้ามเข้าฉากอื่น
// url = ที่อยู่คลิป (ไฟล์ในมือถือใช้ MWLocal.fileUrl) · start/dur = วินาที · end = ไม่อ่านเลยจุดนี้ (ท้ายฉาก: ช็อตยาวกว่าฉาก = ค้างเฟรมสุดท้าย ไม่ไหลไปฉากอื่น) · ช็อตที่ไม่มี url = ค้างภาพก่อนหน้า (ภาพแรกสุดเป็นสีดำ)
// voice = Blob เสียงพากย์ (ใส่เป็นแทร็กเสียงของไฟล์) → ช็อตกำหนดเวลาด้วย `at` (วินาทีที่ช็อตเริ่มในเสียง) แทน dur: ยาวถึงช็อตถัดไป ช็อตสุดท้ายยาวถึงจบเสียง
// draw(ctx, width, height, frameCanvas, p, i) = วางภาพเอง (p = 0..1 ความคืบหน้าในช็อต, i = ลำดับช็อต — ไว้ทำภาพเคลื่อน) (ไม่ใส่ = ครอปกลางเต็มกรอบ) · codec = "auto" เลือกตัวที่เครื่องเข้ารหัสได้ (avc ก่อน เพื่อให้ CapCut อ่านได้) · คืน { blob, seconds, frames, ms, codec, audio }
const MB_URL = "./sub/vendor/mediabunny.min.js";
let mbPromise = null;
export function loadMediabunny(){ return mbPromise || (mbPromise = import(MB_URL)); }

async function decodeVoice(voice){
  const AC = window.AudioContext || window.webkitAudioContext, ac = new AC();
  try{ return await ac.decodeAudioData(await voice.arrayBuffer()); } finally { try{ ac.close(); }catch(e){} }
}

const CUT_T = 28, CUT_FPS = 20, LEAD_CUT = 0.4; /* จุดตัดฉาก: ค่าต่างเฉลี่ยของความสว่าง (0-255) ระหว่างเฟรมติดกันเกินนี้ = ตัดฉาก · ตัดในช่วง LEAD_CUT วิแรก = หัวช็อตติดฉากก่อนหน้า ขยับเริ่มไปหลังจุดตัด */
async function findCuts(mb, track, a, b){ /* ไล่ดูเฟรมจิ๋ว 32x32 ทีละ 1/CUT_FPS วิ ในช่วง a..b หาเวลาที่ภาพเปลี่ยนฉาก (ฉากที่ดัชนีจดไว้คลาดได้ ~1 วิ เพราะดูภาพทุก 1 วิ) */
  if(!(b > a + 0.1)) return [];
  const sink = new mb.CanvasSink(track, { width: 32, height: 32, fit: "fill" }), ts = [];
  for(let t = a; t <= b; t += 1 / CUT_FPS) ts.push(t);
  const c = document.createElement("canvas"); c.width = c.height = 32; const x = c.getContext("2d", { willReadFrequently: true });
  const out = []; let prev = null, k = 0;
  for await (const w of sink.canvasesAtTimestamps(ts)){
    const t = ts[k++]; if(!w) break;
    x.drawImage(w.canvas, 0, 0, 32, 32); const d = x.getImageData(0, 0, 32, 32).data, g = new Float32Array(1024);
    for(let i = 0; i < 1024; i++) g[i] = d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11;
    if(prev){ let sum = 0; for(let i = 0; i < 1024; i++) sum += Math.abs(g[i] - prev[i]); if(sum / 1024 > CUT_T) out.push(t); }
    prev = g;
  }
  return out;
}

export async function exportShots({ shots, voice, width = 1080, height = 1920, fps = 30, codec = "auto", onProgress, onLog, onShot, draw }){
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
        const sink = draw ? new mb.CanvasSink(track) : new mb.CanvasSink(track, { width, height, fit: "cover" }); /* draw = วางภาพเอง (สตูดิโอ: เต็มกรอบ + พื้นหลังเบลอ) ได้เฟรมขนาดจริงของคลิป */
        let st = s.start, last = s.end > s.start ? s.end - frameDur / 2 : Infinity;
        if(s.cuts !== false){ /* ตรวจจุดตัดฉากจริงในช่วงที่จะใช้ → ไม่เล่นข้ามเข้าฉากอื่น (ภาพแวบ/ฉากแทรก) */
          const cuts = await findCuts(mb, track, st, Math.min(last, st + n * frameDur));
          const lead = cuts.find(function(t){ return t - st < LEAD_CUT; }); if(lead != null) st = lead; /* หัวช็อตติดฉากก่อนหน้า = เริ่มหลังจุดตัด */
          const next = cuts.find(function(t){ return t > st + 0.1; }); if(next != null) last = Math.min(last, next - frameDur * 1.5); /* จะตัดเข้าฉากอื่น = ค้างเฟรมสุดท้ายของฉากนี้ */
        }
        const stamps = []; for(let k = 0; k < n; k++) stamps.push(Math.min(st + k * frameDur, last));
        let fi = 0;
        for await (const w of sink.canvasesAtTimestamps(stamps)){
          if(w){ if(draw) draw(ctx, width, height, w.canvas, n > 1 ? fi / (n - 1) : 0, i); else ctx.drawImage(w.canvas, 0, 0, width, height); got++; } /* เฟรมหาย (เลยท้ายคลิป) = ไม่วาดใหม่ ค้างภาพล่าสุด */
          fi++;
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
