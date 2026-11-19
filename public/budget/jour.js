// Montant du jour, saisies rapides, paiements détectés, trésorerie 60 jours et batch cooking guidé.
// Chargé AVANT le script principal : les fonctions utilisent ses variables (rows, A, targets…) au moment de l'appel.
/* global store, rows, A, targets, sources, solde, ECH, PLAN_CATS, CATS, E, eur, esc, dFR, refresh, recurrents, go, Courses, cmenu, cc, EMBED */

let manual = null, notifInbox = null;
function jourState() { if (manual === null) manual = store.get("manual", []); if (notifInbox === null) notifInbox = store.get("notifInbox", []); }
const pad2 = n => String(n).padStart(2, "0");
const isoOf = dt => `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
const isoToday = () => isoOf(new Date());
const frToIso = s => { const m = /^(\d\d)\/(\d\d)\/(\d{4})$/.exec(s || ""); return m ? `${m[3]}-${m[2]}-${m[1]}` : isoToday(); };

/* ---------- Synchronisation avec l'appli (coffre chiffré) ---------- */
let _chgT = null;
function pbChanged() {
  clearTimeout(_chgT);
  _chgT = setTimeout(() => { try { if (window.parent !== window) parent.postMessage({ pbChanged: true }, "*"); } catch (e) {} }, 1500);
}
window.addEventListener("message", e => {
  const d = e.data || {};
  if (d.pbReloadKeys) { manual = null; notifInbox = null; jourState(); try { refresh(); } catch (err) {} }
});

/* ---------- Saisies rapides : comptées jusqu'au relevé qui les couvre ---------- */
function lastStatementDay() { let m = ""; for (const s of sources) if (!s.hidden) for (const r of s.rows) if (r.d > m) m = r.d; return m; }
function manualSources() {
  jourState();
  const last = lastStatementDay();
  const rs = manual.filter(x => x.d > last).map(x => ({ d: x.d, label: x.label, op: "SAISIE " + x.label, info: x.src === "notif" ? "notification" : "", amount: x.amount, forceCat: x.cat || undefined, manual: true, mid: x.id }));
  return rs.length ? [{ name: "Saisies rapides", rows: rs }] : [];
}
function addManual(x) {
  jourState();
  manual.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), d: x.d || isoToday(), label: (x.label || "Dépense").slice(0, 60), amount: x.amount, cat: x.cat || "", src: x.src || "manuel" });
  store.set("manual", manual); refresh();
}

/* ---------- Montant du jour ---------- */
function jourData() {
  const now = new Date(), y = now.getFullYear(), mo = now.getMonth(), m = `${y}-${pad2(mo + 1)}`, today = isoToday();
  const dim = new Date(y, mo + 1, 0).getDate(), day = now.getDate();
  const mr = (rows || []).filter(r => r.month === m && !r.synth);
  let left = 0, tot = 0, spentToday = 0, spent = 0;
  for (const c of PLAN_CATS) {
    const tg = (targets && targets[c]) || 0; if (!tg) continue;
    const before = Math.max(0, -mr.filter(r => r.cat === c && r.d < today).reduce((a, r) => a + r.amount, 0));
    const tday = Math.max(0, -mr.filter(r => r.cat === c && r.d === today).reduce((a, r) => a + r.amount, 0));
    tot += tg; spent += before + tday; left += Math.max(0, tg - before); spentToday += tday;
  }
  const daysLeft = dim - day + 1, perDay = left / daysLeft;
  return { tot, left, perDay, spentToday, todayLeft: perDay - spentToday, daysLeft, dim, m, spent, last: lastStatementDay() };
}

function renderJour() {
  jourState();
  const el = document.getElementById("jourcard"), el2 = document.getElementById("jourcard2"); if (!el) return;
  let h;
  if (!A || !targets) {
    h = `<div class="card jour"><h2>💶 Montant du jour</h2><p class="hint">Importe tes relevés puis choisis ton plan : l'appli te dira chaque matin combien tu peux dépenser.</p>
      <div class="toolbar"><button class="btn" data-qadd="1">＋ Dépense rapide</button></div></div>`;
  } else {
    const j = jourData(), ok = j.todayLeft >= 0, old = j.last && (Date.now() - new Date(j.last + "T12:00:00")) / 864e5 > 3 && !manual.some(x => x.d > j.last);
    h = `<div class="card jour ${ok ? "" : "over"}"><div class="jl">Aujourd'hui, tu peux encore dépenser</div>
      <div class="jbig ${ok ? "" : "neg"}">${ok ? "" : "−"}${eur(Math.abs(j.todayLeft))}</div>
      <div class="sub">${eur(j.perDay)} par jour pendant ${j.daysLeft} jour${j.daysLeft > 1 ? "s" : ""} · ${eur(j.left)} restants dans tes enveloppes${j.spentToday ? ` · déjà ${eur(j.spentToday)} aujourd'hui` : ""}</div>
      ${old ? `<p class="sub warnline">Ton dernier relevé date du ${dFR(j.last)} : ajoute tes dépenses depuis (saisie rapide ou paiements détectés) pour un montant juste.</p>` : ""}
      <div class="toolbar"><button class="btn" data-qadd="1">＋ Dépense rapide</button><button class="btn ghost" data-go="mois:mois">Mes enveloppes</button></div></div>`;
  }
  if (notifInbox.length) {
    const cats = Object.keys(CATS).filter(c => !["exclu", "interne"].includes(c));
    h += `<div class="card"><h2>📲 Paiements détectés <span class="pill">${notifInbox.length}</span></h2><p class="hint">Lus dans les notifications de ta banque. Vérifie la catégorie puis ajoute-les : ils comptent jusqu'à ton prochain relevé.</p>` +
      notifInbox.map(n => {
        const g = E.categorize({ label: n.label, op: n.label, info: "", amount: n.amount, cardDetailed: true }, {}, store.get("rules", []));
        return `<div class="inbox"><div class="t"><b>${esc(n.label)}</b><span class="${n.amount < 0 ? "" : "pos"}">${n.amount < 0 ? "−" : "+"}${eur(Math.abs(n.amount), 2)}</span></div>
          <div class="sub">${esc(new Date(n.t).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }))} · ${esc(n.title || n.pkg || "")}</div>
          <div class="row2"><select data-nicat="${esc(n.id)}" aria-label="Catégorie">${cats.map(c => `<option value="${c}" ${c === g.cat ? "selected" : ""}>${esc(CATS[c][0])}</option>`).join("")}</select>
          <button class="btn" data-niadd="${esc(n.id)}">Ajouter</button><button class="btn ghost" data-nidel="${esc(n.id)}">Ignorer</button></div></div>`;
      }).join("") + `</div>`;
  }
  el.innerHTML = h;
  if (el2) el2.innerHTML = h.replace(/data-go="mois:mois"/, 'data-go="mois:mois" hidden');
}

