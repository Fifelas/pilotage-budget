package fr.fifelas.pilotagebudget;

import android.app.Notification;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Lit uniquement les notifications des applis bancaires et de paiement qui contiennent un montant en euros.
 * Les textes restent sur le téléphone (préférences privées de l'appli) jusqu'à ce que l'appli les récupère.
 */
public class BankNotificationService extends NotificationListenerService {
    static final String PREFS = "pb_bank_notifs";
    static final String[] KEYWORDS = {
        "caisseepargne", "caisse_epargne", "creditmutuel", "cm_prod", "cmb", "cic", "banquepopulaire", "bpce",
        "creditagricole", "lcl", "bnpparibas", "hellobank", "societegenerale", "labanquepostale",
        "boursorama", "fortuneo", "monabanq", "com.ing.", "revolut", "n26", "nickel", "qonto", "lydia", "sumeria",
        "paypal", "wero", "paylib", "walletnfcrel", "spay", "samsung.android.spay", "orange.bank", "ma_french_bank"
    };

    static boolean isBank(String pkg) {
        String p = pkg.toLowerCase();
        for (String k : KEYWORDS) if (p.contains(k)) return true;
        return false;
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            if (sbn == null || !isBank(sbn.getPackageName())) return;
            Bundle ex = sbn.getNotification().extras;
            if (ex == null) return;
            CharSequence title = ex.getCharSequence(Notification.EXTRA_TITLE);
            CharSequence text = ex.getCharSequence(Notification.EXTRA_BIG_TEXT);
            if (text == null) text = ex.getCharSequence(Notification.EXTRA_TEXT);
            if (text == null) return;
            String all = (title == null ? "" : title.toString()) + " " + text;
            if (!all.contains("€") && !all.toUpperCase().contains("EUR")) return;

            SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
            JSONArray queue = new JSONArray(prefs.getString("queue", "[]"));
            String key = sbn.getKey() + "|" + text;
            for (int i = 0; i < queue.length(); i++) if (key.equals(queue.getJSONObject(i).optString("k"))) return;
            JSONObject o = new JSONObject();
            o.put("k", key);
            o.put("pkg", sbn.getPackageName());
            o.put("title", title == null ? "" : title.toString());
            o.put("text", text.toString());
            o.put("t", sbn.getPostTime());
            queue.put(o);
            JSONArray kept = new JSONArray();
            for (int i = Math.max(0, queue.length() - 200); i < queue.length(); i++) kept.put(queue.get(i));
            prefs.edit().putString("queue", kept.toString()).apply();
        } catch (Exception ignored) {
            // une notification illisible ne doit jamais faire planter le service
        }
    }
}
