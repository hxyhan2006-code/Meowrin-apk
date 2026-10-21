# ฉากพื้นหลังพิกเซลอาร์ตของวิดเจ็ตไฟวันต่อเนื่อง · วาด 85x44 ขยาย 5 เท่า (425x220) ลง tools/android/res/drawable-nodpi/stk_bg_<ฉาก>_<อารมณ์>.png
# อารมณ์: n หม่น (ยังไม่ทำ/ไฟเพิ่งดับ) · d สว่าง (ไฟติด/ครึ่งทาง) · e เย็น-ค่ำ (ไฟจะดับ) · f น้ำแข็ง (ใช้กันไฟดับ)
# ใช้: python3 tools/widget/scenes.py   (ฉากใหม่ = ใส่ฟังก์ชัน + ชื่อใน SCENES แล้วเพิ่มชื่อใน mascot.js SCENES ให้ตรงกัน · ต้องสร้าง APK ใหม่)
import math, os, random
from PIL import Image

W, H, SC = 85, 44, 5
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'android', 'res', 'drawable-nodpi')

def hx(s): s = s.lstrip('#'); return tuple(int(s[i:i+2], 16) for i in (0, 2, 4))
def lerp(a, b, t): return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

class C:
    def __init__(s): s.g = {}; s.sky = set()
    def px(s, x, y, c, sky=False):
        if 0 <= x < W and 0 <= y < H:
            s.g[(x, y)] = hx(c) if isinstance(c, str) else c
            (s.sky.add if sky else s.sky.discard)((x, y))
    def rect(s, x0, y0, x1, y1, c, sky=False):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1): s.px(x, y, c, sky)
    def disc(s, cx, cy, r, c):
        for y in range(cy - r, cy + r + 1):
            for x in range(cx - r, cx + r + 1):
                if (x - cx) ** 2 + (y - cy) ** 2 <= r * r + r * 0.6: s.px(x, y, c)
    def tri(s, cx, top, h, half, c):  # สามเหลี่ยมหน้าจั่ว ฐานอยู่ที่ top+h
        for i in range(h + 1):
            w = int(round(half * i / max(h, 1)))
            s.rect(cx - w, top + i, cx + w, top + i, c)
    def gradient(s, y0, y1, stops):
        for y in range(y0, y1 + 1):
            t = (y - y0) / max(y1 - y0, 1); t = int(t * 7) / 7.0  # แบ่งเป็นแถบ ให้ดูเป็นพิกเซลอาร์ต
            seg = min(int(t * (len(stops) - 1)), len(stops) - 2); lt = t * (len(stops) - 1) - seg
            col = lerp(hx(stops[seg]), hx(stops[seg + 1]), min(max(lt, 0), 1))
            s.rect(0, y, W - 1, y, col, sky=True)
    def hill(s, base, amp, per, ph, c, hi=None):
        for x in range(W):
            y = base + int(round(amp * math.sin(x / per + ph)))
            s.rect(x, y, x, H - 1, c)
            if hi: s.px(x, y, hi)

SKY = {'d': ['#3f9cff', '#8fd0ff', '#d4f0ff'], 'n': ['#7d8fa3', '#a9b6c4', '#cdd6de'],
       'e': ['#4a3d86', '#d9647a', '#ffb866'], 'f': ['#8db4da', '#c8e0f4', '#f0f8ff']}

