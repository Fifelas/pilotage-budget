// Onglet « Courses » : Liste (partagée) → En magasin (caddie en direct) → Stock (anti-gaspi).
// Liste, caddie et stock sont partagés en direct entre les deux téléphones (Supabase).
import { esc, eur, dFR, num, sheet, $, isoToday, isoPlus, daysUntil, loadScript } from "./ui.js";
import { scanBarcode } from "./native.js";
import { productByBarcode, communityPrice, nearbyStores, home, setHomeCity, ATTRIB } from "./apis.js";
import { realPrices } from "./prices.js";
import { CATS as WCATS, byCategory, search as wSearch, frTitles, recipeFR, recipeCost } from "./recipes.js";

export const RAYONS = ["Fruits & légumes", "Boucherie & volaille", "Poissonnerie", "Crèmerie & frais", "Surgelés", "Épicerie salée", "Épicerie sucrée", "Boissons", "Boulangerie", "Hygiène & maison", "Bébé", "Autres"];
const GUESS = [[/pomme|banane|carotte|salade|tomate|oignon|courgette|poireau|citron|fruit|légume|patate|pomme de terre|ail\b|champignon|orange|poire|kiwi|poivron|brocoli|chou|épinard/i, 0], [/poulet|boeuf|bœuf|steak|viande|saucisse|jambon|lardon|porc|dinde|haché/i, 1], [/poisson|colin|saumon|cabillaud|crevette/i, 2], [/lait|yaourt|beurre|crème|creme|fromage|emmental|oeuf|œuf|mozzarella|compote/i, 3], [/surgel|glace|frites|petits pois surg/i, 4], [/pâte|pates|riz|semoule|lentille|conserve|sauce|huile|vinaigre|sel\b|épice|farine|thon|haricot|pois chiche|coulis|bouillon/i, 5], [/sucre|chocolat|biscuit|café|cafe|thé|confiture|céréale|miel|gâteau/i, 6], [/eau|jus|soda|bière|vin\b|sirop|lait de coco/i, 7], [/pain|baguette|brioche|tortilla|wrap/i, 8], [/papier|lessive|savon|shampo|dentifrice|éponge|sac poubelle|liquide vaisselle|essuie/i, 9], [/couche|lingette|petit pot|lait infantile/i, 10]];
export const guessRayon = n => { const g = GUESS.find(([re]) => re.test(n)); return g ? RAYONS[g[1]] : "Autres"; };
// Un repas du menu : recette de la base ({id}) ou recette du monde traduite ({ext})
const mealOf = m => m.ext ? { nom: m.ext.title, emo: "🌍", min: m.ext.min || 45, etapes: m.ext.steps, ing: {}, ext: m.ext } : (window.Courses && window.Courses.R.find(x => x.id === m.id));
const PLACE_OF = r => r === "Surgelés" ? "Congélateur" : ["Fruits & légumes", "Boucherie & volaille", "Poissonnerie", "Crèmerie & frais", "Boulangerie"].includes(r) ? "Frigo" : "Placard";
const DLC_OF = { "Boucherie & volaille": 3, "Poissonnerie": 2, "Crèmerie & frais": 10, "Fruits & légumes": 6, "Boulangerie": 2, "Surgelés": 90 };
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

const C = { items: [], pantry: [], chan: null, loaded: false, ctx: null };
const sub = () => C.ctx.S.sub.courses || "liste";
const hid = () => C.ctx.S.household.id;
const uid = () => C.ctx.S.session.user.id;
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const lsSet = (k, v) => { localStorage.setItem(k, JSON.stringify(v)); };
const budgetSave = (k, v) => { lsSet("budget_" + k, v); C.ctx.S.vault && C.ctx.S.vault.schedule(); };

/* ---------- Données partagées en direct ---------- */
async function start() {
  if (C.chan) return;
  const [a, b] = await Promise.all([
    C.ctx.sb.from("shopping_items").select("*").eq("household_id", hid()).order("created_at"),
    C.ctx.sb.from("pantry_items").select("*").eq("household_id", hid()).order("expires_on", { nullsFirst: false })
  ]);
  if (a.error) C.ctx.toast(C.ctx.errText(a.error)); else C.items = a.data || [];
  if (b.error) C.pantryErr = C.ctx.errText(b.error); else { C.pantry = b.data || []; C.pantryErr = null; }
  C.loaded = true; saveStockIngredients();
  const up = (arr, p) => { if (p.eventType === "DELETE") return arr.filter(x => x.id !== p.old.id); const i = arr.findIndex(x => x.id === p.new.id); if (i >= 0) arr[i] = p.new; else arr.push(p.new); return arr; };
  C.chan = C.ctx.sb.channel("courses-" + hid())
    .on("postgres_changes", { event: "*", schema: "public", table: "shopping_items", filter: `household_id=eq.${hid()}` }, p => { C.items = up(C.items, p); draw(); })
    .on("postgres_changes", { event: "*", schema: "public", table: "pantry_items", filter: `household_id=eq.${hid()}` }, p => { C.pantry = up(C.pantry, p); saveStockIngredients(); draw(); })
    .subscribe();
}
export function stopCourses() { if (C.chan && C.ctx) { C.ctx.sb.removeChannel(C.chan); C.chan = null; C.loaded = false; } }
const db = async (q, okMsg) => { const { data, error } = await q; if (error) { C.ctx.toast(C.ctx.errText(error)); return null; } if (okMsg) C.ctx.toast(okMsg); return data; };
const upsertLocal = (arr, row) => { const i = arr.findIndex(x => x.id === row.id); if (i >= 0) arr[i] = row; else arr.push(row); };

export async function addToList(ctx, list) {
  C.ctx = C.ctx || ctx;
  const have = new Set(C.items.filter(i => !i.checked).map(i => norm(i.name)));
  const rows = list.filter(x => !have.has(norm(x.name))).map(x => ({ household_id: hid(), name: x.name, qty: x.qty || "", rayon: RAYONS.includes(x.rayon) ? x.rayon : guessRayon(x.name), added_by: uid() }));
  if (!rows.length) return ctx.toast("Tout est déjà sur la liste");
  const data = await db(ctx.sb.from("shopping_items").insert(rows).select());
  if (Array.isArray(data)) { data.forEach(r => upsertLocal(C.items, r)); ctx.toast(`${data.length} article${data.length > 1 ? "s" : ""} ajouté${data.length > 1 ? "s" : ""} à la liste`); draw(); }
}

/* ---------- Écran ---------- */
export async function renderCourses(ctx, main) {
  C.ctx = ctx; C.main = main;
  main.innerHTML = `<header class="hello"><h1>Courses</h1></header>
    <div class="seg3 sticky" role="tablist" aria-label="Étapes des courses">${[["liste", "📝 Liste"], ["magasin", "🛒 En magasin"], ["stock", "🧊 Stock"]].map(([k, l]) => `<button role="tab" data-cs="${k}" aria-selected="${sub() === k}" class="${sub() === k ? "on" : ""}">${l}</button>`).join("")}</div>
    <div id="cbody"><div class="card skel"></div></div>`;
  main.querySelectorAll("[data-cs]").forEach(b => b.onclick = () => ctx.go("courses", b.dataset.cs));
  await start(); draw();
}
function draw() {
  const el = document.getElementById("cbody"); if (!el || !C.loaded || C.ctx.S.tab !== "courses") return;
  ({ liste: drawListe, magasin: drawMagasin, stock: drawStock })[sub()](el);
}

