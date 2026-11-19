// Petits outils d'interface partagés par tous les écrans
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const eur = (v, d = 0) => (Number(v) || 0).toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d }) + " €";
export const eur2 = v => eur(v, Math.abs(v) < 100 && Math.round(v) !== v ? 2 : 0);
export const dFR = iso => new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
export const dLong = iso => new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
export const pad2 = n => String(n).padStart(2, "0");
export const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
export const isoPlus = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
export const daysUntil = iso => Math.round((new Date(iso + "T12:00:00") - new Date(isoToday() + "T12:00:00")) / 864e5);
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const num = v => { const n = parseFloat(String(v ?? "").replace(/\s/g, "").replace(",", ".")); return isFinite(n) ? n : NaN; };

export function toast(msg) {
  const t = document.getElementById("toast"); t.textContent = msg; t.classList.add("on");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("on"), 2600);
}
export const errText = e => {
  const m = (e && (e.message || e.error_description)) || String(e);
  if (/Invalid login/i.test(m)) return "E-mail ou mot de passe incorrect.";
  if (/Email not confirmed/i.test(m)) return "Confirme d'abord ton adresse : ouvre le lien reçu par e-mail.";
  if (/already registered/i.test(m)) return "Un compte existe déjà avec cet e-mail : connecte-toi.";
  if (/Password should be/i.test(m)) return "Mot de passe trop court (8 caractères minimum).";
  if (/code inconnu/i.test(m)) return "Ce code d'invitation n'existe pas.";
  if (/Failed to fetch|NetworkError|aborted/i.test(m)) return "Pas de connexion internet (ou service indisponible).";
  if (/household_vault|vault_put|pantry_items|column .* does not exist|schema cache/i.test(m)) return "Mise à jour de la base à faire : exécute le fichier 002 dans Supabase.";
  return m;
};

// Fenêtre qui monte du bas de l'écran. Renvoie {el, close}.
export function sheet(html, { onClose } = {}) {
  const ov = document.createElement("div"); ov.className = "sheetwrap";
  ov.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="grab" aria-hidden="true"></div>${html}</div>`;
  document.body.appendChild(ov); document.body.classList.add("noscroll");
  const close = () => { ov.remove(); if (!document.querySelector(".sheetwrap")) document.body.classList.remove("noscroll"); onClose && onClose(); };
  ov.addEventListener("click", e => { if (e.target === ov || e.target.closest("[data-close]")) close(); });
  const f = ov.querySelector("[autofocus]"); if (f) setTimeout(() => f.focus(), 60);
  return { el: ov.querySelector(".sheet"), close };
}

const loaded = {};
export function loadScript(src) {
  return loaded[src] || (loaded[src] = new Promise((ok, ko) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => ko(new Error("Chargement impossible : " + src)); document.head.appendChild(s); }));
}
