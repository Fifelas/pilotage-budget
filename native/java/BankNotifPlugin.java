package fr.fifelas.pilotagebudget;

import android.content.Intent;
import android.content.SharedPreferences;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "BankNotif")
public class BankNotifPlugin extends Plugin {

    @PluginMethod
    public void isEnabled(PluginCall call) {
        String flat = Settings.Secure.getString(getContext().getContentResolver(), "enabled_notification_listeners");
        JSObject r = new JSObject();
        r.put("enabled", flat != null && flat.contains(getContext().getPackageName()));
        call.resolve(r);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent i = new Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS");
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    @PluginMethod
    public void take(PluginCall call) {
        SharedPreferences p = getContext().getSharedPreferences(BankNotificationService.PREFS, android.content.Context.MODE_PRIVATE);
        String q = p.getString("queue", "[]");
        p.edit().putString("queue", "[]").apply();
        JSObject r = new JSObject();
        r.put("json", q);
        call.resolve(r);
    }
}