/* ---------- 1. Liste ---------- */
function drawListe(el) {
  const todo = C.items.filter(i => !i.checked), done = C.items.filter(i => i.checked);
  const menu = lsGet("budget_coursesMenu", null), R = window.Courses;
  const byR = RAYONS.map(r => [r, todo.filter(i => i.rayon === r)]).filter(([, l]) => l.length);
  el.innerHTML = `<form class="addbar" id="l_add"><input id="l_in" placeholder="Ajouter un article…" autocomplete="off" aria-label="Article à ajouter"><button class="btn icon" aria-label="Ajouter">＋</button><button type="button" class="btn ghost icon" id="l_scan" aria-label="Scanner un code-barres">▥</button></form>
    <div class="card menucard">${menu && menu.length && R ? `<div class="sechead"><h2>🍽️ Menu de la semaine</h2><button class="link" id="l_menu">Changer</button></div>
        <div class="meals">${menu.map((m, i) => { const r = mealOf(m); return r ? `<button class="meal" data-rec="${i}"><span aria-hidden="true">${r.emo}</span>${esc(r.nom)}${m.batch ? " ×2" : ""}</button>` : ""; }).join("")}</div>
        <div class="row mt"><button class="btn ghost" id="l_world">🌍 Recettes du monde</button><button class="btn ghost" id="l_batch">🍳 Batch cooking</button></div>`
      : `<h2>🍽️ Pas d'idée de repas ?</h2><p class="sub">Un menu pas cher pour la semaine, et la liste se remplit toute seule.</p><button class="btn full mt" id="l_menu">Préparer un menu</button><button class="btn ghost full mt" id="l_world">🌍 Recettes du monde (traduites)</button>`}</div>
    <div class="card">${todo.length ? `<div class="sechead"><h2>À acheter <span class="pill">${todo.length}</span></h2></div>` + byR.map(([r, l]) => `<div class="rayon">${r}</div>${l.map(itemLine).join("")}`).join("") : `<div class="empty">La liste est vide.</div>`}
    ${done.length ? `<details class="mt"><summary><b>Déjà pris (${done.length})</b></summary>${done.map(itemLine).join("")}<button class="btn ghost full mt" id="l_clear">Retirer les articles pris</button></details>` : ""}</div>`;
  $("#l_add").onsubmit = async e => { e.preventDefault(); const v = $("#l_in").value.trim(); if (!v) return; $("#l_in").value = ""; await addToList(C.ctx, [{ name: v[0].toUpperCase() + v.slice(1) }]); $("#l_in").focus(); };
  $("#l_scan").onclick = () => scanFlow("liste");
  $("#l_menu").onclick = () => menuSheet();
  if ($("#l_batch")) $("#l_batch").onclick = () => batchSheet(menu);
  $("#l_world").onclick = () => worldSheet();
  el.querySelectorAll("[data-rec]").forEach(b => b.onclick = () => recipeSheet(menu[+b.dataset.rec]));
  bindItems(el);
  if ($("#l_clear")) $("#l_clear").onclick = async () => { const ids = done.map(i => i.id); C.items = C.items.filter(i => !i.checked); draw(); await db(C.ctx.sb.from("shopping_items").delete().in("id", ids)); };
  if (!R) loadScript("./budget/courses.js").then(draw).catch(() => {});
}
const itemLine = i => `<div class="item ${i.checked ? "done" : ""}"><label><input type="checkbox" data-c="${i.id}" ${i.checked ? "checked" : ""}><span class="nm"><b>${esc(i.name)}</b>${i.qty ? `<small>${esc(i.qty)}</small>` : ""}</span></label>${i.price != null ? `<span class="pr">${eur((i.units || 1) * i.price, 2)}</span>` : ""}<button class="del" data-d="${i.id}" aria-label="Supprimer ${esc(i.name)}">✕</button></div>`;
function bindItems(el) {
  el.querySelectorAll("[data-c]").forEach(c => c.onchange = async () => {
    const it = C.items.find(x => x.id === c.dataset.c); if (!it) return;
    if (sub() === "magasin" && c.checked) { c.checked = false; return putInCart(it); }
    const patch = { checked: c.checked, checked_by: c.checked ? uid() : null }; Object.assign(it, patch); draw();
    await db(C.ctx.sb.from("shopping_items").update(patch).eq("id", it.id));
  });
  el.querySelectorAll("[data-d]").forEach(b => b.onclick = async () => { const id = b.dataset.d; C.items = C.items.filter(x => x.id !== id); draw(); await db(C.ctx.sb.from("shopping_items").delete().eq("id", id)); });
}

/* ---------- 2. En magasin ---------- */
function drawMagasin(el) {
  const st = lsGet("pb-store", null), budget = lsGet("pb-caddie-budget", (lsGet("budget_coursesCfg", {}) || {}).budget || 80);
  const cart = C.items.filter(i => i.checked), todo = C.items.filter(i => !i.checked);
  const total = cart.reduce((a, i) => a + (i.price || 0) * (i.units || 1), 0), noPrice = cart.filter(i => i.price == null).length;
  const r = total / Math.max(1, budget);
  el.innerHTML = `<button class="card line" id="m_store"><span class="ic">🏪</span><span class="tx"><b>${st ? esc(st.name) : "Choisir le magasin"}</b><small>${st ? (st.dist != null ? `à ${st.dist.toFixed(1).replace(".", ",")} km · ` : "") + "touche pour changer" : "pour retrouver les prix relevés près de chez toi"}</small></span><span class="chev">›</span></button>
    <div class="hcard ${r > 1 ? "hneg" : ""}"><div class="l">Dans le caddie</div><div class="big">${eur(total, 2)}</div>
      <div class="gauge"><i style="width:${Math.min(100, r * 100)}%"></i></div>
      <div class="row2"><span>${cart.length} article${cart.length > 1 ? "s" : ""}${noPrice ? ` · ${noPrice} sans prix` : ""}</span><button class="lnk" id="m_budget">Budget ${eur(budget)}</button></div></div>
    <div class="row"><button class="btn big" id="m_scan">▥ Scanner un article</button><button class="btn ghost big" id="m_free">＋ Sans code</button></div>
    ${todo.length ? `<div class="card"><h2>Reste à prendre <span class="pill">${todo.length}</span></h2><p class="sub">Coche un article quand il est dans le caddie.</p>${RAYONS.map(rn => [rn, todo.filter(i => i.rayon === rn)]).filter(([, l]) => l.length).map(([rn, l]) => `<div class="rayon">${rn}</div>${l.map(itemLine).join("")}`).join("")}</div>` : ""}
    ${cart.length ? `<div class="card"><h2>Dans le caddie</h2>${cart.map(i => `<button class="cartline" data-edit="${i.id}"><span class="nm"><b>${esc(i.name)}</b><small>${i.brand ? esc(i.brand) + " · " : ""}${i.units > 1 ? i.units + " × " : ""}${i.price != null ? eur(i.price, 2) : "prix à saisir"}</small></span><span class="pr ${i.price == null ? "muted" : ""}">${i.price != null ? eur(i.price * (i.units || 1), 2) : "—"}</span></button>`).join("")}
      <button class="btn full mt" id="m_end">Terminer les courses</button></div>` : ""}
    <p class="foot">${ATTRIB}</p>`;
  $("#m_store").onclick = storeSheet;
  $("#m_budget").onclick = () => { const { el: s, close } = sheet(`<h2>Budget pour ces courses</h2><div class="amount"><input id="mb" inputmode="decimal" value="${budget}" autofocus aria-label="Budget"><span>€</span></div><button class="btn full mt" id="mbok">OK</button>`); s.querySelector("#mbok").onclick = () => { const v = num(s.querySelector("#mb").value); if (v > 0) lsSet("pb-caddie-budget", v); close(); draw(); }; };
  $("#m_scan").onclick = () => scanFlow("magasin");
  $("#m_free").onclick = () => productSheet({ name: "" }, "magasin");
  el.querySelectorAll("[data-edit]").forEach(b => b.onclick = () => putInCart(C.items.find(x => x.id === b.dataset.edit)));
  bindItems(el);
  if ($("#m_end")) $("#m_end").onclick = () => endSheet(cart, total);
}

async function storeSheet() {
  const h = home();
  const { el, close } = sheet(`<h2>Mon magasin</h2>${h ? `<p class="sub">Autour de ${esc(h.city)} · <button class="link" id="ss_city">changer de ville</button></p><div id="ss_list"><p class="sub">Recherche des magasins…</p></div>`
    : `<p class="hint">Indique ta ville une fois : l'appli trouve les supermarchés autour et utilise les prix relevés près de chez toi.</p><form id="ss_f" class="row"><input id="ss_c" placeholder="ex. Nantes ou 44000" autofocus aria-label="Ville"><button class="btn">OK</button></form><div id="ss_msg" class="err"></div>`}
    <p class="foot">© les contributeurs d'OpenStreetMap (ODbL)</p>`);
  const ask = () => { close(); localStorage.removeItem("pb-cache-home"); storeSheet(); };
  if (!h) {
    el.querySelector("#ss_f").onsubmit = async e => { e.preventDefault(); try { await setHomeCity(el.querySelector("#ss_c").value.trim()); close(); storeSheet(); } catch (err) { el.querySelector("#ss_msg").textContent = err.message === "Ville introuvable" ? "Ville introuvable." : C.ctx.errText(err); } };
    return;
  }
  el.querySelector("#ss_city").onclick = ask;
  try {
    const list = (await nearbyStores()).slice(0, 30), box = el.querySelector("#ss_list");
    box.innerHTML = list.length ? list.map((s, i) => `<button class="line" data-st="${i}"><span class="tx"><b>${esc(s.name)}</b><small>${s.dist.toFixed(1).replace(".", ",")} km${s.city ? " · " + esc(s.city) : ""}</small></span></button>`).join("") : `<p class="sub">Aucun supermarché trouvé à 15 km.</p>`;
    box.querySelectorAll("[data-st]").forEach(b => b.onclick = () => { lsSet("pb-store", list[+b.dataset.st]); close(); draw(); });
  } catch (e) {
    el.querySelector("#ss_list").innerHTML = `<p class="err">${esc(C.ctx.errText(e))}</p><form id="ss_m" class="row"><input id="ss_n" placeholder="Nom du magasin" aria-label="Nom du magasin"><button class="btn">OK</button></form>`;
    el.querySelector("#ss_m").onsubmit = ev => { ev.preventDefault(); const n = el.querySelector("#ss_n").value.trim(); if (n) { lsSet("pb-store", { name: n, brand: n, dist: null }); close(); draw(); } };
  }
}

