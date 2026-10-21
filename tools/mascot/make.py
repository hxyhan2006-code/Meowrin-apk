from PIL import Image, ImageDraw
import sys, os
OUT = os.path.dirname(os.path.abspath(__file__))
W = H = 32
C = dict(K=(43,29,20), O=(232,146,52), D=(178,100,28), B=(84,58,42), W=(250,242,225), S=(228,214,190),
         P=(226,120,130), Y=(248,240,170), G=(236,246,255), g=(176,206,232), F1=(255,120,30), F2=(255,205,60),
         F3=(255,245,170), I=(150,215,255), I2=(225,245,255), Q=(255,255,255), R=(255,90,90), Z=(90,150,255))

def new(): return {}
def px(g, x, y, c):
    if 0 <= x < W and 0 <= y < H: g[(x, y)] = c
def rect(g, x0, y0, x1, y1, c):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1): px(g, x, y, c)
def mir(x): return W - 1 - x

HEAD = {4:(8,21),5:(6,23),6:(5,24),7:(5,24),8:(5,24),9:(5,24),10:(5,24),11:(5,24),12:(5,24),13:(6,23),14:(7,22),15:(9,20)}

def base(g, tail=True):
    # tail (behind)
    if tail:
        for (x,y) in [(20,27),(21,27),(22,26),(23,25),(24,24),(24,23),(24,22),(25,21),(26,21),(26,20)]:
            px(g,x,y,'B'); px(g,x,y+1,'B') if y<24 else None
    # legs/body
    rect(g,11,16,20,27,'W'); rect(g,11,21,13,25,'O'); rect(g,18,23,20,26,'B')
    rect(g,11,28,14,30,'W'); rect(g,17,28,20,30,'W')
    rect(g,10,30,14,30,'W'); rect(g,17,30,21,30,'W')
    # ears
    for i,(a,b) in enumerate([(5,5),(5,6),(5,7),(5,8),(6,9)]): rect(g,a,i,b,i,'O') if i else px(g,5,0,'O')
    for i,(a,b) in enumerate([(24,24),(23,24),(22,24),(21,24),(20,23)]): rect(g,a,i,b,i,'B') if i else px(g,24,0,'B')
    px(g,6,3,'P'); px(g,6,4,'P'); px(g,23,3,'P'); px(g,23,4,'P')
    # head
    for y,(a,b) in HEAD.items():
        for x in range(a,b+1): px(g,x,y,'O' if x<=14 else 'B')
    # white blaze + muzzle
    for y,(a,b) in {4:(14,15),5:(14,15),6:(13,16),7:(13,16)}.items(): rect(g,a,y,b,y,'W')
    for y,(a,b) in {10:(11,18),11:(8,21),12:(7,22),13:(8,21),14:(9,20),15:(11,18)}.items(): rect(g,a,y,b,y,'W')
    # nose
    rect(g,14,10,15,10,'P'); px(g,14,11,'P'); px(g,15,11,'P')
    # whiskers (left only + right short)

def eyes_open(g, look=1, lid=True):
    for x0 in (8,17):
        rect(g,x0,9,x0+4,10,'Y')
        px(g,x0+(3 if look else 1),9,'K'); px(g,x0+(4 if look else 2),9,'K')
        px(g,x0+(3 if look else 1),10,'K'); px(g,x0+(4 if look else 2),10,'K')
        if lid: rect(g,x0,8,x0+4,8,'K')
    # angry-smug brows
    for x,y in [(7,6),(8,6),(9,7),(10,7),(11,7)]: px(g,x,y,'D')
    for x,y in [(24,6),(23,6),(22,7),(21,7),(20,7)]: px(g,x,y,'K')

def eyes_wide(g):
    for x0 in (8,17):
        rect(g,x0,7,x0+4,10,'Y')
        rect(g,x0+2,8,x0+2,9,'K')
    for x,y in [(8,5),(9,5),(10,6),(11,6)]: px(g,x,y,'D')
    for x,y in [(23,5),(22,5),(21,6),(20,6)]: px(g,x,y,'K')

