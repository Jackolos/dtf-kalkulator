// Dokumente als PDF (mit jsPDF). Kunden werden gesiezt. Aufbau grob nach DIN 5008
// (Absenderzeile, Anschriftfeld, Infoblock rechts, Fußzeile mit Firmenangaben).
//
// Bausteine für weitere Dokumente (z. B. in anderen Dateien):
//   const F = pdfFrame(titel, J, S, {info, anschrift});   Kopf, Anschrift, Infoblock, Betreff → F.y
//   pdfIntro(F, text)                                      Anrede + Einleitung
//   pdfLines(F, lines, priced)                             Positionstabelle (lines wie in calc())
//   pdfTotals(F, rows, schlussLabel, schlussWert)          Summenblock
//   pdfNotes(F, notes, gruss)                              Hinweise + Grußformel
//   F.finish()                                             Fußzeilen und Seitenzahlen, gibt doc zurück
// Neue Dokumentarten: DOC_BUILDERS[kind] = (J, R, S, nr, extra) => doc
// Zusätzliche Seiten an bestehende Dokumente: PDF_EXTRA_PAGES.push((F, kind, J, R, S, extra) => {...})

const DOC_BUILDERS = {};
const PDF_EXTRA_PAGES = [];

// jsPDF-Standardschriften kennen nicht alle Zeichen: ersetzen
function pdfTxt(s) { return String(s || '').replace(/−/g, '-').replace(/[“„”]/g, '"').replace(/[‚‘’]/g, "'").replace(/ /g, ' ').replace(/…/g, '...'); }

// Pflichtangaben prüfen, bevor eine Rechnung erstellt wird (§ 14 UStG)
function docMissing(kind, J, S) {
  const miss = [];
  if (!S.fName) miss.push('Firmenname (Einstellungen → Firma)');
  if (!S.fAdresse) miss.push('Firmenadresse');
  if (kind === 'rechnung' || kind === 'anzahlung' || kind === 'storno') {
    if (!S.fSteuerNr && !S.fUstId) miss.push('Steuernummer oder USt-IdNr.');
    if (!J.kunde) miss.push('Name des Kunden');
    if (!J.adresse) miss.push('Adresse des Kunden');
    if (!S.fBank) miss.push('Bankverbindung');
  }
  return miss;
}

