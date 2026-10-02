// Rechenlogik. Alles hier sind „reine Funktionen“: Sie bekommen Auftrag (J) und Einstellungen (S)
// und geben ein Ergebnis zurück, ohne die Seite anzufassen. Deshalb lassen sie sich im Selbsttest prüfen.
// Rechenwege ausführlich: docs/KALKULATION.md

// Menge einer Position (Summe der Größen oder Feld „Menge“)
function qtyOf(p) {
  if (p.ohneGroessen || p.typ === 'transfer' || p.typ === 'leistung') return Math.max(0, n(p.menge));
  return SIZES.reduce((s, k) => s + Math.max(0, Math.round(n(p.groessen[k]))), 0);
}
function wholeQty(p) { return p.typ === 'leistung' ? qtyOf(p) : Math.round(qtyOf(p)); }
function surFor(p, size) { const i = SIZES.indexOf(size); return i === 5 ? n(p.aufXXL) : i >= 6 ? n(p.auf3XL) : 0; }
const validMotifs = p => (p.motive || []).filter(m => n(m.w) > 0 && n(m.h) > 0);

// Meterpreis aus der Mengenstaffel: höchste Stufe, deren „ab“ erreicht ist
function foliePreis(AN, m) {
  const st = AN.staffel.slice().sort((a, b) => n(a.ab) - n(b.ab));
  let p = st.length ? n(st[0].preis) : 0;
  st.forEach(x => { if (m >= n(x.ab)) p = n(x.preis); });
  return p;
}

// Stückpreis immer aufrunden: auf 10 Cent, 50 Cent, ,90 oder ganze Euro
function roundUnit(v, rundung) {
  const r = String(rundung);
  if (r === '0.1') return Math.ceil(v * 10 - 1e-9) / 10;
  if (r === '0.5') return Math.ceil(v * 2 - 1e-9) / 2;
  if (r === '1') return Math.ceil(v - 1e-9);
  if (r === '0.9') { const c = Math.floor(v) + 0.9; return r2(c + 1e-9 >= v ? c : c + 1); }
  return r2(v);
}

// Maschinenstundensatz einer Presse: Abschreibung + kalkulatorische Zinsen + Wartung pro Laufstunde, plus Strom
function machineRate(pr) {
  if (!pr) return { afa: 0, zinsen: 0, wartung: 0, fixH: 0, energieH: 0, perH: 0 };
  const afa = n(pr.jahre) > 0 ? n(pr.preis) / n(pr.jahre) : 0;
  const zinsen = n(pr.preis) / 2 * n(pr.zins) / 100;
  const wartung = n(pr.wartung);
  const fixH = (afa + zinsen + wartung) / Math.max(n(pr.stunden), 1);
  const energieH = n(pr.kw) * n(pr.auslastung) / 100 * n(pr.strom);
  return { afa, zinsen, wartung, fixH, energieH, perH: fixH + energieH };
}

// Fixkosten pro Monat → Gemeinkosten pro Stunde → Zuschlag in % auf den Lohn
function fixHelper(S) {
  const sum = S.fixkosten.reduce((s, x) => s + n(x.betrag), 0);
  const hrs = Math.max(n(S.prodStunden), 1);
  const lohnH = n(S.lohn) * (1 + n(S.lohnNK) / 100);
  const perH = sum / hrs;
  return { sum, hrs, perH, lohnH, pct: lohnH > 0 ? perH / lohnH * 100 : 0 };
}

