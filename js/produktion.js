// Ansicht „Produktion“: Plan (Kalender + Einplanen), Textil-Einkauf, Sammel-Folie und Lager.
// Lädt VOR app.js: Funktionen und Variablen aus app.js (toast, ask, openJob, job, S, view …)
// werden nur innerhalb von Funktionen benutzt.

const PROD = {
  tab: 'plan',
  busy: false,          // true, während mehrere Aufträge nacheinander gespeichert werden (nicht dauernd neu zeichnen)
  textOff: {},          // Textil-Einkauf: abgewählte Aufträge (id → true), neue Aufträge sind automatisch ausgewählt
  showOrdered: false,   // Textil-Einkauf: auch bereits bestellte zeigen
  sammelOff: {},        // Sammel-Folie: abgewählte Aufträge
  anId: null,           // Sammel-Folie: gewählter Anbieter
  lagerQ: '', lagerTyp: 'alle',
  form: { typ: 'textil', catId: '', name: '', farbe: '', groesse: 'ohne', menge: 1, notiz: '' }
};
const PROD_TAB_KEY = 'dtf-kalk-prod-tab';
const PROD_TABS = [['plan', 'Plan'], ['textil', 'Textil-Einkauf'], ['sammel', 'Sammel-Folie'], ['lager', 'Lager']];
const PROD_ACTIVE = ['auftrag', 'produktion'];       // Status, die in der Produktion auftauchen
const PROD_SIZES = SIZES.concat(['ohne']);
try { const t = localStorage.getItem(PROD_TAB_KEY); if (PROD_TABS.some(x => x[0] === t)) PROD.tab = t; } catch (e) {}

// ======================= Kleine Helfer =======================
const prodLow = s => String(s === null || s === undefined ? '' : s).trim().toLowerCase();
const prodErr = e => toast(e && e.code === 'storage_full' ? 'Der Browser-Speicher ist voll. Lade eine Datensicherung herunter.' : 'Speichern hat nicht geklappt. Versuch es nochmal.', true);

// Gespeicherte Aufträge mit Rechnung: [{id, d (gespeicherte Daten), J (normalisiert), R (calcJob)}]
function prodJobs(filter) {
  const out = [];
  Store.jobs.forEach(e => {
    const d = e.data || {};
    if (filter && !filter(d)) return;
    try {
      const J = normalizeJob(clone(d), S);
      out.push({ id: e.id, d, J, R: calcJob(J, S, false) });
    } catch (err) { console.error(err); }
  });
  return out;
}

// Gespeicherten Auftrag ändern: klonen, mutate(daten), speichern. Offenen Auftrag nachladen, wenn nichts ungespeichert ist.
function prodSave(id, mutate) {
  const e = Store.jobs.find(x => x.id === id);
  if (!e) return Promise.resolve(false);
  const d = clone(e.data);
  if (!d.ist || typeof d.ist !== 'object') d.ist = emptyIst();
  mutate(d);
  d.updatedAt = Date.now();
  return Store.saveJob(id, d).then(() => {
    if (job.id === id && !dirty) openJob(id);
    return true;
  });
}
// Mehrere Speicher-Schritte nacheinander, danach einmal neu zeichnen. tasks: [() => Promise]
function prodBatch(tasks) {
  PROD.busy = true;
  const done = () => { PROD.busy = false; if (view === 'produktion') renderProduktion(); };
  return tasks.reduce((p, t) => p.then(t), Promise.resolve()).then(r => { done(); return r; }, err => { done(); throw err; });
}
function prodOpen(id) { guardSwitch(() => { openJob(id); showView('auftrag'); }); }
function prodOpt(value, text) { return h('option', { value, text }); }
function prodEmpty(title, text) { return h('div', { class: 'empty' }, [h('strong', { text: title }), text]); }

// Auswahlliste mit Schaltern (Textil-Einkauf, Sammel-Folie). off = abgewählte ids, info(x) = Zusatztexte
function prodPick(list, off, info) {
  const box = h('div', { class: 'pd-pick' });
  list.forEach(x => {
    const cb = h('input', { type: 'checkbox', checked: !off[x.id], onchange: e => { if (e.target.checked) delete off[x.id]; else off[x.id] = true; renderProduktion(); } });
    box.appendChild(h('label', { class: 'check pd-pickrow' }, [cb, h('span', null, [x.d.name || 'Ohne Namen', h('small', { text: [x.d.kunde].concat(info(x)).filter(Boolean).join(' · ') })])]));
  });
  const all = h('div', { class: 'row pd-pickbtns' }, [
    h('button', { class: 'ghost mini', type: 'button', onclick: () => { list.forEach(x => { delete off[x.id]; }); renderProduktion(); } }, ['Alle']),
    h('button', { class: 'ghost mini', type: 'button', onclick: () => { list.forEach(x => { off[x.id] = true; }); renderProduktion(); } }, ['Keine'])
  ]);
  return h('div', null, [all, box]);
}

// ======================= Ansicht =======================
function renderProduktion() {
  const root = $('view-produktion'); if (!root) return;
  root.textContent = '';
  const bar = h('div', { class: 'tabs pd-tabs', role: 'tablist' });
  PROD_TABS.forEach(([k, l]) => bar.appendChild(h('button', { type: 'button', role: 'tab', 'aria-selected': String(PROD.tab === k), onclick: () => {
    PROD.tab = k; try { localStorage.setItem(PROD_TAB_KEY, k); } catch (e) {}
    renderProduktion();
  } }, [l])));
  root.appendChild(bar);
  const body = h('div', { class: 'pd-body' });
  root.appendChild(body);
  const fn = { plan: prodPlan, textil: prodTextil, sammel: prodSammel, lager: prodLager }[PROD.tab] || prodPlan;
  try { fn(body); } catch (e) { console.error(e); body.appendChild(prodEmpty('Hier ist etwas schiefgelaufen.', String(e && e.message || e))); }
}

// ======================= 1. Plan =======================
const prodDow = iso => (new Date(iso + 'T12:00:00').getDay() + 6) % 7;   // 0 = Montag … 6 = Sonntag

