// Dateien lesen und schreiben: echte Gang Sheets messen, Projekte aus dem Gang-Sheet-Konfigurator,
// Infoblätter (mit Claude), Excel-Vorlage und CSV-Export.

// ---------- Gang Sheets messen ----------
// PNG: Breite in cm aus dem pHYs-Block (Pixel pro Meter)
function pngInfo(buf) {
  const b = new Uint8Array(buf), dv = new DataView(buf);
  if (b.length < 24 || b[0] !== 137 || b[1] !== 80) return null;
  const info = { w: dv.getUint32(16), h: dv.getUint32(20), ppm: null };
  let p = 8;
  while (p + 8 <= b.length) {
    const len = dv.getUint32(p), type = String.fromCharCode(b[p + 4], b[p + 5], b[p + 6], b[p + 7]);
    if (type === 'pHYs' && len >= 9) { const ppu = dv.getUint32(p + 8), unit = b[p + 16]; if (unit === 1 && ppu > 0) info.ppm = ppu; }
    if (type === 'IDAT' || type === 'IEND') break;
    p += 12 + len;
  }
  return info;
}
// Anteil der bedruckten (nicht durchsichtigen) Pixel
function coverageOf(source, sw, sh) {
  const scale = Math.min(1, Math.sqrt(6e6 / (sw * sh)), 16000 / sh, 16000 / sw);
  const cw = Math.max(1, Math.round(sw * scale)), ch = Math.max(1, Math.round(sh * scale));
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  const c = cv.getContext('2d', { willReadFrequently: true }); c.clearRect(0, 0, cw, ch); c.drawImage(source, 0, 0, cw, ch);
  const data = c.getImageData(0, 0, cw, ch).data; let cnt = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 24) cnt++;
  return cnt / (cw * ch);
}
function analyzeImage(file, fallbackW) {
  return file.arrayBuffer().then(buf => {
    const pi = /png$/i.test(file.name) || file.type === 'image/png' ? pngInfo(buf) : null;
    const url = URL.createObjectURL(file);
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth, hh = img.naturalHeight; let cov = null, note = '';
        try { cov = coverageOf(img, w, hh); } catch (e) { note = 'Datei zu groß zum Messen der Fläche.'; }
        URL.revokeObjectURL(url);
        const widthCm = pi && pi.ppm ? w / pi.ppm * 100 : fallbackW;
        if (!(pi && pi.ppm)) note = (note ? note + ' ' : '') + 'Breite angenommen, bitte prüfen.';
        if (cov !== null && cov > 0.995) note = (note ? note + ' ' : '') + 'Kein transparenter Hintergrund erkannt.';
        res({ id: uid(), name: file.name, pxW: w, pxH: hh, widthCm, lengthCm: hh / w * widthCm, coverage: cov, note });
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Bild konnte nicht gelesen werden')); };
      img.src = url;
    });
  });
}
function loadPdfJs() {
  return loadScript(LIB.pdfworker).then(() => loadScript(LIB.pdfjs)).then(() => {
    const lib = window.pdfjsLib; if (lib && lib.GlobalWorkerOptions) lib.GlobalWorkerOptions.workerSrc = LIB.pdfworker; return lib;
  });
}
function analyzePdf(file, rollW) {
  return Promise.all([loadPdfJs(), file.arrayBuffer()])
    .then(r => r[0].getDocument({ data: new Uint8Array(r[1]) }).promise)
    .then(pdf => pdf.getPage(1))
    .then(page => {
      const vp = page.getViewport({ scale: 1 }), wCm = vp.width / 72 * 2.54, hCm = vp.height / 72 * 2.54;
      const rot = wCm > hCm && wCm > rollW * 1.5;   // Querformat deutlich breiter als die Rolle: gedreht
      let sc = Math.min(1600 / vp.width, 20000 / Math.max(vp.width, vp.height), 4);
      sc = Math.min(sc, Math.sqrt(6e6 / (vp.width * vp.height)));
      const v2 = page.getViewport({ scale: sc });
      const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.floor(v2.width)); cv.height = Math.max(1, Math.floor(v2.height));
      const c = cv.getContext('2d', { willReadFrequently: true });
      return page.render({ canvasContext: c, viewport: v2, background: 'rgba(0,0,0,0)' }).promise.then(() => {
        const data = c.getImageData(0, 0, cv.width, cv.height).data; let cnt = 0;
        for (let i = 3; i < data.length; i += 4) if (data[i] > 24) cnt++;
        const cov = cnt / (cv.width * cv.height);
        const widthCm = rot ? hCm : wCm, lengthCm = rot ? wCm : hCm;
        return { id: uid(), name: file.name, pxW: widthCm, pxH: lengthCm, widthCm, lengthCm, coverage: cov, note: cov > 0.995 ? 'Kein transparenter Hintergrund erkannt.' : '' };
      });
    });
}

