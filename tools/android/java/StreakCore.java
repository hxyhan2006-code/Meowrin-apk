package com.han.meowrin;

import android.Manifest;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.net.Uri;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Typeface;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.widget.RemoteViews;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;
import java.util.Random;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONObject;

/* ตัวเฝ้าไฟวันต่อเนื่องฝั่งเนทีฟ (ทำงานตอนแอพปิด): วิดเจ็ต + เช็กยอดวันนี้จาก YouTube + แจ้งเตือนเมื่อยังไม่ครบ
   ตรรกะสตรีคจริงอยู่ที่ streak.js — แอพส่ง base (สตรีคถึงเมื่อวาน) + freeze + ยอดวันนี้มาให้ผ่าน StreakPlugin.sync
   ที่นี่แค่นับ "วันนี้ลงกี่คลิป" แล้วโชว์ base + 1 ถ้าครบ · ข้ามวันโดยไม่ได้เปิดแอพ = ประมาณเอง (ครบ +1 / ไม่ครบใช้กันไฟดับ / หมด = 0) เปิดแอพแล้วแอพส่งค่าที่ถูกมาทับ */
final class StreakCore {
    static final String PREFS = "meowrin_streak", CH = "streak", ACTION = "com.han.meowrin.STREAK_TICK", OPEN = "meowrin_open";
    static final long LATE_MS = 45 * 60_000L; /* แจ้งเตือนที่ระบบปลุกช้าเกินนี้ = ข้าม (ไม่เด้งตอนเวลาไม่ตรงความหมาย) */

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    static String dayKey(long t) {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
        f.setTimeZone(TimeZone.getDefault());
        return f.format(new Date(t));
    }

    static String nextDay(String k) {
        try {
            SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
            Calendar cal = Calendar.getInstance();
            cal.setTime(f.parse(k));
            cal.add(Calendar.DAY_OF_MONTH, 1);
            return f.format(cal.getTime());
        } catch (Exception e) { return dayKey(System.currentTimeMillis()); }
    }

    /* ข้ามวันโดยที่แอพยังไม่ได้ส่งค่าใหม่: เลื่อน base ไปทีละวัน */
    static void rollover(SharedPreferences p) {
        String today = dayKey(System.currentTimeMillis()), day = p.getString("day", "");
        if (day.isEmpty() || day.compareTo(today) >= 0) return;
        int base = p.getInt("base", 0), freeze = p.getInt("freeze", 0), n = p.getInt("today", 0), goal = p.getInt("goal", 1);
        boolean broke = false, froze = false; /* broke = ช่วงที่ข้ามมามีวันที่ไฟดับตอนมีไฟอยู่ไหม (ไม่ใช่แค่วันสุดท้าย) · froze = เมื่อวาน (วันสุดท้ายที่ข้าม) ใช้กันไฟดับ */
        for (int guard = 0; day.compareTo(today) < 0 && guard < 400; guard++) {
            froze = false;
            if (n >= goal) base++;
            else if (freeze > 0) { freeze--; froze = true; }
            else { if (base > 0) broke = true; base = 0; }
            n = 0;
            day = nextDay(day);
        }
        p.edit().putInt("base", base).putInt("freeze", freeze).putInt("today", 0).putString("day", today).putString("broke", broke ? today : "").putString("froze", froze ? today : "").apply();
    }

    static PendingIntent openApp(Context c, int req) {
        Intent i = new Intent(c, MainActivity.class);
        i.putExtra(OPEN, "streak");
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, req, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static JSONArray pool(SharedPreferences p, String key) {
        try { JSONArray a = new JSONObject(p.getString("msgs", "{}")).optJSONArray(key); return a == null ? new JSONArray() : a; }
        catch (Exception e) { return new JSONArray(); }
    }

    /* ข้อความบนวิดเจ็ต: เลือกคงที่ตลอดครึ่งชั่วโมง (วาดใหม่กี่รอบก็ไม่กะพริบเปลี่ยน) เปลี่ยนเมื่อสถานการณ์/ครึ่งชั่วโมงเปลี่ยน */
    static String widgetKey(SharedPreferences p, boolean lit, int n, int goal) {
        int hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY);
        if (lit) return n > goal ? "w_b" : "w_d";
        if (dayKey(System.currentTimeMillis()).equals(p.getString("broke", ""))) return "w_r"; /* ไฟเพิ่งดับวันนี้ = ข้อความให้กำลังใจ ไม่ใช่ "ไฟจะดับ" */
        if (hour >= 19 && p.getInt("base", 0) > 0) return "w_e";
        return n >= 1 ? "w_h" : "w_z";
    }

