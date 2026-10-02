// Ansicht „Verkauf“: Preisliste zum Verschicken, Auftragsvorlagen und Anfrageformular für Kunden.
// Wird über HOOKS.views.verkauf von showView() in app.js aufgerufen.
// Funktionen aus app.js (job, S, sDirty, updateState, persistSettings, loadNewJob, toast, ask …)
// werden nur innerhalb von Funktionen benutzt, weil diese Datei vor app.js geladen wird.

const VK_TABS = { preisliste: 'Preisliste', vorlagen: 'Vorlagen', anfrage: 'Anfrageformular' };
const VK_TAB_KEY = 'dtf-kalk-verkauf-tab';
let vkTab = 'preisliste';
let vkGueltig = '';   // „Gültig ab“ für die Preisliste (nur für den Export, wird nicht gespeichert)
try { const t = localStorage.getItem(VK_TAB_KEY); if (VK_TABS[t]) vkTab = t; } catch (e) {}

HOOKS.views.verkauf = renderVerkauf;

// Vorlagen haben sich geändert (auch von einem anderen Gerät): Liste neu zeichnen, wenn sie sichtbar ist
Store.onChange(name => {
  if (name !== 'vorlagen' || vkTab !== 'vorlagen') return;
  const v = $('view-verkauf');
  if (v && !v.hidden) renderVerkauf();
});