// Scan → fiche produit (Open Food Facts) → prix (le tien, sinon relevé Open Prices, jamais inventé)
async function scanFlow(mode) {
  let ean;
  try { ean = await scanBarcode(); } catch (e) { return C.ctx.toast(e.message || "Scan impossible"); }
  if (!ean) return;
  const wait = sheet(`<h2>Recherche du produit…</h2><p class="sub">Code ${esc(ean)}</p>`);
  let p = null; try { p = await productByBarcode(ean); } catch {}
  wait.close();
  productSheet(p || { ean, name: "", unknown: true }, mode);
}

async function lastOwnPrice(key) {
  const { data } = await C.ctx.sb.from("price_observations").select("price, store_name, store_brand, observed_on").eq("household_id", hid()).eq("product_key", key).order("observed_on", { ascending: false }).limit(1);
  return data && data[0];
}

async function productSheet(p, mode) {
  const st = lsGet("pb-store", null), key = p.ean || norm(p.name);
  const matchTodo = p.name ? C.items.find(i => !i.checked && norm(p.name).split(" ").some(w => w.length > 3 && norm(i.name).includes(w))) : null;
  const { el, close } = sheet(`<h2>${p.unknown ? "Produit inconnu" : esc(p.name || "Article sans code-barres")}</h2>
    ${p.unknown ? `<p class="sub">Ce code n'est pas encore dans Open Food Facts. Donne-lui un nom :</p>` : p.brand || p.qty ? `<p class="sub">${esc([p.brand, p.qty].filter(Boolean).join(" · "))}</p>` : ""}
    ${!p.name ? `<label class="f" for="p_n">Article</label><input id="p_n" autofocus placeholder="ex. Pain de mie" autocomplete="off">` : ""}
    ${mode === "stock" ? "" : `<label class="f" for="p_v">Prix unitaire</label><div class="amount sm"><input id="p_v" inputmode="decimal" placeholder="0,00" aria-label="Prix"><span>€</span></div>
      <div id="p_hint" class="pricehint"><span class="sub">Recherche d'un prix déjà relevé…</span></div>
      <div class="stepper"><span>Quantité</span><button type="button" data-u="-1" aria-label="Moins">−</button><b id="p_u">1</b><button type="button" data-u="1" aria-label="Plus">＋</button></div>`}
    ${matchTodo && mode !== "stock" ? `<label class="sw mt"><input type="checkbox" id="p_m" checked> Remplace « ${esc(matchTodo.name)} » de la liste</label>` : ""}
    <button class="btn full mt" id="p_ok">${mode === "stock" ? "Ajouter au stock" : mode === "liste" ? "Ajouter à la liste" : "Mettre dans le caddie"}</button>`);
  let units = 1;
  el.querySelectorAll("[data-u]").forEach(b => b.onclick = () => { units = Math.max(1, Math.min(99, units + +b.dataset.u)); el.querySelector("#p_u").textContent = units; });
  const hint = el.querySelector("#p_hint");
  if (hint && (p.ean || p.name)) (async () => {
    const parts = [];
    try { const own = await lastOwnPrice(key); if (own) parts.push({ v: +own.price, t: `Ton dernier prix : <b>${eur(own.price, 2)}</b> chez ${esc(own.store_name || own.store_brand)} le ${dFR(own.observed_on)}` }); } catch {}
    if (p.ean) try { const c = await communityPrice(p.ean, st && st.brand); if (c) parts.push({ v: c.price, t: `Relevé Open Prices : <b>${eur(c.price, 2)}</b>${c.loc ? ` · ${esc(c.loc.name || "")}${c.loc.city ? " (" + esc(c.loc.city) + ")" : ""}` : ""} · ${esc(c.scope)} · ${dFR(c.date)}` }); } catch {}
    if (!el.isConnected) return;
    hint.innerHTML = parts.length ? parts.map((x, i) => `<button class="pchip" data-pv="${x.v}">${x.t}${i === 0 ? "" : ""}<span class="use">Utiliser</span></button>`).join("") : `<span class="sub">Aucun prix relevé pour ce produit. Saisis celui de l'étiquette : il servira la prochaine fois.</span>`;
    hint.querySelectorAll("[data-pv]").forEach(b => b.onclick = () => { el.querySelector("#p_v").value = String(b.dataset.pv).replace(".", ","); });
  })();
  el.querySelector("#p_ok").onclick = async () => {
    const name = (p.name || el.querySelector("#p_n").value).trim(); if (!name) return;
    if (mode === "stock") { close(); return addStockSheet({ name: name + (p.qty ? ` (${p.qty})` : ""), barcode: p.ean }); }
    const price = num(el.querySelector("#p_v").value), m = el.querySelector("#p_m");
    const row = { name, qty: p.qty || "", rayon: matchTodo && m && m.checked ? matchTodo.rayon : guessRayon(name), barcode: p.ean || null, brand: p.brand || null, units, price: isNaN(price) ? null : price, checked: mode === "magasin", checked_by: mode === "magasin" ? uid() : null };
    close();
    if (matchTodo && m && m.checked) { Object.assign(matchTodo, row); draw(); await db(C.ctx.sb.from("shopping_items").update(row).eq("id", matchTodo.id)); }
    else { const d = await db(C.ctx.sb.from("shopping_items").insert({ ...row, household_id: hid(), added_by: uid() }).select().single()); if (d) { upsertLocal(C.items, d); draw(); } }
  };
}

