// Moteur : lecture de relevés (CSV Caisse d'Épargne, CSV/Excel Crédit Mutuel ou autre), catégorisation, analyse
(function (root) {
  const CATS = {
    salaire:     ["Salaire", "revenu"],
    chomage:     ["France Travail", "revenu"],
    caf:         ["CAF / aides", "revenu"],
    rembours:    ["Remboursements & avoirs", "revenu"],
    courses:     ["Courses alimentaires", "essentiel"],
    garde:       ["Enfant & garde", "essentiel"],
    credit:      ["Crédit (mensualités)", "essentiel"],
    logement:    ["Logement, eau & énergie", "essentiel"],
    impots:      ["Impôts & taxes", "essentiel"],
    assurances:  ["Assurances & mutuelle", "essentiel"],
    sante:       ["Santé & pharmacie", "essentiel"],
    transport:   ["Transports & carburant", "essentiel"],
    telecom:     ["Téléphone & internet", "essentiel"],
    banque:      ["Frais bancaires", "compressible"],
    fastfood:    ["Fast-food & snacks", "compressible"],
    resto:       ["Restaurants & bars", "compressible"],
    shopping:    ["Vêtements & shopping", "compressible"],
    bazar:       ["Bazar & déco (Action, Noz…)", "compressible"],
    enligne:     ["Achats PayPal / en ligne", "compressible"],
    loisirs:     ["Loisirs & sport", "compressible"],
    beaute:      ["Coiffure & beauté", "compressible"],
    abos:        ["Petits abonnements", "compressible"],
    especes:     ["Retraits d'espèces", "compressible"],
    proches:     ["Virements Wero (à qualifier)", "compressible"],
    travaux:     ["Projet travaux & équipement", "projet"],
    pret_verse:  ["Déblocages du prêt travaux", "neutre"],
    pret_anticip:["Remboursement prêt (exceptionnel)", "projet"],
    epargne:     ["Épargne", "epargne"],
    interne:     ["Virements entre mes comptes", "neutre"],
    exclu:       ["Total carte différé (déjà détaillé)", "neutre"],
    autre:       ["Autre (à classer)", "compressible"]
  };

  const RULES = [
    [/DEBIT DIFFERE|CUMUL DES DEBITS|FACTURE CARTE|TOTAL CARTE|RELEVE CARTE/, "exclu"],
    [/SALAIRE|APPOINTEMENT|PAIE |VIREMENT SALAIRE/, "salaire"],
    [/FRANCE TRAVAIL|POLE EMPLOI/, "chomage"],
    [/CAF DE |\bCAF\b|ALLOCATIONS FAMILIALES/, "caf"],
    [/VERSEMENT CREDIT|DEBLOCAGE PRET|DEBLOCAGE DE FONDS/, "pret_verse"],
    [/ECH PRET|ECHEANCE DE CREDIT|ECHEANCE PRET|REMBOURSEMENT DE PRET|ECH\.? ?PRET/, "credit"],
    [/REMBOURSEMENT PRET/, "pret_anticip"],
    [/VIREMENT INTERNE|DE COMPTE A COMPTE|VIR(EMENT)? (VERS|DE) (MON|CPTE|COMPTE)/, "interne"],
    [/^EPARGNE|LIVRET|VERS(EMENT)? LIV|\bPEL\b|LDDS/, "epargne"],
    [/^REMBOURSEMENT \| REMBOURSEMENT/, "proches"],
    [/WERO|LYDIA|PAYLIB/, "proches"],
    [/FRAIS MODIF PLAFOND|COMMISSION D'INTERVENTION|COMMISSION INTERVENTION|AGIOS|FRAIS RETRAIT|FRAIS DE TENUE|LETTRE D'INFO/, "banque", "evitable"],
    [/COM CB INT|COMMISSION.*(ETRANGER|DEVISE|INT)|FRAIS PAIEMENT HORS/, "banque", "evitable"],
    [/COTISATION|REM OFFRE|COTIS |EUROCOMPTE|FRAIS BANCAIRES/, "banque"],
    [/RETRAIT DAB|RETRAIT GAB|RETRAIT ESPECES|^RET DAB|RETRAIT CB/, "especes"],
    [/BRICO|LEROY|IKEA|MATERIAUX TRAVAUX|CASTORAMA|POINT P|CEDEO|WELDOM/, "travaux"],
    [/VERT BAUDET|VERTBAUDET|CRECHE|ASSISTANTE MAT|PAJEMPLOI|CANTINE|PERISCOLAIRE/, "garde"],
    [/VEOLIA|EDF|ENGIE|TOTALENERGIES|TOTAL ENERGIES|ELECTRICIT|GAZ DE|\bLOYER|SAUR|EAU DE|OHM ENERGIE|ENERCOOP/, "logement"],
    [/DGFIP|IMPOT|TRESOR PUBLIC|TAXE FONCIERE|TAXE HABITATION|AMENDE/, "impots"],
    [/BPCE ASSURANCES|AVANSSUR|MGEN|ASSURANCE|MACIF|MAIF|MATMUT|AXA|ALLIANZ|GROUPAMA|ACM IARD|ACM VIE|MUTUELLE/, "assurances"],
    [/PHARMA|TESSAN|MEDECIN|DOCTEUR|LABO|DENTISTE|OPTIC|HOPITAL|CLINIQUE/, "sante"],
    [/BOUYGUES|FREE TELECOM|FREEBOX|FREE MOBILE|ORANGE SA|SFR|SOSH|RED BY/, "telecom"],
    [/GOOGLE|NETFLIX|SPOTIFY|DISNEY|DEEZER|AMAZON PRIME|PRIME VIDEO|APPLE\.COM|CANAL/, "abos"],
    [/SNCF|RYANAIR|COFIROUTE|\bTOTAL\b(?! CARTE)|INTERMARCHE|KEOLIS|NAVIGO|MTICK|CHARGEMAP|ESSO|SHELL|\bBP\b|AVIA|VINCI AUTO|ASF |APRR|SANEF|PARKING|STATIONNEMENT/, "transport"],
    [/MC ?DONALD|MCDONALDS|BURGER KING|AREAS|SELECTA|KFC|O'TACOS|DOMINO|UBER ?EATS|DELIVEROO|QUICK\b|SUBWAY/, "fastfood", "evitable"],
    [/POKAWA|ROYAL WOK|RESTAURANT|BRASSERIE|PIZZ/, "resto"],
    [/LECLERC|LIDL|PICARD|NETTO|FRANPRIX|MARCHE|BOULANGERIE|VIVAL|CARREFOUR|AUCHAN|SUPER U|HYPER U|SYSTEME U|ALDI|GRAND FRAIS|BIOCOOP|CASINO|MONOPRIX|COCCINELLE|BOUCHERIE/, "courses"],
    [/\bACTION\b|FOIR FOUILLE|\bNOZ\b|GIFI|\bTEDI\b|POPSA|STOKOMANI|HEMA|CENTRAKOR/, "bazar", "evitable"],
    [/ZEEMAN|KIABI|CHANTELLE|ZALANDO|VINTED|CDISCOUNT|GAMM VERT|SHEIN|TEMU|AMAZON|H&M|PRIMARK|JULES|CELIO/, "shopping"],
    [/PAYPAL/, "enligne"],
    [/DECATHLON|BOWLING|ORANGE BLEUE|TICKETMASTER|GROUPON|BILLETWEB|TABAC PRESSE|CINEMA|FNAC|CULTURA|STEAM|PLAYSTATION|NINTENDO/, "loisirs"],
    [/COIFFURE|KIKO|LAUNDRY|SEPHORA|NOCIBE|ESTHETI/, "beaute"],
  ];
  const INCOME_CATS = ["salaire", "chomage", "caf", "pret_verse", "interne", "exclu", "epargne"];

  /* ---------- lecture de fichiers ---------- */
  const deacc = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

  function splitCSV(text) {
    text = text.replace(/^﻿/, "");
    const first = text.split(/\r?\n/).slice(0, 15).join("\n");
    const delim = [";", "\t", ","].sort((a, b) => first.split(b).length - first.split(a).length)[0];
    const rows = []; let row = [], cell = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"') q = true;
      else if (ch === delim) { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
      else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(c => String(c).trim()));
  }

  function toNum(v) {
    if (typeof v === "number") return v;
    if (v == null) return 0;
    let s = String(v).replace(/[\s  €]/g, "").replace(/EUR/i, "");
    if (!s) return 0;
    if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
    return parseFloat(s.replace("+", "")) || 0;
  }
  function toDate(v) {
    if (v instanceof Date) return new Date(v.getFullYear(), v.getMonth(), v.getDate(), 12);
    if (typeof v === "number" && v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 864e5)); return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12); }
    const s = String(v ?? "").trim();
    let m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
    if (m) { let y = +m[3]; if (y < 100) y += 2000; return new Date(y, +m[2] - 1, +m[1], 12); }
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3], 12);
    return null;
  }

  // Transforme un tableau 2D (CSV ou Excel) en opérations normalisées
  function normalizeTable(table) {
    let h = -1;
    for (let i = 0; i < Math.min(table.length, 40); i++) {
      const c = table[i].map(deacc);
      if (c.some(x => x.startsWith("date")) && c.some(x => /libell|intitul|operation|designation|description/.test(x) && !x.startsWith("date"))
          && c.some(x => /debit|credit|montant/.test(x))) { h = i; break; }
    }
    if (h < 0) throw new Error("entête introuvable");
    const head = table[h].map(deacc);
    const find = (...tests) => { for (const t of tests) { const i = head.findIndex(t); if (i >= 0) return i; } return -1; };
    const iDate = find(x => x.startsWith("date de compta"), x => x === "date", x => /date d.?operation|date operation/.test(x), x => x.startsWith("date") && !/valeur/.test(x));
    const iLab = find(x => x.startsWith("libelle simplifie"), x => /^libelle$|^libelle de l.?operation$|^intitule|^designation|^description/.test(x), x => /libell/.test(x), x => /operation/.test(x) && !x.startsWith("date") && !/type/.test(x));
    const iOp = find(x => /libelle operation|libelle de l.?operation|libelle complet/.test(x));
    const iInfo = find(x => /informations|complement|detail/.test(x));
    const iDeb = find(x => /^debit/.test(x)), iCre = find(x => /^credit/.test(x)), iMnt = find(x => /^montant/.test(x));
    const out = [];
    for (let i = h + 1; i < table.length; i++) {
      const r = table[i]; const date = toDate(r[iDate]); if (!date || isNaN(date)) continue;
      let amount;
      if (iDeb >= 0 || iCre >= 0) { const d = Math.abs(toNum(r[iDeb])), c = Math.abs(toNum(r[iCre])); amount = c - d; if (!d && !c && iMnt >= 0) amount = toNum(r[iMnt]); }
      else amount = toNum(r[iMnt]);
      amount = Math.round(amount * 100) / 100;
      if (!amount) continue;
      const label = String(r[iLab] ?? "").replace(/\s+/g, " ").trim();
      out.push({ d: date.toISOString().slice(0, 10), label, op: iOp >= 0 ? String(r[iOp] ?? "").trim() : label, info: iInfo >= 0 ? String(r[iInfo] ?? "").trim() : "", amount });
    }
    return out;
  }
  const fromCSV = text => normalizeTable(splitCSV(text));

  // Fusion de plusieurs sources, en supprimant les doublons d'exports qui se chevauchent
  function merge(sources) {
    const best = new Map();
    for (const s of sources) {
      if (s.hidden) continue;
      const local = new Map();
      for (const r of s.rows) { const k = r.d + "|" + r.amount.toFixed(2) + "|" + r.label.toUpperCase(); (local.get(k) || local.set(k, []).get(k)).push({ ...r, src: s.name }); }
      for (const [k, list] of local) if (!best.has(k) || best.get(k).length < list.length) best.set(k, list);
    }
    const rows = [...best.values()].flat();
    // un total de carte différée n'est exclu que si la source détaille aussi les paiements carte
    const detailed = new Set(rows.filter(r => /^(CB |PAIEMENT CB|PAIEMENT PAR CARTE|CARTE \d)/i.test(r.op || r.label)).map(r => r.src));
    rows.forEach(r => r.cardDetailed = detailed.has(r.src));
    return rows;
  }

  function categorize(t, overrides, userRules) {
    if (overrides && overrides[t.key]) return { cat: overrides[t.key], tag: null };
    const s = (t.label + " | " + t.op + " | " + t.info).toUpperCase();
    for (const r of userRules || []) if (r.txt && s.includes(r.txt.toUpperCase()) && (r.sens === "tous" || (r.sens === "credit") === (t.amount > 0))) return { cat: r.cat, tag: r.evitable ? "evitable" : null, rule: r.txt };
    for (const [re, cat, tag] of RULES) {
      if (!re.test(s)) continue;
      if (cat === "exclu" && !t.cardDetailed) continue;
      if (t.amount > 0 && !INCOME_CATS.includes(cat)) { if (cat === "banque") return { cat, tag: null }; break; }
      if (t.amount < 0 && ["salaire", "chomage", "caf", "pret_verse"].includes(cat)) break;
      return { cat, tag: tag || (/GROUPON/.test(s) ? "evitable" : null) };
    }
    return { cat: t.amount > 0 ? "rembours" : "autre", tag: null };
  }

  function analyse(rows, overrides, userRules) {
    return rows.map((r, id) => {
      const date = new Date(r.d + "T12:00:00");
      const o = { ...r, id, date, dateStr: date.toLocaleDateString("fr-FR"), key: r.label + "|" + r.op };
      const c = categorize(o, overrides, userRules); o.cat = c.cat; o.tag = c.tag;
      o.month = r.d.slice(0, 7);
      return o;
    });
  }

  root.BudgetEngine = { CATS, splitCSV, normalizeTable, fromCSV, merge, analyse, categorize };
})(typeof window !== "undefined" ? window : globalThis);