// Gang-Sheet-Planung im Regal-Verfahren (First Fit Decreasing Height).
// items: [{w, h, count, pi, label}] in cm, W = nutzbare Breite, g = Abstand
function planFilm(items, W, g) {
  const types = [], warnings = [];
  items.forEach(it => {
    if (!(it.w > 0 && it.h > 0 && it.count > 0)) return;
    const o = [];
    if (it.w <= W) o.push({ w: it.w, h: it.h, rot: false });
    if (it.h <= W && it.h !== it.w) o.push({ w: it.h, h: it.w, rot: true });
    if (!o.length) { warnings.push('„' + it.label + '“ ist mit ' + N1.format(Math.min(it.w, it.h)) + ' cm breiter als die Folie (' + N1.format(W) + ' cm).'); return; }
    o.sort((a, b) => a.h - b.h);   // niedrigere Lage nehmen: lange Seite quer
    types.push({ w: o[0].w, h: o[0].h, rot: o[0].rot, count: it.count, pi: it.pi, label: it.label, ow: it.w, oh: it.h });
  });
  types.sort((a, b) => b.h - a.h || b.w - a.w);
  const shelves = [];
  types.forEach(t => {
    let start = 0;
    for (let k = 0; k < t.count; k++) {
      let placed = false;
      for (let s = start; s < shelves.length; s++) {
        const sh = shelves[s], x = sh.used > 0 ? sh.used + g : 0;
        if (sh.h >= t.h && x + t.w <= W + 1e-9) { sh.items.push({ x, w: t.w, h: t.h, pi: t.pi }); sh.used = x + t.w; placed = true; start = s; break; }
      }
      if (!placed) { shelves.push({ h: t.h, used: t.w, items: [{ x: 0, w: t.w, h: t.h, pi: t.pi }] }); start = shelves.length - 1; }
    }
  });
  let len = 0;
  shelves.forEach((sh, i) => { sh.y = len; len += sh.h + (i < shelves.length - 1 ? g : 0); });
  return { types, shelves, len, warnings };
}

// Folienkosten für eine geplante Länge (cm) bei einem Anbieter
function filmCostFor(AN, rawCm, usedCm2, sammel, S) {
  let cm, meter, preis, versand;
  if (rawCm <= 0) { cm = 0; meter = 0; preis = foliePreis(AN, 0); versand = 0; }
  else if (sammel) { cm = rawCm; meter = cm / 100; preis = foliePreis(AN, n(S.sammelMeter)); versand = 0; }
  else {
    cm = rawCm + n(AN.vorlauf);
    const step = Math.max(n(AN.schritt), 0.01);
    meter = Math.max(n(AN.minMeter), Math.ceil(cm / 100 / step - 1e-9) * step);
    preis = foliePreis(AN, meter); versand = n(AN.versand);
  }
  const printedM2 = usedCm2 / 10000;
  const tinte = AN.modell === 'eigen' ? printedM2 * n(AN.tinteM2) : 0;
  return { cm, meter, preis, versand, tinte, printedM2, cost: meter * preis + versand + tinte };
}