    static String widgetMsg(SharedPreferences p, boolean set, boolean lit, int n, int goal, int streakShown) {
        if (!set) return "เปิดแอพแล้วตั้งค่าก่อน";
        Calendar cal = Calendar.getInstance();
        int half = cal.get(Calendar.HOUR_OF_DAY) * 2 + cal.get(Calendar.MINUTE) / 30;
        String key = widgetKey(p, lit, n, goal);
        JSONArray a = pool(p, key);
        if (a.length() == 0) return "";
        int idx = (((dayKey(System.currentTimeMillis()) + "|" + half + "|" + key).hashCode() % a.length()) + a.length()) % a.length(); /* floorMod ใช้ไม่ได้ใน Android 6 */
        return fill(a.optString(idx, ""), n, goal, streakShown, p.getInt("freeze", 0));
    }

    /* ท่ามาสคอตตามสถานการณ์ (mascot.js POOLS ส่งมากับ sync) — ลำดับ/สูตรเลือกเหมือน streak.js poseKey + MWMascot.pick เป๊ะ
       ตัวอักษรสถานการณ์: z ยังไม่ทำ · h ครึ่งทาง · d ไฟติด · b เกินโควตา · m หลักไมล์ · e ค่ำไฟจะดับ · r ไฟเพิ่งดับ · f เมื่อวานใช้กันไฟดับ */
    static String poseKey(SharedPreferences p, boolean lit, int n, int goal, int streak) {
        String today = dayKey(System.currentTimeMillis());
        if (lit) return isMilestone(streak) ? "m" : n > goal ? "b" : "d";
        if (today.equals(p.getString("froze", ""))) return "f";
        if (today.equals(p.getString("broke", ""))) return "r";
        if (Calendar.getInstance().get(Calendar.HOUR_OF_DAY) >= 19 && p.getInt("base", 0) > 0) return "e";
        return n >= 1 ? "h" : "z";
    }

    static int slot(int len, String day, int half, String key) { return (((day + "|" + half + "|" + key).hashCode() % len) + len) % len; }

    static JSONArray posePool(SharedPreferences p, String key) {
        try { JSONArray a = new JSONObject(p.getString("poses", "{}")).optJSONArray(key); return a == null ? new JSONArray() : a; }
        catch (Exception e) { return new JSONArray(); }
    }

    /* ท่าคงที่ตลอดครึ่งชั่วโมง ไม่ซ้ำครึ่งชั่วโมงก่อนหน้า (ยังไม่เคย sync = ท่าชู 2 นิ้ว) */
    static String poseName(SharedPreferences p, String key) {
        JSONArray a = posePool(p, key);
        int n = a.length();
        if (n == 0) return "peace";
        Calendar cal = Calendar.getInstance();
        int half = cal.get(Calendar.HOUR_OF_DAY) * 2 + cal.get(Calendar.MINUTE) / 30;
        String day = dayKey(System.currentTimeMillis());
        int i = slot(n, day, half, key);
        if (n > 1 && i == slot(n, day, half - 1, key)) i = (i + 1) % n;
        return a.optString(i, "peace");
    }

    /* ภาพท่าใน APK (res/drawable-nodpi/mw_<ท่า>.png) · ไม่มีท่านั้น (APK เก่ากว่าชุดท่า) = 0 */
    static int poseRes(Context c, String name) {
        return c.getResources().getIdentifier("mw_" + name, "drawable", c.getPackageName());
    }

    /* ฉากพื้นหลัง (mascot.js SCENES ส่งมากับ sync · ภาพ res/drawable-nodpi/stk_bg_<ฉาก>_<อารมณ์>.png จาก tools/widget/scenes.py) · สลับทุก 3 ชั่วโมง */
    static String sceneName(SharedPreferences p) {
        try {
            JSONArray a = new JSONArray(p.getString("scenes", "[]"));
            if (a.length() == 0) return "meadow";
            return a.optString(slot(a.length(), dayKey(System.currentTimeMillis()), Calendar.getInstance().get(Calendar.HOUR_OF_DAY) / 3, "scene"), "meadow");
        } catch (Exception e) { return "meadow"; }
    }

