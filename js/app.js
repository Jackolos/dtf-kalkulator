// Oberfläche: verbindet Eingaben, Rechnung (calc.js), Speicher (store.js) und Dokumente (pdf.js).

// ======================= Zustand =======================
let S = DEFAULTS();            // Einstellungen
let job = exampleJob(S);       // offener Auftrag
let last = null;               // letztes Rechenergebnis
let view = 'auftrag', tab = 'angebot', listFilter = 'alle', period = 'jahr';
let dirty = false, sDirty = false, saving = false, touched = false;
let enterId = null;            // neue Position (für Einblend-Animation)

// ======================= Kleine Helfer =======================
function setText(id, t) { const e = $(id); if (e) e.textContent = t; }
let reduceMotion = false;
try { reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
const tw = {};
// Zahl weich hochzählen lassen
function tween(id, to) {
  const el = $(id); if (!el) return;
  const from = tw[id] === undefined ? to : tw[id]; tw[id] = to;
  if (from === to || reduceMotion) { el.textContent = eur(to); return; }
  const t0 = performance.now(), d = 450;
  if (el._raf) cancelAnimationFrame(el._raf);
  (function step(t) { let k = Math.min(1, (t - t0) / d); k = 1 - Math.pow(1 - k, 3); el.textContent = eur(from + (to - from) * k); if (k < 1) el._raf = requestAnimationFrame(step); })(t0);
}
function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888'; }

function toast(text, warn) {
  const t = h('div', { class: 'toast' + (warn ? ' warn' : '') }, [icon(warn ? 'alert' : 'check'), h('span', { text })]);
  t.addEventListener('click', () => t.remove());
  $('toasts').appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 260); }, warn ? 5000 : 2600);
}
// Meldung oben im Auftrag (mit Liste und Knöpfen)
function showMsg(text, kind, list) {
  if (kind === 'info' && (!list || !list.length)) { toast(text); return; }
  if (view !== 'auftrag') { toast(text, kind !== 'info'); return; }
  const m = $('msg'); m.textContent = ''; m.className = 'msg' + (kind ? ' ' + kind : '');
  const body = h('div', { style: 'flex:1;min-width:200px' }, [h('div', { text })]);
  if (list && list.length) { const ul = h('ul'); list.forEach(t => ul.appendChild(h('li', { text: t }))); body.appendChild(ul); }
  m.appendChild(body);
  m.appendChild(h('button', { class: 'link', type: 'button', onclick: () => { m.hidden = true; } }, ['Schließen']));
  m.hidden = false; m.scrollIntoView({ block: 'nearest' });
}
// Rückfrage im eigenen Fenster. Gibt den „value“ des gedrückten Knopfs zurück.
function ask(text, opts) {
  opts = opts || {};
  const buttons = opts.buttons || [{ label: opts.ok || 'OK', value: true, cls: opts.danger ? 'primary danger' : 'primary' }, { label: 'Abbrechen', value: false, cls: 'ghost' }];
  return new Promise(res => {
    const d = $('askDlg');
    setText('askTitle', opts.title || 'Bist du sicher?'); setText('askText', text);
    const box = $('askActions'); box.textContent = '';
    buttons.slice().reverse().forEach(b => box.appendChild(h('button', { class: b.cls || 'ghost', type: 'button', onclick: () => { d.close(); res(b.value); } }, [b.label])));
    d.oncancel = () => res(false);
    d.showModal();
  });
}
function numIn(val, step, onv, extra) {
  const a = { type: 'number', step, min: '0', value: isBlank(val) ? '' : String(val), oninput: e => onv(e.target.value) };
  Object.assign(a, extra || {});
  return h('input', a);
}
function textIn(val, onv, extra) { return h('input', Object.assign({ value: val || '', oninput: e => onv(e.target.value) }, extra || {})); }
function lbl(text, input, cls) { return h('label', cls ? { class: cls } : null, [text, input]); }
function unitLbl(text, unit, input, cls) { return h('label', cls ? { class: cls } : null, [text + ' ', h('span', { class: 'u', text: unit }), input]); }
function statusBadge(st) { const s = STATUS[st] || STATUS.angebot; return h('span', { class: 'status', style: '--c:var(' + s.c + ')' }, [h('i'), s.l]); }