// ======================= Komplette Kalkulation eines Auftrags =======================
function calc(J, S, full) {
  const a = n(S.ausschuss) / 100, g = Math.max(n(S.abstand), 0);
  const AN = anbieterOf(J, S), W = Math.max(n(AN.breite), 1);
  const PR = presseOf(J, S), MR = machineRate(PR);

  // Positionen mit Menge > 0
  const P = [];
  J.positionen.forEach(p => { const q = wholeQty(p); if (q > 0) P.push({ p, q, typ: p.typ || 'textil' }); });
  const isProd = x => x.typ === 'textil' || x.typ === 'transfer';
  const isFest = x => x.typ === 'leistung' && x.p.kostenart === 'festpreis';
  const totalQ = P.filter(isProd).reduce((s, x) => s + x.q, 0);       // Teile + Transfer-Sätze
  const textilQ = P.filter(x => x.typ === 'textil').reduce((s, x) => s + x.q, 0);
  // Auftragskosten (Rüsten, Pakete …) werden auf die Produktion verteilt, sonst auf die Leistungen
  const D = totalQ > 0 ? P.filter(isProd) : P.filter(x => x.typ === 'leistung' && !isFest(x));
  const dQ = D.reduce((s, x) => s + x.q, 0);
  const hasWork = dQ > 0;

  // Transfers je Position und Folienplanung
  const items = [];
  let transfers = 0, pressCount = 0;
  P.forEach((x, i) => {
    x.mot = isProd(x) ? validMotifs(x.p) : [];
    x.np = x.typ === 'textil' ? Math.ceil(x.q * (1 + a) - 1e-9) : x.typ === 'transfer' ? x.q : 0;
    x.nPers = x.mot.filter(m => m.pers).length;
    x.mot.forEach(m => items.push({ w: n(m.w), h: n(m.h), count: x.np, pi: i, label: (m.name || 'Motiv') + ' · ' + (x.p.name || 'Artikel') }));
    transfers += x.np * x.mot.length;
    if (x.typ === 'textil') pressCount += x.np * x.mot.length;
  });
  const plan = planFilm(items, W, g);
  const areaBy = P.map(() => 0);
  let areaAll = 0, used = 0;
  plan.shelves.forEach(sh => sh.items.forEach(it => { const ar = (it.w + g) * (it.h + g); areaBy[it.pi] += ar; areaAll += ar; used += it.w * it.h; }));
  const rawCm = plan.len * (1 + n(S.folieZuschlag) / 100);
  const F = filmCostFor(AN, rawCm, used, !!J.sammel, S);
  const util = plan.len > 0 ? used / (plan.len * W) : 0;

  const versandSep = !!J.versandSeparat;
  const jobMin = hasWork ? n(S.ruestMin) + n(J.zusatzMin) : 0;
  const paketKosten = hasWork ? n(J.pakete) * n(S.paketPreis) : 0;
  const jobSEK = hasWork ? (versandSep ? 0 : paketKosten) + n(J.zusatzKosten) : 0;
  const z = {
    mgk: n(S.mgk) / 100, fgk: n(S.fgk) / 100, vwvt: n(S.vwvt) / 100, gew: n(J.gewinn) / 100,
    sk: Math.min(n(J.skonto), 95) / 100, rb: Math.min(n(J.rabatt), 95) / 100, mwst: n(S.mwst) / 100,
    express: Math.max(n(J.express), 0) / 100, lohnNK: n(S.lohnNK) / 100
  };
  const lohnH = n(S.lohn) * (1 + z.lohnNK);
  const kText = (1 + z.mgk) * (1 + z.vwvt) * (1 + z.gew) / ((1 - z.sk) * (1 - z.rb));
  const KEYS = ['textil', 'folie', 'mek', 'mgk', 'mk', 'lohn', 'fgk', 'masch', 'fk', 'hk', 'vwvt', 'sekvt', 'sk', 'gewinn', 'bvp', 'skonto', 'zvp', 'rabatt', 'lvp'];
  const tot = {}; KEYS.forEach(k => { tot[k] = 0; });
  let minutes = 0, pressMin = 0;
  const lines = [];

  const rows = P.map((x, i) => {
    const p = x.p, r = { q: x.q, p, typ: x.typ, color: PCOL[i % PCOL.length], np: x.np, transfers: x.np * x.mot.length };
    KEYS.forEach(k => { r[k] = 0; });
    const share = D.includes(x) && dQ > 0 ? x.q / dQ : 0;
    const fshare = areaAll > 0 ? areaBy[i] / areaAll : 0;
    const motTxt = x.mot.map(m => (m.name || 'Motiv') + ' ' + N1.format(n(m.w)) + '×' + N1.format(n(m.h)) + ' cm' + (m.pers ? ' (individuell)' : '')).join(', ');
    const title0 = (p.name || POS_TYPES[x.typ].short) + (p.farbe ? ', ' + p.farbe : '');

    if (isFest(x)) {
      // Festpreis: wird nicht kalkuliert, sondern direkt so angeboten
      const unit = r2(n(p.preisEinheit));
      r.fest = true; r.baseUnit = unit;
      lines.push({ pi: i, color: r.color, title: title0, sizes: '', druck: '', count: x.q, einheit: p.einheit || 'Stk.', unit, total: r2(unit * x.q), typ: x.typ });
      return r;
    }

    // Material
    let surTotal = 0;
    const groups = {};
    if (x.typ === 'textil') {
      if (p.ohneGroessen) groups['0'] = { sur: 0, count: x.q, sizes: [] };
      else SIZES.forEach(s => {
        const c = Math.max(0, Math.round(n(p.groessen[s]))); if (!c) return;
        const su = surFor(p, s); surTotal += su * c;
        const key = String(su);
        if (!groups[key]) groups[key] = { sur: su, count: 0, sizes: [] };
        groups[key].count += c; groups[key].sizes.push(c + '× ' + s);
      });
      r.textil = x.q * n(p.ek) + surTotal + Math.ceil(x.q * a - 1e-9) * n(p.ek);
    } else if (x.typ === 'leistung' && p.kostenart === 'einkauf') {
      r.textil = x.q * n(p.ekEinheit);
    }
    r.folie = F.cost * fshare;
    r.mek = r.textil + r.folie; r.mgk = r.mek * z.mgk; r.mk = r.mek + r.mgk;

    // Arbeitszeit
    let min = 0, pMin = 0;
    if (x.typ === 'textil') {
      const cat = catById(S, p.catId);
      const ps = cat && !isBlank(cat.pressSek) ? n(cat.pressSek) : n(S.pressSek);
      pMin = x.np * x.mot.length * ps / 60;
      min = pMin + x.q * n(S.handlingSek) / 60;
    } else if (x.typ === 'transfer') {
      min = x.np * x.mot.length * n(S.schneidSek) / 60;
    } else if (p.kostenart === 'zeit') {
      min = x.q * n(p.minuten);
    }
    min += x.np * x.nPers * n(S.persSek) / 60 + jobMin * share;
    minutes += min; pressMin += pMin;
    r.minutes = min;
    r.lohn = min / 60 * lohnH; r.fgk = r.lohn * z.fgk; r.masch = pMin / 60 * MR.perH;
    r.fk = r.lohn + r.fgk + r.masch;
    r.hk = r.mk + r.fk; r.vwvt = r.hk * z.vwvt;
    r.sekvt = (x.typ === 'textil' ? x.q * n(S.verpackung) : 0) + jobSEK * share;
    r.sk = r.hk + r.vwvt + r.sekvt;
    r.gewinn = r.sk * z.gew; r.bvp = r.sk + r.gewinn;
    r.zvp = r.bvp / (1 - z.sk); r.skonto = r.zvp - r.bvp;
    r.lvp = r.zvp / (1 - z.rb); r.rabatt = r.lvp - r.zvp;
    KEYS.forEach(k => { tot[k] += r[k]; });

    // Angebotszeilen mit gerundeten Stückpreisen
    const base = (r.lvp - surTotal * kText) / x.q;
    r.baseUnit = roundUnit(base, S.rundung);
    if (x.typ === 'textil') {
      const keys = Object.keys(groups).sort((u, v) => n(u) - n(v));
      keys.forEach((k, gi) => {
        const gr = groups[k], unit = roundUnit(base + gr.sur * kText, S.rundung);
        const title = title0 + (keys.length > 1 && gi > 0 ? ' (Übergröße)' : '');
        lines.push({ pi: i, color: r.color, title, sizes: gr.sizes.join(', '), druck: motTxt, count: gr.count, einheit: 'Stk.', unit, total: r2(unit * gr.count), typ: x.typ });
      });
    } else {
      const title = x.typ === 'transfer' ? (p.name || 'DTF-Transfers') : title0;
      const sizes = x.typ === 'transfer' && x.mot.length > 1 ? 'Satz aus ' + x.mot.length + ' Transfers' : '';
      lines.push({ pi: i, color: r.color, title, sizes, druck: x.typ === 'transfer' ? motTxt : (p.beschreibung || ''), count: x.q, einheit: x.typ === 'transfer' ? (x.mot.length > 1 ? 'Satz' : 'Stk.') : (p.einheit || 'Stk.'), unit: r.baseUnit, total: r2(r.baseUnit * x.q), typ: x.typ });
    }
    return r;
  });

  const posSum = r2(lines.reduce((s, l) => s + l.total, 0));
  const rabattAmt = r2(posSum * z.rb);
  const pausch = totalQ > 0 ? r2(n(J.pauschale)) : 0;
  const expressAmt = r2((posSum - rabattAmt + pausch) * z.express);
  const versandVK = versandSep && hasWork ? r2(n(J.pakete) * n(S.paketVK)) : 0;
  const sub = r2(posSum - rabattAmt + pausch + expressAmt + versandVK);
  const minder = (P.length > 0 && sub > 0 && sub < n(S.minAuftrag)) ? r2(n(S.minAuftrag) - sub) : 0;
  const net = r2(sub + minder), mw = r2(net * z.mwst), brutto = r2(net + mw);
  const extraKosten = versandSep ? paketKosten : 0;   // Versand als eigene Zeile: Kosten stehen nicht in den Positionen
  const selbst = tot.sk + extraKosten;
  const profit = net * (1 - z.sk) - selbst;
  const anzahlung = r2(brutto * Math.max(n(J.anzahlung), 0) / 100);

  return {
    rows, lines, tot, z, totalQ, textilQ, transfers, pressCount, minutes, pressMin,
    anbieter: AN, presse: PR, machine: MR, lohnH,
    meter: F.meter, cm: F.cm, planCm: plan.len, preis: F.preis, versand: F.versand, tinte: F.tinte, printedM2: F.printedM2, filmCost: F.cost, util,
    plan: full ? plan : null, warnings: plan.warnings, shelves: plan.shelves.length,
    posSum, rabattAmt, pausch, expressAmt, versandVK, minder, net, mwstAmt: mw, brutto,
    selbst, extraKosten, profit, anzahlung
  };
}

