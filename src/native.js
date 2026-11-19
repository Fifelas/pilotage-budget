// Fonctions propres au téléphone : scan de code-barres (Google, sans permission caméra) et paiements lus
// dans les notifications des applis bancaires. Sur ordinateur, on bascule sur une saisie manuelle.
import { Capacitor, registerPlugin } from "@capacitor/core";

export const isNative = () => Capacitor.isNativePlatform();
const BankNotif = registerPlugin("BankNotif");

/* ---------- Code-barres ---------- */
export async function scanBarcode() {
  if (isNative()) {
    const { BarcodeScanner, BarcodeFormat } = await import("@capacitor-mlkit/barcode-scanning");
    const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
    if (!available) { await BarcodeScanner.installGoogleBarcodeScannerModule(); throw new Error("Installation du scanner Google en cours : réessaie dans quelques secondes."); }
    const { barcodes } = await BarcodeScanner.scan({ formats: [BarcodeFormat.Ean13, BarcodeFormat.Ean8, BarcodeFormat.UpcA, BarcodeFormat.UpcE] });
    return barcodes.length ? barcodes[0].rawValue : null;
  }
  const v = prompt("Code-barres (les chiffres sous les barres) :");
  return v ? v.replace(/\D/g, "") || null : null;
}

/* ---------- Notifications bancaires ---------- */
export async function notifStatus() { if (!isNative()) return { available: false }; try { const r = await BankNotif.isEnabled(); return { available: true, enabled: !!r.enabled }; } catch { return { available: false }; } }
export async function notifOpenSettings() { if (isNative()) await BankNotif.openSettings(); }

// Lit les notifications reçues depuis la dernière ouverture et les transforme en paiements
export async function takeBankNotifications() {
  if (!isNative()) return [];
  let raw = [];
  try { raw = JSON.parse((await BankNotif.take()).json || "[]"); } catch { return []; }
  return raw.map(parseNotification).filter(Boolean);
}

// « Paiement de 12,50 € chez CARREFOUR » · « Achat CB 8,90 EUR BOULANGERIE » · « -23,10 € LECLERC »
export function parseNotification(n) {
  const text = `${n.title || ""} ${n.text || ""}`.replace(/\s+/g, " ").trim();
  const m = /([+\-−]?\s?\d{1,3}(?:[ .  ]\d{3})*(?:[.,]\d{1,2})?)\s?(?:€|EUR\b)/i.exec(text) || /(?:€|EUR)\s?([+-]?\d+(?:[.,]\d{1,2})?)/i.exec(text);
  if (!m) return null;
  const v = parseFloat(m[1].replace(/[\s.  ](?=\d{3}\b)/g, "").replace("−", "-").replace(/\s/g, "").replace(",", "."));
  if (!isFinite(v) || v === 0 || Math.abs(v) > 20000) return null;
  if (/solde|plafond|disponible|alerte de solde|découvert autorisé/i.test(text) && !/paiement|achat|débit|prélèvement|retrait/i.test(text)) return null;
  const credit = /reçu|crédit|virement entrant|remboursement|versement/i.test(text) && !/débit|paiement|achat/i.test(text);
  const amount = Math.round((credit ? Math.abs(v) : -Math.abs(v)) * 100) / 100;
  let label = null;
  const chez = /(?:chez|auprès de)\s+(.+?)(?:\s+(?:le|du)\s+\d|[,;!]|\.\s|$)/i.exec(text);
  if (chez) label = chez[1];
  else {
    const after = text.slice(m.index + m[0].length).replace(/^[\s·•:\-–,]+/, "").replace(/^(de|à|pour|chez)\s+/i, "");
    const w = /^([A-ZÀ-Ý0-9][\wÀ-ÿ'&.\- ]{2,40})/.exec(after); if (w) label = w[1];
  }
  label = (label || n.title || "Paiement").replace(/\s+(le|du)\s+\d{1,2}\/\d{1,2}.*$/i, "").replace(/\s+\d{2}\/\d{2}.*$/, "").trim().slice(0, 40);
  return { id: `${n.t}-${Math.abs(amount)}`, t: n.t || Date.now(), pkg: n.pkg || "", title: n.title || "", text: (n.text || "").slice(0, 200), amount, label };
}