function prodPlan(box) {
  const today = todayIso();
  const list = prodJobs(d => PROD_ACTIVE.includes(d.status));
  const cap = Math.max(n(S.kapazitaetH), 0);

  // Kapazität
  const capIn = h('input', { type: 'number', step: '0.5', min: '0', value: String(n(S.kapazitaetH)), class: 'pd-capin', 'aria-label': 'Kapazität pro Tag in Stunden', onchange: e => {
    S.kapazitaetH = Math.max(0, n(e.target.value));
    Store.saveSettings(S).then(() => { toast('Kapazität gespeichert'); renderProduktion(); }, prodErr);
  } });
  const head = h('div', { class: 'panel' }, [
    h('h2', { class: 'sec' }, ['Kalender', h('span', { class: 'right mut', text: 'nächste 21 Tage' })]),
    h('div', { class: 'row pd-cap' }, [h('span', { text: 'Kapazität pro Tag:' }), capIn, h('span', { class: 'mut', text: 'Stunden. Die Balken zeigen die geplante Arbeitszeit der Aufträge am Produktionstag. Über 100 % wird es rot.' })])
  ]);
  box.appendChild(head);

  // Tage: ab Montag dieser Woche bis mindestens heute + 20, immer ganze Wochen
  const start = addDays(today, -prodDow(today)), end = addDays(today, 20);
  const days = [];
  for (let d = start; d <= end || prodDow(d) !== 0; d = addDays(d, 1)) days.push(d);
  const byDay = {};
  list.forEach(x => { if (x.d.prodDatum) (byDay[x.d.prodDatum] = byDay[x.d.prodDatum] || []).push(x); });

  const cal = h('div', { class: 'pd-cal' });
  ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].forEach((t, i) => cal.appendChild(h('div', { class: 'pd-dow' + (i >= 5 ? ' we' : ''), text: t })));
  days.forEach(iso => {
    const js = byDay[iso] || [];
    const hrs = js.reduce((s, x) => s + x.R.minutes / 60, 0);
    const load = cap > 0 ? hrs / cap : (hrs > 0 ? 2 : 0);
    const cls = ['pd-day', iso === today ? 'today' : '', prodDow(iso) >= 5 ? 'we' : '', iso < today ? 'past' : '', load > 1 + 1e-9 ? 'over' : ''].filter(Boolean).join(' ');
    const p = iso.split('-');
    cal.appendChild(h('div', { class: cls }, [
      h('div', { class: 'pd-dhead' }, [h('b', { text: p[2] + '.' + p[1] + '.' }), iso === today ? h('em', { text: 'heute' }) : null, hrs > 0 ? h('span', { text: N1.format(hrs) + ' h' }) : null]),
      h('div', { class: 'pd-bar', title: N1.format(hrs) + ' von ' + N1.format(cap) + ' h (' + N0.format(load * 100) + ' %)' }, [h('i', { style: 'width:' + Math.min(100, load * 100) + '%' })]),
      h('div', { class: 'pd-dchips' }, js.map(x => h('button', { class: 'pd-chip' + (x.d.status === 'produktion' ? ' run' : ''), type: 'button', title: (x.d.name || 'Ohne Namen') + (x.d.kunde ? ' · ' + x.d.kunde : '') + ' · ' + hm(x.R.minutes), onclick: () => prodOpen(x.id) },
        [h('span', { text: x.d.name || 'Ohne Namen' }), h('small', { text: N1.format(x.R.minutes / 60) + ' h' })])))
    ]));
  });
  head.appendChild(h('div', { class: 'pd-calwrap' }, [cal]));
  const before = list.filter(x => x.d.prodDatum && x.d.prodDatum < start);
  if (before.length) head.appendChild(h('p', { class: 'hint pd-amber', text: before.length + (before.length === 1 ? ' Auftrag ist' : ' Aufträge sind') + ' für einen Tag vor diesem Kalender eingeplant und noch nicht geliefert. Plane neu ein oder setz den Status weiter.' }));

  if (!list.length) {
    box.appendChild(prodEmpty('Keine bestätigten Aufträge', 'Aufträge mit Status „Bestätigt“ oder „In Produktion“ erscheinen hier zum Einplanen.'));
    return;
  }
  const open = list.filter(x => !x.d.prodDatum).sort((a, b) => (a.d.lieferDatum || '9999').localeCompare(b.d.lieferDatum || '9999'));
  const planned = list.filter(x => x.d.prodDatum).sort((a, b) => a.d.prodDatum.localeCompare(b.d.prodDatum));
  box.appendChild(prodPlanTable('Noch nicht eingeplant', open, today, 'Alle Aufträge haben einen Produktionstag.'));
  box.appendChild(prodPlanTable('Eingeplant', planned, today, 'Noch nichts eingeplant. Wähl oben bei einem Auftrag einen Produktionstag.'));
}

function prodPlanTable(title, rows, today, emptyText) {
  const hrs = rows.reduce((s, x) => s + x.R.minutes, 0);
  const panel = h('div', { class: 'panel' }, [h('h2', { class: 'sec' }, [title, h('span', { class: 'right mut', text: rows.length + ' · ' + hm(hrs) })])]);
  if (!rows.length) { panel.appendChild(h('p', { class: 'hint', text: emptyText })); return panel; }
  const tb = h('tbody');
  rows.forEach(x => tb.appendChild(prodPlanRow(x, today)));
  panel.appendChild(h('div', { class: 'tablewrap' }, [h('table', { class: 'tbl pd-plan' }, [
    h('thead', null, [h('tr', null, ['Auftrag', 'Kunde', 'Teile', 'Zeit', 'Liefern bis', 'Produktionstag', 'Status'].map((t, i) => h('th', { class: [1, 5, 6].includes(i) ? 'l' : null, text: t })))]),
    tb
  ])]));
  return panel;
}

function prodPlanRow(x, today) {
  const d = x.d, liefer = d.lieferDatum || '';
  let lCls = null, lNote = '';
  if (liefer && liefer < today) { lCls = 'neg'; lNote = 'überfällig'; }
  else if (liefer && liefer <= addDays(today, 3)) { lCls = 'pd-amber'; lNote = liefer === today ? 'heute' : 'knapp'; }
  const dateIn = h('input', { type: 'date', value: d.prodDatum || '', 'aria-label': 'Produktionstag für ' + (d.name || 'Auftrag'), onchange: e => {
    const v = e.target.value;
    prodSave(x.id, j => { j.prodDatum = v; }).then(() => toast(v ? 'Eingeplant für ' + fmtDate(v) : 'Produktionstag entfernt'), prodErr);
  } });
  const late = d.prodDatum && liefer && d.prodDatum > liefer;
  const setStatus = (st, msg) => prodSave(x.id, j => {
    j.status = st;
    if (st === 'geliefert' && !j.leistungsDatum) j.leistungsDatum = todayIso();
  }).then(() => toast(msg), prodErr);
  const stBtn = d.status === 'auftrag'
    ? h('button', { class: 'ghost mini', type: 'button', onclick: () => setStatus('produktion', 'Status: In Produktion') }, ['In Produktion'])
    : h('button', { class: 'primary mini', type: 'button', onclick: () => setStatus('geliefert', 'Status: Geliefert') }, ['Fertig → Geliefert']);
  return h('tr', null, [
    h('td', null, [h('button', { class: 'link', type: 'button', onclick: () => prodOpen(x.id) }, [d.name || 'Ohne Namen']), h('small', null, [statusBadge(d.status)])]),
    h('td', { class: 'l', text: d.kunde || '–' }),
    h('td', { text: String(x.R.totalQ) }),
    h('td', { text: hm(x.R.minutes) }),
    h('td', { class: lCls }, [liefer ? fmtDate(liefer) : '–', lNote ? h('small', { text: lNote }) : null]),
    h('td', { class: 'l' }, [dateIn, late ? h('small', { class: 'neg', text: 'liegt nach dem Liefertermin!' }) : null]),
    h('td', { class: 'l' }, [stBtn])
  ]);
}

// ======================= 2. Textil-Einkauf =======================
// Kundenware (bringt der Kunde mit) wird nicht bestellt
function prodKundenware(p) {
  const cat = catById(S, p.catId);
  const txt = prodLow(p.name) + ' ' + (cat ? prodLow(cat.name) + ' ' + prodLow(cat.kategorie) : '');
  return n(p.ek) === 0 && txt.includes('kundenware');
}

