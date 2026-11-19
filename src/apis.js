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
  cache.set("home", h); cache.set("stores", null); return h;
}
export const km = (a, b) => { const R = 6371, r = x => x * Math.PI / 180, dLa = r(b.lat - a.lat), dLo = r(b.lon - a.lon); const s = Math.sin(dLa / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };

/* ---------- Supermarchés autour de chez toi ---------- */
export async function nearbyStores(radiusKm = 15) {
  const h = home(); if (!h) return [];
  const hit = cache.get("stores", 30); if (hit) return hit;
  const q = `[out:json][timeout:25];(nwr["shop"~"^(supermarket|convenience|discount)$"](around:${radiusKm * 1000},${h.lat},${h.lon}););out center tags 200;`;
  const r = await fetch("https://overpass-api.de/api/interpreter", { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  if (!r.ok) throw new Error("Service des magasins indisponible, réessaie plus tard");
  const d = await r.json();
  const list = (d.elements || []).map(e => {
    const t = e.tags || {}, lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
    return { id: `${e.type}/${e.id}`, name: t.name || t.brand || "Magasin", brand: t.brand || t.name || "", city: t["addr:city"] || "", lat, lon, dist: lat ? km(h, { lat, lon }) : 99 };
  }).filter(s => s.lat).sort((a, b) => a.dist - b.dist);
  cache.set("stores", list); return list;
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
