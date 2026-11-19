// Pilotage budget — application (version ordi et APK Android, même code)
import { sb } from "./supabase.js";
import { APP_VERSION } from "./config.js";
import { checkUpdate, openUrl } from "./update.js";
import { esc, toast, errText } from "./ui.js";
import { createVault } from "./vault.js";
import { takeBankNotifications, isNative } from "./native.js";
import { renderToday } from "./view-today.js";
import { renderBudget } from "./view-budget.js";
import { renderCourses, stopCourses, addToList } from "./view-courses.js";
import { renderPlus } from "./view-plus.js";

const $app = document.getElementById("app");
const S = { session: null, household: null, me: null, members: [], tab: "today", sub: { courses: "liste" }, update: null, vault: null, vaultStatus: ["off", ""], detail: null };

/* ---------------- Démarrage et session ---------------- */
async function boot() {
  const { data } = await sb.auth.getSession();
  S.session = data.session;
  sb.auth.onAuthStateChange((_e, session) => { const had = !!S.session; S.session = session; if (!!session !== had) route(); });
  route();
  checkUpdate().then(u => { if (u) { S.update = u; drawUpdate(); } });
  ctx.checkUpdate = async () => { const u = await checkUpdate(); S.update = u; drawUpdate(); return u; };
  ctx.signOut = () => { stopCourses(); sb.auth.signOut(); };
  ctx.loadMembers = loadMembers; ctx.renderAll = render;
}

