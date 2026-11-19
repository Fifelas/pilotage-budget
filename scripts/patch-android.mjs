// Ajoute au projet Android généré (npx cap add android) le lecteur de notifications bancaires.
import fs from "node:fs";
import path from "node:path";
const pkgDir = "android/app/src/main/java/fr/fifelas/pilotagebudget";
fs.mkdirSync(pkgDir, { recursive: true });
for (const f of fs.readdirSync("native/java")) fs.copyFileSync(path.join("native/java", f), path.join(pkgDir, f));
const mf = "android/app/src/main/AndroidManifest.xml";
let x = fs.readFileSync(mf, "utf8");
if (!x.includes("BankNotificationService")) {
  x = x.replace("</application>", `    <service android:name=".BankNotificationService" android:label="Pilotage budget — paiements" android:permission="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE" android:exported="true">
            <intent-filter><action android:name="android.service.notification.NotificationListenerService" /></intent-filter>
        </service>
    </application>`);
  fs.writeFileSync(mf, x);
}
console.log("Projet Android complété : lecteur de notifications bancaires ajouté.");