// Auftrag auf eine andere Gesamtmenge hochrechnen (für Staffelpreise). Leistungen bleiben gleich.
function scaleJob(J, N, totalQ) {
  const f = N / totalQ, c = clone(J);
  c.positionen.forEach(p => {
    if (p.typ === 'leistung') return;
    if (p.ohneGroessen || p.typ === 'transfer') { const q = Math.round(n(p.menge)); p.menge = q > 0 ? Math.max(1, Math.round(q * f)) : 0; }
    else SIZES.forEach(s => { const q = Math.round(n(p.groessen[s])); p.groessen[s] = q > 0 ? Math.max(1, Math.round(q * f)) : 0; });
  });
  return c;
}

// Gleicher Auftrag bei jedem Folien-Anbieter
function compareAnbieter(J, S) {
  return S.anbieter.map(an => {
    const c = clone(J); c.anbieterId = an.id;
    const R = calc(c, S, false);
    return { id: an.id, name: an.name, meter: R.meter, preis: R.preis, filmCost: R.filmCost, net: R.net, profit: R.profit };
  });
}

// Summen der hochgeladenen echten Gang Sheets
function sheetTotals(J) {
  let cm = 0, printed = 0, withCov = 0;
  (J.sheets || []).forEach(s => { cm += n(s.lengthCm); if (s.coverage !== null && s.coverage !== undefined) { printed += n(s.lengthCm) * s.coverage; withCov += n(s.lengthCm); } });
  return { cm, coverage: withCov > 0 ? printed / withCov : null };
}

