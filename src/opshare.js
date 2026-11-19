// Partager ses tickets de caisse avec Open Prices (base collaborative, licence ODbL).
// Il faut un compte Open Food Facts (gratuit). Le mot de passe n'est jamais gardé : seul le jeton de session l'est.
// Attention : la photo du ticket devient PUBLIQUE sur Open Prices.
const API = "https://prices.openfoodfacts.org/api/v1";
const K = "pb-op-session";

export const opAccount = () => { try { return JSON.parse(localStorage.getItem(K)); } catch { return null; } };
export function opLogout() { localStorage.removeItem(K); }

export async function opLogin(username, password) {
  const body = new URLSearchParams({ username: username.trim(), password });
  const r = await fetch(`${API}/auth`, { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  if (r.status === 401 || r.status === 403) throw new Error("Identifiant ou mot de passe Open Food Facts incorrect.");
  if (!r.ok) throw new Error("Open Prices ne répond pas (" + r.status + "). Réessaie plus tard.");
  const d = await r.json(); if (!d.access_token) throw new Error("Connexion refusée par Open Prices.");
  localStorage.setItem(K, JSON.stringify({ user: username.trim(), token: d.access_token, t: Date.now() }));
  return opAccount();
}

// Réduit la photo (le ticket reste lisible) pour un envoi rapide en 4G
async function shrink(file, max = 2000) {
  try {
    const img = await createImageBitmap(file), k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return await new Promise(ok => c.toBlob(b => ok(b || file), "image/jpeg", 0.85));
  } catch { return file; }
}

// store : { id: "node/123" | "way/456", name } (magasin choisi dans « En magasin »)
export async function uploadReceipt(file, { store, date, total, count }) {
  const a = opAccount(); if (!a) throw new Error("Connecte d'abord ton compte Open Food Facts (dans Plus).");
  const f = new FormData();
  f.append("file", await shrink(file), "ticket.jpg");
  f.append("type", "RECEIPT");
  f.append("currency", "EUR");
  f.append("date", date);
  f.append("owner_consumption", "true");
  if (store && /^(node|way|relation)\/\d+$/.test(store.id || "")) { const [t, id] = store.id.split("/"); f.append("location_osm_type", t.toUpperCase()); f.append("location_osm_id", id); }
  if (total > 0) f.append("receipt_price_total", String(Math.round(total * 100) / 100));
  if (count > 0) f.append("receipt_price_count", String(count));
  const r = await fetch(`${API}/proofs/upload`, { method: "POST", body: f, headers: { Authorization: "Bearer " + a.token } });
  if (r.status === 401 || r.status === 403) { opLogout(); throw new Error("Session Open Food Facts expirée : reconnecte-toi dans Plus."); }
  if (!r.ok) { let m = ""; try { m = JSON.stringify(await r.json()).slice(0, 160); } catch {} throw new Error("Envoi refusé par Open Prices (" + r.status + ") " + m); }
  return r.json();
}
