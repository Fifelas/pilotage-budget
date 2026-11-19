// Prix réels des ingrédients du menu, calculés à partir d'Open Prices (prix relevés en magasin)
// et des catégories Open Food Facts des produits. Jamais inventés : quand aucun relevé n'existe,
// l'appli garde le prix indicatif de sa base et l'affiche comme « estimé ».
import { home, km } from "./apis.js";

// ingrédient de la base → catégorie Open Food Facts (« cat » = vendu au kilo ou à la pièce, « prod » = produit emballé)
// g : poids d'un paquet quand l'ingrédient se compte en pièces ; units : nombre de pièces vendues à l'unité dans un paquet
export const ING_TAGS = {
  pates: { prod: "en:dry-pastas" }, lasagnes: { prod: "en:lasagna-sheets" }, riz: { prod: "en:long-grain-rices" },
  semoule: { prod: "en:durum-wheat-semolinas" }, lentilles: { prod: "en:green-lentils" }, pois_chiche: { prod: "en:canned-chickpeas" },
  haricots_rouges: { prod: "en:canned-red-kidney-beans" }, tomates_conc: { prod: "en:strained-tomatoes" }, tomates_pelees: { prod: "en:peeled-tomatoes" },
  lait_coco: { prod: "en:coconut-milks" }, thon: { prod: "en:canned-tunas", g: 140 }, creme: { prod: "en:creams" }, lait: { prod: "en:semi-skimmed-milks" },
  oeufs: { prod: "en:eggs", eggs: true }, beurre: { prod: "en:butters" }, emmental: { prod: "en:grated-cheese" }, mozzarella: { prod: "en:mozzarella", g: 125 },
  lardons: { prod: "en:lardons" }, jambon: { prod: "en:white-hams", g: 160 }, pate_brisee: { prod: "en:pie-dough", g: 230 }, pate_pizza: { prod: "en:pizza-dough", g: 260 },
  poulet_filet: { prod: "en:chicken-breasts" }, boeuf_hache: { prod: "en:ground-beef-steaks" },
  saucisses: { prod: "en:toulouse-sausages", g: 600 }, poisson_blanc: { prod: "en:pollock-fillets" }, epinards: { prod: "en:spinachs" },
  haricots_verts: { prod: "en:frozen-green-beans" }, ppc: { prod: "en:frozen-peas-and-carrots" },
  pommes_terre: { cat: "en:potatoes" }, carottes: { cat: "en:carrots" }, oignons: { cat: "en:onions" }, ail: { cat: "en:garlic", units: 1, g: 60 },
  courgettes: { cat: "en:zucchini" }, poivrons: { cat: "en:red-bell-peppers", units: 3, g: 500 }, tomates: { cat: "en:tomatoes" }, salade: { cat: "en:lettuces", units: 1, g: 400 },
  poireaux: { cat: "en:leeks" }, champignons: { cat: "en:mushrooms" }, citron: { cat: "en:lemons", units: 4, g: 500 },
  pain_mie: { prod: "en:sliced-breads", g: 500 }, tortillas: { prod: "en:tortillas", g: 320 }, farine: { prod: "en:wheat-flours" }, bouillon: { prod: "en:bouillon-cubes", g: 100 }
};

const API = "https://prices.openfoodfacts.org/api/v1/prices";
const since = months => { const d = new Date(); d.setMonth(d.getMonth() - months); return d.toISOString().slice(0, 10); };
const median = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "");
const CK = "pb-cache-oprice-";

async function fetchItems(q) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 15000);
  try { const r = await fetch(`${API}?${q}`, { signal: ctl.signal }); if (!r.ok) throw new Error("HTTP " + r.status); return (await r.json()).items || []; }
  finally { clearTimeout(t); }
}

