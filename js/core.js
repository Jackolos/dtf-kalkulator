// Grundlagen: Konstanten, Standardwerte, Hilfsfunktionen und das Umbauen alter Daten (Migration).
// Diese Datei rechnet nichts und greift nicht auf die Seite zu (außer h(), das Elemente baut).

const APP_VERSION = '2.0';
const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL'];

// Auftragsstatus in der Reihenfolge, in der ein Auftrag sie durchläuft
const STATUS = {
  angebot:    { l: 'Angebot',       c: '--acc' },
  auftrag:    { l: 'Bestätigt',     c: '--p3' },
  produktion: { l: 'In Produktion', c: '--p2' },
  geliefert:  { l: 'Geliefert',     c: '--p1' },
  berechnet:  { l: 'Berechnet',     c: '--p4' },
  bezahlt:    { l: 'Bezahlt',       c: '--info' },
  abgelehnt:  { l: 'Abgelehnt',     c: '--mut' }
};
// Diese Status zählen als Umsatz (Kunde hat zugesagt)
const WON = ['auftrag', 'produktion', 'geliefert', 'berechnet', 'bezahlt'];

const POS_TYPES = {
  textil:   { l: 'Textil + Druck', short: 'Textil' },
  transfer: { l: 'Nur Transfers',  short: 'Transfers' },
  leistung: { l: 'Leistung / Sonstiges', short: 'Leistung' }
};
const PCOL = ['--p1', '--p2', '--p3', '--p4', '--p5', '--p6'];

// Dokumentarten mit Nummernkreis (cnt = welcher Zähler)
const DOCS = {
  angebot:     { l: 'Angebot',             key: 'angebotNr', pre: 'praefixAN', cnt: 'an' },
  ab:          { l: 'Auftragsbestätigung', key: 'abNr',      pre: 'praefixAB', cnt: 'ab' },
  freigabe:    { l: 'Druckfreigabe',       key: null,        pre: null },
  produktion:  { l: 'Produktionsauftrag',  key: null,        pre: null },
  lieferschein:{ l: 'Lieferschein',        key: 'lsNr',      pre: 'praefixLS', cnt: 'ls' },
  anzahlung:   { l: 'Anzahlungsrechnung',  key: 'azNr',      pre: 'praefixRE', cnt: 're' },
  rechnung:    { l: 'Rechnung',            key: 'reNr',      pre: 'praefixRE', cnt: 're' },
  storno:      { l: 'Stornorechnung',      key: null,        pre: 'praefixRE', cnt: 're' },
  mahnung:     { l: 'Zahlungserinnerung',  key: null,        pre: null }
};

// Wo eine Druckstelle sitzt (für Mockup und Druckfreigabe). Brust links = links vom Träger aus gesehen.
const ORTE = {
  brustL: 'Brust links', brustR: 'Brust rechts', brustM: 'Brust Mitte', front: 'Front', bauch: 'Bauch / Tasche',
  ruecken: 'Rücken', nacken: 'Nacken', aermelL: 'Ärmel links', aermelR: 'Ärmel rechts', sonst: 'Sonstige'
};
function guessOrt(name) {
  const s = String(name || '').toLowerCase();
  if (/nacken|neck/.test(s)) return 'nacken';
  if (/rücken|ruecken|back|hinten/.test(s)) return 'ruecken';
  if (/ärmel|aermel|arm/.test(s)) return /recht/.test(s) ? 'aermelR' : 'aermelL';
  if (/brust|herz|chest|logo vorn/.test(s)) return /recht/.test(s) ? 'brustR' : /mitte/.test(s) ? 'brustM' : 'brustL';
  if (/bauch|tasche/.test(s)) return 'bauch';
  if (/front|vorn|vorne/.test(s)) return 'front';
  if (/name|nummer/.test(s)) return 'ruecken';
  return 'front';
}
const isBack = ort => ort === 'ruecken' || ort === 'nacken';

// Externe Bibliotheken, werden erst bei Bedarf geladen
const LIB = {
  jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  pdfjs: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  pdfworker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  xlsx: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
};

