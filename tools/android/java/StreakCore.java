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
        for (int guard = 0; day.compareTo(today) < 0 && guard < 400; guard++) {
            if (n >= goal) base++;
            else if (freeze > 0) freeze--;
            else base = 0;
            n = 0;
            day = nextDay(day);
        }
        p.edit().putInt("base", base).putInt("freeze", freeze).putInt("today", 0).putString("day", today).apply();
    }

    /* นับคลิปที่ลงวันนี้ (หน้าแรกของ playlist 50 คลิป = พอสำหรับวันละไม่กี่คลิป) · พลาด = คืน -1 ไม่แตะยอดเดิม */
    static int fetchToday(SharedPreferences p) {
        String key = p.getString("key", ""), list = p.getString("list", "");
        if (key.isEmpty() || list.isEmpty()) return -1;
        HttpURLConnection con = null;
        try {
            URL u = new URL("https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=50&playlistId="
                    + URLEncoder.encode(list, "UTF-8") + "&key=" + URLEncoder.encode(key, "UTF-8"));
            con = (HttpURLConnection) u.openConnection();
            con.setConnectTimeout(8000);
            con.setReadTimeout(8000);
            con.setRequestProperty("Referer", "https://localhost/"); /* key ที่จำกัดโดเมนไว้ให้ตัวแอพ (WebView ส่ง localhost) ใช้ได้เหมือนกัน */
            if (con.getResponseCode() != 200) return -1;
            InputStream in = con.getInputStream();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            for (int r; (r = in.read(buf)) > 0; ) out.write(buf, 0, r);
            JSONArray items = new JSONObject(out.toString("UTF-8")).optJSONArray("items");
            if (items == null) return -1;
            SimpleDateFormat iso = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US);
            iso.setTimeZone(TimeZone.getTimeZone("UTC"));
            String today = dayKey(System.currentTimeMillis());
            int n = 0;
            for (int i = 0; i < items.length(); i++) {
                JSONObject cd = items.getJSONObject(i).optJSONObject("contentDetails");
                String at = cd == null ? "" : cd.optString("videoPublishedAt", "");
                if (at.length() < 19) continue;
                Date d = iso.parse(at.substring(0, 19));
                if (d != null && today.equals(dayKey(d.getTime()))) n++;
            }
            return n;
        } catch (Exception e) {
            return -1;
        } finally {
            if (con != null) con.disconnect();
        }
    }

    static PendingIntent openApp(Context c, int req) {
        Intent i = new Intent(c, MainActivity.class);
        i.putExtra(OPEN, "streak");
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, req, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void renderWidgets(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        int[] ids = m.getAppWidgetIds(new ComponentName(c, StreakWidget.class));
        if (ids == null || ids.length == 0) return;
        SharedPreferences p = prefs(c);
        rollover(p);
        boolean set = !p.getString("list", "").isEmpty();
        int goal = p.getInt("goal", 2), n = p.getInt("today", 0), freeze = p.getInt("freeze", 0);
        boolean lit = set && n >= goal;
        int streak = p.getInt("base", 0) + (lit ? 1 : 0);
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.streak_widget);
        v.setImageViewResource(R.id.stk_flame, lit ? R.drawable.stk_flame_on : R.drawable.stk_flame_off);
        v.setTextViewText(R.id.stk_num, set ? String.valueOf(streak) : "-");
        v.setTextColor(R.id.stk_num, lit ? 0xFFFF8A3D : 0xFF8B8F8D);
        v.setTextViewText(R.id.stk_today, !set ? "ตั้งช่องในแอพ" : lit ? "ไฟติดแล้ว " + n + "/" + goal : "วันนี้ " + n + "/" + goal);
        v.setTextColor(R.id.stk_today, lit ? 0xFFFFC08A : 0xFFD4D4D8);
        v.setTextViewText(R.id.stk_frz, String.valueOf(freeze));
        v.setOnClickPendingIntent(R.id.stk_root, openApp(c, 7));
        m.updateAppWidget(ids, v);
    }

    static boolean canNotify(Context c) {
        if (Build.VERSION.SDK_INT >= 33 && c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        return nm != null && nm.areNotificationsEnabled();
    }

    static String fill(String s, SharedPreferences p) {
        int goal = p.getInt("goal", 2), n = p.getInt("today", 0);
        return s.replace("{n}", String.valueOf(n)).replace("{left}", String.valueOf(Math.max(goal - n, 0)))
                .replace("{goal}", String.valueOf(goal)).replace("{streak}", String.valueOf(p.getInt("base", 0)))
                .replace("{frz}", String.valueOf(p.getInt("freeze", 0)));
    }

    /* สุ่มข้อความจากชุดของช่วงเวลานั้น + ชุดใช้ได้ทุกเวลา (ข้อความอยู่ใน streak.js ส่งมาตอน sync = แก้ผ่าน OTA ได้) ไม่ซ้ำอันล่าสุด */
    static void notifyNow(Context c, String slot) {
        SharedPreferences p = prefs(c);
        ArrayList<String> pool = new ArrayList<>();
        try {
            JSONObject msgs = new JSONObject(p.getString("msgs", "{}"));
            for (String k : new String[] { slot, "any" }) {
                JSONArray a = msgs.optJSONArray(k);
                if (a != null) for (int i = 0; i < a.length(); i++) pool.add(a.getString(i));
            }
        } catch (Exception ignored) { }
        if (pool.isEmpty()) pool.add("วันนี้ยังไม่ได้ทำงาน {n}/{goal}");
        String last = p.getString("lastMsg", ""), msg = pool.get(0);
        Random r = new Random();
        for (int i = 0; i < 6; i++) { msg = pool.get(r.nextInt(pool.size())); if (!msg.equals(last) || pool.size() == 1) break; }
        p.edit().putString("lastMsg", msg).apply();
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CH, "ไฟวันต่อเนื่อง", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("เตือนเมื่อวันนี้ยังลงคลิปไม่ครบ");
            nm.createNotificationChannel(ch);
            b = new Notification.Builder(c, CH);
        } else {
            b = new Notification.Builder(c).setPriority(Notification.PRIORITY_HIGH);
        }
        String text = fill(msg, p);
        b.setSmallIcon(R.drawable.stk_notif)
                .setColor(0xFFFF8A3D)
                .setContentTitle(fill("วันนี้ {n}/{goal} · ไฟ {streak} วัน", p))
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setAutoCancel(true)
                .setContentIntent(openApp(c, 8));
        nm.notify(4201, b.build());
    }

    static int minutes(String hhmm) {
        try { String[] t = hhmm.split(":"); return Integer.parseInt(t[0]) * 60 + Integer.parseInt(t[1]); } catch (Exception e) { return -1; }
    }

    /* รอบปลุก: 00:01 (ข้ามวันให้วิดเจ็ต) + ทุก 30 นาทีช่วง 10:00–23:30 + เวลาแจ้งเตือนที่ตั้งไว้ */
    static long nextAt(SharedPreferences p, long now) {
        ArrayList<Integer> slots = new ArrayList<>();
        slots.add(1);
        for (int m = 10 * 60; m <= 23 * 60 + 30; m += 30) slots.add(m);
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

    /* ทำงานในเธรดเบื้องหลัง (StreakAlarm.goAsync) */
    static void tick(Context c) {
        SharedPreferences p = prefs(c);
        try {
            rollover(p);
            if (!p.getString("list", "").isEmpty()) {
                int n = fetchToday(p);
                if (n >= 0) p.edit().putInt("today", n).putLong("checkedAt", System.currentTimeMillis()).apply();
                renderWidgets(c);
                int goal = p.getInt("goal", 2);
                if (p.getBoolean("notify", false) && p.getInt("today", 0) < goal && canNotify(c)) {
                    long now = System.currentTimeMillis();
                    Calendar cal = Calendar.getInstance();
                    cal.setTimeInMillis(now);
                    int nowM = cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE);
                    String today = dayKey(now), done = p.getString("notified", "");
                    for (String t : p.getString("times", "").split(",")) {
                        int m = minutes(t);
                        if (m < 0 || nowM < m || (nowM - m) * 60_000L > LATE_MS) continue;
                        String tag = today + "|" + t;
                        if (done.contains(tag)) continue;
                        p.edit().putString("notified", tag + ";" + (done.length() > 200 ? "" : done)).apply();
                        notifyNow(c, t);
                        break;
                    }
                }
            }
        } finally {
            schedule(c);
        }
    }
}
