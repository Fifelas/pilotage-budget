// Pilotage budget — application (version ordi et APK Android, même code)
import { sb } from "./supabase.js";
import { APP_VERSION } from "./config.js";
import { checkUpdate, openUrl } from "./update.js";

const $app = document.getElementById("app");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const toast = msg => { const t = document.getElementById("toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("on"), 2600); };
const errText = e => {
  const m = (e && (e.message || e.error_description)) || String(e);
  if (/Invalid login/i.test(m)) return "E-mail ou mot de passe incorrect.";
  if (/Email not confirmed/i.test(m)) return "Confirme d'abord ton adresse : ouvre le lien reçu par e-mail.";
  if (/already registered/i.test(m)) return "Un compte existe déjà avec cet e-mail : connecte-toi.";
  if (/Password should be/i.test(m)) return "Mot de passe trop court (8 caractères minimum).";
  if (/code inconnu/i.test(m)) return "Ce code d'invitation n'existe pas.";
  if (/Failed to fetch|NetworkError/i.test(m)) return "Pas de connexion internet.";
  return m;
};

const S = { session: null, household: null, me: null, members: [], tab: "accueil", items: [], channel: null, update: null };

/* ---------------- Démarrage et session ---------------- */
async function boot() {
  const { data } = await sb.auth.getSession();
  S.session = data.session;
  sb.auth.onAuthStateChange((_e, session) => { const had = !!S.session; S.session = session; if (!!session !== had) route(); });
  route();
  checkUpdate().then(u => { if (u) { S.update = u; drawUpdate(); } });
}

async function route() {
  if (!S.session) return renderAuth();
  const { data, error } = await sb.from("household_members").select("household_id, display_name, role, households(id, name, invite_code)").eq("user_id", S.session.user.id).limit(1);
  if (error) { $app.innerHTML = `<div class="auth"><div class="card"><p class="err">${esc(errText(error))}</p><p class="hint">La base n'est peut-être pas encore installée (fichier SQL à exécuter dans Supabase).</p><button class="btn ghost full" id="out">Se déconnecter</button></div></div>`; document.getElementById("out").onclick = () => sb.auth.signOut(); return; }
  if (!data.length || !data[0].households) return renderJoin();
  S.me = data[0]; S.household = data[0].households;
  await loadMembers();
  render();
}

async function loadMembers() {
  const { data } = await sb.from("household_members").select("user_id, display_name, role").eq("household_id", S.household.id);
  S.members = data || [];
}
const nameOf = uid => (S.members.find(m => m.user_id === uid) || {}).display_name || "quelqu'un";

/* ---------------- Connexion / création de compte ---------------- */
function renderAuth(mode = "login", msg = "") {
  $app.innerHTML = `<div class="auth">
    <div class="logo">€</div><h1>Pilotage budget</h1><span class="sub">Le budget et les courses du foyer, à deux.</span>
    <div class="card">
      <div class="seg" style="display:flex"><button data-m="login" class="${mode==="login"?"on":""}" style="flex:1">Se connecter</button><button data-m="signup" class="${mode==="signup"?"on":""}" style="flex:1">Créer un compte</button></div>
      <form id="f">
        ${mode==="signup" ? `<label class="f" for="nm">Prénom</label><input id="nm" autocomplete="given-name" required>` : ""}
        <label class="f" for="em">E-mail</label><input id="em" type="email" autocomplete="email" required>
        <label class="f" for="pw">Mot de passe</label><input id="pw" type="password" autocomplete="${mode==="signup"?"new-password":"current-password"}" minlength="8" required>
        <button class="btn full" style="margin-top:16px" id="go">${mode==="signup" ? "Créer mon compte" : "Me connecter"}</button>
        <div id="msg" class="${msg.startsWith("✓")?"ok":"err"}">${esc(msg)}</div>
      </form>
      ${mode==="login" ? `<button class="btn ghost full" style="margin-top:10px" id="reset">Mot de passe oublié</button>` : ""}
    </div>
    <p class="foot" style="text-align:center">Version ${esc(APP_VERSION)}</p></div>`;
  document.querySelectorAll("[data-m]").forEach(b => b.onclick = () => renderAuth(b.dataset.m));
  document.getElementById("f").onsubmit = async e => {
    e.preventDefault();
    const go = document.getElementById("go"), m = document.getElementById("msg"); go.disabled = true; m.textContent = "";
    const email = document.getElementById("em").value.trim(), password = document.getElementById("pw").value;
    try {
      if (mode === "signup") {
        const name = document.getElementById("nm").value.trim();
        const { data, error } = await sb.auth.signUp({ email, password, options: { data: { display_name: name }, emailRedirectTo: location.origin + location.pathname } });
        if (error) throw error;
        if (!data.session) return renderAuth("login", "✓ Compte créé. Ouvre le lien de confirmation reçu par e-mail, puis connecte-toi.");
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password }); if (error) throw error;
      }
    } catch (err) { m.className = "err"; m.textContent = errText(err); go.disabled = false; }
  };
  const r = document.getElementById("reset");
  if (r) r.onclick = async () => {
    const email = document.getElementById("em").value.trim(), m = document.getElementById("msg");
    if (!email) { m.className = "err"; m.textContent = "Saisis d'abord ton e-mail."; return; }
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    m.className = error ? "err" : "ok"; m.textContent = error ? errText(error) : "✓ E-mail envoyé : suis le lien pour choisir un nouveau mot de passe.";
  };
}

