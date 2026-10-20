package com.han.meowrin;

import android.Manifest;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/* ปลั๊กอิน Streak (streak.js เรียกผ่าน Capacitor.Plugins.Streak): ส่งค่าสตรีคให้วิดเจ็ต/แจ้งเตือน · ขอสิทธิ์แจ้งเตือน · เปิดตั้งค่าแบต · ปักวิดเจ็ต
   แตะวิดเจ็ต/แจ้งเตือน = เปิดแอพพร้อม extra meowrin_open=streak → event "open" / consumeOpen() ให้ streak.js เปิดหน้าวันต่อเนื่อง */
@CapacitorPlugin(name = "Streak", permissions = { @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notify") })
public class StreakPlugin extends Plugin {
    private boolean pendingOpen = false;

    @Override
    public void load() {
        Intent i = getActivity().getIntent();
        if (isOpen(i)) { pendingOpen = true; i.removeExtra(StreakCore.OPEN); }
    }

    @Override
    protected void handleOnNewIntent(Intent i) {
        super.handleOnNewIntent(i);
        if (!isOpen(i)) return;
        i.removeExtra(StreakCore.OPEN);
        pendingOpen = true;
        notifyListeners("open", new JSObject());
    }

    private static boolean isOpen(Intent i) { return i != null && "streak".equals(i.getStringExtra(StreakCore.OPEN)); }

    @PluginMethod
    public void consumeOpen(PluginCall call) {
        JSObject r = new JSObject();
        r.put("open", pendingOpen);
        pendingOpen = false;
        call.resolve(r);
    }

    @PluginMethod
    public void sync(PluginCall call) {
        Context c = getContext();
        SharedPreferences.Editor e = StreakCore.prefs(c).edit();
        e.putString("key", call.getString("key", ""));
        e.putString("list", call.getString("list", ""));
        e.putInt("goal", call.getInt("goal", 2));
        e.putInt("base", call.getInt("base", 0));
        e.putInt("freeze", call.getInt("freeze", 0));
        e.putInt("today", call.getInt("today", 0));
        e.putString("day", call.getString("day", StreakCore.dayKey(System.currentTimeMillis())));
        if (call.hasOption("broke")) e.putString("broke", call.getString("broke", "")); /* JS รุ่นเก่าไม่ส่ง = ไม่ทับค่าที่เนทีฟจดไว้ */
        e.putBoolean("notify", call.getBoolean("notify", false));
        JSArray times = call.getArray("times", new JSArray());
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < times.length(); i++) { if (i > 0) sb.append(','); sb.append(times.optString(i, "")); }
        e.putString("times", sb.toString());
        JSObject msgs = call.getObject("msgs", new JSObject());
        e.putString("msgs", msgs.toString());
        e.apply();
        StreakCore.renderWidgets(c);
        StreakCore.schedule(c);
        status(call);
    }

    @PluginMethod
    public void status(PluginCall call) {
        Context c = getContext();
        JSObject r = new JSObject();
        r.put("notify", StreakCore.canNotify(c));
        PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
        r.put("battery", pm != null && pm.isIgnoringBatteryOptimizations(c.getPackageName()));
        int[] ids = AppWidgetManager.getInstance(c).getAppWidgetIds(new ComponentName(c, StreakWidget.class));
        r.put("widgets", ids == null ? 0 : ids.length);
        r.put("canPin", Build.VERSION.SDK_INT >= 26 && AppWidgetManager.getInstance(c).isRequestPinAppWidgetSupported());
        r.put("checkedAt", StreakCore.prefs(c).getLong("checkedAt", 0));
        call.resolve(r);
    }

    @PluginMethod
    public void requestNotify(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33 || getPermissionState("notify") == PermissionState.GRANTED) { status(call); return; }
        requestPermissionForAlias("notify", call, "notifyCb");
    }

    @PermissionCallback
    private void notifyCb(PluginCall call) { status(call); }

    /* หน้าข้อมูลแอพของระบบ (แบตเตอรี่ → ไม่จำกัด/อนุญาตทำงานเบื้องหลัง · แจ้งเตือน) ใช้ได้ทุกยี่ห้อ */
    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    @PluginMethod
    public void pinWidget(PluginCall call) {
        JSObject r = new JSObject();
        boolean ok = false;
        if (Build.VERSION.SDK_INT >= 26) {
            AppWidgetManager m = AppWidgetManager.getInstance(getContext());
            if (m.isRequestPinAppWidgetSupported()) ok = m.requestPinAppWidget(new ComponentName(getContext(), StreakWidget.class), null, null);
        }
        r.put("ok", ok);
        call.resolve(r);
    }

    @PluginMethod
    public void test(PluginCall call) {
        StreakCore.notifyNow(getContext(), call.getString("slot", "any"));
        call.resolve();
    }
}
