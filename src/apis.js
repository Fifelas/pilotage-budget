// Services publics et gratuits utilisés par l'appli. Aucune clé, aucun compte.
// - Open Food Facts / Open Beauty / Open Pet Food / Open Products Facts : fiche produit par code-barres (ODbL)
// - Open Prices : prix relevés par la communauté, avec magasin et date (ODbL)
// - Nominatim (OpenStreetMap) : position d'une ville, 1 seule requête puis mise en cache (politique d'usage OSMF)
// - Overpass (OpenStreetMap) : supermarchés autour de la ville, mis en cache 30 jours
const cache = {
  get(k, maxAgeDays) { try { const v = JSON.parse(localStorage.getItem("pb-cache-" + k)); if (v && (!maxAgeDays || Date.now() - v.t < maxAgeDays * 864e5)) return v.v; } catch {} return null; },
  set(k, v) { try { localStorage.setItem("pb-cache-" + k, JSON.stringify({ t: Date.now(), v })); } catch {} }
};
async function getJSON(url, ms = 12000) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { signal: ctl.signal, headers: { Accept: "application/json" } }); if (!r.ok) throw new Error("HTTP " + r.status); return await r.json(); }
  finally { clearTimeout(t); }
}

/* ---------- Fiche produit ---------- */
const FACTS = ["world.openfoodfacts.org", "world.openbeautyfacts.org", "world.openpetfoodfacts.org", "world.openproductsfacts.org"];
export async function productByBarcode(ean) {
  ean = String(ean).replace(/\D/g, "");
  const hit = cache.get("p" + ean, 90); if (hit) return hit;
  for (const host of FACTS) {
    try {
      const d = await getJSON(`https://${host}/api/v2/product/${ean}.json?fields=product_name_fr,product_name,generic_name_fr,brands,quantity,categories_tags`);
      if (d && d.status === 1 && d.product) {
        const p = d.product, name = p.product_name_fr || p.product_name || p.generic_name_fr || "";
        if (!name) continue;
        const out = { ean, name: name.trim(), brand: (p.brands || "").split(",")[0].trim(), qty: (p.quantity || "").trim(), cats: p.categories_tags || [], source: host.split(".")[1] };
        cache.set("p" + ean, out); return out;
      }
    } catch { /* service suivant */ }
  }
  return null;
}

