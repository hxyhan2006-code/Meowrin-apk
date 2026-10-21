package com.han.meowrin;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;

/* วิดเจ็ตไฟวันต่อเนื่องบนหน้าจอหลัก: วาดจากค่าที่เก็บไว้ (ไม่ต่อเน็ตเอง) + ตั้งรอบปลุกให้ StreakAlarm เช็กยอดวันนี้ */
public class StreakWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        StreakCore.renderWidgets(c);
        StreakCore.schedule(c);
    }

    @Override
    public void onEnabled(Context c) {
        StreakCore.renderWidgets(c);
        StreakCore.schedule(c);
    }

    /* ผู้ใช้ย่อ/ขยายวิดเจ็ต: วาดใหม่ให้ข้อความพอดีความกว้างใหม่ */
    @Override
    public void onAppWidgetOptionsChanged(Context c, AppWidgetManager m, int id, Bundle opts) {
        StreakCore.renderWidgets(c);
    }
}
