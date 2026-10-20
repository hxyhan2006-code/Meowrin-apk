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
        int base = p.getInt("base", 0), freeze = p.getInt("freeze", 0), n = p.getInt("today", 0), goal = p.getInt("goal", 2);
        boolean broke = false; /* ช่วงที่ข้ามมามีวันที่ไฟดับตอนมีไฟอยู่ไหม (ไม่ใช่แค่วันสุดท้าย) */
        for (int guard = 0; day.compareTo(today) < 0 && guard < 400; guard++) {
            if (n >= goal) base++;
            else if (freeze > 0) freeze--;
            else { if (base > 0) broke = true; base = 0; }
            n = 0;
            day = nextDay(day);
        }
        p.edit().putInt("base", base).putInt("freeze", freeze).putInt("today", 0).putString("day", today).putString("broke", broke ? today : "").apply();
    }

    /* หน้าแรกของ playlist (50 คลิปล่าสุด = พอสำหรับวันละไม่กี่คลิป) · พลาด = null ไม่แตะยอดเดิม
       timeout สั้น: goAsync ให้เวลาราว 10 วินาที */
    static JSONArray fetchItems(SharedPreferences p) {
        String key = p.getString("key", ""), list = p.getString("list", "");
        if (key.isEmpty() || list.isEmpty()) return null;
        HttpURLConnection con = null;
        try {
            URL u = new URL("https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=50&playlistId="
                    + URLEncoder.encode(list, "UTF-8") + "&key=" + URLEncoder.encode(key, "UTF-8"));
            con = (HttpURLConnection) u.openConnection();
            con.setConnectTimeout(4000);
            con.setReadTimeout(4000);
            con.setRequestProperty("Referer", "https://localhost/"); /* key ที่จำกัดโดเมนไว้ให้ตัวแอพ (WebView ส่ง localhost) ใช้ได้เหมือนกัน */
            if (con.getResponseCode() != 200) return null;
            InputStream in = con.getInputStream();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            for (int r; (r = in.read(buf)) > 0; ) out.write(buf, 0, r);
            return new JSONObject(out.toString("UTF-8")).optJSONArray("items");
        } catch (Exception e) {
            return null;
        } finally {
            if (con != null) con.disconnect();
        }
    }

    /* จำนวนคลิปที่ลงในวัน day (เวลาในมือถือ) */
    static int countDay(JSONArray items, String day) {
        SimpleDateFormat iso = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US);
        iso.setTimeZone(TimeZone.getTimeZone("UTC"));
        int n = 0;
        for (int i = 0; i < items.length(); i++) {
            try {
                JSONObject cd = items.getJSONObject(i).optJSONObject("contentDetails");
                String at = cd == null ? "" : cd.optString("videoPublishedAt", "");
                if (at.length() < 19) continue;
                Date d = iso.parse(at.substring(0, 19));
                if (d != null && day.equals(dayKey(d.getTime()))) n++;
            } catch (Exception ignored) { }
        }
        return n;
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

    /* คืนจำนวนวิดเจ็ตที่วาด (0 = ยังไม่มีวิดเจ็ตบนหน้าจอ) */
    static int draw(Context c, boolean set, boolean lit, int n, int goal, int streak, int freeze, String msg) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        int[] ids = m.getAppWidgetIds(new ComponentName(c, StreakWidget.class));
        if (ids == null || ids.length == 0) return 0;
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.streak_widget);
        v.setImageViewResource(R.id.stk_flame, lit ? R.drawable.stk_flame_on : R.drawable.stk_flame_off);
        v.setTextViewText(R.id.stk_num, set ? String.valueOf(streak) : "-");
        v.setTextColor(R.id.stk_num, lit ? 0xFFFF8A3D : 0xFF8B8F8D);
        v.setTextViewText(R.id.stk_today, set ? n + "/" + goal : "");
        v.setTextColor(R.id.stk_today, lit ? 0xFFFFC08A : 0xFFD4D4D8);
        v.setTextViewText(R.id.stk_frz, String.valueOf(freeze));
        v.setTextViewText(R.id.stk_msg, msg);
        v.setTextColor(R.id.stk_msg, lit ? 0xFFFFC08A : 0xFFD4D4D8);
        v.setOnClickPendingIntent(R.id.stk_root, openApp(c, 7));
        m.updateAppWidget(ids, v);
        return ids.length;
    }

    static void renderWidgets(Context c) {
        SharedPreferences p = prefs(c);
        rollover(p);
        boolean set = !p.getString("list", "").isEmpty();
        int goal = p.getInt("goal", 2), n = p.getInt("today", 0);
        boolean lit = set && n >= goal;
        int streak = p.getInt("base", 0) + (lit ? 1 : 0);
        draw(c, set, lit, n, goal, streak, p.getInt("freeze", 0), widgetMsg(p, set, lit, n, goal, streak));
    }

    /* ทดสอบวิดเจ็ต: โชว์ตัวอย่างสถานการณ์ที่เลือก (z ยังไม่ทำ · h ครึ่งทาง · d ไฟติด · b โบนัส · e ค่ำไฟจะดับ · r ไฟเพิ่งดับ) พร้อมข้อความสุ่มจริงจากชุดนั้น
       ค้าง 20 วินาทีแล้ววาดค่าจริงกลับ (ไม่แตะข้อมูลจริง) */
    static final Handler UI = new Handler(Looper.getMainLooper());

    static int previewWidget(Context ctx, String state) {
        final Context c = ctx.getApplicationContext();
        SharedPreferences p = prefs(c);
        int goal = p.getInt("goal", 2), base = p.getInt("base", 0) > 0 ? p.getInt("base", 0) : 12, frz = p.getInt("freeze", 1);
        boolean lit = "d".equals(state) || "b".equals(state);
        int n = "h".equals(state) ? 1 : "d".equals(state) ? goal : "b".equals(state) ? goal + 1 : 0;
        int streak = "r".equals(state) ? 0 : lit ? base + 1 : base;
        JSONArray a = pool(p, "w_" + state);
        String msg = a.length() == 0 ? "ยังไม่มีข้อความ (เปิดแอพให้ซิงก์ก่อน)" : fill(a.optString(new Random().nextInt(a.length()), ""), n, goal, streak, frz);
        int shown = draw(c, true, lit, n, goal, streak, frz, msg);
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
        return fill(s, p.getInt("today", 0), p.getInt("goal", 2), streakShown, p.getInt("freeze", 0));
    }

    static String fill(String s, int n, int goal, int streakShown, int frz) {
        return s.replace("{n}", String.valueOf(n)).replace("{left}", String.valueOf(Math.max(goal - n, 0)))
                .replace("{goal}", String.valueOf(goal)).replace("{streak}", String.valueOf(streakShown))
                .replace("{frz}", String.valueOf(frz));
    }

    static final int RECENT = 10; /* ไม่ซ้ำ 10 ข้อความล่าสุด */

    /* สุ่มจากชุดข้อความที่ระบุ (streak-msgs.js ส่งมาตอน sync = แก้ผ่าน OTA ได้) ไม่ซ้ำ RECENT ข้อความล่าสุด */
    static void notifyPool(Context c, String[] keys, int streakShown, String title) {
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
            NotificationChannel ch = new NotificationChannel(CH, "ไฟวันต่อเนื่อง", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("เตือนเมื่อวันนี้ยังทำงานไม่ครบ + ชมเมื่อไฟติด");
            nm.createNotificationChannel(ch);
            b = new Notification.Builder(c, CH);
        } else {
            b = new Notification.Builder(c).setPriority(Notification.PRIORITY_HIGH);
        }
        String text = fill(msg, p, streakShown);
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
        notifyPool(c, new String[] { slot, "any" }, prefs(c).getInt("base", 0), "วันนี้ {n}/{goal} · ไฟ {streak} วัน");
    }

    static final int[] MILESTONES = { 3, 7, 14, 30, 50, 100, 150, 200, 365, 500, 730, 1000 };

    static boolean isMilestone(int n) { for (int m : MILESTONES) if (m == n) return true; return false; }

    static int minutes(String hhmm) {
        try { String[] t = hhmm.split(":"); return Integer.parseInt(t[0]) * 60 + Integer.parseInt(t[1]); } catch (Exception e) { return -1; }
    }

    /* รอบปลุก: 00:01 (ข้ามวันให้วิดเจ็ต) + ทุก 30 นาทีช่วง 10:00–23:30 + 23:55 + เวลาแจ้งเตือนที่ตั้งไว้ */
    static long nextAt(SharedPreferences p, long now) {
        ArrayList<Integer> slots = new ArrayList<>();
        slots.add(1);
        for (int m = 10 * 60; m <= 23 * 60 + 30; m += 30) slots.add(m);
        slots.add(23 * 60 + 55);
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

    static void tickLocked(Context c, SharedPreferences p) {
        try {
            if (p.getString("list", "").isEmpty()) return;
            long now = System.currentTimeMillis();
            String today = dayKey(now), day = p.getString("day", "");
            JSONArray items = fetchItems(p);
            /* ข้ามวัน: นับยอดของวันที่ค้างไว้ก่อน (คลิปที่ลงหลังรอบเช็กสุดท้ายก่อนเที่ยงคืนจะได้ไม่หาย) แล้วค่อยเลื่อนวัน */
            if (items != null && !day.isEmpty() && day.compareTo(today) < 0) p.edit().putInt("today", countDay(items, day)).apply();
            rollover(p);
            int prevToday = p.getInt("today", 0);
            boolean prevOk = p.getLong("checkedAt", 0) > 0 && today.equals(dayKey(p.getLong("checkedAt", 0))); /* รอบก่อนเช็กวันนี้ไว้แล้ว */
            if (items != null) p.edit().putInt("today", countDay(items, today)).putLong("checkedAt", now).apply();
            renderWidgets(c);
            boolean fresh = now - p.getLong("checkedAt", 0) < 40 * 60_000L; /* เช็กไม่ได้ (เน็ต/โควต้า) และยอดเก่า = ไม่เตือนมั่ว */
            int goal = p.getInt("goal", 2);
            /* ไฟเพิ่งติด (รอบก่อนยังไม่ครบ รอบนี้ครบ) = ชมหนึ่งครั้ง (หลักไมล์ใช้ชุด ms) · ติดตั้งใหม่/ครบอยู่แล้ว/เปิดแอพเห็นเองแล้ว = ไม่ชมย้อนหลัง */
            if (items != null && prevOk && prevToday < goal && p.getInt("today", 0) >= goal && p.getBoolean("notify", false) && !today.equals(p.getString("praised", "")) && canNotify(c)) {
                int shown = p.getInt("base", 0) + 1;
                p.edit().putString("praised", today).apply();
                notifyPool(c, new String[] { isMilestone(shown) ? "ms" : "praise" }, shown, "ไฟติดแล้ว · " + shown + " วัน");
            }
            if (fresh && p.getBoolean("notify", false) && p.getInt("today", 0) < goal && canNotify(c)) {
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