// ---------- Andockstellen für Zusatzmodule ----------
// Module (js/mockup.js, finanzen.js, produktion.js, verkauf.js) tragen hier beim Laden ihre Funktionen ein.
// app.js ruft sie an den passenden Stellen auf. So muss kein Modul app.js verändern.
const HOOKS = {
  motifExtras: [],   // fn(p, m) → Element oder null: unter jeder Druckstellen-Zeile im Auftrag
  posExtras: [],     // fn(p) → Element oder null: am Ende jeder Position
  views: {},         // 'produktion' | 'verkauf' → fn(): rendert die Ansicht in #view-<name>
  docPrepare: {},    // kind → fn(job, R) → Promise: false = abbrechen, Objekt = wird in extra übernommen
  docExtras: [],     // fn(kind, job, R) → Promise<Objekt|null>, für alle Dokumente (z. B. Mockup-Bilder)
  docAfter: {},      // kind → fn(job, nr): nachdem das PDF gespeichert wurde
  listRender: [],    // fn(): nach dem Rendern der Auftragsliste (Ansicht „Aufträge“)
  jobRender: [],     // fn(): nachdem ein Auftrag komplett neu angezeigt wurde
  resultsRender: []  // fn(R): nach jeder Neuberechnung des offenen Auftrags
};

