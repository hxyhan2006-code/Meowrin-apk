# มาสคอตต้นแบบ: ยืนปกติ เห็นแขน+ถุงมือทั้งสองข้าง ไม่มีเอฟเฟกต์/ของประกอบ (ใช้เป็นแม่แบบทำท่า/งานใหม่) → docs/mascot-base/
# ใช้: python3 tools/mascot/base.py
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make as m
from make import *
import more
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'docs', 'mascot-base')

def arm_side(g, flip=False):
    f = (lambda x: mir(x)) if flip else (lambda x: x)
    for (x, y) in [(10, 17), (9, 18), (10, 18), (9, 19), (8, 19), (8, 20), (9, 20), (8, 21), (9, 21)]: px(g, f(x), y, 'W')
    for y in range(22, 26):  # ถุงมือขาวมนๆ มีเงาล่าง + นิ้วโป้ง
        for x in range(6, 10):
            if (y in (22, 25)) and x in (6, 9) and y == 25: continue
            px(g, f(x), y, 'G')
    for x in range(6, 10): px(g, f(x), 25, 'g')
    px(g, f(10), 23, 'G'); px(g, f(5), 23, 'G')

def base_pose(tail=True):
    g = new(); base(g, tail)
    eyes_open(g); mouth_smirk(g)
    arm_side(g); arm_side(g, flip=True)
    return finish(g)

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    g = base_pose()
    render(g, 20).save(os.path.join(OUT, 'mascot-base.png'))            # โปร่งใส 640x640
    render(g, 20, bg=(120, 190, 255, 255)).save(os.path.join(OUT, 'mascot-base-sky.png'))  # พื้นฟ้า ดูง่าย
    render(g, 5).save(os.path.join(OUT, 'mascot-base-160.png'))        # ขนาดเดียวกับ mascot/*.png
    print('ok')
