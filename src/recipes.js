// Recettes du monde (TheMealDB, clé de test gratuite « 1 ») traduites en français SUR LE TÉLÉPHONE
// (ML Kit de Google, hors ligne après un téléchargement unique). Sur ordinateur : service MyMemory.
// Chaque recette n'est traduite qu'une fois pour le foyer : la traduction est gardée dans Supabase.
import { Capacitor } from "@capacitor/core";
import { sb } from "./supabase.js";
import { ingredientPrice, ING_TAGS } from "./prices.js";

const MDB = "https://www.themealdb.com/api/json/v1/1/";
export const CATS = [["Chicken", "🍗 Poulet"], ["Beef", "🥩 Bœuf"], ["Pork", "🥓 Porc"], ["Seafood", "🐟 Poisson"], ["Pasta", "🍝 Pâtes"], ["Vegetarian", "🥕 Végétarien"], ["Vegan", "🌱 Végan"], ["Lamb", "🍖 Agneau"], ["Side", "🥗 Accompagnements"], ["Starter", "🥟 Entrées"], ["Dessert", "🍰 Desserts"], ["Breakfast", "🥞 Petit-déjeuner"], ["Miscellaneous", "🍲 Divers"]];
const AREA = { French: "France", Italian: "Italie", Spanish: "Espagne", Indian: "Inde", Chinese: "Chine", Japanese: "Japon", Mexican: "Mexique", Moroccan: "Maroc", British: "Royaume-Uni", American: "États-Unis", "United States": "États-Unis", Greek: "Grèce", Thai: "Thaïlande", Turkish: "Turquie", Vietnamese: "Viêt Nam", Portuguese: "Portugal", Irish: "Irlande", Canadian: "Canada", Jamaican: "Jamaïque", Tunisian: "Tunisie", Egyptian: "Égypte", Russian: "Russie", Polish: "Pologne", Dutch: "Pays-Bas", Malaysian: "Malaisie", Filipino: "Philippines", Croatian: "Croatie", Kenyan: "Kenya", Ukrainian: "Ukraine", Algerian: "Algérie", German: "Allemagne", Belgian: "Belgique" };

