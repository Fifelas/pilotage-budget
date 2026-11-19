// Complète le projet Android généré (npx cap add android).
// La lecture des notifications bancaires est DÉSACTIVÉE par défaut : depuis 2025, Google Play Protect
// (« protection renforcée contre la fraude ») bloque l'installation hors Play Store des applis qui la demandent.
// Pour l'activer quand même (installation par câble USB / adb) : variable BANK_NOTIF=1 dans le workflow.
import fs from "node:fs";
import path from "node:path";
// Traducteur ML Kit : le module d'origine n'autorise le téléchargement du modèle français qu'en Wi-Fi et ne signale
// jamais l'échec (la traduction restait bloquée en 4G / partage de connexion). On autorise les données mobiles
// et on remonte l'erreur. L'appli ne lance ce téléchargement (≈ 30 Mo) qu'à ta demande, depuis « Plus ».
const tr = "node_modules/@capacitor-mlkit/translation/android/src/main/java/io/capawesome/capacitorjs/plugins/mlkit/translation/Translation.java";
if (fs.existsSync(tr)) {
  let j = fs.readFileSync(tr, "utf8");
  j = j.replaceAll("new DownloadConditions.Builder().requireWifi().build()", "new DownloadConditions.Builder().build()");
  j = j.replace(/(modelManager\s*\.download\(frenchModel, conditions\)[\s\S]*?\.addOnFailureListener\(exception -> \{)(\s*\}\);)/, "$1\n                resultCallback.error(exception);$2");
  fs.writeFileSync(tr, j);
  console.log("Traducteur : téléchargement autorisé hors Wi-Fi, erreurs remontées.");
}
if (process.env.BANK_NOTIF !== "1") { console.log("Lecture des notifications bancaires non incluse (compatible Play Protect)."); process.exit(0); }
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
console.log("Lecture des notifications bancaires ajoutée.");
