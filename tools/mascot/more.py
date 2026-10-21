import os
from PIL import Image
import make as m
from make import *

OUT = m.OUT
C.update(dict(M=(255,150,170), T=(120,70,40)))

def eyes_x(g):
    for x0 in (8,17):
        for i in range(4):
            px(g,x0+i,7+i,'K'); px(g,x0+3-i,7+i,'K')
def eye_wink(g):
    eyes_open(g)
    for x in range(17,22): px(g,x,8,'B'); px(g,x,9,'B'); px(g,x,10,'B')
    px(g,17,10,'K'); px(g,18,9,'K'); px(g,19,8,'K'); px(g,20,9,'K'); px(g,21,10,'K')
def eyes_half(g):
    for x0 in (8,17):
        rect(g,x0,8,x0+4,9,'K'); rect(g,x0,10,x0+4,10,'Y'); px(g,x0+3,10,'K'); px(g,x0+4,10,'K')
def heart(g,x,y,c='R'):
    for dx,dy in [(0,0),(1,0),(3,0),(4,0),(0,1),(1,1),(2,1),(3,1),(4,1),(1,2),(2,2),(3,2),(2,3)]: px(g,x+dx,y+dy,c)
def tear(g,x,y):
    for i in range(4): px(g,x,y+i,'I')
    px(g,x+1,y+2,'I2')
def mug(g,x,y):
    rect(g,x,y,x+5,y+5,'S'); rect(g,x+1,y+1,x+4,y+1,'T')
    for dx,dy in [(6,1),(7,1),(7,2),(7,3),(6,4)]: px(g,x+dx,y+dy,'S')
    for dx,dy in [(1,-2),(2,-3),(1,-4),(4,-2),(3,-3),(4,-4)]: px(g,x+dx,y+dy,'Q')
def arm_stub(g):
    for (x,y) in [(21,18),(22,18),(23,17),(24,17)]: px(g,x,y,'W')
def fish(g,x,y):
    rect(g,x+2,y,x+6,y+3,'Z'); rect(g,x+1,y+1,x+7,y+2,'Z'); px(g,x+6,y+1,'Q'); px(g,x+7,y+1,'K')
    for dx,dy in [(0,0),(1,0),(0,3),(1,3),(0,1),(0,2)]: px(g,x-1+dx,y+dy,'I')
def laptop(g):
    rect(g,10,19,21,24,'K'); rect(g,11,20,20,23,'I'); rect(g,12,21,16,21,'I2'); rect(g,12,22,18,22,'I2')
    rect(g,8,25,23,26,'S'); rect(g,9,27,22,27,'D')
def phone(g,x,y):
    rect(g,x,y,x+4,y+7,'K'); rect(g,x+1,y+1,x+3,y+6,'I'); rect(g,x+1,y+2,x+3,y+2,'I2'); rect(g,x+1,y+4,x+3,y+4,'I2')
def crown(g):
    rect(g,10,3,19,4,'F2');
    for x in (10,13,16,19): px(g,x,2,'F2'); px(g,x,1,'F2') if x in (10,19) else None
    px(g,14,1,'F2'); px(g,15,1,'F2'); px(g,14,2,'F2'); px(g,15,2,'F2')
    px(g,12,3,'R'); px(g,17,3,'Z'); px(g,14,3,'F3'); px(g,15,3,'F3')
def shades(g):
    rect(g,7,8,13,10,'K'); rect(g,16,8,22,10,'K'); rect(g,13,8,16,8,'K')
    px(g,8,9,'Q'); px(g,9,8,'Q'); px(g,17,9,'Q'); px(g,18,8,'Q')
def phones(g):
    for x in range(8,22): px(g,x,0 if x in (9,10) else 1 if x in (11,12,17,18,19,20) else 2,'K') if False else None
    rect(g,10,1,19,1,'K'); px(g,9,2,'K'); px(g,20,2,'K'); px(g,8,3,'K'); px(g,21,3,'K')
    rect(g,2,7,4,12,'Z'); rect(g,25,7,27,12,'Z'); px(g,2,7,'K'); px(g,27,7,'K')
def note(g,x,y):
    rect(g,x,y,x+1,y+1,'Z'); rect(g,x+1,y-3,x+1,y,'Z'); px(g,x+2,y-3,'Z'); px(g,x+3,y-2,'Z')
def anger(g,x,y):
    for dx,dy in [(0,0),(1,0),(0,1),(3,0),(4,0),(4,1),(0,3),(0,4),(1,4),(4,3),(3,4),(4,4)]: px(g,x+dx,y+dy,'R')
