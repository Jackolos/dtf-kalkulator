// Selbsttest der Rechenlogik. Läuft im Browser (Einstellungen → Daten → Selbsttest oder index.html?test).
// Die Prüfwerte stammen aus docs/KALKULATION.md. Wer die Rechnung ändert, muss hier nachziehen.

// Einstellungen aus dem Prototyp (Version 1), wie in beispieldaten/einstellungen-standard.json
const TEST_SETTINGS_V1 = {
  fName: '', fAdresse: '', fKontakt: '', fFuss: '',
  folieStaffel: [{ id: 'st1', ab: 0, preis: 12 }, { id: 'st2', ab: 10, preis: 10.5 }, { id: 'st3', ab: 25, preis: 9.5 }],
  folieVersand: 0, rollenbreite: 56, abstand: 1, vorlauf: 10, schritt: 0.1, minMeter: 1, folieZuschlag: 0, sammelMeter: 10, ausschuss: 3,
  lohn: 15, ruestMin: 20, pressSek: 45, handlingSek: 30,
  fixkosten: [{ id: 'fx1', name: 'Raum / Miete', betrag: 150 }, { id: 'fx2', name: 'Strom', betrag: 40 }, { id: 'fx3', name: 'Heißpresse (Abschreibung)', betrag: 30 }, { id: 'fx4', name: 'Software, Versicherung', betrag: 40 }],
  prodStunden: 40, mgk: 5, fgk: 43, vwvt: 15, gewinn: 25, pauschale: 15, minAuftrag: 50, rundung: '0.1', gueltigTage: 14, mwst: 19, verpackung: 0.15, paketPreis: 6.5,
  artikel: [
    { id: 'a1', name: 'T-Shirt', ekHell: 7, ekDunkel: 7, aufXXL: 1, auf3XL: 2, groessen: true },
    { id: 'a2', name: 'Hoodie', ekHell: 18, ekDunkel: 19, aufXXL: 2, auf3XL: 3, groessen: true }
  ]
};