// ---------- Projekt aus dem Gang-Sheet-Konfigurator ----------
// Liest die .json-Datei des Konfigurators: Motive mit Größe und Stückzahl, Blattgröße und (falls von Hand angeordnet) die Blätter.
function readGangSheetProject(file) {
  return file.text().then(t => {
    let data;
    try { data = JSON.parse(t); } catch (e) { throw new Error('Keine gültige JSON-Datei.'); }
    if (!data || data.app !== 'gang-sheet-konfigurator' || !Array.isArray(data.items)) throw new Error('Das ist keine Projektdatei vom Gang-Sheet-Konfigurator.');
    const st = data.settings || {};
    return Promise.all(data.items.map(it => new Promise(res => {
      const img = new Image();
      img.onload = () => {
        const r = img.naturalHeight / img.naturalWidth, cm = n(it.cm);
        let w = cm, hh = cm * r;
        if (it.sizeRef === 'h') { hh = cm; w = cm / r; }
        else if (it.sizeRef === 'max' && r > 1) { hh = cm; w = cm / r; }
        res({ name: String(it.name || 'Motiv').replace(/\.(png|jpe?g|webp)$/i, ''), w: r2(w), h: r2(hh), qty: Math.max(1, Math.round(n(it.qty) || 1)) });
      };
      img.onerror = () => res({ name: String(it.name || 'Motiv'), w: n(it.cm), h: n(it.cm), qty: Math.max(1, Math.round(n(it.qty) || 1)), guess: true });
      img.src = it.image;
    }))).then(motifs => ({
      motifs, sheetW: n(st.sheetWCm), sheetH: n(st.sheetHCm),
      sheets: data.manual && Array.isArray(data.sheets) ? data.sheets.length : 0
    }));
  });
}

// ---------- Infoblatt einlesen (Claude) ----------
function fileToContent(f) {
  const name = f.name.toLowerCase();
  if (/\.(xlsx|xls|csv)$/.test(name)) {
    return Promise.all([loadScript(LIB.xlsx), f.arrayBuffer()]).then(r => {
      const wb = window.XLSX.read(r[1], { type: 'array' });
      return { text: wb.SheetNames.map(sn => 'Tabelle „' + sn + '“:\n' + window.XLSX.utils.sheet_to_csv(wb.Sheets[sn], { FS: ' ; ', blankrows: false })).join('\n\n').slice(0, 60000), images: [] };
    });
  }
  if (/\.pdf$/.test(name)) {
    return Promise.all([loadPdfJs(), f.arrayBuffer()]).then(r => r[0].getDocument({ data: new Uint8Array(r[1]) }).promise).then(pdf => {
      const pages = [];
      for (let i = 1; i <= Math.min(pdf.numPages, 4); i++) pages.push(pdf.getPage(i));
      return Promise.all(pages).then(ps => Promise.all(ps.map(p => p.getTextContent())).then(tcs => {
        const out = tcs.map(tc => tc.items.map(it => it.str).join(' ')).join('\n\n');
        if (out.replace(/\s/g, '').length > 80) return { text: out.slice(0, 60000), images: [] };
        // gescannt: Seiten als Bilder
        return Promise.all(ps.slice(0, 2).map(p => {
          const vp = p.getViewport({ scale: 1 }), sc = Math.min(2, 1600 / Math.max(vp.width, vp.height)), v2 = p.getViewport({ scale: sc });
          const cv = document.createElement('canvas'); cv.width = Math.floor(v2.width); cv.height = Math.floor(v2.height);
          const c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height);
          return p.render({ canvasContext: c, viewport: v2 }).promise.then(() => new Promise(res => cv.toBlob(res, 'image/png')));
        })).then(imgs => ({ text: '', images: imgs }));
      }));
    });
  }
  if (/^image\//.test(f.type)) return Promise.resolve({ text: '', images: [f] });
  return f.text().then(t => ({ text: t.slice(0, 60000), images: [] }));
}