async function route() {
  if (!S.session) return renderAuth();
  const { data, error } = await sb.from("household_members").select("household_id, display_name, role, households(id, name, invite_code)").eq("user_id", S.session.user.id).limit(1);
  if (error) { $app.innerHTML = `<div class="auth"><div class="card"><p class="err">${esc(errText(error))}</p><p class="hint">La base n'est peut-être pas encore installée (fichier SQL à exécuter dans Supabase).</p><button class="btn ghost full" id="out">Se déconnecter</button></div></div>`; document.getElementById("out").onclick = () => sb.auth.signOut(); return; }
  if (!data.length || !data[0].households) return renderJoin();
  S.me = data[0]; S.household = data[0].households;
  await loadMembers();
  render();
  startVault();
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

/* ---------------- Application : 4 onglets ---------------- */
// Le calcul du budget (relevés, paie, prêt, plan) tourne dans le module « budget/ », chargé en arrière-plan.
// Ses données restent sur CET appareil ; le coffre du foyer les partage chiffrées avec l'autre téléphone.
const TABS = [["today", "🏠", "Aujourd'hui"], ["budget", "📊", "Budget"], ["courses", "🛒", "Courses"], ["plus", "☰", "Plus"]];
let frameReady = null;

const ctx = {
  S, sb, toast, errText,
  win: () => { const f = document.getElementById("budget"); return f && f.contentWindow; },
  ready: () => frameReady,
  model: () => { try { return ctx.win().pbModel(); } catch { return null; } },
  // Action sur le budget : calcul immédiat, puis un seul réaffichage de l'écran (pas de double rendu)
  act: (op, a) => {
    S.selfChange = Date.now(); let r;
    try { r = ctx.win().pbAct(op, a); } catch (e) { toast("Le budget n'est pas encore chargé."); return; }
    if (!["cats", "guess"].includes(op) && !S.detail && ["today", "budget"].includes(S.tab)) { clearTimeout(S.reT); S.reT = setTimeout(() => show(S.tab), 0); }
    return r;
  },
  isReady: () => !!S.frameOk,
  go: (tab, sub) => show(tab, sub),
  detail: (g, s, title) => openDetail(g, s, title),
  rerender: () => show(S.tab),
  meName: uid => (S.members.find(m => m.user_id === uid) || {}).display_name || "quelqu'un"
};

function render() {
  try { localStorage.setItem("pb-name", S.me.display_name || ""); } catch {}
  $app.innerHTML = `<nav class="bottom" aria-label="Rubriques">${TABS.map(([k, i, l]) => `<button data-t="${k}"><span class="i" aria-hidden="true">${i}</span>${l}</button>`).join("")}</nav>
    <div id="updbar"></div>
    <main id="main"></main>
    <div id="detail" hidden><div class="dhead"><button class="back" id="dback" aria-label="Retour">←</button><h1 id="dtitle"></h1></div><iframe id="budget" title="Détail du budget" src="./budget/index.html?embed=1#g=plus&s=comptes"></iframe></div>`;
  S.frameOk = false;
  frameReady = new Promise(ok => { const f = document.getElementById("budget"); f.addEventListener("load", () => { S.frameOk = true; ok(); }, { once: true }); });
  document.querySelectorAll("[data-t]").forEach(b => b.onclick = () => show(b.dataset.t));
  document.getElementById("dback").onclick = closeDetail;
  window.onresize = sizeFrame;
  drawUpdate();
  frameReady.then(() => { pullNotifications(); if (["today", "budget"].includes(S.tab)) show(S.tab); });
  show(S.tab);
}

function drawUpdate() {
  const el = document.getElementById("updbar"); if (!el) return;
  el.innerHTML = S.update ? `<div class="banner"><b>🆕 Version ${esc(S.update.version)} disponible</b><button class="btn" id="upd">Installer</button></div>` : "";
  if (S.update) document.getElementById("upd").onclick = () => openUrl(S.update.url);
}

function show(tab, sub) {
  if (S.detail) closeDetail(true);
  if (S.tab === "courses" && tab !== "courses") stopCourses();
  S.tab = tab; if (sub) S.sub[tab] = sub;
  document.querySelectorAll("[data-t]").forEach(b => { b.classList.toggle("on", b.dataset.t === tab); b.setAttribute("aria-current", b.dataset.t === tab ? "page" : "false"); });
  const main = document.getElementById("main"); if (!main) return;
  const same = main.dataset.tab === tab, keepY = same ? window.scrollY : 0; main.dataset.tab = tab;
  if (!same) { main.classList.remove("fade"); void main.offsetWidth; main.classList.add("fade"); }
  ({ today: renderToday, budget: renderBudget, courses: renderCourses, plus: renderPlus })[tab](ctx, main);
  window.scrollTo({ top: keepY });
}

/* ---------- Écrans détaillés (relevés, opérations, paie, prêt…) ---------- */
function openDetail(g, s, title) {
  S.detail = { g, s };
  const d = document.getElementById("detail"), f = document.getElementById("budget");
  document.getElementById("dtitle").textContent = title || "";
  document.getElementById("main").hidden = true; d.hidden = false; document.body.classList.add("indetail");
  try { f.contentWindow.location.hash = `g=${g}&s=${s}`; f.contentWindow.postMessage({ pbShow: true }, "*"); } catch { f.src = `./budget/index.html?embed=1#g=${g}&s=${s}`; }
  sizeFrame(); window.scrollTo({ top: 0 });
}
function closeDetail(silent) {
  S.detail = null; const d = document.getElementById("detail"); if (!d) return;
  d.hidden = true; document.getElementById("main").hidden = false; document.body.classList.remove("indetail");
  if (silent !== true) show(S.tab);
}
function sizeFrame() {
  const d = document.getElementById("detail"); if (!d || d.hidden) return;
  const f = document.getElementById("budget"), top = f.getBoundingClientRect().top, nav = window.innerWidth < 1000 ? document.querySelector("nav.bottom").offsetHeight : 0;
  f.style.height = Math.max(300, window.innerHeight - top - nav) + "px";
}

// Messages du module budget
let rerT = null;
window.addEventListener("message", e => {
  const d = e.data || {}; if (!S.household) return;
  if (d.pbChanged) {
    S.vault && S.vault.schedule();
    // un changement venu de l'écran lui-même est déjà affiché ; sinon (synchro, détail) on rafraîchit
    if (Date.now() - (S.selfChange || 0) < 2500) return;
    clearTimeout(rerT); rerT = setTimeout(() => { if (!S.detail && ["today", "budget"].includes(S.tab) && !document.querySelector(".sheetwrap")) show(S.tab); }, 400);
  }
  if (d.pbAddToList) addToList(ctx, d.pbAddToList);
  // bouton du module qui mène vers un autre écran (ex. « Importer mes données ») : seulement s'il change de rubrique
  if (d.pbGroup && S.detail && d.pbGroup !== S.detail.g && ["accueil", "mois", "courses"].includes(d.pbGroup)) {
    closeDetail(true); show({ accueil: "today", mois: "budget", courses: "courses" }[d.pbGroup]); }
});

/* ---------- Coffre chiffré ---------- */
function startVault() {
  S.vault = createVault({
    hid: S.household.id, uid: S.session.user.id,
    onApplied: () => { const w = ctx.win(); if (w) { w.location.reload(); frameReady = new Promise(ok => document.getElementById("budget").addEventListener("load", () => { ok(); if (!S.detail && S.tab !== "courses") show(S.tab); }, { once: true })); } },
    onStatus: (s, extra) => { S.vaultStatus = [s, extra]; const el = document.getElementById("vaultst"); if (el) renderPlus(ctx, document.getElementById("main")); }
  });
  S.vault.start().catch(() => {});
}

/* ---------- Paiements lus dans les notifications ---------- */
async function pullNotifications() {
  if (!isNative()) return;
  const items = await takeBankNotifications();
  if (items.length) { await frameReady; ctx.act("inboxPush", { items }); toast(`${items.length} paiement${items.length > 1 ? "s" : ""} détecté${items.length > 1 ? "s" : ""}`); }
}
if (isNative()) import("@capacitor/app").then(({ App }) => App.addListener("resume", () => { if (S.household) { pullNotifications(); S.vault && S.vault.pull(); } }));

export { ctx, S, drawUpdate, loadMembers };

boot();