/* ---------- Ville et distances ---------- */
export function home() { return cache.get("home"); }
export async function setHomeCity(q) {
  const d = await getJSON(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=fr&addressdetails=1&q=${encodeURIComponent(q)}`);
  if (!d.length) throw new Error("Ville introuvable");
  const a = d[0].address || {}, h = { lat: +d[0].lat, lon: +d[0].lon, city: a.city || a.town || a.village || a.municipality || q, dep: (a.postcode || "").slice(0, 2), postcode: a.postcode || "" };
  cache.set("home", h); for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && (k.startsWith("pb-cache-oprice-") || k === "pb-cache-stores2" || k === "pb-cache-cover")) localStorage.removeItem(k); } return h;
}
export const km = (a, b) => { const R = 6371, r = x => x * Math.PI / 180, dLa = r(b.lat - a.lat), dLo = r(b.lon - a.lon); const s = Math.sin(dLa / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };

/* ---------- Supermarchés autour de chez toi ---------- */
// 1) Overpass (plusieurs serveurs publics, souvent surchargés) ; 2) sinon Nominatim, recherche « supermarché » autour de la ville.
// On ne garde en mémoire qu'un résultat non vide.
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const shopOf = (h, id, t, lat, lon) => ({ id, name: t.name || t.brand || "Magasin", brand: t.brand || t.name || "", city: t["addr:city"] || "", lat, lon, dist: km(h, { lat, lon }) });
async function viaOverpass(h, radiusKm) {
  const q = `[out:json][timeout:20];nwr["shop"~"^(supermarket|discount)$"](around:${radiusKm * 1000},${h.lat},${h.lon});out tags center;`;
  for (const url of OVERPASS) {
    try {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 15000);
      const r = await fetch(url, { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: ctl.signal });
      clearTimeout(t); if (!r.ok) continue;
      const d = await r.json(); if (d.remark && /error|timed out|rate/i.test(d.remark)) continue;
      const list = (d.elements || []).map(e => { const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon; return lat ? shopOf(h, `${e.type}/${e.id}`, e.tags || {}, lat, lon) : null; }).filter(Boolean);
      if (list.length) return list;
    } catch { /* serveur suivant */ }
  }
  return [];
}
async function viaNominatim(h, radiusKm) {
  const dLat = radiusKm / 111, dLon = radiusKm / (111 * Math.cos(h.lat * Math.PI / 180));
  const box = [h.lon - dLon, h.lat + dLat, h.lon + dLon, h.lat - dLat].map(v => v.toFixed(4)).join(",");
  const d = await getJSON(`https://nominatim.openstreetmap.org/search?format=json&limit=50&bounded=1&extratags=1&addressdetails=1&viewbox=${box}&q=${encodeURIComponent("[supermarket]")}`);
  return d.map(x => { const a = x.address || {}; return shopOf(h, `${x.osm_type}/${x.osm_id}`, { name: x.name, brand: (x.extratags || {}).brand, "addr:city": a.city || a.town || a.village || "" }, +x.lat, +x.lon); });
}
export async function nearbyStores(radiusKm = 15) {
  const h = home(); if (!h) return [];
  const hit = cache.get("stores2", 30); if (hit && hit.length) return hit;
  let list = await viaOverpass(h, radiusKm);
  if (!list.length) list = await viaNominatim(h, radiusKm).catch(() => []);
  if (!list.length) throw new Error("Impossible de trouver les magasins pour l'instant (services OpenStreetMap occupés). Réessaie plus tard ou tape le nom du magasin.");
  const seen = new Set(); list = list.sort((a, b) => a.dist - b.dist).filter(s => { const k = s.name + Math.round(s.lat * 500); if (seen.has(k)) return false; seen.add(k); return true; });
  cache.set("stores2", list); return list;
}

// Combien de prix relevés existent autour de la ville (pour expliquer d'où viennent les prix)
export async function priceCoverage() {
  const h = home(); if (!h) return null;
  const hit = cache.get("cover", 7); if (hit) return hit;
  const since = new Date(Date.now() - 730 * 864e5).toISOString().slice(0, 10);
  const n = async r => { try { const r2 = await fetch(`https://prices.openfoodfacts.org/api/v1/prices?lat=${h.lat}&lon=${h.lon}&radius_km=${r}&date__gte=${since}&size=1`); return (await r2.json()).total ?? 0; } catch { return null; } };
  const [a, b, c] = await Promise.all([n(10), n(40), n(100)]);
  const out = { r10: a, r40: b, r100: c }; if (a != null) cache.set("cover", out); return out;
}

/* ---------- Prix réels relevés (Open Prices) ---------- */
// Renvoie le prix le plus pertinent : même enseigne près de chez toi > près de chez toi > ton département > France.
// Jamais inventé : s'il n'y a aucun relevé, renvoie null.
export async function communityPrice(ean, brand = "") {
  ean = String(ean).replace(/\D/g, "");
  const key = "op" + ean, hit = cache.get(key, 3);
  const items = hit || (await getJSON(`https://prices.openfoodfacts.org/api/v1/prices?product_code=${ean}&order_by=-date&size=100`)).items || [];
  if (!hit) cache.set(key, items.map(i => ({ price: i.price, date: i.date, disc: i.price_is_discounted, cur: i.currency, loc: i.location ? { name: i.location.osm_name, city: i.location.osm_address_city, cp: i.location.osm_address_postcode, lat: i.location.osm_lat, lon: i.location.osm_lon, brand: i.location.osm_brand || i.location.osm_name } : null })));
  const list = (hit || cache.get(key)).filter(i => i.cur === "EUR" && i.price > 0);
  if (!list.length) return null;
  const h = home(), b = norm(brand);
  const withD = list.map(i => ({ ...i, dist: h && i.loc && i.loc.lat ? km(h, { lat: i.loc.lat, lon: i.loc.lon }) : null }));
  const recent = withD.filter(i => (Date.now() - new Date(i.date)) / 864e5 < 365);
  const pool = recent.length ? recent : withD;
  const pickFrom = (arr, scope) => arr.length ? { ...arr.sort((a, z) => z.date.localeCompare(a.date))[0], scope, n: arr.length } : null;
  return pickFrom(pool.filter(i => b && i.dist != null && i.dist < 40 && norm(i.loc.brand).includes(b)), "même enseigne près de chez toi")
    || pickFrom(pool.filter(i => i.dist != null && i.dist < 40), "près de chez toi")
    || pickFrom(pool.filter(i => h && h.dep && i.loc && (i.loc.cp || "").startsWith(h.dep)), "dans ton département")
    || (() => { const s = pool.map(i => i.price).sort((a, z) => a - z), med = s[Math.floor(s.length / 2)]; return { price: med, date: pool[0].date, scope: "médiane France", n: pool.length, loc: null }; })();
}
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "");
export const ATTRIB = "Produits : Open Food Facts et projets associés · Prix : Open Prices · Magasins et villes : © les contributeurs d'OpenStreetMap — données sous licence ODbL.";