def eyes_closed_line(g):
    for x0 in (8,17): rect(g,x0,9,x0+4,9,'K')
def eyes_happy(g):
    for x0 in (8,17):
        px(g,x0,10,'K'); px(g,x0+1,9,'K'); px(g,x0+2,8,'K'); px(g,x0+3,9,'K'); px(g,x0+4,10,'K')

def mouth_smirk(g):
    px(g,10,12,'K'); rect(g,11,13,18,13,'K'); px(g,19,12,'K'); px(g,20,11,'K')
def mouth_flat(g): rect(g,12,13,17,13,'K')
def mouth_open(g):
    rect(g,13,12,16,14,'K'); rect(g,14,13,15,14,'R')
def mouth_big(g):
    rect(g,10,12,19,12,'K'); rect(g,11,13,18,14,'K'); rect(g,13,14,16,14,'R')

def arm_hip(g):
    for (x,y) in [(10,17),(9,17),(8,18),(7,19),(7,20),(8,21),(9,22),(10,22)]: px(g,x,y,'W')
def arm_down(g, side):
    xs = [10,9,9,9,9,10] if side=='L' else [21,22,22,22,22,21]
    for i,x in enumerate(xs): px(g,x,17+i,'W'); px(g,x+(-1 if side=='L' else 1),17+i,'W')
    px(g,xs[-1]+(-1 if side=='L' else 1),22,'G')

def R_(g,f,a,b,y):
    for x in range(a,b+1): px(g,f(x),y,'G')
def glove(g, cx, top, fingers=2, flip=False):
    f = (lambda x: mir(x)) if flip else (lambda x: x)
    P = lambda x,y,c: px(g,f(x),y,c)
    # palm
    for y in range(top+4, top+8):
        for x in range(cx-3, cx+3): P(x,y,'G')
    for x in range(cx-1,cx+2): P(x,top+8,'G')
    for y in range(top+6, top+8): P(cx-3,y,'G')
    P(cx+2,top+7,'g'); P(cx+1,top+7,'g'); P(cx,top+7,'g')
    if fingers==2:
        for y in (top,top+1): R_(g,f,cx-4,cx-3,y); R_(g,f,cx+2,cx+3,y)
        for y in (top+2,top+3): R_(g,f,cx-3,cx-2,y); R_(g,f,cx+1,cx+2,y)
    elif fingers==1:
        for y in range(top,top+4): P(cx-1,y,'G'); P(cx,y,'G')
    elif fingers==5:
        for y in range(top+1,top+4):
            for x in (cx-2,cx,cx+2): P(x,y,'G')
        P(cx-1,top+3,'G'); P(cx+1,top+3,'G')
def arm_up(g, flip=False, fingers=2, cx=26, top=8):
    f = (lambda x: mir(x)) if flip else (lambda x: x)
    for (x,y) in [(21,18),(22,18),(23,17),(24,17),(25,17),(25,16)]: px(g,f(x),y,'W')
    glove(g,cx,top,fingers,flip)

def flame(g, x, y, s=1):
    # 7w x 10h flame, origin top-left
    rows = ["...1...", "..11...", "..111..", ".1121.1", ".11221.", "112221.", "1122221", "1123221", "1123321", ".11111."]
    m = {'1':'F1','2':'F2','3':'F3'}
    for j,r in enumerate(rows):
        for i,ch in enumerate(r):
            if ch in m: rect(g,x+i*s,y+j*s,x+i*s+s-1,y+j*s+s-1,m[ch])
def zzz(g, x, y):
    for dx,dy,sz in [(0,0,3),(5,-5,4)]:
        for i in range(sz):
            px(g,x+dx+i,y+dy,'Z'); px(g,x+dx+i,y+dy+sz-1,'Z'); px(g,x+dx+sz-1-i,y+dy+i,'Z')
def sparkle(g,x,y,c='F2'):
    for d in (-1,0,1): px(g,x+d,y,c); px(g,x,y+d,c)
    px(g,x,y,'F3')
def sweat(g,x,y):
    px(g,x,y,'I'); rect(g,x-1,y+1,x+1,y+2,'I'); px(g,x,y+3,'I'); px(g,x,y+1,'I2')