// Ingrédients courants : nom français + ingrédient de la base de prix (quand il correspond)
const DICT = [
  [/chicken breasts?/, "blanc de poulet", "poulet_filet"], [/chicken thighs?|chicken legs?|chicken drumsticks?/, "cuisses de poulet"], [/^chicken$|whole chicken|chicken pieces/, "poulet"],
  [/minced beef|ground beef|beef mince/, "viande hachée", "boeuf_hache"], [/beef/, "bœuf"], [/minced pork|ground pork/, "porc haché"], [/pork/, "porc"], [/bacon|lardons/, "lardons", "lardons"], [/ham\b/, "jambon", "jambon"], [/sausages?/, "saucisses", "saucisses"], [/lamb/, "agneau"],
  [/cod|haddock|white fish|pollock/, "poisson blanc", "poisson_blanc"], [/salmon/, "saumon"], [/tuna/, "thon", "thon"], [/prawns?|shrimps?/, "crevettes"],
  [/spaghetti|penne|pasta|macaroni|fusilli|linguine|tagliatelle|rigatoni/, "pâtes", "pates"], [/lasagne sheets?|lasagna sheets?/, "feuilles de lasagnes", "lasagnes"], [/basmati rice|long grain rice|^rice$|white rice|jasmine rice/, "riz", "riz"], [/couscous/, "couscous", "semoule"],
  [/green lentils|red lentils|lentils/, "lentilles", "lentilles"], [/chickpeas?/, "pois chiches", "pois_chiche"], [/kidney beans/, "haricots rouges", "haricots_rouges"], [/coconut milk/, "lait de coco", "lait_coco"],
  [/chopped tomatoes|canned tomatoes|tinned tomatoes|plum tomatoes/, "tomates pelées", "tomates_pelees"], [/passata|tomato sauce/, "coulis de tomates", "tomates_conc"], [/tomato puree|tomato paste/, "concentré de tomates"], [/cherry tomatoes/, "tomates cerises"], [/tomato(es)?/, "tomates", "tomates"],
  [/double cream|heavy cream|single cream|creme fraiche|sour cream|cream/, "crème", "creme"], [/milk/, "lait", "lait"], [/eggs?\b/, "œufs", "oeufs"], [/butter/, "beurre", "beurre"], [/parmesan/, "parmesan"], [/mozzarella/, "mozzarella", "mozzarella"], [/cheddar|gruyere|emmental|grated cheese/, "fromage râpé", "emmental"], [/feta/, "feta"],
  [/potato(es)?/, "pommes de terre", "pommes_terre"], [/sweet potato(es)?/, "patates douces"], [/carrots?/, "carottes", "carottes"], [/red onions?/, "oignon rouge", "oignons"], [/spring onions?|scallions?/, "oignons nouveaux"], [/onions?|shallots?/, "oignons", "oignons"],
  [/garlic( cloves?)?/, "ail", "ail"], [/courgettes?|zucchini/, "courgettes", "courgettes"], [/red pepper|green pepper|yellow pepper|bell pepper/, "poivron", "poivrons"], [/lettuce/, "salade", "salade"], [/leeks?/, "poireaux", "poireaux"], [/mushrooms?/, "champignons", "champignons"],
  [/lemons?( juice)?/, "citron", "citron"], [/limes?/, "citron vert"], [/spinach/, "épinards", "epinards"], [/green beans/, "haricots verts", "haricots_verts"], [/peas\b/, "petits pois"], [/broccoli/, "brocoli"], [/cauliflower/, "chou-fleur"], [/cabbage/, "chou"], [/aubergines?|eggplants?/, "aubergine"], [/celery/, "céleri"], [/cucumber/, "concombre"], [/avocados?/, "avocat"],
  [/plain flour|all-purpose flour|self-raising flour|flour/, "farine", "farine"], [/caster sugar|brown sugar|granulated sugar|sugar/, "sucre"], [/stock cubes?|bouillon/, "bouillon cube", "bouillon"], [/chicken stock/, "bouillon de volaille", "bouillon"], [/beef stock/, "bouillon de bœuf", "bouillon"], [/vegetable stock/, "bouillon de légumes", "bouillon"],
  [/tortillas?|wraps?/, "tortillas", "tortillas"], [/bread/, "pain"], [/puff pastry/, "pâte feuilletée"], [/shortcrust pastry/, "pâte brisée", "pate_brisee"],
  [/cayenne/, "piment de Cayenne"], [/shallots?|challots?/, "échalotes", "oignons"], [/olive oil/, "huile d'olive"], [/vegetable oil|sunflower oil|oil/, "huile"], [/salt/, "sel"], [/black pepper|pepper/, "poivre"], [/paprika/, "paprika"], [/cumin/, "cumin"], [/curry powder/, "curry en poudre"], [/turmeric/, "curcuma"], [/cinnamon/, "cannelle"], [/ginger/, "gingembre"], [/chilli|chili/, "piment"], [/parsley/, "persil"], [/coriander|cilantro/, "coriandre"], [/basil/, "basilic"], [/thyme/, "thym"], [/oregano/, "origan"], [/bay leaf|bay leaves/, "laurier"], [/soy sauce/, "sauce soja"], [/honey/, "miel"], [/vinegar/, "vinaigre"], [/water/, "eau"], [/white wine/, "vin blanc"], [/red wine/, "vin rouge"], [/mustard/, "moutarde"]
];
const lookup = en => { const s = en.toLowerCase().trim(); const d = DICT.find(([re]) => re.test(s)); return d ? { fr: d[1], ing: d[2] || null } : null; };

// Mesures anglaises → françaises (pas besoin de traducteur)
function measureFR(m) {
  let s = String(m || "").trim(); if (!s) return "";
  const frac = { "½": .5, "¼": .25, "¾": .75, "1/2": .5, "1/4": .25, "3/4": .75, "1/3": .33, "2/3": .67 };
  s = s.replace(/(\d+)\s+(1\/2|1\/4|3\/4)/, (_, a, b) => String(+a + frac[b])).replace(/½|¼|¾|1\/2|1\/4|3\/4|1\/3|2\/3/g, f => String(frac[f]));
  const n = parseFloat(s), num = isNaN(n) ? "" : String(Math.round(n * 100) / 100).replace(".", ",");
  const R = [[/(lb|pound)s?\b/i, v => `${Math.round(v * 453 / 10) * 10} g`], [/oz\b/i, v => `${Math.round(v * 28)} g`], [/(cup)s?\b/i, v => `${Math.round(v * 240)} ml`], [/(tbsp|tablespoons?|tbs|tblsp)\b/i, () => `${num} c. à soupe`], [/(tsp|teaspoons?)\b/i, () => `${num} c. à café`],
    [/kg\b/i, () => `${num} kg`], [/\bg\b|grams?/i, () => `${num} g`], [/ml\b/i, () => `${num} ml`], [/\bl\b|litres?|liters?/i, () => `${num} l`], [/cloves?/i, () => `${num} gousse${n > 1 ? "s" : ""}`], [/pinch/i, () => "1 pincée"], [/handful/i, () => "1 poignée"], [/to taste|to serve|garnish|dash|splash/i, () => "selon le goût"], [/sprigs?/i, () => `${num || 1} brin${n > 1 ? "s" : ""}`], [/(tin|can)s?\b/i, () => `${num || 1} boîte${n > 1 ? "s" : ""}`], [/large/i, () => `${num || 1} gros`], [/medium/i, () => `${num || 1} moyen${n > 1 ? "s" : ""}`], [/small/i, () => `${num || 1} petit${n > 1 ? "s" : ""}`]];
  for (const [re, f] of R) if (re.test(s)) return isNaN(n) && !/pinch|handful|taste|serve|garnish|dash|splash/i.test(s) ? s : f(n);
  return num && /^[\d.,\s]+$/.test(s) ? num : s;
}
const grams = (m, ingId) => { const s = String(m || "").toLowerCase(), n = parseFloat(s.replace(",", ".")) || 1; if (/kg/.test(s)) return n * 1000; if (/\bg\b|gram/.test(s)) return n; if (/lb|pound/.test(s)) return n * 453; if (/oz/.test(s)) return n * 28; if (/cup/.test(s)) return n * 200; if (/ml/.test(s)) return n; if (/tbsp|tablespoon/.test(s)) return n * 15; if (/tsp|teaspoon/.test(s)) return n * 5; return { oeufs: 1, ail: 1, citron: 1, poivrons: 1, salade: 1 }[ingId] != null ? n : n * 120; };