function buildPrompt(S, text, hasImages) {
  const cat = S.artikel.map(a => '- ' + a.name + (a.groessen ? '' : ' (ohne Größen)')).join('\n');
  const pre = S.druckstellen.map(p => p.name + ' ' + p.w + '×' + p.h + ' cm').join(', ');
  return 'Du liest eine Auftragsanfrage für eine Textildruckerei (DTF-Transferdruck) aus und überträgst sie in ein festes Datenformat.\n\n' +
    'Heute ist ' + todayIso() + '.\n\n' +
    'Textil-Katalog der Druckerei (ordne Artikel möglichst einem dieser Namen zu, sonst übernimm die Bezeichnung aus der Anfrage):\n' + cat + '\n\n' +
    'Übliche Druckstellen mit Maßen: ' + pre + '.\n\n' +
    'Regeln:\n- Maße immer in cm (mm und Zoll umrechnen). Breite = waagerecht, Höhe = senkrecht.\n- Fehlen Maße einer Druckstelle, nimm die passende übliche Druckstelle und schreib das in "hinweise".\n- Größen als Anzahl je Größe aus XS, S, M, L, XL, XXL, 3XL, 4XL, 5XL (2XL = XXL). Gibt es keine Größenaufteilung, setz "groessen" auf null und trag die Gesamtmenge in "menge" ein.\n- Jede Kombination aus Artikel und Farbe ist eine eigene Position.\n- Werden nur Transfers bestellt (Kunde presst selbst), setz "typ" auf "transfer", sonst "textil".\n- Namen oder Nummern, die auf jedem Teil anders sind, als Druckstelle mit "individuell": true.\n- "dunkel" ist true bei dunklen Textilfarben (z. B. Schwarz, Navy, Dunkelgrau, Bordeaux, Flaschengrün).\n- Alles Unklare oder Fehlende kurz in "hinweise" auflisten. Nichts erfinden.\n\n' +
    'Antworte nur mit JSON in genau diesem Aufbau:\n' +
    '{"name":"kurzer Auftragsname","kunde":"","kontakt":"","adresse":"","liefertermin":"","notiz":"","pakete":null,"positionen":[{"typ":"textil","artikel":"T-Shirt","farbe":"Schwarz","dunkel":true,"groessen":{"S":5,"M":10},"menge":15,"motive":[{"name":"Brust links","w":10,"h":10,"individuell":false}]}],"hinweise":["…"]}' +
    '\n\n' + (hasImages ? 'Die Anfrage steht in den angehängten Bildern' + (text ? ' und im folgenden Text' : '') + '.\n\n' : '') + (text ? 'Anfrage:\n"""\n' + text + '\n"""' : '');
}

function jobFromImport(S, res) {
  const j = blankJob(S);
  j.name = String(res.name || 'Neuer Auftrag').slice(0, 100);
  ['kunde', 'kontakt', 'adresse', 'liefertermin', 'notiz'].forEach(k => { if (res[k]) j[k] = String(res[k]).slice(0, 300); });
  if (res.pakete !== null && res.pakete !== undefined && isFinite(res.pakete)) j.pakete = Math.max(0, Math.round(n(res.pakete)));
  const hints = Array.isArray(res.hinweise) ? res.hinweise.map(String).slice(0, 12) : [];
  j.positionen = [];
  (Array.isArray(res.positionen) ? res.positionen : []).forEach(rp => {
    const motive = (Array.isArray(rp.motive) ? rp.motive : []).map(m => ({ id: uid(), name: String(m.name || 'Druckstelle').slice(0, 60), w: n(m.w), h: n(m.h), pers: !!m.individuell }));
    if (rp.typ === 'transfer') {
      const p = newPosition(S, null, 'transfer');
      p.name = String(rp.artikel || 'DTF-Transfers'); p.menge = Math.max(0, Math.round(n(rp.menge))); p.motive = motive;
      j.positionen.push(p); return;
    }
    const name = String(rp.artikel || 'Artikel'), low = name.toLowerCase();
    const c = S.artikel.find(a => a.name.toLowerCase() === low) || S.artikel.find(a => { const an = a.name.toLowerCase(); return an.indexOf(low) >= 0 || low.indexOf(an.split(' ')[0]) >= 0; }) || null;
    const p = newPosition(S, c || { name, ekHell: 0, ekDunkel: 0, aufXXL: 0, auf3XL: 0, groessen: true, id: null });
    if (!c) { p.catId = null; p.name = name; hints.push('„' + name + '“ ist nicht im Katalog. Einkaufspreis bitte eintragen.'); }
    p.farbe = String(rp.farbe || '').slice(0, 40); p.dunkel = !!rp.dunkel;
    if (c) p.ek = n(p.dunkel ? c.ekDunkel : c.ekHell);
    const g = rp.groessen && typeof rp.groessen === 'object' ? rp.groessen : null; let any = false;
    if (g) Object.keys(g).forEach(k => {
      const key = String(k).toUpperCase().replace('2XL', 'XXL').replace('XXXL', '3XL');
      if (SIZES.includes(key)) { p.groessen[key] = Math.max(0, Math.round(n(g[k]))); if (p.groessen[key]) any = true; }
    });
    if (any && (!c || c.groessen)) p.ohneGroessen = false;
    else { p.ohneGroessen = true; p.menge = Math.max(0, Math.round(n(rp.menge))) || SIZES.reduce((s, k) => s + n(p.groessen[k]), 0); }
    p.motive = motive;
    j.positionen.push(p);
  });
  if (!j.positionen.length) { j.positionen = [newPosition(S)]; hints.push('Es wurden keine Artikel erkannt.'); }
  return { job: j, hints };
}