function putInCart(it) {
  const { el, close } = sheet(`<h2>${esc(it.name)}</h2>${it.qty ? `<p class="sub">${esc(it.qty)}</p>` : ""}
    <label class="f" for="c_v">Prix unitaire <span class="sub">(facultatif)</span></label><div class="amount sm"><input id="c_v" inputmode="decimal" placeholder="0,00" value="${it.price != null ? String(it.price).replace(".", ",") : ""}" autofocus aria-label="Prix"><span>€</span></div>
    <div id="c_hint" class="pricehint"></div>
    <div class="stepper"><span>Quantité</span><button type="button" data-u="-1" aria-label="Moins">−</button><b id="c_u">${it.units || 1}</b><button type="button" data-u="1" aria-label="Plus">＋</button></div>
    <button class="btn full mt" id="c_ok">${it.checked ? "Enregistrer" : "Dans le caddie ✓"}</button>${it.checked ? `<button class="btn ghost full mt" id="c_out">Remettre dans la liste</button>` : ""}`);
  let units = it.units || 1;
  el.querySelectorAll("[data-u]").forEach(b => b.onclick = () => { units = Math.max(1, Math.min(99, units + +b.dataset.u)); el.querySelector("#c_u").textContent = units; });
  if (it.price == null) lastOwnPrice(it.barcode || norm(it.name)).then(own => { if (own && el.isConnected) { el.querySelector("#c_hint").innerHTML = `<button class="pchip" data-pv="${own.price}">Ton dernier prix : <b>${eur(own.price, 2)}</b> chez ${esc(own.store_name || own.store_brand)} le ${dFR(own.observed_on)}<span class="use">Utiliser</span></button>`; el.querySelector("[data-pv]").onclick = () => { el.querySelector("#c_v").value = String(own.price).replace(".", ","); }; } }).catch(() => {});
  const save = async patch => { Object.assign(it, patch); close(); draw(); await db(C.ctx.sb.from("shopping_items").update(patch).eq("id", it.id)); };
  el.querySelector("#c_ok").onclick = () => { const v = num(el.querySelector("#c_v").value); save({ checked: true, checked_by: uid(), units, price: isNaN(v) ? null : v }); };
  if (el.querySelector("#c_out")) el.querySelector("#c_out").onclick = () => save({ checked: false, checked_by: null });
}

function endSheet(cart, total) {
  const st = lsGet("pb-store", null), fresh = cart.filter(i => PLACE_OF(i.rayon) !== "Placard" || i.rayon === "Surgelés");
  const { el, close } = sheet(`<h2>Terminer les courses</h2><div class="bigsum">${eur(total, 2)}</div><p class="sub">${cart.length} articles${st ? " · " + esc(st.name) : ""}</p>
    <label class="sw"><input type="checkbox" id="e_b" ${total > 0 ? "checked" : ""}> Ajouter ${eur(total, 2)} au budget (Courses)</label>
    <label class="sw"><input type="checkbox" id="e_p" checked> Garder les prix pour la prochaine fois</label>
    <label class="sw"><input type="checkbox" id="e_s" ${fresh.length ? "checked" : ""}> Mettre ${fresh.length} produit${fresh.length > 1 ? "s" : ""} frais au stock <span class="sub">(dates estimées, à corriger)</span></label>
    <button class="btn full mt" id="e_ok">Valider</button>`);
  el.querySelector("#e_ok").onclick = async () => {
    const b = el.querySelector("#e_b").checked, p = el.querySelector("#e_p").checked, s = el.querySelector("#e_s").checked; close();
    if (b && total > 0) { await C.ctx.ready(); C.ctx.act("add", { amount: -Math.round(total * 100) / 100, label: st ? st.name : "Courses", cat: "courses" }); }
    if (p) { const obs = cart.filter(i => i.price != null).map(i => ({ household_id: hid(), product_key: i.barcode || norm(i.name), product_name: i.name, ean: i.barcode, store_brand: (st && (st.brand || st.name)) || "Magasin", store_name: (st && st.name) || "", store_osm_id: st && st.id, price: i.price, observed_on: isoToday(), source: "manuel", created_by: uid() })); if (obs.length) await db(C.ctx.sb.from("price_observations").insert(obs)); }
    if (s && fresh.length) { const rows = fresh.map(i => ({ household_id: hid(), name: i.name, qty: i.units > 1 ? `${i.units} ×` : (i.qty || ""), place: PLACE_OF(i.rayon), expires_on: DLC_OF[i.rayon] ? isoPlus(DLC_OF[i.rayon]) : null, barcode: i.barcode, added_by: uid() })); const d = await db(C.ctx.sb.from("pantry_items").insert(rows).select()); if (d) d.forEach(r => upsertLocal(C.pantry, r)); }
    const ids = cart.map(i => i.id); C.items = C.items.filter(i => !ids.includes(i.id));
    await db(C.ctx.sb.from("shopping_items").delete().in("id", ids), "Courses terminées");
    C.ctx.go("courses", "liste");
  };
}