/* ---------------- Créer ou rejoindre le foyer ---------------- */
function renderJoin(msg = "") {
  const name = S.session.user.user_metadata?.display_name || "";
  $app.innerHTML = `<div class="auth">
    <div class="logo">🏠</div><h1>Ton foyer</h1><span class="sub">Les courses, les prix et les menus sont partagés entre les membres du foyer.</span>
    <div class="card"><h2>Créer le foyer</h2><p class="hint">Si tu es le premier à t'inscrire. Tu recevras un code à donner à ta conjointe.</p>
      <label class="f" for="hn">Nom du foyer</label><input id="hn" value="Foyer ${esc(name)}">
      <label class="f" for="dn">Ton prénom</label><input id="dn" value="${esc(name)}">
      <button class="btn full" style="margin-top:14px" id="create">Créer le foyer</button></div>
    <div class="card"><h2>Rejoindre un foyer</h2><p class="hint">Avec le code d'invitation reçu.</p>
      <label class="f" for="code">Code d'invitation</label><input id="code" placeholder="ex. 4F7A2C9B" style="text-transform:uppercase;letter-spacing:.1em">
      <button class="btn ghost full" style="margin-top:14px" id="join">Rejoindre</button>
      <div class="err" id="msg">${esc(msg)}</div></div>
    <button class="btn ghost full" id="out">Se déconnecter</button></div>`;
  const dn = () => document.getElementById("dn").value.trim() || name;
  document.getElementById("create").onclick = async () => {
    const { error } = await sb.rpc("create_household", { p_name: document.getElementById("hn").value, p_display_name: dn() });
    if (error) return renderJoin(errText(error));
    toast("Foyer créé"); route();
  };
  document.getElementById("join").onclick = async () => {
    const { error } = await sb.rpc("join_household", { p_code: document.getElementById("code").value, p_display_name: dn() });
    if (error) return renderJoin(errText(error));
    toast("Bienvenue dans le foyer"); route();
  };
  document.getElementById("out").onclick = () => sb.auth.signOut();
}

/* ---------------- Application ---------------- */
// Le budget (relevés, paie, prêt, menus…) est le module « budget/index.html », affiché dans un cadre.
// Ses données restent dans le stockage de CET appareil. La liste de courses et le foyer sont dans Supabase.
const TABS = [["accueil","🏠","Accueil"],["mois","📅","Ce mois"],["courses","🛒","Courses"],["eco","💰","Économies"],["pret","🏡","Prêt"],["plus","☰","Plus"]];
const FRAME_TABS = { accueil: "accueil", mois: "mois", eco: "eco", pret: "pret" };
const SUBS = {
  courses: [["liste","Liste partagée"],["menus","Menus & recettes"]],
  plus: [["foyer","Foyer & compte"],["comptes","Relevés & import"],["operations","Opérations"],["recurrents","Prélèvements"],["categories","Catégories"],["paieT","Fiche de paie"]]
};
const SUB_FRAME = { menus: ["courses"], comptes: ["plus","comptes"], operations: ["plus","operations"], recurrents: ["plus","recurrents"], categories: ["plus","categories"], paieT: ["plus","paieT"] };
S.sub = { courses: "liste", plus: "foyer" };