def cloud(c, x, y, w=14, col='#ffffff', sh='#dbe8f4'):
    c.rect(x + 2, y, x + w - 3, y, col); c.rect(x, y + 1, x + w - 1, y + 2, col); c.rect(x + 3, y - 1, x + w // 2, y - 1, col)
    c.rect(x + 1, y + 3, x + w - 2, y + 3, sh)

def sun(c, v, x=70, y=7):
    if v == 'd': c.disc(x, y, 3, '#ffe14d'); c.disc(x, y, 2, '#fff3a0')
    elif v == 'e': c.disc(x - 4, 28, 4, '#ffd27a'); c.disc(x - 4, 28, 3, '#fff0b0')

def sparkles(c, rnd, n, cols):
    for _ in range(n):
        c.px(rnd.randrange(W), rnd.randrange(14, 40), rnd.choice(cols))

def pine(c, cx, top, h, half, col, hi):
    tiers = 3
    for t in range(tiers):
        ty = top + t * (h // tiers - 1); th = h // tiers + 2
        for i in range(th):
            w = max(0, int(round((half * (0.55 + 0.45 * (t + 1) / tiers)) * i / th)))
            c.rect(cx - w, ty + i, cx + w, ty + i, col)
            if w > 0: c.px(cx - w, ty + i, hi)
    c.rect(cx, top + h - 1, cx, top + h + 2, '#6b4a2c')

# ---------- ฉาก ----------
def meadow(c, v, r):
    c.gradient(0, 30, SKY[v]); sun(c, v); cloud(c, 8, 12); cloud(c, 52, 6, 16)
    c.hill(27, 3, 7.0, 0.6, '#79b8a0', '#98d0b8'); c.hill(32, 2, 5.0, 2.0, '#5fbf4a', '#86dc6e')
    c.rect(0, 38, W - 1, H - 1, '#4aa83a'); c.rect(0, 41, W - 1, H - 1, '#3d9030')
    for _ in range(34):
        x, y = r.randrange(W), r.randrange(33, 43); c.px(x, y, r.choice(['#ffd84a', '#ff9ac0', '#ffffff', '#ffb36b', '#b59cff']))
    for x in range(0, W, 7): c.px(x + r.randrange(3), 40, '#2f7a26')

def forest(c, v, r):
    c.gradient(0, 30, SKY[v]); cloud(c, 60, 8, 12); c.rect(0, 31, W - 1, 36, '#2f6b66')
    for x in range(-4, W + 6, 8): pine(c, x + r.randrange(3), 17 + r.randrange(3), 16, 5, '#2f6b66', '#3f8580')
    for x in range(2, W + 6, 11): pine(c, x + r.randrange(3), 17 + r.randrange(4), 20, 6, '#2f8a4a', '#47a860')
    c.rect(0, 36, W - 1, H - 1, '#3e7a36'); c.rect(0, 40, W - 1, H - 1, '#2f6a2c')
    for _ in range(18): c.px(r.randrange(W), r.randrange(36, 43), r.choice(['#e8584a', '#fff2b0', '#6dc24a']))
    for x in (4, 80): pine(c, x, 6, 30, 8, '#256c3a', '#3a8a50')
    if v == 'd':
        for i in range(8): c.px(46 + i, 4 + i * 2, '#fff6b8'); c.px(47 + i, 4 + i * 2, '#fff6b8')

def house(c, v, r):
    c.gradient(0, 30, SKY[v]); sun(c, v, 74, 7); cloud(c, 40, 10)
    c.hill(29, 2, 6.0, 1.0, '#7cc060', '#9ad87c'); c.rect(0, 35, W - 1, H - 1, '#55b040'); c.rect(0, 41, W - 1, H - 1, '#459a34')
    c.rect(60, 25, 77, 35, '#f4e6c6'); c.rect(60, 34, 77, 35, '#d9c59a'); c.tri(68, 17, 8, 11, '#c4503a'); c.rect(58, 24, 78, 25, '#a03a28')
    c.rect(73, 17, 74, 22, '#8a5a3a'); c.rect(64, 29, 66, 35, '#8a5a3a'); c.rect(70, 28, 74, 31, '#8ec8ff'); c.rect(72, 28, 72, 31, '#ffffff'); c.rect(70, 29, 74, 29, '#ffffff')
    c.disc(47, 27, 5, '#3f9a3a'); c.disc(44, 29, 3, '#4fb04a'); c.rect(47, 31, 48, 36, '#7a5230')
    for x in range(32, 56, 4): c.rect(x, 36, x + 1, 39, '#ffffff'); c.px(x, 36, '#e8e8e8')
    c.rect(32, 37, 55, 37, '#ffffff'); c.rect(32, 39, 55, 39, '#ffffff')
    for _ in range(14): c.px(r.randrange(W), r.randrange(41, 44), r.choice(['#ff9ac0', '#ffd84a', '#ffffff']))

def room(c, v, r):  # ห้องต้นไม้ในบ้าน
    wall = '#d9e4c6' if v != 'e' else '#e8d2b0'
    c.rect(0, 0, W - 1, 33, wall); c.rect(0, 24, W - 1, 33, '#c4d3ae'); c.rect(0, 24, W - 1, 24, '#f4f0e0')
    c.rect(0, 34, W - 1, H - 1, '#b98a5a')
    for x in range(0, W, 12): c.rect(x, 34, x, H - 1, '#a67848')
    c.rect(0, 34, W - 1, 34, '#8a6038')
    c.rect(52, 5, 76, 26, '#ffffff'); c.rect(54, 7, 74, 24, '#000000')
    c.gradient(7, 24, SKY[v]) if False else None
    for y in range(7, 25):
        t = (y - 7) / 17; stops = [hx(s) for s in SKY[v]]; seg = 0 if t < .5 else 1; lt = (t - .5 * seg) * 2
        c.rect(54, y, 74, y, lerp(stops[seg], stops[seg + 1], min(lt, 1)), sky=True)
    c.rect(64, 7, 64, 24, '#ffffff'); c.rect(54, 15, 74, 15, '#ffffff'); c.rect(50, 26, 78, 27, '#e8e0cc')
    if v == 'd': c.disc(70, 11, 2, '#ffe14d')
    for (px_, py_, h_) in [(55, 20, 6), (70, 20, 5)]: pass
    # กระถางบนขอบหน้าต่าง + ต้นไม้ใหญ่ + ต้นไม้แขวน
    c.rect(56, 23, 60, 26, '#c76a3a'); c.disc(58, 21, 3, '#3f9a3a'); c.px(57, 19, '#5fc24a')
    c.rect(33, 28, 41, 38, '#c76a3a'); c.rect(33, 28, 41, 29, '#e08a4a')
    for (dx, dy) in [(-3, -3), (3, -4), (0, -7), (-6, -1), (6, -2), (0, -2)]: c.disc(37 + dx, 25 + dy, 3, '#2f8a3a'); c.px(37 + dx, 24 + dy, '#5fc24a')
    for x in (8, 22): c.rect(x, 0, x, 6, '#e8e0cc'); c.rect(x - 2, 7, x + 2, 9, '#c76a3a'); c.disc(x, 11, 3, '#3f9a3a'); c.px(x - 3, 14, '#3f9a3a'); c.px(x + 3, 15, '#3f9a3a')
    c.rect(2, 20, 20, 21, '#8a5a3a')
    for x in (4, 10, 16): c.rect(x, 17, x + 2, 19, '#c76a3a'); c.px(x + 1, 16, '#4fb04a'); c.px(x, 15, '#3f9a3a'); c.px(x + 2, 15, '#4fb04a')
    if v == 'e': c.rect(0, 0, W - 1, 33, (255, 190, 110)) if False else None

def cafe(c, v, r):
    c.rect(0, 0, W - 1, 34, '#8a5a3a');
    for y in range(0, 34, 4):
        for x in range((y // 4 % 2) * 4, W, 8): c.rect(x, y, x + 6, y + 2, '#9c6844')
    c.rect(0, 0, W - 1, 1, '#4a2e1c')
    c.rect(48, 8, 78, 26, '#5a3a22'); c.rect(50, 10, 76, 24, '#2f4a3a')
    for (x, y, w) in [(53, 13, 12), (53, 17, 18), (53, 21, 8)]: c.rect(x, y, x + w, y, '#f0f0e0')
    c.px(72, 14, '#ffd84a'); c.px(73, 14, '#ffd84a'); c.px(72, 15, '#ffd84a'); c.px(73, 15, '#ffd84a')
    c.rect(34, 12, 44, 12, '#c8a070');
    for x in (36, 39, 42): c.rect(x, 9, x + 1, 11, '#f4f0e0')
    for x in (12, 40, 66):
        c.rect(x, 0, x, 3, '#222222'); c.rect(x - 2, 4, x + 2, 7, '#ffd070'); c.rect(x - 3, 8, x + 3, 9, '#fff0b0') if False else None
        c.disc(x, 9, 4, (255, 224, 140)) if False else None
    c.rect(0, 33, W - 1, H - 1, '#c89a68'); c.rect(0, 33, W - 1, 34, '#e8c08a'); c.rect(0, 40, W - 1, H - 1, '#a87a48')
    c.rect(60, 30, 66, 33, '#f4f0e0'); c.rect(66, 31, 67, 32, '#f4f0e0'); c.rect(61, 30, 65, 30, '#6a4630')
    c.px(62, 27, '#ffffff'); c.px(63, 25, '#ffffff'); c.px(64, 27, '#ffffff')
    c.rect(72, 28, 78, 33, '#c76a3a'); c.disc(75, 25, 3, '#3f9a3a'); c.px(74, 23, '#5fc24a')

def paris(c, v, r):
    c.gradient(0, 32, SKY[v]); cloud(c, 6, 10); sun(c, v, 78, 8)
    for x in range(0, W, 9):  # หลังคาแมนซาร์ดสีฟ้าเทา + อาคารครีม
        h = 8 + (x * 7) % 5
        c.rect(x, 33 - h, x + 8, 33, '#efe0c4'); c.rect(x, 33 - h - 2, x + 8, 33 - h - 1, '#6f7f96'); c.rect(x + 2, 33 - h + 2, x + 3, 33 - h + 4, '#8a9ab0'); c.rect(x + 6, 33 - h + 2, x + 7, 33 - h + 4, '#8a9ab0')
    # หอไอเฟล (ตัวทึบเรียวขึ้นไป + ชั้นชมวิว 2 ชั้น + ช่องโค้งใต้ฐาน) อยู่ขวาสุด ไม่ทับตัวเลข
    tw, tl, cx = '#6a5650', '#9a847a', 76
    for i in range(27):
        w = 1 + int(round(6 * (i / 26) ** 2.2))
        c.rect(cx - w, 6 + i, cx + w, 6 + i, tw)
    c.rect(cx, 2, cx, 6, tw); c.rect(cx - 4, 15, cx + 4, 15, tl); c.rect(cx - 6, 23, cx + 6, 23, tl)
    for dy in range(7): c.rect(cx - 2 + dy // 3, 32 - dy, cx + 2 - dy // 3, 32 - dy, '#efe0c4')
    c.rect(0, 33, W - 1, H - 1, '#9b9aa6'); c.rect(0, 33, W - 1, 33, '#bdbcc8');
    for y in range(35, 44, 3):
        for x in range((y // 3 % 2) * 3, W, 6): c.rect(x, y, x + 3, y, '#80808e')
    c.rect(44, 18, 44, 34, '#2a2a30'); c.rect(42, 16, 46, 17, '#2a2a30'); c.disc(44, 14, 2, '#ffe9a0')
    for x in (74, 80): c.rect(x, 30, x + 3, 33, '#c0392b'); c.rect(x, 29, x + 3, 29, '#e8e8e8') if False else None

def japan(c, v, r):
    c.gradient(0, 33, SKY[v]); cloud(c, 4, 9, 12); sun(c, v, 76, 7)
    for i in range(22):  # ฟูจิ
        w = int(i * 1.5); c.rect(46 - w, 12 + i, 46 + w, 12 + i, '#5a74b0')
    for i in range(6): c.rect(46 - int(i * 1.5), 12 + i, 46 + int(i * 1.5), 12 + i, '#ffffff')
    c.rect(0, 33, W - 1, H - 1, '#7cc070'); c.rect(0, 40, W - 1, H - 1, '#68a85c')
    # โทริอิ
    rd = '#d8432e'
    c.rect(60, 18, 62, 36, rd); c.rect(74, 18, 76, 36, rd); c.rect(57, 17, 79, 19, rd); c.rect(56, 15, 80, 16, '#2a2a30'); c.rect(59, 22, 77, 23, rd)
    # ซากุระ
    c.rect(11, 20, 12, 36, '#6b4a2c')
    for (dx, dy, rr) in [(0, -4, 7), (-6, 0, 5), (6, 0, 5), (0, 3, 5)]: c.disc(12 + dx, 16 + dy, rr, '#ffb7cf'); c.disc(12 + dx - 1, 16 + dy - 1, rr - 2, '#ffd0e0')
    for _ in range(26): c.px(r.randrange(W), r.randrange(10, 43), r.choice(['#ffb7cf', '#ffd0e0', '#ffffff']))

def seaside(c, v, r):
    c.gradient(0, 22, SKY[v]); cloud(c, 10, 8); cloud(c, 50, 13, 12); sun(c, v, 74, 7)
    c.rect(0, 22, W - 1, 34, '#2f8ad0'); c.rect(0, 22, W - 1, 22, '#7cc0f0')
    for y in range(24, 34, 3):
        for x in range((y % 2) * 5, W, 10): c.rect(x, y, x + 3, y, '#7cc4f4')
    c.rect(0, 34, W - 1, H - 1, '#f0d8a0'); c.rect(0, 34, W - 1, 35, '#fff2d0'); c.rect(0, 35, W - 1, 35, '#8ad0f0')
    c.rect(0, 40, W - 1, H - 1, '#e0c488')
    c.tri(52, 15, 6, 4, '#ffffff'); c.rect(52, 21, 52, 22, '#6b4a2c'); c.rect(48, 22, 56, 23, '#8a5a3a')
    c.rect(78, 20, 79, 36, '#7a5230');
    for (dx, dy) in [(-5, 2), (-3, -1), (0, -2), (3, -1), (5, 2)]: c.rect(78 + dx, 20 + dy, 78 + dx + (1 if dx <= 0 else 0), 20 + dy + 1, '#3fa04a')
    for _ in range(10): c.px(r.randrange(W), r.randrange(37, 43), r.choice(['#ff9ac0', '#ffffff', '#ffb36b']))

SCENES = [('meadow', meadow), ('forest', forest), ('house', house), ('room', room), ('cafe', cafe), ('paris', paris), ('japan', japan), ('seaside', seaside)]

def grade(c, v):
    out = {}
    for (x, y), col in c.g.items():
        if (x, y) in c.sky or v == 'd': out[(x, y)] = col; continue
        r_, g_, b_ = col; l = int(0.3 * r_ + 0.59 * g_ + 0.11 * b_)
        if v == 'n': out[(x, y)] = tuple(int((a * 0.42 + l * 0.58) * 0.95) for a in col)
        elif v == 'e': out[(x, y)] = (min(255, int(r_ * 1.0 * 0.92 + 18)), int(g_ * 0.78 * 0.92), int(b_ * 0.62 * 0.95))
        elif v == 'f': out[(x, y)] = (min(255, int((r_ * 0.6 + l * 0.4) * 0.82 + 18)), min(255, int((g_ * 0.6 + l * 0.4) * 0.95 + 14)), min(255, int((b_ * 0.6 + l * 0.4) * 1.12 + 26)))
    return out

def render():
    os.makedirs(OUT, exist_ok=True)
    for name, fn in SCENES:
        for v in 'ndef':
            c = C(); fn(c, v, random.Random(name))
            g = grade(c, v)
            im = Image.new('RGB', (W, H), (0, 0, 0))
            for (x, y), col in g.items(): im.putpixel((x, y), col)
            im.resize((W * SC, H * SC), Image.NEAREST).save(os.path.join(OUT, f'stk_bg_{name}_{v}.png'), optimize=True)
    print(len(SCENES) * 4, 'ภาพ')

if __name__ == '__main__': render()