// ---------- Varianten ----------
// Positionen mit p.var = '' gehören zu allen Varianten. Ohne Varianten bleibt der Auftrag unverändert.
function variantKeys(J) { return Object.keys(J.varNamen || {}).sort(); }
function activeVariant(J) { const k = variantKeys(J); return k.length ? (k.includes(J.variante) ? J.variante : k[0]) : ''; }
function jobForVariant(J, v) {
  if (v === undefined) v = activeVariant(J);
  if (!v) return J;
  return Object.assign({}, J, { positionen: J.positionen.filter(p => !p.var || p.var === v) });
}

// Einstellungen für einen Auftrag: festgeschriebener Stand (ab dem ersten Dokument) oder aktuelle Einstellungen
function settingsFor(J, S) { return J.Ssnap ? migrateSettings(J.Ssnap) : S; }
// Rechnung für den Auftrag, so wie er angeboten/berechnet wird (gewählte Variante, festgeschriebene Preise)
function calcJob(J, S, full) { return calc(jobForVariant(J), settingsFor(J, S), full); }

// Erfasste Arbeitszeit in Minuten (zeiten: [{s: Startzeit ms, e: Ende ms oder null = läuft}])
function zeitSumme(zeiten, now) {
  return (zeiten || []).reduce((s, z) => s + Math.max(0, ((z.e || now || Date.now()) - z.s) / 60000), 0);
}