// Bedarf aus den Aufträgen: [{name (Lieferant), lines: [{name, artNr, farbe, need{größe}, res{}, stock{}, unit{}, sum, ek}], sum, ek}]
function prodBedarf(list) {
  const a = n(S.ausschuss) / 100, sup = {};
  list.forEach(x => {
    jobForVariant(x.J).positionen.forEach(p => {
      if ((p.typ || 'textil') !== 'textil' || prodKundenware(p)) return;
      const q = qtyOf(p); if (!(q > 0)) return;
      const cat = catById(S, p.catId);
      const lief = (cat && cat.lieferant ? String(cat.lieferant).trim() : '') || 'Ohne Lieferant';
      const name = p.name || (cat && cat.name) || 'Artikel';
      const key = (p.catId || '') + '|' + prodLow(name) + '|' + prodLow(p.farbe);
      if (!sup[lief]) sup[lief] = { name: lief, lines: {} };
      let L = sup[lief].lines[key];
      if (!L) L = sup[lief].lines[key] = { catId: p.catId || null, name, artNr: cat ? cat.artNr || '' : '', farbe: p.farbe || '', need: {}, res: {}, stock: {}, unit: {}, jobs: [] };
      const add = (s, c, unit) => { L.need[s] = (L.need[s] || 0) + c; if (L.unit[s] === undefined) L.unit[s] = unit; };
      if (p.ohneGroessen) add('ohne', Math.round(q), n(p.ek));
      else SIZES.forEach(s => { const c = Math.max(0, Math.round(n(p.groessen[s]))); if (c) add(s, c, n(p.ek) + surFor(p, s)); });
      // Reserve für Fehldrucke (Ausschuss) auf die häufigste Größe
      const res = Math.ceil(q * a - 1e-9);
      if (res > 0) {
        let top = 'ohne', best = -1;
        if (!p.ohneGroessen) SIZES.forEach(s => { const c = Math.round(n(p.groessen[s])); if (c > best) { best = c; top = s; } });
        add(top, res, n(p.ek) + (top === 'ohne' ? 0 : surFor(p, top)));
        L.res[top] = (L.res[top] || 0) + res;
      }
      const jn = x.d.name || 'Ohne Namen';
      if (!L.jobs.includes(jn)) L.jobs.push(jn);
    });
  });

  // Lagerbestand abziehen (Kopie, damit ein Lagerposten nicht doppelt verbraucht wird)
  const stock = Store.list('lager').filter(e => (e.data.typ || 'textil') === 'textil').map(e => ({
    catId: e.data.catId || null, name: prodLow(e.data.name), farbe: prodLow(e.data.farbe), g: e.data.groesse || 'ohne', left: Math.max(0, Math.round(n(e.data.menge)))
  }));
  const groups = Object.keys(sup).map(k => sup[k]).sort((x, y) => (x.name === 'Ohne Lieferant') - (y.name === 'Ohne Lieferant') || x.name.localeCompare(y.name, 'de'));
  groups.forEach(g => {
    g.lines = Object.keys(g.lines).map(k => g.lines[k]).sort((x, y) => x.name.localeCompare(y.name, 'de') || x.farbe.localeCompare(y.farbe, 'de'));
    g.sum = 0; g.ek = 0;
    g.lines.forEach(L => {
      L.sum = 0; L.ek = 0;
      PROD_SIZES.forEach(s => {
        let need = L.need[s] || 0;
        stock.forEach(st => {
          if (!need || !st.left || st.g !== s || st.farbe !== prodLow(L.farbe)) return;
          if (!(L.catId && st.catId ? st.catId === L.catId : st.name === prodLow(L.name))) return;
          const take = Math.min(need, st.left);
          st.left -= take; need -= take; L.stock[s] = (L.stock[s] || 0) + take;
        });
        L.need[s] = need;
        L.sum += need; L.ek += need * (L.unit[s] || 0);
      });
      g.sum += L.sum; g.ek += L.ek;
    });
  });
  return groups;
}
// Größen-Spalten, die in einer Gruppe vorkommen (Bildschirm und PDF)
function prodUsedCols(g) { return PROD_SIZES.filter(s => g.lines.some(L => (L.need[s] || 0) > 0 || (L.stock[s] || 0) > 0)); }

function prodTextil(box) {
  const list = prodJobs(d => PROD_ACTIVE.includes(d.status) && (PROD.showOrdered || !d.textilBestellt))
    .sort((a, b) => (a.d.lieferDatum || '9999').localeCompare(b.d.lieferDatum || '9999'));
  const sel = list.filter(x => !PROD.textOff[x.id]);

  const sw = h('input', { type: 'checkbox', checked: PROD.showOrdered, onchange: e => { PROD.showOrdered = e.target.checked; renderProduktion(); } });
  const pick = h('div', { class: 'panel' }, [
    h('h2', { class: 'sec' }, ['Aufträge', h('span', { class: 'right mut', text: sel.length + ' von ' + list.length + ' ausgewählt' })]),
    h('label', { class: 'check', style: 'margin:0 0 10px' }, [sw, h('span', null, ['Auch bereits bestellte zeigen', h('small', { text: 'Aufträge, bei denen die Textilien schon als bestellt markiert sind' })])])
  ]);
  box.appendChild(pick);
  if (!list.length) {
    pick.appendChild(h('p', { class: 'hint', text: 'Keine bestätigten Aufträge, für die noch Textilien bestellt werden müssen.' }));
    return;
  }
  pick.appendChild(prodPick(list, PROD.textOff, x => [
    x.d.lieferDatum ? 'liefern bis ' + fmtDate(x.d.lieferDatum) : '',
    x.d.textilBestellt ? 'bestellt am ' + fmtDate(x.d.textilBestellt) : ''
  ]));

  const groups = prodBedarf(sel);
  const total = groups.reduce((s, g) => s + g.sum, 0), totalEk = groups.reduce((s, g) => s + g.ek, 0);

  // Knöpfe
  const acts = h('div', { class: 'row pd-acts' }, [
    h('button', { class: 'ghost', type: 'button', disabled: !total, onclick: () => saveFile('Textil-Bestellung_' + todayIso() + '.csv', prodTextilCsv(groups)).then(() => toast('CSV gespeichert')) }, [icon('export'), 'CSV']),
    h('button', { class: 'ghost', type: 'button', disabled: !total, onclick: () => prodTextilPdf(groups) }, [icon('doc'), 'PDF-Bestellliste']),
    h('button', { class: 'primary', type: 'button', disabled: !sel.length, onclick: () => {
      const day = todayIso();
      prodBatch(sel.map(x => () => prodSave(x.id, j => { j.textilBestellt = day; })))
        .then(() => toast(sel.length + (sel.length === 1 ? ' Auftrag' : ' Aufträge') + ' als bestellt markiert'), prodErr);
    } }, [icon('check'), 'Als bestellt markieren'])
  ]);
  box.appendChild(h('div', { class: 'row between pd-sumbar' }, [
    h('div', { class: 'mut', text: total ? N0.format(total) + ' Teile bei ' + groups.length + (groups.length === 1 ? ' Lieferant' : ' Lieferanten') + ', ca. ' + eur(totalEk) + ' Einkauf netto' : '' }),
    acts
  ]));

  if (!groups.length) {
    box.appendChild(prodEmpty('Nichts zu bestellen', sel.length ? 'Die ausgewählten Aufträge enthalten keine Textilien (oder nur Kundenware).' : 'Wähl oben mindestens einen Auftrag aus.'));
    return;
  }
  groups.forEach(g => {
    const cols = prodUsedCols(g);
    const tb = h('tbody');
    g.lines.forEach(L => {
      const cells = cols.map(s => {
        const v = L.need[s] || 0, r = L.res[s] || 0, st = L.stock[s] || 0;
        const tip = [r ? 'inkl. ' + r + ' Reserve' : '', st ? st + ' aus dem Lager abgezogen' : ''].filter(Boolean).join(', ');
        return h('td', { class: r ? 'pd-res' : null, title: tip || null }, [v ? String(v) + (r ? '*' : '') : '–', st ? h('small', { text: '−' + st + ' Lager' }) : null]);
      });
      tb.appendChild(h('tr', { class: L.sum ? null : 'pd-done' }, [
        h('td', null, [L.name, h('small', { text: L.jobs.join(', ') })]),
        h('td', { class: 'l', text: L.artNr || '–' }),
        h('td', { class: 'l', text: L.farbe || '–' })
      ].concat(cells, [h('td', { text: String(L.sum) }), h('td', { text: eur(L.ek) })])));
    });
    tb.appendChild(h('tr', { class: 'sum' }, [h('td', { colspan: '3', text: 'Summe' })].concat(cols.map(s => h('td', { text: String(g.lines.reduce((t, L) => t + (L.need[s] || 0), 0)) })), [h('td', { text: String(g.sum) }), h('td', { text: eur(g.ek) })])));
    box.appendChild(h('div', { class: 'panel' }, [
      h('h2', { class: 'sec' }, [g.name, h('span', { class: 'right mut', text: g.sum + ' Teile · ' + eur(g.ek) })]),
      h('div', { class: 'tablewrap' }, [h('table', { class: 'tbl pd-tex' }, [
        h('thead', null, [h('tr', null, [h('th', { text: 'Artikel' }), h('th', { class: 'l', text: 'Art.-Nr.' }), h('th', { class: 'l', text: 'Farbe' })]
          .concat(cols.map(s => h('th', { text: s })), [h('th', { text: 'Summe' }), h('th', { text: 'EK gesamt' })]))]),
        tb
      ])])
    ]));
  });
  box.appendChild(h('p', { class: 'hint', text: '* enthält die Reserve für Fehldrucke (Ausschuss ' + pct(n(S.ausschuss)) + '), aufgeschlagen auf die häufigste Größe. Der Lagerbestand (Reiter „Lager“) ist schon abgezogen. EK = Stück × Einkaufspreis der Position inkl. Übergrößen-Aufpreis.' }));
}