// ---------- Standard-Einstellungen (Beispielwerte) ----------
function DEFAULTS() {
  return {
    v: 2,
    // Firma (steht auf allen Dokumenten)
    fName: '', fInhaber: '', fAdresse: '', fKontakt: '', fSteuerNr: '', fUstId: '', fBank: '', fFuss: '',
    fLogo: '', fLogoRatio: 0,
    // Dokumente
    praefixAN: 'AN', praefixAB: 'AB', praefixLS: 'LS', praefixRE: 'RE',
    gueltigTage: 14, zahlungsziel: 14, skontoTage: 7,
    textAngebot: 'vielen Dank für Ihre Anfrage. Gerne bieten wir Ihnen folgende Leistungen an:',
    textAB: 'vielen Dank für Ihren Auftrag. Hiermit bestätigen wir Ihnen folgende Leistungen:',
    textRechnung: 'für unsere Leistungen erlauben wir uns, Ihnen folgenden Betrag in Rechnung zu stellen:',
    textSchluss: 'Wir freuen uns auf die Zusammenarbeit.',
    // Folie: Anbieter mit Preisstaffel
    anbieter: [{
      id: 'an1', name: 'DTF-Anbieter (Beispielpreise)', modell: 'meter', breite: 56,
      staffel: [{ id: 'st1', ab: 0, preis: 12 }, { id: 'st2', ab: 10, preis: 10.5 }, { id: 'st3', ab: 25, preis: 9.5 }],
      versand: 0, vorlauf: 10, schritt: 0.1, minMeter: 1, tinteM2: 0
    }],
    anbieterId: 'an1',
    abstand: 1, folieZuschlag: 0, sammelMeter: 10, ausschuss: 3,
    // Arbeit
    lohn: 15, lohnNK: 0, ruestMin: 20, pressSek: 45, handlingSek: 30, schneidSek: 10, persSek: 40,
    // Maschinen (Maschinenstundensatz)
    pressen: [{ id: 'pr1', name: 'Heißpresse 40 × 50 cm', preis: 1200, jahre: 5, zins: 5, kw: 2, auslastung: 50, strom: 0.35, wartung: 50, stunden: 400 }],
    presseId: 'pr1',
    // Gemeinkosten
    fixkosten: [
      { id: 'fx1', name: 'Raum / Miete', betrag: 150 },
      { id: 'fx2', name: 'Strom, Heizung', betrag: 40 },
      { id: 'fx3', name: 'Software, Versicherung', betrag: 40 },
      { id: 'fx4', name: 'Werkzeug, Kleinmaterial', betrag: 30 }
    ],
    prodStunden: 40, mgk: 5, fgk: 43, vwvt: 15,
    // Preise
    gewinn: 25, pauschale: 15, minAuftrag: 50, rundung: '0.1', mwst: 19,
    verpackung: 0.15, paketPreis: 6.5, paketVK: 6.9, express: 30, anzahlung: 0,
    // Textil-Katalog
    artikel: [
      { id: 'a1', name: 'T-Shirt', modell: 'tshirt', kategorie: 'Shirts', artNr: '', lieferant: '', ekHell: 7, ekDunkel: 7, aufXXL: 1, auf3XL: 2, groessen: true, pressSek: '', temp: 150, zeit: 12, druck: 'mittel', abziehen: 'kalt' },
      { id: 'a2', name: 'Hoodie', modell: 'hoodie', kategorie: 'Pullover', artNr: '', lieferant: '', ekHell: 18, ekDunkel: 19, aufXXL: 2, auf3XL: 3, groessen: true, pressSek: '', temp: 150, zeit: 15, druck: 'hoch', abziehen: 'kalt' },
      { id: 'a3', name: 'Poloshirt', modell: 'polo', kategorie: 'Shirts', artNr: '', lieferant: '', ekHell: 11, ekDunkel: 11.5, aufXXL: 1.5, auf3XL: 2.5, groessen: true, pressSek: '', temp: 150, zeit: 12, druck: 'mittel', abziehen: 'kalt' },
      { id: 'a4', name: 'Baumwolltasche', modell: 'bag', kategorie: 'Taschen', artNr: '', lieferant: '', ekHell: 2.5, ekDunkel: 2.8, aufXXL: 0, auf3XL: 0, groessen: false, pressSek: '', temp: 150, zeit: 12, druck: 'mittel', abziehen: 'kalt' },
      { id: 'a5', name: 'Kundenware (bringt Kunde mit)', modell: '', kategorie: 'Kundenware', artNr: '', lieferant: '', ekHell: 0, ekDunkel: 0, aufXXL: 0, auf3XL: 0, groessen: true, pressSek: '', temp: 150, zeit: 12, druck: 'mittel', abziehen: 'kalt' }
    ],
    // Druckstellen-Vorlagen
    druckstellen: [
      { id: 'd1', name: 'Brust links', w: 10, h: 10, ort: 'brustL' }, { id: 'd2', name: 'Brust Mitte', w: 20, h: 10, ort: 'brustM' },
      { id: 'd3', name: 'Front A4', w: 21, h: 30, ort: 'front' }, { id: 'd4', name: 'Front groß', w: 28, h: 35, ort: 'front' },
      { id: 'd5', name: 'Rücken A4', w: 21, h: 30, ort: 'ruecken' }, { id: 'd6', name: 'Rücken groß', w: 30, h: 40, ort: 'ruecken' },
      { id: 'd7', name: 'Ärmel', w: 8, h: 8, ort: 'aermelL' }, { id: 'd8', name: 'Nacken', w: 8, h: 4, ort: 'nacken' }
    ],
    // Produktion, Mahnwesen, Buchhaltung
    kapazitaetH: 6, nachfassTage: 7, mahnFristTage: 7, mahngebuehr: 5, erloeskonto: '8400',
    mockupImAngebot: true,
    // Preisliste zum Verschicken
    preisliste: [
      { id: 'pl1', name: 'T-Shirt mit Brustlogo', catId: 'a1', dunkel: true, ds: ['d1'], mengen: '10, 25, 50, 100' },
      { id: 'pl2', name: 'T-Shirt vorne + hinten', catId: 'a1', dunkel: true, ds: ['d1', 'd6'], mengen: '10, 25, 50, 100' },
      { id: 'pl3', name: 'Hoodie mit Brustlogo', catId: 'a2', dunkel: true, ds: ['d1'], mengen: '10, 25, 50, 100' }
    ],
    preislisteBrutto: false, preislisteText: 'Alle Preise pro Stück inkl. Textil und Druck. Größen XS bis XL, Übergrößen mit Aufpreis.',
    // Anfrageformular für Kunden
    anfrageArtikel: null, anfrageDruckstellen: null,   // ID-Listen, null = alle
    anfrageEmail: '', anfrageText: 'Füllen Sie das Formular aus. Am Ende entsteht eine Anfrage-Datei, die Sie uns per E-Mail schicken. Wir melden uns mit einem Angebot.'
  };
}

