// Coffre chiffré du foyer : le budget est chiffré sur le téléphone avant d'être envoyé.
// AES-GCM 256 bits, clé dérivée de la phrase secrète par PBKDF2-SHA256 (600 000 tours).
// Supabase ne voit qu'un bloc illisible ; la phrase et la clé ne quittent jamais l'appareil.
import { sb } from "./supabase.js";

const PREFIX = "budget_";
const SKIP = new Set(["paieSel"]);            // préférences d'affichage propres à chaque téléphone
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = u8 => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function pipe(u8, Stream) {
  if (typeof Stream === "undefined") return u8;
  return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new Stream("gzip"))).arrayBuffer());
}
async function deriveKey(phrase, salt) {
  const base = await crypto.subtle.importKey("raw", enc.encode(phrase.normalize("NFC").trim()), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: unb64(salt), iterations: 600000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}
async function encryptObj(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const packed = await pipe(enc.encode(JSON.stringify(obj)), globalThis.CompressionStream);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, packed));
  return { iv: b64(iv), data: b64(ct) };
}
async function decryptObj(key, iv, data) {
  const pt = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, key, unb64(data)));
  let raw = pt; try { raw = await pipe(pt, globalThis.DecompressionStream); } catch { raw = pt; }
  return JSON.parse(dec.decode(raw));
}

/* ---------- Données locales du budget ---------- */
export function snapshot() {
  const o = {};
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith(PREFIX) && !SKIP.has(k.slice(PREFIX.length))) try { o[k.slice(PREFIX.length)] = JSON.parse(localStorage.getItem(k)); } catch {} }
  return o;
}
function writeLocal(o) { for (const [k, v] of Object.entries(o)) if (!SKIP.has(k)) localStorage.setItem(PREFIX + k, JSON.stringify(v)); }
const hasData = o => !!(o.sources && o.sources.length) || !!o.pret || !!(o.paies && o.paies.length) || !!(o.manual && o.manual.length);

// Fusion quand les deux téléphones ont modifié en même temps : on additionne, on ne perd rien
function merge(remote, local) {
  const out = { ...remote, ...local };
  const union = (k, id, prefer) => { const m = new Map(); for (const x of remote[k] || []) m.set(id(x), x); for (const x of local[k] || []) { const p = m.get(id(x)); m.set(id(x), p && prefer ? prefer(p, x) : x); } out[k] = [...m.values()]; };
  union("sources", s => s.name, (a, b) => (b.rows || []).length >= (a.rows || []).length ? b : a);
  union("paies", p => p.m);
  union("rules", r => `${r.txt}|${r.cat}|${r.sens}`);
  union("manual", x => x.id);
  union("notifInbox", x => x.id);
  out.pret = local.pret || remote.pret || null;
  out.done = { ...(remote.done || {}), ...(local.done || {}) };
  return out;
}

/* ---------- Coffre ---------- */
export function createVault({ hid, uid, onApplied, onStatus }) {
  const K = "pb-vault-" + hid;
  let key = null, salt = null, rev = +localStorage.getItem(K + "-rev") || 0, dirty = localStorage.getItem(K + "-dirty") === "1", busy = false, pushT = null, channel = null;
  const st = (s, extra = "") => onStatus && onStatus(s, extra);
  const setRev = r => { rev = r; localStorage.setItem(K + "-rev", String(r)); };
  const setDirty = d => { dirty = d; localStorage.setItem(K + "-dirty", d ? "1" : "0"); };

  async function loadKey() {
    try { const s = JSON.parse(localStorage.getItem(K) || "null"); if (!s) return false; salt = s.salt; key = await crypto.subtle.importKey("raw", unb64(s.key), "AES-GCM", true, ["encrypt", "decrypt"]); return true; } catch { return false; }
  }
  async function saveKey() { const raw = new Uint8Array(await crypto.subtle.exportKey("raw", key)); localStorage.setItem(K, JSON.stringify({ salt, key: b64(raw) })); }
  const fetchRow = async () => { const { data, error } = await sb.from("household_vault").select("*").eq("household_id", hid).maybeSingle(); if (error) throw error; return data; };

  async function apply(obj, r) { writeLocal(obj); setRev(r); onApplied && onApplied(); }

  async function pull() {
    if (!key || busy) return; busy = true;
    try {
      const row = await fetchRow();
      if (!row) { if (hasData(snapshot())) { setDirty(true); busy = false; return push(); } return; }
      if (row.rev <= rev && !dirty) return st("ok");
      if (row.salt !== salt) { st("phrase", "La phrase secrète a été changée sur l'autre téléphone."); return; }
      const remote = await decryptObj(key, row.iv, row.data);
      if (dirty) { await apply(merge(remote, snapshot()), row.rev); busy = false; return push(); }
      await apply(remote, row.rev); st("ok");
    } catch (e) { st("err", e.message || String(e)); } finally { busy = false; }
  }
  async function push() {
    if (!key) return; if (busy) { schedule(); return; } busy = true;
    try {
      const { iv, data } = await encryptObj(key, snapshot());
      const { data: r, error } = await sb.rpc("vault_put", { hid, p_salt: salt, p_iv: iv, p_data: data, p_rev: rev });
      if (error) throw error;
      if (r === -1) { busy = false; setDirty(true); return pull(); }
      setRev(r); setDirty(false); st("ok");
    } catch (e) { setDirty(true); st("err", e.message || String(e)); } finally { busy = false; }
  }
  function schedule() { setDirty(true); if (!key) return; clearTimeout(pushT); pushT = setTimeout(push, 2500); }

  function listen() {
    if (channel) return;
    channel = sb.channel("coffre-" + hid).on("postgres_changes", { event: "*", schema: "public", table: "household_vault", filter: `household_id=eq.${hid}` }, p => {
      if (p.eventType === "DELETE") return;
      if (p.new && p.new.rev > rev && p.new.updated_by !== uid) pull();
    }).subscribe();
  }

  return {
    get on() { return !!key; },
    async start() { if (await loadKey()) { listen(); await pull(); if (dirty) schedule(); } else st("off"); },
    // Première activation (ou nouvel appareil) : vérifie la phrase avec le coffre existant
    async setup(phrase) {
      if ((phrase || "").trim().length < 10) throw new Error("Choisis une phrase d'au moins 10 caractères (ex. 3 ou 4 mots).");
      const row = await fetchRow();
      if (row) {
        const k = await deriveKey(phrase, row.salt);
        let remote; try { remote = await decryptObj(k, row.iv, row.data); } catch { throw new Error("Phrase incorrecte : ce n'est pas celle utilisée sur l'autre téléphone."); }
        key = k; salt = row.salt; await saveKey();
        const local = snapshot();
        await apply(hasData(local) ? merge(remote, local) : remote, row.rev);
        if (hasData(local)) { setDirty(true); await push(); }
      } else {
        salt = b64(crypto.getRandomValues(new Uint8Array(16))); key = await deriveKey(phrase, salt); await saveKey(); setRev(0); setDirty(true); await push();
      }
      listen(); st("ok");
    },
    schedule, pull,
    async forget() { key = null; localStorage.removeItem(K); if (channel) { sb.removeChannel(channel); channel = null; } st("off"); },
    async reset() { await sb.rpc("vault_reset", { hid }); await this.forget(); setRev(0); }
  };
}