/* ---------- 3. Stock anti-gaspi ---------- */
function saveStockIngredients() {
  const R = window.Courses; if (!R) return;
  const names = C.pantry.map(p => norm(p.name));
  const ids = Object.entries(R.ING).filter(([, d]) => names.some(n => n.includes(norm(d[0]).split(" ")[0]))).map(([id]) => id);
  lsSet("pb-stock-ing", ids);
}
function drawStock(el) {
  if (C.pantryErr) { el.innerHTML = `<div class="card"><p class="err">${esc(C.pantryErr)}</p></div>`; return; }
  const P = C.pantry.slice().sort((a, b) => (a.expires_on || "9999").localeCompare(b.expires_on || "9999"));
  const groups = [["⚠️ À manger vite", P.filter(p => p.expires_on && daysUntil(p.expires_on) <= 2)], ["Cette semaine", P.filter(p => p.expires_on && daysUntil(p.expires_on) > 2 && daysUntil(p.expires_on) <= 7)], ["Plus tard", P.filter(p => p.expires_on && daysUntil(p.expires_on) > 7)], ["Sans date", P.filter(p => !p.expires_on)]].filter(([, l]) => l.length);
  const urgent = P.filter(p => p.expires_on && daysUntil(p.expires_on) <= 3), ideas = recipesFor(urgent), stats = lsGet("pb-gaspi", {}), mk = isoToday().slice(0, 7), ms = stats[mk] || { mange: 0, jete: 0 };
  el.innerHTML = `<form class="addbar" id="s_add"><input id="s_in" placeholder="Ajouter au frigo, placard…" autocomplete="off" aria-label="Produit à ajouter au stock"><button class="btn icon" aria-label="Ajouter">＋</button><button type="button" class="btn ghost icon" id="s_scan" aria-label="Scanner">▥</button></form>
    ${ideas.length ? `<div class="card tip"><h2>💡 À cuisiner avant que ça se perde</h2>${ideas.map(r => `<div class="line static"><span class="ic">${r.emo}</span><span class="tx"><b>${esc(r.nom)}</b><small>avec ${esc(r.uses.join(", "))} · ${r.min} min</small></span></div>`).join("")}</div>` : ""}
    <div class="card">${groups.length ? groups.map(([t, l]) => `<div class="rayon">${t}</div>${l.map(stockLine).join("")}`).join("") : `<div class="empty">Ton stock est vide. Ajoute ce qui est dans ton frigo, ou coche « Mettre au stock » en terminant tes courses.</div>`}</div>
    ${ms.mange + ms.jete ? `<p class="sub center">Ce mois-ci : ${ms.mange} produit${ms.mange > 1 ? "s" : ""} mangé${ms.mange > 1 ? "s" : ""}, ${ms.jete} jeté${ms.jete > 1 ? "s" : ""}.</p>` : ""}`;
  $("#s_add").onsubmit = e => { e.preventDefault(); const v = $("#s_in").value.trim(); if (v) { $("#s_in").value = ""; addStockSheet({ name: v[0].toUpperCase() + v.slice(1) }); } };
  $("#s_scan").onclick = () => scanFlow("stock");
  el.querySelectorAll("[data-out]").forEach(b => b.onclick = async () => {
    const [id, how] = b.dataset.out.split(":"); C.pantry = C.pantry.filter(x => x.id !== id);
    const s = lsGet("pb-gaspi", {}); s[mk] = s[mk] || { mange: 0, jete: 0 }; s[mk][how]++; lsSet("pb-gaspi", s);
    draw(); await db(C.ctx.sb.from("pantry_items").delete().eq("id", id)); saveStockIngredients();
  });
  el.querySelectorAll("[data-pe]").forEach(b => b.onclick = () => addStockSheet(C.pantry.find(x => x.id === b.dataset.pe)));
  if (!window.Courses) loadScript("./budget/courses.js").then(() => { saveStockIngredients(); draw(); }).catch(() => {});
}
const stockLine = p => { const d = p.expires_on ? daysUntil(p.expires_on) : null; return `<div class="item stock"><button class="nm" data-pe="${p.id}"><b>${esc(p.name)}</b><small>${esc(p.place)}${p.qty ? " · " + esc(p.qty) : ""}</small></button>
  <span class="acts">${d != null ? `<span class="dlc ${d < 0 ? "bad" : d <= 2 ? "warn" : ""}">${d < 0 ? "périmé" : d === 0 ? "aujourd'hui" : d === 1 ? "demain" : `${d} j`}</span>` : ""}
  <button class="btn sm" data-out="${p.id}:mange" aria-label="${esc(p.name)} mangé">Mangé</button><button class="btn ghost sm" data-out="${p.id}:jete" aria-label="${esc(p.name)} jeté">Jeté</button></span></div>`; };

function recipesFor(items) {
  const R = window.Courses; if (!R || !items.length) return [];
  const names = items.map(p => norm(p.name));
  return R.R.map(r => { const uses = Object.keys(r.ing).filter(id => R.ING[id] && names.some(n => n.includes(norm(R.ING[id][0]).split(" ")[0]))).map(id => R.ING[id][0].toLowerCase()); return { ...r, uses }; })
    .filter(r => r.uses.length).sort((a, b) => b.uses.length - a.uses.length || a.min - b.min).slice(0, 3);
}

function addStockSheet(p) {
  const edit = !!p.id, PL = ["Frigo", "Congélateur", "Placard"];
  let place = p.place || PLACE_OF(guessRayon(p.name)), date = p.expires_on || "";
  const { el, close } = sheet(`<h2>${edit ? "Modifier" : "Ajouter au stock"}</h2>
    <label class="f" for="a_n">Produit</label><input id="a_n" value="${esc(p.name || "")}" autocomplete="off">
    <div class="chips mt" role="radiogroup" aria-label="Où">${PL.map(x => `<button class="chip ${x === place ? "on" : ""}" data-pl="${x}" role="radio" aria-checked="${x === place}">${x}</button>`).join("")}</div>
    <label class="f">À consommer avant</label><div class="chips" id="a_q">${[["Demain", 1], ["3 jours", 3], ["1 semaine", 7], ["1 mois", 30], ["Pas de date", 0]].map(([l, n]) => `<button class="chip" data-dd="${n}">${l}</button>`).join("")}</div>
    <input id="a_d" type="date" value="${date}" aria-label="Date limite" class="mt">
    <button class="btn full mt" id="a_ok">${edit ? "Enregistrer" : "Ajouter"}</button>`);
  el.querySelectorAll("[data-pl]").forEach(b => b.onclick = () => { place = b.dataset.pl; el.querySelectorAll("[data-pl]").forEach(x => { x.classList.toggle("on", x === b); x.setAttribute("aria-checked", x === b); }); });
  el.querySelectorAll("[data-dd]").forEach(b => b.onclick = () => { el.querySelector("#a_d").value = +b.dataset.dd ? isoPlus(+b.dataset.dd) : ""; });
  el.querySelector("#a_ok").onclick = async () => {
    const row = { name: el.querySelector("#a_n").value.trim(), place, expires_on: el.querySelector("#a_d").value || null };
    if (!row.name) return; close();
    if (edit) { Object.assign(p, row); draw(); await db(C.ctx.sb.from("pantry_items").update(row).eq("id", p.id)); }
    else { const d = await db(C.ctx.sb.from("pantry_items").insert({ ...row, barcode: p.barcode || null, household_id: hid(), added_by: uid() }).select().single()); if (d) { upsertLocal(C.pantry, d); draw(); } }
    saveStockIngredients();
  };
}