// Prix d'UN paquet de l'ingrédient (taille du paquet de la base : 1 kg de pâtes, 12 œufs, 3 poivrons…)
function packPrice(item, def, ing) {
  const p = item.product || {}, q = +p.product_quantity, u = p.product_quantity_unit;
  const packKg = ing[2] === "pc" ? (def.g || 0) / 1000 : ing[3] / 1000;
  if (def.eggs) {
    const m = /(\d+)\s*(?:x|pcs|pi[eè]ces?|oeufs|œufs|st[uü]ck|unit)/i.exec(p.quantity || "") || /^(\d+)$/.exec(String(p.quantity || "").trim());
    const n = m ? +m[1] : (q > 3 && q <= 30 && !u ? q : 0);
    return n ? item.price / n * ing[3] : null;
  }
  if (item.price_per === "KILOGRAM") return packKg ? item.price * packKg : null;
  if (item.price_per === "UNIT") return def.units ? item.price * def.units : null;
  if (q > 0 && (u === "g" || u === "ml")) return packKg ? item.price / (q / 1000) * packKg : null;
  if (q > 0 && (u === "kg" || u === "l")) return packKg ? item.price / q * packKg : null;
  return null;
}

// → { price, n, scope, from, to } ou null
export async function ingredientPrice(id, ing, storeBrand = "") {
  const def = ING_TAGS[id]; if (!def || !ing) return null;
  const ck = CK + id + "-" + norm(storeBrand);
  try { const c = JSON.parse(localStorage.getItem(ck)); if (c && Date.now() - c.t < 7 * 864e5) return c.v; } catch {}
  const key = def.cat ? `category_tag=${encodeURIComponent(def.cat)}` : `product__categories_tags__contains=${encodeURIComponent(def.prod)}`;
  const h = home();
  const [near, fr] = await Promise.all([
    h ? fetchItems(`${key}&currency=EUR&lat=${h.lat}&lon=${h.lon}&radius_km=100&date__gte=${since(24)}&size=100`).catch(() => []) : Promise.resolve([]),
    fetchItems(`${key}&currency=EUR&date__gte=${since(12)}&order_by=-date&size=100`).catch(() => [])
  ]);
  const b = norm(storeBrand).replace(/hyper|super|market|express|city|contact/g, "");
  const conv = arr => arr.map(it => {
    const v = packPrice(it, def, ing), l = it.location || {};
    return v && isFinite(v) && v > 0 ? { v, d: it.date, organic: (it.labels_tags || []).includes("en:organic"), brand: norm(l.osm_brand || l.osm_name), dist: h && l.osm_lat ? km(h, { lat: l.osm_lat, lon: l.osm_lon }) : null } : null;
  }).filter(Boolean);
  // petit budget : on écarte le bio quand il reste assez de relevés classiques
  const plain = a => { const c = a.filter(x => !x.organic); return c.length >= 3 ? c : a; };
  const N = conv(near), F = conv(fr);
  const levels = [
    [plain(N.filter(x => b && x.brand.includes(b) && x.dist != null && x.dist <= 60)), "ton enseigne, près de chez toi"],
    [plain(N.filter(x => x.dist != null && x.dist <= 40)), "près de chez toi"],
    [plain(N), "dans ta région (100 km)"],
    [plain(F.filter(x => b && x.brand.includes(b))), "ton enseigne, en France"],
    [plain(F), "en France"]
  ];
  let out = null;
  for (const [arr, scope] of levels) if (arr.length >= (scope.includes("France") ? 3 : 5)) { const ds = arr.map(x => x.d).sort(); out = { price: Math.round(median(arr.map(x => x.v)) * 100) / 100, n: arr.length, scope, from: ds[0], to: ds[ds.length - 1] }; break; }
  try { localStorage.setItem(ck, JSON.stringify({ t: Date.now(), v: out })); } catch {}
  return out;
}

// Ajoute les prix réels aux lignes de la liste du menu ; onProgress(n, total) pendant le chargement
export async function realPrices(lines, storeBrand, onProgress) {
  const R = window.Courses, todo = lines.filter(l => !l.placard && !l.basic && ING_TAGS[l.id]);
  let done = 0; const res = {};
  const queue = todo.slice(), workers = Array.from({ length: 4 }, async () => {
    while (queue.length) { const l = queue.shift(); try { res[l.id] = await ingredientPrice(l.id, R.ING[l.id], storeBrand); } catch { res[l.id] = null; } onProgress && onProgress(++done, todo.length); }
  });
  await Promise.all(workers);
  return lines.map(l => {
    const r = res[l.id];
    if (r) return { ...l, price: r.price, cost: l.placard ? 0 : l.packs * r.price, real: r };
    return { ...l, real: null };
  });
}
