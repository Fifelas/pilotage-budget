// Lecture d'un bulletin de paie IEG (PDF) dans le navigateur, avec pdf.js
(function (root) {
  const GROUP = { "001": "base", "20B": "accessoire", "612": "accessoire", "175": "conjoint", "058": "energie", "060": "energie" };
  const NUM = /-?\d{1,3}(?: \d{3})*,\d+/g;
  const f = s => parseFloat(s.replace(/\s/g, "").replace(",", "."));

  function loadPdfJs() {
    if (root.pdfjsLib) return Promise.resolve();
    const add = src => new Promise((ok, ko) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => ko(new Error("lecteur PDF indisponible (connexion ?)")); document.head.appendChild(s); });
    const base = "./vendor/";
    // le « worker » est chargé dans la page : pdf.js l'utilise alors sans créer de Worker séparé
    return add(base + "pdf.min.js").then(() => add(base + "pdf.worker.min.js")).then(() => { root.pdfjsLib.GlobalWorkerOptions.workerSrc = base + "pdf.worker.min.js"; });
  }

  // Reconstitue les lignes d'une page : texte + position droite (x1) de chaque nombre
  async function pageLines(page) {
    const tc = await page.getTextContent();
    const items = tc.items.filter(i => i.str && i.str.trim()).map(i => ({ s: i.str, x0: i.transform[4], x1: i.transform[4] + i.width, y: Math.round(i.transform[5]) }));
    const byY = new Map();
    for (const it of items) { let k = [...byY.keys()].find(y => Math.abs(y - it.y) <= 2); if (k == null) { k = it.y; byY.set(k, []); } byY.get(k).push(it); }
    return [...byY.entries()].sort((a, b) => b[0] - a[0]).map(([y, its]) => {
      its.sort((a, b) => a.x0 - b.x0);
      let text = "", xs = [], prev = null;
      for (const it of its) {
        if (prev && it.x0 - prev.x1 > 1) { text += " "; xs.push(prev.x1); }
        for (const ch of it.s) { text += ch; xs.push(it.x1); }
        prev = it;
      }
      const nums = []; let m; NUM.lastIndex = 0;
      while ((m = NUM.exec(text))) nums.push({ v: f(m[0]), x: xs[m.index + m[0].length - 1], i: m.index });
      return { y, text: text.trim(), raw: text, nums };
    });
  }

  async function parsePayslip(buffer) {
    await loadPdfJs();
    const pdf = await root.pdfjsLib.getDocument({ data: buffer }).promise;
    const pages = [];
    for (let p = 1; p <= pdf.numPages; p++) pages.push(await pageLines(await pdf.getPage(p)));
    const all = pages.flat();
    const per = all.map(l => l.text.match(/PERIODE:?\s+(\d\d)\s+(\d\d)\s+(\d{4})/)).find(Boolean);
    if (!per) throw new Error("ce n'est pas un bulletin de paie reconnu (période introuvable)");
    const mois = `${per[3]}-${per[2]}`;
    let stage = "gain", sal = 0, pat = 0, pas = 0;
    const gains = [], apres = [], cot = [];
    const inCol = (n, a, b) => n.x >= a && n.x <= b;
    for (const l of all) {
      const t = l.text;
      if (/MBR\s+MONTANT BRUT/.test(t)) { stage = "cot"; continue; }
      if (/TOTAL COTISATIONS/.test(t)) { const s = l.nums.find(n => inCol(n, 410, 460)), p = l.nums.find(n => n.x > 540); sal = s ? s.v : 0; pat = p ? p.v : 0; stage = "net"; continue; }
      if (/MNS\s+MONTANT NET SOCIAL/.test(t)) { stage = "apres"; continue; }
      const m = t.match(/^\*?\s*([0-9A-Z]{3})\s+(.+)$/);
      if (!m || !l.nums.length) continue;
      const code = m[1];
      // libellé = texte avant le premier nombre en colonne (hors "98,25%" du libellé)
      const firstCol = l.nums.find(n => n.x > 200);
      let lib = firstCol ? l.raw.slice(0, firstCol.i).replace(/^\s*\*?\s*[0-9A-Z]{3}\s+/, "") : m[2];
      lib = lib.replace(/\s+(MOIS ANTER|JANVIER|FEVRIER|MARS|AVRIL|MAI|JUIN|JUILLET|AOUT|SEPTEMBRE|OCTOBRE|NOVEMBRE|DECEMBRE)\s*$/i, "").replace(/\s+\d[\d ]*$/, "").trim();
      if (stage === "gain") {
        let v = 0; for (const n of l.nums) { if (n.x >= 470 && n.x <= 530) v += n.v; else if (inCol(n, 400, 469)) v -= n.v; }
        if (v) gains.push({ c: code, l: lib, v: Math.round(v * 100) / 100, g: GROUP[code] || "ponctuel" });
      } else if (stage === "cot" || stage === "net") {
        const s = l.nums.find(n => inCol(n, 410, 460)); if (s) cot.push({ l: lib, v: s.v });
      } else if (stage === "apres") {
        if (code === "P60") { const s = l.nums.find(n => inCol(n, 410, 460)); pas = s ? s.v : 0; continue; }
        let v = 0; for (const n of l.nums) { if (n.x >= 470 && n.x <= 530) v += n.v; else if (inCol(n, 400, 469)) v -= n.v; }
        if (!v) continue;
        const plain = lib.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
        const g = code === "515" ? "transport" : code === "768" ? "energie" : (/^K/.test(code) || /\bFR |FRAIS|SEJ|TAD|REPAS|RESTAU|MISSION|DEPLAC/.test(plain)) ? "frais" : "ponctuel";
        apres.push({ c: code, l: lib, v: Math.round(v * 100) / 100, g });
      }
    }
    // net à payer : le nombre le plus à droite de la dernière ligne chiffrée de la dernière page
    const last = pages[pages.length - 1].filter(l => l.nums.length >= 2).sort((a, b) => a.y - b.y)[0];
    const net = last ? last.nums.reduce((a, n) => n.x > a.x ? n : a).v : NaN;
    const brut = Math.round(gains.reduce((a, g) => a + g.v, 0) * 100) / 100;
    const calc = Math.round((brut - sal - pas + apres.reduce((a, x) => a + x.v, 0)) * 100) / 100;
    return { m: mois, net, brut, sal, pat, pas, gains, apres, cot: cot.sort((a, b) => b.v - a.v), ok: Math.abs(calc - net) < 1, calc };
  }

  root.Payslip = { parsePayslip, loadPdfJs };
})(typeof window !== "undefined" ? window : globalThis);