function render() {
  try { localStorage.setItem("pb-name", S.me.display_name || ""); } catch {}
  const first = (S.me.display_name || S.session.user.email || "?").trim();
  $app.innerHTML = `<header class="top" id="hdr"><div class="av">${esc(first[0].toUpperCase())}</div><div><h1>Bonjour ${esc(first)}</h1><div class="sub">${esc(S.household.name)} · ${S.members.length} membre${S.members.length>1?"s":""}</div></div></header>
    <nav class="bottom" aria-label="Rubriques">${TABS.map(([k,i,l]) => `<button data-t="${k}"><span class="i">${i}</span>${l}</button>`).join("")}</nav>
    <div id="updbar"></div><div class="subtabs" id="subtabs"></div>
    <main id="main"></main>
    <div id="frame" hidden><iframe id="budget" title="Budget" src="./budget/index.html?embed=1#g=accueil"></iframe></div>`;
  document.querySelectorAll("[data-t]").forEach(b => b.onclick = () => show(b.dataset.t));
  window.onresize = sizeFrame;
  drawUpdate(); show(S.tab);
}

function drawUpdate() {
  const el = document.getElementById("updbar"); if (!el) return;
  el.innerHTML = S.update ? `<div class="banner" style="margin:8px 14px"><b>🆕 Version ${esc(S.update.version)} disponible</b><button class="btn" id="upd">Installer</button></div>` : "";
  if (S.update) document.getElementById("upd").onclick = () => openUrl(S.update.url);
}

function frameGo(g, s) {
  const f = document.getElementById("budget"); if (!f) return;
  const h = `g=${g}${s ? "&s=" + s : ""}`;
  try { if (f.contentWindow && f.contentWindow.location.pathname.endsWith("/budget/index.html")) { f.contentWindow.location.hash = h; return; } } catch {}
  f.src = `./budget/index.html?embed=1#${h}`;
}
function sizeFrame() {
  const fr = document.getElementById("frame"); if (!fr || fr.hidden) return;
  const top = fr.getBoundingClientRect().top + window.scrollY, nav = window.innerWidth < 1000 ? document.querySelector("nav.bottom").offsetHeight : 0;
  fr.firstElementChild.style.height = Math.max(300, window.innerHeight - top - nav) + "px";
}

function show(tab, sub) {
  S.tab = tab; if (sub) S.sub[tab] = sub;
  document.querySelectorAll("[data-t]").forEach(b => b.classList.toggle("on", b.dataset.t === tab));
  const st = document.getElementById("subtabs"), main = document.getElementById("main"), fr = document.getElementById("frame");
  st.innerHTML = SUBS[tab] ? `<div class="pills">${SUBS[tab].map(([k,l]) => `<button data-s="${k}" class="${S.sub[tab]===k?"on":""}">${l}</button>`).join("")}</div>` : "";
  st.querySelectorAll("[data-s]").forEach(b => b.onclick = () => show(tab, b.dataset.s));
  const cur = SUBS[tab] ? S.sub[tab] : null;
  const target = FRAME_TABS[tab] ? [FRAME_TABS[tab]] : (cur && SUB_FRAME[cur]);
  if (target) {
    main.hidden = true; main.innerHTML = ""; fr.hidden = false; frameGo(...target); sizeFrame();
  } else {
    fr.hidden = true; main.hidden = false;
    main.innerHTML = (tab === "courses" ? VIEWS.courses() : VIEWS.plus());
    (AFTER[tab] || (() => {}))();
  }
  window.scrollTo({ top: 0 });
}
// Le module budget signale sa rubrique (ex. un bouton « Importer mes données » qui ouvre « Plus »)
window.addEventListener("message", e => {
  const d = e.data || {}; if (!d.pbGroup || !S.household) return;
  const map = { accueil: "accueil", mois: "mois", eco: "eco", pret: "pret" };
  if (map[d.pbGroup] && S.tab !== map[d.pbGroup]) { S.tab = map[d.pbGroup]; document.querySelectorAll("[data-t]").forEach(b => b.classList.toggle("on", b.dataset.t === S.tab)); document.getElementById("subtabs").innerHTML = ""; }
  if (d.pbGroup === "plus" && S.tab !== "plus") { S.tab = "plus"; S.sub.plus = d.pbSection || "comptes"; document.querySelectorAll("[data-t]").forEach(b => b.classList.toggle("on", b.dataset.t === "plus"));
    const st = document.getElementById("subtabs"); st.innerHTML = `<div class="pills">${SUBS.plus.map(([k,l]) => `<button data-s="${k}" class="${S.sub.plus===k?"on":""}">${l}</button>`).join("")}</div>`; st.querySelectorAll("[data-s]").forEach(b => b.onclick = () => show("plus", b.dataset.s)); }
  if (d.pbGroup === "courses" && S.tab !== "courses") { S.tab = "courses"; S.sub.courses = "menus"; document.querySelectorAll("[data-t]").forEach(b => b.classList.toggle("on", b.dataset.t === "courses")); }
});