// ---------- Rahmen: Kopf, Anschrift, Infoblock, Fußzeile ----------
function pdfFrame(title, J, S, opts) {
  opts = opts || {};
  const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
  const F = { doc, L: 20, Rr: 190, W: 170, y: 0, onNewPage: null };
  const { L, Rr, W } = F;
  F.setF = (style, size, gray) => { doc.setFont('helvetica', style || 'normal'); doc.setFontSize(size || 9.5); doc.setTextColor(gray === undefined ? 0 : gray); };
  const setF = F.setF;
  F.footer = () => {
    setF('normal', 7, 110);
    doc.setDrawColor(210); doc.line(L, 277, Rr, 277);
    const c1 = [S.fName, S.fInhaber ? 'Inhaber: ' + S.fInhaber : ''].concat((S.fAdresse || '').split('\n')).filter(Boolean);
    const c2 = (S.fKontakt || '').split(/\n|·|\|/).map(s => s.trim()).filter(Boolean);
    const c3 = [S.fSteuerNr ? 'Steuernr.: ' + S.fSteuerNr : '', S.fUstId ? 'USt-IdNr.: ' + S.fUstId : ''].concat((S.fBank || '').split('\n')).filter(Boolean);
    [[c1, L], [c2, L + 60], [c3, L + 118]].forEach(([lines, x]) => lines.slice(0, 4).forEach((t, i) => doc.text(pdfTxt(t).slice(0, 60), x, 281 + i * 3.2)));
    if (S.fFuss) doc.text(doc.splitTextToSize(pdfTxt(S.fFuss).replace(/\n/g, '  ·  '), W)[0], L, 294);
    setF();
  };
  F.newPage = () => { doc.addPage(); F.y = 22; };
  F.need = mm => { if (F.y + mm > 270) { F.newPage(); if (F.onNewPage) F.onNewPage(); } };
  F.text = (t, x, opt) => doc.text(pdfTxt(t), x === undefined ? L : x, F.y, opt);
  F.para = (t, lh) => { doc.splitTextToSize(pdfTxt(t), W).forEach(l => { F.need(5); doc.text(l, L, F.y); F.y += lh || 4.8; }); };
  F.finish = () => {
    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p); F.footer();
      if (pages > 1) { setF('normal', 7.5, 120); doc.text('Seite ' + p + ' von ' + pages, Rr, 12, { align: 'right' }); }
    }
    return doc;
  };

  // Logo oder Firmenname, Titel
  if (S.fLogo) {
    try {
      const ratio = n(S.fLogoRatio) || 0.4, w = Math.min(50, 18 / ratio), hh = w * ratio;
      doc.addImage(S.fLogo, /^data:image\/png/.test(S.fLogo) ? 'PNG' : 'JPEG', L, 12, w, hh);
    } catch (e) { setF('bold', 15); doc.text(pdfTxt(S.fName || 'Dein Firmenname'), L, 22); }
  } else { setF('bold', 15); doc.text(pdfTxt(S.fName || 'Dein Firmenname'), L, 22); }
  setF('bold', 20); doc.text(pdfTxt(title), Rr, 22, { align: 'right' });

  // Absenderzeile
  setF('normal', 7, 110);
  const sender = pdfTxt([S.fName].concat((S.fAdresse || '').split('\n')).filter(Boolean).join(' · ')).slice(0, 95);
  doc.text(sender, L, 47);
  doc.setDrawColor(170); doc.line(L, 48, L + Math.min(85, doc.getTextWidth(sender)), 48);

  // Anschrift
  setF('normal', 10);
  let rc = [];
  if (opts.anschrift !== false) {
    if (J.kunde) rc.push(J.kunde);
    if (J.kontakt && opts.kontakt !== false) rc.push(J.kontakt.split(',')[0]);
    if (J.adresse) rc = rc.concat(J.adresse.split('\n'));
  }
  rc = rc.slice(0, 7);
  rc.forEach((l, i) => doc.text(pdfTxt(l), L, 54 + i * 5));

  // Infoblock rechts
  const info = (opts.info || []).filter(r => r && !isBlank(r[1]));
  info.forEach((r, i) => { setF('normal', 8.5, 90); doc.text(pdfTxt(r[0]), 128, 54 + i * 4.6); setF('normal', 8.5); doc.text(pdfTxt(r[1]), Rr, 54 + i * 4.6, { align: 'right' }); });

  F.y = Math.max(54 + rc.length * 5, 54 + info.length * 4.6) + 12;
  setF('bold', 12); doc.text(pdfTxt(opts.betreff || J.name || title), L, F.y); F.y += 8;
  setF();
  return F;
}

function pdfIntro(F, text) {
  F.setF('normal', 9.5);
  F.text('Sehr geehrte Damen und Herren,'); F.y += 5;
  F.para(text, 4.6);
  F.y += 4;
}