// Knopf „Als Vorlage“ im Auftrag
(function vkBind() {
  const go = () => { const b = $('btnVorlage'); if (b) b.addEventListener('click', () => vkSaveVorlage()); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();

// ======================= Rahmen =======================
function renderVerkauf() {
  const root = $('view-verkauf'); if (!root) return;
  root.textContent = '';
  if (!vkGueltig) vkGueltig = todayIso();
  const tabs = h('div', { class: 'tabs vk-tabs', role: 'tablist' }, Object.keys(VK_TABS).map(k => h('button', {
    type: 'button', role: 'tab', 'aria-selected': String(k === vkTab),
    onclick: () => { vkTab = k; try { localStorage.setItem(VK_TAB_KEY, k); } catch (e) {} renderVerkauf(); }
  }, [VK_TABS[k]])));
  root.appendChild(h('div', { class: 'panel vk-head' }, [
    h('h2', { class: 'sec' }, ['Verkauf']),
    h('p', { class: 'hint', text: 'Preisliste für Kunden, Vorlagen für wiederkehrende Aufträge und ein Anfrageformular, das Kunden selbst ausfüllen.' }),
    tabs
  ]));
  const body = h('div', { class: 'vk-body' });
  root.appendChild(body);
  if (vkTab === 'vorlagen') renderVkVorlagen(body);
  else if (vkTab === 'anfrage') renderVkAnfrage(body);
  else renderVkPreisliste(body);
  // Einstellungen speichern (Preisliste und Anfrageformular stehen in den Einstellungen)
  if (vkTab !== 'vorlagen') {
    root.appendChild(h('div', { class: 'savebar' }, [h('div', null, [
      h('span', { class: 'state', id: 'vk-state' }),
      h('button', { class: 'primary', type: 'button', onclick: () => persistSettings().then(() => vkState()) }, [icon('save'), 'Speichern'])
    ])]));
    vkState();
  }
}

// Einstellungen geändert
function vkDirty() { sDirty = true; updateState(); vkState(); }
function vkState() {
  const s = $('vk-state'); if (!s) return;
  s.textContent = sDirty ? 'Ungespeicherte Änderungen' : 'Gespeichert';
  s.className = 'state' + (sDirty ? ' dirty' : '');
}

// Text in die Zwischenablage (mit Ausweichlösung für ältere Browser / file://)
function vkCopy(text, okMsg) {
  const fb = () => {
    const ta = h('textarea', { class: 'sr', value: text });
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
    ta.remove();
    toast(ok ? okMsg : 'Kopieren hat nicht geklappt. Markier den Text in der Vorschau und kopier ihn selbst.', !ok);
  };
  try { navigator.clipboard.writeText(text).then(() => toast(okMsg), fb); } catch (e) { fb(); }
}
const vkFileName = s => String(s || '').replace(/[^A-Za-z0-9ÄÖÜäöüß_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);

// ======================= 1. Preisliste =======================
// Mengen aus dem Textfeld: „10, 25, 50“ → [10, 25, 50]
function vkMengen(str) {
  const list = String(str || '').split(/[^0-9]+/).map(x => parseInt(x, 10)).filter(x => x > 0 && x < 100000);
  return Array.from(new Set(list)).sort((a, b) => a - b).slice(0, 8);
}
const vkDs = pl => (pl.ds || []).map(id => S.druckstellen.find(d => d.id === id)).filter(Boolean);
const vkBrutto = v => r2(v * (1 + n(S.mwst) / 100));
const vkShow = v => S.preislisteBrutto ? vkBrutto(v) : v;   // Betrag so, wie er in der Liste steht

// Stückpreis netto für ein Produkt der Preisliste bei Menge N (synthetischer Auftrag, gleiche Rechnung wie im Angebot)
function vkUnitPrice(pl, N) {
  const cat = catById(S, pl.catId);
  if (!cat || !(N > 0)) return null;
  const J = blankJob(S);
  const p = newPosition(S, cat);
  p.ohneGroessen = true; p.menge = N; p.dunkel = !!pl.dunkel;
  p.ek = n(pl.dunkel ? cat.ekDunkel : cat.ekHell);
  p.motive = vkDs(pl).map(d => motifFrom(d));
  J.positionen = [p];
  J.pauschale = 0; J.pakete = 0; J.skonto = 0; J.rabatt = 0;
  const R = calc(J, S, false);
  if (!R.rows.length) return null;
  const net = R.rows[0].baseUnit;
  return { net, unit: vkShow(net), unterMin: N * net < n(S.minAuftrag) };
}

// Alle Preise der Liste: Spalten = alle vorkommenden Mengen, Zeilen = Produkte
function vkMatrix() {
  const all = [];
  S.preisliste.forEach(pl => vkMengen(pl.mengen).forEach(m => { if (!all.includes(m)) all.push(m); }));
  const cols = all.sort((a, b) => a - b).slice(0, 10);
  let anyMin = false;
  const rows = S.preisliste.map(pl => {
    const cat = catById(S, pl.catId), ds = vkDs(pl), own = vkMengen(pl.mengen), cells = {};
    cols.forEach(N => { if (own.includes(N)) { const r = vkUnitPrice(pl, N); cells[N] = r; if (r && r.unterMin) anyMin = true; } });
    const info = [cat ? cat.name + (pl.dunkel ? ' (farbig)' : '') : 'Artikel fehlt im Katalog']
      .concat(ds.length ? ds.map(d => d.name + ' ' + N1.format(n(d.w)) + '×' + N1.format(n(d.h)) + ' cm') : ['ohne Druck']).join(' · ');
    return { pl, cat, ds, cells, info };
  });
  return { cols, rows, anyMin };
}

// Aufpreis für Übergrößen im Verkauf: Einkaufs-Aufpreis × Zuschläge (wie in calc), immer aufgerundet
function vkSurcharges() {
  const k = (1 + n(S.mgk) / 100) * (1 + n(S.vwvt) / 100) * (1 + n(S.gewinn) / 100);
  const up = v => Math.ceil(v * 10 - 1e-9) / 10;
  const seen = [], out = [];
  S.preisliste.forEach(pl => {
    const c = catById(S, pl.catId);
    if (!c || seen.includes(c.id) || !c.groessen) return;
    seen.push(c.id);
    const parts = [];
    if (n(c.aufXXL) > 0) parts.push('XXL + ' + eur(vkShow(up(n(c.aufXXL) * k))));
    if (n(c.auf3XL) > 0) parts.push('3XL bis 5XL + ' + eur(vkShow(up(n(c.auf3XL) * k))));
    if (parts.length) out.push(c.name + ': ' + parts.join(', ') + ' pro Stück');
  });
  return out;
}

// Hinweise unter der Preisliste (PDF, Text, Vorschau)
function vkNotes() {
  const notes = [];
  const sur = vkSurcharges();
  if (sur.length) notes.push('Aufpreis Übergrößen: ' + sur.join('; ') + '.');
  if (n(S.pauschale) > 0) notes.push('Zzgl. einmalig ' + eur(vkShow(n(S.pauschale))) + ' für Einrichtung und Datenaufbereitung pro Auftrag.');
  if (n(S.paketVK) > 0) notes.push('Versand: ' + eur(vkShow(n(S.paketVK))) + ' pro Paket. Abholung ist kostenlos.');
  if (n(S.minAuftrag) > 0) notes.push('Mindestauftragswert: ' + eur(vkShow(n(S.minAuftrag))) + (S.preislisteBrutto ? '' : ' netto') + '. Kleinere Aufträge ergänzen wir um einen Mindermengenzuschlag.');
  if (n(S.mwst) === 0) notes.push('Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.');
  else notes.push(S.preislisteBrutto ? 'Alle Preise inkl. ' + pct(n(S.mwst)) + ' USt.' : 'Alle Preise netto zzgl. ' + pct(n(S.mwst)) + ' USt.');
  return notes;
}

function renderVkPreisliste(body) {
  const cols = h('div', { class: 'vk-cols' });
  body.appendChild(cols);

  // --- Produkte bearbeiten ---
  const list = h('div', { class: 'vk-prods' });
  const addBtn = h('button', { class: 'ghost mini', type: 'button', onclick: () => {
    const c = S.artikel[0];
    S.preisliste.push({ id: uid(), name: c ? c.name + ' mit Druck' : 'Neues Produkt', catId: c ? c.id : null, dunkel: false, ds: S.druckstellen[0] ? [S.druckstellen[0].id] : [], mengen: '10, 25, 50, 100' });
    vkDirty(); drawList(); vkPreview();
  } }, [icon('plus'), 'Produkt']);
  const edit = h('div', { class: 'panel' }, [
    h('h2', { class: 'sec' }, ['Produkte', h('span', { class: 'right' }, [addBtn])]),
    h('p', { class: 'hint', text: 'Jedes Produkt ist ein Artikel aus deinem Katalog mit festen Druckstellen. Die Preise rechnet die App genau wie ein Angebot (ohne Einrichtung und Versand).' }),
    list
  ]);
  const drawList = () => {
    list.textContent = '';
    if (!S.preisliste.length) { list.appendChild(h('div', { class: 'empty' }, [h('strong', { text: 'Noch keine Produkte' }), 'Leg mit „Produkt“ das erste an, z. B. „T-Shirt mit Brustlogo“.'])); return; }
    S.preisliste.forEach(pl => list.appendChild(vkProdCard(pl, drawList)));
  };
  drawList();

  // --- Optionen ---
  const opts = h('div', { class: 'panel' }, [
    h('h2', { class: 'sec' }, ['Optionen']),
    h('label', { class: 'check' }, [
      h('input', { type: 'checkbox', checked: !!S.preislisteBrutto, onchange: e => { S.preislisteBrutto = e.target.checked; vkDirty(); vkPreview(); } }),
      h('span', null, ['Preise brutto anzeigen', h('small', { text: 'inkl. ' + pct(n(S.mwst)) + ' USt., für Privatkunden und Vereine' })])
    ]),
    h('div', { class: 'grid', style: 'margin-top:10px' }, [
      lbl('Gültig ab', h('input', { type: 'date', value: vkGueltig, onchange: e => { vkGueltig = e.target.value || todayIso(); } })),
      h('div')
    ]),
    lbl('Text unter der Tabelle', h('textarea', { rows: '3', maxlength: '600', value: S.preislisteText || '', oninput: e => { S.preislisteText = e.target.value; vkDirty(); vkPreviewLazy(); } }), 'vk-mt')
  ]);
  cols.appendChild(h('div', null, [edit, opts]));

  // --- Vorschau und Export ---
  cols.appendChild(h('div', null, [h('div', { class: 'panel vk-prev' }, [
    h('h2', { class: 'sec' }, ['Vorschau']),
    h('div', { id: 'vk-preview' }),
    h('div', { class: 'row vk-export' }, [
      h('button', { class: 'primary', type: 'button', onclick: e => vkPdf(e.currentTarget) }, [icon('doc'), 'PDF']),
      h('button', { class: 'ghost', type: 'button', onclick: vkCsv }, [icon('export'), 'CSV']),
      h('button', { class: 'ghost', type: 'button', onclick: () => vkCopy(vkText(), 'Preisliste kopiert. Du kannst sie jetzt in WhatsApp oder Instagram einfügen.') }, [icon('copy'), 'Als Text kopieren'])
    ])
  ])]));
  vkPreview();
}

// Eine Produktkarte im Editor
function vkProdCard(pl, redraw) {
  const sel = h('select', { 'aria-label': 'Artikel', onchange: e => { pl.catId = e.target.value || null; vkDirty(); vkPreview(); } },
    [h('option', { value: '', text: '– Artikel wählen –' })].concat(S.artikel.map(a => h('option', { value: a.id, text: a.name }))));
  sel.value = catById(S, pl.catId) ? pl.catId : '';
  const chips = h('div', { class: 'chips' }, S.druckstellen.map(d => h('button', {
    class: 'chip', type: 'button', 'aria-pressed': String(pl.ds.includes(d.id)), title: N1.format(n(d.w)) + ' × ' + N1.format(n(d.h)) + ' cm',
    onclick: e => {
      if (pl.ds.includes(d.id)) pl.ds = pl.ds.filter(x => x !== d.id); else pl.ds.push(d.id);
      e.currentTarget.setAttribute('aria-pressed', String(pl.ds.includes(d.id)));
      vkDirty(); vkPreview();
    }
  }, [d.name])));
  const del = h('button', { class: 'x', type: 'button', 'aria-label': 'Produkt entfernen', title: 'Entfernen', onclick: () => {
    ask('„' + (pl.name || 'Produkt') + '“ aus der Preisliste entfernen?', { title: 'Produkt entfernen?', ok: 'Entfernen', danger: true }).then(ok => {
      if (!ok) return;
      S.preisliste = S.preisliste.filter(x => x !== pl); vkDirty(); redraw(); vkPreview();
    });
  } }, ['×']);
  return h('div', { class: 'subcard vk-prod' }, [
    h('div', { class: 'head' }, [textIn(pl.name, v => { pl.name = v; vkDirty(); vkPreviewLazy(); }, { maxlength: '60', 'aria-label': 'Produktname', placeholder: 'Name, z. B. T-Shirt mit Brustlogo' }), del]),
    h('div', { class: 'grid vk-mt' }, [
      lbl('Artikel', sel),
      lbl('Mengen', textIn(pl.mengen, v => { pl.mengen = v; vkDirty(); vkPreviewLazy(); }, { maxlength: '60', placeholder: '10, 25, 50, 100', inputmode: 'numeric' }))
    ]),
    h('label', { class: 'check' }, [
      h('input', { type: 'checkbox', checked: !!pl.dunkel, onchange: e => { pl.dunkel = e.target.checked; vkDirty(); vkPreview(); } }),
      h('span', null, ['Dunkles / farbiges Textil', h('small', { text: 'rechnet mit dem Einkaufspreis „dunkel“' })])
    ]),
    h('div', { class: 'sub' }, ['Druckstellen']),
    S.druckstellen.length ? chips : h('p', { class: 'hint', text: 'Leg zuerst Druckstellen in den Einstellungen an.' })
  ]);
}

// Vorschau neu zeichnen (beim Tippen leicht verzögert)
let vkPrevTimer = null;
function vkPreviewLazy() { clearTimeout(vkPrevTimer); vkPrevTimer = setTimeout(vkPreview, 250); }
function vkPreview() {
  const box = $('vk-preview'); if (!box) return;
  box.textContent = '';
  const M = vkMatrix();
  if (!M.rows.length || !M.cols.length) { box.appendChild(h('div', { class: 'empty' }, [h('strong', { text: 'Noch nichts zu zeigen' }), 'Leg links ein Produkt mit Mengen an.'])); return; }
  const head = h('tr', null, [h('th', { text: 'Produkt' })].concat(M.cols.map(N => h('th', { text: 'ab ' + N + ' Stk.' }))));
  const rows = M.rows.map(r => h('tr', null, [h('td', null, [h('strong', { text: r.pl.name || 'Ohne Namen' }), h('small', { text: r.info })])].concat(M.cols.map(N => {
    const c = r.cells[N];
    if (c === undefined) return h('td', { class: 'mut', text: '–' });
    if (c === null) return h('td', { class: 'vk-miss', text: '?' , title: 'Artikel fehlt' });
    return h('td', { class: c.unterMin ? 'vk-min' : null, title: c.unterMin ? 'Unter dem Mindestauftragswert' : null }, [eur(c.unit) + (c.unterMin ? ' *' : '')]);
  }))));
  box.appendChild(h('p', { class: 'mut vk-cap', text: 'Stückpreise ' + (S.preislisteBrutto ? 'brutto inkl. ' + pct(n(S.mwst)) + ' USt.' : 'netto') + ', inkl. Textil und Druck' }));
  box.appendChild(h('div', { class: 'tablewrap' }, [h('table', { class: 'tbl vk-tbl' }, [h('thead', null, [head]), h('tbody', null, rows)])]));
  const extra = [];
  if (n(S.pauschale) > 0) extra.push('zzgl. einmalig Einrichtung ' + eur(vkShow(n(S.pauschale))));
  if (n(S.paketVK) > 0) extra.push('Versand ' + eur(vkShow(n(S.paketVK))) + ' pro Paket');
  if (extra.length) box.appendChild(h('p', { class: 'vk-extra', text: extra.join(' · ') }));
  if (M.anyMin) box.appendChild(h('div', { class: 'callout vk-warn' }, ['* Diese Menge liegt unter dem Mindestauftragswert von ' + eur(n(S.minAuftrag)) + ' netto. Der Kunde zahlt dann mindestens diesen Betrag (Mindermengenzuschlag).']));
  if (M.rows.some(r => !r.cat)) box.appendChild(h('div', { class: 'callout vk-warn' }, ['Bei mindestens einem Produkt fehlt der Artikel. Wähl links einen Artikel aus dem Katalog.']));
  if (S.preislisteText) box.appendChild(h('p', { class: 'hint vk-mt', text: S.preislisteText }));
}

// Preisliste als PDF
async function vkPdf(btn) {
  const M = vkMatrix();
  if (!M.rows.length || !M.cols.length) { toast('Die Preisliste ist noch leer.', true); return; }
  if (btn) { btn.disabled = true; btn.classList.add('busy'); }
  try {
    await loadScript(LIB.jspdf);
    const J = blankJob(S); J.name = 'Preisliste Textildruck';
    const F = pdfFrame('Preisliste', J, S, { anschrift: false, betreff: 'Preisliste Textildruck', info: [['Datum', fmtDate(todayIso())], ['Gültig ab', fmtDate(vkGueltig || todayIso())]] });
    const { doc, L, Rr, W, setF } = F;
    // Spaltenbreiten: Preise rechts, Produktname links
    const cw = Math.min(22, (W - 60) / M.cols.length), nameW = W - cw * M.cols.length - 3;
    setF('normal', 9.5);
    F.para('Sehr geehrte Damen und Herren, hier finden Sie unsere aktuellen Stückpreise ' + (S.preislisteBrutto ? 'inklusive Umsatzsteuer' : '(netto)') + '. Je mehr Teile Sie bestellen, desto günstiger wird das einzelne Stück.', 4.6);
    F.y += 4;
    const head = () => {
      setF('bold', 8.5, 90);
      doc.text('Produkt', L, F.y);
      M.cols.forEach((N, i) => doc.text('ab ' + N + (cw >= 18 ? ' Stk.' : ''), Rr - (M.cols.length - 1 - i) * cw, F.y, { align: 'right' }));
      F.y += 2; doc.setDrawColor(180); doc.line(L, F.y, Rr, F.y); F.y += 5; setF();
    };
    F.need(16); head();
    F.onNewPage = head;
    M.rows.forEach(r => {
      const info = doc.splitTextToSize(pdfTxt(r.info), nameW);
      F.need(6 + info.length * 3.8);
      setF('bold', 9.5);
      doc.text(doc.splitTextToSize(pdfTxt(r.pl.name || 'Produkt'), nameW)[0], L, F.y);
      setF('normal', 9.5);
      M.cols.forEach((N, i) => {
        const c = r.cells[N], x = Rr - (M.cols.length - 1 - i) * cw;
        doc.text(c === undefined || c === null ? '-' : pdfTxt(eur(c.unit)) + (c.unterMin ? '*' : ''), x, F.y, { align: 'right' });
      });
      F.y += 4.4; setF('normal', 8, 100);
      info.forEach(t => { doc.text(t, L, F.y); F.y += 3.8; });
      setF(); F.y += 1.5; doc.setDrawColor(225); doc.line(L, F.y - 1, Rr, F.y - 1); F.y += 3.5;
    });
    F.onNewPage = null;
    F.y += 2;
    if (M.anyMin) { setF('normal', 8.5, 90); F.para('* Bei dieser Menge liegt der Auftrag unter dem Mindestauftragswert von ' + eur(vkShow(n(S.minAuftrag))) + '.', 4.2); setF(); F.y += 2; }
    if (S.preislisteText) { setF('normal', 9.5); F.para(S.preislisteText, 4.6); F.y += 3; }
    F.need(14); setF('bold', 10); F.text('Hinweise'); F.y += 5.5; setF('normal', 9.5);
    vkNotes().forEach(t => F.para('- ' + t, 4.6));
    F.y += 3;
    pdfNotes(F, [S.textSchluss].filter(Boolean), S);
    const out = F.finish();
    await saveFile('Preisliste_' + (vkFileName(S.fName) ? vkFileName(S.fName) + '_' : '') + todayIso() + '.pdf', out.output('arraybuffer'));
    toast('Preisliste gespeichert');
  } catch (e) {
    console.error(e);
    if (!(e && e.code === 'declined')) toast('Die PDF konnte nicht erstellt werden. Prüf die Internetverbindung (die PDF-Bibliothek wird beim ersten Mal geladen).', true);
  } finally { if (btn) { btn.disabled = false; btn.classList.remove('busy'); } }
}

// Preisliste als CSV (Excel)
function vkCsv() {
  const M = vkMatrix();
  if (!M.rows.length) { toast('Die Preisliste ist noch leer.', true); return; }
  const esc = v => { const s = String(v === null || v === undefined ? '' : v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const head = ['Produkt', 'Artikel', 'Druckstellen'].concat(M.cols.map(N => 'ab ' + N + ' Stk. (' + (S.preislisteBrutto ? 'brutto' : 'netto') + ')'));
  const rows = M.rows.map(r => [r.pl.name, r.cat ? r.cat.name : '', r.ds.map(d => d.name).join(', ')]
    .concat(M.cols.map(N => { const c = r.cells[N]; return c ? N2.format(c.unit) : ''; })).map(esc).join(';'));
  const csv = String.fromCharCode(0xfeff) + [head.map(esc).join(';')].concat(rows).join('\r\n');
  saveFile('Preisliste_' + todayIso() + '.csv', csv).then(() => toast('CSV gespeichert'), () => {});
}

// Preisliste als einfacher Text (WhatsApp, Instagram, E-Mail)
function vkText() {
  const M = vkMatrix();
  const out = ['*Preisliste Textildruck*' + (S.fName ? ' – ' + S.fName : ''), 'Gültig ab ' + fmtDate(vkGueltig || todayIso()), ''];
  M.rows.forEach(r => {
    out.push('*' + (r.pl.name || 'Produkt') + '*');
    if (r.ds.length) out.push('Druck: ' + r.ds.map(d => d.name).join(', '));
    M.cols.forEach(N => { const c = r.cells[N]; if (c) out.push('ab ' + N + ' Stk.: ' + eur(c.unit) + ' pro Stück' + (c.unterMin ? ' *' : '')); });
    out.push('');
  });
  if (M.anyMin) out.push('* unter dem Mindestauftragswert von ' + eur(vkShow(n(S.minAuftrag))), '');
  if (S.preislisteText) out.push(S.preislisteText, '');
  vkNotes().forEach(t => out.push('• ' + t));
  if (S.fKontakt) out.push('', S.fKontakt.replace(/\n/g, ' · '));
  return out.join('\n').trim();
}

// ======================= 2. Vorlagen =======================
// Auftrag ohne Kunde, Nummern, Termine und Produktionsdaten
function vkTemplateJob(j) {
  const c = clone(j);
  delete c.id;
  ['kunde', 'kontakt', 'adresse', 'kundeUstId', 'kundeNr', 'angebotNr', 'abNr', 'lsNr', 'reNr', 'reDatum', 'leistungsDatum', 'bezahltAm',
    'azNr', 'azDatum', 'azBezahlt', 'lieferDatum', 'prodDatum', 'textilBestellt', 'sammelId'].forEach(k => { c[k] = ''; });
  c.kundeId = null; c.azBetrag = 0;
  c.sheets = []; c.ist = emptyIst(); c.zeiten = []; c.stornos = []; c.mahnungen = []; c.Ssnap = null;
  c.status = 'angebot';
  // beim Speichern berechnete Werte gehören nicht in die Vorlage
  ['updatedAt', 'angebotNetto', 'angebotBrutto', 'gewinnEuro', 'teile', 'planCm', 'minuten'].forEach(k => { delete c[k]; });
  return c;
}

// Offenen Auftrag als Vorlage speichern (Knopf „Als Vorlage“)
function vkSaveVorlage() {
  if (typeof job !== 'object' || !job) return Promise.resolve(false);
  const name = String(job.name || '').trim() || 'Vorlage';
  const data = vkTemplateJob(job);
  const list = Store.list('vorlagen');
  const same = nm => list.find(v => String(v.data.name || '').trim().toLowerCase() === nm.toLowerCase());
  const save = (id, nm, beschreibung) => Store.put('vorlagen', id, { name: nm, beschreibung: beschreibung || '', job: data, updatedAt: Date.now() })
    .then(() => { toast('Vorlage „' + nm + '“ gespeichert'); return true; },
      e => { toast(e && e.code === 'storage_full' ? 'Der Speicher ist voll. Vorlage wurde nicht gespeichert.' : 'Vorlage konnte nicht gespeichert werden.', true); return false; });
  const ex = same(name);
  if (!ex) return save(uid(), name, '');
  return ask('Es gibt schon eine Vorlage „' + name + '“.', {
    title: 'Vorlage überschreiben?',
    buttons: [{ label: 'Überschreiben', value: 'over', cls: 'primary' }, { label: 'Als neue Vorlage', value: 'neu', cls: 'ghost' }, { label: 'Abbrechen', value: false, cls: 'ghost' }]
  }).then(v => {
    if (v === 'over') return save(ex.id, name, ex.data.beschreibung);
    if (v === 'neu') { let k = 2; while (same(name + ' (' + k + ')')) k++; return save(uid(), name + ' (' + k + ')', ''); }
    return false;
  });
}

// Neuen Auftrag aus einer Vorlage
function vkJobFromVorlage(v) {
  const j = clone((v.data && v.data.job) || {});
  delete j.id;
  j.datum = todayIso(); j.status = 'angebot';
  (j.positionen || []).forEach(p => { p.id = uid(); (p.motive || []).forEach(m => { m.id = uid(); }); });
  loadNewJob(j, [], 'Auftrag aus Vorlage erstellt');
}

// Kurze Zusammenfassung der Positionen: „10× T-Shirt Schwarz, 5× Hoodie“
function vkPosSummary(j) {
  const ps = (j && Array.isArray(j.positionen)) ? j.positionen : [];
  if (!ps.length) return 'Keine Positionen';
  const parts = ps.map(p => {
    let q = 0; try { q = qtyOf(p); } catch (e) {}
    return (q ? N1.format(q) + '× ' : '') + (p.name || 'Position') + (p.farbe ? ' ' + p.farbe : '');
  });
  return parts.slice(0, 4).join(', ') + (parts.length > 4 ? ' und ' + (parts.length - 4) + ' weitere' : '');
}

function renderVkVorlagen(body) {
  const list = Store.list('vorlagen').slice().sort((a, b) => String(a.data.name || '').localeCompare(String(b.data.name || ''), 'de'));
  const panel = h('div', { class: 'panel' }, [
    h('h2', { class: 'sec' }, ['Vorlagen', h('span', { class: 'right' }, [
      h('button', { class: 'ghost mini', type: 'button', title: 'Den gerade offenen Auftrag als Vorlage speichern', onclick: () => vkSaveVorlage() }, [icon('save'), 'Offenen Auftrag speichern'])
    ])]),
    h('p', { class: 'hint', text: 'Vorlagen sind Aufträge ohne Kunde und Nummern, z. B. „Vereinstrikot Standard“. Daraus legst du mit einem Klick einen neuen Auftrag an.' })
  ]);
  body.appendChild(panel);
  if (!list.length) {
    panel.appendChild(h('div', { class: 'empty' }, [
      h('strong', { text: 'Noch keine Vorlagen' }),
      'Öffne einen Auftrag und klick oben rechts auf „Als Vorlage“. Kunde, Nummern und Termine werden dabei weggelassen.'
    ]));
    return;
  }
  const box = h('div', { class: 'vk-tpls' });
  list.forEach(v => {
    const d = v.data || {};
    const update = patch => Store.put('vorlagen', v.id, Object.assign({}, d, patch, { updatedAt: Date.now() }))
      .then(() => toast('Vorlage gespeichert'), () => toast('Vorlage konnte nicht gespeichert werden.', true));
    const nameIn = textIn(d.name, () => {}, { maxlength: '80', 'aria-label': 'Name der Vorlage', onchange: e => {
      const nm = e.target.value.trim();
      if (!nm) { e.target.value = d.name || ''; return; }
      if (nm !== d.name) update({ name: nm });
    } });
    const descIn = textIn(d.beschreibung, () => {}, { maxlength: '200', placeholder: 'Beschreibung (optional)', 'aria-label': 'Beschreibung', onchange: e => { if (e.target.value !== (d.beschreibung || '')) update({ beschreibung: e.target.value }); } });
    box.appendChild(h('div', { class: 'subcard vk-tpl' }, [
      h('div', { class: 'head' }, [nameIn]),
      descIn,
      h('div', { class: 'vk-tplinfo' }, [
        h('span', { text: vkPosSummary(d.job) }),
        h('span', { class: 'mut', text: d.updatedAt ? 'Stand ' + fmtDate(todayIso(new Date(d.updatedAt))) : '' })
      ]),
      h('div', { class: 'row vk-mt' }, [
        h('button', { class: 'primary mini', type: 'button', onclick: () => vkJobFromVorlage(v) }, [icon('plus'), 'Neuer Auftrag daraus']),
        h('button', { class: 'ghost mini danger', type: 'button', onclick: () => {
          ask('Vorlage „' + (d.name || 'Vorlage') + '“ löschen? Aufträge, die daraus entstanden sind, bleiben erhalten.', { title: 'Vorlage löschen?', ok: 'Löschen', danger: true })
            .then(ok => { if (ok) Store.del('vorlagen', v.id).then(() => toast('Vorlage gelöscht')); });
        } }, [icon('trash'), 'Löschen'])
      ])
    ]));
  });
  panel.appendChild(box);
}

// ======================= 3. Anfrageformular =======================
// Auswahl: undefined/null = alle, sonst Liste der IDs
const vkSel = (key, id) => !Array.isArray(S[key]) || S[key].includes(id);
function vkToggleSel(key, all, id) {
  if (!Array.isArray(S[key])) S[key] = all.slice();
  if (S[key].includes(id)) S[key] = S[key].filter(x => x !== id); else S[key].push(id);
  // alle gewählt → wieder „alle“ (dann erscheinen auch neue Katalog-Einträge automatisch)
  if (all.every(x => S[key].includes(x))) S[key] = null;
  vkDirty();
}

function vkAnfrageConfig() {
  return {
    firma: S.fName, logo: S.fLogo, email: S.anfrageEmail, text: S.anfrageText,
    artikel: S.artikel.filter(a => vkSel('anfrageArtikel', a.id)).map(a => ({ id: a.id, name: a.name, groessen: !!a.groessen })),
    druckstellen: S.druckstellen.filter(d => vkSel('anfrageDruckstellen', d.id)).map(d => ({ id: d.id, name: d.name, w: n(d.w), h: n(d.h), ort: d.ort || guessOrt(d.name) })),
    sizes: SIZES, erstellt: new Date().toISOString()
  };
}

function vkDownloadAnfrage() {
  const mail = String(S.anfrageEmail || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
    toast('Trag zuerst eine gültige E-Mail-Adresse ein. An sie schicken Kunden ihre Anfrage.', true);
    const i = $('vk-anf-mail'); if (i) i.focus();
    return;
  }
  let html;
  try { html = buildAnfrageHtml(vkAnfrageConfig()); } catch (e) { console.error(e); toast('Das Formular konnte nicht erstellt werden.', true); return; }
  saveFile('anfrage.html', html).then(() => toast('Formular gespeichert: anfrage.html'), e => { if (!(e && e.code === 'declined')) toast('Speichern hat nicht geklappt.', true); });
  if (sDirty) toast('Tipp: Speicher auch die Einstellungen, damit deine Auswahl erhalten bleibt.');
}

function renderVkAnfrage(body) {
  const cols = h('div', { class: 'vk-cols' });
  body.appendChild(cols);
  const artIds = S.artikel.map(a => a.id), dsIds = S.druckstellen.map(d => d.id);
  const chipList = (key, items, all, label) => h('div', { class: 'chips' }, items.map(x => h('button', {
    class: 'chip', type: 'button', 'aria-pressed': String(vkSel(key, x.id)), title: label(x),
    onclick: () => { vkToggleSel(key, all, x.id); drawChips(); }
  }, [x.name])));
  const artBox = h('div'), dsBox = h('div');
  const drawChips = () => {
    artBox.textContent = ''; dsBox.textContent = '';
    artBox.appendChild(S.artikel.length ? chipList('anfrageArtikel', S.artikel, artIds, a => a.groessen ? 'mit Größen' : 'ohne Größen') : h('p', { class: 'hint', text: 'Dein Katalog ist leer.' }));
    dsBox.appendChild(S.druckstellen.length ? chipList('anfrageDruckstellen', S.druckstellen, dsIds, d => N1.format(n(d.w)) + ' × ' + N1.format(n(d.h)) + ' cm') : h('p', { class: 'hint', text: 'Keine Druckstellen angelegt.' }));
  };
  drawChips();
  const allBtn = key => h('button', { class: 'link', type: 'button', onclick: () => { S[key] = null; vkDirty(); drawChips(); } }, ['Alle']);

  cols.appendChild(h('div', null, [h('div', { class: 'panel' }, [
    h('h2', { class: 'sec' }, ['Formular einrichten']),
    lbl('E-Mail-Adresse für Anfragen', h('input', { type: 'email', id: 'vk-anf-mail', value: S.anfrageEmail || '', placeholder: 'anfragen@deine-firma.de', maxlength: '120', oninput: e => { S.anfrageEmail = e.target.value.trim(); vkDirty(); } })),
    lbl('Einleitungstext', h('textarea', { rows: '3', maxlength: '800', value: S.anfrageText || '', oninput: e => { S.anfrageText = e.target.value; vkDirty(); } }), 'vk-mt'),
    h('div', { class: 'sub vk-subrow' }, [h('span', { text: 'Artikel im Formular' }), allBtn('anfrageArtikel')]),
    artBox,
    h('div', { class: 'sub vk-subrow' }, [h('span', { text: 'Druckstellen im Formular' }), allBtn('anfrageDruckstellen')]),
    dsBox,
    h('p', { class: 'hint vk-mt', text: 'Kunden können zusätzlich „Anderer Artikel“ und „Andere Stelle“ wählen. Firmenname und Logo kommen aus den Einstellungen.' }),
    h('div', { class: 'row vk-mt' }, [
      h('button', { class: 'primary', type: 'button', onclick: vkDownloadAnfrage }, [icon('export'), 'Formular herunterladen (anfrage.html)'])
    ])
  ])]));

  const file = h('input', { class: 'sr', type: 'file', accept: '.json,application/json', id: 'vk-anf-file', onchange: e => { const f = e.target.files[0]; e.target.value = ''; if (f) importAnfrageFile(f); } });
  cols.appendChild(h('div', null, [h('div', { class: 'panel' }, [
    h('h2', { class: 'sec' }, ['So funktioniert es']),
    h('ol', { class: 'vk-steps' }, [
      h('li', { text: 'Lade das Formular herunter. Es ist eine einzelne Datei, die ohne Internet funktioniert.' }),
      h('li', { text: 'Stell sie auf deine Webseite oder schick sie Kunden per E-Mail oder WhatsApp.' }),
      h('li', { text: 'Der Kunde füllt alles aus. Am Ende entsteht eine Datei „Anfrage_….json“, die er dir per E-Mail schickt.' }),
      h('li', { text: 'Du öffnest die Datei hier oder unter „Infoblatt einlesen“. Daraus wird ein fertiger Auftrag zum Prüfen.' })
    ]),
    h('div', { class: 'callout' }, [
      h('strong', { text: 'Anfrage übernehmen' }),
      h('span', { class: 'mut', text: 'Kunde, Artikel, Größen, Druckstellen und Logos werden übernommen. Prüf danach die Preise und speichere den Auftrag.' }),
      h('div', null, [h('label', { class: 'btn ghost mini', for: 'vk-anf-file' }, [icon('open'), 'Anfrage-Datei öffnen', file])])
    ])
  ])]));
}