def snow(g,x,y):
    for d in (-2,-1,0,1,2): px(g,x+d,y,'I2'); px(g,x,y+d,'I2')
    for d in (-1,1): px(g,x+d,y+d,'I2'); px(g,x+d,y-d,'I2')
def bang(g,x,y):
    rect(g,x,y,x+1,y+4,'R'); rect(g,x,y+6,x+1,y+7,'R')

def outline(g):
    out = dict(g)
    for (x,y) in list(g):
        for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
            n=(x+dx,y+dy)
            if n not in g and 0<=n[0]<W and 0<=n[1]<H: out[n]='K'
    return out

def finish(g):
    o = outline(g)
    for (x,y) in [(1,10),(2,10),(3,11),(1,14),(2,13),(3,13)]: o[(x,y)]='K'  # หนวดซ้าย (หลังวาดขอบ จะได้เป็นเส้นบาง ไม่เป็นก้อน)
    return o

def tint_ice(g):
    out={}
    for k,v in g.items():
        if v in ('K',): out[k]=v; continue
        r,gg,b = C[v]
        out[k]=(int(r*.35+170*.65*0+120*.65), int(gg*.35+190*.65), int(b*.35+245*.65))
    return out

def pose(name):
    g = new()
    base(g)
    if name=='peace':
        eyes_open(g); mouth_smirk(g); arm_down(g,'L'); arm_up(g,fingers=2)
    elif name=='sleepy':
        eyes_closed_line(g); mouth_flat(g); arm_down(g,'L'); arm_down(g,'R')
        for x,y in [(7,6),(8,6),(9,6),(10,6)]: px(g,x,y,'D')
        zzz(g,24,4)
    elif name=='one':
        eyes_open(g); mouth_smirk(g); arm_down(g,'L'); arm_up(g,fingers=1)
    elif name=='cheer':
        eyes_happy(g); mouth_big(g); arm_up(g,fingers=5); arm_up(g,flip=True,fingers=5)
        sparkle(g,2,3); sparkle(g,29,5); sparkle(g,1,20); sparkle(g,30,22,'F1')
    elif name=='panic':
        eyes_wide(g); mouth_open(g); arm_down(g,'L'); arm_down(g,'R')
        sweat(g,3,3); sweat(g,27,2); bang(g,28,16)
        flame(g,1,18,1)
    elif name=='frozen':
        eyes_closed_line(g); mouth_flat(g); arm_down(g,'L'); arm_down(g,'R')
        g = tint_ice(g)
        for x,y in [(1,9),(2,9),(1,15),(2,15)]: px(g,x,y,'I2')
        snow(g,3,4); snow(g,28,6); snow(g,28,24); snow(g,3,24)
        for x in (0,1,2,29,30,31): pass
    elif name=='torch':
        eyes_open(g); mouth_smirk(g); arm_hip(g)
        for (x,y) in [(21,18),(22,18),(23,17),(24,17),(25,17),(25,16)]: px(g,x,y,'W')
        glove(g,27,9,5)
        flame(g,24,-1+0,1) if False else None
    return finish(g)

def render(g, scale, bg=None):
    im = Image.new('RGBA',(W*scale,H*scale),bg or (0,0,0,0))
    d = ImageDraw.Draw(im)
    for (x,y),k in g.items():
        col = C[k] if isinstance(k,str) else k
        d.rectangle([x*scale,y*scale,(x+1)*scale-1,(y+1)*scale-1],fill=col+(255,) if len(col)==3 else col)
    return im

POSES = ['peace','sleepy','one','cheer','panic','frozen']
if __name__=='__main__':
    sheet = Image.new('RGB',(3*W*10+4*20, 2*(W*10+20)+20),(34,36,44))
    for i,n in enumerate(POSES):
        g = pose(n)
        render(g,16).save(f'{OUT}/{n}.png')
        im = render(g,10)
        sheet.paste(im,(20+(i%3)*(W*10+20), 20+(i//3)*(W*10+20)), im)
    sheet.save(f'{OUT}/sheet.png')