/* ---------- Menu de la semaine ---------- */
const STYLES = [["petitprix", "💶 Petit prix"], ["enfant", "🧒 Enfants"], ["rapide", "⚡ Rapide"], ["batch", "🍳 Batch"], ["vege", "🥕 Végé"], ["healthy", "🥗 Équilibré"]];
async function menuSheet() {
  await loadScript("./budget/courses.js"); const R = window.Courses;
  const cfg = Object.assign({ store: "leclerc", repas: 7, adultes: 2, enfants: 1, budget: 60, styles: ["petitprix", "enfant"], exclus: [], basics: false, seed: 1 }, lsGet("budget_coursesCfg", {}));
  let res = null;
  const { el, close } = sheet(`<h2>Menu de la semaine</h2>
    <div class="stepper"><span>Repas à prévoir</span><button type="button" data-k="repas:-1" aria-label="Moins">−</button><b id="v_repas">${cfg.repas}</b><button type="button" data-k="repas:1" aria-label="Plus">＋</button></div>
    <div class="stepper"><span>Adultes</span><button type="button" data-k="adultes:-1" aria-label="Moins">−</button><b id="v_adultes">${cfg.adultes}</b><button type="button" data-k="adultes:1" aria-label="Plus">＋</button></div>
    <div class="stepper"><span>Enfants</span><button type="button" data-k="enfants:-1" aria-label="Moins">−</button><b id="v_enfants">${cfg.enfants}</b><button type="button" data-k="enfants:1" aria-label="Plus">＋</button></div>
    <div class="chips mt">${STYLES.map(([k, l]) => `<button class="chip ${cfg.styles.includes(k) ? "on" : ""}" data-sty="${k}" aria-pressed="${cfg.styles.includes(k)}">${l}</button>`).join("")}</div>
    <label class="f" for="m_st">Magasin (pour estimer le prix)</label><select id="m_st">${R.STORES.map(([id, n]) => `<option value="${id}" ${id === cfg.store ? "selected" : ""}>${esc(n)}</option>`).join("")}</select>
    <button class="btn full mt" id="m_go">Proposer un menu</button><div id="m_res"></div>`);
  el.querySelectorAll("[data-k]").forEach(b => b.onclick = () => { const [k, d] = b.dataset.k.split(":"); const lim = { repas: [2, 14], adultes: [1, 6], enfants: [0, 6] }[k]; cfg[k] = Math.max(lim[0], Math.min(lim[1], cfg[k] + +d)); el.querySelector("#v_" + k).textContent = cfg[k]; });
  el.querySelectorAll("[data-sty]").forEach(b => b.onclick = () => { const k = b.dataset.sty, i = cfg.styles.indexOf(k); if (i >= 0) cfg.styles.splice(i, 1); else cfg.styles.push(k); b.classList.toggle("on", i < 0); b.setAttribute("aria-pressed", i < 0); });
  const run = extra => {
    cfg.store = el.querySelector("#m_st").value;
    res = R.generate({ ...cfg, prices: lsGet("budget_coursesPrices", {}), stock: lsGet("pb-stock-ing", []), ...extra });
    const box = el.querySelector("#m_res");
    if (res.error) { box.innerHTML = `<p class="err">${esc(res.error)}</p>`; return; }
    const stock = lsGet("pb-stock-ing", []), buy = res.lines.filter(l => !l.placard && !stock.includes(l.id));
    const worlds = (lsGet("budget_coursesMenu", []) || []).filter(m => m.ext);
    box.innerHTML = `<div class="menures">${res.menu.map((m, i) => { const r = R.R.find(x => x.id === m.id); return `<div class="line static"><span class="ic">${r.emo}</span><span class="tx"><b>${esc(r.nom)}${m.batch ? " ×2" : ""}</b><small>${r.min} min</small></span><button class="btn ghost sm" data-swap="${i}" aria-label="Changer ${esc(r.nom)}">🔄</button></div>`; }).join("")}
      ${worlds.map(m => `<div class="line static"><span class="ic">🌍</span><span class="tx"><b>${esc(m.ext.title)}</b><small>recette du monde, gardée</small></span></div>`).join("")}</div>
      <div id="m_price"><div class="pl"><span>Prix réels en cours de calcul…</span><b id="m_prog"></b></div></div>
      <button class="btn full mt" id="m_add">Ajouter ces ${buy.length} articles à la liste</button>`;
    const st = lsGet("pb-store", null), brand = (st && (st.brand || st.name)) || R.STORES.find(x => x[0] === cfg.store)[1].replace(" (estimé)", "");
    const token = (run.tok = (run.tok || 0) + 1);
    realPrices(buy, brand, (n, t) => { const e = el.querySelector("#m_prog"); if (e && token === run.tok) e.textContent = `${n}/${t}`; }).then(lines => {
      const box2 = el.querySelector("#m_price"); if (!box2 || token !== run.tok) return;
      const real = lines.filter(l => l.real), est = lines.filter(l => !l.real), tot = lines.reduce((a, l) => a + l.cost, 0);
      box2.innerHTML = `<div class="pl"><span>Total pour ${lines.length} articles</span><b>≈ ${eur(tot)}</b></div>
        <p class="sub">${real.length} prix relevés en magasin (Open Prices, médiane${home() ? " autour de " + esc(home().city) : " en France"})${est.length ? `, ${est.length} estimé${est.length > 1 ? "s" : ""} (aucun relevé récent)` : ""}.${home() ? "" : " Indique ta ville dans Plus pour des prix locaux."}${stock.length ? " Ce que tu as en stock n'est pas compté." : ""}</p>
        <details><summary class="sub">Détail des prix</summary>${lines.map(l => `<div class="pl small"><span>${l.packs} × ${esc(l.nom)}<small>${l.real ? `${esc(l.real.scope)} · ${l.real.n} relevés` : "estimé"}</small></span><span>${eur(l.cost, 2)}</span></div>`).join("")}</details>`;
      res.priced = lines;
    }).catch(() => { const e = el.querySelector("#m_price"); if (e) e.innerHTML = `<div class="pl"><span>Estimation (hors ligne)</span><b>≈ ${eur(R.total(buy))}</b></div>`; });
    box.querySelectorAll("[data-swap]").forEach(b => b.onclick = () => { const i = +b.dataset.swap; const locked = res.menu.map((m, j) => j === i ? null : m).filter(Boolean); cfg.seed = (cfg.seed || 1) + 1; run({ locked, avoid: [res.menu[i].id] }); });
    box.querySelector("#m_add").onclick = async () => {
      budgetSave("coursesCfg", cfg); budgetSave("coursesMenu", [...res.menu, ...worlds]); close();
      await addToList(C.ctx, buy.map(l => ({ name: l.nom, qty: `${l.packs} × ${l.pack}`, rayon: { "Placard": "Épicerie salée" }[l.rayon] || l.rayon })));
      draw();
    };
  };
  el.querySelector("#m_go").onclick = () => { cfg.seed = (cfg.seed || 1) + 1; run(); };
}

