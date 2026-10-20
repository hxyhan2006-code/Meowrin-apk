package com.han.meowrin;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/* รอบปลุกของตัวเฝ้าไฟ (AlarmManager) + เปิดเครื่องใหม่/อัปเดตแอพ = ตั้งรอบปลุกใหม่ · งานต่อเน็ตทำในเธรดแยก (goAsync) */
public class StreakAlarm extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        final Context c = context.getApplicationContext();
        final PendingResult r = goAsync();
        new Thread(new Runnable() {
            @Override
            public void run() {
                try { StreakCore.tick(c); } catch (Exception ignored) { } finally { r.finish(); }
            }
        }).start();
    }
}