/* ---------- Traduction ---------- */
// Téléphone : ML Kit hors ligne si le traducteur français est téléchargé (bouton dans Plus, ≈ 30 Mo).
// Sinon (ou sur ordinateur) : service MyMemory en ligne. Jamais de blocage : délai maximum puis texte d'origine.
const withTimeout = (p, ms, msg) => Promise.race([p, new Promise((_, ko) => setTimeout(() => ko(new Error(msg)), ms))]);
async function ml() { if (!Capacitor.isNativePlatform()) return null; try { return await import("@capacitor-mlkit/translation"); } catch { return null; } }
export async function translatorStatus() {
  const m = await ml(); if (!m) return { native: false };
  try { const { languages } = await withTimeout(m.Translation.getDownloadedModels(), 5000, "délai"); const has = languages || []; return { native: true, ready: has.includes("fr") }; }
  catch { return { native: true, ready: false }; }
}
export async function downloadTranslator() {
  const m = await ml(); if (!m) throw new Error("Disponible seulement dans l'appli Android.");
  await withTimeout(m.Translation.downloadModel({ language: m.Language.French }), 180000, "Téléchargement trop long : réessaie avec une meilleure connexion.");
}
async function viaMyMemory(t, from, to) {
  const parts = t.match(/[^.!?]+[.!?]*\s*/g) || [t], chunks = []; let cur = "";
  for (const p of parts) { if ((cur + p).length > 450 && cur) { chunks.push(cur); cur = ""; } cur += p; } if (cur) chunks.push(cur);
  let res = "";
  for (const c of chunks) {
    const r = await withTimeout(fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(c)}&langpair=${from}|${to}`).then(r => r.json()), 12000, "Traduction trop lente");
    if (r.quotaFinished || r.responseStatus !== 200) throw new Error("Quota du traducteur en ligne atteint pour aujourd'hui. Télécharge le traducteur hors ligne dans Plus.");
    res += r.responseData.translatedText + " ";
  }
  return res.trim();
}
export async function translate(texts, from = "en", to = "fr") {
  const st = await translatorStatus(), m = st.ready ? await ml() : null, out = [];
  for (const t of texts) {
    if (!t || !t.trim()) { out.push(t); continue; }
    if (m) {
      try { const r = await withTimeout(m.Translation.translate({ text: t, sourceLanguage: from === "en" ? m.Language.English : m.Language.French, targetLanguage: to === "fr" ? m.Language.French : m.Language.English }), 15000, "délai"); out.push(r.text); continue; }
      catch { /* bascule en ligne */ }
    }
    out.push(await viaMyMemory(t, from, to));
  }
  return out;
}

/* ---------- Catalogue ---------- */
const mdb = async q => { const r = await fetch(MDB + q); if (!r.ok) throw new Error("TheMealDB indisponible"); return (await r.json()).meals || []; };
export const byCategory = c => mdb("filter.php?c=" + encodeURIComponent(c));
export async function search(qFr) {
  const q = qFr.trim(); if (!q) return [];
  const hit = DICT.find(([, fr]) => fr === q.toLowerCase());
  let en = hit ? hit[0].source.split("|")[0].replace(/[\\^$()?]|\\b/g, "").replace(/s$/, "").trim() : null;
  if (!en) { try { [en] = await translate([q], "fr", "en"); } catch { en = q; } }
  const [a, b] = await Promise.all([mdb("search.php?s=" + encodeURIComponent(en)).catch(() => []), mdb("filter.php?i=" + encodeURIComponent(en.replace(/\s+/g, "_"))).catch(() => [])]);
  const seen = new Set(); return [...a, ...b].filter(m => !seen.has(m.idMeal) && seen.add(m.idMeal)).slice(0, 40);
}

// Titres traduits petit à petit (6 à la fois), gardés sur le téléphone ; onEach(id, titre) à chaque titre prêt
const TT = "pb-mdb-titles";
export async function frTitles(meals, onEach) {
  let cache = {}; try { cache = JSON.parse(localStorage.getItem(TT)) || {}; } catch {}
  const save = () => { try { localStorage.setItem(TT, JSON.stringify(cache)); } catch {} };
  for (const m of meals) if (cache[m.idMeal] && onEach) onEach(m.idMeal, cache[m.idMeal]);
  let miss = meals.filter(m => !cache[m.idMeal]);
  if (miss.length) {
    try { const { data } = await sb.from("recipe_translations").select("source_id, data").eq("source", "themealdb").eq("lang", "fr").in("source_id", miss.map(m => m.idMeal)); for (const d of data || []) { cache[d.source_id] = d.data.title; onEach && onEach(d.source_id, d.data.title); } } catch {}
    miss = miss.filter(m => !cache[m.idMeal]);
    let ok = 0; const queue = miss.slice();
    await Promise.all(Array.from({ length: 6 }, async () => {
      while (queue.length) { const m = queue.shift(); try { const [t] = await withTimeout(translate([m.strMeal]), 15000, "délai"); cache[m.idMeal] = t; ok++; onEach && onEach(m.idMeal, t); } catch { /* reste en anglais */ } }
    }));
    save();
    return { translated: meals.length - miss.length + ok, total: meals.length };
  }
  return { translated: meals.length, total: meals.length };
}

// Recette complète traduite (cache foyer Supabase → sinon traduction et enregistrement)
export async function recipeFR(id, onStep) {
  const { data: cached } = await sb.from("recipe_translations").select("data").eq("source", "themealdb").eq("source_id", String(id)).eq("lang", "fr").maybeSingle();
  if (cached && cached.data && cached.data.v === 2) return cached.data;
  const [m] = await mdb("lookup.php?i=" + encodeURIComponent(id)); if (!m) throw new Error("Recette introuvable");
  const ings = [];
  for (let i = 1; i <= 20; i++) { const n = (m["strIngredient" + i] || "").trim(); if (n) ings.push({ en: n, measure: (m["strMeasure" + i] || "").trim() }); }
  const steps = String(m.strInstructions || "").split(/\r?\n+/).map(s => s.replace(/^\s*(step\s*\d+[:.)]?|\d+[.)])\s*/i, "").trim()).filter(s => s.length > 3);
  const unknown = ings.filter(x => !lookup(x.en));
  onStep && onStep("Traduction de la recette…");
  let tr, failed = null;
  try { tr = await withTimeout(translate([m.strMeal, ...unknown.map(x => x.en), ...steps]), 60000, "Traduction trop longue"); }
  catch (e) { failed = e.message; tr = [m.strMeal, ...unknown.map(x => x.en), ...steps]; }
  const title = tr[0], unk = tr.slice(1, 1 + unknown.length), st = tr.slice(1 + unknown.length);
  const out = {
    v: 2, id: String(m.idMeal), title, en: m.strMeal, img: m.strMealThumb, cat: (CATS.find(c => c[0] === m.strCategory) || [0, m.strCategory])[1], area: AREA[m.strArea] || m.strArea || "",
    ingredients: ings.map(x => { const l = lookup(x.en); const fr = l ? l.fr : unk[unknown.indexOf(x)] || x.en; return { name: fr[0].toUpperCase() + fr.slice(1), measure: measureFR(x.measure), ing: l ? l.ing : null, g: l && l.ing ? grams(x.measure, l.ing) : null }; }),
    steps: st, source: m.strSource || "", youtube: m.strYoutube || ""
  };
  if (failed) return { ...out, untranslated: failed };
  await sb.from("recipe_translations").upsert({ source: "themealdb", source_id: out.id, lang: "fr", data: out }, { onConflict: "source,source_id,lang", ignoreDuplicates: true }).then(() => {}, () => {});
  return out;
}

// Coût estimé de la recette (≈ 4 personnes) à partir des prix relevés Open Prices
export async function recipeCost(r, storeBrand) {
  const R = window.Courses; let real = 0, n = 0, priced = 0;
  for (const x of r.ingredients) {
    if (!x.ing || !ING_TAGS[x.ing] || !R) continue; n++;
    const d = R.ING[x.ing], p = await ingredientPrice(x.ing, d, storeBrand).catch(() => null); if (!p) continue;
    const share = d[2] === "pc" ? (x.g || 1) / d[3] : (x.g || 0) / d[3];
    real += p.price * Math.min(share, 3); priced++;
  }
  return { cost: real, priced, mapped: n, total: r.ingredients.length };
}