// ======================= Ansichten =======================
function showView(v) {
  view = v;
  document.querySelectorAll('.nav [data-view]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.view === v)));
  ['auftrag', 'liste', 'produktion', 'verkauf', 'kunden', 'stats', 'einst'].forEach(k => { $('view-' + k).hidden = k !== v; });
  $('saveJob').hidden = v !== 'auftrag';
  document.querySelector('.mobilebar').hidden = v !== 'auftrag';
  if (HOOKS.views[v]) { try { HOOKS.views[v](); } catch (e) { console.error(e); } }
  if (v === 'liste') renderList();
  if (v === 'kunden') renderKunden();
  if (v === 'stats') renderDash();
  if (v === 'einst') { renderSettings(); updateState(); }
  if (v === 'auftrag') renderResults();
  try { localStorage.setItem(LS.view, v); } catch (e) {}
  window.scrollTo(0, 0);
}
function showTab(t) {
  tab = t;
  document.querySelectorAll('.tabs [data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
  ['angebot', 'folie', 'schema', 'staffel', 'nach'].forEach(k => { $('tab-' + k).hidden = k !== t; });
  renderResults();
}

// ======================= Auftrag: Felder =======================
function markDirty() { dirty = true; touched = true; updateState(); }
function changed() { markDirty(); renderResults(); }
function updateState() {
  const s = $('saveState');
  if (saving) { s.textContent = 'Speichert …'; s.className = 'state'; }
  else if (job.id === null) { s.textContent = 'Nicht gespeichert'; s.className = 'state dirty'; }
  else if (dirty) { s.textContent = 'Ungespeicherte Änderungen'; s.className = 'state dirty'; }
  else { s.textContent = 'Gespeichert'; s.className = 'state'; }
  $('saveJob').disabled = saving; $('delJob').disabled = job.id === null;
  setText('jobTitle', job.name || 'Ohne Namen');
  const t = $('setState'); t.textContent = sDirty ? 'Ungespeicherte Änderungen' : 'Gespeichert'; t.className = 'state' + (sDirty ? ' dirty' : '');
}
function renderJobFields() {
  document.querySelectorAll('[data-job]').forEach(el => {
    const k = el.dataset.job;
    if (el.hasAttribute('data-bool')) el.checked = !!job[k];
    else el.value = isBlank(job[k]) ? '' : job[k];
  });
  document.querySelectorAll('[data-ist]').forEach(el => { const k = el.dataset.ist; el.value = isBlank(job.ist[k]) ? '' : job.ist[k]; });
  renderJobSelects();
}
function renderJobSelects() {
  const ks = $('j-kundeSel'); ks.textContent = '';
  ks.appendChild(h('option', { value: '', text: Store.kunden.length ? '– nicht aus der Liste –' : '– noch keine Kunden gespeichert –' }));
  Store.kunden.slice().sort((a, b) => (a.data.firma || '').localeCompare(b.data.firma || '')).forEach(k => ks.appendChild(h('option', { value: k.id, text: (k.data.firma || 'Ohne Namen') + (k.data.nr ? ' (' + k.data.nr + ')' : '') })));
  ks.value = job.kundeId && Store.kunden.some(k => k.id === job.kundeId) ? job.kundeId : '';
  const an = $('j-anbieter'); an.textContent = '';
  const defA = S.anbieter.find(a => a.id === S.anbieterId) || S.anbieter[0];
  an.appendChild(h('option', { value: '', text: 'Standard: ' + defA.name }));
  S.anbieter.forEach(a => an.appendChild(h('option', { value: a.id, text: a.name })));
  an.value = job.anbieterId && S.anbieter.some(a => a.id === job.anbieterId) ? job.anbieterId : '';
  const pr = $('j-presse'); pr.textContent = '';
  const defP = S.pressen.find(p => p.id === S.presseId);
  pr.appendChild(h('option', { value: '', text: 'Standard: ' + (defP ? defP.name : 'keine') }));
  S.pressen.forEach(p => pr.appendChild(h('option', { value: p.id, text: p.name + ' (' + eur(machineRate(p).perH) + '/h)' })));
  pr.appendChild(h('option', { value: 'keine', text: 'Keine Maschinenkosten' }));
  pr.value = job.presseId && (job.presseId === 'keine' || S.pressen.some(p => p.id === job.presseId)) ? job.presseId : '';
  const dl = $('dsPresets') || document.body.appendChild(h('datalist', { id: 'dsPresets' }));
  dl.textContent = ''; S.druckstellen.forEach(d => dl.appendChild(h('option', { value: d.name })));
}
function applyKunde(k) {
  const d = k.data;
  job.kundeId = k.id; job.kunde = d.firma || ''; job.kundeNr = d.nr || ''; job.kundeUstId = d.ust || '';
  job.kontakt = [d.ansprech, d.tel, d.email].filter(Boolean).join(', ');
  job.adresse = d.adresse || '';
  if (n(d.rabatt) > 0) job.rabatt = n(d.rabatt);
}

// ======================= Auftrag: Positionen =======================
function structural() { markDirty(); renderPositions(); renderResults(); }

function motifRows(p) {
  const box = h('div');
  p.motive.forEach(m => {
    const mW = numIn(m.w, '0.5', v => { m.w = n(v); changed(); }, { 'aria-label': 'Breite cm' });
    const mH = numIn(m.h, '0.5', v => { m.h = n(v); changed(); }, { 'aria-label': 'Höhe cm' });
    const mName = textIn(m.name, v => {
      m.name = v;
      const pr = S.druckstellen.find(x => x.name.toLowerCase() === v.trim().toLowerCase());
      if (pr && !(n(m.w) > 0 && n(m.h) > 0)) { m.w = pr.w; m.h = pr.h; mW.value = pr.w; mH.value = pr.h; }
      if (pr) m.ort = pr.ort || m.ort;
      changed();
    }, { maxlength: '60', list: 'dsPresets' });
    const pers = h('input', { type: 'checkbox', checked: m.pers, title: 'Individuell: auf jedem Teil anders (Namen, Nummern)', onchange: e => { m.pers = e.target.checked; changed(); } });
    box.appendChild(h('div', { class: 'motif' }, [
      lbl('Druckstelle', mName), lbl('Breite cm', mW), lbl('Höhe cm', mH),
      h('label', { class: 'pers', title: 'Individuell: auf jedem Teil anders (Namen, Nummern)' }, ['Namen/Nr.', pers]),
      h('button', { class: 'x', type: 'button', title: 'Druckstelle entfernen', 'aria-label': 'Druckstelle entfernen', onclick: () => { p.motive = p.motive.filter(x => x !== m); structural(); } }, ['×'])
    ]));
    HOOKS.motifExtras.forEach(fn => { try { const el = fn(p, m); if (el) box.appendChild(el); } catch (e) { console.error(e); } });
  });
  const chips = h('div', { class: 'chips', style: 'margin-top:8px' });
  S.druckstellen.forEach(d => chips.appendChild(h('button', { class: 'chip', type: 'button', onclick: () => { p.motive.push(motifFrom(d)); structural(); } }, ['+ ' + d.name])));
  chips.appendChild(h('button', { class: 'chip', type: 'button', onclick: () => { p.motive.push({ id: uid(), name: 'Name', w: 25, h: 6, pers: true, ort: 'ruecken' }); structural(); } }, ['+ Name/Nummer']));
  chips.appendChild(h('button', { class: 'chip', type: 'button', onclick: () => { p.motive.push({ id: uid(), name: 'Eigene Druckstelle', w: 0, h: 0, pers: false, ort: 'front' }); structural(); } }, ['+ Eigene']));
  box.appendChild(chips);
  return box;
}

function textilBody(p) {
  const cat = h('select', { onchange: e => {
    const c = catById(S, e.target.value); p.catId = c ? c.id : null;
    if (c) { p.name = c.name; p.ek = n(p.dunkel ? c.ekDunkel : c.ekHell); p.aufXXL = n(c.aufXXL); p.auf3XL = n(c.auf3XL); if (!c.groessen && !p.ohneGroessen) { p.menge = qtyOf(p) || p.menge; p.ohneGroessen = true; } }
    structural();
  } }, [h('option', { value: '', text: 'Eigener Artikel' })]);
  S.artikel.forEach(a => cat.appendChild(h('option', { value: a.id, text: a.name })));
  cat.value = p.catId && catById(S, p.catId) ? p.catId : '';
  const ekIn = numIn(p.ek, '0.1', v => { p.ek = n(v); changed(); });
  const dunkel = h('input', { type: 'checkbox', checked: p.dunkel, onchange: e => { p.dunkel = e.target.checked; const c = catById(S, p.catId); if (c) { p.ek = n(p.dunkel ? c.ekDunkel : c.ekHell); ekIn.value = String(p.ek); } changed(); } });
  const ohne = h('input', { type: 'checkbox', checked: p.ohneGroessen, onchange: e => {
    if (e.target.checked) { p.menge = qtyOf(p) || 10; p.ohneGroessen = true; }
    else { p.ohneGroessen = false; if (!SIZES.some(s => n(p.groessen[s]) > 0)) p.groessen.M = Math.round(n(p.menge)); }
    structural();
  } });
  let sizeBox;
  if (p.ohneGroessen) sizeBox = h('div', { class: 'grid', style: 'margin-top:10px' }, [lbl('Menge', numIn(p.menge, '1', v => { p.menge = n(v); changed(); }))]);
  else {
    sizeBox = h('div', { class: 'sizes' });
    SIZES.forEach(s => {
      const lab = h('label', { class: n(p.groessen[s]) > 0 ? 'has' : '' }, [h('span', { text: s })]);
      lab.appendChild(numIn(p.groessen[s] || '', '1', v => { p.groessen[s] = Math.max(0, Math.round(n(v))); lab.classList.toggle('has', p.groessen[s] > 0); changed(); }, { placeholder: '0', 'aria-label': 'Anzahl ' + s }));
      sizeBox.appendChild(lab);
    });
  }
  return [
    h('div', { class: 'grid3' }, [
      lbl('Katalog', cat),
      lbl('Bezeichnung', textIn(p.name, v => { p.name = v; changed(); }, { maxlength: '80' })),
      lbl('Farbe', textIn(p.farbe, v => { p.farbe = v; changed(); }, { maxlength: '40', placeholder: 'z. B. Schwarz' }))
    ]),
    h('div', { class: 'row', style: 'gap:4px 18px' }, [
      h('label', { class: 'check' }, [dunkel, 'Dunkles Textil']),
      h('label', { class: 'check' }, [ohne, 'Ohne Größen'])
    ]),
    sizeBox,
    h('div', { class: 'sub' }, ['Druckstellen pro Teil']),
    motifRows(p),
    h('details', { class: 'more' }, [
      h('summary', { text: 'Einkaufspreis ' + eur(n(p.ek)) + (n(p.aufXXL) || n(p.auf3XL) ? ', Aufpreise Übergrößen' : '') }),
      h('div', { class: 'grid3' }, [
        lbl('EK pro Stück €', ekIn),
        lbl('Aufpreis XXL €', numIn(p.aufXXL, '0.1', v => { p.aufXXL = n(v); changed(); })),
        lbl('Aufpreis 3XL+ €', numIn(p.auf3XL, '0.1', v => { p.auf3XL = n(v); changed(); }))
      ])
    ])
  ];
}

function transferBody(p) {
  return [
    h('div', { class: 'grid' }, [
      lbl('Bezeichnung', textIn(p.name, v => { p.name = v; changed(); }, { maxlength: '80' })),
      unitLbl('Menge', 'Sätze', numIn(p.menge, '1', v => { p.menge = n(v); changed(); }))
    ]),
    h('p', { class: 'mut', style: 'margin:8px 0 0' }, ['Kunde presst selbst. Ein Satz enthält jedes Motiv einmal. Kosten: Folie und Schneiden, kein Textil, keine Presse.']),
    h('div', { class: 'sub' }, ['Motive pro Satz']),
    motifRows(p)
  ];
}

function leistungBody(p) {
  const seg = h('div', { class: 'seg', style: 'margin-top:10px' });
  [['zeit', 'Nach Zeit'], ['einkauf', 'Einkauf / Fremdleistung'], ['festpreis', 'Festpreis']].forEach(([k, l]) => seg.appendChild(h('button', { type: 'button', 'aria-pressed': String(p.kostenart === k), onclick: () => { p.kostenart = k; structural(); } }, [l])));
  let field;
  if (p.kostenart === 'zeit') field = unitLbl('Arbeitszeit', 'Minuten pro ' + (p.einheit || 'Einheit'), numIn(p.minuten, '5', v => { p.minuten = n(v); changed(); }));
  else if (p.kostenart === 'einkauf') field = unitLbl('Einkauf', '€ netto pro ' + (p.einheit || 'Einheit'), numIn(p.ekEinheit, '0.5', v => { p.ekEinheit = n(v); changed(); }));
  else field = unitLbl('Verkaufspreis', '€ netto pro ' + (p.einheit || 'Einheit'), numIn(p.preisEinheit, '0.5', v => { p.preisEinheit = n(v); changed(); }));
  const hint = { zeit: 'Wird mit Stundenlohn und Gemeinkosten kalkuliert, z. B. Grafik, Vektorisieren, Beratung.', einkauf: 'Einkaufspreis bekommt Zuschläge und Gewinn, z. B. Stick bei Partnerfirma, Etiketten, Zubehör.', festpreis: 'Wird genau so angeboten, ohne Kalkulation, z. B. Designpauschale.' }[p.kostenart];
  return [
    h('div', { class: 'grid3' }, [
      lbl('Bezeichnung', textIn(p.name, v => { p.name = v; changed(); }, { maxlength: '80' }), 'span2'),
      lbl('Einheit', textIn(p.einheit, v => { p.einheit = v; changed(); }, { maxlength: '12', placeholder: 'Stk.' }))
    ]),
    seg,
    h('div', { class: 'grid', style: 'margin-top:10px' }, [lbl('Menge', numIn(p.menge, p.einheit === 'Std.' ? '0.25' : '1', v => { p.menge = n(v); changed(); })), field]),
    h('p', { class: 'mut', style: 'margin:8px 0 0' }, [hint]),
    h('label', { style: 'margin-top:8px' }, ['Beschreibung für das Angebot', h('textarea', { rows: '2', maxlength: '300', value: p.beschreibung || '', oninput: e => { p.beschreibung = e.target.value; changed(); } })])
  ];
}

function renderPositions() {
  const box = $('positions'); box.textContent = '';
  job.positionen.forEach((p, pi) => {
    const body = p.typ === 'transfer' ? transferBody(p) : p.typ === 'leistung' ? leistungBody(p) : textilBody(p);
    HOOKS.posExtras.forEach(fn => { try { const el = fn(p); if (el) body.push(el); } catch (e) { console.error(e); } });
    box.appendChild(h('div', { class: 'pos' + (p.id === enterId ? ' enter' : ''), style: '--pc:var(' + PCOL[pi % PCOL.length] + ')' }, [
      h('div', { class: 'pos-head' }, [
        h('div', { class: 't' }, [h('strong', { text: 'Position ' + (pi + 1) }), h('span', { class: 'tag', text: POS_TYPES[p.typ].short }), h('span', { class: 'tag', id: 'pt-' + p.id }), variantSelect(p)]),
        h('div', { class: 'row', style: 'gap:2px' }, [
          pi > 0 ? h('button', { class: 'x', type: 'button', title: 'Nach oben', style: 'font-size:15px', onclick: () => { job.positionen.splice(pi, 1); job.positionen.splice(pi - 1, 0, p); structural(); } }, ['↑']) : null,
          h('button', { class: 'x', type: 'button', title: 'Position duplizieren', style: 'font-size:14px', onclick: () => { const c = clone(p); c.id = uid(); c.motive.forEach(m => { m.id = uid(); }); job.positionen.splice(pi + 1, 0, c); enterId = c.id; structural(); enterId = null; } }, [icon('copy')]),
          h('button', { class: 'x', type: 'button', title: 'Position entfernen', 'aria-label': 'Position entfernen', onclick: () => { job.positionen = job.positionen.filter(x => x !== p); structural(); } }, ['×'])
        ])
      ])
    ].concat(body)));
  });
  if (!job.positionen.length) box.appendChild(h('div', { class: 'empty' }, [h('strong', { text: 'Noch keine Position' }), 'Füg unten Textilien, Transfers oder eine Leistung hinzu.']));
  setText('posCount', job.positionen.length ? job.positionen.length + (job.positionen.length > 1 ? ' Positionen' : ' Position') : '');
}

// ======================= Varianten =======================
// Varianten = Alternativen im selben Angebot (z. B. Standard-Shirt vs. Premium-Shirt).
// Positionen gehören zu einer Variante (p.var) oder zu allen (p.var = '').
const VAR_KEYS = ['A', 'B', 'C', 'D'];
function renderVariants() {
  const box = $('varBox'); box.textContent = '';
  const keys = variantKeys(job);
  if (!keys.length) {
    box.appendChild(h('div', { class: 'row', style: 'margin-bottom:4px' }, [
      h('button', { class: 'link', type: 'button', title: 'Mehrere Alternativen im selben Angebot, z. B. Standard und Premium', onclick: () => {
        job.varNamen = { A: 'Standard', B: 'Premium' }; job.variante = 'A'; structural(); renderVariants();
        toast('Varianten angelegt. Wähle bei jeder Position, zu welcher Variante sie gehört.');
      } }, ['+ Varianten anbieten (z. B. Standard / Premium)'])
    ]));
    return;
  }
  const act = activeVariant(job), SJ = settingsFor(job, S);
  const wrap = h('div', { class: 'varbar' });
  keys.forEach(k => {
    const R = calc(jobForVariant(job, k), SJ, false);
    const nameIn = h('input', { value: job.varNamen[k] || '', maxlength: '30', 'aria-label': 'Name Variante ' + k, onclick: e => e.stopPropagation(), oninput: e => { job.varNamen[k] = e.target.value; markDirty(); } });
    wrap.appendChild(h('div', { class: 'varchip' + (k === act ? ' on' : ''), role: 'button', tabindex: '0', title: 'Diese Variante anzeigen und für Bestätigung/Rechnung verwenden',
      onclick: () => { job.variante = k; changed(); renderVariants(); }, onkeydown: e => { if (e.key === 'Enter') { job.variante = k; changed(); renderVariants(); } } }, [
      h('b', { text: k }), nameIn, h('small', { text: eur(R.net) + ' · Gewinn ' + eur(R.profit) })
    ]));
  });
  const actions = h('div', { class: 'row', style: 'gap:10px' }, [
    keys.length < VAR_KEYS.length ? h('button', { class: 'link', type: 'button', onclick: () => { const k = VAR_KEYS.find(x => !keys.includes(x)); job.varNamen[k] = 'Variante ' + k; structural(); renderVariants(); } }, ['+ Variante']) : null,
    h('button', { class: 'link', type: 'button', style: 'color:var(--warn)', onclick: () => {
      ask('Die Varianten werden aufgelöst. Positionen, die nur zur gerade gewählten Variante ' + act + ' gehören, bleiben; die der anderen Varianten werden gelöscht.', { title: 'Varianten beenden?', ok: 'Beenden', danger: true }).then(v => {
        if (!v) return;
        job.positionen = job.positionen.filter(p => !p.var || p.var === act); job.positionen.forEach(p => { p.var = ''; });
        job.varNamen = {}; job.variante = ''; structural(); renderVariants();
      });
    } }, ['Varianten beenden'])
  ]);
  box.appendChild(h('div', { class: 'callout', style: 'margin:0 0 4px' }, [
    h('div', { class: 'mut', text: 'Das Angebot zeigt alle Varianten. Die markierte Variante gilt für Bestätigung, Produktion und Rechnung.' }), wrap, actions
  ]));
}
function variantSelect(p) {
  const keys = variantKeys(job); if (!keys.length) return null;
  const sel = h('select', { class: 'varsel', 'aria-label': 'Gehört zu Variante', onchange: e => { p.var = e.target.value; changed(); renderVariants(); } },
    [h('option', { value: '', text: 'alle Varianten' })].concat(keys.map(k => h('option', { value: k, text: k + ': ' + (job.varNamen[k] || k) }))));
  sel.value = p.var && keys.includes(p.var) ? p.var : '';
  return sel;
}

// ======================= Preise festschreiben =======================
function renderSnap() {
  const box = $('snapBox');
  if (!job.Ssnap) { box.hidden = true; return; }
  box.textContent = '';
  box.appendChild(h('div', null, [h('strong', { text: 'Preise festgeschrieben' }), h('div', { class: 'mut', text: 'Seit dem ersten Dokument rechnet dieser Auftrag mit den Einstellungen von damals. Spätere Preisänderungen in den Einstellungen ändern ihn nicht.' })]));
  box.appendChild(h('button', { class: 'ghost mini', type: 'button', style: 'align-self:flex-start', onclick: () => {
    ask('Der Auftrag wird mit den aktuellen Einstellungen neu gerechnet. Bereits verschickte Dokumente stimmen dann eventuell nicht mehr mit dem Auftrag überein.', { title: 'Neu rechnen?', ok: 'Neu rechnen' }).then(v => {
      if (!v) return; job.Ssnap = null; renderSnap(); changed(); renderVariants(); toast('Rechnet jetzt mit den aktuellen Einstellungen');
    });
  } }, ['Mit aktuellen Einstellungen neu rechnen']));
  box.hidden = false;
}

// ======================= Zeiterfassung =======================
const timerRunning = () => (job.zeiten || []).find(z => !z.e);
function fmtDur(min) { const s = Math.round(min * 60); return Math.floor(s / 3600) + ':' + String(Math.floor(s / 60) % 60).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }
function renderTimer() {
  const run = timerRunning(), chip = $('timerChip'), btn = $('timerBtn');
  btn.textContent = run ? 'Stopp' : 'Start';
  btn.className = (run ? 'primary danger' : 'primary') + ' mini';
  chip.hidden = !run;
  if (run) chip.textContent = '⏱ ' + fmtDur(zeitSumme([run]));
  const list = $('timerList'); list.textContent = '';
  const zs = job.zeiten || [];
  if (!zs.length) { list.textContent = 'Starte die Uhr, wenn du an diesem Auftrag arbeitest. Die Zeit landet automatisch in der Nachkalkulation.'; return; }
  zs.forEach((z, i) => list.appendChild(h('div', { class: 'row between', style: 'padding:3px 0;border-bottom:1px solid var(--line)' }, [
    h('span', { text: new Date(z.s).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) + (z.e ? ' bis ' + new Date(z.e).toLocaleTimeString('de-DE', { timeStyle: 'short' }) : ' · läuft') }),
    h('span', null, [h('b', { text: hm(zeitSumme([z])) }), ' ', h('button', { class: 'x', type: 'button', 'aria-label': 'Eintrag löschen', onclick: () => { job.zeiten.splice(i, 1); changed(); renderTimer(); } }, ['×'])])
  ])));
  list.appendChild(h('div', { style: 'margin-top:6px;color:var(--fg)' }, ['Gesamt: ', h('b', { text: hm(zeitSumme(zs)) })]));
}
function toggleTimer() {
  const run = timerRunning();
  if (run) run.e = Date.now(); else job.zeiten.push({ s: Date.now(), e: null });
  changed(); renderTimer();
  if (job.id !== null) persistJob();
  else toast(run ? 'Zeit gestoppt' : 'Zeit läuft. Speichere den Auftrag, damit sie nicht verloren geht.');
}
setInterval(() => { const run = timerRunning(); if (run) $('timerChip').textContent = '⏱ ' + fmtDur(zeitSumme([run])); }, 1000);

// ======================= Auftrag: Ergebnis =======================
function renderResults() {
  const R = calcJob(job, S, true); last = R;
  const T = R.tot;
  tween('s-netto', R.net);
  setText('s-brutto', R.z.mwst > 0 ? eur(R.brutto) + ' brutto' : 'ohne USt. (§ 19)');
  setText('s-gewinn-l', R.z.sk > 0 ? 'Gewinn nach Skonto' : 'Gewinn');
  tween('s-gewinn', R.profit);
  const gp = R.selbst > 0 ? R.profit / R.selbst * 100 : 0, mg = R.net > 0 ? R.profit / R.net * 100 : 0;
  $('s-gewinn-box').className = R.profit < 0 ? 'neg' : 'pos';
  setText('s-gewinn2', pct(mg) + ' vom Umsatz');
  setText('s-teile', String(R.totalQ));
  setText('s-teile2', R.transfers + ' Transfers · ' + R.pressCount + ' Pressungen');
  setText('s-folie', (job.sammel ? N2.format(R.meter) : N1.format(R.meter)) + ' m');
  setText('s-folie2', R.meter > 0 ? eur(R.filmCost) + ' · ' + R.anbieter.name : 'keine Motive');
  setText('s-zeit', hm(R.minutes));
  setText('s-zeit2', 'Lohn ' + eur(T.lohn) + (T.masch > 0 ? ' · Presse ' + eur(T.masch) : ''));
  setText('mb-netto', eur(R.net)); setText('mb-gewinn', eur(R.profit));
  $('gauge').setAttribute('data-s', gp < 0 ? 'bad' : gp < 10 ? 'warn' : 'good');
  $('g-val').style.strokeDasharray = Math.max(0, Math.min(100, gp * 2)) + ' 100';
  const gpEl = $('g-pct'); gpEl.textContent = ''; gpEl.appendChild(h('div', null, [N1.format(gp) + ' %', h('small', { text: 'auf Kosten' })]));
  setText('g-sk', eur(R.selbst));

  // Zusammensetzung des Preises
  const parts = [['Textil & Material', '--b-textil', T.textil], ['Folie', '--b-folie', T.folie], ['Arbeit', '--b-lohn', T.lohn], ['Presse', '--b-masch', T.masch],
    ['Gemeinkosten', '--b-gk', T.mgk + T.fgk + T.vwvt], ['Versand, Verpackung', '--b-vers', T.sekvt + R.extraKosten], ['Skonto-Reserve', '--b-skonto', R.net * R.z.sk], ['Gewinn', '--b-gewinn', R.profit]];
  const bar = $('s-bar'), lg = $('s-legend');
  const sum = parts.reduce((s, p) => s + Math.max(0, p[2]), 0) || 1;
  if (bar.children.length !== parts.length) {
    bar.textContent = ''; lg.textContent = '';
    parts.forEach(p => {
      const seg = h('i', { style: 'width:0;background:var(' + p[1] + ')', title: p[0] });
      const li = h('li', null, [h('span', { class: 'sw', style: 'background:var(' + p[1] + ')' }), h('span', { class: 'n', text: p[0] }), h('span', { class: 's' }), h('span', { class: 'v' })]);
      const on = () => { seg.classList.add('hl'); li.classList.add('hl'); }, off = () => { seg.classList.remove('hl'); li.classList.remove('hl'); };
      [seg, li].forEach(el => { el.addEventListener('mouseenter', on); el.addEventListener('mouseleave', off); });
      bar.appendChild(seg); lg.appendChild(li);
    });
  }
  parts.forEach((p, i) => {
    const seg = bar.children[i], li = lg.children[i], hide = Math.abs(p[2]) < 0.005 && p[0] !== 'Gewinn';
    seg.style.width = hide ? '0' : (Math.max(0, p[2]) / sum * 100) + '%'; li.hidden = hide;
    li.children[2].textContent = R.net > 0 ? pct(p[2] / R.net * 100) : '';
    li.children[3].textContent = eur(p[2]); li.children[3].className = 'v' + (p[2] < 0 ? ' neg' : '');
  });

  // Hinweise
  const w = R.warnings.map(t => ({ t }));
  if (!R.lines.length) w.push({ t: 'Trag bei mindestens einer Position eine Menge ein.' });
  if (R.profit < 0) w.push({ t: 'Mit diesem Preis machst du Verlust.', bad: true });
  if (R.minder > 0) w.push({ t: 'Mindestauftragswert greift: ' + eur(R.minder) + ' Mindermengenzuschlag.' });
  job.positionen.forEach(p => {
    const nm = '„' + (p.name || 'Position') + '“';
    if ((p.typ === 'textil' || p.typ === 'transfer') && wholeQty(p) > 0 && !validMotifs(p).length) w.push({ t: nm + ' hat noch keine Druckstelle mit Maßen.' });
    if (p.typ === 'leistung' && p.kostenart === 'festpreis' && !(n(p.preisEinheit) > 0)) w.push({ t: nm + ': Festpreis fehlt.' });
  });
  const wb = $('warn'); wb.textContent = '';
  w.forEach(x => wb.appendChild(h('div', { class: x.bad ? 'bad' : '', text: '• ' + x.t })));
  wb.hidden = !w.length;

  job.positionen.forEach(p => {
    const e = $('pt-' + p.id); if (!e) return;
    const rr = R.rows.find(r => r.p === p);
    const q = wholeQty(p);
    e.textContent = rr ? N1.format(q) + ' ' + (p.typ === 'leistung' ? (p.einheit || 'Stk.') : p.typ === 'transfer' ? 'Sätze' : 'Teile') + ' · ' + eur(rr.baseUnit) : 'Menge fehlt';
  });

  renderOfferTable(R); renderOfferText(R); renderZiel();
  if (tab === 'folie') renderFolie(R);
  if (tab === 'schema') renderSchema(R);
  if (tab === 'staffel') renderStaffel(R);
  if (tab === 'nach') renderNach(R);
  // Positionen anderer Varianten abblenden
  const act = activeVariant(job);
  job.positionen.forEach(p => { const e = $('pt-' + p.id); if (e) e.closest('.pos').classList.toggle('off', !!(act && p.var && p.var !== act)); });
  if (variantKeys(job).length) renderVariants();
  HOOKS.resultsRender.forEach(fn => { try { fn(R); } catch (e) { console.error(e); } });
}

function renderOfferTable(R) {
  const tb = $('t-offer'); tb.textContent = '';
  R.lines.forEach(l => tb.appendChild(h('tr', null, [
    h('td', null, [h('span', { class: 'sw', style: 'background:var(' + l.color + ')' }), l.title, l.sizes ? h('small', { text: l.sizes }) : null, l.druck ? h('small', { text: (l.typ === 'textil' ? 'Druck: ' : '') + l.druck }) : null]),
    h('td', { text: N2.format(l.count).replace(/,00$/, '') + ' ' + l.einheit }), h('td', { text: eur(l.unit) }), h('td', { text: eur(l.total) })
  ])));
  const row = (label, val, cls) => tb.appendChild(h('tr', cls ? { class: cls } : null, [h('td', { text: label }), h('td'), h('td'), h('td', { text: val })]));
  const extra = R.rabattAmt > 0 || R.pausch > 0 || R.expressAmt > 0 || R.versandVK > 0 || R.minder > 0;
  if (extra) row('Summe Positionen', eur(R.posSum), 'sum');
  if (R.rabattAmt > 0) row('abzgl. Rabatt ' + pct(R.z.rb * 100), '−' + eur(R.rabattAmt));
  if (R.pausch > 0) row('Einrichtung und Datenaufbereitung', eur(R.pausch));
  if (R.expressAmt > 0) row('Expresszuschlag ' + pct(R.z.express * 100), eur(R.expressAmt));
  if (R.versandVK > 0) row('Versand (' + n(job.pakete) + ' Paket' + (n(job.pakete) > 1 ? 'e' : '') + ')', eur(R.versandVK));
  if (R.minder > 0) row('Mindermengenzuschlag', eur(R.minder));
  row('Gesamt netto', eur(R.net), 'final');
  if (R.z.mwst > 0) { row('zzgl. ' + pct(R.z.mwst * 100) + ' USt.', eur(R.mwstAmt)); row('Gesamtbetrag', eur(R.brutto), 'sum'); }
  if (R.anzahlung > 0) row('davon Anzahlung ' + pct(n(job.anzahlung)), eur(R.anzahlung));
}

function renderOfferText(R) {
  const L = [];
  L.push('Angebot' + (job.angebotNr ? ' Nr. ' + job.angebotNr : '') + ': ' + (job.name || 'Auftrag'));
  if (job.kunde) L.push('Kunde: ' + job.kunde);
  if (job.datum) L.push('Datum: ' + fmtDate(job.datum));
  L.push('');
  R.lines.forEach(l => {
    L.push(N2.format(l.count).replace(/,00$/, '') + ' ' + l.einheit + ' ' + l.title);
    if (l.sizes) L.push('   ' + (l.typ === 'textil' ? 'Größen: ' : '') + l.sizes);
    if (l.druck) L.push('   ' + (l.typ === 'textil' ? 'Druck: ' : '') + l.druck);
    L.push('   je ' + eur(l.unit) + ' = ' + eur(l.total));
  });
  L.push('');
  if (R.rabattAmt > 0) { L.push('Summe: ' + eur(R.posSum)); L.push('abzgl. ' + pct(R.z.rb * 100) + ' Rabatt: −' + eur(R.rabattAmt)); }
  if (R.pausch > 0) L.push('Einrichtung und Datenaufbereitung: ' + eur(R.pausch));
  if (R.expressAmt > 0) L.push('Expresszuschlag: ' + eur(R.expressAmt));
  if (R.versandVK > 0) L.push('Versand: ' + eur(R.versandVK));
  if (R.minder > 0) L.push('Mindermengenzuschlag: ' + eur(R.minder));
  L.push('Gesamt netto: ' + eur(R.net));
  if (R.z.mwst > 0) L.push('zzgl. ' + pct(R.z.mwst * 100) + ' USt.: ' + eur(R.mwstAmt));
  else L.push('Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.');
  L.push('Gesamtbetrag: ' + eur(R.brutto));
  if (R.anzahlung > 0) L.push('Anzahlung bei Auftrag: ' + eur(R.anzahlung));
  if (R.z.sk > 0) L.push('Bei Zahlung innerhalb von ' + n(S.skontoTage) + ' Tagen ' + pct(R.z.sk * 100) + ' Skonto.');
  if (job.liefertermin) L.push('Lieferung: ' + job.liefertermin);
  $('offerText').value = L.join('\n');
}

function renderZiel() {
  const out = $('ziel-out'), v = n($('ziel').value);
  if (!last || !(v > 0)) { out.textContent = 'Trag einen Betrag ein, um deinen Gewinn dabei zu sehen.'; out.className = 'hint'; }
  else {
    const g = profitAtPrice(last, v);
    out.textContent = 'Gewinn ' + eur(g.profit) + ' (' + pct(g.onCost) + ' auf Selbstkosten).' + (g.profit < 0 ? ' Das wäre Verlust.' : '');
    out.className = 'hint' + (g.profit < 0 ? ' neg' : ' good');
  }
  const o2 = $('zielStk-out'), s = n($('zielStk').value);
  if (!last || !(s > 0) || !last.totalQ) { o2.textContent = 'Was bleibt, wenn alle Teile diesen Preis haben (plus Einrichtung).'; o2.className = 'hint'; }
  else {
    const net = s * last.totalQ + last.pausch + last.lines.filter(l => l.typ === 'leistung').reduce((a, l) => a + l.total, 0);
    const g = profitAtPrice(last, net);
    o2.textContent = 'Angebot ' + eur(net) + ' netto, Gewinn ' + eur(g.profit) + ' (' + pct(g.onCost) + ' auf Kosten).';
    o2.className = 'hint' + (g.profit < 0 ? ' neg' : ' good');
  }
}

// ---- Folie ----
function drawSheet(R) {
  const cv = $('sheet'), wrap = $('sheetWrap');
  if (!wrap.clientWidth) return;
  const W = Math.max(n(R.anbieter.breite), 1), band = 110, tick = 18, lenCm = Math.max(R.cm, R.meter * 100, 1);
  let scale = band / W, px = lenCm * scale;
  if (px > 16000) { scale = 16000 / lenCm; px = 16000; }
  const hPx = W * scale + tick, wPx = Math.max(px, wrap.clientWidth - 2);
  const dpr = Math.min(window.devicePixelRatio || 1, 2, 30000 / wPx);
  cv.width = Math.round(wPx * dpr); cv.height = Math.round(hPx * dpr); cv.style.width = wPx + 'px'; cv.style.height = hPx + 'px';
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.fillStyle = cssVar('--card'); c.fillRect(0, 0, wPx, hPx);
  c.fillStyle = cssVar('--film'); c.fillRect(0, tick, Math.max(R.cm, R.meter * 100) * scale, W * scale);
  const cols = PCOL.map(cssVar);
  if (R.plan) R.plan.shelves.forEach(sh => sh.items.forEach(it => { c.fillStyle = cols[it.pi % cols.length]; c.fillRect(sh.y * scale, tick + it.x * scale, Math.max(it.h * scale, 1), Math.max(it.w * scale, 1)); }));
  c.fillStyle = cssVar('--mut'); c.strokeStyle = cssVar('--mut'); c.font = '11px "Segoe UI", sans-serif';
  const every = scale * 100 < 40 ? (scale * 100 < 14 ? 10 : 5) : 1;
  for (let m = 0; m * 100 <= Math.max(R.cm, R.meter * 100) + 1; m += every) { const x = m * 100 * scale; c.beginPath(); c.moveTo(x + .5, tick - 6); c.lineTo(x + .5, tick); c.stroke(); if (m > 0) c.fillText(m + ' m', x + 3, 11); }
  if (!job.sammel && R.meter > 0) { const bx = R.meter * 100 * scale; c.strokeStyle = cssVar('--acc'); c.setLineDash([4, 3]); c.beginPath(); c.moveTo(bx + .5, tick); c.lineTo(bx + .5, hPx); c.stroke(); c.setLineDash([]); }
}
function renderFolie(R) {
  drawSheet(R);
  const AN = R.anbieter;
  setText('sheetInfo', R.cm > 0 ? N1.format(R.planCm / 100) + ' m Motive geplant' + (n(S.folieZuschlag) > 0 ? ' (+' + pct(n(S.folieZuschlag)) + ' Planungszuschlag)' : '') + '. ' +
    (job.sammel ? 'Sammelbestellung: ' + N2.format(R.meter) + ' m anteilig zu ' + eur(R.preis) + '/m.' : N2.format(R.meter) + ' m abgerechnet (gestrichelte Linie) zu ' + eur(R.preis) + '/m' + (R.versand > 0 ? ' + ' + eur(R.versand) + ' Versand' : '') + '.') +
    (R.tinte > 0 ? ' Tinte für ' + N2.format(R.printedM2) + ' m² bedruckte Fläche: ' + eur(R.tinte) + '.' : '') +
    ' ' + R.shelves + ' Reihen, ' + pct(R.util * 100) + ' der Folie bedruckt, ' + R.transfers + ' Transfers.' : 'Noch keine Druckstellen.');
  const ta = $('t-anbieter'); ta.textContent = '';
  const cmp = compareAnbieter(jobForVariant(job), settingsFor(job, S)), best = Math.min(...cmp.map(c => c.filmCost));
  cmp.forEach(c => ta.appendChild(h('tr', { class: c.id === AN.id ? 'cur' : '' }, [
    h('td', null, [c.name, c.id === AN.id ? h('small', { text: 'gewählt' }) : null]),
    h('td', { text: N2.format(c.meter) }), h('td', { text: eur(c.preis) }),
    h('td', { class: c.filmCost === best && cmp.length > 1 ? 'good' : '', text: eur(c.filmCost) }),
    h('td', { text: eur(c.net) }), h('td', { class: c.profit < 0 ? 'neg' : '', text: eur(c.profit) }),
    h('td', null, [c.id === AN.id ? null : h('button', { class: 'ghost mini', type: 'button', onclick: () => { job.anbieterId = c.id; renderJobSelects(); changed(); } }, ['Wählen'])])
  ])));
  const tb = $('t-motive'); tb.textContent = '';
  if (R.plan) R.plan.types.forEach(t => tb.appendChild(h('tr', null, [h('td', null, [h('span', { class: 'sw', style: 'background:var(' + PCOL[t.pi % PCOL.length] + ')' }), t.label]), h('td', { text: String(t.count) }), h('td', { text: N1.format(t.ow) + ' × ' + N1.format(t.oh) + ' cm' }), h('td', { text: t.rot ? 'gedreht' : 'normal' })])));
  if (!tb.children.length) tb.appendChild(h('tr', null, [h('td', { colspan: '4', class: 'l mut', text: 'Keine Motive.' })]));
  const st = $('t-sheets'); st.textContent = '';
  if (!job.sheets.length) st.appendChild(h('tr', null, [h('td', { colspan: '7', class: 'l mut', text: 'Noch kein Gang Sheet hochgeladen.' })]));
  job.sheets.forEach(s => {
    const wIn = numIn(r2(n(s.widthCm)), '0.5', v => { const w = n(v); if (w > 0) { s.widthCm = w; s.lengthCm = s.pxH / s.pxW * w; changed(); } }, { 'aria-label': 'Breite von ' + s.name });
    const leer = s.coverage === null || s.coverage === undefined ? null : 1 - s.coverage;
    st.appendChild(h('tr', null, [
      h('td', null, [s.name, s.note ? h('small', { text: s.note }) : null]), h('td', null, [wIn]),
      h('td', { text: N2.format(n(s.lengthCm) / 100) + ' m' }),
      h('td', { text: leer === null ? '–' : pct(s.coverage * 100) }), h('td', { text: leer === null ? '–' : pct(leer * 100) }),
      h('td', { text: leer === null ? '–' : eur(n(s.lengthCm) / 100 * R.preis * leer) }),
      h('td', null, [h('button', { class: 'x', type: 'button', 'aria-label': 'Entfernen', onclick: () => { job.sheets = job.sheets.filter(x => x !== s); changed(); } }, ['×'])])
    ]));
  });
  const ST = sheetTotals(job);
  let cmpTxt = '';
  if (ST.cm > 0) {
    const diff = R.planCm > 0 ? (ST.cm / R.planCm - 1) * 100 : 0;
    cmpTxt = 'Echt ' + N2.format(ST.cm / 100) + ' m, geplant ' + N2.format(R.planCm / 100) + ' m Motivfläche (' + (diff >= 0 ? '+' : '') + pct(diff) + ').' + (ST.coverage !== null ? ' Im Schnitt sind ' + pct((1 - ST.coverage) * 100) + ' der bezahlten Folie leer.' : '') + ' Die echte Länge fließt in die Nachkalkulation ein.';
  }
  setText('sheetCompare', cmpTxt);
}

// ---- Kalkulationsschema ----
function renderSchema(R) {
  const sc = $('t-schema'), T = R.tot, z = R.z, q = R.totalQ || 0; sc.textContent = '';
  const line = (label, rate, val, cls) => sc.appendChild(h('tr', cls ? { class: cls } : null, [h('td', { text: label }), h('td', { text: rate }), h('td', { class: val < 0 ? 'neg' : '', text: eur(val) }), h('td', { class: 'mut', text: q ? eur(val / q) : '' })]));
  const festSum = R.lines.filter((l, i) => { const r = R.rows[l.pi]; return r && r.fest; }).reduce((s, l) => s + l.total, 0);
  line('Textil und Material (inkl. Ausschuss, Übergrößen)', '', T.textil);
  line('Folie (' + N2.format(R.meter) + ' m, ' + R.anbieter.name + ')', '', T.folie);
  line('Material-Gemeinkosten', pct(z.mgk * 100), T.mgk);
  line('Materialkosten', '', T.mk, 'sum');
  line('Fertigungslohn (' + hm(R.minutes) + ' × ' + eur(R.lohnH) + ')', '', T.lohn);
  line('Fertigungs-Gemeinkosten', pct(z.fgk * 100), T.fgk);
  if (T.masch > 0 || R.presse) line('Maschinenkosten Presse (' + hm(R.pressMin) + ')', eur(R.machine.perH) + '/h', T.masch);
  line('Fertigungskosten', '', T.fk, 'sum');
  line('Herstellkosten', '', T.hk, 'sum');
  line('Verwaltung und Vertrieb', pct(z.vwvt * 100), T.vwvt);
  line('Verpackung, Versand, Sonstiges', '', T.sekvt);
  line('Selbstkosten', '', T.sk, 'sum');
  line('Gewinnzuschlag', pct(z.gew * 100), T.gewinn);
  line('Barverkaufspreis', '', T.bvp, 'sum');
  line('Skonto (im Hundert)', pct(z.sk * 100), T.skonto);
  line('Zielverkaufspreis', '', T.zvp, 'sum');
  line('Rabatt (im Hundert)', pct(z.rb * 100), T.rabatt);
  line('Listenpreis netto (vor Rundung)', '', T.lvp, 'sum');
  line('Rundung der Stückpreise', '', R.posSum - festSum - T.lvp);
  if (festSum > 0) line('Festpreise (ohne Kalkulation)', '', festSum);
  if (R.rabattAmt > 0) line('abzgl. Rabatt im Angebot', '', -R.rabattAmt);
  if (R.pausch > 0) line('Einrichtungspauschale', '', R.pausch);
  if (R.expressAmt > 0) line('Expresszuschlag', pct(z.express * 100), R.expressAmt);
  if (R.versandVK > 0) line('Versand (eigene Zeile)', '', R.versandVK);
  if (R.minder > 0) line('Mindermengenzuschlag', '', R.minder);
  line('Angebot netto', '', R.net, 'final');
  if (z.sk > 0) line('abzgl. Skonto, falls gezogen', '', -R.net * z.sk);
  line('abzgl. Selbstkosten' + (R.extraKosten > 0 ? ' (inkl. ' + eur(R.extraKosten) + ' Pakete)' : ''), '', -R.selbst);
  line('Gewinn', pct(R.selbst > 0 ? R.profit / R.selbst * 100 : 0), R.profit, 'final');
  setText('f-mr', R.presse ? eur(R.machine.perH) + ' pro Stunde, ' + R.presse.name : 'keine Presse gewählt');

  // Je Position
  const hd = $('t-pos-h'), bd = $('t-pos'); hd.textContent = ''; bd.textContent = '';
  if (!R.rows.length) return;
  const tr = h('tr', null, [h('th', { text: '' })]);
  R.rows.forEach((r, i) => tr.appendChild(h('th', null, [h('span', { class: 'sw', style: 'display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:6px;background:var(' + r.color + ')' }), (r.p.name || 'Pos. ' + (i + 1)).slice(0, 18)])));
  hd.appendChild(tr);
  const lineSum = i => R.lines.filter(l => l.pi === i).reduce((s, l) => s + l.total, 0);
  const rowsDef = [
    ['Menge', r => N1.format(r.q)],
    ['Selbstkosten', r => eur(r.sk)],
    ['… pro Stück', r => eur(r.sk / r.q)],
    ['Angebot', (r, i) => eur(lineSum(i))],
    ['Gewinn ca.', (r, i) => { const g = lineSum(i) * (1 - R.z.rb) * (1 - R.z.sk) - r.sk; return h('span', { class: g < 0 ? 'neg' : '', text: eur(g) }); }],
    ['Arbeitszeit', r => r.fest ? '–' : hm(r.minutes || 0)]
  ];
  rowsDef.forEach(([l, f]) => { const row = h('tr', null, [h('td', { text: l })]); R.rows.forEach((r, i) => { const v = f(r, i); row.appendChild(h('td', null, [v])); }); bd.appendChild(row); });
}

// ---- Staffelpreise ----
function renderStaffel(R) {
  const hd = $('t-staffel-h'), bd = $('t-staffel'); hd.textContent = ''; bd.textContent = '';
  if (!R.totalQ) { bd.appendChild(h('tr', null, [h('td', { class: 'l mut', text: 'Staffelpreise gibt es nur für Textilien und Transfers.' })])); return; }
  const tr = h('tr', null, [h('th', { text: 'Menge gesamt' })]);
  const prodRows = R.rows.filter(r => r.typ !== 'leistung');
  prodRows.forEach(r => tr.appendChild(h('th', { text: (r.p.name || 'Position').slice(0, 18) })));
  tr.appendChild(h('th', { text: 'Ø pro Teil' })); tr.appendChild(h('th', { text: 'Angebot netto' })); tr.appendChild(h('th', { text: 'Gewinn' }));
  hd.appendChild(tr);
  const extra = ($('staffelExtra').value || '').split(/[;, ]+/).map(x => Math.round(n(x))).filter(x => x > 0 && x <= 100000);
  const steps = Array.from(new Set([10, 25, 50, 100, 250, 500].concat(extra, [R.totalQ]))).sort((a, b) => a - b);
  steps.forEach(N => {
    const C = N === R.totalQ ? R : calc(scaleJob(jobForVariant(job), N, R.totalQ), settingsFor(job, S), false);
    const row = h('tr', N === R.totalQ ? { class: 'cur' } : null, [h('td', { text: C.totalQ + (N === R.totalQ ? ' (aktuell)' : '') })]);
    C.rows.filter(r => r.typ !== 'leistung').forEach(r => row.appendChild(h('td', { text: eur(r.baseUnit) })));
    row.appendChild(h('td', { text: C.totalQ ? eur(C.net / C.totalQ) : '–' }));
    row.appendChild(h('td', { text: eur(C.net) }));
    row.appendChild(h('td', { class: C.profit < 0 ? 'neg' : '', text: eur(C.profit) }));
    bd.appendChild(row);
  });
}

// ---- Nachkalkulation ----
function renderNach(R) {
  const I = istValues(job, S, R), tb = $('t-nach'); tb.textContent = '';
  const row = (l, a, b, d, neg) => tb.appendChild(h('tr', null, [h('td', { text: l }), h('td', { text: a }), h('td', { text: b }), h('td', { class: neg ? 'neg' : 'good', text: d })]));
  row('Arbeitszeit' + (I.fromTimer ? ' (Zeiterfassung)' : ''), hm(R.minutes), hm(I.min), (I.min - R.minutes >= 0 ? '+' : '−') + hm(Math.abs(I.min - R.minutes)), I.min > R.minutes);
  row('Folie' + (I.fromSheets ? ' (aus Gang Sheets)' : ''), N2.format(R.meter) + ' m', N2.format(I.meter) + ' m', (I.meter - R.meter >= 0 ? '+' : '') + N2.format(I.meter - R.meter) + ' m', I.meter > R.meter);
  row('Folienkosten' + (I.filmFixed ? ' (fester Betrag)' : ''), eur(R.filmCost), eur(I.filmIst), eur(I.filmIst - R.filmCost), I.filmIst > R.filmCost);
  if (I.fehl > 0) row('Fehldrucke (eingeplant ' + I.fehlGeplant + ')', String(I.fehlGeplant), String(I.fehl), eur(I.dFehl), I.dFehl > 0);
  row('Ungeplante Kosten', eur(0), eur(I.extra), eur(I.extra), I.extra > 0);
  row('Selbstkosten', eur(R.selbst), eur(I.sk), eur(I.sk - R.selbst), I.sk > R.selbst);
  row('Gewinn', eur(R.profit), eur(I.profit), eur(I.profit - R.profit), I.profit < R.profit);
}

// ======================= Speichern / Laden =======================
function jobPayload() {
  const data = clone(job); delete data.id;
  data.updatedAt = Date.now();
  const R = calcJob(job, S, false);
  data.angebotNetto = R.net; data.angebotBrutto = R.brutto; data.gewinnEuro = r2(R.profit); data.teile = R.totalQ; data.planCm = r2(R.planCm); data.minuten = Math.round(R.minutes);
  return data;
}
function persistJob() {
  if (saving) return Promise.resolve(false);
  if (job.id === null) job.id = uid();
  saving = true; updateState();
  return Store.saveJob(job.id, jobPayload()).then(() => {
    saving = false; dirty = false; updateState(); toast('Auftrag gespeichert'); return true;
  }, e => {
    saving = false; updateState();
    showMsg(e && e.code === 'storage_full' ? 'Der Browser-Speicher ist voll oder gesperrt. Lade eine Datensicherung herunter.' : 'Speichern hat nicht geklappt' + (e && e.code ? ' (' + e.code + ')' : '') + '. Versuch es nochmal.');
    return false;
  });
}
function openJob(id) {
  const j = Store.jobs.find(x => x.id === id); if (!j) return;
  job = normalizeJob(clone(j.data), S); job.id = id; dirty = false; touched = true;
  $('ziel').value = ''; $('zielStk').value = ''; $('msg').hidden = true;
  renderAll();
}
function newJob(kunde) {
  job = blankJob(S); dirty = false; touched = false;
  if (kunde) { applyKunde(kunde); touched = true; dirty = true; }
  $('ziel').value = ''; $('zielStk').value = ''; $('msg').hidden = true;
  renderAll();
}
// Vor dem Wechsel zu einem anderen Auftrag nachfragen, wenn etwas ungespeichert ist
function guardSwitch(fn) {
  if (!(dirty || (job.id === null && touched))) { fn(); return; }
  ask('„' + (job.name || 'Auftrag') + '“ hat ungespeicherte Änderungen.', {
    title: 'Änderungen speichern?',
    buttons: [{ label: 'Speichern', value: 'save', cls: 'primary' }, { label: 'Verwerfen', value: 'drop', cls: 'ghost danger' }, { label: 'Abbrechen', value: false, cls: 'ghost' }]
  }).then(v => { if (v === 'save') persistJob().then(ok => { if (ok) fn(); }); else if (v === 'drop') fn(); });
}
function renderAll() {
  renderJobFields(); renderVariants(); renderPositions(); renderResults(); updateState(); renderTimer(); renderSnap();
  HOOKS.jobRender.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
}
// Neuen (noch nicht gespeicherten) Auftrag öffnen, z. B. aus Vorlage, Anfrage oder Infoblatt
function loadNewJob(j, hints, title) {
  guardSwitch(() => {
    job = normalizeJob(j, S); job.id = null; dirty = true; touched = true;
    showView('auftrag'); renderAll();
    if (hints) showMsg(title || 'Neuer Auftrag übernommen. Bitte prüfen und speichern.', 'info', hints.length ? hints : null);
  });
}

// ======================= Dokumente =======================
const STATUS_IDX = s => ['angebot', 'auftrag', 'produktion', 'geliefert', 'berechnet', 'bezahlt'].indexOf(s);
// Einstellungen für den Auftrag festschreiben (ab dem ersten Dokument rechnet der Auftrag mit diesem Stand)
function snapSettings() { const c = clone(S); c.fLogo = ''; return c; }
// Dokument erstellen. kind: siehe DOCS in core.js. opts.silent = ohne Statuswechsel-Hinweis
async function makeDoc(kind, opts) {
  opts = opts || {};
  if (!last || !last.lines.length) { showMsg('Der Auftrag ist noch leer.'); return null; }
  const SJ = settingsFor(job, S);
  const miss = docMissing(kind, job, S);
  if (miss.length && ['rechnung', 'anzahlung', 'storno'].includes(kind)) {
    if (!(await ask('Für eine ordentliche Rechnung fehlt noch: ' + miss.join(', ') + '. Trotzdem erstellen?', { title: 'Angaben fehlen', ok: 'Trotzdem erstellen' }))) return null;
  } else if (miss.length) toast('Tipp: Trag in den Einstellungen deine Firmendaten ein.', true);
  const btn = document.querySelector('[data-doc="' + kind + '"]');
  if (btn) { btn.disabled = true; btn.classList.add('busy'); }
  try {
    await loadScript(LIB.jspdf);
    let extra = {};
    if (HOOKS.docPrepare[kind]) {
      const res = await HOOKS.docPrepare[kind](job, calcJob(job, S, false));
      if (res === false) return null;
      if (res && typeof res === 'object') extra = Object.assign(extra, res);
    }
    if (!job.Ssnap && kind !== 'mahnung') { job.Ssnap = snapSettings(); markDirty(); renderSnap(); }
    // Nummer vergeben: feste Nummer pro Auftrag (key) oder jedes Mal neu (z. B. Storno)
    const D = DOCS[kind];
    let nr = extra.nr || '';
    if (!nr && D.key) { if (!job[D.key]) { job[D.key] = await Store.nextNumber(kind, S); markDirty(); } nr = job[D.key]; }
    else if (!nr && D.cnt) nr = await Store.nextNumber(kind, S);
    if (kind === 'rechnung' && !job.reDatum) { job.reDatum = todayIso(); markDirty(); }
    const target = { ab: 'auftrag', produktion: 'produktion', lieferschein: 'geliefert', rechnung: 'berechnet' }[kind];
    if (target && job.status !== 'abgelehnt' && STATUS_IDX(job.status) < STATUS_IDX(target)) { job.status = target; markDirty(); if (!opts.silent) toast('Status: ' + STATUS[target].l); }
    const R = calcJob(job, S, false);
    if (kind === 'angebot' && variantKeys(job).length > 1) extra.variants = variantKeys(job).map(k => ({ key: k, name: job.varNamen[k], R: calc(jobForVariant(job, k), SJ, false) }));
    for (const fn of HOOKS.docExtras) { try { const r = await fn(kind, job, R); if (r) Object.assign(extra, r); } catch (e) { console.error(e); } }
    renderJobFields();
    const doc = buildPdf(kind, job, R, SJ, nr, extra);
    const fname = (D.l.replace(/[^A-Za-zÄÖÜäöüß]/g, '')) + (nr ? '_' + nr : '') + (job.kunde ? '_' + job.kunde.replace(/[^A-Za-z0-9ÄÖÜäöüß_-]+/g, '_').slice(0, 40) : '') + '.pdf';
    try { await saveFile(fname, doc.output('arraybuffer')); }
    catch (e) { if (e && e.code !== 'declined') showMsg('Das PDF konnte nicht gespeichert werden (' + (e.code || 'Fehler') + ').'); return null; }
    if (HOOKS.docAfter[kind]) { try { await HOOKS.docAfter[kind](job, nr); } catch (e) { console.error(e); } }
    renderJobFields();
    if (dirty || job.id === null) await persistJob();
    return nr || true;
  } catch (e) {
    console.error(e);
    showMsg('Das PDF konnte nicht erstellt werden. Prüf die Internetverbindung (die PDF-Bibliothek wird beim ersten Mal geladen) und versuch es nochmal.');
    return null;
  } finally { if (btn) { btn.disabled = false; btn.classList.remove('busy'); } }
}

// ======================= Gang Sheets und Konfigurator-Projekt =======================
function addSheets(files) {
  const list = Array.from(files || []); if (!list.length) return;
  const prog = $('sheetProg'); prog.hidden = false; prog.classList.add('run');
  const W = n(anbieterOf(job, S).breite);
  let i = 0;
  (function nextOne() {
    if (i >= list.length) { prog.hidden = true; prog.classList.remove('run'); changed(); return; }
    const f = list[i++]; prog.textContent = 'Messe ' + f.name + ' …';
    const isPdf = /\.pdf$/i.test(f.name) || f.type === 'application/pdf';
    if (!isPdf && /\.jpe?g$/i.test(f.name)) { toast(f.name + ': JPG hat keinen transparenten Hintergrund. Nutze PNG oder PDF.', true); nextOne(); return; }
    (isPdf ? analyzePdf(f, W) : analyzeImage(f, W)).then(s => { job.sheets.push(s); }).catch(() => toast(f.name + ' konnte nicht gelesen werden.', true)).then(nextOne);
  })();
}
function importGangSheetProject(file) {
  readGangSheetProject(file).then(P => {
    const total = P.motifs.reduce((s, m) => s + m.qty, 0);
    return ask(P.motifs.length + ' Motive mit zusammen ' + total + ' Transfers gefunden. Wie übernehmen?', {
      title: 'Konfigurator-Projekt',
      buttons: [{ label: 'Als Transfer-Positionen', value: 'pos', cls: 'primary' }, { label: 'Nur Folienlänge', value: 'len', cls: 'ghost' }, { label: 'Abbrechen', value: false, cls: 'ghost' }]
    }).then(v => {
      if (v === 'pos') {
        P.motifs.forEach(m => {
          const p = newPosition(S, null, 'transfer');
          p.name = m.name; p.menge = m.qty; p.motive = [{ id: uid(), name: m.name, w: m.w, h: m.h, pers: false }];
          job.positionen.push(p);
        });
        structural(); toast(P.motifs.length + ' Positionen übernommen');
      } else if (v === 'len') {
        let len, cov = null, note;
        const W = P.sheetW || n(anbieterOf(job, S).breite);
        if (P.sheets > 0 && P.sheetH > 0) { len = P.sheets * P.sheetH; note = P.sheets + ' Blätter laut Projekt'; }
        else {
          const plan = planFilm(P.motifs.map((m, i) => ({ w: m.w, h: m.h, count: m.qty, pi: i, label: m.name })), W, n(S.abstand));
          const blaetter = P.sheetH > 0 ? Math.max(1, Math.ceil(plan.len / P.sheetH)) : 0;
          len = blaetter ? blaetter * P.sheetH : plan.len;
          const used = P.motifs.reduce((s, m) => s + m.w * m.h * m.qty, 0);
          cov = len > 0 ? Math.min(1, used / (len * W)) : null;
          note = blaetter ? 'ca. ' + blaetter + ' Blätter à ' + N1.format(P.sheetH) + ' cm (geschätzt)' : 'geschätzt';
        }
        job.sheets.push({ id: uid(), name: file.name, pxW: W, pxH: len, widthCm: W, lengthCm: len, coverage: cov, note });
        changed(); toast('Folienlänge übernommen');
      }
    });
  }).catch(e => toast(e.message || 'Projekt konnte nicht gelesen werden.', true));
}

// ======================= Infoblatt einlesen =======================
let impFile = null, impCtl = null;
function setImpFile(f) { impFile = f || null; $('impDrop').classList.toggle('has', !!f); setText('impFileName', f ? 'Ausgewählt: ' + f.name : 'Oder Datei hierher ziehen. Excel, CSV, PDF, Foto.'); }
function runImport() {
  const text = $('impText').value.trim(), prog = $('impProg');
  if (!text && !impFile) { prog.textContent = 'Füg Text ein oder wähl eine Datei.'; prog.hidden = false; return; }
  if (!Store.caps.sample) { prog.textContent = 'Das Einlesen braucht eine Verbindung zu Claude. Das geht nur, wenn die Seite als Claude-Artifact läuft. In der späteren Web-App läuft das über einen eigenen Server (siehe docs/WEBAPP-PLAN.md).'; prog.hidden = false; return; }
  const goBtn = $('impGo'), stop = $('impStop');
  goBtn.disabled = true; stop.hidden = false; prog.hidden = false; prog.classList.add('run'); prog.textContent = 'Datei wird gelesen …';
  impCtl = new AbortController(); const ctl = impCtl;
  (impFile ? fileToContent(impFile) : Promise.resolve({ text: '', images: [] })).then(c => {
    const allText = [text, c.text].filter(Boolean).join('\n\n');
    let imgs = c.images || [];
    const limP = imgs.length ? Store.caps.sample.limits().catch(() => ({})) : Promise.resolve({});
    return limP.then(lim => {
      if (imgs.length && !(lim && lim.images)) throw { code: 'images_unavailable' };
      if (imgs.length) imgs = imgs.slice(0, lim.images.maxCount || 1);
      prog.textContent = 'Claude liest das Infoblatt. Das dauert meist 10 bis 40 Sekunden …';
      const opts = { signal: ctl.signal, modelTier: 'default' }; if (imgs.length) opts.images = imgs;
      return Store.caps.sample.json(buildPrompt(S, allText, imgs.length > 0), opts);
    });
  }).then(res => {
    if (!res || typeof res !== 'object') throw { code: 'invalid_json' };
    const r = jobFromImport(S, res);
    $('impDlg').close();
    guardSwitch(() => {
      job = r.job; dirty = true; touched = true;
      showView('auftrag'); renderAll();
      showMsg('Auftrag aus dem Infoblatt übernommen. Bitte kurz prüfen und speichern.', 'info', r.hints.length ? r.hints : ['Alles erkannt.']);
    });
  }).catch(e => {
    const code = e && e.code;
    prog.textContent = {
      cancelled: 'Abgebrochen.', not_granted: 'Claude wurde für diese Seite nicht erlaubt.', rate_limited: 'Gerade zu viele Anfragen oder dein Nutzungslimit ist erreicht. Versuch es später nochmal.',
      images_unavailable: 'Bilder können hier nicht gelesen werden. Füg den Text ein oder nutz Excel.', image_rejected: 'Das Bild konnte nicht verarbeitet werden. Versuch ein anderes Foto.',
      invalid_json: 'Claude konnte das Blatt nicht sauber auslesen. Versuch es nochmal oder nutz die Excel-Vorlage.', prompt_too_large: 'Die Datei ist zu groß. Schick nur die wichtigen Seiten.'
    }[code] || 'Das Auslesen hat nicht geklappt. Versuch es nochmal.';
  }).then(() => { goBtn.disabled = false; stop.hidden = true; impCtl = null; prog.classList.remove('run'); });
}

// ======================= Auftragsliste =======================
function renderList() {
  const chips = $('listChips'); chips.textContent = '';
  const jobs = Store.jobs;
  [['alle', 'Alle'], ['offen', 'Offen']].concat(Object.keys(STATUS).map(k => [k, STATUS[k].l])).forEach(([k, l]) => {
    const cnt = k === 'alle' ? jobs.length : k === 'offen' ? jobs.filter(j => !['bezahlt', 'abgelehnt'].includes(j.data.status)).length : jobs.filter(j => (j.data.status || 'angebot') === k).length;
    if (cnt === 0 && !['alle', 'offen', 'angebot'].includes(k)) return;
    chips.appendChild(h('button', { class: 'chip', type: 'button', 'aria-pressed': String(listFilter === k), onclick: () => { listFilter = k; renderList(); } }, [l + ' ' + cnt]));
  });
  const q = $('listSearch').value.trim().toLowerCase();
  const rows = jobs.filter(j => {
    const d = j.data, st = d.status || 'angebot';
    const okF = listFilter === 'alle' || (listFilter === 'offen' ? !['bezahlt', 'abgelehnt'].includes(st) : st === listFilter);
    const hay = [d.name, d.kunde, d.angebotNr, d.abNr, d.reNr, d.kundeNr].join(' ').toLowerCase();
    return okF && (!q || hay.includes(q));
  }).sort((a, b) => (b.data.updatedAt || 0) - (a.data.updatedAt || 0));
  const tb = $('t-list'); tb.textContent = '';
  if (!rows.length) tb.appendChild(h('tr', null, [h('td', { colspan: '7', class: 'l' }, [h('div', { class: 'empty', style: 'border:0' }, [h('strong', { text: jobs.length ? 'Keine Treffer' : 'Noch keine gespeicherten Aufträge' }), jobs.length ? 'Ändere Filter oder Suche.' : 'Rechne einen Auftrag und klick auf „Speichern“. Er erscheint dann hier.'])])]));
  let sumNet = 0, sumG = 0;
  rows.forEach(j => {
    const d = j.data;
    if (WON.includes(d.status)) { sumNet += n(d.angebotNetto); sumG += n(d.gewinnEuro); }
    const sel = h('select', { class: 'statussel', 'aria-label': 'Status', onclick: e => e.stopPropagation(), onchange: e => {
      d.status = e.target.value; if (d.status === 'bezahlt' && !d.bezahltAm) d.bezahltAm = todayIso();
      d.updatedAt = Date.now();
      Store.saveJob(j.id, d).then(() => { toast('Status geändert'); if (job.id === j.id && !dirty) openJob(j.id); renderList(); });
    } });
    Object.keys(STATUS).forEach(k => sel.appendChild(h('option', { value: k, text: STATUS[k].l })));
    sel.value = d.status || 'angebot';
    sel.style.color = 'var(' + (STATUS[sel.value] || STATUS.angebot).c + ')';
    const nums = [d.angebotNr, d.abNr, d.reNr].filter(Boolean).join(' · ');
    const open = () => guardSwitch(() => { openJob(j.id); showView('auftrag'); });
    tb.appendChild(h('tr', { class: 'click', tabindex: '0', onclick: open, onkeydown: e => { if (e.key === 'Enter') open(); } }, [
      h('td', null, [d.name || 'Ohne Namen', d.kunde ? h('small', { text: d.kunde }) : null]),
      h('td', { class: 'l' }, [sel]),
      h('td', { text: fmtDate(d.datum) }),
      h('td', { class: 'l mut', text: nums || '–' }),
      h('td', { text: String(d.teile || 0) }),
      h('td', { text: eur(n(d.angebotNetto)) }),
      h('td', { class: n(d.gewinnEuro) < 0 ? 'neg' : '', text: eur(n(d.gewinnEuro)) })
    ]));
  });
  setText('listSum', sumNet > 0 ? 'Zugesagte Aufträge in dieser Ansicht: ' + eur(sumNet) + ' netto, ' + eur(sumG) + ' geplanter Gewinn.' : '');
  HOOKS.listRender.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
}

// ======================= Kunden =======================
let editKunde = null;
function kundenStats(id, name) {
  const js = Store.jobs.filter(j => j.data.kundeId === id || (!j.data.kundeId && name && j.data.kunde === name));
  const won = js.filter(j => WON.includes(j.data.status));
  return { jobs: js, count: js.length, net: won.reduce((s, j) => s + n(j.data.angebotNetto), 0), profit: won.reduce((s, j) => s + n(j.data.gewinnEuro), 0) };
}
function renderKunden() {
  const q = $('kSearch').value.trim().toLowerCase(), tb = $('t-kunden'); tb.textContent = '';
  const list = Store.kunden.filter(k => !q || [k.data.firma, k.data.ansprech, k.data.nr, k.data.email, k.data.adresse].join(' ').toLowerCase().includes(q))
    .sort((a, b) => (a.data.firma || '').localeCompare(b.data.firma || ''));
  if (!list.length) tb.appendChild(h('tr', null, [h('td', { colspan: '6', class: 'l' }, [h('div', { class: 'empty', style: 'border:0' }, [h('strong', { text: Store.kunden.length ? 'Keine Treffer' : 'Noch keine Kunden' }), 'Leg Kunden hier an oder speichere sie direkt aus einem Auftrag („Als Kunde speichern“).'])])]));
  list.forEach(k => {
    const d = k.data, st = kundenStats(k.id, d.firma);
    tb.appendChild(h('tr', { class: 'click', tabindex: '0', onclick: () => openKunde(k), onkeydown: e => { if (e.key === 'Enter') openKunde(k); } }, [
      h('td', null, [d.firma || 'Ohne Namen', h('small', { text: [d.nr, (d.adresse || '').split('\n').pop()].filter(Boolean).join(' · ') })]),
      h('td', { class: 'l' }, [d.ansprech || '', h('small', { text: [d.tel, d.email].filter(Boolean).join(' · ') })]),
      h('td', { text: n(d.rabatt) ? pct(n(d.rabatt)) : '–' }),
      h('td', { text: String(st.count) }), h('td', { text: eur(st.net) }), h('td', { text: eur(st.profit) })
    ]));
  });
}
const KFIELDS = { firma: 'k-firma', ansprech: 'k-ansprech', nr: 'k-nr', tel: 'k-tel', email: 'k-email', adresse: 'k-adresse', ust: 'k-ust', rabatt: 'k-rabatt', notiz: 'k-notiz' };
function openKunde(k) {
  editKunde = k || null;
  const d = k ? k.data : {};
  Object.keys(KFIELDS).forEach(f => { $(KFIELDS[f]).value = isBlank(d[f]) ? '' : d[f]; });
  setText('kDlgTitle', k ? (d.firma || 'Kunde') : 'Neuer Kunde');
  $('kDel').hidden = !k; $('kNewJob').hidden = !k;
  const box = $('k-jobs'); box.textContent = '';
  if (k) {
    const st = kundenStats(k.id, d.firma);
    if (!st.count) box.textContent = 'Noch keine Aufträge.';
    st.jobs.sort((a, b) => (b.data.datum || '').localeCompare(a.data.datum || '')).forEach(j => box.appendChild(h('div', { class: 'row between', style: 'padding:4px 0;border-bottom:1px solid var(--line)' }, [
      h('button', { class: 'link', type: 'button', onclick: () => { $('kDlg').close(); guardSwitch(() => { openJob(j.id); showView('auftrag'); }); } }, [(j.data.name || 'Auftrag') + ' · ' + fmtDate(j.data.datum)]),
      h('span', null, [statusBadge(j.data.status), ' ', eur(n(j.data.angebotNetto))])
    ])));
  } else box.textContent = 'Nach dem Speichern siehst du hier die Aufträge.';
  $('kDlg').showModal();
  setTimeout(() => $('k-firma').focus(), 30);
}
function saveKundeData(id, data) {
  const p = data.nr ? Promise.resolve(data.nr) : Store.nextNumber('kunde', S);
  return p.then(nr => { data.nr = nr; data.updatedAt = Date.now(); return Store.saveKunde(id, data).then(() => ({ id, data })); });
}

// ======================= Auswertung =======================
function renderDash() {
  const chips = $('periodChips'); chips.textContent = '';
  [['jahr', 'Dieses Jahr'], ['12m', 'Letzte 12 Monate'], ['alle', 'Alles']].forEach(([k, l]) => chips.appendChild(h('button', { class: 'chip', type: 'button', 'aria-pressed': String(period === k), onclick: () => { period = k; renderDash(); } }, [l])));
  const now = new Date();
  const from = period === 'jahr' ? now.getFullYear() + '-01-01' : period === '12m' ? todayIso(new Date(now.getFullYear() - 1, now.getMonth() + 1, 1)) : '';
  const A = summarizeJobs(Store.jobs, from);
  const box = $('dashStats'); box.textContent = '';
  box.style.gridTemplateColumns = 'repeat(auto-fit, minmax(170px, 1fr))';
  [['Umsatz netto', eur(A.wonNet), A.won + ' zugesagte Aufträge'], ['Gewinn geplant', eur(A.wonProfit), A.marge === null ? '–' : pct(A.marge) + ' vom Umsatz'],
   ['Angebotsquote', A.quote === null ? '–' : pct(A.quote), 'angenommen von entschiedenen'], ['Teile', N0.format(A.pieces), 'in zugesagten Aufträgen'],
   ['Offene Angebote', eur(A.openOffersNet), A.openOffers + ' Angebote warten'], ['Offene Rechnungen', eur(A.openInvoicesNet), A.openInvoices + ' noch nicht bezahlt']]
    .forEach(([l, v, s]) => box.appendChild(h('div', null, [h('span', { text: l }), h('strong', { text: v }), h('small', { text: s })])));

  // Monatsbalken
  const months = [];
  const start = period === 'jahr' ? new Date(now.getFullYear(), 0, 1) : new Date(now.getFullYear(), now.getMonth() - 11, 1);
  for (let d = new Date(start); d <= now; d.setMonth(d.getMonth() + 1)) months.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
  const svg = $('chart'); svg.textContent = '';
  const Wd = 640, Ht = 220, pad = 34, max = Math.max(1, ...months.map(m => (A.months[m] || {}).net || 0));
  svg.setAttribute('viewBox', '0 0 ' + Wd + ' ' + Ht);
  const ns = 'http://www.w3.org/2000/svg', el = (t, a, txt) => { const e = document.createElementNS(ns, t); for (const k in a) e.setAttribute(k, a[k]); if (txt) e.textContent = txt; svg.appendChild(e); return e; };
  const axis = v => v === 0 ? '0' : max >= 1000 ? N1.format(v / 1000) + 'k' : N0.format(v);
  [0, .5, 1].forEach(f => { const y = Ht - 22 - f * (Ht - 40); el('line', { x1: pad, x2: Wd, y1: y, y2: y, class: 'grid-l' }); el('text', { x: pad - 4, y: y + 4, 'text-anchor': 'end' }, axis(max * f)); });
  const bw = (Wd - pad - 10) / Math.max(months.length, 1);
  const MN = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  months.forEach((m, i) => {
    const v = A.months[m] || { net: 0, profit: 0 }, x = pad + 6 + i * bw, hh = Ht - 40;
    const h1 = v.net / max * hh, h2 = Math.max(0, v.profit) / max * hh, w = Math.max(4, bw * 0.34);
    el('rect', { x, y: Ht - 22 - h1, width: w, height: Math.max(h1, 0), rx: 2, class: 'b1' }).appendChild(document.createElementNS(ns, 'title')).textContent = MN[n(m.slice(5)) - 1] + ': ' + eur(v.net) + ' Umsatz';
    el('rect', { x: x + w + 2, y: Ht - 22 - h2, width: w, height: h2, rx: 2, class: 'b2' }).appendChild(document.createElementNS(ns, 'title')).textContent = eur(v.profit) + ' Gewinn';
    el('text', { x: x + w, y: Ht - 6, 'text-anchor': 'middle' }, MN[n(m.slice(5)) - 1]);
  });

  // Status
  const fu = $('funnel'); fu.textContent = '';
  const maxC = Math.max(1, ...Object.keys(STATUS).map(k => A.by[k].count));
  Object.keys(STATUS).forEach(k => fu.appendChild(h('div', { class: 'fl' }, [statusBadge(k), h('div', { class: 'track', style: '--c:var(' + STATUS[k].c + ')' }, [h('i', { style: 'width:' + (A.by[k].count / maxC * 100) + '%' })]), h('span', { class: 'mut', style: 'text-align:right', text: A.by[k].count + ' · ' + eur(A.by[k].net) })])));

  // Beste Kunden
  const tt = $('t-top'); tt.textContent = '';
  const top = Object.keys(A.kunden).map(k => Object.assign({ name: k }, A.kunden[k])).sort((a, b) => b.net - a.net).slice(0, 8);
  if (!top.length) tt.appendChild(h('tr', null, [h('td', { colspan: '4', class: 'l mut', text: 'Noch keine zugesagten Aufträge in diesem Zeitraum.' })]));
  top.forEach(k => tt.appendChild(h('tr', null, [h('td', { text: k.name }), h('td', { text: String(k.count) }), h('td', { text: eur(k.net) }), h('td', { class: k.profit < 0 ? 'neg' : '', text: eur(k.profit) })])));

  // Offene Posten: Rechnungen offen, geliefert aber nicht berechnet
  const to = $('t-open'); to.textContent = '';
  const open = Store.jobs.filter(j => ['berechnet', 'geliefert'].includes(j.data.status)).sort((a, b) => (a.data.reDatum || a.data.datum || '').localeCompare(b.data.reDatum || b.data.datum || ''));
  if (!open.length) to.appendChild(h('tr', null, [h('td', { colspan: '4', class: 'l mut', text: 'Nichts offen.' })]));
  open.forEach(j => {
    const d = j.data, inv = d.status === 'berechnet', due = inv ? addDays(d.reDatum || d.datum, n(S.zahlungsziel)) : '';
    const late = inv && due < todayIso();
    to.appendChild(h('tr', { class: 'click', onclick: () => guardSwitch(() => { openJob(j.id); showView('auftrag'); }) }, [
      h('td', null, [d.name || 'Auftrag', h('small', { text: [d.kunde, d.reNr].filter(Boolean).join(' · ') })]),
      h('td', { class: 'l' }, [inv ? statusBadge('berechnet') : h('span', { class: 'mut', text: 'Rechnung fehlt' })]),
      h('td', { class: late ? 'neg' : '', text: inv ? fmtDate(due) + (late ? ' (überfällig)' : '') : '–' }),
      h('td', { text: eur(n(d.angebotBrutto) || n(d.angebotNetto)) })
    ]));
  });
}

// ======================= Einstellungen =======================
function setChanged() { sDirty = true; updateState(); renderResults(); }
function softChanged() { sDirty = true; updateState(); }
function renderSettings() {
  document.querySelectorAll('[data-set]').forEach(el => { const v = S[el.dataset.set]; if (el.hasAttribute('data-bool')) el.checked = v !== false; else el.value = isBlank(v) ? '' : v; });
  const img = $('logoImg');
  if (S.fLogo) { img.src = S.fLogo; img.hidden = false; $('logoDel').hidden = false; } else { img.hidden = true; $('logoDel').hidden = true; }
  renderAnbieter(); renderPressen(); renderFixList(); renderDs(); renderCatalog(); renderCalib();
  if (typeof renderCloudBox === 'function') renderCloudBox();
  setText('storeInfo', Store.mode === 'cloud' ? 'Deine Daten liegen in der Cloud (Firma „' + Cloud.firma.name + '“, ' + Store.jobs.length + ' Aufträge, ' + Store.kunden.length + ' Kunden). Eine Datensicherung als Datei schadet trotzdem nicht.' : Store.mode === 'db' ? 'Deine Daten liegen in der Datenbank dieses Claude-Artifacts.' : 'Deine Daten liegen nur in diesem Browser auf diesem Gerät (' + Store.jobs.length + ' Aufträge, ' + Store.kunden.length + ' Kunden). Lade regelmäßig eine Datensicherung herunter, z. B. vor dem Löschen des Browserverlaufs.');
}
function listRow(cols, kids) { return h('div', { class: 'lrow', style: 'grid-template-columns:' + cols }, kids); }
function stdChip(on, onclick) { return h('button', { class: 'chip', type: 'button', 'aria-pressed': String(on), title: 'Als Standard für neue Aufträge', onclick }, [on ? 'Standard' : 'Als Standard']); }

function renderAnbieter() {
  const box = $('anbieterList'); box.textContent = '';
  S.anbieter.forEach(a => {
    const card = h('div', { class: 'subcard' });
    card.appendChild(h('div', { class: 'head' }, [
      textIn(a.name, v => { a.name = v; softChanged(); }, { maxlength: '60', 'aria-label': 'Name des Anbieters', onchange: () => renderJobSelects() }),
      stdChip(S.anbieterId === a.id, () => { S.anbieterId = a.id; setChanged(); renderAnbieter(); renderJobSelects(); }),
      S.anbieter.length > 1 ? h('button', { class: 'x', type: 'button', 'aria-label': 'Anbieter entfernen', onclick: () => { S.anbieter = S.anbieter.filter(x => x !== a); if (S.anbieterId === a.id) S.anbieterId = S.anbieter[0].id; setChanged(); renderAnbieter(); renderJobSelects(); } }, ['×']) : null
    ]));
    const modell = h('select', { onchange: e => { a.modell = e.target.value; setChanged(); renderAnbieter(); } }, [h('option', { value: 'meter', text: 'Einkauf' }), h('option', { value: 'eigen', text: 'Eigendruck' })]);
    modell.value = a.modell;
    const f = (k, l, u, step) => unitLbl(l, u, numIn(a[k], step, v => { a[k] = n(v); setChanged(); }));
    card.appendChild(h('div', { class: 'grid3', style: 'margin-top:8px' }, [
      lbl('Kostenmodell', modell), f('breite', 'Breite', 'cm', '1'), f('versand', 'Versand', '€/Bestellung', '0.5'),
      f('vorlauf', 'Zuschlag', 'cm/Bestellung', '1'), f('schritt', 'Abrechnung', 'm-Schritte', '0.05'), f('minMeter', 'Mindestens', 'm', '0.5'),
      a.modell === 'eigen' ? f('tinteM2', 'Tinte', '€/m² bedruckt', '0.5') : null
    ]));
    card.appendChild(h('div', { class: 'sub' }, [a.modell === 'eigen' ? 'Folie + Pulver pro Meter' : 'Preis pro Laufmeter']));
    a.staffel.slice().sort((x, y) => n(x.ab) - n(y.ab)).forEach(x => card.appendChild(listRow('minmax(0,1fr) minmax(0,1fr) 26px', [
      unitLbl('ab', 'Meter', numIn(x.ab, '1', v => { x.ab = n(v); setChanged(); })),
      unitLbl('Preis', '€/m', numIn(x.preis, '0.1', v => { x.preis = n(v); setChanged(); })),
      a.staffel.length > 1 ? h('button', { class: 'x', type: 'button', 'aria-label': 'Stufe entfernen', onclick: () => { a.staffel = a.staffel.filter(y => y !== x); setChanged(); renderAnbieter(); } }, ['×']) : h('span')
    ])));
    card.appendChild(h('button', { class: 'link', type: 'button', style: 'margin-top:6px', onclick: () => { const mx = a.staffel.reduce((m, x) => Math.max(m, n(x.ab)), 0); a.staffel.push({ id: uid(), ab: mx + 10, preis: 0 }); setChanged(); renderAnbieter(); } }, ['+ Mengenstufe']));
    box.appendChild(card);
  });
}

function renderPressen() {
  const box = $('presseList'); box.textContent = '';
  if (!S.pressen.length) box.appendChild(h('p', { class: 'mut', text: 'Keine Presse angelegt: Maschinenkosten werden nicht eingerechnet (dann am besten über die Gemeinkosten).' }));
  S.pressen.forEach(p => {
    const out = h('div', { class: 'callout' });
    const upd = () => {
      const m = machineRate(p); out.textContent = '';
      out.appendChild(h('div', { class: 'formula' }, [h('b', { text: 'Maschinenstundensatz' }), ' = ', h('span', { class: 'frac' }, [h('span', { text: eur(m.afa) + ' AfA + ' + eur(m.zinsen) + ' Zinsen + ' + eur(m.wartung) + ' Wartung' }), h('span', { text: N0.format(n(p.stunden)) + ' Laufstunden' })]), ' + ', eur(m.energieH) + ' Strom = ', h('b', { text: eur(m.perH) + ' / h' })]));
    };
    const f = (k, l, u, step) => unitLbl(l, u, numIn(p[k], step, v => { p[k] = n(v); upd(); setChanged(); }));
    box.appendChild(h('div', { class: 'subcard' }, [
      h('div', { class: 'head' }, [
        textIn(p.name, v => { p.name = v; softChanged(); }, { maxlength: '60', 'aria-label': 'Name der Presse', onchange: () => renderJobSelects() }),
        stdChip(S.presseId === p.id, () => { S.presseId = p.id; setChanged(); renderPressen(); renderJobSelects(); }),
        h('button', { class: 'x', type: 'button', 'aria-label': 'Presse entfernen', onclick: () => { S.pressen = S.pressen.filter(x => x !== p); if (S.presseId === p.id) S.presseId = S.pressen.length ? S.pressen[0].id : null; setChanged(); renderPressen(); renderJobSelects(); } }, ['×'])
      ]),
      h('div', { class: 'grid3', style: 'margin-top:8px' }, [
        f('preis', 'Anschaffung', '€', '50'), f('jahre', 'Nutzung', 'Jahre', '1'), f('zins', 'Zinssatz', '%', '0.5'),
        f('wartung', 'Wartung', '€/Jahr', '10'), f('stunden', 'Laufzeit', 'h/Jahr', '50'), f('kw', 'Leistung', 'kW', '0.1'),
        f('auslastung', 'Heizanteil', '% der Zeit', '5'), f('strom', 'Strompreis', '€/kWh', '0.01')
      ]),
      out
    ]));
    upd();
  });
}

function renderFixList() {
  const b = $('fixList'); b.textContent = '';
  S.fixkosten.forEach(x => b.appendChild(listRow('minmax(0,1.6fr) minmax(0,1fr) 26px', [
    lbl('Kostenpunkt', textIn(x.name, v => { x.name = v; softChanged(); }, { maxlength: '60' })),
    lbl('€ pro Monat', numIn(x.betrag, '5', v => { x.betrag = n(v); softChanged(); renderFixOut(); })),
    h('button', { class: 'x', type: 'button', 'aria-label': 'Entfernen', onclick: () => { S.fixkosten = S.fixkosten.filter(y => y !== x); softChanged(); renderFixList(); } }, ['×'])
  ])));
  renderFixOut();
}
function renderFixOut() {
  const F = fixHelper(S), o = $('fixOut'); o.textContent = '';
  o.appendChild(h('div', { class: 'formula' }, [h('b', { text: 'Gemeinkosten pro Stunde' }), ' = ', h('span', { class: 'frac' }, [h('span', { text: eur(F.sum) + ' Fixkosten' }), h('span', { text: N1.format(F.hrs) + ' Stunden' })]), ' = ', h('b', { text: eur(F.perH) })]));
  o.appendChild(h('div', { class: 'mut', text: 'Bei ' + eur(F.lohnH) + ' Lohn (inkl. Nebenkosten) sind das ' + pct(F.pct) + ' Fertigungs-Gemeinkosten. Eine Arbeitsstunde kostet dich damit ' + eur(F.lohnH + F.perH) + '.' }));
  o.appendChild(h('button', { class: 'ghost mini', type: 'button', style: 'align-self:flex-start', onclick: () => { S.fgk = Math.round(F.pct); $('s-fgk').value = S.fgk; setChanged(); } }, ['Als Fertigungs-Gemeinkosten übernehmen']));
}
function renderDs() {
  const b = $('dsList'); b.textContent = '';
  S.druckstellen.forEach(d => b.appendChild(listRow('minmax(0,1.6fr) 70px 70px 26px', [
    lbl('Name', textIn(d.name, v => { d.name = v; softChanged(); }, { maxlength: '40', onchange: () => { renderPositions(); renderJobSelects(); } })),
    lbl('Breite', numIn(d.w, '0.5', v => { d.w = n(v); softChanged(); })), lbl('Höhe', numIn(d.h, '0.5', v => { d.h = n(v); softChanged(); })),
    h('button', { class: 'x', type: 'button', 'aria-label': 'Entfernen', onclick: () => { S.druckstellen = S.druckstellen.filter(y => y !== d); softChanged(); renderDs(); renderPositions(); } }, ['×'])
  ])));
}
function renderCatalog() {
  const tb = $('t-cat'); tb.textContent = '';
  S.artikel.forEach(a => {
    const num = (k, step, w) => h('td', null, [numIn(a[k], step, v => { a[k] = isBlank(v) && k === 'pressSek' ? '' : n(v); softChanged(); }, { style: 'width:' + (w || 76) + 'px', 'aria-label': k + ' ' + a.name })]);
    const txt = (k, w, ph) => h('td', { class: 'l' }, [textIn(a[k], v => { a[k] = v; softChanged(); }, { style: 'width:' + w + 'px', maxlength: '40', placeholder: ph || '' })]);
    const sel = (k, opts) => { const s = h('select', { style: 'width:100px', onchange: e => { a[k] = e.target.value; softChanged(); } }, opts.map(o => h('option', { value: o, text: o }))); s.value = a[k]; return h('td', { class: 'l' }, [s]); };
    tb.appendChild(h('tr', null, [
      h('td', null, [textIn(a.name, v => { a.name = v; softChanged(); }, { style: 'min-width:150px', maxlength: '60', 'aria-label': 'Artikelname', onchange: () => renderPositions() })]),
      h('td', { class: 'l' }, [(() => {
        // Kleidungsform für Mockup und Datenblatt (GARMENTS aus js/garments.js)
        const G = typeof GARMENTS === 'object' ? GARMENTS : {};
        const s = h('select', { style: 'width:130px', 'aria-label': 'Mockup-Form ' + a.name, onchange: e => { a.modell = e.target.value; softChanged(); } },
          [h('option', { value: '', text: 'automatisch' })].concat(Object.keys(G).map(k => h('option', { value: k, text: G[k].name }))));
        s.value = a.modell && G[a.modell] ? a.modell : '';
        return s;
      })()]),
      txt('kategorie', 100), txt('artNr', 90), txt('lieferant', 110),
      num('ekHell', '0.1'), num('ekDunkel', '0.1'), num('aufXXL', '0.1', 66), num('auf3XL', '0.1', 66),
      h('td', { class: 'ctr' }, [h('input', { type: 'checkbox', checked: a.groessen, 'aria-label': 'Hat Größen', onchange: e => { a.groessen = e.target.checked; softChanged(); } })]),
      h('td', null, [numIn(a.pressSek, '5', v => { a.pressSek = isBlank(v) ? '' : n(v); setChanged(); }, { style: 'width:66px', placeholder: String(S.pressSek), 'aria-label': 'Presszeit ' + a.name })]),
      num('temp', '5', 66), num('zeit', '1', 60),
      sel('druck', ['leicht', 'mittel', 'hoch']), sel('abziehen', ['kalt', 'warm', 'heiß']),
      h('td', null, [h('button', { class: 'x', type: 'button', 'aria-label': 'Entfernen', onclick: () => { S.artikel = S.artikel.filter(x => x !== a); softChanged(); renderCatalog(); renderPositions(); } }, ['×'])])
    ]));
  });
}
function renderCalib() {
  const box = $('calib'), ratios = [], empties = [];
  Store.jobs.forEach(j => {
    const d = j.data; if (!d || !Array.isArray(d.sheets) || !d.sheets.length || !(n(d.planCm) > 0)) return;
    const T = sheetTotals(d);
    if (T.cm > 0) { ratios.push(T.cm / n(d.planCm) - 1); if (T.coverage !== null) empties.push(1 - T.coverage); }
  });
  if (!ratios.length) { box.hidden = true; return; }
  const avg = ratios.reduce((s, x) => s + x, 0) / ratios.length * 100;
  const emp = empties.length ? empties.reduce((s, x) => s + x, 0) / empties.length * 100 : null;
  box.textContent = '';
  box.appendChild(h('strong', { text: 'Aus deinen echten Gang Sheets' }));
  box.appendChild(h('div', { text: 'Bei ' + ratios.length + ' Auftrag' + (ratios.length > 1 ? 'en' : '') + ' war die echte Folie im Schnitt ' + (avg >= 0 ? pct(avg) + ' länger' : pct(-avg) + ' kürzer') + ' als geplant.' + (emp !== null ? ' Leer bezahlt wurden im Schnitt ' + pct(emp) + '.' : '') }));
  if (avg > 0) box.appendChild(h('button', { class: 'ghost mini', type: 'button', style: 'align-self:flex-start', onclick: () => { S.folieZuschlag = Math.round(avg); renderSettings(); setChanged(); } }, ['Als Planungszuschlag übernehmen (' + Math.round(avg) + ' %)']));
  box.hidden = false;
}
function persistSettings() {
  return Store.saveSettings(S).then(() => { sDirty = false; updateState(); toast('Einstellungen gespeichert'); return true; },
    e => { toast('Einstellungen konnten nicht gespeichert werden' + (e && e.code ? ' (' + e.code + ')' : '') + '.', true); return false; });
}

// ======================= Ereignisse =======================
function bindEvents() {
  document.querySelectorAll('[data-job]').forEach(el => {
    el.addEventListener(el.hasAttribute('data-bool') || el.tagName === 'SELECT' || el.type === 'date' ? 'change' : 'input', () => {
      const k = el.dataset.job;
      job[k] = el.hasAttribute('data-bool') ? el.checked : el.hasAttribute('data-num') ? n(el.value) : el.value;
      if (k === 'status' && job.status === 'bezahlt' && !job.bezahltAm) { job.bezahltAm = todayIso(); renderJobFields(); }
      changed();
    });
  });
  document.querySelectorAll('[data-ist]').forEach(el => el.addEventListener('input', () => { job.ist[el.dataset.ist] = el.value; changed(); }));
  document.querySelectorAll('[data-set]').forEach(el => el.addEventListener(el.tagName === 'SELECT' || el.hasAttribute('data-bool') ? 'change' : 'input', () => {
    const k = el.dataset.set; S[k] = el.hasAttribute('data-bool') ? el.checked : el.hasAttribute('data-str') ? el.value : n(el.value);
    setChanged();
    if (['lohn', 'lohnNK', 'prodStunden'].includes(k)) renderFixOut();
  }));
  $('j-kundeSel').addEventListener('change', e => {
    const k = Store.kunden.find(x => x.id === e.target.value);
    if (k) { applyKunde(k); renderJobFields(); changed(); toast('Kundendaten übernommen'); }
    else { job.kundeId = null; changed(); }
  });
  $('j-anbieter').addEventListener('change', e => { job.anbieterId = e.target.value || null; changed(); });
  $('j-presse').addEventListener('change', e => { job.presseId = e.target.value || null; changed(); });
  $('j-express').addEventListener('focus', e => { if (!n(e.target.value) && n(S.express) > 0) e.target.placeholder = 'z. B. ' + S.express; });

  document.querySelectorAll('.nav [data-view]').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
  document.querySelectorAll('.tabs [data-tab]').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
  document.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => {
    const np = newPosition(S, null, b.dataset.add); enterId = np.id; job.positionen.push(np); structural(); enterId = null;
    const el = $('pt-' + np.id); if (el) el.closest('.pos').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
  }));
  document.querySelectorAll('[data-doc]').forEach(b => b.addEventListener('click', () => makeDoc(b.dataset.doc)));

  $('saveJob').addEventListener('click', () => persistJob());
  $('timerBtn').addEventListener('click', toggleTimer);
  $('cloudChip').addEventListener('click', () => { showView('einst'); setTimeout(() => { const b = $('cloudBox'); if (b) b.scrollIntoView({ block: 'center' }); }, 50); });
  $('timerChip').addEventListener('click', () => showTab('nach'));
  $('newJob').addEventListener('click', () => guardSwitch(() => newJob()));
  $('newJob2').addEventListener('click', () => guardSwitch(() => { newJob(); showView('auftrag'); }));
  $('dupJob').addEventListener('click', () => {
    const c = clone(job); c.id = null; c.name = (job.name || 'Auftrag') + ' (Kopie)'; c.status = 'angebot'; c.sheets = []; c.ist = emptyIst(); c.datum = todayIso();
    ['angebotNr', 'abNr', 'lsNr', 'reNr', 'reDatum', 'leistungsDatum', 'bezahltAm', 'azNr', 'azDatum', 'azBezahlt', 'lieferDatum', 'prodDatum', 'textilBestellt', 'sammelId'].forEach(k => { c[k] = ''; });
    c.azBetrag = 0; c.zeiten = []; c.stornos = []; c.mahnungen = []; c.Ssnap = null;
    c.positionen.forEach(p => { p.id = uid(); p.motive.forEach(m => { m.id = uid(); }); });
    job = c; dirty = true; touched = true; renderAll(); toast('Kopie erstellt. Sie ist noch nicht gespeichert.');
  });
  $('delJob').addEventListener('click', () => {
    if (!job.id) return;
    ask('„' + (job.name || 'Auftrag') + '“ wird endgültig gelöscht.', { title: 'Auftrag löschen?', ok: 'Löschen', danger: true }).then(v => {
      if (!v) return;
      Store.deleteJob(job.id).then(() => { newJob(); toast('Auftrag gelöscht'); }, e => toast('Löschen hat nicht geklappt' + (e && e.code ? ' (' + e.code + ')' : '') + '.', true));
    });
  });
  $('ziel').addEventListener('input', renderZiel);
  $('zielStk').addEventListener('input', renderZiel);
  $('staffelExtra').addEventListener('input', () => { if (last) renderStaffel(last); });
  $('copyBtn').addEventListener('click', () => {
    const ta = $('offerText');
    const fb = () => { ta.focus(); ta.select(); toast('Text ist markiert. Jetzt Strg+C drücken.'); };
    try { navigator.clipboard.writeText(ta.value).then(() => toast('Angebotstext kopiert'), fb); } catch (e) { fb(); }
  });

  // Kunden
  $('toKunden').addEventListener('click', () => showView('kunden'));
  $('kSearch').addEventListener('input', renderKunden);
  $('newKunde').addEventListener('click', () => openKunde(null));
  $('saveKundeFromJob').addEventListener('click', () => {
    if (!job.kunde.trim()) { toast('Trag zuerst Firma / Name ein.', true); return; }
    const parts = job.kontakt.split(',').map(s => s.trim());
    const email = parts.find(s => s.includes('@')) || '', tel = parts.find(s => /\d{4,}/.test(s.replace(/\s/g, ''))) || '';
    const ex = job.kundeId ? Store.kunden.find(k => k.id === job.kundeId) : null;
    const data = Object.assign(ex ? clone(ex.data) : {}, { firma: job.kunde, ansprech: parts.find(s => s && s !== email && s !== tel) || '', tel, email, adresse: job.adresse, ust: job.kundeUstId, nr: job.kundeNr || (ex ? ex.data.nr : '') });
    if (!ex && n(job.rabatt) > 0) data.rabatt = n(job.rabatt);
    saveKundeData(ex ? ex.id : uid(), data).then(k => { job.kundeId = k.id; job.kundeNr = k.data.nr; renderJobFields(); markDirty(); toast(ex ? 'Kunde aktualisiert' : 'Kunde ' + k.data.nr + ' angelegt'); });
  });
  $('kSave').addEventListener('click', () => {
    const data = editKunde ? clone(editKunde.data) : {};
    Object.keys(KFIELDS).forEach(f => { data[f] = f === 'rabatt' ? n($(KFIELDS[f]).value) : $(KFIELDS[f]).value.trim(); });
    if (!data.firma) { toast('Bitte Firma / Name eintragen.', true); return; }
    saveKundeData(editKunde ? editKunde.id : uid(), data).then(() => { $('kDlg').close(); toast('Kunde gespeichert'); renderKunden(); renderJobSelects(); });
  });
  $('kDel').addEventListener('click', () => {
    if (!editKunde) return;
    const k = editKunde;
    $('kDlg').close();
    ask('„' + (k.data.firma || 'Kunde') + '“ wird aus der Kundenliste gelöscht. Die Aufträge bleiben erhalten.', { title: 'Kunde löschen?', ok: 'Löschen', danger: true }).then(v => {
      if (v) Store.deleteKunde(k.id).then(() => { toast('Kunde gelöscht'); renderKunden(); renderJobSelects(); });
    });
  });
  $('kNewJob').addEventListener('click', () => { const k = editKunde; $('kDlg').close(); guardSwitch(() => { newJob(k); showView('auftrag'); }); });

  // Liste
  $('listSearch').addEventListener('input', renderList);
  $('csvBtn').addEventListener('click', () => saveFile('Auftraege_' + todayIso() + '.csv', jobsCsv(Store.jobs)));

  // Einstellungen
  $('saveSet').addEventListener('click', persistSettings);
  $('resetSet').addEventListener('click', () => ask('Alle Preise, Zeiten und der Katalog werden auf die Beispielwerte zurückgesetzt. Firmendaten bleiben.', { title: 'Beispielwerte laden?', ok: 'Zurücksetzen', danger: true }).then(v => {
    if (!v) return;
    const keep = {}; ['fName', 'fInhaber', 'fAdresse', 'fKontakt', 'fSteuerNr', 'fUstId', 'fBank', 'fFuss', 'fLogo', 'fLogoRatio'].forEach(k => { keep[k] = S[k]; });
    S = Object.assign(DEFAULTS(), keep); sDirty = true; renderSettings(); renderJobSelects(); renderPositions(); renderResults(); updateState();
  }));
  $('addAnbieter').addEventListener('click', () => { S.anbieter.push({ id: uid(), name: 'Neuer Anbieter', modell: 'meter', breite: 56, staffel: [{ id: uid(), ab: 0, preis: 0 }], versand: 0, vorlauf: 10, schritt: 0.1, minMeter: 1, tinteM2: 0 }); softChanged(); renderAnbieter(); renderJobSelects(); });
  $('addPresse').addEventListener('click', () => { S.pressen.push({ id: uid(), name: 'Neue Presse', preis: 1000, jahre: 5, zins: 5, kw: 2, auslastung: 50, strom: 0.35, wartung: 50, stunden: 400 }); if (!S.presseId) S.presseId = S.pressen[S.pressen.length - 1].id; setChanged(); renderPressen(); renderJobSelects(); });
  $('addFix').addEventListener('click', () => { S.fixkosten.push({ id: uid(), name: 'Neuer Kostenpunkt', betrag: 0 }); softChanged(); renderFixList(); });
  $('addDs').addEventListener('click', () => { S.druckstellen.push({ id: uid(), name: 'Neue Druckstelle', w: 10, h: 10 }); softChanged(); renderDs(); });
  $('addCat').addEventListener('click', () => { S.artikel.push(migrateArtikel({ name: 'Neuer Artikel' })); softChanged(); renderCatalog(); renderPositions(); });
  $('logoFile').addEventListener('change', e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    if (f.size > 600000) { toast('Das Logo ist zu groß (max. 600 KB). Bitte kleiner speichern.', true); return; }
    const rd = new FileReader();
    rd.onload = () => { const img = new Image(); img.onload = () => { S.fLogo = rd.result; S.fLogoRatio = img.naturalHeight / img.naturalWidth; softChanged(); renderSettings(); }; img.src = rd.result; };
    rd.readAsDataURL(f);
  });
  $('logoDel').addEventListener('click', () => { S.fLogo = ''; S.fLogoRatio = 0; softChanged(); renderSettings(); });
  $('backupBtn').addEventListener('click', () => Store.exportAll(S).then(d => saveFile('DTF-Kalkulator_Sicherung_' + todayIso() + '.json', JSON.stringify(d))).then(() => toast('Datensicherung gespeichert')));
  $('restoreFile').addEventListener('change', e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    f.text().then(t => JSON.parse(t)).then(d => {
      if (!d || d.app !== 'dtf-kalkulator') throw new Error();
      const nj = Object.keys(d.jobs || {}).length, nk = Object.keys(d.kunden || {}).length;
      return ask('Die Sicherung vom ' + fmtDate((d.saved || '').slice(0, 10)) + ' enthält ' + nj + ' Aufträge und ' + nk + ' Kunden. Einstellungen werden ersetzt, gleiche Aufträge überschrieben.', { title: 'Sicherung einspielen?', ok: 'Einspielen' }).then(v => {
        if (!v) return;
        S = migrateSettings(d.settings);
        return Promise.all([Store.saveSettings(S), Store.importAll(d)]).then(() => { sDirty = false; renderSettings(); renderJobSelects(); renderAll(); toast('Sicherung eingespielt'); });
      });
    }).catch(() => toast('Das ist keine Datensicherung von diesem Tool.', true));
  });
  const tpl = () => downloadTemplate().catch(e => { if (!(e && e.code === 'declined')) toast('Die Vorlage konnte nicht erstellt werden.', true); });
  $('tplBtn').addEventListener('click', tpl);
  $('tplBtn2').addEventListener('click', tpl);
  $('testBtn').addEventListener('click', showSelfTest);

  // Gang Sheets
  $('sheetFile').addEventListener('change', e => { addSheets(e.target.files); e.target.value = ''; });
  $('gsProject').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) importGangSheetProject(f); });
  const sd = $('sheetDrop');
  sd.addEventListener('dragover', e => { e.preventDefault(); sd.classList.add('over'); });
  sd.addEventListener('dragleave', () => sd.classList.remove('over'));
  sd.addEventListener('drop', e => {
    e.preventDefault(); sd.classList.remove('over');
    const fs = Array.from(e.dataTransfer.files), js = fs.find(f => /\.json$/i.test(f.name));
    if (js) importGangSheetProject(js); else addSheets(fs);
  });

  // Infoblatt
  $('openImport').addEventListener('click', () => { $('impProg').hidden = true; $('impDlg').showModal(); setTimeout(() => $('impText').focus(), 30); });
  $('impGo').addEventListener('click', runImport);
  $('impStop').addEventListener('click', () => { if (impCtl) impCtl.abort(); });
  $('impFile').addEventListener('change', e => setImpFile(e.target.files[0]));
  const drop = $('impDrop');
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files[0]) setImpFile(e.dataTransfer.files[0]); });
  $('impDlg').addEventListener('close', () => { if (impCtl) impCtl.abort(); });
  document.querySelectorAll('dialog [data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
  document.querySelectorAll('dialog.bigdlg').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));

  // Hell/Dunkel
  $('themeBtn').addEventListener('click', () => {
    const root = document.documentElement;
    const cur = root.dataset.theme || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    const nx = cur === 'light' ? 'dark' : 'light';
    root.dataset.theme = nx; try { localStorage.setItem(LS.theme, nx); } catch (e) {}
    if (last && tab === 'folie') drawSheet(last);
  });

  // Tastatur: Strg+S speichert
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (view === 'einst') persistSettings(); else if (view === 'auftrag') persistJob();
    }
  });
  window.addEventListener('beforeunload', e => { if (dirty || sDirty) { e.preventDefault(); e.returnValue = ''; } });
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (last && tab === 'folie' && view === 'auftrag') drawSheet(last); }, 150); });
}