// ---------- Hilfsfunktionen ----------
const $ = id => document.getElementById(id);
const clone = o => JSON.parse(JSON.stringify(o));
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
// Zahl aus Eingabe lesen (Komma oder Punkt), ungültig = 0
function n(v) { v = parseFloat(typeof v === 'string' ? v.replace(',', '.') : v); return isFinite(v) ? v : 0; }
const r2 = v => Math.round(v * 100) / 100;
const isBlank = v => v === '' || v === null || v === undefined;
function todayIso(d) { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function addDays(iso, days) { const d = iso ? new Date(iso + 'T12:00:00') : new Date(); return todayIso(new Date(d.getTime() + days * 86400000)); }
function fmtDate(iso) { if (!iso) return ''; const p = String(iso).split('-'); return p.length === 3 ? p[2] + '.' + p[1] + '.' + p[0] : iso; }
const EUR = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const N0 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
const N1 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });
const N2 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const eur = v => EUR.format(v);
const pct = v => N1.format(v) + ' %';
function hm(mins) { let hh = Math.floor(mins / 60), mm = Math.round(mins % 60); if (mm === 60) { hh++; mm = 0; } return hh + ' h ' + String(mm).padStart(2, '0') + ' min'; }

// Element bauen: h('div', {class: 'x', onclick: fn}, [kinder])
function h(tag, attrs, kids) {
  const e = document.createElement(tag);
  for (const a in (attrs || {})) {
    const v = attrs[a];
    if (v === null || v === undefined || v === false) continue;
    if (a === 'text') e.textContent = v;
    else if (a === 'class') e.className = v;
    else if (a === 'value') e.value = v;
    else if (a === 'checked') e.checked = !!v;
    else if (a.slice(0, 2) === 'on') e.addEventListener(a.slice(2), v);
    else e.setAttribute(a, v === true ? '' : v);
  }
  (kids || []).forEach(k => { if (k !== null && k !== undefined && k !== false) e.appendChild(typeof k === 'string' || typeof k === 'number' ? document.createTextNode(String(k)) : k); });
  return e;
}
// Symbol aus der Symbol-Liste in index.html
function icon(name) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('class', 'i');
  const u = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  u.setAttribute('href', '#i-' + name);
  s.appendChild(u);
  return s;
}
const scriptCache = {};
function loadScript(src) {
  if (!scriptCache[src]) scriptCache[src] = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res;
    s.onerror = () => { delete scriptCache[src]; rej(new Error('Bibliothek konnte nicht geladen werden')); };
    document.head.appendChild(s);
  });
  return scriptCache[src];
}

// ---------- Migration: alte gespeicherte Daten auf den neuen Aufbau bringen ----------
function ensureIds(list) { (list || []).forEach(x => { if (!x.id) x.id = uid(); }); return list; }

function migrateArtikel(a) {
  return {
    id: a.id || uid(), name: a.name || 'Artikel', kategorie: a.kategorie || '', artNr: a.artNr || '', lieferant: a.lieferant || '',
    ekHell: a.ekHell !== undefined ? n(a.ekHell) : n(a.ek), ekDunkel: a.ekDunkel !== undefined ? n(a.ekDunkel) : n(a.ek),
    aufXXL: n(a.aufXXL), auf3XL: n(a.auf3XL), groessen: a.groessen !== undefined ? !!a.groessen : true,
    pressSek: isBlank(a.pressSek) ? '' : n(a.pressSek),
    temp: a.temp !== undefined ? a.temp : 150, zeit: a.zeit !== undefined ? a.zeit : 12,
    druck: a.druck || 'mittel', abziehen: a.abziehen || 'kalt',
    modell: a.modell || ''   // Kleidungsform fürs Mockup (siehe GARMENTS in garments.js), '' = automatisch
  };
}

