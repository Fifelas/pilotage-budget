// Onglet « Aujourd'hui » : une seule question — combien je peux dépenser aujourd'hui ?
import { esc, eur, eur2, dFR, num, sheet, isoToday, $ } from "./ui.js";
import { notifStatus, notifOpenSettings } from "./native.js";

export async function renderToday(ctx, main) {
  const name = (ctx.S.me.display_name || "").trim();
  main.innerHTML = `<header class="hello"><div><div class="sub">${new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</div><h1>Bonjour${name ? " " + esc(name) : ""}</h1></div></header><div id="tbody"><div class="card skel"></div></div>`;
  await ctx.ready();
  const m = ctx.model(), body = $("#tbody"); if (!body || !m) return;

  if (!m.hasData) {
    body.innerHTML = `<div class="card"><h2>👋 Pour commencer</h2>
      <p class="hint">L'appli calcule chaque jour ce que tu peux dépenser, à partir de tes relevés. Ils restent sur ton téléphone.</p>
      <button class="btn full" id="t_imp">Importer mes relevés</button>
      <button class="btn ghost full mt" id="t_vault">Récupérer le budget du foyer</button>
      <p class="sub mt">« Récupérer » : si ton conjoint a déjà tout importé, il suffit de saisir la phrase secrète du foyer.</p></div>
      ${quickCard(m)}`;
    $("#t_imp").onclick = () => ctx.detail("plus", "comptes", "Relevés et import");
    $("#t_vault").onclick = () => ctx.go("plus");
    bindQuick(ctx); return;
  }

  const j = m.jour, ok = j && j.todayLeft >= 0;
  const watch = [];
  for (const e of m.env) { const r = e.spent / e.target; if (r >= 0.85 && r > m.pace + 0.1) watch.push({ ic: r > 1 ? "🔴" : "🟠", t: `${e.label} : ${eur(e.spent)} sur ${eur(e.target)}`, s: r > 1 ? `dépassé de ${eur(e.spent - e.target)}` : `${Math.round(r * 100)} % utilisés`, go: "budget" }); }
  if (m.treso && m.treso.min.bal < 200) watch.push({ ic: m.treso.min.bal < 0 ? "🔴" : "🟠", t: `Solde au plus bas : ${eur(m.treso.min.bal)}`, s: `le ${dFR(m.treso.min.d)}`, go: "budget" });
  for (const x of m.soon.filter(x => x.amount >= 30).slice(0, 2)) watch.push({ ic: "📅", t: `${x.label} : ${eur2(x.amount)}`, s: `prélevé vers le ${dFR(x.d)}`, go: "budget" });
  if (!m.solde) watch.push({ ic: "💳", t: "Saisis ton solde", s: "pour prévoir les 2 prochains mois", go: "solde" });
  const stale = m.lastStatement && (Date.now() - new Date(m.lastStatement + "T12:00:00")) / 864e5 > 7;

  body.innerHTML = `<div class="hcard ${ok ? "" : "hneg"}">
      <div class="l">Tu peux encore dépenser aujourd'hui</div>
      <div class="big">${j ? (ok ? "" : "−") + eur(Math.abs(j.todayLeft)) : "—"}</div>
      <div class="s">${j ? `${eur(j.perDay)} par jour · ${eur(j.left)} pour ${j.daysLeft} jour${j.daysLeft > 1 ? "s" : ""}` : "Choisis ton plan dans Budget"}</div>
      <button class="cta" id="t_add">＋ J'ai dépensé</button></div>
    ${m.inbox.length ? inboxCard(ctx, m) : ""}
    ${watch.length ? `<div class="card"><h2>À surveiller</h2>${watch.slice(0, 4).map((w, i) => `<button class="line" data-w="${i}"><span class="ic" aria-hidden="true">${w.ic}</span><span class="tx"><b>${esc(w.t)}</b><small>${esc(w.s)}</small></span><span class="chev" aria-hidden="true">›</span></button>`).join("")}</div>` : `<div class="card okcard"><b>✓ Tout est dans les clous</b><div class="sub">Aucune enveloppe en dépassement, pas de découvert prévu.</div></div>`}
    ${stale ? `<button class="card line note" id="t_stale"><span class="ic">🗂️</span><span class="tx"><b>Dernier relevé : ${dFR(m.lastStatement)}</b><small>Importe le nouveau pour un montant juste</small></span><span class="chev">›</span></button>` : ""}
    <div id="t_notif"></div>`;
  $("#t_add").onclick = () => quickAdd(ctx);
  body.querySelectorAll("[data-w]").forEach(b => b.onclick = () => { const w = watch[+b.dataset.w]; if (w.go === "solde") askSolde(ctx); else ctx.go(w.go); });
  if ($("#t_stale")) $("#t_stale").onclick = () => ctx.detail("plus", "comptes", "Relevés et import");
  bindInbox(ctx);
  const ns = await notifStatus();
  if (ns.available && !ns.enabled && !localStorage.getItem("pb-notif-dismiss") && $("#t_notif")) {
    $("#t_notif").innerHTML = `<div class="card tip"><b>📲 Ajoute tes paiements sans rien taper</b><p class="sub">L'appli peut lire les notifications de ta banque (montant et commerçant) pour te proposer la dépense. Rien n'est envoyé ailleurs.</p><div class="row"><button class="btn" id="t_non">Activer</button><button class="btn ghost" id="t_nono">Plus tard</button></div></div>`;
    $("#t_non").onclick = notifOpenSettings;
    $("#t_nono").onclick = () => { localStorage.setItem("pb-notif-dismiss", "1"); $("#t_notif").innerHTML = ""; };
  }
}

