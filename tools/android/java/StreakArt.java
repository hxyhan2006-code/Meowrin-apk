package com.han.meowrin;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;

/* ภาพพิกเซลของวิดเจ็ตที่วาดสดด้วย Canvas (ฟอนต์ตัวเลขพิกเซล 5x7 + ไฟ + ช่องความคืบหน้า) — ไม่มีฟอนต์พิกเซลที่ใช้ได้ทั้งไทย/เลขในเครื่อง จึงวาดเอง
   ไฟสูงเท่าตัวเลข วางห่างกัน ไม่ทับ · ขนาดหน่วยพิกเซลคิดจากความหนาแน่นจอ (ขอบคม ไม่เบลอ) */
final class StreakArt {
    static final int OUT = 0xFF1D3B5A;
    static final String[] DIG = {
        "01110,10001,10011,10101,11001,10001,01110", "00100,01100,00100,00100,00100,00100,01110",
        "01110,10001,00001,00010,00100,01000,11111", "11110,00001,00001,01110,00001,00001,11110",
        "00010,00110,01010,10010,11111,00010,00010", "11111,10000,11110,00001,00001,10001,01110",
        "00110,01000,10000,11110,10001,10001,01110", "11111,00001,00010,00100,01000,01000,01000",
        "01110,10001,10001,01110,10001,10001,01110", "01110,10001,10001,01111,00001,00010,01100" };
    static final String DASH = "00000,00000,00000,01110,00000,00000,00000";
    static final String[] FLAME = { "...1...", "..11...", "..111..", ".1121.1", ".11221.", "112221.", "1122221", "1123221", "1123321", ".11111." };

    static void cell(Canvas cv, Paint p, int x, int y, int s, int color) {
        p.setColor(color);
        cv.drawRect(x, y, x + s, y + s, p);
    }

    /* เลขสตรีค + ไฟ (ไฟสีส้มเมื่อวันนี้ไฟติด ไม่ติด = เทา) */
    static Bitmap stats(String num, boolean lit, float density) {
        int u = Math.max(2, Math.round(3f * density)), fu = Math.max(1, Math.round(u * 0.75f));
        int n = Math.max(1, num.length()), digitsW = (n * 6 - 1) * u, gap = 2 * u;
        int w = u + digitsW + gap + fu * 9, h = 9 * u;
        Bitmap bm = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bm);
        Paint p = new Paint();
        p.setAntiAlias(false);
        int[] flameCol = lit ? new int[] { 0xFFFF7A1A, 0xFFFFC83A, 0xFFFFF3B0 } : new int[] { 0xFF8B8F8D, 0xFFB5B9B7, 0xFFDCDEDD };
        for (int pass = 0; pass < 2; pass++) {
            for (int i = 0; i < n; i++) {
                char ch = num.charAt(i);
                String[] rows = (ch >= '0' && ch <= '9' ? DIG[ch - '0'] : DASH).split(",");
                for (int ry = 0; ry < 7; ry++) for (int rx = 0; rx < 5; rx++) {
                    if (rows[ry].charAt(rx) != '1') continue;
                    int x = u + (i * 6 + rx) * u, y = u + ry * u;
                    if (pass == 0) { for (int dx = -1; dx <= 1; dx++) for (int dy = -1; dy <= 1; dy++) cell(cv, p, x + dx * u, y + dy * u, u, OUT); }
                    else cell(cv, p, x, y, u, 0xFFFFFFFF);
                }
            }
            int fx = u + digitsW + gap + fu, fy = (h - 10 * fu) / 2;
            for (int ry = 0; ry < 10; ry++) for (int rx = 0; rx < 7; rx++) {
                char ch = FLAME[ry].charAt(rx);
                if (ch == '.') continue;
                int x = fx + rx * fu, y = fy + ry * fu;
                if (pass == 0) { for (int dx = -1; dx <= 1; dx++) for (int dy = -1; dy <= 1; dy++) cell(cv, p, x + dx * fu, y + dy * fu, fu, OUT); }
                else cell(cv, p, x, y, fu, flameCol[ch - '1']);
            }
        }
        return bm;
    }

    /* ช่องความคืบหน้าวันนี้ (ทำแล้ว = ส้ม · ยังไม่ทำ = ขาวโปร่ง) */
    static Bitmap blocks(int done, int goal, float density) {
        int n = Math.max(1, Math.min(goal, 4)), sq = Math.round(11f * density), gap = Math.round(3f * density), b = Math.max(2, Math.round(1.5f * density));
        Bitmap bm = Bitmap.createBitmap(n * sq + (n - 1) * gap, sq, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bm);
        Paint p = new Paint();
        p.setAntiAlias(false);
        for (int i = 0; i < n; i++) {
            int x = i * (sq + gap);
            p.setColor(OUT);
            cv.drawRect(x, 0, x + sq, sq, p);
            p.setColor(i < done ? 0xFFFF8A1A : 0x88FFFFFF);
            cv.drawRect(x + b, b, x + sq - b, sq - b, p);
        }
        return bm;
    }
}
