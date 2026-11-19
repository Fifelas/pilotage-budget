// Vérifie s'il existe une version plus récente de l'APK publiée sur GitHub (Releases)
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { GITHUB_REPO, APP_VERSION } from "./config.js";

const cmp = (a, b) => { const x = a.split(".").map(Number), y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); } return 0; };

export async function checkUpdate() {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const r = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } });
    if (!r.ok) return null;
    const rel = await r.json(), latest = String(rel.tag_name || "").replace(/^v/, "");
    const apk = (rel.assets || []).find(a => a.name.endsWith(".apk"));
    if (!apk || cmp(latest, APP_VERSION) <= 0) return null;
    return { version: latest, url: apk.browser_download_url, notes: rel.body || "" };
  } catch { return null; }
}
export const openUrl = url => Capacitor.isNativePlatform() ? Browser.open({ url }) : window.open(url, "_blank", "noopener");
