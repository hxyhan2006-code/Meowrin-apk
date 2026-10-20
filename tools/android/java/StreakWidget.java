package com.han.meowrin;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

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
}