const VIEWS = {
  courses: () => `<section><div class="card"><h2>🛒 Liste de courses partagée</h2><p class="hint">Ce que l'un ajoute ou coche apparaît tout de suite sur le téléphone de l'autre.</p>
      <form id="add" class="row"><div style="flex:2 1 200px"><label class="f" for="in">Article</label><input id="in" placeholder="ex. Lait demi-écrémé" autocomplete="off" required></div>
        <div style="flex:1 1 90px"><label class="f" for="qt">Quantité</label><input id="qt" placeholder="ex. 2 L"></div>
        <div style="flex:1 1 150px"><label class="f" for="ry">Rayon</label><select id="ry">${RAYONS.map(r => `<option>${r}</option>`).join("")}</select></div>
        <div style="flex:0 0 auto"><button class="btn">Ajouter</button></div></form></div>
    <div class="card" id="list"></div></section>`,
  plus: () => `<section><div class="grid2"><div class="card"><h2>🏠 Mon foyer</h2>
      <p class="hint">Donne ce code à ta conjointe : elle crée son compte, puis choisit « Rejoindre un foyer ».</p>
      <div class="code">${esc(S.household.invite_code)}</div>
      <p class="hint" style="margin-top:12px">Membres : ${S.members.map(m => `${esc(m.display_name || "?")}${m.role==="admin"?" <span class=\"pill\">admin</span>":""}`).join(", ")}</p>
      <label class="f" for="mn">Mon prénom</label><div class="row"><input id="mn" value="${esc(S.me.display_name)}"><button class="btn ghost" id="mnsave" style="flex:0 0 auto">Enregistrer</button></div></div>
    <div class="card"><h2>⚙️ Compte et appli</h2><p class="hint">Connecté avec ${esc(S.session.user.email)}<br>Version ${esc(APP_VERSION)}</p>
      <p class="hint">Tes relevés bancaires, bulletins de paie et ton prêt sont enregistrés uniquement sur cet appareil (rubrique « Relevés & import »). Pense à télécharger une sauvegarde de temps en temps.</p>
      <div class="row"><button class="btn ghost" id="chk">Vérifier les mises à jour</button><button class="btn danger" id="out">Se déconnecter</button></div><div id="chkmsg" class="sub" style="margin-top:8px"></div></div></div>
    <p class="foot">Données de produits et de prix : Open Food Facts et Open Prices (licence ODbL). Cartes et magasins : © les contributeurs d'OpenStreetMap (ODbL). Recettes : TheMealDB. Lecture des PDF : pdf.js (Mozilla) ; fichiers Excel : SheetJS.</p></section>`
};

const RAYONS = ["Fruits & légumes","Boucherie & volaille","Poissonnerie","Crèmerie & frais","Surgelés","Épicerie salée","Épicerie sucrée","Boissons","Boulangerie","Hygiène & maison","Bébé","Autres"];
const GUESS = [[/pomme|banane|carotte|salade|tomate|oignon|courgette|poireau|citron|fruit|légume|patate|pomme de terre|ail|champignon|orange|poire|kiwi/i,0],[/poulet|boeuf|bœuf|steak|viande|saucisse|jambon|lardon|porc|dinde/i,1],[/poisson|colin|saumon|thon frais|crevette/i,2],[/lait|yaourt|beurre|crème|creme|fromage|emmental|oeuf|œuf|mozzarella/i,3],[/surgel|glace|frites/i,4],[/pâte|pates|riz|semoule|lentille|conserve|sauce|huile|vinaigre|sel|épice|farine|thon|haricot|pois chiche|coulis/i,5],[/sucre|chocolat|biscuit|café|cafe|thé|confiture|céréale|miel/i,6],[/eau|jus|soda|bière|vin|sirop/i,7],[/pain|baguette|brioche|tortilla/i,8],[/papier|lessive|savon|shampo|dentifrice|éponge|sac poubelle|liquide vaisselle/i,9],[/couche|lingette|petit pot|lait infantile/i,10]];
const guessRayon = n => { const g = GUESS.find(([re]) => re.test(n)); return g ? RAYONS[g[1]] : "Autres"; };

