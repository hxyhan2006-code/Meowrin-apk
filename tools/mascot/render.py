# สร้างภาพมาสคอตแมว meowrin (พิกเซลอาร์ต 32x32 ขยาย 5 เท่า = 160px โปร่งใส) ลง mascot/<ท่า>.png
# ใช้: python3 tools/mascot/render.py   (แก้ท่าใน make.py/more.py แล้วรันใหม่ · แก้แล้วต้อง bump-version)
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make as m, more
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'mascot')
os.makedirs(out, exist_ok=True)
for n, k in more.ALL:
    g = m.pose(n) if k is None else more.p(n)
    m.render(g, 5).save(os.path.join(out, n + '.png'))
print(len(more.ALL), 'ท่า')