// Positionstabelle. priced = mit Preisen. startNr = erste Positionsnummer.
function pdfLines(F, lines, priced, startNr) {
  const { doc, L, Rr, setF } = F;
  const head = () => {
    setF('bold', 8.5, 90);
    doc.text('Pos.', L, F.y); doc.text('Beschreibung', L + 11, F.y);
    if (priced) { doc.text('Menge', 140, F.y, { align: 'right' }); doc.text('Einzelpreis', 165, F.y, { align: 'right' }); doc.text('Gesamt', Rr, F.y, { align: 'right' }); }
    else doc.text('Menge', Rr, F.y, { align: 'right' });
    F.y += 2; doc.setDrawColor(180); doc.line(L, F.y, Rr, F.y); F.y += 5; setF();
  };
  F.need(14); head();
  F.onNewPage = head;
  lines.forEach((l, i) => {
    const desc = [];
    if (l.sizes) desc.push((l.typ === 'textil' ? 'Größen: ' : '') + l.sizes);
    if (l.druck) desc.push((l.typ === 'textil' ? 'Druck: ' : '') + l.druck);
    const dl = doc.splitTextToSize(pdfTxt(desc.join('\n')), priced ? 100 : 140);
    F.need(5 + dl.length * 4.2 + 3);
    setF('bold', 9.5);
    doc.text(String((startNr || 1) + i), L, F.y);
    doc.text(doc.splitTextToSize(pdfTxt(l.title), priced ? 100 : 140)[0], L + 11, F.y);
    setF();
    const menge = N2.format(l.count).replace(/,00$/, '') + ' ' + l.einheit;
    if (priced) { doc.text(pdfTxt(menge), 140, F.y, { align: 'right' }); doc.text(pdfTxt(eur(l.unit)), 165, F.y, { align: 'right' }); doc.text(pdfTxt(eur(l.total)), Rr, F.y, { align: 'right' }); }
    else doc.text(pdfTxt(menge), Rr, F.y, { align: 'right' });
    F.y += 4.6; setF('normal', 8.5, 90);
    dl.forEach(t => { doc.text(t, L + 11, F.y); F.y += 4.2; });
    setF(); F.y += 2.5; doc.setDrawColor(225); doc.line(L, F.y - 1.5, Rr, F.y - 1.5); F.y += 2;
  });
  F.onNewPage = null;
}

// Summenblock. rows: [[label, betrag (Zahl), fett?]], danach Schlusszeile mit Strich
function pdfTotals(F, rows, endLabel, endValue) {
  const { doc, Rr, setF } = F;
  F.need(12 + rows.length * 5.2);
  F.y += 2;
  rows.forEach(([label, val, bold]) => {
    setF(bold ? 'bold' : 'normal', 9.5);
    doc.text(pdfTxt(label), 165, F.y, { align: 'right' });
    doc.text(pdfTxt(typeof val === 'number' ? eur(val) : val), Rr, F.y, { align: 'right' });
    F.y += 5.2;
  });
  doc.setDrawColor(0); doc.line(115, F.y - 3.2, Rr, F.y - 3.2); F.y += 1;
  setF('bold', 11); doc.text(pdfTxt(endLabel), 165, F.y, { align: 'right' }); doc.text(pdfTxt(eur(endValue)), Rr, F.y, { align: 'right' }); F.y += 9;
  setF();
}
// Standard-Summenzeilen eines Rechenergebnisses (ohne Schlusszeile)
function totalRows(R, J) {
  const rows = [];
  const extra = R.rabattAmt > 0 || R.pausch > 0 || R.expressAmt > 0 || R.versandVK > 0 || R.minder > 0;
  if (extra) rows.push(['Summe Positionen', R.posSum]);
  if (R.rabattAmt > 0) rows.push(['abzgl. Rabatt ' + pct(R.z.rb * 100), -R.rabattAmt]);
  if (R.pausch > 0) rows.push(['Einrichtung und Datenaufbereitung', R.pausch]);
  if (R.expressAmt > 0) rows.push(['Expresszuschlag ' + pct(R.z.express * 100), R.expressAmt]);
  if (R.versandVK > 0) rows.push(['Versand (' + n(J.pakete) + ' Paket' + (n(J.pakete) > 1 ? 'e' : '') + ')', R.versandVK]);
  if (R.minder > 0) rows.push(['Mindermengenzuschlag', R.minder]);
  rows.push(['Gesamt netto', R.net, true]);
  if (R.z.mwst > 0) rows.push(['zzgl. ' + pct(R.z.mwst * 100) + ' USt.', R.mwstAmt]);
  return rows;
}

function pdfNotes(F, notes, S, gruss) {
  F.setF('normal', 9.5);
  notes.forEach(t => F.para(t));
  if (gruss !== false && S.fName) { F.y += 4; F.need(10); F.text('Mit freundlichen Grüßen'); F.y += 5; F.text(S.fInhaber || S.fName); }
}