const AFTER = {
  courses: () => {
    const inp = document.getElementById("in"), ry = document.getElementById("ry");
    inp.oninput = () => { ry.value = guessRayon(inp.value); };
    document.getElementById("add").onsubmit = async e => {
      e.preventDefault(); const name = inp.value.trim(); if (!name) return;
      const row = { household_id: S.household.id, name, qty: document.getElementById("qt").value.trim(), rayon: ry.value, added_by: S.session.user.id };
      inp.value = ""; document.getElementById("qt").value = ""; inp.focus();
      const { data, error } = await sb.from("shopping_items").insert(row).select().single();
      if (error) return toast(errText(error));
      upsertItem(data); drawList();
    };
    startList(); drawList();
  },
  plus: () => {
    document.getElementById("out").onclick = () => { stopList(); sb.auth.signOut(); };
    document.getElementById("mnsave").onclick = async () => {
      const v = document.getElementById("mn").value.trim();
      const { error } = await sb.from("household_members").update({ display_name: v }).eq("household_id", S.household.id).eq("user_id", S.session.user.id);
      if (error) return toast(errText(error)); S.me.display_name = v; await loadMembers(); toast("Prénom enregistré"); render();
    };
    document.getElementById("chk").onclick = async () => {
      const m = document.getElementById("chkmsg"); m.textContent = "Recherche…";
      const u = await checkUpdate(); S.update = u;
      m.textContent = u ? `Version ${u.version} disponible.` : (window.Capacitor?.isNativePlatform?.() ? "Tu as la dernière version." : "Sur ordinateur, la page est toujours à jour.");
      drawUpdate();
    };
  }
};

/* ---------------- Liste partagée en direct ---------------- */
function upsertItem(it) { const i = S.items.findIndex(x => x.id === it.id); if (i >= 0) S.items[i] = it; else S.items.push(it); }
async function startList() {
  if (S.channel) return;
  const { data, error } = await sb.from("shopping_items").select("*").eq("household_id", S.household.id).order("created_at");
  if (!error) S.items = data || [];
  S.channel = sb.channel("liste-" + S.household.id)
    .on("postgres_changes", { event: "*", schema: "public", table: "shopping_items", filter: `household_id=eq.${S.household.id}` }, p => {
      if (p.eventType === "DELETE") S.items = S.items.filter(x => x.id !== p.old.id); else upsertItem(p.new);
      drawList();
    }).subscribe();
  drawList();
}
function stopList() { if (S.channel) { sb.removeChannel(S.channel); S.channel = null; } }

function drawList() {
  const el = document.getElementById("list"); if (!el) return;
  const todo = S.items.filter(i => !i.checked), done = S.items.filter(i => i.checked);
  if (!S.items.length) { el.innerHTML = `<div class="empty">La liste est vide. Ajoute un premier article ci-dessus.</div>`; return; }
  const line = i => `<label class="item ${i.checked?"done":""}"><input type="checkbox" data-c="${i.id}" ${i.checked?"checked":""}><span class="nm"><b>${esc(i.name)}</b>${i.qty?` · ${esc(i.qty)}`:""}<small>${i.checked ? `coché par ${esc(nameOf(i.checked_by))}` : `ajouté par ${esc(nameOf(i.added_by))}`}</small></span><button class="del" data-d="${i.id}" aria-label="Supprimer ${esc(i.name)}">✕</button></label>`;
  const byR = RAYONS.map(r => [r, todo.filter(i => i.rayon === r)]).filter(([, l]) => l.length);
  el.innerHTML = `<h2>À acheter <span class="pill">${todo.length}</span></h2>` + (byR.length ? byR.map(([r, l]) => `<div class="rayon">${r}</div>${l.map(line).join("")}`).join("") : `<div class="empty">Tout est dans le caddie 🎉</div>`) +
    (done.length ? `<h2 style="margin-top:18px">Dans le caddie <span class="pill">${done.length}</span></h2>${done.map(line).join("")}<button class="btn ghost full" style="margin-top:12px" id="clear">Retirer les articles cochés</button>` : "");
  el.querySelectorAll("[data-c]").forEach(c => c.onchange = async () => {
    const it = S.items.find(x => x.id === c.dataset.c); if (!it) return;
    const patch = { checked: c.checked, checked_by: c.checked ? S.session.user.id : null };
    Object.assign(it, patch); drawList();
    const { error } = await sb.from("shopping_items").update(patch).eq("id", it.id); if (error) toast(errText(error));
  });
  el.querySelectorAll("[data-d]").forEach(b => b.onclick = async e => {
    e.preventDefault(); const id = b.dataset.d; S.items = S.items.filter(x => x.id !== id); drawList();
    const { error } = await sb.from("shopping_items").delete().eq("id", id); if (error) toast(errText(error));
  });
  const cl = document.getElementById("clear");
  if (cl) cl.onclick = async () => {
    const ids = done.map(i => i.id); S.items = S.items.filter(i => !i.checked); drawList();
    const { error } = await sb.from("shopping_items").delete().in("id", ids); if (error) toast(errText(error));
  };
}

boot();
