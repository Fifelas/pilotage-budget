// Lecture d'un tableau d'amortissement (PDF de la banque) avec pdf.js, dans le navigateur
(function (root) {
  const f = s => parseFloat(String(s).replace(/\s/g, "").replace(",", "."));
  async function lines(buffer) {
    await root.Payslip.loadPdfJs();
    const pdf = await root.pdfjsLib.getDocument({ data: buffer }).promise, out = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const tc = await (await pdf.getPage(p)).getTextContent(), byY = new Map();
      for (const it of tc.items) { if (!it.str.trim()) continue; const y = Math.round(it.transform[5]);
        let k = [...byY.keys()].find(v => Math.abs(v - y) <= 2); if (k == null) { k = y; byY.set(k, []); } byY.get(k).push(it); }
      for (const [, its] of [...byY.entries()].sort((a, b) => b[0] - a[0])) out.push(its.sort((a, b) => a.transform[4] - b.transform[4]).map(i => i.str).join(" ").replace(/\s+/g, " ").trim());
    }
    return out;
  }
  async function parseAmortissement(buffer) {
    const L = await lines(buffer), ech = [];
    for (const l of L) {
      const m = l.match(/^(\d{1,4})\s+(\d\d)\/(\d\d)\/(\d{4})\s+(.*)$/); if (!m) continue;
      const nums = m[5].match(/\d{1,3}(?: \d{3})*,\d{2}/g) || []; if (nums.length < 5) continue;
      const v = nums.map(f);
      ech.push([`${m[4]}-${m[3]}-${m[2]}`, v[0], v[1], v[2], v[3], v[4] || 0]);
    }
    if (ech.length < 3) throw new Error("aucune échéance trouvée : est-ce bien un tableau d'amortissement ?");
    const txt = L.join("\n");
    const num = (txt.match(/cr[ée]dit\s*:?\s*([0-9A-Z]{5,})/i) || [])[1] || "";
    const montant = f((txt.match(/Montant du pr[êe]t\s*:?\s*([\d ]+,\d{2})/i) || [])[1] || "0");
    const taux = f((txt.match(/Taux\s+([\d]+,\d+)\s*%/i) || [])[1] || "0");
    const produit = ((L.find(l => /^[A-Z][A-Z ]{5,}$/.test(l) && !/TABLEAU|AMORTISSEMENT/.test(l))) || "").trim();
    const ed = txt.match(/dition\s*:?\s*(\d\d)\/(\d\d)\/(\d{4})/);
    return { num, produit, montant, taux, edition: ed ? `${ed[3]}-${ed[2]}-${ed[1]}` : new Date().toISOString().slice(0, 10), ech: ech.sort((a, b) => a[0].localeCompare(b[0])) };
  }
  root.Pret = { parseAmortissement };
})(window);
