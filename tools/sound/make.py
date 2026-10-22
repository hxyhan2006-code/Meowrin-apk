# เสียงแจ้งเตือนของไฟวันต่อเนื่อง (8-bit สังเคราะห์เอง ไม่มีลิขสิทธิ์) → tools/android/res/raw/stk_snd_<ชื่อ>.mp3 (apk.yml ก๊อปเข้า res/raw)
# lit ไฟติดแล้ว · 1100/1300/1630/2100 เตือนตามเวลา (ยิ่งดึกยิ่งเร่ง) · ms ไฟครบหลักไมล์   ปรับความดังให้เท่ากันด้วย ffmpeg loudnorm
# ใช้: python3 tools/sound/make.py   (ต้องมี numpy + ffmpeg · ชื่อไฟล์ต้องตรงกับ StreakCore.SOUNDS)
import os, subprocess, tempfile
import numpy as np, wave
SR = 32000
def midi(n): return 440.0 * 2 ** ((n - 69) / 12)
def sq(f, d, duty=0.5, vol=1.0, a=0.005, r=0.04, vib=0, glide=None):
    t = np.arange(int(SR * d)) / SR
    if glide is not None: fr = np.linspace(f, glide, len(t))
    else: fr = np.full(len(t), f)
    if vib: fr = fr * (1 + 0.02 * np.sin(2 * np.pi * vib * t))
    ph = np.cumsum(fr) / SR
    w = np.where((ph % 1.0) < duty, 1.0, -1.0)
    env = np.minimum(1, t / a) * np.minimum(1, (d - t) / r).clip(0, 1)
    return w * env * vol
def tri(f, d, vol=1.0, a=0.005, r=0.05):
    t = np.arange(int(SR * d)) / SR
    ph = (f * t) % 1.0; w = 2 * np.abs(2 * ph - 1) - 1
    env = np.minimum(1, t / a) * np.minimum(1, (d - t) / r).clip(0, 1)
    return w * env * vol
def noise(d, vol=1.0, r=0.05):
    t = np.arange(int(SR * d)) / SR
    return (np.random.RandomState(1).rand(len(t)) * 2 - 1) * np.minimum(1, (d - t) / r).clip(0, 1) * vol
def seq(parts, gap=0.0):
    out = []
    for p in parts: out.append(p); out.append(np.zeros(int(SR * gap)))
    return np.concatenate(out)
def mix(*ws):
    n = max(len(w) for w in ws); o = np.zeros(n)
    for w in ws: o[:len(w)] += w
    return o
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'android', 'res', 'raw')
TMP = tempfile.mkdtemp()

def save(name, w):
    w = w / max(1e-9, np.abs(w).max()) * 0.85
    w = np.concatenate([w, np.zeros(int(SR * 0.15))])
    wav = os.path.join(TMP, name + '.wav')
    with wave.open(wav, 'wb') as f:
        f.setnchannels(1); f.setsampwidth(2); f.setframerate(SR); f.writeframes((w * 32767).astype('<i2').tobytes())
    os.makedirs(OUT, exist_ok=True)
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', wav, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=7', '-ar', '32000', '-c:a', 'libmp3lame', '-q:a', '4', os.path.join(OUT, 'stk_snd_' + name + '.mp3')], check=True)

def at(w, sec): return np.concatenate([np.zeros(int(SR * sec)), w])

# lit — ไฟติดแล้ว: แฟนแฟร์ + ประกาย
f = seq([sq(midi(n), d, 0.5, 0.8) for n, d in [(67, .1), (67, .1), (67, .1), (72, .32)]] + [sq(midi(n), d, 0.5, 0.8) for n, d in [(70, .1), (72, .12), (76, .5)]], gap=0.015)
sp = seq([sq(midi(n), 0.045, 0.125, 0.5) for n in [88, 91, 95, 100, 95, 100, 103]])
save('lit', mix(f, at(sp, 1.05)))
def chord(notes, d, vol=0.6, r=0.3, vib=0): return mix(*[sq(midi(n), d, 0.5, vol, r=r, vib=vib) for n in notes])
def sparkle(start=88, notes=(0, 3, 7, 12, 7, 12, 15), d=0.045, vol=0.5): return seq([sq(midi(start + n), d, 0.125, vol) for n in notes])
def phrase(notes, vol=0.8, gap=0.015): return seq([sq(midi(n), d, 0.5, vol) for n, d in notes], gap=gap)
# 1) 11:00 เช้า — ปลุกสดใส (อาร์เปจโจขึ้น เมเจอร์ นุ่มๆ)
save('1100', mix(phrase([(72, .11), (76, .11), (79, .11), (84, .42)], 0.7), at(sparkle(96, (0, 4, 7), 0.05, 0.35), 0.5)))
# 2) 13:00 บ่าย — สะกิดเล่นๆ "ดา-ดา-ดาา" 3 ครั้ง ไต่ขึ้นทีละขั้น
parts = [phrase([(67 + k, .08), (67 + k, .08), (72 + k, .2)], 0.8) for k in (0, 2, 4)]
save('1300', seq(parts, gap=0.09))
# 3) 16:30 เย็น — เริ่มเร่ง: โน้ตรัวเร็วขึ้น โทนตึง + เบสเต้นตุบๆ
m = [(70, .07), (70, .07), (70, .07), (75, .09), (70, .07), (70, .07), (70, .07), (77, .2)]
pulse = seq([tri(midi(46), .12, 0.9, r=0.05)] * 7, gap=0.05)
save('1630', mix(phrase(m, 0.8, 0.012), pulse, at(phrase([(79, .07), (82, .07), (86, .3)], 0.8), 0.78)))
# 4) 21:00 ค่ำ — สัญญาณสุดท้าย: สลับโทนรัว + ดิ่งลงแล้วกระแทก
siren = seq([sq(midi(81), 0.07, 0.5, 0.85), sq(midi(75), 0.07, 0.5, 0.85)] * 5)
fall = sq(midi(84), 0.4, 0.5, 0.85, glide=midi(58), r=0.04)
stab = mix(chord([58, 61, 65], 0.35, 0.7, 0.25), noise(0.08, 0.5), tri(midi(34), 0.35, 0.9, r=0.2))
save('2100', seq([siren, fall, stab], gap=0.03))
# 5) หลักไมล์ (3/7/30/100 วัน) — ฉลองใหญ่: รัวกลอง + แฟนแฟร์ + เบส + ประกาย + คอร์ดค้าง
t = np.arange(int(SR * 0.5)) / SR
roll = noise(0.5, 1.0, r=0.01) * (np.sin(2 * np.pi * 18 * t) > 0) * np.linspace(0.25, 0.9, len(t))
mel = phrase([(67, .1), (67, .1), (67, .1), (72, .32), (70, .1), (72, .12), (76, .32), (79, .12), (84, .7)], 0.75)
bass = seq([tri(midi(n), d, 0.9) for n, d in [(48, .22), (48, .22), (43, .32), (45, .22), (48, .3), (52, .32)]])
fin = mix(chord([72, 76, 79, 84], 0.9, 0.5, 0.6, vib=5), tri(midi(36), 0.9, 0.9, r=0.6), noise(0.08, 0.5))
save('ms', mix(roll, at(mix(mel, bass), 0.5), at(fin, 2.0), at(sparkle(91, (0, 3, 7, 12, 7, 12, 15, 19, 15, 19, 24), 0.05, 0.5), 2.35)))
print('6 เสียง')