// CSV für Excel: Semikolon, deutsche Zahlen, BOM für Umlaute
function prodTextilCsv(groups) {
  const esc = v => { const s = String(v === null || v === undefined ? '' : v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const head = ['Lieferant', 'Artikel', 'Art.-Nr.', 'Farbe'].concat(PROD_SIZES, ['Summe', 'EK gesamt', 'davon Reserve', 'aus Lager']);
  const rows = [];
  groups.forEach(g => g.lines.forEach(L => {
    if (!L.sum) return;
    const res = PROD_SIZES.reduce((s, k) => s + (L.res[k] || 0), 0), st = PROD_SIZES.reduce((s, k) => s + (L.stock[k] || 0), 0);
    rows.push([g.name, L.name, L.artNr, L.farbe].concat(PROD_SIZES.map(s => L.need[s] || ''), [L.sum, N2.format(L.ek), res || '', st || '']).map(esc).join(';'));
  }));
  return '﻿' + [head.map(esc).join(';')].concat(rows).join('\r\n');
}

// PDF-Bestellliste: eine Tabelle je Lieferant
async function prodTextilPdf(groups) {
  try { await loadScript(LIB.jspdf); } catch (e) { toast('Die PDF-Bibliothek konnte nicht geladen werden. Bist du online?', true); return; }
  const F = pdfFrame('Bestellliste', { name: 'Textil-Bestellung' }, S, { anschrift: false, betreff: 'Textil-Bestellung', info: [['Datum', fmtDate(todayIso())]] });
  const { doc, L: X, Rr, W, setF } = F;
  let anyRes = false;
  groups.forEach(g => {
    const lines = g.lines.filter(L => L.sum > 0);
    if (!lines.length) return;
    const cols = PROD_SIZES.filter(s => lines.some(L => (L.need[s] || 0) > 0));
    const sw = Math.min(10, (W - 48 - 14 - 40) / Math.max(cols.length, 1));
    const aw = W - 48 - 14 - cols.length * sw;
    const xNr = X + aw, xFarbe = xNr + 24, xSize = xFarbe + 24, xSum = Rr;
    const header = () => {
      setF('bold', 8, 90);
      doc.text('Artikel', X, F.y); doc.text('Art.-Nr.', xNr, F.y); doc.text('Farbe', xFarbe, F.y);
      cols.forEach((s, i) => doc.text(s, xSize + (i + 1) * sw - 1, F.y, { align: 'right' }));
      doc.text('Summe', xSum, F.y, { align: 'right' });
      doc.setDrawColor(170); doc.line(X, F.y + 1.5, Rr, F.y + 1.5);
      F.y += 5.5; setF('normal', 8.5);
    };
    F.need(24);
    setF('bold', 11); F.text(g.name); F.y += 6;
    header();
    F.onNewPage = header;
    lines.forEach(L => {
      F.need(6);
      setF('normal', 8.5);
      doc.text(doc.splitTextToSize(pdfTxt(L.name), aw - 2)[0], X, F.y);
      doc.text(doc.splitTextToSize(pdfTxt(L.artNr || '-'), 22)[0], xNr, F.y);
      doc.text(doc.splitTextToSize(pdfTxt(L.farbe || '-'), 22)[0], xFarbe, F.y);
      cols.forEach((s, i) => {
        const v = L.need[s] || 0;
        if (L.res[s] && v) anyRes = true;
        if (v) doc.text(String(v) + (L.res[s] ? '*' : ''), xSize + (i + 1) * sw - 1, F.y, { align: 'right' });
      });
      setF('bold', 8.5); doc.text(String(L.sum), xSum, F.y, { align: 'right' });
      doc.setDrawColor(225); doc.line(X, F.y + 1.8, Rr, F.y + 1.8);
      F.y += 5.5;
    });
    F.onNewPage = null;
    F.need(8);
    setF('bold', 9); doc.text('Summe ' + pdfTxt(g.name), X, F.y);
    cols.forEach((s, i) => { const t = lines.reduce((a, L) => a + (L.need[s] || 0), 0); if (t) doc.text(String(t), xSize + (i + 1) * sw - 1, F.y, { align: 'right' }); });
    doc.text(String(g.sum), xSum, F.y, { align: 'right' });
    F.y += 10; setF();
  });
  if (anyRes) { F.need(8); setF('normal', 8, 110); F.para('* inkl. Reserve für Fehldrucke'); setF(); }
  try {
    await saveFile('Textil-Bestellung_' + todayIso() + '.pdf', F.finish().output('arraybuffer'));
    toast('Bestellliste gespeichert');
  } catch (e) { console.error(e); toast('Die PDF konnte nicht gespeichert werden.', true); }
}

// ======================= 3. Sammel-Folie =======================
// Alle Motive der gewählten Aufträge gemeinsam auf eine Folie planen und die Kosten nach Fläche verteilen
function prodSammelCalc(sel, AN) {
  const g = Math.max(n(S.abstand), 0), W = Math.max(n(AN.breite), 1);
  const items = [];
  sel.forEach((x, ji) => x.R.rows.forEach(r => {
    if (!(r.np > 0)) return;
    validMotifs(r.p).forEach(m => items.push({ w: n(m.w), h: n(m.h), count: r.np, pi: ji, label: (m.name || 'Motiv') + ' · ' + (x.d.name || 'Auftrag') }));
  }));
  const plan = planFilm(items, W, g);
  const area = sel.map(() => 0);
  let areaAll = 0, used = 0;
  plan.shelves.forEach(sh => sh.items.forEach(it => { const ar = (it.w + g) * (it.h + g); area[it.pi] += ar; areaAll += ar; used += it.w * it.h; }));
  const rawCm = plan.len * (1 + n(S.folieZuschlag) / 100);
  const F = filmCostFor(AN, rawCm, used, false, S);
  const einzel = sel.reduce((s, x) => s + x.R.filmCost, 0);
  const parts = sel.map((x, i) => {
    const f = areaAll > 0 ? area[i] / areaAll : 0;
    return { x, f, cost: F.cost * f, meter: F.meter * f, color: PCOL[i % PCOL.length] };
  });
  return { plan, F, W, rawCm, einzel, parts, saving: einzel - F.cost };
}

// Folie waagerecht zeichnen (wie drawSheet in app.js), Aufträge farbig
function prodSammelDraw(cv, wrap, res) {
  if (!wrap.clientWidth) return;
  const W = res.W, band = 110, tick = 18, lenCm = Math.max(res.F.cm, res.F.meter * 100, 1);
  let scale = band / W, px = lenCm * scale;
  if (px > 16000) { scale = 16000 / lenCm; px = 16000; }
  const hPx = W * scale + tick, wPx = Math.max(px, wrap.clientWidth - 2);
  const dpr = Math.min(window.devicePixelRatio || 1, 2, 30000 / wPx);
  cv.width = Math.round(wPx * dpr); cv.height = Math.round(hPx * dpr); cv.style.width = wPx + 'px'; cv.style.height = hPx + 'px';
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.fillStyle = cssVar('--card'); c.fillRect(0, 0, wPx, hPx);
  c.fillStyle = cssVar('--film'); c.fillRect(0, tick, lenCm * scale, W * scale);
  const cols = PCOL.map(cssVar);
  res.plan.shelves.forEach(sh => sh.items.forEach(it => {
    c.fillStyle = cols[it.pi % cols.length];
    c.fillRect(sh.y * scale, tick + it.x * scale, Math.max(it.h * scale, 1), Math.max(it.w * scale, 1));
  }));
  c.fillStyle = cssVar('--mut'); c.strokeStyle = cssVar('--mut'); c.font = '11px "Segoe UI", sans-serif';
  const every = scale * 100 < 40 ? (scale * 100 < 14 ? 10 : 5) : 1;
  for (let m = 0; m * 100 <= lenCm + 1; m += every) {
    const x = m * 100 * scale;
    c.beginPath(); c.moveTo(x + .5, tick - 6); c.lineTo(x + .5, tick); c.stroke();
    if (m > 0) c.fillText(m + ' m', x + 3, 11);
  }
  if (res.F.meter > 0) {
    const bx = res.F.meter * 100 * scale;
    c.strokeStyle = cssVar('--acc'); c.setLineDash([4, 3]);
    c.beginPath(); c.moveTo(bx + .5, tick); c.lineTo(bx + .5, hPx); c.stroke(); c.setLineDash([]);
  }
}

function prodSammel(box) {
  const list = prodJobs(d => PROD_ACTIVE.includes(d.status) && !d.sammelId).filter(x => x.R.transfers > 0);
  if (!S.anbieter.some(a => a.id === PROD.anId)) PROD.anId = S.anbieterId;
  const AN = S.anbieter.find(a => a.id === PROD.anId) || S.anbieter[0];
  const sel = list.filter(x => !PROD.sammelOff[x.id]);

  const anSel = h('select', { 'aria-label': 'Anbieter', onchange: e => { PROD.anId = e.target.value; renderProduktion(); } }, S.anbieter.map(a => prodOpt(a.id, (a.name || 'Anbieter') + ' · ' + N1.format(n(a.breite)) + ' cm')));
  anSel.value = AN.id;
  const pick = h('div', { class: 'panel' }, [
    h('h2', { class: 'sec' }, ['Aufträge zusammen bestellen', h('span', { class: 'right mut', text: sel.length + ' von ' + list.length + ' ausgewählt' })]),
    h('p', { class: 'hint', text: 'Bestätigte Aufträge mit Transfers, die noch in keiner Sammelbestellung sind. Alle Motive kommen gemeinsam auf eine Folie. Das spart Vorlauf, Mindestmenge und Versand und bringt oft eine bessere Preisstufe.' }),
    lbl('Anbieter', anSel, 'pd-an')
  ]);
  box.appendChild(pick);

  if (!list.length) pick.appendChild(h('p', { class: 'hint', text: 'Gerade gibt es keine passenden Aufträge.' }));
  else {
    pick.appendChild(prodPick(list, PROD.sammelOff, x => [x.R.transfers + ' Transfers', 'einzeln ' + N2.format(x.R.meter) + ' m · ' + eur(x.R.filmCost)]));
    if (sel.length) prodSammelResult(box, sel, AN);
  }
  prodSammelList(box);
}

function prodSammelResult(box, sel, AN) {
  const res = prodSammelCalc(sel, AN), F = res.F;
  const panel = h('div', { class: 'panel' }, [h('h2', { class: 'sec' }, ['Gemeinsame Folie', h('span', { class: 'right mut', text: AN.name || 'Anbieter' })])]);
  box.appendChild(panel);
  panel.appendChild(h('div', { class: 'stats' }, [
    h('div', null, [h('span', { text: 'Gemeinsam' }), h('strong', { text: eur(F.cost) }), h('small', { text: N2.format(F.meter) + ' m zu ' + eur(F.preis) + '/m' + (F.versand > 0 ? ' + ' + eur(F.versand) + ' Versand' : '') })]),
    h('div', null, [h('span', { text: 'Einzeln bestellt' }), h('strong', { text: eur(res.einzel) }), h('small', { text: sel.length + (sel.length === 1 ? ' Auftrag' : ' Aufträge') })]),
    h('div', { class: res.saving >= 0 ? 'pos' : 'neg' }, [h('span', { text: res.saving >= 0 ? 'Ersparnis' : 'Mehrkosten' }), h('strong', { text: eur(Math.abs(res.saving)) }), h('small', { text: res.einzel > 0 ? pct(res.saving / res.einzel * 100) + ' der Einzelkosten' : '' })]),
    h('div', null, [h('span', { text: 'Motive' }), h('strong', { text: N1.format(res.plan.len / 100) + ' m' }), h('small', { text: res.plan.shelves.length + ' Reihen' + (n(S.folieZuschlag) > 0 ? ', +' + pct(n(S.folieZuschlag)) + ' Zuschlag' : '') })])
  ]));
  if (res.plan.warnings.length) {
    const c = h('div', { class: 'callout pd-warn' }, [h('strong', { text: 'Passt nicht auf die Folie:' })]);
    res.plan.warnings.forEach(w => c.appendChild(h('div', { text: w })));
    panel.appendChild(c);
  }
  // Vorschau
  const cv = h('canvas', { role: 'img', 'aria-label': 'Vorschau der gemeinsamen Folie' });
  const wrap = h('div', { class: 'sheet pd-sheet' }, [cv]);
  panel.appendChild(wrap);
  requestAnimationFrame(() => prodSammelDraw(cv, wrap, res));

  // Verteilung
  const tb = h('tbody');
  res.parts.forEach(p => tb.appendChild(h('tr', null, [
    h('td', null, [h('span', { class: 'sw', style: 'background:var(' + p.color + ')' }), p.x.d.name || 'Ohne Namen', p.x.d.kunde ? h('small', { text: p.x.d.kunde }) : null]),
    h('td', { text: pct(p.f * 100) }),
    h('td', { text: N2.format(p.meter) + ' m' }),
    h('td', { text: eur(p.cost) }),
    h('td', { text: eur(p.x.R.filmCost) }),
    h('td', { class: p.x.R.filmCost - p.cost >= 0 ? 'good' : 'neg', text: eur(p.x.R.filmCost - p.cost) })
  ])));
  tb.appendChild(h('tr', { class: 'sum' }, [h('td', { text: 'Summe' }), h('td', { text: '100 %' }), h('td', { text: N2.format(F.meter) + ' m' }), h('td', { text: eur(F.cost) }), h('td', { text: eur(res.einzel) }), h('td', { class: res.saving >= 0 ? 'good' : 'neg', text: eur(res.saving) })]));
  panel.appendChild(h('div', { class: 'tablewrap', style: 'margin-top:12px' }, [h('table', { class: 'tbl' }, [
    h('thead', null, [h('tr', null, ['Auftrag', 'Flächenanteil', 'Meter anteilig', 'Kosten anteilig', 'Einzeln', 'Ersparnis'].map(t => h('th', { text: t })))]),
    tb
  ])]));
  panel.appendChild(h('p', { class: 'hint', style: 'margin-top:10px', text: 'Die Kosten werden nach belegter Fläche (Motiv + Abstand) verteilt. Beim Anlegen trägt jeder Auftrag seinen Anteil als „echte Folienkosten“ und „echte Folie“ in der Nachkalkulation ein. Der Angebotspreis ändert sich nicht.' }));
  panel.appendChild(h('div', { class: 'row pd-acts' }, [
    h('button', { class: 'ghost', type: 'button', onclick: () => prodSammelExport(sel, AN) }, [icon('export'), 'Für Gang-Sheet-Konfigurator exportieren']),
    h('button', { class: 'primary', type: 'button', disabled: !(F.cost > 0), onclick: () => prodSammelAnlegen(res, AN) }, [icon('film'), 'Sammelbestellung anlegen'])
  ]));
}

function prodSammelAnlegen(res, AN) {
  const bid = uid(), anteile = {};
  res.parts.forEach(p => { anteile[p.x.id] = r2(p.cost); });
  const best = {
    datum: todayIso(), anbieterId: AN.id, anbieterName: AN.name || '', jobIds: res.parts.map(p => p.x.id),
    meter: r2(res.F.meter), kosten: r2(res.F.cost), anteile, einzelKosten: r2(res.einzel), createdAt: Date.now()
  };
  ask('Sammelbestellung über ' + N2.format(res.F.meter) + ' m für ' + eur(res.F.cost) + ' anlegen? Der Kostenanteil wird in ' + res.parts.length + (res.parts.length === 1 ? ' Auftrag' : ' Aufträge') + ' eingetragen.', { title: 'Sammelbestellung anlegen', ok: 'Anlegen' }).then(ok => {
    if (!ok) return;
    const tasks = [() => Store.put('bestellungen', bid, best)].concat(res.parts.map(p => () => prodSave(p.x.id, j => {
      j.sammelId = bid; j.ist.folieKosten = r2(p.cost); j.ist.meter = r2(p.meter);
    })));
    prodBatch(tasks).then(() => toast('Sammelbestellung angelegt'), prodErr);
  });
}

function prodSammelAufloesen(e) {
  ask('Sammelbestellung vom ' + fmtDate(e.data.datum) + ' auflösen? Die Folienkosten werden aus den Aufträgen wieder entfernt.', { title: 'Sammelbestellung auflösen', ok: 'Auflösen', danger: true }).then(ok => {
    if (!ok) return;
    const tasks = (e.data.jobIds || []).filter(id => Store.jobs.some(j => j.id === id && j.data.sammelId === e.id))
      .map(id => () => prodSave(id, j => { j.sammelId = ''; j.ist.folieKosten = ''; j.ist.meter = ''; }));
    tasks.push(() => Store.del('bestellungen', e.id));
    prodBatch(tasks).then(() => toast('Sammelbestellung aufgelöst'), prodErr);
  });
}

// Projektdatei für den Gang-Sheet-Konfigurator (nur Druckstellen mit Bild)
function prodSammelExport(sel, AN) {
  const items = [];
  let missing = 0;
  sel.forEach(x => x.R.rows.forEach(r => {
    if (!(r.np > 0)) return;
    validMotifs(r.p).forEach(m => {
      if (!m.img) { missing++; return; }
      items.push({ name: (m.name || 'Motiv') + ' · ' + (x.d.name || 'Auftrag'), image: m.img, cm: n(m.w), sizeRef: 'w', qty: r.np, bg: {}, hardAlpha: false, ht: {}, aiMask: null });
    });
  }));
  if (!items.length) { toast('Keine Druckstelle hat ein Bild. Hinterlege die Motive zuerst im Auftrag.', true); return; }
  const proj = {
    app: 'gang-sheet-konfigurator', version: 1, saved: new Date().toISOString(),
    settings: { sheetWCm: n(AN.breite), sheetHCm: 100, marginMm: 5, gapMm: n(S.abstand) * 10, dpi: 300, mirror: false, rotate: true, contour: false },
    items, manual: false, sheets: null
  };
  saveFile('gang-sheet-sammel_' + todayIso() + '.json', JSON.stringify(proj)).then(() => {
    toast(items.length + (items.length === 1 ? ' Motiv' : ' Motive') + ' exportiert');
    if (missing) toast(missing + (missing === 1 ? ' Druckstelle hat' : ' Druckstellen haben') + ' kein Bild und fehlen in der Datei.', true);
  }, () => toast('Die Datei konnte nicht gespeichert werden.', true));
}

function prodSammelList(box) {
  const list = Store.list('bestellungen').slice().sort((a, b) => (b.data.datum || '').localeCompare(a.data.datum || '') || n(b.data.createdAt) - n(a.data.createdAt));
  const panel = h('div', { class: 'panel' }, [h('h2', { class: 'sec' }, ['Bisherige Sammelbestellungen'])]);
  box.appendChild(panel);
  if (!list.length) { panel.appendChild(h('p', { class: 'hint', text: 'Noch keine Sammelbestellung angelegt.' })); return; }
  const tb = h('tbody');
  list.forEach(e => {
    const d = e.data || {}, an = S.anbieter.find(a => a.id === d.anbieterId);
    const names = (d.jobIds || []).map(id => { const j = Store.jobs.find(x => x.id === id); return j ? (j.data.name || 'Ohne Namen') : 'gelöschter Auftrag'; });
    const sav = n(d.einzelKosten) - n(d.kosten);
    tb.appendChild(h('tr', null, [
      h('td', { text: fmtDate(d.datum) }),
      h('td', { class: 'l', text: (an && an.name) || d.anbieterName || '–' }),
      h('td', { text: N2.format(n(d.meter)) + ' m' }),
      h('td', { text: eur(n(d.kosten)) }),
      h('td', { class: sav >= 0 ? 'good' : 'neg', text: eur(sav) }),
      h('td', { class: 'l pd-names', text: names.join(', ') || '–' }),
      h('td', null, [h('button', { class: 'ghost mini danger', type: 'button', onclick: () => prodSammelAufloesen(e) }, ['Auflösen'])])
    ]));
  });
  panel.appendChild(h('div', { class: 'tablewrap' }, [h('table', { class: 'tbl' }, [
    h('thead', null, [h('tr', null, [h('th', { text: 'Datum' }), h('th', { class: 'l', text: 'Anbieter' }), h('th', { text: 'Meter' }), h('th', { text: 'Kosten' }), h('th', { text: 'Ersparnis' }), h('th', { class: 'l', text: 'Aufträge' }), h('th')])]),
    tb
  ])]));
}

// ======================= 4. Lager =======================
// Einfache Faustregel: klingt die Farbe dunkel, gilt der EK für dunkle Textilien
const PROD_DARK_RE = /schwarz|black|navy|marine|dunkel|dark|anthrazit|graphit|charcoal|bordeaux|burgund|weinrot|oliv|flasche|forest|braun|schoko|choco|petrol/i;
function prodLagerWert(d) {
  const cat = d.catId ? catById(S, d.catId) : null;
  if (!cat) return 0;
  return Math.max(0, n(d.menge)) * n(PROD_DARK_RE.test(d.farbe || '') ? cat.ekDunkel : cat.ekHell);
}
function prodLagerSave(e, patch) {
  return Store.put('lager', e.id, Object.assign(clone(e.data), patch, { updatedAt: Date.now() })).catch(prodErr);
}

function prodLager(box) {
  const f = PROD.form;
  // Formular „Bestand hinzufügen“
  const typSel = h('select', { onchange: e => { f.typ = e.target.value; if (f.typ !== 'textil') f.catId = ''; renderProduktion(); } }, [prodOpt('textil', 'Textil'), prodOpt('sonstiges', 'Transfer / Sonstiges')]);
  typSel.value = f.typ;
  const catSel = h('select', { onchange: e => { f.catId = e.target.value; const c = catById(S, f.catId); if (c) f.name = c.name; renderProduktion(); } },
    [prodOpt('', 'Freier Name')].concat(S.artikel.map(a => prodOpt(a.id, a.name + (a.artNr ? ' (' + a.artNr + ')' : '')))));
  catSel.value = f.catId || '';
  const gSel = h('select', { onchange: e => { f.groesse = e.target.value; } }, [prodOpt('ohne', 'ohne')].concat(SIZES.map(s => prodOpt(s, s))));
  gSel.value = f.groesse || 'ohne';
  const form = h('div', { class: 'pd-lform' }, [
    lbl('Typ', typSel),
    f.typ === 'textil' ? lbl('Katalog', catSel) : null,
    lbl('Artikel', textIn(f.name, v => { f.name = v; }, { placeholder: f.typ === 'textil' ? 'z. B. T-Shirt' : 'z. B. Transfer Logo 10 cm' })),
    lbl('Farbe', textIn(f.farbe, v => { f.farbe = v; }, { placeholder: 'z. B. Schwarz' })),
    lbl('Größe', gSel),
    lbl('Menge', numIn(f.menge, '1', v => { f.menge = v; })),
    lbl('Notiz', textIn(f.notiz, v => { f.notiz = v; })),
    h('button', { class: 'primary', type: 'button', onclick: prodLagerAdd }, [icon('plus'), 'Hinzufügen'])
  ]);
  box.appendChild(h('div', { class: 'panel' }, [h('h2', { class: 'sec' }, ['Bestand hinzufügen']), form,
    h('p', { class: 'hint', style: 'margin-top:10px', text: 'Gibt es denselben Artikel in gleicher Farbe und Größe schon, wird die Menge addiert. Textil im Lager wird beim Textil-Einkauf automatisch abgezogen.' })]));

  // Tabelle mit Suche und Filter
  const panel = h('div', { class: 'panel' });
  const tb = h('tbody'), sumEl = h('span', { class: 'right mut' });
  const chips = h('div', { class: 'chips' });
  [['alle', 'Alle'], ['textil', 'Textil'], ['sonstiges', 'Transfer / Sonstiges']].forEach(([k, l]) => chips.appendChild(h('button', { class: 'chip', type: 'button', 'aria-pressed': String(PROD.lagerTyp === k), onclick: () => { PROD.lagerTyp = k; renderProduktion(); } }, [l])));
  const search = h('input', { type: 'search', value: PROD.lagerQ, placeholder: 'Artikel, Farbe oder Notiz suchen', oninput: e => { PROD.lagerQ = e.target.value; prodLagerRows(tb, sumEl); } });
  panel.appendChild(h('h2', { class: 'sec' }, ['Lagerbestand', sumEl]));
  panel.appendChild(h('div', { class: 'toolbar' }, [chips, search]));
  panel.appendChild(h('div', { class: 'tablewrap' }, [h('table', { class: 'tbl pd-lager' }, [
    h('thead', null, [h('tr', null, [h('th', { text: 'Artikel' }), h('th', { class: 'l', text: 'Typ' }), h('th', { class: 'l', text: 'Farbe' }), h('th', { class: 'l', text: 'Größe' }), h('th', { class: 'ctr', text: 'Menge' }), h('th', { text: 'Wert' }), h('th', { class: 'l', text: 'Notiz' }), h('th')])]),
    tb
  ])]));
  box.appendChild(panel);
  prodLagerRows(tb, sumEl);

  prodFehldrucke(box);
}

function prodLagerRows(tb, sumEl) {
  tb.textContent = '';
  const q = prodLow(PROD.lagerQ);
  const all = Store.list('lager');
  const rows = all.filter(e => {
    const d = e.data || {}, typ = d.typ || 'textil';
    if (PROD.lagerTyp !== 'alle' && typ !== PROD.lagerTyp) return false;
    const cat = d.catId ? catById(S, d.catId) : null;
    return !q || [d.name, cat && cat.name, cat && cat.artNr, d.farbe, d.groesse, d.notiz].map(prodLow).join(' ').includes(q);
  }).sort((a, b) => prodLow(a.data.name).localeCompare(prodLow(b.data.name), 'de') || prodLow(a.data.farbe).localeCompare(prodLow(b.data.farbe), 'de') ||
    PROD_SIZES.indexOf(a.data.groesse || 'ohne') - PROD_SIZES.indexOf(b.data.groesse || 'ohne'));
  let stk = 0, wert = 0;
  rows.forEach(e => {
    const d = e.data, m = Math.max(0, Math.round(n(d.menge))), cat = d.catId ? catById(S, d.catId) : null, w = prodLagerWert(d);
    stk += m; wert += w;
    const mIn = h('input', { type: 'number', step: '1', min: '0', value: String(m), 'aria-label': 'Menge', onchange: ev => prodLagerSave(e, { menge: Math.max(0, Math.round(n(ev.target.value))) }) });
    tb.appendChild(h('tr', { class: m ? null : 'pd-done' }, [
      h('td', null, [d.name || (cat && cat.name) || 'Ohne Namen', cat && cat.artNr ? h('small', { text: cat.artNr }) : null]),
      h('td', { class: 'l', text: (d.typ || 'textil') === 'textil' ? 'Textil' : 'Transfer / Sonstiges' }),
      h('td', { class: 'l', text: d.farbe || '–' }),
      h('td', { class: 'l', text: d.groesse || 'ohne' }),
      h('td', { class: 'ctr' }, [h('div', { class: 'pd-qty' }, [
        h('button', { class: 'ghost mini', type: 'button', 'aria-label': 'Eins weniger', disabled: m <= 0, onclick: () => prodLagerSave(e, { menge: Math.max(0, m - 1) }) }, ['−']),
        mIn,
        h('button', { class: 'ghost mini', type: 'button', 'aria-label': 'Eins mehr', onclick: () => prodLagerSave(e, { menge: m + 1 }) }, ['+'])
      ])]),
      h('td', { text: cat ? eur(w) : '–' }),
      h('td', { class: 'l' }, [h('input', { value: d.notiz || '', 'aria-label': 'Notiz', class: 'pd-note', onchange: ev => prodLagerSave(e, { notiz: ev.target.value }) })]),
      h('td', null, [h('button', { class: 'x', type: 'button', 'aria-label': 'Löschen', onclick: () => ask('„' + (d.name || 'Eintrag') + '“ aus dem Lager löschen?', { title: 'Lagereintrag löschen', ok: 'Löschen', danger: true }).then(ok => { if (ok) Store.del('lager', e.id).catch(prodErr); }) }, ['×'])])
    ]));
  });
  if (!rows.length) tb.appendChild(h('tr', null, [h('td', { colspan: '8', class: 'l mut', text: all.length ? 'Keine Treffer.' : 'Noch nichts im Lager. Trag oben Restbestände ein.' })]));
  else tb.appendChild(h('tr', { class: 'sum' }, [h('td', { colspan: '4', text: 'Summe' }), h('td', { class: 'ctr', text: N0.format(stk) + ' Stk.' }), h('td', { text: eur(wert) }), h('td', { colspan: '2' })]));
  sumEl.textContent = N0.format(stk) + ' Stk. · ' + eur(wert);
}

function prodLagerAdd() {
  const f = PROD.form, menge = Math.round(n(f.menge));
  const cat = f.typ === 'textil' && f.catId ? catById(S, f.catId) : null;
  const name = String(f.name || '').trim() || (cat ? cat.name : '');
  if (!name) { toast('Gib einen Artikel an.', true); return; }
  if (!(menge > 0)) { toast('Die Menge muss größer als 0 sein.', true); return; }
  const entry = { typ: f.typ, catId: cat ? cat.id : null, name, farbe: String(f.farbe || '').trim(), groesse: f.groesse || 'ohne', menge, notiz: String(f.notiz || '').trim(), updatedAt: Date.now() };
  const same = Store.list('lager').find(e => (e.data.typ || 'textil') === entry.typ && (e.data.catId || null) === entry.catId &&
    prodLow(e.data.name) === prodLow(entry.name) && prodLow(e.data.farbe) === prodLow(entry.farbe) && (e.data.groesse || 'ohne') === entry.groesse);
  f.menge = 1; f.notiz = '';
  const p = same
    ? Store.put('lager', same.id, Object.assign(clone(same.data), { menge: Math.max(0, Math.round(n(same.data.menge))) + menge, notiz: same.data.notiz || entry.notiz, updatedAt: Date.now() }))
    : Store.put('lager', uid(), entry);
  p.then(() => toast(same ? 'Menge zum vorhandenen Bestand addiert' : 'Bestand hinzugefügt'), prodErr);
}

// Echte Ausschussquote aus den erfassten Fehldrucken
function prodFehldrucke(box) {
  let fehl = 0, teile = 0, cnt = 0;
  prodJobs(d => d.ist && !isBlank(d.ist.fehldrucke)).forEach(x => {
    cnt++; fehl += Math.max(0, n(x.d.ist.fehldrucke));
    teile += x.R.textilQ > 0 ? x.R.textilQ : x.R.totalQ;
  });
  const panel = h('div', { class: 'panel' }, [h('h2', { class: 'sec' }, ['Fehldrucke'])]);
  box.appendChild(panel);
  if (!cnt) {
    panel.appendChild(h('p', { class: 'hint', text: 'Noch keine Fehldrucke erfasst. Trag sie im Auftrag unter „Nachkalkulation“ ein (auch 0, wenn alles geklappt hat). Dann siehst du hier deine echte Ausschussquote.' }));
    return;
  }
  const real = teile > 0 ? fehl / teile * 100 : 0, set = n(S.ausschuss);
  panel.appendChild(h('div', { class: 'stats' }, [
    h('div', { class: real > set + 0.5 ? 'neg' : 'pos' }, [h('span', { text: 'Echte Quote' }), h('strong', { text: pct(real) }), h('small', { text: 'eingestellt: ' + pct(set) })]),
    h('div', null, [h('span', { text: 'Fehldrucke' }), h('strong', { text: N0.format(fehl) }), h('small', { text: 'Teile insgesamt' })]),
    h('div', null, [h('span', { text: 'Gedruckte Teile' }), h('strong', { text: N0.format(teile) }), h('small', { text: 'ohne Ausschuss' })]),
    h('div', null, [h('span', { text: 'Aufträge' }), h('strong', { text: String(cnt) }), h('small', { text: 'mit erfassten Fehldrucken' })])
  ]));
  const diff = real - set;
  const txt = cnt < 3 ? 'Noch wenig Daten (' + cnt + (cnt === 1 ? ' Auftrag' : ' Aufträge') + '). Die Quote wird genauer, je mehr Aufträge du erfasst.'
    : Math.abs(diff) < 0.5 ? 'Dein eingestellter Ausschuss passt gut zur Wirklichkeit.'
    : diff > 0 ? 'Du verdruckst mehr als eingeplant. Erhöhe den Ausschuss in den Einstellungen auf etwa ' + pct(Math.ceil(real)) + ', sonst fehlen dir Teile und Geld.'
    : 'Du verdruckst weniger als eingeplant. Du kannst den Ausschuss in den Einstellungen auf etwa ' + pct(Math.ceil(real)) + ' senken und günstiger anbieten.';
  panel.appendChild(h('div', { class: 'callout' }, [h('span', { text: txt }), h('div', null, [h('button', { class: 'ghost mini', type: 'button', onclick: () => showView('einst') }, ['Einstellungen öffnen'])])]));
}

// ======================= Anmelden =======================
HOOKS.views.produktion = renderProduktion;
Store.onChange(name => {
  if (!['jobs', 'lager', 'bestellungen'].includes(name) || PROD.busy) return;
  if (view === 'produktion') renderProduktion();
});