function migrateSettings(d) {
  const s = DEFAULTS();
  if (!d || typeof d !== 'object') return s;
  for (const k in d) if (k in s) s[k] = d[k];
  if (!d.v) {
    // Version 1 (Prototyp): ein einziger Folienpreis bzw. eine Staffel, keine Pressen
    const staffel = Array.isArray(d.folieStaffel) ? d.folieStaffel
      : d.folieProM !== undefined ? [{ id: uid(), ab: 0, preis: n(d.folieProM) }] : DEFAULTS().anbieter[0].staffel;
    s.anbieter = [{
      id: 'an1', name: 'Folien-Anbieter', modell: 'meter',
      breite: d.rollenbreite !== undefined ? n(d.rollenbreite) : 56,
      staffel: clone(staffel), versand: n(d.folieVersand),
      vorlauf: d.vorlauf !== undefined ? n(d.vorlauf) : 10, schritt: d.schritt !== undefined ? n(d.schritt) : 0.1,
      minMeter: d.minMeter !== undefined ? n(d.minMeter) : 1, tinteM2: 0
    }];
    s.anbieterId = 'an1';
    // Die Presse steckte früher in den Fixkosten. Damit sich alte Kalkulationen nicht ändern: keine Presse.
    s.pressen = []; s.presseId = null;
    s.lohnNK = 0;
    if (Array.isArray(d.fixkosten)) s.fixkosten = clone(d.fixkosten);
  }
  if (!Array.isArray(s.anbieter) || !s.anbieter.length) s.anbieter = DEFAULTS().anbieter;
  s.anbieter.forEach(a => {
    if (!a.id) a.id = uid();
    if (!Array.isArray(a.staffel) || !a.staffel.length) a.staffel = [{ id: uid(), ab: 0, preis: 0 }];
    ensureIds(a.staffel);
    ['breite', 'versand', 'vorlauf', 'schritt', 'minMeter', 'tinteM2'].forEach(k => { a[k] = n(a[k]); });
    if (!(a.breite > 0)) a.breite = 56;
    if (!(a.schritt > 0)) a.schritt = 0.1;
    if (a.modell !== 'eigen') a.modell = 'meter';
  });
  if (!s.anbieter.some(a => a.id === s.anbieterId)) s.anbieterId = s.anbieter[0].id;
  if (!Array.isArray(s.pressen)) s.pressen = [];
  ensureIds(s.pressen);
  if (s.presseId && !s.pressen.some(p => p.id === s.presseId)) s.presseId = s.pressen.length ? s.pressen[0].id : null;
  if (!Array.isArray(s.fixkosten)) s.fixkosten = DEFAULTS().fixkosten;
  ensureIds(s.fixkosten);
  s.artikel = (Array.isArray(d.artikel) ? d.artikel : s.artikel).map(migrateArtikel);
  if (!Array.isArray(s.druckstellen) || !s.druckstellen.length) s.druckstellen = DEFAULTS().druckstellen;
  ensureIds(s.druckstellen);
  s.druckstellen.forEach(d => { if (!ORTE[d.ort]) d.ort = guessOrt(d.name); });
  if (!Array.isArray(s.preisliste)) s.preisliste = DEFAULTS().preisliste;
  ensureIds(s.preisliste);
  s.preisliste.forEach(p => { if (!Array.isArray(p.ds)) p.ds = []; if (isBlank(p.mengen)) p.mengen = '10, 25, 50, 100'; });
  s.rundung = String(s.rundung);
  s.v = 2;
  return s;
}

function catById(S, id) { return S.artikel.find(a => a.id === id) || null; }
function anbieterOf(J, S) { return S.anbieter.find(a => a.id === J.anbieterId) || S.anbieter.find(a => a.id === S.anbieterId) || S.anbieter[0]; }
function presseOf(J, S) {
  if (J.presseId === 'keine') return null;
  return S.pressen.find(p => p.id === J.presseId) || S.pressen.find(p => p.id === S.presseId) || null;
}

