// Onglet « Plus » : mes données, le foyer, le coffre partagé, les réglages.
import { esc, eur, $, sheet } from "./ui.js";
import { APP_VERSION } from "./config.js";
import { notifStatus, notifOpenSettings, isNative } from "./native.js";
import { home, setHomeCity, ATTRIB } from "./apis.js";

const DETAILS = [
  ["plus", "comptes", "🗂️", "Relevés et import", "Ajouter un relevé, une sauvegarde, tes règles"],
  ["plus", "operations", "🔎", "Toutes les opérations", "Rechercher, corriger une catégorie"],
  ["plus", "recurrents", "🔁", "Prélèvements et abonnements", "Ce qui part chaque mois"],
  ["plus", "paieT", "💼", "Fiche de paie", "Bulletins, frais remboursés"],
  ["pret", "pret", "🏡", "Mon prêt", "Échéancier, remboursement anticipé"],
  ["pret", "simu", "👫", "Projets et couple", "Simulations"],
  ["plus", "categories", "📊", "Dépenses par catégorie", "Moyennes sur la période"]
];

export async function renderPlus(ctx, main) {
  const S = ctx.S, [vs, vextra] = S.vaultStatus || ["off", ""], h = home(), ns = await notifStatus();
  main.innerHTML = `<header class="hello"><h1>Plus</h1></header>
  <div class="card list">${DETAILS.map(([g, s, ic, t, d], i) => `<button class="line" data-det="${i}"><span class="ic" aria-hidden="true">${ic}</span><span class="tx"><b>${t}</b><small>${d}</small></span><span class="chev" aria-hidden="true">›</span></button>`).join("")}</div>

  <div class="card" id="vaultst"><div class="sechead"><h2>🔐 Budget partagé du foyer</h2><span class="badge ${vs === "ok" ? "ok" : vs === "err" || vs === "phrase" ? "bad" : ""}">${vs === "ok" ? "actif" : vs === "off" ? "désactivé" : "à vérifier"}</span></div>
    ${vs === "off" ? `<p class="hint">Relevés, paie et prêt sont chiffrés sur ce téléphone avec une phrase secrète, puis partagés avec l'autre membre du foyer. Personne d'autre ne peut les lire, pas même Supabase.</p>
      <label class="f" for="v_p">Phrase secrète du foyer</label><input id="v_p" type="password" autocomplete="new-password" placeholder="ex. trois mots qu'on retient facilement">
      <p class="sub">La même sur les deux téléphones. Si vous l'oubliez tous les deux, le budget partagé est perdu (la sauvegarde en fichier reste possible).</p>
      <button class="btn full mt" id="v_on">Activer le partage</button><div id="v_msg" class="err"></div>`
    : `<p class="hint">${vs === "ok" ? "Chaque import ou saisie est chiffré puis envoyé à l'autre téléphone automatiquement." : esc(vextra || "Synchronisation en attente.")}</p>
      <div class="row"><button class="btn ghost" id="v_sync">Synchroniser</button><button class="btn ghost" id="v_off">Désactiver ici</button></div>`}
  </div>

  <div class="card"><h2>🏠 Mon foyer</h2>
    <p class="hint">Code à donner à ton conjoint : il crée son compte puis choisit « Rejoindre un foyer ».</p><div class="code">${esc(S.household.invite_code)}</div>
    <p class="sub mt">Membres : ${S.members.map(m => esc(m.display_name || "?")).join(", ")}</p>
    <label class="f" for="mn">Mon prénom</label><div class="row"><input id="mn" value="${esc(S.me.display_name)}"><button class="btn ghost" id="mnsave">OK</button></div></div>

  <div class="card"><h2>⚙️ Réglages</h2>
    <button class="line" id="r_city"><span class="ic">📍</span><span class="tx"><b>Ville pour les prix</b><small>${h ? esc(h.city) + (h.postcode ? " (" + esc(h.postcode) + ")" : "") : "non renseignée"}</small></span><span class="chev">›</span></button>
    ${ns.available ? `<button class="line" id="r_notif"><span class="ic">📲</span><span class="tx"><b>Lecture des paiements</b><small>${ns.enabled ? "activée" : "désactivée"} · notifications de ta banque</small></span><span class="chev">›</span></button>` : ""}
    <button class="line" id="r_upd"><span class="ic">🆕</span><span class="tx"><b>Mises à jour</b><small id="r_updt">Version ${esc(APP_VERSION)}</small></span><span class="chev">›</span></button>
    <button class="line" id="r_out"><span class="ic">🚪</span><span class="tx"><b>Se déconnecter</b><small>${esc(S.session.user.email)}</small></span></button>
  </div>
  <p class="foot">${ATTRIB} Recettes et prix indicatifs : base intégrée (UFC-Que Choisir 2026 pour les écarts entre enseignes). PDF : pdf.js ; Excel : SheetJS.</p>`;

  main.querySelectorAll("[data-det]").forEach(b => b.onclick = () => { const [g, s, , t] = DETAILS[+b.dataset.det]; ctx.detail(g, s, t); });
  if ($("#v_on")) $("#v_on").onclick = async () => {
    const b = $("#v_on"), m = $("#v_msg"); b.disabled = true; b.textContent = "Chiffrement…"; m.textContent = "";
    try { await S.vault.setup($("#v_p").value); ctx.toast("Partage activé"); renderPlus(ctx, main); }
    catch (e) { m.textContent = ctx.errText(e); b.disabled = false; b.textContent = "Activer le partage"; }
  };
  if ($("#v_sync")) $("#v_sync").onclick = async () => { await S.vault.pull(); S.vault.schedule(); ctx.toast("Synchronisé"); };
  if ($("#v_off")) $("#v_off").onclick = () => {
    const { el, close } = sheet(`<h2>Désactiver le partage sur ce téléphone ?</h2><p class="hint">Tes données restent sur ce téléphone. Il faudra resaisir la phrase pour réactiver.</p><button class="btn full" id="vo">Désactiver</button><button class="btn ghost full mt" data-close>Annuler</button>`);
    el.querySelector("#vo").onclick = async () => { await S.vault.forget(); close(); renderPlus(ctx, main); };
  };
  $("#mnsave").onclick = async () => {
    const v = $("#mn").value.trim();
    const { error } = await ctx.sb.from("household_members").update({ display_name: v }).eq("household_id", S.household.id).eq("user_id", S.session.user.id);
    if (error) return ctx.toast(ctx.errText(error)); S.me.display_name = v; await ctx.loadMembers(); localStorage.setItem("pb-name", v); ctx.toast("Prénom enregistré");
  };
  $("#r_city").onclick = () => {
    const { el, close } = sheet(`<h2>Ville pour les prix</h2><p class="hint">Sert à trouver les supermarchés et les prix relevés près de chez toi. Une seule recherche, gardée sur le téléphone.</p>
      <form id="cf" class="row"><input id="cv" placeholder="ex. Nantes ou 44000" value="${h ? esc(h.city) : ""}" autofocus aria-label="Ville"><button class="btn">OK</button></form><div id="cm" class="err"></div>`);
    el.querySelector("#cf").onsubmit = async e => { e.preventDefault(); try { await setHomeCity(el.querySelector("#cv").value.trim()); close(); renderPlus(ctx, main); } catch (err) { el.querySelector("#cm").textContent = err.message === "Ville introuvable" ? "Ville introuvable." : ctx.errText(err); } };
  };
  if ($("#r_notif")) $("#r_notif").onclick = () => {
    const { el } = sheet(`<h2>Lecture des paiements</h2><p class="hint">Quand ta banque t'envoie une notification de paiement, l'appli récupère le montant et le commerçant pour te proposer la dépense dans « Aujourd'hui ». Seules les applis bancaires et de paiement sont lues ; rien n'est envoyé ailleurs.</p>
      <p class="sub">Dans l'écran qui s'ouvre, active « Pilotage budget — paiements ». Il faut que les notifications de ta banque soient activées.</p><button class="btn full" id="no">${ns.enabled ? "Ouvrir les réglages Android" : "Activer"}</button>`);
    el.querySelector("#no").onclick = notifOpenSettings;
  };
  $("#r_upd").onclick = async () => { $("#r_updt").textContent = "Recherche…"; const u = await ctx.checkUpdate(); $("#r_updt").textContent = u ? `Version ${u.version} disponible (bannière en haut)` : isNative() ? `Version ${APP_VERSION} · à jour` : "Sur ordinateur, la page est toujours à jour"; };
  $("#r_out").onclick = () => ctx.signOut();
}