    /* อารมณ์ของฉาก: n หม่น (ยังไม่ทำ/ไฟเพิ่งดับ) · d สว่าง (ครึ่งทาง/ไฟติด) · e ค่ำ (ไฟจะดับ) · f น้ำแข็ง (ใช้กันไฟดับ) */
    static int bgRes(Context c, String scene, String key) {
        String mood = "e".equals(key) ? "e" : "f".equals(key) ? "f" : "z".equals(key) || "r".equals(key) ? "n" : "d";
        int id = c.getResources().getIdentifier("stk_bg_" + scene + "_" + mood, "drawable", c.getPackageName());
        return id != 0 ? id : c.getResources().getIdentifier("stk_bg_meadow_" + mood, "drawable", c.getPackageName());
    }

    /* คืนจำนวนวิดเจ็ตที่วาด (0 = ยังไม่มีวิดเจ็ตบนหน้าจอ) */
    static int draw(Context c, boolean set, boolean lit, int n, int goal, int streak, int freeze, String msg, String key, String pose, String scene) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        int[] ids = m.getAppWidgetIds(new ComponentName(c, StreakWidget.class));
        if (ids == null || ids.length == 0) return 0;
        float d = c.getResources().getDisplayMetrics().density;
        Typeface tf = StreakArt.font(c);
        String sub = set ? "วันนี้ " + n + "/" + goal + " · กันไฟ " + freeze : "";
        Bitmap stats = StreakArt.stats(set ? String.valueOf(streak) : "-", lit, d), prog = StreakArt.blocks(set ? n : 0, goal, d);
        int pr = poseRes(c, pose), bg = bgRes(c, scene, key);
        for (int id : ids) { /* วิดเจ็ตแต่ละอันกว้างไม่เท่ากัน (ผู้ใช้ย่อ/ขยายได้) → วาดข้อความให้พอดีความกว้างของอันนั้น */
            float w = m.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 170);
            RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.streak_widget);
            v.setImageViewBitmap(R.id.stk_stats, stats);
            v.setImageViewBitmap(R.id.stk_prog, prog);
            v.setImageViewBitmap(R.id.stk_msg, StreakArt.text(msg, tf, 17, 8, w - 18, d));
            v.setContentDescription(R.id.stk_msg, msg);
            v.setImageViewBitmap(R.id.stk_today, StreakArt.text(sub, tf, 11, 8, Math.max(40, w - 75), d));
            v.setContentDescription(R.id.stk_today, sub);
            if (pr != 0) v.setImageViewResource(R.id.stk_mascot, pr);
            if (bg != 0) v.setImageViewResource(R.id.stk_bgimg, bg);
            v.setOnClickPendingIntent(R.id.stk_root, openApp(c, 7));
            m.updateAppWidget(id, v);
        }
        return ids.length;
    }

    static void renderWidgets(Context c) {
        SharedPreferences p = prefs(c);
        rollover(p);
        boolean set = !p.getString("list", "").isEmpty();
        int goal = p.getInt("goal", 1), n = p.getInt("today", 0);
        boolean lit = set && n >= goal;
        int streak = p.getInt("base", 0) + (lit ? 1 : 0);
        String key = set ? poseKey(p, lit, n, goal, streak) : "z";
        draw(c, set, lit, n, goal, streak, p.getInt("freeze", 0), widgetMsg(p, set, lit, n, goal, streak), key, set ? poseName(p, key) : "peace", sceneName(p));
    }

    /* ทดสอบวิดเจ็ต: โชว์ตัวอย่างสถานการณ์ที่เลือก (z ยังไม่ทำ · h ครึ่งทาง · d ไฟติด · b โบนัส · e ค่ำไฟจะดับ · r ไฟเพิ่งดับ · f ใช้กันไฟดับ · m หลักไมล์) พร้อมข้อความ+ท่ามาสคอตสุ่มจริงจากชุดนั้น
       ค้าง 20 วินาทีแล้ววาดค่าจริงกลับ (ไม่แตะข้อมูลจริง) */
    static final Handler UI = new Handler(Looper.getMainLooper());

    static int previewWidget(Context ctx, String state) {
        final Context c = ctx.getApplicationContext();
        SharedPreferences p = prefs(c);
        int goal = p.getInt("goal", 1), base = p.getInt("base", 0) > 0 ? p.getInt("base", 0) : 12, frz = p.getInt("freeze", 1);
        boolean lit = "d".equals(state) || "b".equals(state) || "m".equals(state);
        int n = "h".equals(state) ? 1 : "d".equals(state) || "m".equals(state) ? goal : "b".equals(state) ? goal + 1 : 0;
        int streak = "r".equals(state) ? 0 : lit ? base + 1 : base;
        JSONArray a = pool(p, "f".equals(state) ? "w_h" : "m".equals(state) ? "w_d" : "w_" + state); /* f/m ไม่มีชุดข้อความของตัวเอง ยืมชุดใกล้เคียง */
        String msg = a.length() == 0 ? "ยังไม่มีข้อความ (เปิดแอพให้ซิงก์ก่อน)" : fill(a.optString(new Random().nextInt(a.length()), ""), n, goal, streak, frz);
        JSONArray pa = posePool(p, state);
        int shown = draw(c, true, lit, n, goal, streak, frz, msg, state, pa.length() == 0 ? "peace" : pa.optString(new Random().nextInt(pa.length()), "peace"), sceneName(p));
        if (shown == 0) return 0;
        UI.removeCallbacksAndMessages(null); /* กดทดสอบซ้อน = นับ 20 วินาทีใหม่ ไม่ให้ตัวคืนค่าอันเก่ามาตัดกลางคัน */
        UI.postDelayed(new Runnable() {
            @Override
            public void run() { renderWidgets(c); }
        }, 20_000L);
        /* โปรเซสถูกฆ่าก่อนครบ 20 วินาที = ตัวคืนค่าใน Handler หาย → ปลุกรอบเช็กอีกครั้งเป็นตัวสำรอง (ไม่ต้องรอรอบ 30 นาที/ข้ามคืน) */
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am != null) {
            Intent i = new Intent(c, StreakAlarm.class).setAction(ACTION);
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, System.currentTimeMillis() + 30_000L,
                    PendingIntent.getBroadcast(c, 2, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        }
        return shown;
    }

    static boolean canNotify(Context c) {
        if (Build.VERSION.SDK_INT >= 33 && c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        return nm != null && nm.areNotificationsEnabled();
    }

    static String fill(String s, SharedPreferences p, int streakShown) {
        return fill(s, p.getInt("today", 0), p.getInt("goal", 1), streakShown, p.getInt("freeze", 0));
    }

    static String fill(String s, int n, int goal, int streakShown, int frz) {
        return s.replace("{n}", String.valueOf(n)).replace("{left}", String.valueOf(Math.max(goal - n, 0)))
                .replace("{goal}", String.valueOf(goal)).replace("{streak}", String.valueOf(streakShown))
                .replace("{frz}", String.valueOf(frz));
    }

    /* เสียงแจ้งเตือนของมาสคอต (8-bit · tools/sound/make.py → res/raw/stk_snd_<ชื่อ>.mp3) · ช่องแจ้งเตือนของ Android ต่อ 1 เสียง (เสียงผูกกับช่อง เปลี่ยนเองในตั้งค่าแอพได้)
       lit ไฟติด · 1100/1300/1630/2100 เตือนตามเวลา (ยิ่งดึกยิ่งเร่ง) · ms ไฟครบหลักไมล์ */
    static final String[][] SOUNDS = { { "lit", "ไฟติดแล้ว" }, { "1100", "เตือนเช้า 11:00" }, { "1300", "เตือนบ่าย 13:00" }, { "1630", "เตือนเย็น 16:30" }, { "2100", "เตือนค่ำ 21:00" }, { "ms", "ไฟครบหลักไมล์" } };
    static final long[] VIB = { 0, 250, 150, 250 };

    static String sndForSlot(String slot) {
        if ("11:00".equals(slot)) return "1100";
        if ("16:30".equals(slot)) return "1630";
        if ("21:00".equals(slot)) return "2100";
        return "1300"; /* 13:00 และเวลาอื่น/ทดสอบ */
    }

    static Uri sndUri(Context c, String snd) {
        int id = c.getResources().getIdentifier("stk_snd_" + snd, "raw", c.getPackageName());
        return id == 0 ? null : Uri.parse("android.resource://" + c.getPackageName() + "/" + id);
    }

    /* คืน id ช่องของเสียงนี้ (Android 8+ สร้างช่องถ้ายังไม่มี) · ช่องเดิม "streak" (เสียงเริ่มต้นเงียบ) ลบทิ้ง */
    static String channelFor(Context c, NotificationManager nm, String snd) {
        String id = CH + "_" + snd;
        if (Build.VERSION.SDK_INT >= 26) {
            String label = "ไฟวันต่อเนื่อง";
            for (String[] x : SOUNDS) if (x[0].equals(snd)) label = "ไฟ · " + x[1];
            NotificationChannel ch = new NotificationChannel(id, label, NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("เสียงมาสคอตแมว ตอน" + label.replace("ไฟ · ", ""));
            Uri u = sndUri(c, snd);
            if (u != null) ch.setSound(u, new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
            ch.enableVibration(true);
            ch.setVibrationPattern(VIB);
            nm.createNotificationChannel(ch);
            nm.deleteNotificationChannel(CH);
        }
        return id;
    }

    /* ทดสอบแจ้งเตือนจากหน้าไฟ: slot = เวลา (11:00 13:00 16:30 21:00) · praise ไฟติด · ms หลักไมล์ */
    static void testNotify(Context c, String slot) {
        SharedPreferences p = prefs(c);
        int shown = p.getInt("base", 0) + 1;
        if ("praise".equals(slot) || "ms".equals(slot)) {
            boolean ms = "ms".equals(slot);
            notifyPool(c, new String[] { slot }, shown, "ไฟติดแล้ว · " + shown + " วัน", ms ? "m" : "d", ms ? "ms" : "lit");
        } else notifyNow(c, slot);
    }

    static final int RECENT = 10; /* ไม่ซ้ำ 10 ข้อความล่าสุด */

    /* สุ่มจากชุดข้อความที่ระบุ (streak-msgs.js ส่งมาตอน sync = แก้ผ่าน OTA ได้) ไม่ซ้ำ RECENT ข้อความล่าสุด */
    static void notifyPool(Context c, String[] keys, int streakShown, String title, String poseKey, String snd) {
        SharedPreferences p = prefs(c);
        ArrayList<String> all = new ArrayList<>(), fresh = new ArrayList<>();
        for (String k : keys) { JSONArray a = pool(p, k); for (int i = 0; i < a.length(); i++) all.add(a.optString(i, "")); }
        ArrayList<String> recent = new ArrayList<>();
        try { JSONArray r = new JSONArray(p.getString("recent", "[]")); for (int i = 0; i < r.length(); i++) recent.add(r.optString(i, "")); } catch (Exception ignored) { }
        for (String m : all) if (!m.isEmpty() && !recent.contains(m)) fresh.add(m);
        if (fresh.isEmpty()) { String last = recent.isEmpty() ? "" : recent.get(recent.size() - 1); for (String m : all) if (!m.isEmpty() && !m.equals(last)) fresh.add(m); }
        if (fresh.isEmpty()) for (String m : all) if (!m.isEmpty()) fresh.add(m);
        String msg = fresh.isEmpty() ? "วันนี้ยังไม่ได้ทำงาน {n}/{goal}" : fresh.get(new Random().nextInt(fresh.size()));
        recent.add(msg);
        while (recent.size() > RECENT) recent.remove(0);
        p.edit().putString("recent", new JSONArray(recent).toString()).apply();
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            b = new Notification.Builder(c, channelFor(c, nm, snd));
        } else {
            b = new Notification.Builder(c).setPriority(Notification.PRIORITY_HIGH).setVibrate(VIB);
            Uri u = sndUri(c, snd);
            if (u != null) b.setSound(u);
        }
        String text = fill(msg, p, streakShown);
        int pr = poseRes(c, poseName(p, poseKey));
        if (pr != 0) { Bitmap big = BitmapFactory.decodeResource(c.getResources(), pr); if (big != null) b.setLargeIcon(big); }
        b.setSmallIcon(R.drawable.stk_notif)
                .setColor(0xFFFF8A3D)
                .setContentTitle(fill(title, p, streakShown))
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setAutoCancel(true)
                .setContentIntent(openApp(c, 8));
        nm.notify(4201, b.build());
    }

    /* เตือนตามเวลา: ชุดของเวลานั้น + ชุดใช้ได้ทุกเวลา */
    static void notifyNow(Context c, String slot) {
        SharedPreferences p = prefs(c);
        int n = p.getInt("today", 0), goal = p.getInt("goal", 1);
        notifyPool(c, new String[] { slot, "any" }, p.getInt("base", 0), "วันนี้ {n}/{goal} · ไฟ {streak} วัน", poseKey(p, false, n, goal, p.getInt("base", 0)), sndForSlot(slot));
    }

    static final int[] MILESTONES = { 3, 7, 14, 30, 50, 100, 150, 200, 365, 500, 730, 1000 };

    static boolean isMilestone(int n) { for (int m : MILESTONES) if (m == n) return true; return false; }

    static int minutes(String hhmm) {
        try { String[] t = hhmm.split(":"); return Integer.parseInt(t[0]) * 60 + Integer.parseInt(t[1]); } catch (Exception e) { return -1; }
    }

    /* รอบปลุก: 00:01 (ข้ามวันให้วิดเจ็ต) + เวลาแจ้งเตือนที่ตั้งไว้เท่านั้น · ไม่ต่อเน็ต ไม่เช็กเป็นรอบ (ยอดวันนี้อัปเดตตอนเปิด/กลับเข้าแอพ) */
    static long nextAt(SharedPreferences p, long now) {
        ArrayList<Integer> slots = new ArrayList<>();
        slots.add(1);
        for (String t : p.getString("times", "").split(",")) { int m = minutes(t); if (m >= 0) slots.add(m); }
        long best = Long.MAX_VALUE;
        for (int dayOff = 0; dayOff <= 1; dayOff++) {
            for (int m : slots) {
                Calendar cal = Calendar.getInstance();
                cal.setTimeInMillis(now);
                cal.add(Calendar.DAY_OF_MONTH, dayOff);
                cal.set(Calendar.HOUR_OF_DAY, m / 60);
                cal.set(Calendar.MINUTE, m % 60);
                cal.set(Calendar.SECOND, 0);
                cal.set(Calendar.MILLISECOND, 0);
                long t = cal.getTimeInMillis();
                if (t > now + 30_000L && t < best) best = t;
            }
        }
        return best;
    }

    static void schedule(Context c) {
        SharedPreferences p = prefs(c);
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        Intent i = new Intent(c, StreakAlarm.class).setAction(ACTION);
        PendingIntent pi = PendingIntent.getBroadcast(c, 1, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        if (p.getString("list", "").isEmpty()) { am.cancel(pi); return; }
        long t = nextAt(p, System.currentTimeMillis());
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, t, pi); /* ไม่ใช้นาฬิกาปลุกแบบตรงเวลา (ต้องขอสิทธิ์พิเศษ) · ช้าได้ไม่กี่นาที */
    }

    static final Object LOCK = new Object(); /* รอบปลุกซ้อนกัน/ทดสอบแจ้งเตือนพร้อมกัน = ทำทีละรอบ (กันแจ้งเตือนซ้ำ) */

    /* ทำงานในเธรดเบื้องหลัง (StreakAlarm.goAsync) · ตั้งรอบถัดไปก่อนต่อเน็ต (ระบบฆ่าโปรเซสกลางทาง = รอบปลุกยังอยู่) */
    static void tick(Context c) {
        SharedPreferences p = prefs(c);
        schedule(c);
        synchronized (LOCK) { tickLocked(c, p); }
    }

    /* ไม่ต่อเน็ต: ใช้ยอดวันนี้ที่แอพส่งมาล่าสุด (sync) · ข้ามวัน = เลื่อน base · ถึงเวลาที่ตั้งและยอดยังไม่ครบ = แจ้งเตือน */
    static void tickLocked(Context c, SharedPreferences p) {
        try {
            if (p.getString("list", "").isEmpty()) return;
            long now = System.currentTimeMillis();
            String today = dayKey(now);
            rollover(p);
            renderWidgets(c);
            int goal = p.getInt("goal", 1);
            if (p.getBoolean("notify", false) && p.getInt("today", 0) < goal && canNotify(c)) {
                Calendar cal = Calendar.getInstance();
                cal.setTimeInMillis(now);
                int nowM = cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE);
                String done = p.getString("notified", "");
                if (!done.startsWith(today)) done = ""; /* เก็บเฉพาะของวันนี้ */
                for (String t : p.getString("times", "").split(",")) {
                    int m = minutes(t);
                    if (m < 0 || nowM < m || (nowM - m) * 60_000L > LATE_MS) continue;
                    String tag = today + "|" + t;
                    if (done.contains(tag)) continue;
                    p.edit().putString("notified", done.isEmpty() ? tag : done + ";" + tag).apply();
                    notifyNow(c, t);
                    break;
                }
            }
        } catch (Throwable ignored) {
        } finally {
            schedule(c);
        }
    }
}