function emptySizes() { const g = {}; SIZES.forEach(s => { g[s] = 0; }); return g; }

function newPosition(S, cat, typ) {
  typ = typ || 'textil';
  if (typ === 'leistung') {
    return { id: uid(), typ, name: 'Grafikarbeit / Datenaufbereitung', menge: 1, einheit: 'Std.', kostenart: 'zeit', minuten: 60, ekEinheit: 0, preisEinheit: 0, motive: [], groessen: emptySizes(), ohneGroessen: true };
  }
  if (typ === 'transfer') {
    return { id: uid(), typ, name: 'DTF-Transfers', farbe: '', menge: 50, ohneGroessen: true, groessen: emptySizes(), ek: 0, aufXXL: 0, auf3XL: 0,
      motive: [{ id: uid(), name: 'Logo', w: 10, h: 10, pers: false, ort: 'front' }] };
  }
  cat = cat || S.artikel[0] || { name: 'T-Shirt', ekHell: 0, ekDunkel: 0, aufXXL: 0, auf3XL: 0, groessen: true, id: null };
  return {
    id: uid(), typ, catId: cat.id || null, name: cat.name, farbe: '', dunkel: false,
    ek: n(cat.ekHell), aufXXL: n(cat.aufXXL), auf3XL: n(cat.auf3XL),
    ohneGroessen: !cat.groessen, menge: 10, groessen: emptySizes(),
    motive: [{ id: uid(), name: 'Front groß', w: 28, h: 35, pers: false, ort: 'front' }]
  };
}
// Neue Druckstelle aus einer Vorlage
function motifFrom(d) { return { id: uid(), name: d.name, w: d.w, h: d.h, pers: false, ort: d.ort || guessOrt(d.name) }; }

function blankJob(S) {
  return {
    id: null, name: 'Neuer Auftrag', status: 'angebot',
    kundeId: null, kunde: '', kontakt: '', adresse: '', kundeUstId: '', kundeNr: '',
    datum: todayIso(), liefertermin: '', notiz: '',
    angebotNr: '', abNr: '', lsNr: '', reNr: '', reDatum: '', leistungsDatum: '', bezahltAm: '',
    gewinn: n(S.gewinn), rabatt: 0, skonto: 0, pauschale: n(S.pauschale), express: 0, anzahlung: n(S.anzahlung),
    anbieterId: null, presseId: null,
    pakete: 1, versandSeparat: false, sammel: false, zusatzMin: 0, zusatzKosten: 0,
    positionen: [newPosition(S)], sheets: [], ist: emptyIst(),
    // Termine und Produktion
    lieferDatum: '', prodDatum: '', zeiten: [], textilBestellt: '', sammelId: '',
    // Varianten: varNamen {A: 'Standard', B: 'Premium'}, variante = gewählte/angezeigte
    varNamen: {}, variante: '',
    // Rechnungswesen
    azNr: '', azDatum: '', azBetrag: 0, azBezahlt: '', stornos: [], mahnungen: [], nachgefasstAm: '',
    // Einstellungen zum Zeitpunkt des ersten Dokuments (Preise festgeschrieben)
    Ssnap: null
  };
}
function emptyIst() { return { minuten: '', meter: '', kosten: '', fehldrucke: '', folieKosten: '' }; }