function runSelfTest() {
  const out = [];
  const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 0.005 : tol);
  function t(name, fn) {
    try { const r = fn(); out.push({ name, ok: r === true, info: r === true ? '' : String(r) }); }
    catch (e) { out.push({ name, ok: false, info: 'Fehler: ' + e.message }); }
  }
  const S1 = migrateSettings(clone(TEST_SETTINGS_V1));

  t('Beispielauftrag: Prüfwerte aus KALKULATION.md', () => {
    const R = calc(exampleJob(S1), S1, false);
    const exp = { totalQ: 42, meter: 13.8, filmCost: 144.9, selbst: 800.62, net: 1037.6, profit: 216.23 };
    const bad = Object.keys(exp).filter(k => !near(R[k], exp[k], k === 'meter' ? 1e-6 : 0.006)).map(k => k + ' = ' + R[k] + ' (erwartet ' + exp[k] + ')');
    if (Math.round(R.minutes) !== 122) bad.push('Minuten = ' + R.minutes + ' (erwartet 2 h 02 min)');
    return bad.length ? bad.join(', ') : true;
  });
  t('Migration aus Version 1', () => {
    const a = S1.anbieter[0];
    if (S1.v !== 2) return 'v fehlt';
    if (a.breite !== 56 || a.staffel.length !== 3 || a.vorlauf !== 10) return 'Anbieter falsch übernommen';
    if (S1.pressen.length !== 0 || S1.presseId !== null) return 'Alte Einstellungen dürfen keine Presse bekommen';
    if (S1.druckstellen.length < 5) return 'Druckstellen-Vorlagen fehlen';
    return true;
  });
  t('Rundung der Stückpreise (immer aufrunden)', () => {
    const cases = [[12.01, '0.1', 12.1], [12.01, '0.5', 12.5], [12.5, '0.5', 12.5], [12.95, '0.9', 13.9], [12.5, '0.9', 12.9], [12.01, '1', 13], [12.344, '0', 12.34]];
    const bad = cases.filter(c => !near(roundUnit(c[0], c[1]), c[2], 1e-9)).map(c => c[0] + ' → ' + roundUnit(c[0], c[1]));
    return bad.length ? bad.join(', ') : true;
  });
  t('Gang-Sheet-Planung: 10 Motive 10 × 10 cm auf 56 cm', () => {
    const p = planFilm([{ w: 10, h: 10, count: 10, pi: 0, label: 'x' }], 56, 1);
    return p.shelves.length === 2 && near(p.len, 21, 1e-9) ? true : p.shelves.length + ' Reihen, ' + p.len + ' cm';
  });
  t('Gang-Sheet-Planung: zu breites Motiv gibt Warnung', () => {
    const p = planFilm([{ w: 70, h: 60, count: 1, pi: 0, label: 'x' }], 56, 1);
    return p.warnings.length === 1 && p.shelves.length === 0 ? true : 'keine Warnung';
  });
  t('Maschinenstundensatz', () => {
    const m = machineRate({ preis: 1200, jahre: 5, zins: 5, kw: 2, auslastung: 50, strom: 0.35, wartung: 50, stunden: 400 });
    return near(m.perH, 1.15, 1e-9) ? true : m.perH;
  });
  t('Gewinn = Gewinnzuschlag, wenn nichts gerundet wird', () => {
    const S = clone(S1); S.rundung = '0'; S.minAuftrag = 0;
    const J = exampleJob(S); J.pauschale = 0;
    const R = calc(J, S, false);
    return near(R.profit, R.tot.gewinn, 0.3) ? true : R.profit + ' / ' + R.tot.gewinn;
  });
  t('Nur Transfers: kein Textil, keine Presszeit', () => {
    const S = clone(S1), J = blankJob(S);
    J.positionen = [newPosition(S, null, 'transfer')];
    const R = calc(J, S, false);
    if (R.tot.textil !== 0) return 'Textilkosten ' + R.tot.textil;
    if (R.pressMin !== 0) return 'Presszeit ' + R.pressMin;
    if (R.transfers !== 50) return 'Transfers ' + R.transfers;
    return R.net > 0 && R.lines.length === 1 ? true : 'kein Angebot';
  });
  t('Festpreis-Leistung wird 1:1 übernommen', () => {
    const S = clone(S1), J = exampleJob(S);
    const R0 = calc(J, S, false);
    const p = newPosition(S, null, 'leistung'); p.kostenart = 'festpreis'; p.preisEinheit = 25; p.menge = 2; p.name = 'Design';
    J.positionen.push(p);
    const R = calc(J, S, false);
    if (!near(R.posSum - R0.posSum, 50)) return 'Differenz ' + (R.posSum - R0.posSum);
    return near(R.selbst, R0.selbst) ? true : 'Selbstkosten geändert';
  });
  t('Leistung nach Zeit kostet Lohn + Gemeinkosten', () => {
    const S = clone(S1), J = blankJob(S);
    const p = newPosition(S, null, 'leistung'); p.menge = 1; p.minuten = 60;
    J.positionen = [p]; J.pakete = 0;
    const R = calc(J, S, false);
    // 60 min Leistung + 20 min Rüsten = 80 min × 15 €/h = 20 € Lohn
    return near(R.tot.lohn, 20) ? true : R.tot.lohn;
  });
  t('Expresszuschlag', () => {
    const S = clone(S1), J = exampleJob(S); J.express = 30;
    const R = calc(J, S, false);
    return near(R.expressAmt, r2((R.posSum - R.rabattAmt + R.pausch) * 0.3)) && R.expressAmt > 0 ? true : R.expressAmt;
  });
  t('Versand als eigene Zeile', () => {
    const S = clone(S1), J = exampleJob(S); J.pakete = 2;
    const R0 = calc(J, S, false);
    J.versandSeparat = true;
    const R = calc(J, S, false);
    if (!near(R.versandVK, 2 * S.paketVK)) return 'Versandzeile ' + R.versandVK;
    return near(R.selbst, R0.selbst, 0.01) ? true : 'Selbstkosten ' + R.selbst + ' statt ' + R0.selbst;
  });
  t('Presse erhöht die Kosten um Presszeit × Stundensatz', () => {
    const S = clone(S1);
    S.pressen = [{ id: 'p', name: 'P', preis: 1200, jahre: 5, zins: 5, kw: 2, auslastung: 50, strom: 0.35, wartung: 50, stunden: 400 }]; S.presseId = 'p';
    const R = calc(exampleJob(S), S, false);
    return near(R.tot.masch, R.pressMin / 60 * 1.15, 1e-6) && R.tot.masch > 0 ? true : R.tot.masch;
  });
  t('Personalisierung braucht zusätzliche Zeit', () => {
    const S = clone(S1), J = exampleJob(S);
    const m0 = calc(J, S, false).minutes;
    J.positionen[0].motive.push({ id: 'n', name: 'Name', w: 20, h: 5, pers: true });
    const m1 = calc(J, S, false).minutes;
    return m1 > m0 + 31 * n(S.persSek) / 60 ? true : (m1 - m0) + ' min mehr';
  });
  t('Staffel: Hochrechnen auf doppelte Menge', () => {
    const S = clone(S1), J = exampleJob(S);
    const R = calc(scaleJob(J, 84, 42), S, false);
    return Math.abs(R.totalQ - 84) <= 2 ? true : R.totalQ;
  });
  t('Alter Status „erledigt“ wird „geliefert“', () => normalizeJob({ status: 'erledigt', positionen: [] }, S1).status === 'geliefert' || 'nicht umgestellt');
  t('Anbieter-Vergleich rechnet für jeden Anbieter', () => {
    const S = clone(S1);
    S.anbieter.push(Object.assign(clone(S.anbieter[0]), { id: 'b', name: 'B', staffel: [{ id: 'x', ab: 0, preis: 8 }] }));
    const c = compareAnbieter(exampleJob(S), S);
    return c.length === 2 && c[1].filmCost < c[0].filmCost ? true : JSON.stringify(c.map(x => x.filmCost));
  });
  t('Eigendruck: Tinte nach bedruckter Fläche', () => {
    const S = clone(S1); S.anbieter[0].modell = 'eigen'; S.anbieter[0].tinteM2 = 10;
    const R = calc(exampleJob(S), S, false);
    return near(R.tinte, R.printedM2 * 10, 1e-9) && R.tinte > 0 ? true : R.tinte;
  });
  t('Varianten: jede Variante rechnet nur ihre Positionen', () => {
    const S = clone(S1), J = exampleJob(S);
    J.positionen[0].var = 'A'; J.positionen[1].var = 'B'; J.varNamen = { A: 'Shirt', B: 'Hoodie' }; J.variante = 'B';
    const A = calc(jobForVariant(J, 'A'), S, false), B = calcJob(J, S, false);
    if (A.totalQ !== 30 || B.totalQ !== 12) return 'Mengen ' + A.totalQ + ' / ' + B.totalQ;
    return jobForVariant(exampleJob(S)).positionen.length === 2 ? true : 'ohne Varianten verändert';
  });
  t('Festgeschriebene Preise ändern sich nicht mit den Einstellungen', () => {
    const S = clone(S1), J = exampleJob(S); J.Ssnap = clone(S);
    const net0 = calcJob(J, S, false).net;
    S.lohn = 99; S.gewinn = 80;
    return near(calcJob(J, S, false).net, net0) && calc(J, S, false).net > net0 ? true : 'Snapshot wird nicht benutzt';
  });
  t('Zeiterfassung fließt in die Nachkalkulation', () => {
    const S = clone(S1), J = exampleJob(S); const R = calc(J, S, false);
    J.zeiten = [{ s: 0, e: 90 * 60000 }, { s: 0, e: 30 * 60000 }];
    const I = istValues(J, S, R);
    return near(I.min, 120, 1e-9) && I.fromTimer ? true : I.min;
  });
  t('Fehldrucke über dem Ausschuss kosten extra', () => {
    const S = clone(S1), J = exampleJob(S); const R = calc(J, S, false);
    J.ist.fehldrucke = 2; const I0 = istValues(J, S, R);   // eingeplant sind 2 (1 Shirt + 1 Hoodie)
    J.ist.fehldrucke = 5; const I1 = istValues(J, S, R);
    return I0.dFehl === 0 && I1.dFehl > 0 ? true : I0.dFehl + ' / ' + I1.dFehl;
  });
  t('Fester Folienbetrag (Sammelbestellung) in der Nachkalkulation', () => {
    const S = clone(S1), J = exampleJob(S); const R = calc(J, S, false);
    J.ist.folieKosten = 100;
    const I = istValues(J, S, R);
    return near(I.filmIst, 100) && I.profit > R.profit ? true : I.filmIst;
  });
  return out;
}
