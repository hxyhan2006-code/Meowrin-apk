#!/usr/bin/env python3
"""สร้างไอคอนแอพ Android จากรูปไอคอนของแอพ (icon-512.png) ให้ตัวสร้าง APK ใช้ (.github/workflows/apk.yml)
ใช้: python3 tools/android-icons.py <โฟลเดอร์ res ของโปรเจกต์ android> <icon-512.png>
- ไอคอนปกติ/กลม (ก่อน Android 8) = รูปเต็ม / ตัดวงกลม
- ไอคอนแบบ adaptive (Android 8+) = ใช้รูปเต็มเป็นชั้นหน้า + พื้นหลังสีดำสนิท (ตัว M อยู่กลางภาพในกรอบ ~64% ที่มือถือจะครอปเหลือ ตามที่ออกแบบไว้ใน CLAUDE.md)"""
import sys, os
from PIL import Image, ImageDraw

res, src_path = sys.argv[1], sys.argv[2]
src = Image.open(src_path).convert("RGBA")
SIZES = {"mdpi": (48, 108), "hdpi": (72, 162), "xhdpi": (96, 216), "xxhdpi": (144, 324), "xxxhdpi": (192, 432)}  # (ไอคอนปกติ px, ชั้นหน้า adaptive px)

def circle(img):
    m = Image.new("L", img.size, 0); ImageDraw.Draw(m).ellipse((0, 0) + img.size, fill=255)
    out = Image.new("RGBA", img.size, (0, 0, 0, 0)); out.paste(img, (0, 0), m); return out

for d, (icon, fg) in SIZES.items():
    p = os.path.join(res, "mipmap-" + d)
    os.makedirs(p, exist_ok=True)
    a = src.resize((icon, icon), Image.LANCZOS)
    a.save(os.path.join(p, "ic_launcher.png")); circle(a).save(os.path.join(p, "ic_launcher_round.png"))
    src.resize((fg, fg), Image.LANCZOS).save(os.path.join(p, "ic_launcher_foreground.png"))

os.makedirs(os.path.join(res, "values"), exist_ok=True)
open(os.path.join(res, "values", "ic_launcher_background.xml"), "w", encoding="utf-8").write(
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#000000</color>\n</resources>\n')
print("สร้างไอคอนแล้ว", len(SIZES) * 3, "ไฟล์ + พื้นหลังสีดำ")