// Beispielauftrag (gleich wie im Prototyp, dient auch als Prüfwert im Selbsttest)
function exampleJob(S) {
  const j = blankJob(S);
  j.name = 'Beispiel: Vereinsshirts'; j.kunde = 'Beispielkunde'; j.notiz = 'Beispielauftrag zum Ausprobieren';
  j.skonto = 2; j.zusatzMin = 15; j.liefertermin = '10 Werktage';
  const cat0 = S.artikel[0], cat1 = S.artikel[1] || S.artikel[0];
  const t = newPosition(S, cat0); t.farbe = 'Schwarz'; t.dunkel = true; t.ek = n(cat0.ekDunkel); t.ohneGroessen = false;
  t.groessen = { XS: 0, S: 4, M: 10, L: 9, XL: 5, XXL: 2, '3XL': 0, '4XL': 0, '5XL': 0 };
  t.motive = [{ id: uid(), name: 'Brust links', w: 10, h: 10, pers: false, ort: 'brustL' }, { id: uid(), name: 'Rücken groß', w: 30, h: 40, pers: false, ort: 'ruecken' }];
  const hd = newPosition(S, cat1); hd.farbe = 'Navy'; hd.dunkel = true; hd.ek = n(cat1.ekDunkel); hd.ohneGroessen = false;
  hd.groessen = { XS: 0, S: 2, M: 4, L: 4, XL: 2, XXL: 0, '3XL': 0, '4XL': 0, '5XL': 0 };
  hd.motive = [{ id: uid(), name: 'Brust links', w: 10, h: 10, pers: false, ort: 'brustL' }, { id: uid(), name: 'Rücken groß', w: 30, h: 40, pers: false, ort: 'ruecken' }];
  j.positionen = [t, hd];
  return j;
}

function normalizeJob(j, S) {
  const b = blankJob(S);
  for (const k in b) if (j[k] === undefined) j[k] = b[k];
  if (j.status === 'erledigt') j.status = 'geliefert';   // alter Status aus dem Prototyp
  if (!STATUS[j.status]) j.status = 'angebot';
  if (!j.ist || typeof j.ist !== 'object') j.ist = emptyIst();
  const ie = emptyIst(); for (const k in ie) if (j.ist[k] === undefined) j.ist[k] = '';
  ['zeiten', 'stornos', 'mahnungen'].forEach(k => { if (!Array.isArray(j[k])) j[k] = []; });
  if (!j.varNamen || typeof j.varNamen !== 'object') j.varNamen = {};
  if (!Array.isArray(j.sheets)) j.sheets = [];
  if (!Array.isArray(j.positionen)) j.positionen = [];
  j.positionen.forEach(p => {
    if (!p.id) p.id = uid();
    if (!POS_TYPES[p.typ]) p.typ = 'textil';
    if (!p.groessen || typeof p.groessen !== 'object') { p.groessen = {}; p.ohneGroessen = true; }
    SIZES.forEach(s => { if (p.groessen[s] === undefined) p.groessen[s] = 0; });
    if (p.ohneGroessen === undefined) p.ohneGroessen = true;
    ['aufXXL', 'auf3XL', 'ek', 'menge', 'minuten', 'ekEinheit', 'preisEinheit'].forEach(k => { p[k] = n(p[k]); });
    if (p.farbe === undefined) p.farbe = '';
    if (!p.einheit) p.einheit = p.typ === 'leistung' ? 'Std.' : 'Stk.';
    if (!p.kostenart) p.kostenart = 'zeit';
    if (!Array.isArray(p.motive)) p.motive = [];
    p.motive.forEach(m => {
      if (!m.id) m.id = uid(); m.pers = !!m.pers; if (!ORTE[m.ort]) m.ort = guessOrt(m.name);
      // Platzierung aus dem Mockup-Studio (cm ab Kragenpunkt / Mittellinie); fehlt sie, gilt die Standardposition
      ['x', 'y'].forEach(k => { if (typeof m[k] !== 'number' || !isFinite(m[k])) delete m[k]; });
      if (m.view !== 'front' && m.view !== 'back') delete m.view;
    });
    if (p.fotoIds && typeof p.fotoIds !== 'object') delete p.fotoIds;
    if (p.farbeHex !== undefined && !/^#[0-9a-f]{6}$/i.test(p.farbeHex)) delete p.farbeHex;
    ['modell', 'refGroesse'].forEach(k => { if (p[k] !== undefined && typeof p[k] !== 'string') delete p[k]; });
    if (p.var === undefined) p.var = '';   // '' = in allen Varianten
  });
  return j;
}