function renderManualList() {
  jourState();
  const el = document.getElementById("manuallist"); if (!el) return;
  const last = lastStatementDay(), act = manual.filter(x => x.d > last).sort((a, b) => b.d.localeCompare(a.d));
  const old = manual.length - act.length;
  el.innerHTML = act.length ? `<div class="tblwrap"><table>${act.map(x => `<tr><td>${dFR(x.d)}<div class="sub">${x.src === "notif" ? "notification" : "saisie"}</div></td><td>${esc(x.label)}<div class="sub">${esc((CATS[x.cat] || CATS.autre || ["Autre"])[0])}</div></td><td class="n ${x.amount > 0 ? "pos" : ""}">${eur(x.amount, 2)}</td><td><button class="del" data-mdel="${x.id}" aria-label="Supprimer">✕</button></td></tr>`).join("")}</table></div>`
    : `<p class="sub">Aucune saisie en attente. Elles disparaissent d'elles-mêmes quand un relevé couvre leur date.</p>`;
  if (old) el.innerHTML += `<p class="sub">${old} saisie${old > 1 ? "s" : ""} déjà couverte${old > 1 ? "s" : ""} par un relevé. <button class="btn ghost" data-mpurge="1">Les effacer</button></p>`;
}

/* ---------- Saisie rapide (fenêtre) ---------- */
function openQuickAdd() {
  const cats = ["courses", "fastfood", "resto", "shopping", "bazar", "enligne", "loisirs", "beaute", "transport", "sante", "autre"].filter(c => CATS[c]);
  const ov = document.createElement("div"); ov.className = "overlay";
  ov.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="qat"><h2 id="qat">＋ Dépense rapide</h2>
    <div class="seg2"><button data-qs="-1" class="on">Dépense</button><button data-qs="1">Rentrée</button></div>
    <label class="f" for="qam">Montant (€)</label><input id="qam" type="number" inputmode="decimal" step="0.01" min="0" placeholder="ex. 12,50" autofocus>
    <label class="f" for="qal">Où / quoi</label><input id="qal" placeholder="ex. Boulangerie" autocomplete="off">
    <label class="f" for="qac">Catégorie</label><select id="qac">${cats.map(c => `<option value="${c}">${esc(CATS[c][0])}</option>`).join("")}</select>
    <label class="f" for="qad">Date</label><input id="qad" type="date" value="${isoToday()}">
    <div class="toolbar" style="margin-top:14px"><button class="btn" id="qaok">Ajouter</button><button class="btn ghost" id="qano">Annuler</button></div><div id="qamsg" class="sub"></div></div>`;
  document.body.appendChild(ov);
  let sign = -1;
  ov.querySelectorAll("[data-qs]").forEach(b => b.onclick = () => { sign = +b.dataset.qs; ov.querySelectorAll("[data-qs]").forEach(x => x.classList.toggle("on", x === b)); });
  const close = () => ov.remove();
  ov.onclick = e => { if (e.target === ov) close(); };
  ov.querySelector("#qano").onclick = close;
  ov.querySelector("#qal").oninput = e => { const g = E.categorize({ label: e.target.value, op: e.target.value, info: "", amount: -1, cardDetailed: true }, {}, store.get("rules", [])); if (cats.includes(g.cat)) ov.querySelector("#qac").value = g.cat; };
  ov.querySelector("#qaok").onclick = () => {
    const v = parseFloat(String(ov.querySelector("#qam").value).replace(",", "."));
    if (!(v > 0)) { ov.querySelector("#qamsg").textContent = "Indique un montant."; return; }
    addManual({ amount: Math.round(sign * v * 100) / 100, label: ov.querySelector("#qal").value.trim() || (sign < 0 ? "Dépense" : "Rentrée"), cat: sign < 0 ? ov.querySelector("#qac").value : "", d: ov.querySelector("#qad").value || isoToday() });
    close();
  };
  setTimeout(() => ov.querySelector("#qam").focus(), 50);
}

document.addEventListener("click", e => {
  const t = e.target.closest("[data-qadd],[data-niadd],[data-nidel],[data-mdel],[data-mpurge]"); if (!t) return;
  jourState();
  if (t.dataset.qadd) return openQuickAdd();
  if (t.dataset.niadd) {
    const n = notifInbox.find(x => x.id === t.dataset.niadd); if (!n) return;
    const sel = document.querySelector(`[data-nicat="${CSS.escape(n.id)}"]`);
    notifInbox = notifInbox.filter(x => x !== n); store.set("notifInbox", notifInbox);
    addManual({ amount: n.amount, label: n.label, cat: sel ? sel.value : "", d: isoOf(new Date(n.t)), src: "notif" });
  }
  if (t.dataset.nidel) { notifInbox = notifInbox.filter(x => x.id !== t.dataset.nidel); store.set("notifInbox", notifInbox); refresh(); }
  if (t.dataset.mdel) { manual = manual.filter(x => x.id !== t.dataset.mdel); store.set("manual", manual); refresh(); }
  if (t.dataset.mpurge) { const last = lastStatementDay(); manual = manual.filter(x => x.d > last); store.set("manual", manual); refresh(); }
});

/* ---------- Trésorerie sur 60 jours ---------- */
function tresoData() {
  if (!A || !solde) return null;
  const sd = solde.iso || frToIso(solde.d), today = isoToday();
  let bal = solde.v;
  for (const r of rows) if (!r.synth && r.d > sd && r.d <= today && !["exclu", "interne"].includes(r.cat)) bal += r.amount;
  const start = bal, rec = recurrents().filter(x => x.cat !== "credit");
  const incomes = ["salaire", "chomage", "caf"].map(cat => {
    const rs = rows.filter(r => r.cat === cat && r.amount > 0 && !r.synth); if (!rs.length) return null;
    const days = rs.map(r => r.date.getDate()).sort((a, b) => a - b);
    const amt = (A.inc && A.inc[cat]) || rs.reduce((a, r) => a + r.amount, 0) / new Set(rs.map(r => r.month)).size;
    return { cat, label: CATS[cat][0], day: days[Math.floor(days.length / 2)], amount: amt, seen: new Set(rs.map(r => r.month)) };
  }).filter(Boolean);
  const daily = PLAN_CATS.reduce((a, c) => a + ((targets && targets[c]) || 0), 0) * 12 / 365;
  const pts = [{ d: today, bal, ev: [] }];
  const base = new Date(today + "T12:00:00");
  for (let i = 1; i <= 60; i++) {
    const dt = new Date(base); dt.setDate(base.getDate() + i);
    const iso = isoOf(dt), dom = dt.getDate(), mk = iso.slice(0, 7), dim = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
    const ev = [];
    bal -= daily;
    for (const x of rec) if (Math.min(x.day, dim) === dom && !x.occ.some(r => r.month === mk)) { bal -= x.perMonth; ev.push([x.label, -x.perMonth]); }
    for (const e of (ECH || [])) if (e.d === iso) { bal -= e.pay; ev.push(["Prêt immobilier", -e.pay]); }
    for (const inc of incomes) if (Math.min(inc.day, dim) === dom && !inc.seen.has(mk)) { bal += inc.amount; ev.push([inc.label, inc.amount]); }
    pts.push({ d: iso, bal, ev });
  }
  const min = pts.reduce((a, p) => p.bal < a.bal ? p : a, pts[0]);
  return { pts, min, start, sd, daily };
}

function renderTreso() {
  const el = document.getElementById("treso"); if (!el) return;
  const t = tresoData();
  if (!t) { el.innerHTML = `<p class="sub">Saisis le solde actuel de ton compte ci-dessus : l'appli prévoit alors ton solde jour par jour sur 2 mois.</p>`; return; }
  const W = 640, H = 210, L = 46, R = 10, T = 14, B = 26;
  const vals = t.pts.map(p => p.bal), lo = Math.min(0, ...vals), hi = Math.max(0, ...vals), span = (hi - lo) || 1;
  const x = i => L + (W - L - R) * i / (t.pts.length - 1), y = v => T + (H - T - B) * (hi - v) / span;
  const path = t.pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.bal).toFixed(1)}`).join("");
  const step = Math.pow(10, Math.floor(Math.log10(span))) * (span / Math.pow(10, Math.floor(Math.log10(span))) > 5 ? 1 : 0.5);
  let grid = ""; for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) grid += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="gl"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" class="tk">${Math.round(v).toLocaleString("fr-FR")}</text>`;
  let ticks = ""; t.pts.forEach((p, i) => { const dd = +p.d.slice(8); if (dd === 1 || dd === 15) ticks += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" class="tk">${dd} ${["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."][+p.d.slice(5, 7) - 1]}</text>`; });
  const mi = t.pts.indexOf(t.min), neg = t.min.bal < 0;
  el.innerHTML = `<div class="pl"><span>Solde estimé aujourd'hui</span><b>${eur(t.start)}</b></div>
    <div class="pl"><span>Point le plus bas</span><b class="${neg ? "neg" : ""}">${eur(t.min.bal)} le ${dFR(t.min.d)}</b></div>
    <div class="pl"><span>Dans 60 jours</span><b class="${t.pts[60].bal < 0 ? "neg" : ""}">${eur(t.pts[60].bal)}</b></div>
    <div class="fig"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Solde prévu sur 60 jours, point bas ${eur(t.min.bal)} le ${dFR(t.min.d)}" id="tresosvg">
      ${grid}<line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" class="zero"/>
      ${neg ? `<clipPath id="tclip"><rect x="${L}" y="${y(0)}" width="${W - L - R}" height="${H}"/></clipPath><path d="${path}L${x(60)},${y(0)}L${x(0)},${y(0)}Z" class="negarea" clip-path="url(#tclip)"/>` : ""}
      <path d="${path}" class="tline"/>${ticks}
      <circle cx="${x(mi)}" cy="${y(t.min.bal)}" r="5" class="tmin"/><line id="tcur" x1="0" x2="0" y1="${T}" y2="${H - B}" class="tcur" visibility="hidden"/></svg></div>
    <div id="tresoinfo" class="sub" aria-live="polite">Touche la courbe pour voir le détail d'un jour.</div>
    <p class="sub">${neg ? `<b class="neg">Ton compte passerait à découvert vers le ${dFR(t.pts.find(p => p.bal < 0).d)}.</b> Décale une dépense ou garde ${eur(-t.min.bal)} de côté d'ici là.` : `Pas de découvert prévu. Tu pourrais mettre de côté jusqu'à ${eur(Math.max(0, t.min.bal - 150))} sans risque (en gardant 150 € de marge).`}
    Estimation : solde saisi le ${dFR(t.sd)}, opérations connues depuis, prélèvements habituels, revenus et ${eur(t.daily)} par jour de dépenses courantes (tes enveloppes).</p>`;
  const svg = document.getElementById("tresosvg"), info = document.getElementById("tresoinfo"), cur = document.getElementById("tcur");
  const pick = ev => {
    const r = svg.getBoundingClientRect(), px = (ev.clientX - r.left) / r.width * W;
    const i = Math.max(0, Math.min(60, Math.round((px - L) / (W - L - R) * 60))), p = t.pts[i];
    cur.setAttribute("x1", x(i)); cur.setAttribute("x2", x(i)); cur.setAttribute("visibility", "visible");
    info.innerHTML = `<b>${new Date(p.d + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</b> : ${eur(p.bal)}${p.ev.length ? " · " + p.ev.map(([l, v]) => `${esc(l)} ${v > 0 ? "+" : "−"}${eur(Math.abs(v))}`).join(", ") : ""}`;
  };
  svg.onpointermove = pick; svg.onpointerdown = pick;
}

function renderTresoMini() {
  const el = document.getElementById("tresomini"); if (!el) return;
  const t = tresoData();
  el.innerHTML = t ? `<div class="mini" data-go="mois:mois" style="cursor:pointer"><div class="l"><span class="dot" style="background:${t.min.bal < 0 ? "var(--bad-bg)" : "var(--ok-bg)"}">📈</span>Point bas sur 60 j</div><div class="v ${t.min.bal < 0 ? "neg" : ""}">${eur(t.min.bal)}</div><div class="s">le ${dFR(t.min.d)}</div></div>` : "";
}

/* ---------- Batch cooking guidé ---------- */
let batch = null;
function batchSteps(sel) {
  const portions = cc.adultes + 0.5 * cc.enfants, meals = cmenu.filter((m, i) => sel.includes(i));
  const recs = meals.map(m => ({ m, r: Courses.R.find(x => x.id === m.id), k: portions * (m.batch ? 2 : 1) })).filter(x => x.r).sort((a, b) => b.r.min - a.r.min);
  const fmt = (id, v) => { const d = Courses.ING[id]; return d[2] === "pc" ? `${String(Math.round(v * 4) / 4).replace(".", ",")} ${d[0].toLowerCase()}` : `${Math.round(v / 5) * 5} ${d[2]} de ${d[0].toLowerCase()}`; };
  const veg = {}, starch = {};
  for (const { r, k } of recs) for (const [id, q] of Object.entries(r.ing)) {
    const d = Courses.ING[id]; if (!d || !q) continue;
    if (d[1] === 0) (veg[id] = veg[id] || []).push([r.nom, q * k]);
    if (["pates", "riz", "semoule", "pommes_terre"].includes(id)) (starch[id] = starch[id] || []).push([r.nom, q * k]);
  }
  const boxes = meals.reduce((a, m) => a + (m.batch ? 2 : 1), 0);
  const steps = [{ t: "Prépare ton plan de travail", d: `Sors 2 casseroles, 1 grande poêle ou sauteuse, un plat allant au four, une planche et ${boxes} boîtes de conservation. Préchauffe le four si une recette l'utilise. Durée totale estimée : ${Math.round(recs.reduce((a, x) => a + x.r.min, 0) * 0.65)} min au lieu de ${recs.reduce((a, x) => a + x.r.min, 0)} min recette par recette.` }];
  if (Object.keys(veg).length) {
    steps.push({ t: "Lave et épluche tous les légumes d'un coup", d: Object.entries(veg).map(([id, l]) => fmt(id, l.reduce((a, x) => a + x[1], 0))).join(", ") + "." });
    steps.push({ t: "Coupe tout, puis fais un tas par recette", d: Object.entries(veg).map(([id, l]) => `${Courses.ING[id][0]} : ${l.map(([n, q]) => `${n} (${fmt(id, q).replace(/ de .*$/, "")})`).join(", ")}`).join(" · ") });
  }
  for (const [id, l] of Object.entries(starch)) if (l.length > 1) steps.push({ t: `Cuis ${Courses.ING[id][0].toLowerCase()} pour ${l.length} recettes en une fois`, d: `${fmt(id, l.reduce((a, x) => a + x[1], 0))} pour : ${l.map(x => x[0]).join(", ")}. Égoutte, laisse tiédir et répartis. Dans les recettes, passe l'étape de cuisson de ${Courses.ING[id][0].toLowerCase()}.` });
  recs.forEach(({ r, m }, n) => r.etapes.forEach((e, i) => steps.push({ t: `${r.emo} ${r.nom}${m.batch ? " (double portion)" : ""} — étape ${i + 1}/${r.etapes.length}`, d: e + (/mijote|four|cuis|laisse/i.test(e) && n < recs.length - 1 ? " Pendant ce temps, passe à l'étape suivante." : "") })));
  steps.push({ t: "Refroidis, mets en boîtes, étiquette", d: `Laisse tiédir 30 min maximum hors du frigo. Les ${Math.min(3, boxes)} premiers repas vont au frigo (3 jours maximum), les autres au congélateur. Note le nom et la date sur chaque boîte.` });
  return steps;
}
function openBatch() {
  if (!cmenu || !cmenu.length) return;
  const ov = document.createElement("div"); ov.className = "overlay";
  const sel = cmenu.map((m, i) => i);
  const pick = () => {
    ov.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="bct"><h2 id="bct">🍳 Batch cooking</h2><p class="hint">Choisis les recettes à préparer en une seule session (souvent le dimanche).</p>
      ${cmenu.map((m, i) => { const r = Courses.R.find(x => x.id === m.id); return `<label class="shop"><input type="checkbox" data-bsel="${i}" ${sel.includes(i) ? "checked" : ""}><span class="nm">${r.emo} ${esc(r.nom)}<small>${r.min} min${m.batch ? " · double portion" : ""}</small></span></label>`; }).join("")}
      <div class="toolbar" style="margin-top:14px"><button class="btn" id="bgo">Commencer la session</button><button class="btn ghost" id="bno">Fermer</button></div></div>`;
    ov.querySelectorAll("[data-bsel]").forEach(c => c.onchange = () => { const i = +c.dataset.bsel; const k = sel.indexOf(i); if (c.checked && k < 0) sel.push(i); if (!c.checked && k >= 0) sel.splice(k, 1); });
    ov.querySelector("#bno").onclick = () => ov.remove();
    ov.querySelector("#bgo").onclick = () => { if (!sel.length) return; batch = { steps: batchSteps(sel), i: 0 }; step(); };
  };
  let timer = null;
  const step = () => {
    const s = batch.steps[batch.i], mins = (/(\d+)\s*min/.exec(s.d) || [])[1];
    ov.innerHTML = `<div class="sheet bstep" role="dialog" aria-modal="true" aria-labelledby="bst"><div class="sub">Étape ${batch.i + 1} sur ${batch.steps.length}</div>
      <div class="prog"><div style="width:${(batch.i + 1) / batch.steps.length * 100}%;background:var(--pri)"></div></div>
      <h2 id="bst" style="margin-top:12px">${esc(s.t)}</h2><p class="bd">${esc(s.d)}</p>
      ${mins && batch.i > 0 && batch.i < batch.steps.length - 1 ? `<button class="btn ghost" id="btim">⏱️ Minuteur ${mins} min</button><div id="btimv" class="jbig" aria-live="polite"></div>` : ""}
      <div class="toolbar" style="margin-top:16px"><button class="btn ghost" id="bprev" ${batch.i ? "" : "disabled"}>← Précédente</button><button class="btn" id="bnext">${batch.i === batch.steps.length - 1 ? "Terminer ✓" : "Suivante →"}</button></div>
      <button class="btn ghost full" id="bquit" style="margin-top:8px">Quitter</button></div>`;
    ov.querySelector("#bprev").onclick = () => { batch.i--; step(); };
    ov.querySelector("#bnext").onclick = () => { if (batch.i === batch.steps.length - 1) { clearInterval(timer); ov.remove(); } else { batch.i++; step(); } };
    ov.querySelector("#bquit").onclick = () => { clearInterval(timer); ov.remove(); };
    const tb = ov.querySelector("#btim");
    if (tb) tb.onclick = () => {
      clearInterval(timer); let left = mins * 60; const v = ov.querySelector("#btimv");
      const tick = () => { v.textContent = `${Math.floor(left / 60)}:${pad2(left % 60)}`; if (left-- <= 0) { clearInterval(timer); v.textContent = "C'est prêt !"; try { navigator.vibrate && navigator.vibrate([400, 200, 400, 200, 400]); } catch (e) {} try { const a = new AudioContext(), o = a.createOscillator(); o.frequency.value = 880; o.connect(a.destination); o.start(); o.stop(a.currentTime + 0.8); } catch (e) {} } };
      tick(); timer = setInterval(tick, 1000);
    };
  };
  document.body.appendChild(ov); pick();
}
document.addEventListener("click", e => {
  if (e.target.closest("#c_batch")) openBatch();
  if (e.target.closest("#c_tolist")) {
    if (!cmenu || !cmenu.length) return;
    const idx = Courses.STORES.find(s => s[0] === cc.store)[2], lines = Courses.shopping(cmenu, cc.adultes + 0.5 * cc.enfants, store.get("coursesPrices", {}), idx, { basics: cc.basics });
    const chk = store.get("coursesChk", {});
    const items = lines.filter(l => !l.placard && !chk[l.id]).map(l => ({ name: l.nom, qty: `${l.packs} × ${l.pack}`, rayon: l.rayon }));
    const msg = document.getElementById("c_copymsg");
    if (window.parent !== window) { parent.postMessage({ pbAddToList: items }, "*"); if (msg) msg.textContent = `${items.length} articles envoyés à la liste partagée.`; }
    else if (msg) msg.textContent = "Disponible dans l'appli (liste partagée du foyer).";
  }
});

/* ---------- Données prêtes à afficher pour l'appli (écrans Aujourd'hui et Budget) ---------- */
window.pbModel = () => {
  jourState();
  const base = { inbox: notifInbox, hasData: !!A, manualCount: manual.length };
  if (!A) return base;
  const j = targets ? jourData() : null, mr = rows.filter(r => r.month === (j ? j.m : "") && !r.synth);
  const env = PLAN_CATS.filter(c => targets && targets[c] > 0).map(c => {
    const ops = mr.filter(r => r.cat === c && r.amount < 0).sort((a, b) => b.d.localeCompare(a.d));
    return { c, label: CATS[c][0], target: targets[c], spent: -ops.reduce((a, r) => a + r.amount, 0), ops: ops.slice(0, 6).map(r => ({ d: r.d, label: r.label, amount: r.amount })) };
  }).sort((a, b) => b.spent / b.target - a.spent / a.target);
  const now = new Date(), dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(), pace = now.getDate() / dim;
  const scen = {}; const keep = targets;
  for (const k of ["actuel", "raisonnable", "ambitieux"]) { applyScenarioTmp(k); scen[k] = { marge: A.marge + planSavings(), savings: planSavings() }; }
  targets = keep;
  const acts = actionsList();
  const later = store.get("later", {});
  const todo = acts.filter(a => !done[a.id]).sort((a, b) => (later[a.id] ? 1 : 0) - (later[b.id] ? 1 : 0) || b.gain - a.gain);
  const t = tresoData();
  const today = isoToday(), in7 = isoOf(new Date(Date.now() + 7 * 864e5)), mk = today.slice(0, 7);
  const soon = recurrents().filter(x => !x.occ.some(r => r.month === mk)).map(x => { const d = `${mk}-${pad2(Math.min(x.day, dim))}`; return { label: x.label, amount: x.perMonth, d }; }).filter(x => x.d >= today && x.d <= in7).sort((a, b) => a.d.localeCompare(b.d));
  const ev = rows.filter(r => r.tag === "evitable"), evM = -ev.reduce((a, r) => a + r.amount, 0) / Math.max(1, A.periodMonths || new Set(ev.map(r => r.month)).size);
  return { ...base, jour: j, env, pace, scenario, scen, marge: A.marge, revenus: A.revenus, depenses: A.depenses,
    actions: todo.slice(0, 3).map(a => ({ id: a.id, t: a.t.replace(/<[^>]+>/g, ""), gain: a.gain, later: !!later[a.id] })), actionsDone: acts.filter(a => done[a.id]).length, actionsTotal: acts.length,
    gained: acts.filter(a => done[a.id]).reduce((s, a) => s + a.gain, 0), potential: todo.reduce((s, a) => s + a.gain, 0),
    treso: t ? { pts: t.pts.map(p => ({ d: p.d, bal: Math.round(p.bal), ev: p.ev.map(([l, v]) => [l, Math.round(v)]) })), min: { d: t.min.d, bal: Math.round(t.min.bal) }, start: Math.round(t.start), daily: t.daily, sd: t.sd } : null,
    solde, soon, evitableMonth: evM, alerts: alerts().slice(0, 3).map(([c, h]) => ({ c, t: h.replace(/<[^>]+>/g, "") })),
    lastStatement: lastStatementDay(), pret: PRET ? { next: nextEch(), crd: (nextEch() || {}).crd } : null };
};
window.pbAct = (op, a = {}) => {
  jourState();
  if (op === "scenario") { applyScenario(a.k); }
  else if (op === "target") { targets[a.c] = Math.max(0, Math.round(a.v)); store.set("targets", targets); }
  else if (op === "done") { done[a.id] = isoToday(); store.set("done", done); }
  else if (op === "later") { const l = store.get("later", {}); l[a.id] = isoToday(); store.set("later", l); }
  else if (op === "add") { addManual(a); return; }
  else if (op === "inboxAdd") { const n = notifInbox.find(x => x.id === a.id); if (!n) return; notifInbox = notifInbox.filter(x => x !== n); store.set("notifInbox", notifInbox); addManual({ amount: n.amount, label: n.label, cat: a.cat || "", d: isoOf(new Date(n.t)), src: "notif" }); return; }
  else if (op === "inboxDel") { notifInbox = notifInbox.filter(x => x.id !== a.id); store.set("notifInbox", notifInbox); }
  else if (op === "inboxPush") { const ids = new Set(notifInbox.map(x => x.id)); for (const n of a.items || []) if (!ids.has(n.id)) notifInbox.push(n); store.set("notifInbox", notifInbox); }
  else if (op === "solde") { solde = { v: a.v, d: new Date().toLocaleDateString("fr-FR"), iso: isoToday() }; store.set("solde", solde); }
  else if (op === "guess") { return E.categorize({ label: a.label, op: a.label, info: "", amount: a.amount || -1, cardDetailed: true }, {}, store.get("rules", [])).cat; }
  else if (op === "cats") { return Object.entries(CATS).filter(([c]) => !["exclu", "interne", "pret_verse", "pret_anticip"].includes(c)).map(([c, v]) => [c, v[0]]); }
  refresh();
};