def qmark(g,x,y):
    for dx,dy in [(1,0),(2,0),(0,1),(3,1),(3,2),(2,3),(1,4)]: px(g,x+dx,y+dy,'Z')
    px(g,1,6+y-y+y+0,'Z') if False else px(g,x+1,y+6,'Z')
def blush(g):
    rect(g,7,12,8,12,'M'); rect(g,21,12,22,12,'M')
def tongue(g): rect(g,14,14,16,15,'R')
def stars(g,x,y):
    for i,(dx,dy) in enumerate([(0,0),(5,-2),(10,0)]): sparkle(g,x+dx,y+dy,'F2')

def p(name):
    g = new(); base(g)
    if name=='wave':
        eyes_open(g); mouth_smirk(g); arm_down(g,'L'); arm_up(g,fingers=5)
    elif name=='cool':
        shades(g); mouth_smirk(g); arm_up(g,flip=True,fingers=2); arm_up(g,fingers=2)
    elif name=='coffee':
        eyes_half(g); mouth_flat(g); arm_down(g,'L'); arm_stub(g); mug(g,23,13)
    elif name=='music':
        eyes_happy(g); mouth_smirk(g); arm_down(g,'L'); arm_down(g,'R'); phones(g); note(g,27,5); note(g,1,5)
    elif name=='fish':
        eyes_happy(g); mouth_big(g); arm_down(g,'L'); arm_stub(g); fish(g,23,13)
    elif name=='angry':
        eyes_open(g, lid=True); mouth_open(g)
        for x,y in [(7,5),(8,6),(9,7),(10,7)]: px(g,x,y,'K')
        for x,y in [(24,5),(23,6),(22,7),(21,7)]: px(g,x,y,'K')
        arm_up(g,flip=True,fingers=0); arm_up(g,fingers=0); anger(g,26,1)
    elif name=='work':
        eyes_open(g); mouth_flat(g); laptop(g)
    elif name=='phone':
        eyes_half(g); mouth_flat(g); arm_down(g,'L'); arm_stub(g); phone(g,23,10)
    elif name=='love':
        eyes_happy(g); mouth_smirk(g); blush(g); arm_up(g,flip=True,fingers=5); arm_up(g,fingers=5)
        heart(g,2,2); heart(g,27,1,'M')
    elif name=='cry':
        eyes_closed_line(g); mouth_open(g)
        for x in (9,10,19,20): pass
        tear(g,9,10); tear(g,22,10); tear(g,8,13); tear(g,23,13)
        arm_down(g,'L'); arm_down(g,'R')
    elif name=='crown':
        eyes_open(g); mouth_smirk(g); arm_up(g,flip=True,fingers=2); arm_up(g,fingers=2); crown(g)
        sparkle(g,2,4); sparkle(g,29,3); sparkle(g,28,22,'F1')
    elif name=='torch':
        eyes_open(g); mouth_big(g); arm_down(g,'L'); arm_up(g,fingers=0,cx=28,top=8); flame(g,25,1,1)
    elif name=='dizzy':
        eyes_x(g); mouth_open(g); tongue(g); arm_down(g,'L'); arm_down(g,'R'); stars(g,10,0)
    elif name=='shrug':
        eyes_open(g); mouth_flat(g); arm_up(g,flip=True,fingers=5,top=11); arm_up(g,fingers=5,top=11); qmark(g,1,2)
    elif name=='wink':
        eye_wink(g); mouth_smirk(g); tongue(g); arm_down(g,'L'); arm_up(g,fingers=2); sparkle(g,3,3)
    return finish(g)

NEW = ['wave','cool','coffee','music','fish','angry','work','phone','love','cry','crown','torch','dizzy','shrug','wink']
ALL = [('peace',None),('one',None),('cheer',None),('sleepy',None),('panic',None),('frozen',None)] + [(n,'n') for n in NEW]

if __name__=='__main__':
    os.makedirs(f'{OUT}/poses',exist_ok=True)
    cols=7; S=7; pad=14
    rows=(len(ALL)+cols-1)//cols
    sheet=Image.new('RGB',(cols*(W*S+pad)+pad, rows*(W*S+pad)+pad),(34,36,44))
    for i,(n,k) in enumerate(ALL):
        g = m.pose(n) if k is None else p(n)
        render(g,16).save(f'{OUT}/poses/{n}.png')
        im=render(g,S)
        sheet.paste(im,(pad+(i%cols)*(W*S+pad), pad+(i//cols)*(W*S+pad)), im)
    sheet.save(f'{OUT}/sheet_all.png')
    print(len(ALL))