function recipeSheet(m) {
  if (m.ext) return worldRecipe(m.ext.id, m);
  const R = window.Courses, r = R.R.find(x => x.id === m.id), cfg = lsGet("budget_coursesCfg", { adultes: 2, enfants: 1 }), k = (cfg.adultes + 0.5 * cfg.enfants) * (m.batch ? 2 : 1);
  const ing = Object.entries(r.ing).filter(([id, q]) => R.ING[id] && q).map(([id, q]) => { const d = R.ING[id], v = q * k; return d[2] === "pc" ? `${String(Math.round(v * 4) / 4).replace(".", ",")} ${d[0].toLowerCase()}` : `${Math.round(v / 5) * 5} ${d[2]} de ${d[0].toLowerCase()}`; });
  sheet(`<h2>${r.emo} ${esc(r.nom)}</h2><p class="sub">⏱️ ${r.min} min · ${m.batch ? "2 repas" : "1 repas"} pour ${cfg.adultes} adulte${cfg.adultes > 1 ? "s" : ""}${cfg.enfants ? ` et ${cfg.enfants} enfant${cfg.enfants > 1 ? "s" : ""}` : ""}</p>
    <h3>Ingrédients</h3><ul class="ing">${ing.map(x => `<li>${esc(x)}</li>`).join("")}<li class="sub">Huile, sel, poivre, épices du placard</li></ul>
    <h3>Préparation</h3><ol class="steps">${r.etapes.map(e => `<li>${esc(e)}</li>`).join("")}</ol><button class="btn ghost full mt" data-close>Fermer</button>`);
}