// Nachkalkulation: echte Werte gegen den Plan
function istValues(J, S, R) {
  const ST = sheetTotals(J);
  const timer = zeitSumme((J.zeiten || []).filter(z => z.e));
  const istMin = !isBlank(J.ist.minuten) ? n(J.ist.minuten) : timer > 0 ? timer : R.minutes;
  const istMeter = !isBlank(J.ist.meter) ? n(J.ist.meter) : (ST.cm > 0 ? ST.cm / 100 : R.meter);
  const istExtra = n(J.ist.kosten);
  const z = R.z;
  // Folie: fester Betrag (z. B. Anteil an einer Sammelbestellung) oder Meter × Staffelpreis
  const filmIst = !isBlank(J.ist.folieKosten) ? n(J.ist.folieKosten) : istMeter * (J.sammel ? R.preis : foliePreis(R.anbieter, istMeter)) + R.versand + R.tinte;
  const dLohn = (istMin - R.minutes) / 60 * R.lohnH * (1 + z.fgk) * (1 + z.vwvt);
  const dFilm = (filmIst - R.filmCost) * (1 + z.mgk) * (1 + z.vwvt);
  // Fehldrucke über den eingeplanten Ausschuss hinaus: Textil + Transfer pro Teil noch einmal
  const geplant = R.rows.filter(r => r.typ === 'textil').reduce((s, r) => s + (r.np - r.q), 0);
  const fehl = n(J.ist.fehldrucke);
  const proTeil = R.totalQ > 0 ? (R.tot.textil + R.tot.folie) / R.totalQ : 0;
  const dFehl = Math.max(0, fehl - geplant) * proTeil * (1 + z.mgk) * (1 + z.vwvt);
  const istSK = R.selbst + dLohn + dFilm + dFehl + istExtra;
  return { min: istMin, meter: istMeter, filmIst, extra: istExtra, fehl, fehlGeplant: geplant, dFehl, sk: istSK, profit: R.net * (1 - z.sk) - istSK,
    fromSheets: isBlank(J.ist.meter) && ST.cm > 0, fromTimer: isBlank(J.ist.minuten) && timer > 0, filmFixed: !isBlank(J.ist.folieKosten) };
}

// Was bleibt übrig, wenn der Kunde einen bestimmten Netto-Preis zahlt?
function profitAtPrice(R, netPrice) {
  const g = netPrice * (1 - R.z.sk) - R.selbst;
  return { profit: g, onCost: R.selbst > 0 ? g / R.selbst * 100 : 0 };
}

// Auswertung über alle gespeicherten Aufträge
function summarizeJobs(jobs, fromIso) {
  const list = jobs.map(j => j.data).filter(d => !fromIso || (d.datum || '') >= fromIso);
  const by = {};
  Object.keys(STATUS).forEach(k => { by[k] = { count: 0, net: 0 }; });
  const months = {}, kunden = {};
  let won = 0, wonNet = 0, wonProfit = 0, decided = 0, openOffers = 0, openOffersNet = 0, openInvoices = 0, openInvoicesNet = 0, pieces = 0;
  list.forEach(d => {
    const st = STATUS[d.status] ? d.status : 'angebot', net = n(d.angebotNetto);
    by[st].count++; by[st].net += net;
    if (WON.includes(st)) {
      won++; wonNet += net; wonProfit += n(d.gewinnEuro); pieces += n(d.teile);
      const m = (d.reDatum || d.datum || '').slice(0, 7);
      if (m) { if (!months[m]) months[m] = { net: 0, profit: 0 }; months[m].net += net; months[m].profit += n(d.gewinnEuro); }
      const kn = d.kunde || 'Ohne Kunde';
      if (!kunden[kn]) kunden[kn] = { net: 0, count: 0, profit: 0 };
      kunden[kn].net += net; kunden[kn].count++; kunden[kn].profit += n(d.gewinnEuro);
    }
    if (WON.includes(st) || st === 'abgelehnt') decided++;
    if (st === 'angebot') { openOffers++; openOffersNet += net; }
    if (st === 'berechnet') { openInvoices++; openInvoicesNet += n(d.angebotBrutto) || net; }
  });
  return {
    count: list.length, by, months, kunden, won, wonNet, wonProfit, pieces,
    quote: decided > 0 ? won / decided * 100 : null, marge: wonNet > 0 ? wonProfit / wonNet * 100 : null,
    openOffers, openOffersNet, openInvoices, openInvoicesNet
  };
}