// Standard-Infoblock je Dokumentart
function docInfo(kind, J, S, nr) {
  const title = DOCS[kind].l;
  const datum = kind === 'rechnung' ? (J.reDatum || todayIso()) : kind === 'angebot' ? (J.datum || todayIso()) : todayIso();
  const info = [[title + ' Nr.', nr], ['Datum', fmtDate(datum)], ['Kunden-Nr.', J.kundeNr]];
  if (kind === 'angebot') info.push(['Gültig bis', fmtDate(addDays(J.datum, n(S.gueltigTage)))]);
  if (['ab', 'rechnung', 'lieferschein'].includes(kind)) info.push(['Ihr Angebot', J.angebotNr]);
  if (kind === 'rechnung' || kind === 'lieferschein') info.push(['Auftrag', J.abNr]);
  if (kind === 'rechnung') {
    info.push(['Leistungsdatum', fmtDate(J.leistungsDatum || datum)]);
    info.push(['Lieferschein', J.lsNr]);
    info.push(['Ihre USt-IdNr.', J.kundeUstId]);
  }
  if (kind === 'produktion') info.push(['Liefertermin', J.lieferDatum ? fmtDate(J.lieferDatum) : J.liefertermin]);
  return info;
}

// ======================= Standarddokumente =======================
// extra.variants: [{key, name, R}] für Angebote mit Varianten
function buildPdf(kind, J, R, S, nr, extra) {
  extra = extra || {};
  if (DOC_BUILDERS[kind]) return DOC_BUILDERS[kind](J, R, S, nr, extra);
  const priced = kind !== 'lieferschein' && kind !== 'produktion';
  const F = pdfFrame(DOCS[kind].l, J, S, { info: docInfo(kind, J, S, nr), kontakt: kind !== 'produktion' });
  const { doc, L, Rr, W, setF } = F;

  if (kind !== 'produktion') {
    pdfIntro(F, kind === 'angebot' ? S.textAngebot : kind === 'ab' ? S.textAB : kind === 'rechnung' ? S.textRechnung : 'wir liefern Ihnen folgende Waren:');
  }

  if (kind === 'produktion') productionBody();
  else if (kind === 'angebot' && extra.variants && extra.variants.length > 1) {
    // Angebot mit Varianten: jede Variante mit eigener Tabelle und Summe
    F.para('Wir bieten Ihnen ' + extra.variants.length + ' Varianten an. Bitte teilen Sie uns mit, welche Sie wünschen.');
    F.y += 3;
    extra.variants.forEach(v => {
      F.need(30);
      setF('bold', 11); F.text('Variante ' + v.key + (v.name && v.name !== v.key ? ': ' + v.name : '')); F.y += 7; setF();
      pdfLines(F, v.R.lines, true);
      pdfTotals(F, totalRows(v.R, J), 'Gesamtbetrag Variante ' + v.key, v.R.brutto);
    });
    pdfNotes(F, notesFor('angebot', R), S);
  } else {
    pdfLines(F, R.lines, priced);
    if (priced) {
      const rows = totalRows(R, J);
      if (kind === 'rechnung' && J.azNr && n(J.azBetrag) > 0) {
        // Schlussrechnung: Anzahlung abziehen
        pdfTotals(F, rows, 'Gesamtbetrag', R.brutto);
        const az = n(J.azBetrag), azNetto = r2(az / (1 + R.z.mwst));
        pdfTotals(F, [['abzgl. Anzahlung (Rechnung ' + J.azNr + ')', -azNetto], R.z.mwst > 0 ? ['abzgl. darin enthaltene USt.', -(az - azNetto)] : null].filter(Boolean), 'Noch zu zahlen', r2(R.brutto - az));
      } else pdfTotals(F, rows, kind === 'rechnung' ? 'Rechnungsbetrag' : 'Gesamtbetrag', R.brutto);
      pdfNotes(F, notesFor(kind, R), S);
    } else {
      F.y += 10; F.need(30);
      setF('normal', 9.5);
      F.text('Ware vollständig und in einwandfreiem Zustand erhalten:'); F.y += 16;
      doc.setDrawColor(120); doc.line(L, F.y, L + 60, F.y); doc.line(L + 80, F.y, Rr, F.y); F.y += 4;
      setF('normal', 8, 90); F.text('Datum'); F.text('Unterschrift, Name in Druckbuchstaben', L + 80); setF();
    }
  }
  PDF_EXTRA_PAGES.forEach(fn => { try { fn(F, kind, J, R, S, extra); } catch (e) { console.error(e); } });
  return F.finish();

  function notesFor(k, R) {
    const notes = [];
    if (R.z.mwst === 0) notes.push('Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.');
    const termin = J.lieferDatum ? fmtDate(J.lieferDatum) : J.liefertermin;
    if (k === 'angebot') {
      if (termin) notes.push('Lieferzeit: ' + termin + ' nach Freigabe der Druckdaten.');
      if (R.anzahlung > 0) notes.push('Bei Auftragserteilung bitten wir um eine Anzahlung von ' + pct(n(J.anzahlung)) + ' (' + eur(R.anzahlung) + ').');
      if (R.z.sk > 0) notes.push('Bei Zahlung innerhalb von ' + n(S.skontoTage) + ' Tagen gewähren wir ' + pct(R.z.sk * 100) + ' Skonto.');
      notes.push('Dieses Angebot ist gültig bis ' + fmtDate(addDays(J.datum, n(S.gueltigTage))) + '. Farben können je nach Textil leicht vom Bildschirm abweichen.');
    }
    if (k === 'ab') {
      if (termin) notes.push('Voraussichtlicher Liefertermin: ' + termin + '.');
      if (R.anzahlung > 0) notes.push('Bitte überweisen Sie die vereinbarte Anzahlung von ' + eur(R.anzahlung) + '. Die Produktion beginnt nach Zahlungseingang und Freigabe der Druckdaten.');
      notes.push('Zahlungsziel: ' + n(S.zahlungsziel) + ' Tage nach Rechnungsstellung.');
    }
    if (k === 'rechnung') {
      const reD = J.reDatum || todayIso();
      const offen = J.azNr && n(J.azBetrag) > 0 ? r2(R.brutto - n(J.azBetrag)) : R.brutto;
      if (R.z.sk > 0) notes.push('Bei Zahlung bis ' + fmtDate(addDays(reD, n(S.skontoTage))) + ' ziehen Sie bitte ' + pct(R.z.sk * 100) + ' Skonto ab: zu zahlen ' + eur(r2(offen - R.brutto * R.z.sk)) + '.');
      notes.push('Bitte überweisen Sie den Betrag ohne Abzug bis ' + fmtDate(addDays(reD, n(S.zahlungsziel))) + ' unter Angabe der Rechnungsnummer ' + (nr || '') + '.');
      if (S.fBank) notes.push('Bankverbindung: ' + S.fBank.replace(/\n/g, ' · '));
    }
    if (S.textSchluss && k !== 'rechnung') notes.push(S.textSchluss);
    return notes;
  }

  // ---------- Produktionsauftrag (intern) ----------
  function productionBody() {
    setF('normal', 9.5);
    const sum = [
      ['Teile gesamt', String(R.textilQ)], ['Transfers bestellen', String(R.transfers)], ['Pressvorgänge', String(R.pressCount)],
      ['Geplante Zeit', hm(R.minutes)], ['Folie', N2.format(R.meter) + ' m bei ' + (R.anbieter ? R.anbieter.name : '')]
    ];
    sum.forEach((r, i) => { const x = L + (i % 3) * 57, yy = F.y + Math.floor(i / 3) * 10; setF('normal', 7.5, 100); doc.text(pdfTxt(r[0]).toUpperCase(), x, yy); setF('bold', 10); doc.text(pdfTxt(r[1]).slice(0, i === 4 ? 64 : 30), x, yy + 4.5); });
    F.y += 24; setF();
    if (J.prodDatum) { setF('bold', 9.5); F.text('Produktion geplant: ' + fmtDate(J.prodDatum)); F.y += 6; setF(); }
    R.rows.forEach((r, i) => {
      const p = r.p;
      F.need(28);
      doc.setFillColor(242, 244, 248); doc.rect(L, F.y - 4.5, W, 7, 'F');
      setF('bold', 10.5);
      F.text((i + 1) + '. ' + (p.name || POS_TYPES[r.typ].short) + (p.farbe ? ' · ' + p.farbe : '') + '  (' + N2.format(r.q).replace(/,00$/, '') + ' ' + (r.typ === 'leistung' ? (p.einheit || 'Stk.') : r.typ === 'transfer' ? 'Sätze' : 'Stk.') + ')', L + 2);
      setF('normal', 8, 90); F.text(POS_TYPES[r.typ].l, Rr - 2, { align: 'right' });
      F.y += 7; setF();
      if (r.typ === 'textil' && !p.ohneGroessen) {
        const sz = SIZES.filter(s => n(p.groessen[s]) > 0);
        sz.forEach((s, k) => { const x = L + k * 18; doc.setDrawColor(190); doc.rect(x, F.y - 4, 16, 10); setF('normal', 7.5, 100); doc.text(s, x + 8, F.y - 0.6, { align: 'center' }); setF('bold', 10); doc.text(String(n(p.groessen[s])), x + 8, F.y + 4.4, { align: 'center' }); });
        F.y += 12; setF();
      }
      if (r.typ === 'textil' || r.typ === 'transfer') {
        validMotifs(p).forEach(m => {
          F.need(6);
          doc.rect(L + 2, F.y - 3, 3, 3);
          F.text((m.name || 'Motiv') + '  ' + N1.format(n(m.w)) + ' × ' + N1.format(n(m.h)) + ' cm' + (ORTE[m.ort] && m.ort !== 'sonst' ? '  · ' + ORTE[m.ort] : '') + (m.pers ? '  · individuell (Namen/Nummern)' : ''), L + 8);
          F.text(r.np + ' Transfers', Rr, { align: 'right' });
          F.y += 5.2;
        });
      }
      if (r.typ === 'textil') {
        const cat = catById(S, p.catId);
        if (cat) { setF('normal', 8.5, 70); F.text('Presse: ' + cat.temp + ' °C · ' + cat.zeit + ' s · Druck ' + cat.druck + ' · Folie ' + cat.abziehen + ' abziehen' + (cat.artNr ? ' · Art.-Nr. ' + cat.artNr : '') + (cat.lieferant ? ' · ' + cat.lieferant : ''), L + 2); F.y += 5; setF(); }
        if (n(p.ek) > 0 || p.catId) { setF('normal', 8.5, 70); F.text('Textil bestellen: ' + Math.ceil(r.q * (1 + n(S.ausschuss) / 100) - 1e-9) + ' Stück inkl. Reserve', L + 2); F.y += 5; setF(); }
      }
      if (r.typ === 'leistung' && p.beschreibung) { doc.splitTextToSize(pdfTxt(p.beschreibung), W - 4).forEach(t => { F.need(5); doc.text(t, L + 2, F.y); F.y += 4.6; }); }
      F.y += 3;
    });
    F.need(30);
    F.y += 3; setF('bold', 10); F.text('Ablauf'); F.y += 6; setF();
    ['Druckfreigabe vom Kunden liegt vor', 'Textilien vollständig und in richtiger Farbe/Größe', 'Transfers geprüft (Anzahl, Größe, keine Fehldrucke)', 'Probedruck auf Reststück', 'Alle Teile gepresst', 'Endkontrolle und Verpackung'].forEach(t => {
      F.need(6); doc.rect(L + 2, F.y - 3, 3, 3); F.text(t, L + 8); F.y += 5.6;
    });
    if (J.notiz) { F.y += 3; F.need(12); setF('bold', 10); F.text('Notiz'); F.y += 5; setF(); F.para(J.notiz, 4.6); }
  }
}
