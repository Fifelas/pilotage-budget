// Onglet « Budget » : où j'en suis ce mois-ci, mon solde à venir, et comment mieux faire.
import { esc, eur, eur2, dFR, dLong, num, sheet, $ } from "./ui.js";
import { askSolde } from "./view-today.js";

let open = null, showAll = false;

export async function renderBudget(ctx, main) {
  main.innerHTML = `<header class="hello"><h1>Budget</h1></header><div id="bbody"><div class="card skel"></div></div>`;
  await ctx.ready();
  const m = ctx.model(), body = $("#bbody"); if (!body || !m) return;
  if (!m.hasData) { body.innerHTML = `<div class="card"><p>Importe d'abord tes relevés.</p><button class="btn" id="b_imp">Importer</button></div>`; $("#b_imp").onclick = () => ctx.detail("plus", "comptes", "Relevés et import"); return; }

  const now = new Date(), month = now.toLocaleDateString("fr-FR", { month: "long" });
  const spent = m.env.reduce((a, e) => a + e.spent, 0), tot = m.env.reduce((a, e) => a + e.target, 0);
  const S = ["actuel", "raisonnable", "ambitieux"], SL = { actuel: "Comme aujourd'hui", raisonnable: "Raisonnable", ambitieux: "Ambitieux" };
  const sc = m.scen[m.scenario] || m.scen.actuel;

  body.innerHTML = `
  <section class="card">
    <div class="sechead"><h2>Mes enveloppes de ${month}</h2><span class="sub">jour ${now.getDate()}</span></div>
    <div class="sumbar"><div class="v"><b>${eur(spent)}</b> <span class="sub">sur ${eur(tot)}</span></div>
      <div class="bar"><i style="width:${Math.min(100, spent / Math.max(1, tot) * 100)}%" class="${spent > tot ? "bad" : spent / Math.max(1, tot) > m.pace + .1 ? "warn" : ""}"></i><s style="left:${m.pace * 100}%" title="où tu devrais en être aujourd'hui"></s></div></div>
    <div class="envs">${m.env.slice(0, showAll ? 99 : 4).map((e, i) => envRow(e, i, m.pace)).join("")}</div>
    ${m.env.length > 4 ? `<button class="link" id="b_all">${showAll ? "Réduire" : `Voir les ${m.env.length - 4} autres enveloppes`}</button>` : ""}
    <p class="sub legend"><span class="tick" aria-hidden="true"></span><span>repère du jour : là où tu devrais en être. Touche une enveloppe pour le détail.</span></p>
  </section>

  <section class="card">
    <div class="sechead"><h2>Mon solde dans 60 jours</h2>${m.solde ? `<button class="link" id="b_solde">Mettre à jour</button>` : ""}</div>
    <div id="treso">${m.treso ? "" : `<p class="hint">Indique le solde actuel de ton compte : l'appli prévoit chaque jour ton solde, avec tes prélèvements, ta paie et ton prêt.</p><button class="btn" id="b_solde">Saisir mon solde</button>`}</div>
  </section>

  <section class="card">
    <div class="sechead"><h2>Optimiser</h2><span class="sub">${m.actionsDone}/${m.actionsTotal} faites</span></div>
    <div class="seg3" role="radiogroup" aria-label="Mon plan">${S.map(k => `<button data-sc="${k}" role="radio" aria-checked="${m.scenario === k}" class="${m.scenario === k ? "on" : ""}">${SL[k]}</button>`).join("")}</div>
    <div class="planres ${sc.marge >= 0 ? "" : "neg"}"><span>Reste chaque mois</span><b>${sc.marge >= 0 ? "+" : "−"}${eur(Math.abs(sc.marge))}</b></div>
    <p class="sub">${m.scenario === "actuel" ? "Sans rien changer." : `Le plan baisse tes enveloppes de ${eur(sc.savings)} par mois (fast-food, bazar, achats en ligne en premier).`}${m.evitableMonth > 20 ? ` Dépenses évitables repérées : ${eur(m.evitableMonth)} par mois.` : ""}</p>
    <h3>À faire en priorité</h3>
    ${m.actions.length ? m.actions.map(a => `<div class="action"><div class="at">${esc(a.t)}</div>
      <div class="ab"><span class="gain">${a.gain ? `+${eur(a.gain)} / an` : "conseil"}</span><button class="btn sm" data-done="${esc(a.id)}">Fait ✓</button>${a.later ? "" : `<button class="btn ghost sm" data-later="${esc(a.id)}">Plus tard</button>`}</div></div>`).join("") : `<p class="sub">Toutes les actions sont faites. Bravo !</p>`}
    ${m.gained ? `<p class="sub">Déjà gagné grâce aux actions faites : <b class="pos">${eur(m.gained)} / an</b>.</p>` : ""}
    <button class="link mt" id="b_ev">Voir mes dépenses évitables ›</button>
  </section>

  ${m.pret && m.pret.next ? `<button class="card line" id="b_pret"><span class="ic">🏡</span><span class="tx"><b>Prêt : ${eur2(m.pret.next.pay)} le ${dFR(m.pret.next.d)}</b><small>Capital restant ${eur(m.pret.crd)} · tableau et remboursement anticipé</small></span><span class="chev">›</span></button>` : ""}`;

  if (m.treso) drawTreso(m.treso);
  if ($("#b_all")) $("#b_all").onclick = () => { showAll = !showAll; renderBudget(ctx, main); };
  body.querySelectorAll("#b_solde").forEach(b => b.onclick = () => askSolde(ctx));
  body.querySelectorAll("[data-env]").forEach(b => b.onclick = () => { open = open === b.dataset.env ? null : b.dataset.env; renderBudget(ctx, main); });
  body.querySelectorAll("[data-edit]").forEach(b => b.onclick = e => { e.stopPropagation(); editTarget(ctx, m.env.find(x => x.c === b.dataset.edit)); });
  body.querySelectorAll("[data-sc]").forEach(b => b.onclick = () => ctx.act("scenario", { k: b.dataset.sc }));
  body.querySelectorAll("[data-done]").forEach(b => b.onclick = () => { ctx.act("done", { id: b.dataset.done }); ctx.toast("Bien joué !"); });
  body.querySelectorAll("[data-later]").forEach(b => b.onclick = () => ctx.act("later", { id: b.dataset.later }));
  $("#b_ev").onclick = () => ctx.detail("eco", "evitables", "Dépenses évitables");
  if ($("#b_pret")) $("#b_pret").onclick = () => ctx.detail("pret", "pret", "Mon prêt");
}

function envRow(e, i, pace) {
  const r = e.spent / e.target, cls = r > 1 ? "bad" : r > pace + .1 ? "warn" : "ok", isOpen = open === e.c;
  return `<div class="env ${isOpen ? "open" : ""}"><button class="eh" data-env="${e.c}" aria-expanded="${isOpen}">
      <span class="en">${esc(e.label)}</span><span class="ev"><b>${eur(e.spent)}</b> / ${eur(e.target)}</span>
      <span class="bar"><i class="${cls}" style="width:${Math.min(100, r * 100)}%"></i><s style="left:${pace * 100}%"></s></span>
      <span class="es ${cls}">${r > 1 ? `dépassé de ${eur(e.spent - e.target)}` : `reste ${eur(e.target - e.spent)}`}</span></button>
    ${isOpen ? `<div class="ed">${e.ops.length ? e.ops.map(o => `<div class="op"><span>${dFR(o.d)}</span><span class="ol">${esc(o.label)}</span><span>${eur2(-o.amount)}</span></div>`).join("") : `<p class="sub">Aucune dépense ce mois-ci.</p>`}
      <button class="link" data-edit="${e.c}">Modifier l'enveloppe (${eur(e.target)})</button></div>` : ""}</div>`;
}

function editTarget(ctx, e) {
  const { el, close } = sheet(`<h2>Enveloppe ${esc(e.label)}</h2><p class="hint">Montant que tu t'autorises chaque mois.</p>
    <div class="amount"><input id="e_v" type="text" inputmode="decimal" value="${Math.round(e.target)}" autofocus aria-label="Montant mensuel"><span>€</span></div>
    <button class="btn full mt" id="e_ok">Enregistrer</button>`);
  el.querySelector("#e_ok").onclick = () => { const v = num(el.querySelector("#e_v").value); if (v >= 0) ctx.act("target", { c: e.c, v }); close(); };
}

// Courbe du solde prévu : une seule série, zéro marqué, point bas signalé ; touche pour le détail d'un jour
function drawTreso(t) {
  const el = $("#treso"), W = 640, H = 200, L = 8, R = 8, T = 16, B = 24, n = t.pts.length - 1;
  const vals = t.pts.map(p => p.bal), lo = Math.min(0, ...vals), hi = Math.max(0, ...vals) * 1.05 || 1, span = hi - lo || 1;
  const x = i => L + (W - L - R) * i / n, y = v => T + (H - T - B) * (hi - v) / span;
  const path = t.pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.bal).toFixed(1)}`).join("");
  const mi = t.pts.findIndex(p => p.d === t.min.d), neg = t.min.bal < 0, end = t.pts[n];
  const MO = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  const ticks = t.pts.map((p, i) => +p.d.slice(8) === 1 ? `<line x1="${x(i)}" x2="${x(i)}" y1="${T}" y2="${H - B}" class="gl"/><text x="${x(i) + 4}" y="${H - 8}" class="tk">${MO[+p.d.slice(5, 7) - 1]}</text>` : "").join("");
  el.innerHTML = `<div class="tkpi"><div><small>Aujourd'hui</small><b>${eur(t.start)}</b></div><div><small>Au plus bas</small><b class="${neg ? "neg" : ""}">${eur(t.min.bal)}</b><small>${dFR(t.min.d)}</small></div><div><small>Dans 60 j</small><b class="${end.bal < 0 ? "neg" : ""}">${eur(end.bal)}</b></div></div>
    <svg viewBox="0 0 ${W} ${H}" class="tchart" role="img" aria-label="Solde prévu sur 60 jours : au plus bas ${eur(t.min.bal)} le ${dFR(t.min.d)}, ${eur(end.bal)} dans 60 jours">
      ${ticks}<line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" class="zero"/><text x="${W - R}" y="${y(0) - 4}" text-anchor="end" class="tk">0 €</text>
      ${neg ? `<clipPath id="tclip"><rect x="0" y="${y(0)}" width="${W}" height="${H}"/></clipPath><path d="${path}L${x(n)},${y(0)}L${x(0)},${y(0)}Z" class="negarea" clip-path="url(#tclip)"/>` : ""}
      <path d="${path}" class="tline"/><circle cx="${x(mi)}" cy="${y(t.min.bal)}" r="6" class="tmin"/>
      <line id="tcur" x1="0" x2="0" y1="${T}" y2="${H - B}" class="tcur" visibility="hidden"/><circle id="tdot" r="5" class="tdot" visibility="hidden"/></svg>
    <div id="tinfo" class="tinfo" aria-live="polite">Touche la courbe pour voir un jour précis.</div>
    <p class="sub">${neg ? `<b class="neg">Découvert prévu vers le ${dFR(t.pts.find(p => p.bal < 0).d)}.</b> Décale une dépense ou mets ${eur(-t.min.bal)} de côté d'ici là.` : t.min.bal > 300 ? `Pas de découvert prévu : tu peux mettre <b class="pos">${eur(Math.floor((t.min.bal - 150) / 10) * 10)}</b> de côté maintenant sans risque (150 € de marge gardés).` : "Pas de découvert prévu, mais la marge est faible."}</p>`;
  const svg = el.querySelector("svg"), info = $("#tinfo"), cur = $("#tcur"), dot = $("#tdot");
  const pick = ev => {
    const r = svg.getBoundingClientRect(), i = Math.max(0, Math.min(n, Math.round(((ev.clientX - r.left) / r.width * W - L) / (W - L - R) * n))), p = t.pts[i];
    cur.setAttribute("x1", x(i)); cur.setAttribute("x2", x(i)); cur.setAttribute("visibility", "visible");
    dot.setAttribute("cx", x(i)); dot.setAttribute("cy", y(p.bal)); dot.setAttribute("visibility", "visible");
    info.innerHTML = `<b>${dLong(p.d)} : ${eur(p.bal)}</b>${p.ev.length ? "<br>" + p.ev.map(([l, v]) => `${esc(l)} <span class="${v > 0 ? "pos" : ""}">${v > 0 ? "+" : "−"}${eur(Math.abs(v))}</span>`).join(" · ") : ""}`;
  };
  svg.addEventListener("pointermove", pick); svg.addEventListener("pointerdown", pick);
}