function downloadTemplate() {
  return loadScript(LIB.xlsx).then(() => {
    const X = window.XLSX;
    const head = ['Artikel', 'Farbe'].concat(SIZES).concat(['Menge ohne Größen', 'Druckstelle 1', 'Breite cm', 'Höhe cm', 'Druckstelle 2', 'Breite cm', 'Höhe cm', 'Druckstelle 3', 'Breite cm', 'Höhe cm', 'Namen/Nummern?']);
    const aoa = [['Auftragsblatt Textildruck'], [], ['Kunde / Firma', ''], ['Ansprechpartner', ''], ['Telefon / E-Mail', ''], ['Lieferadresse', ''], ['Auftragsname', ''], ['Wunschtermin', ''], ['Versand oder Abholung', ''], ['Hinweise', ''], [], head];
    for (let i = 0; i < 12; i++) aoa.push([]);
    aoa.push([]); aoa.push(['Beispiel (bitte nicht ausfüllen):']);
    aoa.push(['T-Shirt', 'Schwarz', '', 5, 10, 10, 5, 2, '', '', '', '', 'Brust links', 10, 10, 'Rücken groß', 30, 40, '', '', '', 'nein']);
    const ws = X.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 22 }, { wch: 14 }].concat(SIZES.map(() => ({ wch: 5 }))).concat([{ wch: 10 }, { wch: 16 }, { wch: 9 }, { wch: 9 }, { wch: 16 }, { wch: 9 }, { wch: 9 }, { wch: 16 }, { wch: 9 }, { wch: 9 }, { wch: 14 }]);
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }].concat([2, 3, 4, 5, 6, 7, 8, 9].map(r => ({ s: { r, c: 1 }, e: { r, c: 10 } })));
    const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 'Auftrag');
    return saveFile('Auftragsblatt_Vorlage.xlsx', X.write(wb, { bookType: 'xlsx', type: 'array' }));
  });
}

// ---------- CSV-Export der Aufträge (für Buchhaltung / Excel) ----------
function jobsCsv(jobs) {
  const head = ['Auftrag', 'Kunde', 'Kunden-Nr.', 'Status', 'Datum', 'Angebot', 'Auftragsbestätigung', 'Rechnung', 'Rechnungsdatum', 'Bezahlt am', 'Teile', 'Netto', 'Brutto', 'Gewinn geplant'];
  const esc = v => { const s = String(v === null || v === undefined ? '' : v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const num = v => N2.format(n(v));
  const rows = jobs.slice().sort((a, b) => (a.data.datum || '').localeCompare(b.data.datum || '')).map(j => {
    const d = j.data;
    return [d.name, d.kunde, d.kundeNr, (STATUS[d.status] || STATUS.angebot).l, fmtDate(d.datum), d.angebotNr, d.abNr, d.reNr, fmtDate(d.reDatum), fmtDate(d.bezahltAm), d.teile || 0, num(d.angebotNetto), num(d.angebotBrutto), num(d.gewinnEuro)].map(esc).join(';');
  });
  return '﻿' + [head.join(';')].concat(rows).join('\r\n');   // BOM, damit Excel die Umlaute richtig liest
}
