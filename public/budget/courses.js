// Planificateur de repas et liste de courses à petit prix
(function (root) {
  // Écarts de prix par rapport à E.Leclerc (UFC-Que Choisir, 2026) ; Netto estimé
  const STORES = [
    ["lidl", "Lidl", 0.975], ["leclerc", "E.Leclerc", 1], ["aldi", "Aldi", 1.02], ["netto", "Netto (estimé)", 1.03],
    ["interhyper", "Intermarché Hyper", 1.032], ["hyperu", "Hyper U", 1.034], ["intersuper", "Intermarché Super", 1.053],
    ["superu", "Super U / Magasin U", 1.058], ["carrefourhyper", "Carrefour Hyper", 1.067], ["market", "Carrefour Market", 1.075], ["auchan", "Auchan", 1.08]
  ];
  const RAYONS = ["Fruits & légumes", "Boucherie & volaille", "Crèmerie & frais", "Surgelés", "Épicerie salée", "Boulangerie", "Placard"];
  // id: [nom, rayon, unité, taille du paquet, libellé du paquet, prix indicatif (MDD, base Leclerc), placard?]
  const ING = {
    pates: ["Pâtes", 4, "g", 1000, "paquet 1 kg", 1.15], lasagnes: ["Feuilles de lasagnes", 4, "g", 500, "boîte 500 g", 1.20],
    riz: ["Riz long", 4, "g", 1000, "paquet 1 kg", 1.65], semoule: ["Semoule", 4, "g", 1000, "paquet 1 kg", 1.45],
    lentilles: ["Lentilles vertes", 4, "g", 500, "sachet 500 g", 1.35], pois_chiche: ["Pois chiches", 4, "g", 265, "boîte 400 g", 0.75],
    haricots_rouges: ["Haricots rouges", 4, "g", 250, "boîte 400 g", 0.85], tomates_conc: ["Coulis de tomates", 4, "g", 680, "bocal 680 g", 1.10],
    tomates_pelees: ["Tomates pelées", 4, "g", 400, "boîte 400 g", 0.79], lait_coco: ["Lait de coco", 4, "ml", 400, "boîte 400 ml", 1.35],
    thon: ["Thon au naturel", 4, "pc", 1, "boîte", 1.45],
    creme: ["Crème fraîche", 2, "ml", 200, "pot 20 cl", 0.99], lait: ["Lait demi-écrémé", 2, "ml", 1000, "bouteille 1 L", 0.99],
    oeufs: ["Œufs", 2, "pc", 12, "boîte de 12", 3.30], beurre: ["Beurre", 2, "g", 250, "plaquette 250 g", 2.45],
    emmental: ["Emmental râpé", 2, "g", 200, "sachet 200 g", 2.15], mozzarella: ["Mozzarella", 2, "pc", 1, "boule 125 g", 0.89],
    lardons: ["Lardons", 2, "g", 150, "barquette 2 × 75 g", 1.95], jambon: ["Jambon blanc", 2, "pc", 4, "4 tranches", 1.85],
    pate_brisee: ["Pâte brisée", 2, "pc", 1, "rouleau", 0.99], pate_pizza: ["Pâte à pizza", 2, "pc", 1, "rouleau", 1.05],
    poulet_filet: ["Filets de poulet", 1, "g", 600, "barquette 600 g", 6.90], poulet_cuisse: ["Cuisses de poulet", 1, "g", 1000, "barquette 1 kg", 4.90],
    boeuf_hache: ["Viande hachée 15 %", 1, "g", 500, "barquette 500 g", 5.40], saucisses: ["Saucisses de Toulouse", 1, "pc", 6, "barquette de 6", 4.30],
    poisson_blanc: ["Filets de colin", 3, "g", 1000, "sachet 1 kg", 7.90], epinards: ["Épinards hachés", 3, "g", 1000, "sachet 1 kg", 2.10],
    haricots_verts: ["Haricots verts", 3, "g", 1000, "sachet 1 kg", 2.25], ppc: ["Petits pois-carottes", 3, "g", 1000, "sachet 1 kg", 2.10],
    pommes_terre: ["Pommes de terre", 0, "g", 2500, "sac 2,5 kg", 2.90], carottes: ["Carottes", 0, "g", 1000, "sachet 1 kg", 1.15],
    oignons: ["Oignons", 0, "g", 1000, "filet 1 kg", 1.45], ail: ["Ail", 0, "pc", 30, "filet (≈ 30 gousses)", 1.29],
    courgettes: ["Courgettes", 0, "g", 1000, "1 kg", 2.30], poivrons: ["Poivrons", 0, "pc", 3, "lot de 3", 2.29],
    tomates: ["Tomates", 0, "g", 1000, "1 kg", 2.60], salade: ["Salade", 0, "pc", 1, "pièce", 0.99],
    poireaux: ["Poireaux", 0, "g", 1000, "botte 1 kg", 2.10], champignons: ["Champignons de Paris", 0, "g", 500, "barquette 500 g", 2.20],
    citron: ["Citrons", 0, "pc", 4, "filet de 4", 1.69],
    pain: ["Baguette", 5, "pc", 1, "pièce", 0.45], pain_mie: ["Pain de mie", 5, "pc", 20, "paquet 20 tranches", 1.25],
    tortillas: ["Tortillas", 5, "pc", 8, "paquet de 8", 1.55],
    farine: ["Farine", 6, "g", 1000, "paquet 1 kg", 0.89, 1], bouillon: ["Bouillon cube", 6, "pc", 10, "boîte de 10", 1.10, 1],
    huile: ["Huile, sel, poivre, épices", 6, "pc", 1, "à vérifier", 0, 1]
  };
  const BASICS = [["pommes", "Pommes", 0, 2000, "sac 2 kg", 3.30], ["bananes", "Bananes", 0, 1000, "1 kg", 1.95], ["lait_b", "Lait (petits-déj.)", 2, 2000, "2 bouteilles 1 L", 1.98], ["pain_b", "Baguettes (semaine)", 5, 4, "4 baguettes", 1.80]];
  // recettes : [nom, emoji, minutes, tags, ingrédients {id: qté par portion adulte}, étapes]
  const R = [
    ["Pâtes bolognaise", "🍝", 30, "enfant viande batch", {pates:100, boeuf_hache:80, tomates_conc:120, oignons:40, carottes:40, ail:1, emmental:15, huile:0}, ["Fais revenir oignon, ail et carotte râpée 5 min dans un peu d'huile.", "Ajoute la viande, laisse dorer, puis le coulis. Mijote 15 min à feu doux.", "Cuis les pâtes, mélange avec la sauce et sers avec le fromage."]],
    ["Pâtes carbonara", "🥓", 20, "enfant rapide porc", {pates:100, lardons:50, creme:40, oeufs:0.5, emmental:15}, ["Cuis les pâtes.", "Fais dorer les lardons à sec.", "Hors du feu, mélange pâtes, lardons, crème, œuf battu et fromage."]],
    ["Chili con carne", "🌶️", 40, "viande batch", {boeuf_hache:70, haricots_rouges:100, tomates_pelees:100, oignons:40, poivrons:0.3, riz:70, ail:1, huile:0}, ["Fais revenir oignon, ail et poivron.", "Ajoute la viande, puis les tomates, les haricots égouttés, cumin et paprika.", "Mijote 20 min. Sers avec le riz."]],
    ["Chili sin carne", "🫘", 40, "vege batch", {lentilles:50, haricots_rouges:120, tomates_pelees:120, oignons:40, poivrons:0.3, riz:70, ail:1, huile:0}, ["Fais revenir oignon, ail et poivron.", "Ajoute lentilles, tomates, haricots, épices et 2 verres d'eau.", "Mijote 25 min jusqu'à ce que les lentilles soient tendres. Sers avec le riz."]],
    ["Curry de pois chiches au lait de coco", "🍛", 30, "vege rapide healthy", {pois_chiche:130, lait_coco:80, tomates_pelees:80, oignons:40, epinards:60, riz:70, ail:1, huile:0}, ["Fais revenir oignon et ail avec 1 c. à soupe de curry.", "Ajoute tomates, pois chiches, lait de coco et épinards. Mijote 15 min.", "Sers avec le riz."]],
    ["Lentilles aux saucisses", "🌭", 45, "viande batch porc", {lentilles:70, saucisses:1, carottes:60, oignons:30, bouillon:0.3, huile:0}, ["Dore les saucisses, réserve-les.", "Dans la même cocotte, fais revenir oignon et carottes, ajoute lentilles, bouillon et eau à hauteur.", "Remets les saucisses et cuis 30 min."]],
    ["Poulet rôti et pommes de terre", "🍗", 60, "enfant viande", {poulet_cuisse:250, pommes_terre:250, oignons:30, ail:1, huile:0}, ["Préchauffe le four à 200 °C.", "Mets cuisses, pommes de terre en quartiers, oignon et ail dans un plat, huile, sel, herbes.", "Enfourne 50 min en retournant à mi-cuisson."]],
    ["Poulet au curry et riz", "🍛", 30, "enfant viande rapide", {poulet_filet:120, creme:40, oignons:40, riz:70, huile:0}, ["Coupe le poulet en morceaux et fais-le dorer avec l'oignon.", "Ajoute 1 c. à soupe de curry et la crème, mijote 10 min.", "Sers avec le riz."]],
    ["Fajitas de poulet", "🌯", 25, "rapide viande enfant", {poulet_filet:110, tortillas:2, poivrons:0.5, oignons:40, emmental:20, salade:0.15, huile:0}, ["Émince poulet, poivron et oignon.", "Fais tout sauter 10 min avec paprika et cumin.", "Garnis les tortillas avec la salade et le fromage."]],
    ["Gratin de pâtes au jambon", "🧀", 35, "enfant porc", {pates:90, jambon:1, creme:40, emmental:25}, ["Cuis les pâtes, préchauffe le four à 200 °C.", "Mélange pâtes, jambon en dés et crème dans un plat.", "Couvre de fromage et gratine 15 min."]],
    ["Quiche lorraine et salade", "🥧", 45, "enfant porc", {pate_brisee:0.25, oeufs:1, creme:40, lardons:40, emmental:20, salade:0.2}, ["Préchauffe le four à 180 °C, étale la pâte dans un moule.", "Fais dorer les lardons, mélange œufs, crème, fromage, lardons.", "Verse sur la pâte et cuis 35 min. Sers avec la salade."]],
    ["Quiche aux poireaux", "🥧", 50, "vege", {pate_brisee:0.25, poireaux:120, oeufs:1, creme:40, emmental:20, salade:0.15, beurre:5}, ["Émince les poireaux et fais-les fondre 10 min au beurre.", "Mélange œufs, crème, fromage et poireaux.", "Verse sur la pâte et cuis 35 min à 180 °C."]],
    ["Omelette aux pommes de terre", "🍳", 30, "vege rapide", {oeufs:2, pommes_terre:180, oignons:40, salade:0.2, huile:0}, ["Cuis les pommes de terre en dés à la poêle avec l'oignon, 15 min.", "Verse les œufs battus, couvre et cuis à feu doux 8 min.", "Sers avec la salade."]],
    ["Pizza maison", "🍕", 30, "enfant porc", {pate_pizza:0.35, tomates_conc:50, mozzarella:0.5, jambon:1, champignons:50}, ["Préchauffe le four à 220 °C.", "Étale la pâte, couvre de coulis, jambon, champignons et mozzarella.", "Cuis 15 min."]],
    ["Hachis parmentier", "🥔", 50, "enfant viande batch", {boeuf_hache:90, pommes_terre:250, lait:60, beurre:10, emmental:15, oignons:30}, ["Cuis les pommes de terre et écrase-les avec lait et beurre.", "Fais revenir oignon et viande.", "Mets la viande dans un plat, couvre de purée et de fromage, gratine 20 min à 200 °C."]],
    ["Riz sauté aux légumes et œuf", "🍚", 20, "vege rapide enfant", {riz:80, oeufs:1, ppc:100, oignons:20, huile:0}, ["Cuis le riz (ou utilise un reste).", "Fais sauter oignon et légumes 5 min, ajoute le riz.", "Pousse sur le côté, brouille les œufs, mélange. Un trait de sauce soja si tu en as."]],
    ["Soupe de légumes et tartines", "🥣", 40, "vege healthy batch", {pommes_terre:120, carottes:100, poireaux:100, bouillon:0.5, pain:0.25, emmental:20}, ["Coupe les légumes, couvre d'eau avec le bouillon.", "Cuis 25 min et mixe.", "Sers avec des tartines de fromage passées au four."]],
    ["Colin, riz et haricots verts", "🐟", 25, "poisson healthy rapide", {poisson_blanc:130, riz:70, haricots_verts:150, citron:0.25, beurre:10}, ["Cuis le riz et les haricots verts.", "Fais cuire le colin à la poêle 4 min par face avec un peu de beurre.", "Arrose de citron."]],
    ["Parmentier de poisson", "🐟", 45, "poisson enfant batch", {poisson_blanc:120, pommes_terre:250, lait:60, beurre:10, emmental:15}, ["Poche le colin 8 min dans l'eau, émiette-le.", "Fais une purée avec lait et beurre.", "Poisson au fond du plat, purée et fromage dessus, gratine 15 min."]],
    ["Salade de pâtes au thon", "🥗", 20, "poisson rapide", {pates:80, thon:0.4, tomates:100, oeufs:1, huile:0}, ["Cuis les pâtes et les œufs (10 min), refroidis.", "Mélange pâtes, thon, tomates et œufs en morceaux.", "Assaisonne avec huile, vinaigre, sel, poivre."]],
    ["Croque-monsieur et salade", "🥪", 20, "enfant rapide porc", {pain_mie:4, jambon:1, emmental:30, salade:0.2, beurre:10}, ["Beurre le pain, garnis de jambon et de fromage.", "Cuis 10 min au four à 200 °C ou à la poêle.", "Sers avec la salade."]],
    ["Crêpes jambon-fromage", "🥞", 35, "enfant porc", {farine:60, oeufs:1, lait:120, jambon:1, emmental:30}, ["Fouette farine, œufs et lait, laisse reposer 10 min.", "Cuis les crêpes.", "Garnis de jambon et fromage et replie à la poêle."]],
    ["Gratin dauphinois et jambon", "🥔", 60, "enfant porc", {pommes_terre:250, creme:60, lait:60, jambon:1, ail:0.5}, ["Coupe les pommes de terre en fines rondelles.", "Mets dans un plat frotté d'ail, couvre de lait et crème, sel, poivre.", "Cuis 50 min à 180 °C. Sers avec le jambon."]],
    ["Ratatouille, œuf et semoule", "🍆", 45, "vege healthy batch", {courgettes:150, poivrons:0.4, tomates:120, oignons:40, oeufs:1, semoule:60, ail:1, huile:0}, ["Coupe les légumes, fais-les revenir avec ail et herbes.", "Mijote 30 min à couvert.", "Sers avec la semoule et un œuf au plat."]],
    ["Couscous poulet-légumes", "🍲", 60, "viande batch", {poulet_cuisse:200, semoule:80, carottes:80, courgettes:100, pois_chiche:60, oignons:30, bouillon:0.3}, ["Dore le poulet avec l'oignon et 1 c. à soupe d'épices à couscous.", "Ajoute carottes, bouillon et eau, cuis 25 min, puis courgettes et pois chiches 15 min.", "Prépare la semoule et sers."]],
    ["Steak haché et frites au four", "🍔", 35, "enfant viande rapide", {boeuf_hache:110, pommes_terre:250, salade:0.2, huile:0}, ["Coupe les frites, huile et sel, four à 220 °C pendant 30 min.", "Façonne et cuis les steaks 3 min par face.", "Sers avec la salade."]],
    ["Poêlée saucisses et haricots verts", "🍳", 30, "viande rapide porc", {saucisses:1.5, haricots_verts:150, pommes_terre:150, huile:0}, ["Cuis les pommes de terre en dés à la poêle, 15 min.", "Dore les saucisses à côté.", "Ajoute les haricots verts et réchauffe 5 min."]],
    ["Riz cantonais", "🍚", 25, "enfant rapide porc", {riz:80, jambon:1, oeufs:1, ppc:80, huile:0}, ["Cuis le riz.", "Fais une omelette fine, coupe-la en lanières.", "Saute riz, jambon et légumes, ajoute l'omelette."]],
    ["Lasagnes", "🍝", 70, "enfant viande batch", {lasagnes:70, boeuf_hache:80, tomates_conc:120, lait:100, beurre:10, farine:10, emmental:25, oignons:30}, ["Fais une bolognaise (oignon, viande, coulis).", "Fais une béchamel : beurre, farine, puis lait en fouettant.", "Alterne feuilles, sauce, béchamel ; fromage dessus. Four 40 min à 180 °C."]],
    ["Gratin pommes de terre-lardons", "🧀", 50, "enfant porc", {pommes_terre:280, lardons:50, oignons:40, creme:50, emmental:30}, ["Cuis les pommes de terre en rondelles 10 min à l'eau.", "Fais revenir lardons et oignon.", "Mélange avec la crème, couvre de fromage, gratine 25 min à 200 °C."]],
    ["Chakchouka (œufs, poivrons, tomates)", "🍳", 30, "vege rapide healthy", {oeufs:2, poivrons:0.5, tomates_pelees:150, oignons:40, pain:0.25, ail:1, huile:0}, ["Fais fondre oignon, ail et poivron 10 min.", "Ajoute les tomates et le cumin, mijote 10 min.", "Creuse des nids, casse les œufs, couvre 6 min. Sers avec du pain."]],
    ["Wraps au thon et crudités", "🌯", 15, "poisson rapide", {tortillas:2, thon:0.4, tomates:80, salade:0.15, emmental:15}, ["Mélange le thon avec un peu de crème ou de mayonnaise.", "Garnis les tortillas de salade, tomates, thon et fromage.", "Roule et coupe en deux."]]
  ].map((r, i) => ({id: "r" + i, nom: r[0], emo: r[1], min: r[2], tags: r[3].split(" "), ing: r[4], etapes: r[5]}));

  function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }

  // quantités totales → paquets à acheter
  function shopping(menu, portions, prices, idx, opts) {
    const need = {};
    for (const m of menu) { const r = R.find(x => x.id === m.id); const k = portions * (m.batch ? 2 : 1); for (const [i, q] of Object.entries(r.ing)) need[i] = (need[i] || 0) + q * k; }
    const lines = [];
    for (const [i, q] of Object.entries(need)) {
      const d = ING[i]; if (!d) continue;
      const placard = !!d[6], price = (prices[i] ?? d[5]) * idx;
      const packs = d[2] === "pc" && d[3] === 1 ? Math.ceil(q - 1e-9) : Math.ceil(q / d[3] - 1e-9);
      const left = packs * d[3] - q;
      lines.push({id: i, nom: d[0], rayon: RAYONS[d[1]], qty: q, unit: d[2], packs: Math.max(1, packs), pack: d[4], price, cost: placard ? 0 : Math.max(1, packs) * price, placard, left, packSize: d[3]});
    }
    if (opts.basics) for (const b of BASICS) lines.push({id: b[0], nom: b[1], rayon: RAYONS[b[2]], packs: 1, pack: b[4], price: (prices[b[0]] ?? b[5]) * idx, cost: (prices[b[0]] ?? b[5]) * idx, basic: true});
    return lines.sort((a, b) => RAYONS.indexOf(a.rayon) - RAYONS.indexOf(b.rayon) || a.nom.localeCompare(b.nom));
  }
  const total = lines => lines.reduce((a, l) => a + l.cost, 0);

  // Génère un menu : choix glouton du coût marginal le plus bas (réutilise les paquets entamés), varié, dans le style demandé
  function generate(o) {
    const rand = rng(o.seed), portions = o.adultes + 0.5 * o.enfants, idx = (STORES.find(s => s[0] === o.store) || STORES[1])[2];
    let pool = R.filter(r => !o.exclus.some(t => r.tags.includes(t) || (t === "boeuf" && "boeuf_hache" in r.ing)));
    if (o.styles.includes("vege")) pool = pool.filter(r => r.tags.includes("vege"));
    if (o.styles.includes("rapide")) pool = pool.filter(r => r.min <= 30 || (o.styles.includes("batch") && r.tags.includes("batch")));
    if (!pool.length) return {menu: [], error: "Aucune recette ne correspond à ces critères : retire un style ou une exclusion."};
    const menu = [], locked = (o.locked || []).filter(m => pool.some(r => r.id === m.id));
    let slots = o.repas;
    for (const m of locked) { menu.push(m); slots -= m.batch ? 2 : 1; }
    const used = new Set(menu.map(m => m.id));
    while (slots > 0) {
      const base = total(shopping(menu, portions, o.prices, idx, {}));
      let best = null;
      for (const r of pool) {
        if (used.has(r.id) && pool.length > used.size) continue;
        if ((o.avoid || []).includes(r.id) && pool.length > used.size + (o.avoid || []).length) continue;
        const batch = o.styles.includes("batch") && r.tags.includes("batch") && slots >= 2;
        const cand = {id: r.id, batch};
        const cost = (total(shopping([...menu, cand], portions, o.prices, idx, {})) - base) / (batch ? 2 : 1);
        let score = cost * (o.styles.includes("petitprix") ? 1.6 : 1) + rand() * 2.2;
        if (o.styles.includes("enfant") && !r.tags.includes("enfant")) score += 2;
        if (o.stock && o.stock.length) score -= 2.2 * Object.keys(r.ing).filter(k => o.stock.includes(k)).length; // anti-gaspi : utiliser ce qui est déjà au frigo
        if (o.styles.includes("healthy") && !r.tags.includes("healthy") && !r.tags.includes("vege")) score += 1.5;
        if (!o.styles.includes("vege") && r.tags.includes("vege")) score += 0.3;
        const baseOf = b => ["pates","lasagnes","riz","semoule","pommes_terre","lentilles","pain_mie","tortillas","pate_brisee","pate_pizza"].find(k => k in b.ing) || "autre";
        const prev = menu.map(m => R.find(x => x.id === m.id));
        score += 1.8 * prev.filter(p => baseOf(p) === baseOf(r)).length;
        if (prev.some(p => p.nom.split(" ")[0] === r.nom.split(" ")[0])) score += 2.5;
        if (r.tags.includes("porc")) score += 2.6 * prev.filter(p => p.tags.includes("porc")).length;
        const veg = x => Object.keys(x.ing).some(k => ING[k] && (ING[k][1] === 0 || ["epinards","haricots_verts","ppc","tomates_pelees","pois_chiche","haricots_rouges","lentilles"].includes(k)) && !["oignons","ail","pommes_terre"].includes(k));
        if (!veg(r)) score += 0.8 + 0.4 * prev.filter(p => !veg(p)).length;
        const lastTags = menu.slice(-2).map(m => R.find(x => x.id === m.id).tags);
        if (lastTags.some(t => (t.includes("viande") && r.tags.includes("viande")))) score += 0.8;
        if (!best || score < best.score) best = {cand, score};
      }
      if (!best) break;
      menu.push(best.cand); used.add(best.cand.id); slots -= best.cand.batch ? 2 : 1;
    }
    const lines = shopping(menu, portions, o.prices, idx, {basics: o.basics});
    return {menu, lines, total: total(lines), portions, idx};
  }

  root.Courses = {STORES, RAYONS, ING, R, shopping, generate, total};
})(typeof window !== "undefined" ? window : globalThis);