/* ---------- Batch cooking guidé ---------- */
function batchSteps(menu, sel) {
  const R = window.Courses, cfg = lsGet("budget_coursesCfg", { adultes: 2, enfants: 1 }), portions = cfg.adultes + 0.5 * cfg.enfants;
  const meals = menu.filter((m, i) => sel.includes(i));
  const recs = meals.map(m => ({ m, r: mealOf(m), k: portions * (m.batch ? 2 : 1) })).filter(x => x.r).sort((a, b) => b.r.min - a.r.min);
  const fmt = (id, v) => { const d = R.ING[id]; return d[2] === "pc" ? `${String(Math.round(v * 4) / 4).replace(".", ",")} ${d[0].toLowerCase()}` : `${Math.round(v / 5) * 5} ${d[2]} de ${d[0].toLowerCase()}`; };
  const veg = {}, starch = {};
  for (const { r, k } of recs) for (const [id, q] of Object.entries(r.ing)) { const d = R.ING[id]; if (!d || !q) continue; if (d[1] === 0) (veg[id] = veg[id] || []).push([r.nom, q * k]); if (["pates", "riz", "semoule", "pommes_terre"].includes(id)) (starch[id] = starch[id] || []).push([r.nom, q * k]); }
  const boxes = meals.reduce((a, m) => a + (m.batch ? 2 : 1), 0), tot = recs.reduce((a, x) => a + x.r.min, 0);
  const steps = [{ t: "Prépare le plan de travail", d: `Sors 2 casseroles, 1 grande poêle, un plat allant au four, une planche et ${boxes} boîtes. Préchauffe le four si besoin. Environ ${Math.round(tot * 0.65)} min au lieu de ${tot} min recette par recette.` }];
  if (Object.keys(veg).length) {
    steps.push({ t: "Lave et épluche tous les légumes", d: Object.entries(veg).map(([id, l]) => fmt(id, l.reduce((a, x) => a + x[1], 0))).join(", ") + "." });
    steps.push({ t: "Coupe tout, un tas par recette", d: Object.entries(veg).map(([id, l]) => `${R.ING[id][0]} : ${l.map(([n, q]) => `${n} (${fmt(id, q).replace(/ de .*$/, "")})`).join(", ")}`).join(" · ") });
  }
  for (const [id, l] of Object.entries(starch)) if (l.length > 1) steps.push({ t: `${R.ING[id][0]} pour ${l.length} recettes en une fois`, d: `Cuis ${fmt(id, l.reduce((a, x) => a + x[1], 0))} pour : ${l.map(x => x[0]).join(", ")}. Égoutte et répartis ; dans les recettes, saute cette cuisson.` });
  recs.forEach(({ r, m }, n) => r.etapes.forEach((e, i) => steps.push({ t: `${r.emo} ${r.nom}${m.batch ? " ×2" : ""} — ${i + 1}/${r.etapes.length}`, d: e + (/mijote|four|cuis|laisse/i.test(e) && n < recs.length - 1 ? " Pendant ce temps, passe à l'étape suivante." : "") })));
  steps.push({ t: "Refroidis, mets en boîtes, étiquette", d: `30 min maximum à température ambiante. Les ${Math.min(3, boxes)} premiers repas au frigo (3 jours maximum), les autres au congélateur, avec le nom et la date.` });
  return steps;
}
function batchSheet(menu) {
  const R = window.Courses; if (!R || !menu) return;
  const sel = menu.map((m, i) => i);
  const s = sheet(`<h2>🍳 Batch cooking</h2><p class="hint">Les recettes à préparer dans la même session :</p>
    ${menu.map((m, i) => { const r = mealOf(m); return r ? `<label class="sw"><input type="checkbox" data-bs="${i}" checked> ${r.emo} ${esc(r.nom)} <span class="sub">${r.min} min</span></label>` : ""; }).join("")}
    <button class="btn full mt" id="b_go">Commencer</button>`);
  s.el.querySelectorAll("[data-bs]").forEach(c => c.onchange = () => { const i = +c.dataset.bs, k = sel.indexOf(i); if (c.checked && k < 0) sel.push(i); if (!c.checked && k >= 0) sel.splice(k, 1); });
  s.el.querySelector("#b_go").onclick = () => { if (!sel.length) return; s.close(); guided(batchSteps(menu, sel)); };
}
function guided(steps) {
  let i = 0, timer = null;
  const ov = document.createElement("div"); ov.className = "guided"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); document.body.appendChild(ov); document.body.classList.add("noscroll");
  const quit = () => { clearInterval(timer); ov.remove(); document.body.classList.remove("noscroll"); };
  const show = () => {
    const s = steps[i], mins = (/(\d+)\s*min/.exec(s.d) || [])[1];
    ov.innerHTML = `<div class="gtop"><button class="back" id="g_q" aria-label="Quitter">✕</button><span>Étape ${i + 1} / ${steps.length}</span></div>
      <div class="gauge"><i style="width:${(i + 1) / steps.length * 100}%"></i></div>
      <h2>${esc(s.t)}</h2><p class="gd">${esc(s.d)}</p>
      ${mins && i > 0 && i < steps.length - 1 ? `<button class="btn ghost" id="g_t">⏱️ Minuteur ${mins} min</button><div id="g_tv" class="timer" aria-live="polite"></div>` : ""}
      <div class="gnav"><button class="btn ghost big" id="g_p" ${i ? "" : "disabled"}>←</button><button class="btn big" id="g_n">${i === steps.length - 1 ? "Terminé ✓" : "Étape suivante →"}</button></div>`;
    ov.querySelector("#g_q").onclick = quit;
    ov.querySelector("#g_p").onclick = () => { i--; show(); };
    ov.querySelector("#g_n").onclick = () => { if (i === steps.length - 1) return quit(); i++; show(); };
    const t = ov.querySelector("#g_t");
    if (t) t.onclick = () => { clearInterval(timer); let left = mins * 60; const v = ov.querySelector("#g_tv"); const tick = () => { v.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`; if (left-- <= 0) { clearInterval(timer); v.textContent = "C'est prêt !"; try { navigator.vibrate && navigator.vibrate([400, 200, 400, 200, 400]); } catch {} try { const a = new AudioContext(), o = a.createOscillator(); o.frequency.value = 880; o.connect(a.destination); o.start(); o.stop(a.currentTime + 0.8); } catch {} } }; tick(); timer = setInterval(tick, 1000); };
  };
  show();
}

/* ---------- Recettes du monde (TheMealDB, traduites) ---------- */
async function worldSheet() {
  await loadScript("./budget/courses.js").catch(() => {});
  const { el } = sheet(`<h2>🌍 Recettes du monde</h2><p class="sub">Plus de 300 recettes TheMealDB, traduites en français sur ton téléphone.</p>
    <form id="w_f" class="addbar"><input id="w_q" placeholder="ex. poulet, lentilles, curry…" autocomplete="off" aria-label="Rechercher une recette"><button class="btn icon" aria-label="Rechercher">🔎</button></form>
    <div class="chips">${WCATS.map(([k, l]) => `<button class="chip" data-wc="${k}">${l}</button>`).join("")}</div><div id="w_res" class="mt"></div>`);
  const res = el.querySelector("#w_res");
  const show = async (p, label) => {
    res.innerHTML = `<p class="sub">Recherche…</p>`;
    try {
      const list = await p; if (!list.length) { res.innerHTML = `<p class="sub">Aucune recette pour « ${esc(label)} ».</p>`; return; }
      res.innerHTML = `<p class="sub">Traduction des titres…</p>`;
      const fr = await frTitles(list.slice(0, 24));
      res.innerHTML = `<div class="wgrid">${fr.map(m => `<button class="wcard" data-wid="${m.idMeal}"><img src="${esc(m.strMealThumb)}/small" alt="" loading="lazy"><span>${esc(m.fr)}</span></button>`).join("")}</div>${list.length > 24 ? `<p class="sub">24 premières sur ${list.length}. Affine ta recherche.</p>` : ""}`;
      res.querySelectorAll("[data-wid]").forEach(b => b.onclick = () => worldRecipe(b.dataset.wid));
    } catch (e) { res.innerHTML = `<p class="err">${esc(C.ctx.errText(e))}</p>`; }
  };
  el.querySelectorAll("[data-wc]").forEach(b => b.onclick = () => { el.querySelectorAll("[data-wc]").forEach(x => x.classList.toggle("on", x === b)); show(byCategory(b.dataset.wc), b.textContent); });
  el.querySelector("#w_f").onsubmit = e => { e.preventDefault(); const q = el.querySelector("#w_q").value.trim(); if (q) show(wSearch(q), q); };
}

async function worldRecipe(id, inMenu) {
  const { el, close } = sheet(`<div id="wr"><h2>Chargement…</h2><p class="sub" id="wr_s">La première traduction télécharge le traducteur français (environ 30 Mo, une seule fois).</p></div>`);
  let r;
  try { r = await recipeFR(id, t => { const s = el.querySelector("#wr_s"); if (s) s.textContent = t; }); }
  catch (e) { el.querySelector("#wr").innerHTML = `<h2>Recette indisponible</h2><p class="err">${esc(C.ctx.errText(e))}</p>`; return; }
  const menu = lsGet("budget_coursesMenu", []) || [], already = menu.some(m => m.ext && m.ext.id === r.id);
  el.querySelector("#wr").innerHTML = `<img class="wimg" src="${esc(r.img)}" alt=""><h2>${esc(r.title)}</h2><p class="sub">${esc([r.cat, r.area].filter(Boolean).join(" · "))} · pour 4 personnes environ</p>
    <div id="wr_cost" class="pricehint"><span class="sub">Calcul du coût avec les prix relevés…</span></div>
    <h3>Ingrédients</h3><ul class="ing">${r.ingredients.map(x => `<li>${/^[\d,]+$/.test(x.measure || "") ? `${esc(x.measure)} ${esc(x.name.toLowerCase())}` : `${esc(x.name)}${x.measure ? ` <span class="sub">· ${esc(x.measure)}</span>` : ""}`}</li>`).join("")}</ul>
    <h3>Préparation</h3><ol class="steps">${r.steps.map(s => `<li>${esc(s)}</li>`).join("")}</ol>
    <p class="foot">Recette : TheMealDB${r.source ? ` · <a href="${esc(r.source)}" target="_blank" rel="noopener">source d'origine</a>` : ""} · traduction automatique, à vérifier pour les quantités.</p>
    <div class="row sticky-actions">${inMenu ? `<button class="btn ghost" id="wr_out">Retirer du menu</button>` : already ? `<button class="btn ghost" disabled>Déjà dans le menu</button>` : `<button class="btn" id="wr_add">＋ Au menu</button>`}<button class="btn ghost" id="wr_list">🛒 Sur la liste</button></div>`;
  const st = lsGet("pb-store", null);
  recipeCost(r, st && (st.brand || st.name)).then(c => { const b = el.querySelector("#wr_cost"); if (!b) return; b.innerHTML = c.priced >= 3 && c.priced / c.total >= 0.3 ? `<span class="sub">≈ <b>${eur(c.cost, 2)}</b> d'après les prix relevés (Open Prices) de ${c.priced} ingrédients sur ${c.total} ; épices et placard non comptés.</span>` : `<span class="sub">Pas assez de prix relevés pour chiffrer cette recette (${c.priced}/${c.total} ingrédients). Les prix réels apparaîtront en magasin.</span>`; }).catch(() => {});
  const keep = { id: r.id, title: r.title, img: r.img, steps: r.steps, ingredients: r.ingredients };
  if (el.querySelector("#wr_add")) el.querySelector("#wr_add").onclick = () => { budgetSave("coursesMenu", [...menu, { ext: keep }]); C.ctx.toast("Ajoutée au menu"); close(); draw(); };
  if (el.querySelector("#wr_out")) el.querySelector("#wr_out").onclick = () => { budgetSave("coursesMenu", menu.filter(m => !(m.ext && m.ext.id === r.id))); close(); draw(); };
  el.querySelector("#wr_list").onclick = async () => {
    const skip = /^(sel|poivre|eau|huile|huile d'olive)$/i;
    await addToList(C.ctx, r.ingredients.filter(x => !skip.test(x.name)).map(x => ({ name: x.name, qty: x.measure && x.measure !== "selon le goût" ? x.measure : "" })));
    close();
  };
}