const quickCard = () => `<div class="card"><h2>Une dépense à noter ?</h2><button class="btn ghost full" id="t_add">＋ J'ai dépensé</button></div>`;
function bindQuick(ctx) { const b = $("#t_add"); if (b) b.onclick = () => quickAdd(ctx); }

function inboxCard(ctx, m) {
  const cats = ctx.act("cats") || [];
  return `<div class="card"><h2>📲 À confirmer <span class="pill">${m.inbox.length}</span></h2><p class="sub">Paiements lus dans tes notifications bancaires.</p>
    ${m.inbox.slice(0, 5).map(n => { const g = ctx.act("guess", { label: n.label, amount: n.amount }); return `<div class="inbox">
      <div class="it"><b>${esc(n.label)}</b><span class="${n.amount < 0 ? "" : "pos"}">${n.amount < 0 ? "−" : "+"}${eur(Math.abs(n.amount), 2)}</span></div>
      <div class="row"><select data-icat="${esc(n.id)}" aria-label="Catégorie de ${esc(n.label)}">${cats.map(([c, l]) => `<option value="${c}" ${c === g ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>
      <button class="btn sm" data-iadd="${esc(n.id)}">Ajouter</button><button class="btn ghost sm" data-idel="${esc(n.id)}" aria-label="Ignorer">✕</button></div></div>`; }).join("")}</div>`;
}
function bindInbox(ctx) {
  document.querySelectorAll("[data-iadd]").forEach(b => b.onclick = () => { const sel = document.querySelector(`[data-icat="${CSS.escape(b.dataset.iadd)}"]`); ctx.act("inboxAdd", { id: b.dataset.iadd, cat: sel && sel.value }); });
  document.querySelectorAll("[data-idel]").forEach(b => b.onclick = () => ctx.act("inboxDel", { id: b.dataset.idel }));
}

// Saisie rapide : montant d'abord (pavé numérique), le reste est deviné
export function quickAdd(ctx) {
  const QUICK = [["courses", "🛒", "Courses"], ["fastfood", "🍔", "Fast-food"], ["resto", "🍽️", "Resto"], ["shopping", "👕", "Shopping"], ["bazar", "🧸", "Bazar"], ["loisirs", "🎟️", "Loisirs"], ["transport", "⛽", "Carburant"], ["autre", "•••", "Autre"]];
  let cat = "courses";
  const { el, close } = sheet(`<h2>J'ai dépensé</h2>
    <div class="amount"><input id="q_v" type="text" inputmode="decimal" placeholder="0" autofocus aria-label="Montant en euros"><span>€</span></div>
    <div class="chips" role="radiogroup" aria-label="Catégorie">${QUICK.map(([c, i, l]) => `<button class="chip ${c === cat ? "on" : ""}" data-qc="${c}" role="radio" aria-checked="${c === cat}">${i} ${l}</button>`).join("")}</div>
    <label class="f" for="q_l">Où ? <span class="sub">(facultatif)</span></label><input id="q_l" placeholder="ex. Boulangerie" autocomplete="off">
    <details class="mt"><summary class="sub">Autre date ou rentrée d'argent</summary><div class="row mt"><input id="q_d" type="date" value="${isoToday()}" aria-label="Date"><label class="sw"><input type="checkbox" id="q_in"> C'est une rentrée</label></div></details>
    <button class="btn full mt" id="q_ok">Ajouter</button><div id="q_msg" class="err"></div>`);
  el.querySelectorAll("[data-qc]").forEach(b => b.onclick = () => { cat = b.dataset.qc; el.querySelectorAll("[data-qc]").forEach(x => { x.classList.toggle("on", x === b); x.setAttribute("aria-checked", x === b); }); });
  el.querySelector("#q_l").oninput = e => { const g = ctx.act("guess", { label: e.target.value }); const b = el.querySelector(`[data-qc="${g}"]`); if (b && e.target.value.length > 2) b.click(); };
  el.querySelector("#q_ok").onclick = () => {
    const v = num(el.querySelector("#q_v").value); if (!(v > 0)) { el.querySelector("#q_msg").textContent = "Indique un montant."; return; }
    const inc = el.querySelector("#q_in").checked, label = el.querySelector("#q_l").value.trim() || (inc ? "Rentrée" : QUICK.find(q => q[0] === cat)[2]);
    ctx.act("add", { amount: Math.round((inc ? v : -v) * 100) / 100, label, cat: inc ? "" : cat, d: el.querySelector("#q_d").value || isoToday() });
    close(); ctx.toast("Ajouté"); ctx.rerender();
  };
}

export function askSolde(ctx) {
  const { el, close } = sheet(`<h2>Solde de ton compte</h2><p class="hint">Le montant affiché aujourd'hui dans l'appli de ta banque (compte courant). Il sert à prévoir les 2 prochains mois.</p>
    <div class="amount"><input id="s_v" type="text" inputmode="decimal" placeholder="0" autofocus aria-label="Solde en euros"><span>€</span></div>
    <button class="btn full mt" id="s_ok">Enregistrer</button><div id="s_msg" class="err"></div>`);
  el.querySelector("#s_ok").onclick = () => { const v = num(el.querySelector("#s_v").value); if (isNaN(v)) { el.querySelector("#s_msg").textContent = "Indique un montant (négatif si découvert)."; return; } ctx.act("solde", { v }); close(); ctx.rerender(); };
}