function showSelfTest() {
  const res = runSelfTest(), box = $('testOut'); box.textContent = '';
  const ok = res.filter(r => r.ok).length;
  box.appendChild(h('p', { class: ok === res.length ? 'good' : 'neg', style: 'margin:0 0 8px;font-weight:700', text: ok + ' von ' + res.length + ' Tests bestanden' }));
  res.forEach(r => box.appendChild(h('div', { class: r.ok ? 'ok' : 'bad' }, [(r.ok ? '✓ ' : '✕ ') + r.name, r.info ? h('small', { class: 'mut', style: 'display:block;margin-left:16px', text: r.info }) : null])));
  $('testDlg').showModal();
}

// ======================= Start =======================
(function start() {
  const st = $('j-status');
  Object.keys(STATUS).forEach(k => st.appendChild(h('option', { value: k, text: STATUS[k].l })));
  bindEvents();
  renderSettings();
  renderAll();
  let v0 = null; try { v0 = localStorage.getItem(LS.view); } catch (e) {}
  if (['liste', 'produktion', 'verkauf', 'kunden', 'stats', 'einst'].includes(v0)) showView(v0); else showView('auftrag');
  Store.init({
    onSettings: d => {
      if (!d || sDirty) return;
      S = migrateSettings(d);
      if (!touched && job.id === null) job = exampleJob(S); else normalizeJob(job, S);
      renderSettings(); renderAll();
      if (HOOKS.views[view]) HOOKS.views[view]();
    },
    onJobs: first => {
      if (view === 'liste') renderList();
      if (view === 'stats') renderDash();
      if (view === 'kunden') renderKunden();
      renderCalib();
      if (first && !touched && job.id === null && Store.jobs.length) {
        const latest = Store.jobs.slice().sort((a, b) => (b.data.updatedAt || 0) - (a.data.updatedAt || 0))[0];
        openJob(latest.id); touched = false;
      }
    },
    onKunden: () => { renderJobSelects(); if (view === 'kunden') renderKunden(); },
    onError: t => showMsg(t)
  }).then(() => { if (view === 'einst') renderSettings(); });
  if (/[?&]test\b/.test(location.search)) showSelfTest();
})();
