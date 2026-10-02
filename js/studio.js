// Mockup-Studio (für den Inhaber, nicht für Kunden):
//  - Textil-Positionen des offenen Auftrags wählen, Kleidungsstück, Farbe und angezeigte Größe einstellen
//  - Motive mit Maus/Touch verschieben (Einrasten an der Mittellinie), Pfeiltasten, Maße als Zahlen eingeben
//  - Bemaßung, Lineal, Druckbereiche, Warnungen (checkPlacement), Größenvergleich, Rückgängig (Strg+Z)
//  - Reiter „Eigene Fotos“: Produktfoto hochladen, einmessen (Kragenpunkt + Messlinie), speichern in Store 'textilfotos'
//  - Knopf „Datenblatt (PDF)“ → makeDoc('freigabe')
// Öffentlich: openStudio(posId?, motifId?)
// Zeichnen über mockup.js (mkBuild, mkDrawScene) und garments.js. Präfix: st

const ST = {
  dlg: null, el: {}, open: false, tab: 'place',
  posId: null, selId: null, view: 'front', size: null,
  zoom: 1, panX: 0, panY: 0, dims: true, zones: false, ruler: true, compare: false, lock: true,
  undo: [], redo: [], lastKey: '', lastT: 0, changedAny: false,
  dpr: 1, layout: null, drag: null, raf: 0, snapX: false, fields: null,
  f: null   // Foto, das gerade eingemessen wird
};
const ST_PREFS = 'dtf-studio-prefs';
(function () {
  try { const o = JSON.parse(localStorage.getItem(ST_PREFS) || '{}'); ['dims', 'zones', 'ruler', 'lock'].forEach(k => { if (typeof o[k] === 'boolean') ST[k] = o[k]; }); } catch (e) {}
})();
function stSavePrefs() { try { localStorage.setItem(ST_PREFS, JSON.stringify({ dims: ST.dims, zones: ST.zones, ruler: ST.ruler, lock: ST.lock })); } catch (e) {} }

const stR1 = v => Math.round(v * 10) / 10;
const stClamp = (v, a, b) => Math.max(a, Math.min(b, v));
const stTextils = () => (typeof job !== 'undefined' && job ? job.positionen : []).filter(p => (p.typ || 'textil') === 'textil');
const stPos = () => stTextils().find(p => p.id === ST.posId) || null;
const stFmt = v => N1.format(stR1(v));
// Beschriftung für Knopfgruppen (kein <label>, sonst löst ein Klick auf den Text den ersten Knopf aus)
const stGrp = (text, el) => h('div', { class: 'st-lab' }, [h('span', { text }), el]);

// ======================= Öffnen / Schließen =======================
function openStudio(posId, motifId) {
  stBuild();
  const list = stTextils();
  let p = list.find(x => x.id === posId) || null;
  if (!p) p = list.find(x => x.id === ST.posId) || list.find(x => validMotifs(x).length) || list[0] || null;
  ST.undo = []; ST.redo = []; ST.changedAny = false; stUndoState();
  stTab('place', true);
  stSelectPos(p ? p.id : null, motifId);
  if (!ST.dlg.open) ST.dlg.showModal();
  ST.dlg.scrollTop = 0;
  ST.open = true;
  requestAnimationFrame(() => { stResize(); if (ST.el.cv) ST.el.cv.focus({ preventScroll: true }); });
}

function stSelectPos(id, motifId) {
  ST.posId = id;
  const p = stPos();
  ST.zoom = 1; ST.panX = 0; ST.panY = 0; ST.compare = false;
  if (p && mkHasGar()) {
    const key = mkGarmentKey(p);
    ST.size = mkRefSize(p, key);
    const mots = validMotifs(p);
    const m = mots.find(x => x.id === motifId) || p.motive.find(x => x.id === motifId) || mots[0] || p.motive[0] || null;
    ST.selId = m ? m.id : null;
    ST.view = m ? mkPlace(p, m, key, ST.size).view : 'front';
  } else { ST.selId = null; ST.view = 'front'; }
  stRenderAll();
}

function stRenderAll() {
  stRenderLeft(); stRenderTools(); stRenderRight(); stWarn(); stDraw();
}

function stStatus(t) { if (ST.el.status) { ST.el.status.textContent = t || ''; clearTimeout(ST.el.status._t); if (t) ST.el.status._t = setTimeout(() => { ST.el.status.textContent = ''; }, 5000); } }

// ======================= Aufbau =======================
function stBuild() {
  if (ST.dlg) return ST.dlg;
  const E = ST.el;
  const d = h('dialog', { class: 'st-dlg', 'aria-label': 'Mockup-Studio' });
  ST.dlg = d;
  E.tabs = h('div', { class: 'seg st-tabs' }, [
    h('button', { type: 'button', 'data-tab': 'place', onclick: () => stTab('place') }, ['Platzieren']),
    h('button', { type: 'button', 'data-tab': 'fotos', onclick: () => stTab('fotos') }, ['Eigene Fotos'])
  ]);
  E.undo = h('button', { class: 'ghost mini', type: 'button', title: 'Rückgängig (Strg+Z)', onclick: stUndo }, ['↶ Rückgängig']);
  E.redo = h('button', { class: 'ghost mini', type: 'button', title: 'Wiederholen (Strg+Y)', 'aria-label': 'Wiederholen', onclick: stRedo }, ['↷']);
  E.status = h('span', { class: 'st-status', 'aria-live': 'polite' });
  E.pdf = h('button', { class: 'primary mini', type: 'button', title: 'Druckfreigabe mit Ansichten, Maßen und Druckstellen für den Kunden', onclick: stPdf }, [icon('doc'), 'Datenblatt (PDF)']);
  const head = h('div', { class: 'st-head' }, [
    h('strong', { class: 'st-title' }, [icon('shirt'), 'Mockup-Studio']),
    E.tabs, E.status, h('div', { class: 'st-sp' }), E.undo, E.redo, E.pdf,
    h('button', { class: 'x', type: 'button', 'aria-label': 'Schließen (Esc)', title: 'Schließen (Esc)', onclick: () => d.close() }, ['×'])
  ]);

  // ----- Platzieren -----
  E.left = h('aside', { class: 'st-side st-left' });
  E.right = h('aside', { class: 'st-side st-right' });
  E.tools = h('div', { class: 'st-tools' });
  E.cv = h('canvas', { class: 'st-cv', tabindex: '0', role: 'img', 'aria-label': 'Mockup. Motiv anklicken und ziehen; Pfeiltasten verschieben um 0,5 cm, mit Umschalt um 2 cm.' });
  E.stage = h('div', { class: 'st-stage' }, [E.cv]);
  E.warn = h('div', { class: 'st-warn', 'aria-live': 'polite' });
  E.center = h('section', { class: 'st-center' }, [E.tools, E.stage, E.warn]);
  E.place = h('div', { class: 'st-body st-place' }, [E.left, E.center, E.right]);

  // ----- Eigene Fotos -----
  E.fotos = h('div', { class: 'st-body st-fotos', hidden: true });

  d.appendChild(head); d.appendChild(E.place); d.appendChild(E.fotos);
  document.body.appendChild(d);

  // Ereignisse
  d.addEventListener('close', stOnClose);
  d.addEventListener('keydown', stKey);
  const cv = E.cv;
  cv.addEventListener('pointerdown', stDown);
  cv.addEventListener('pointermove', stMove);
  cv.addEventListener('pointerup', stUp);
  cv.addEventListener('pointercancel', stUp);
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    const k = Math.exp(-(e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY) * 0.0015);
    stZoomAt(ST.zoom * k, stPt(cv, e));
  }, { passive: false });
  cv.addEventListener('dblclick', e => { if (!stHitAt(e)) stFit(); });
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => { if (ST.open) { stResize(); stFotoResize(); } });
    ro.observe(E.stage);
    ST.ro = ro;
  } else window.addEventListener('resize', () => { if (ST.open) { stResize(); stFotoResize(); } });
  if (typeof Store !== 'undefined' && Store.onChange) Store.onChange(name => {
    if (name !== 'textilfotos' || !ST.open) return;
    if (ST.tab === 'fotos') stFotoList(); else { stRenderRight(); stWarn(); stDraw(); }
  });
  return d;
}

function stOnClose() {
  ST.open = false; ST.drag = null;
  if (ST.changedAny && typeof structural === 'function') structural();
  ST.changedAny = false; ST.undo = []; ST.redo = [];
  stUndoState();
}

function stTab(t, quiet) {
  ST.tab = t;
  const E = ST.el;
  E.tabs.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tab === t)));
  E.place.hidden = t !== 'place'; E.fotos.hidden = t !== 'fotos';
  E.undo.hidden = E.redo.hidden = t !== 'place';
  if (t === 'fotos') stFotoRender();
  else if (!quiet) { stRenderAll(); requestAnimationFrame(stResize); }
}

// ======================= Linke Spalte: Positionen =======================
function stRenderLeft() {
  const box = ST.el.left; box.textContent = '';
  box.appendChild(h('h2', { class: 'sec' }, ['Positionen']));
  const list = stTextils();
  if (!list.length) {
    box.appendChild(h('div', { class: 'st-empty' }, [h('strong', { text: 'Keine Textil-Position' }), 'Leg im Auftrag eine Position „Textil + Druck“ an.']));
    return;
  }
  list.forEach((p, i) => {
    const q = wholeQty(p), on = p.id === ST.posId;
    const hex = mkHasGar() ? mkColorOf(p) : '#888';
    const nM = validMotifs(p).length;
    box.appendChild(h('button', { class: 'st-pos', type: 'button', 'aria-current': on ? 'true' : null, onclick: () => { if (p.id !== ST.posId) stSelectPos(p.id); } }, [
      h('span', { class: 'st-sw', style: 'background:' + hex }),
      h('span', { class: 'st-pt' }, [
        h('b', { text: (i + 1) + '. ' + (p.name || 'Textil') }),
        h('small', { text: [p.farbe || 'Farbe offen', q + ' Stk.', mkHasGar() ? mkGarmentName(mkGarmentKey(p)) : ''].filter(Boolean).join(' · ') })
      ]),
      h('span', { class: 'st-badge', title: nM + ' Druckstelle(n) mit Maßen', text: String(nM) })
    ]));
  });
  box.appendChild(h('p', { class: 'st-tip' }, ['Motiv anklicken und ziehen. Pfeiltasten: 0,5 cm, mit Umschalt 2 cm. Mausrad: Zoom, Hintergrund ziehen: verschieben, Doppelklick: einpassen. Strg+Z: rückgängig.']));
}

// ======================= Werkzeugleiste =======================
function stRenderTools() {
  const box = ST.el.tools; box.textContent = '';
  const p = stPos();
  const viewSeg = h('div', { class: 'seg st-viewseg' }, ['front', 'back'].map(v => {
    const cnt = p && mkHasGar() ? stCountView(p, v) : 0;
    return h('button', { type: 'button', 'aria-pressed': String(ST.view === v), onclick: () => { ST.view = v; stRenderTools(); stDraw(); } }, [MK_VIEWS[v] + (cnt ? ' (' + cnt + ')' : '')]);
  }));
  ST.el.zoomTxt = h('button', { class: 'chip st-zoomtxt', type: 'button', title: 'Einpassen', onclick: stFit }, [Math.round(ST.zoom * 100) + ' %']);
  const zoom = h('div', { class: 'st-zoom' }, [
    h('button', { class: 'chip', type: 'button', 'aria-label': 'Verkleinern', title: 'Verkleinern', onclick: () => stZoomAt(ST.zoom / 1.25) }, ['−']),
    ST.el.zoomTxt,
    h('button', { class: 'chip', type: 'button', 'aria-label': 'Vergrößern', title: 'Vergrößern', onclick: () => stZoomAt(ST.zoom * 1.25) }, ['+'])
  ]);
  const tog = (k, label, title) => h('button', { class: 'chip', type: 'button', title, 'aria-pressed': String(!!ST[k]), onclick: () => { ST[k] = !ST[k]; stSavePrefs(); stRenderTools(); stDraw(); } }, [label]);
  const cmpSizes = p && mkHasGar() ? stCompareSizes(p) : [];
  const cmp = h('button', { class: 'chip', type: 'button', 'aria-pressed': String(ST.compare), disabled: cmpSizes.length < 2 ? true : null,
    title: 'Kleinste und größte bestellte Größe nebeneinander im gleichen Maßstab',
    onclick: () => { ST.compare = !ST.compare; ST.zoom = 1; ST.panX = ST.panY = 0; stRenderTools(); stDraw(); } }, ['Größen vergleichen']);
  box.appendChild(viewSeg);
  box.appendChild(zoom);
  box.appendChild(h('div', { class: 'st-togs' }, [
    tog('dims', 'Bemaßung', 'Maßlinien: Kragen bis Motiv-Oberkante, Mittellinie bis Motivmitte, Breite und Höhe'),
    tog('zones', 'Druckbereiche', 'Maximale Druckbereiche gestrichelt anzeigen'),
    tog('ruler', 'Lineal', 'Lineal oben und links in cm (0 = Mittellinie bzw. Kragenpunkt)'),
    cmp
  ]));
}
function stCountView(p, v) {
  const key = mkGarmentKey(p);
  return validMotifs(p).filter(m => mkPlace(p, m, key, ST.size).view === v).length;
}
// Kleinste und größte bestellte Größe (sonst kleinste/größte des Kleidungsstücks)
function stCompareSizes(p) {
  const key = mkGarmentKey(p), avail = mkGarSizes(key);
  const ord = mkSizesInOrder(p).filter(s => avail.includes(s));
  if (ord.length >= 2) return [ord[0], ord[ord.length - 1]];
  if (avail.length >= 2) return [avail[0], avail[avail.length - 1]];
  return avail.slice(0, 1);
}

// ======================= Rechte Spalte: Eigenschaften =======================
function stRenderRight() {
  const box = ST.el.right; box.textContent = '';
  ST.fields = null;
  const p = stPos();
  if (!p) { box.appendChild(h('p', { class: 'mut', text: 'Wähle links eine Position.' })); return; }
  if (!mkHasGar()) { box.appendChild(h('p', { class: 'mut', text: 'Die Kleidungs-Bibliothek (garments.js) fehlt.' })); return; }
  const key = mkGarmentKey(p), G = GARMENTS[key];

  // ----- Kleidungsstück -----
  let autoKey = '';
  try { const q = Object.assign({}, p); delete q.modell; autoKey = garmentForPosition(q, S); } catch (e) {}
  const gsel = h('select', { 'aria-label': 'Kleidungsstück', onchange: e => {
    stPush('modell');
    if (e.target.value) p.modell = e.target.value; else delete p.modell;
    const k = mkGarmentKey(p);
    if (!(GARMENTS[k].sizes || {})[ST.size]) ST.size = mkRefSize(p, k);
    stCommit(); stRenderAll();
  } });
  gsel.appendChild(h('option', { value: '', text: 'Automatisch' + (GARMENTS[autoKey] ? ' (' + GARMENTS[autoKey].name + ')' : '') }));
  const cats = {};
  Object.keys(GARMENTS).forEach(k => { const c = GARMENTS[k].kategorie || 'Sonstige'; (cats[c] = cats[c] || []).push(k); });
  Object.keys(cats).forEach(c => {
    const og = h('optgroup', { label: c });
    cats[c].forEach(k => og.appendChild(h('option', { value: k, text: GARMENTS[k].name })));
    gsel.appendChild(og);
  });
  gsel.value = p.modell && GARMENTS[p.modell] ? p.modell : '';

  const sizes = mkGarSizes(key), ordered = mkSizesInOrder(p);
  const ssel = h('select', { 'aria-label': 'Angezeigte Größe', onchange: e => { ST.size = e.target.value; stRenderRight(); stWarn(); stDraw(); } },
    sizes.map(s => h('option', { value: s, text: mkSizeLabel(s) + (n(p.groessen && p.groessen[s]) > 0 && !p.ohneGroessen ? ' · ' + n(p.groessen[s]) + ' bestellt' : '') })));
  if (!sizes.includes(ST.size)) ST.size = mkRefSize(p, key);
  ssel.value = ST.size;
  const dimsOf = (G.sizes || {})[ST.size];
  const ref = mkRefSize(p, key);
  const refRow = h('div', { class: 'st-note' }, [
    dimsOf ? 'Brustbreite ' + stFmt(n(dimsOf.w)) + ' cm · Länge ' + stFmt(n(dimsOf.l)) + ' cm. ' : '',
    'Maße beziehen sich auf ', h('b', { text: ref === 'one' ? 'die Einheitsgröße' : 'Größe ' + ref }), '.',
    ST.size !== ref ? h('button', { class: 'link', type: 'button', style: 'margin-left:6px', onclick: () => { stPush('ref'); p.refGroesse = ST.size; stCommit(); stRenderRight(); } }, ['Größe ' + ST.size + ' als Bezug']) : null
  ]);

  // Eigene Fotos je Ansicht
  const fotos = typeof Store !== 'undefined' ? Store.list('textilfotos') : [];
  const fotoSel = v => {
    const sel = h('select', { 'aria-label': 'Ansicht ' + MK_VIEWS[v], onchange: e => {
      stPush('foto');
      const ids = Object.assign({}, p.fotoIds || {});
      if (e.target.value) ids[v] = e.target.value; else delete ids[v];
      if (Object.keys(ids).length) p.fotoIds = ids; else delete p.fotoIds;
      if (v === 'front' && p.fotoId) delete p.fotoId;
      stCommit(); stRenderTools(); stRenderRight();
    } }, [h('option', { value: '', text: 'Zeichnung (Bibliothek)' })]);
    fotos.filter(f => (f.data.view || 'front') === v).forEach(f => sel.appendChild(h('option', { value: f.id, text: (f.data.name || 'Foto') + (GARMENTS[f.data.garmentKey] ? ' · ' + GARMENTS[f.data.garmentKey].name : '') })));
    const cur = (p.fotoIds && p.fotoIds[v]) || (v === 'front' && p.fotoId) || '';
    sel.value = fotos.some(f => f.id === cur) ? cur : '';
    return lbl(MK_VIEWS[v], sel);
  };

  box.appendChild(h('div', { class: 'st-sec' }, [
    h('h2', { class: 'sec' }, ['Kleidungsstück']),
    lbl('Modell', gsel),
    lbl('Angezeigte Größe', ssel),
    refRow,
    fotos.length ? h('details', { class: 'st-fotosel', open: (p.fotoIds && Object.keys(p.fotoIds).length) ? true : null }, [
      h('summary', { text: 'Eigenes Foto statt Zeichnung' }),
      h('div', { class: 'grid' }, [fotoSel('front'), fotoSel('back')])
    ]) : h('p', { class: 'st-note' }, ['Eigene Produktfotos kannst du im Reiter ', h('button', { class: 'link', type: 'button', onclick: () => stTab('fotos') }, ['Eigene Fotos']), ' einmessen.'])
  ]));

  // ----- Farbe -----
  const cur = mkColorOf(p);
  const sw = h('div', { class: 'st-swatches' });
  const colorIn = h('input', { type: 'color', class: 'st-color', value: cur, 'aria-label': 'Eigene Farbe', title: 'Eigene Farbe wählen',
    oninput: e => { stPush('colorpick'); p.farbeHex = e.target.value; stTouch(); stDraw(); stMarkSw(sw, p); stRenderLeftSoon(); } });
  (typeof GARMENT_COLORS !== 'undefined' ? GARMENT_COLORS : []).forEach(c => {
    sw.appendChild(h('button', { type: 'button', class: 'st-swb', 'data-hex': c.hex.toLowerCase(), title: c.name, 'aria-label': c.name, style: 'background:' + c.hex,
      onclick: () => {
        stPush('color');
        p.farbeHex = c.hex.toLowerCase();
        if (!String(p.farbe || '').trim()) { p.farbe = c.name; farbeIn.value = c.name; }
        colorIn.value = p.farbeHex; stTouch(); changed(); stDraw(); stMarkSw(sw, p); stRenderLeftSoon(); resetLink.hidden = false;
      } }));
  });
  const farbeIn = h('input', { value: p.farbe || '', maxlength: '40', placeholder: 'z. B. Schwarz', 'aria-label': 'Farbname',
    oninput: e => { stPush('farbe'); p.farbe = e.target.value; stTouch(); changed(); if (!p.farbeHex) { colorIn.value = mkColorOf(p); stMarkSw(sw, p); } stDraw(); stRenderLeftSoon(); } });
  const resetLink = h('button', { class: 'link', type: 'button', hidden: p.farbeHex ? null : true, title: 'Farbe wieder aus dem Farbnamen ableiten',
    onclick: () => { stPush('color'); delete p.farbeHex; colorIn.value = mkColorOf(p); resetLink.hidden = true; stTouch(); stDraw(); stMarkSw(sw, p); stRenderLeftSoon(); } }, ['Farbe aus dem Namen']);
  stMarkSw(sw, p);
  box.appendChild(h('div', { class: 'st-sec' }, [
    h('h2', { class: 'sec' }, ['Farbe']),
    sw,
    h('div', { class: 'st-colorrow' }, [colorIn, lbl('Farbname (für Angebot und Datenblatt)', farbeIn)]),
    resetLink
  ]));

  // ----- Druckstellen -----
  const sec = h('div', { class: 'st-sec' }, [h('h2', { class: 'sec' }, ['Druckstellen', h('span', { class: 'right mut', text: 'Maße in cm' })])]);
  if (!p.motive.length) sec.appendChild(h('p', { class: 'mut', text: 'Keine Druckstellen. Leg sie im Auftrag an.' }));
  let nr = 0;
  p.motive.forEach(m => {
    const valid = n(m.w) > 0 && n(m.h) > 0;
    if (valid) nr++;
    sec.appendChild(stMotifCard(p, m, key, valid ? nr : null));
  });
  if (validMotifs(p).some(m => mkNum(m.x) || mkNum(m.y) || m.view)) {
    sec.appendChild(h('button', { class: 'link', type: 'button', style: 'margin-top:8px', onclick: () => {
      stPush('alle');
      p.motive.forEach(m => { delete m.x; delete m.y; delete m.view; });
      stCommit(); stRenderAll();
    } }, ['Alle Druckstellen auf Standardposition']));
  }
  box.appendChild(sec);
}
let stLeftT = 0;
function stRenderLeftSoon() { clearTimeout(stLeftT); stLeftT = setTimeout(stRenderLeft, 120); }
function stMarkSw(sw, p) {
  const hex = mkColorOf(p);
  sw.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.hex === hex)));
}

// Seitenangabe → Vorzeichen von x (Vorderansicht: links vom Träger = rechts im Bild)
function stSign(view, side) {
  if (side === 'mitte') return 0;
  return (view === 'back') === (side === 'rechts') ? 1 : -1;
}
// Platzierung festschreiben (x, y, view), damit Änderungen gespeichert werden
function stMat(p, m) {
  const pl = mkPlace(p, m, mkGarmentKey(p), ST.size);
  m.x = stR1(pl.x); m.y = stR1(pl.y); m.view = pl.view;
  p.refGroesse = ST.size;
  return pl;
}
function stRatio(m) {
  if (n(m.imgRatio) > 0) return n(m.imgRatio);
  const im = mkImg(m.img);
  return im && im.naturalWidth ? im.naturalHeight / im.naturalWidth : 0;
}

function stMotifCard(p, m, key, nr) {
  const sel = m.id === ST.selId, valid = nr !== null;
  const pl = valid ? mkPlace(p, m, key, ST.size) : null;
  const head = h('button', { class: 'st-mh', type: 'button', 'aria-expanded': String(sel), onclick: () => {
    ST.selId = m.id;
    if (pl) ST.view = pl.view;
    stRenderTools(); stRenderRight(); stDraw();
  } }, [
    h('span', { class: 'st-nr', text: valid ? String(nr) : '–' }),
    h('span', { class: 'st-mt' }, [
      h('b', { text: m.name || 'Motiv' }),
      h('small', { text: valid ? (ORTE[m.ort] || 'Sonstige') + ' · ' + MK_VIEWS[pl.view] + ' · ' + stFmt(n(m.w)) + ' × ' + stFmt(n(m.h)) : 'Breite und Höhe fehlen' })
    ]),
    m.img ? h('img', { class: 'st-mimg', src: m.img, alt: '' }) : null
  ]);
  const card = h('div', { class: 'st-card' + (sel ? ' on' : '') }, [head]);
  if (!sel) return card;

  const F = ST.fields = { m };
  const ratio = stRatio(m);
  const hasImg = !!m.img && ratio > 0;
  // Name
  const nameIn = h('input', { value: m.name || '', maxlength: '60', 'aria-label': 'Bezeichnung',
    oninput: e => { stPush('name' + m.id); m.name = e.target.value; head.querySelector('b').textContent = m.name || 'Motiv'; stTouch(); changed(); stDraw(); } });
  // Breite / Höhe
  F.w = h('input', { type: 'number', step: '0.5', min: '0', value: n(m.w) || '', 'aria-label': 'Breite cm',
    oninput: e => { stPush('w' + m.id); m.w = n(e.target.value); if (ST.lock && hasImg && m.w > 0) { m.h = stR1(m.w * ratio); F.h.value = m.h; } stCommit(); stHeadTxt(); } });
  F.h = h('input', { type: 'number', step: '0.5', min: '0', value: n(m.h) || '', 'aria-label': 'Höhe cm',
    oninput: e => { stPush('h' + m.id); m.h = n(e.target.value); if (ST.lock && hasImg && m.h > 0) { m.w = stR1(m.h / ratio); F.w.value = m.w; } stCommit(); stHeadTxt(); } });
  const lockBtn = hasImg ? h('button', { class: 'chip st-lock', type: 'button', 'aria-pressed': String(ST.lock), title: 'Seitenverhältnis des Bildes beibehalten',
    onclick: e => { ST.lock = !ST.lock; stSavePrefs(); e.currentTarget.setAttribute('aria-pressed', String(ST.lock)); if (ST.lock && n(m.w) > 0) { stPush('h' + m.id); m.h = stR1(n(m.w) * ratio); F.h.value = m.h; stCommit(); stHeadTxt(); } } }, ['⛓ Verhältnis']) : null;
  function stHeadTxt() { const s = head.querySelector('small'); if (s && n(m.w) > 0 && n(m.h) > 0) { const q = mkPlace(p, m, key, ST.size); s.textContent = (ORTE[m.ort] || 'Sonstige') + ' · ' + MK_VIEWS[q.view] + ' · ' + stFmt(n(m.w)) + ' × ' + stFmt(n(m.h)); } }

  // Ansicht
  const viewSeg = h('div', { class: 'seg' }, ['front', 'back'].map(v => h('button', { type: 'button', 'aria-pressed': String(pl && pl.view === v),
    onclick: () => { stPush('view' + m.id); stMat(p, m); m.view = v; ST.view = v; stCommit(); stRenderTools(); stRenderRight(); } }, [MK_VIEWS[v]])));
  // Ort
  const ortSel = h('select', { 'aria-label': 'Ort', onchange: e => { stPush('ort' + m.id); m.ort = e.target.value; stDefault(p, m); stCommit(); stRenderTools(); stRenderRight(); } },
    Object.keys(ORTE).map(k => h('option', { value: k, text: ORTE[k] })));
  ortSel.value = ORTE[m.ort] ? m.ort : 'sonst';
  // Abstände
  F.y = h('input', { type: 'number', step: '0.5', value: pl ? stR1(pl.y) : '', 'aria-label': 'Abstand zum Kragen cm',
    oninput: e => { if (e.target.value === '') return; stPush('y' + m.id); stMat(p, m); m.y = stR1(n(e.target.value)); stCommit(); } });
  F.x = h('input', { type: 'number', step: '0.5', min: '0', value: pl ? stR1(Math.abs(pl.x)) : '', 'aria-label': 'Abstand zur Mitte cm',
    oninput: e => {
      if (e.target.value === '') return;
      stPush('x' + m.id); const q = stMat(p, m);
      let side = mkSide(q.view, q.x) || F.lastSide || 'links';
      const v = Math.abs(n(e.target.value));
      m.x = v < 0.05 ? 0 : stSign(q.view, side) * stR1(v);
      if (v >= 0.05) F.lastSide = side;
      stCommit(); stSyncSide();
    } });
  F.side = h('div', { class: 'seg st-side3' }, [['links', 'links'], ['mitte', 'Mitte'], ['rechts', 'rechts']].map(([k, l]) => h('button', { type: 'button', 'data-side': k,
    onclick: () => {
      stPush('side' + m.id); const q = stMat(p, m);
      let v = Math.abs(q.x);
      if (k === 'mitte') m.x = 0;
      else { if (v < 0.05) v = 10; m.x = stSign(q.view, k) * stR1(v); F.lastSide = k; }
      stCommit(); stSyncFields();
    } }, [l])));
  function stSyncSide() { const q = mkPlace(p, m, key, ST.size); const s = mkSide(q.view, q.x) || 'mitte'; F.side.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.side === s))); }
  F.syncSide = stSyncSide;
  stSyncSide();

  // Bild
  const file = h('input', { type: 'file', class: 'sr', accept: 'image/png,image/jpeg,image/webp', tabindex: '-1', 'aria-hidden': 'true',
    onchange: e => {
      const f = e.target.files && e.target.files[0]; e.target.value = '';
      if (!f) return;
      stPush('img' + m.id);
      mkSetImage(p, m, f, () => { mkLoad(m.img).then(() => { stTouch(); changed(); stRenderAll(); }); });
    } });
  const pers = h('input', { type: 'checkbox', checked: m.pers, onchange: e => { stPush('pers' + m.id); m.pers = e.target.checked; stCommit(); } });

  card.appendChild(h('div', { class: 'st-mb' }, [
    lbl('Bezeichnung', nameIn),
    h('div', { class: 'st-row2' }, [stGrp('Ansicht', viewSeg), lbl('Ort', ortSel)]),
    h('div', { class: 'st-row2 st-wh' }, [lbl('Breite', F.w), lbl('Höhe', F.h)]),
    lockBtn,
    h('div', { class: 'st-row2' }, [lbl('Abstand zum Kragen', F.y), lbl('Abstand zur Mitte', F.x)]),
    stGrp('Seite (vom Träger aus gesehen)', F.side),
    h('div', { class: 'st-btns' }, [
      h('button', { class: 'ghost mini', type: 'button', title: 'Motiv auf die Mittellinie setzen', onclick: () => { stPush('mid' + m.id); stMat(p, m); m.x = 0; stCommit(); stSyncFields(); } }, ['Mittig']),
      h('button', { class: 'ghost mini', type: 'button', title: 'Standardposition für den gewählten Ort', onclick: () => { stPush('def' + m.id); stDefault(p, m); stCommit(); stRenderTools(); stRenderRight(); } }, ['Standardposition']),
      h('button', { class: 'ghost mini', type: 'button', onclick: () => file.click() }, [icon('upload'), m.img ? 'Bild ersetzen' : 'Bild hochladen']),
      file,
      m.img ? h('button', { class: 'link', type: 'button', onclick: () => { stPush('img' + m.id); delete m.img; delete m.imgRatio; stCommit(); stRenderRight(); } }, ['Bild entfernen']) : null
    ]),
    h('label', { class: 'check' }, [pers, h('span', null, ['Individuell', h('small', { text: 'Namen oder Nummern, auf jedem Teil anders' })])]),
    valid ? null : h('p', { class: 'st-note warn', text: 'Ohne Breite und Höhe erscheint die Druckstelle nicht im Mockup.' })
  ]));
  return card;
}
// Standardplatzierung für den Ort (bei der angezeigten Größe)
function stDefault(p, m) {
  const key = mkGarmentKey(p);
  let d = null;
  try { d = defaultPlacement(key, m.ort, ST.size, n(m.w), n(m.h)); } catch (e) { console.error(e); }
  if (!d) { delete m.x; delete m.y; delete m.view; return; }
  m.x = stR1(n(d.x)); m.y = stR1(n(d.y)); m.view = d.view === 'back' ? 'back' : 'front';
  p.refGroesse = ST.size;
  ST.view = m.view;
}
// Felder nach dem Ziehen / Pfeiltasten aktualisieren (ohne neu zu bauen)
function stSyncFields() {
  const F = ST.fields, p = stPos();
  if (!F || !p) return;
  const q = mkPlace(p, F.m, mkGarmentKey(p), ST.size);
  if (document.activeElement !== F.y) F.y.value = stR1(q.y);
  if (document.activeElement !== F.x) F.x.value = stR1(Math.abs(q.x));
  if (F.syncSide) F.syncSide();
}

// ======================= Änderungen, Rückgängig =======================
function stTouch() { ST.changedAny = true; markDirty(); }
function stCommit() { stTouch(); changed(); stWarn(); stDraw(); }
function stSnapshot(p) {
  return {
    posId: p.id, modell: p.modell, farbeHex: p.farbeHex, farbe: p.farbe, refGroesse: p.refGroesse, fotoId: p.fotoId,
    fotoIds: p.fotoIds ? Object.assign({}, p.fotoIds) : undefined,
    motive: p.motive.map(m => Object.assign({}, m)), view: ST.view, selId: ST.selId
  };
}
function stRestore(sn) {
  const p = stTextils().find(x => x.id === sn.posId);
  if (!p) return false;
  ['modell', 'farbeHex', 'farbe', 'refGroesse', 'fotoId', 'fotoIds'].forEach(k => {
    if (sn[k] === undefined) delete p[k]; else p[k] = k === 'fotoIds' ? Object.assign({}, sn[k]) : sn[k];
  });
  // Objekte behalten (die Auftragsansicht hält Verweise darauf)
  const byId = new Map(p.motive.map(m => [m.id, m]));
  p.motive = sn.motive.map(s => { const m = byId.get(s.id) || {}; Object.keys(m).forEach(k => { if (!(k in s)) delete m[k]; }); return Object.assign(m, s); });
  if (p.id !== ST.posId) { ST.posId = p.id; ST.size = mkRefSize(p, mkGarmentKey(p)); }
  ST.view = sn.view || ST.view; ST.selId = sn.selId || ST.selId;
  return true;
}
// Vor einer Änderung aufrufen. Gleiche key-Werte kurz hintereinander werden zusammengefasst (Tippen).
function stPush(key, snap) {
  const p = stPos(); if (!p) return;
  const now = Date.now();
  if (!snap && key && key === ST.lastKey && now - ST.lastT < 900) { ST.lastT = now; return; }
  ST.lastKey = key || ''; ST.lastT = now;
  ST.undo.push(snap || stSnapshot(p));
  if (ST.undo.length > 80) ST.undo.shift();
  ST.redo = [];
  stUndoState();
}
function stUndo() {
  const sn = ST.undo.pop(); if (!sn) { stStatus('Nichts rückgängig zu machen.'); return; }
  const p = stTextils().find(x => x.id === sn.posId);
  if (p) ST.redo.push(stSnapshot(p));
  stRestore(sn); ST.lastKey = '';
  stTouch(); changed(); stRenderAll(); stUndoState();
}
function stRedo() {
  const sn = ST.redo.pop(); if (!sn) return;
  const p = stTextils().find(x => x.id === sn.posId);
  if (p) ST.undo.push(stSnapshot(p));
  stRestore(sn); ST.lastKey = '';
  stTouch(); changed(); stRenderAll(); stUndoState();
}
function stUndoState() { if (ST.el.undo) { ST.el.undo.disabled = !ST.undo.length; ST.el.redo.disabled = !ST.redo.length; } }

// ======================= Warnungen =======================
function stNormWarn(w) {
  if (!w) return null;
  if (typeof w === 'string') return { lvl: /größer als|ragt über|passt dort nicht|passt nicht|kann nicht|im Weg|außerhalb/i.test(w) ? 'err' : 'warn', text: w };
  const t = w.text || w.msg || w.message || w.t || '';
  if (!t) return null;
  const l = String(w.level || w.lvl || w.type || w.sev || w.severity || '').toLowerCase();
  return { lvl: /err|rot|red|high|danger|fehler|bad/.test(l) ? 'err' : /info|ok|hint/.test(l) ? 'info' : 'warn', text: t };
}
function stWarnings(p) {
  const out = [];
  const key = mkGarmentKey(p), size = ST.size || mkRefSize(p, key);
  const sizes = mkSizesInOrder(p).filter(s => (GARMENTS[key].sizes || {})[s]);
  p.motive.forEach(m => { if (!(n(m.w) > 0 && n(m.h) > 0)) out.push({ lvl: 'warn', text: '„' + (m.name || 'Motiv') + '“: Breite und Höhe fehlen – erscheint nicht im Mockup.' }); });
  const placed = validMotifs(p).map((m, i) => ({ m, nr: i + 1, pl: mkPlace(p, m, key, size) }));
  placed.forEach(o => {
    const pre = 'Nr. ' + o.nr + ' (' + (o.m.name || 'Motiv') + '): ';
    const rec = mkPhotoRec(p, o.pl.view);
    if (rec) {
      // Eigenes Foto: nur prüfen, ob das Motiv im Bild liegt
      const im = mkImg(rec.img), k = n(rec.pxPerCm);
      if (im && k > 0) {
        const x0 = -n(rec.cx) / k, y0 = -n(rec.cy) / k, x1 = x0 + im.naturalWidth / k, y1 = y0 + im.naturalHeight / k;
        const w = n(o.m.w), hh = n(o.m.h);
        if (o.pl.x - w / 2 < x0 || o.pl.x + w / 2 > x1 || o.pl.y < y0 || o.pl.y + hh > y1) out.push({ lvl: 'err', text: pre + 'ragt über das Foto hinaus.' });
      }
      return;
    }
    let res = [];
    try { res = checkPlacement(key, o.pl.view, size, mkPrintObj({ m: o.m, pl: o.pl, img: null }), sizes.length ? sizes : undefined) || []; } catch (e) { console.error(e); }
    (Array.isArray(res) ? res : [res]).forEach(r => { const w = stNormWarn(r); if (w) out.push({ lvl: w.lvl, text: pre + w.text }); });
  });
  // Überlappungen auf derselben Seite
  for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
    const a = placed[i], b = placed[j];
    if (a.pl.view !== b.pl.view) continue;
    const ax0 = a.pl.x - n(a.m.w) / 2, ax1 = a.pl.x + n(a.m.w) / 2, bx0 = b.pl.x - n(b.m.w) / 2, bx1 = b.pl.x + n(b.m.w) / 2;
    const ay0 = a.pl.y, ay1 = a.pl.y + n(a.m.h), by0 = b.pl.y, by1 = b.pl.y + n(b.m.h);
    if (ax0 < bx1 - 0.05 && bx0 < ax1 - 0.05 && ay0 < by1 - 0.05 && by0 < ay1 - 0.05) out.push({ lvl: 'warn', text: 'Nr. ' + a.nr + ' und Nr. ' + b.nr + ' überlappen sich.' });
  }
  // doppelte Texte entfernen
  const seen = new Set();
  return out.filter(w => { if (seen.has(w.text)) return false; seen.add(w.text); return true; });
}
function stWarn() {
  const box = ST.el.warn; if (!box) return;
  box.textContent = '';
  const p = stPos();
  if (!p || !mkHasGar()) return;
  const list = stWarnings(p);
  if (!validMotifs(p).length) { box.appendChild(h('div', { class: 'st-w info' }, [icon('info'), h('span', { text: 'Noch keine Druckstelle mit Maßen.' })])); return; }
  if (!list.length) {
    const nS = mkSizesInOrder(p).length;
    const photo = mkPhotoRec(p, 'front') || mkPhotoRec(p, 'back');
    box.appendChild(h('div', { class: 'st-w ok' }, [icon('check'), h('span', { text: photo
      ? 'Alle Druckstellen liegen im Bild. Bei eigenen Fotos werden Druckbereiche und Größen nur auf der Zeichnungs-Seite geprüft.'
      : 'Alle Druckstellen liegen im Druckbereich' + (nS > 1 ? ' – geprüft für alle ' + nS + ' bestellten Größen.' : '.') })]));
    return;
  }
  list.sort((a, b) => (a.lvl === 'err' ? 0 : 1) - (b.lvl === 'err' ? 0 : 1)).forEach(w =>
    box.appendChild(h('div', { class: 'st-w ' + w.lvl }, [icon(w.lvl === 'err' ? 'alert' : 'info'), h('span', { text: w.text })])));
}

// ======================= Zeichnen =======================
function stResize() {
  const E = ST.el; if (!E.stage || ST.tab !== 'place') return;
  const r = E.stage.getBoundingClientRect();
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const w = Math.max(50, Math.floor(r.width)), hh = Math.max(50, Math.floor(r.height));
  ST.dpr = dpr;
  if (E.cv.width !== Math.round(w * dpr) || E.cv.height !== Math.round(hh * dpr)) {
    E.cv.width = Math.round(w * dpr); E.cv.height = Math.round(hh * dpr);
    E.cv.style.width = w + 'px'; E.cv.style.height = hh + 'px';
  }
  stPaint();
}
function stDraw() { if (!ST.raf) ST.raf = requestAnimationFrame(stPaint); }

// Ausschnitt berechnen. Gibt {items:[{sc, ox, oy, s, size}], cx, cy, rul, compare} zurück (Gerätepixel)
function stLayout(p) {
  const W = ST.el.cv.width, H = ST.el.cv.height, dpr = ST.dpr;
  const pad = 22 * dpr;
  if (ST.compare) {
    const sizes = stCompareSizes(p);
    const scs = sizes.map(sz => mkBuild(p, ST.view, { size: sz }));
    const boxes = scs.map(sc => mkSceneBox(sc, true));
    const gap = 10;
    const totalW = boxes.reduce((a, b) => a + b.w, 0) + gap * (boxes.length - 1);
    const y0 = Math.min.apply(null, boxes.map(b => b.y)) - (ST.dims ? 3 : 1), y1 = Math.max.apply(null, boxes.map(b => b.y + b.h)) + (ST.dims ? 4 : 1);
    const labelH = 30 * dpr;
    const aw = W - 2 * pad, ah = H - 2 * pad - labelH;
    const base = Math.min(aw / totalW, ah / (y1 - y0));
    const s = base * ST.zoom;
    const cx = W / 2, cy = pad + labelH + ah / 2;
    let x = cx - s * totalW / 2 + ST.panX * dpr;
    const oy = cy - s * (y0 + (y1 - y0) / 2) + ST.panY * dpr;
    const items = scs.map((sc, i) => { const b = boxes[i]; const ox = x - s * b.x; x += s * (b.w + gap); return { sc, ox, oy, s, size: sizes[i], box: b }; });
    return { compare: true, items, cx, cy, rul: 0, s };
  }
  const sc = mkBuild(p, ST.view, { size: ST.size });
  const b = mkSceneBox(sc, true), mg = ST.dims ? 4 : 1.5;
  const rul = ST.ruler ? 22 * dpr : 0;
  const aw = W - rul - 2 * pad, ah = H - rul - 2 * pad;
  const base = Math.min(aw / (b.w + 2 * mg), ah / (b.h + 2 * mg));
  const s = base * ST.zoom;
  const cx = rul + pad + aw / 2, cy = rul + pad + ah / 2;
  const ox = cx - s * (b.x + b.w / 2) + ST.panX * dpr, oy = cy - s * (b.y + b.h / 2) + ST.panY * dpr;
  return { compare: false, items: [{ sc, ox, oy, s, size: ST.size, box: b }], cx, cy, rul, s };
}

function stPaint() {
  ST.raf = 0;
  const cv = ST.el.cv; if (!cv || !ST.open || ST.tab !== 'place') return;
  const ctx = cv.getContext('2d'), W = cv.width, H = cv.height, dpr = ST.dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const g = ctx.createRadialGradient(W / 2, H * 0.35, 10, W / 2, H / 2, Math.max(W, H) * 0.75);
  g.addColorStop(0, '#f7f8fa'); g.addColorStop(1, '#dde1e7');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const p = stPos();
  const msg = t => { ctx.fillStyle = '#5d6878'; ctx.font = '600 ' + (14 * dpr) + 'px ' + MK_FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, W / 2, H / 2); };
  if (!mkHasGar()) { ST.layout = null; msg('Die Kleidungs-Bibliothek (garments.js) ist nicht geladen.'); return; }
  if (!p) { ST.layout = null; msg('Keine Textil-Position im Auftrag.'); return; }
  const L = ST.layout = stLayout(p);
  const missing = [];
  L.items.forEach(it => {
    if (ST.snapX && ST.drag && !L.compare) {   // Einrasten an der Mittellinie sichtbar machen
      ctx.save(); ctx.strokeStyle = '#ec008c'; ctx.lineWidth = 1.5 * dpr; ctx.setLineDash([6 * dpr, 4 * dpr]);
      ctx.beginPath(); ctx.moveTo(it.ox, 0); ctx.lineTo(it.ox, H); ctx.stroke(); ctx.restore();
    }
    mkDrawScene(ctx, it.sc, { scale: it.s, ox: it.ox, oy: it.oy, u: dpr, font: 11.5 * dpr, dims: ST.dims, zones: ST.zones, numbers: true, sel: L.compare ? null : ST.selId, labels: true });
    it.sc.missing.forEach(src => missing.push(src));
    if (L.compare) {
      const G = GARMENTS[it.sc.key], d = (G.sizes || {})[it.size];
      const ordered = mkSizesInOrder(p).includes(it.size);
      ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      const xm = it.ox + it.s * (it.box.x + it.box.w / 2);
      ctx.fillStyle = '#111827'; ctx.font = '700 ' + (14 * dpr) + 'px ' + MK_FONT;
      ctx.fillText('Größe ' + mkSizeLabel(it.size) + (ordered ? '' : ' (nicht bestellt)'), xm, 10 * dpr);
      if (d) { ctx.fillStyle = '#5d6878'; ctx.font = '500 ' + (11.5 * dpr) + 'px ' + MK_FONT; ctx.fillText('Brust ' + stFmt(n(d.w)) + ' cm · Länge ' + stFmt(n(d.l)) + ' cm', xm, 27 * dpr); }
      ctx.restore();
    }
  });
  if (L.compare && L.items.length > 1) {
    // Gleicher Abstand zum Kragen: Hilfslinien über beide Größen
    const it0 = L.items[0], itN = L.items[L.items.length - 1];
    const x0 = it0.ox + it0.s * it0.box.x, x1 = itN.ox + itN.s * (itN.box.x + itN.box.w);
    const ys = [0].concat(it0.sc.motifs.map(o => o.pl.y));
    ctx.save(); ctx.strokeStyle = 'rgba(236,0,140,.55)'; ctx.lineWidth = 1 * dpr; ctx.setLineDash([4 * dpr, 4 * dpr]);
    ys.forEach(y => { const yy = it0.oy + y * it0.s; ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x1, yy); ctx.stroke(); });
    ctx.restore();
  }
  if (!L.compare && ST.ruler) stRulers(ctx, L.items[0], L.rul, p);
  if (missing.length) Promise.all(missing.map(mkLoad)).then(() => { stDraw(); stWarn(); });
}

// Lineal oben (0 = Mittellinie) und links (0 = Kragenpunkt), in cm
function stRulers(ctx, it, rul, p) {
  const W = ST.el.cv.width, H = ST.el.cv.height, dpr = ST.dpr, s = it.s;
  ctx.save();
  ctx.fillStyle = 'rgba(17,21,27,.92)';
  ctx.fillRect(0, 0, W, rul); ctx.fillRect(0, 0, rul, H);
  // Auswahl auf dem Lineal markieren
  const mo = it.sc.motifs.find(o => o.m.id === ST.selId);
  if (mo) {
    ctx.fillStyle = 'rgba(47,140,255,.35)';
    ctx.fillRect(it.ox + (mo.pl.x - n(mo.m.w) / 2) * s, 0, n(mo.m.w) * s, rul);
    ctx.fillRect(0, it.oy + mo.pl.y * s, rul, n(mo.m.h) * s);
  }
  // Schrittweite
  const steps = [1, 2, 5, 10, 20, 50];
  let major = steps.find(st => st * s >= 46 * dpr) || 50;
  const minor = major >= 10 ? major / 5 : major >= 5 ? 1 : major / 2;
  ctx.strokeStyle = '#5b6577'; ctx.fillStyle = '#aeb7c6'; ctx.lineWidth = 1;
  ctx.font = '500 ' + (9.5 * dpr) + 'px ' + MK_FONT;
  // oben
  const xa = Math.floor(((rul - it.ox) / s) / minor) * minor, xb = (W - it.ox) / s;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  for (let v = xa; v <= xb; v += minor) {
    const X = Math.round(it.ox + v * s) + 0.5; if (X < rul) continue;
    const isM = Math.abs(v / major - Math.round(v / major)) < 1e-6;
    ctx.beginPath(); ctx.moveTo(X, rul); ctx.lineTo(X, rul - (isM ? rul * 0.55 : rul * 0.25)); ctx.stroke();
    if (isM) ctx.fillText(String(Math.round(Math.abs(v))), X + 2 * dpr, 2 * dpr);
  }
  // links
  const ya = Math.floor(((rul - it.oy) / s) / minor) * minor, yb = (H - it.oy) / s;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  for (let v = ya; v <= yb; v += minor) {
    const Y = Math.round(it.oy + v * s) + 0.5; if (Y < rul) continue;
    const isM = Math.abs(v / major - Math.round(v / major)) < 1e-6;
    ctx.beginPath(); ctx.moveTo(rul, Y); ctx.lineTo(rul - (isM ? rul * 0.55 : rul * 0.25), Y); ctx.stroke();
    if (isM) { ctx.save(); ctx.translate(2 * dpr, Y + 2 * dpr); ctx.fillText(String(Math.round(v)), 0, 0); ctx.restore(); }
  }
  // Ecke: Einheit
  ctx.fillStyle = '#11151b'; ctx.fillRect(0, 0, rul, rul);
  ctx.fillStyle = '#8691a3'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '600 ' + (9 * dpr) + 'px ' + MK_FONT;
  ctx.fillText('cm', rul / 2, rul / 2);
  ctx.restore();
}

// ======================= Maus, Touch, Tastatur =======================
function stPt(cv, e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * (cv.width / r.width), y: (e.clientY - r.top) * (cv.height / r.height) }; }
function stHit(it, pt) {
  const x = (pt.x - it.ox) / it.s, y = (pt.y - it.oy) / it.s;
  const tol = 4 * ST.dpr / it.s;
  // oberstes zuerst (zuletzt gezeichnet)
  for (let i = it.sc.motifs.length - 1; i >= 0; i--) {
    const o = it.sc.motifs[i], w = n(o.m.w), hh = n(o.m.h);
    if (x >= o.pl.x - w / 2 - tol && x <= o.pl.x + w / 2 + tol && y >= o.pl.y - tol && y <= o.pl.y + hh + tol) return { o, x, y };
  }
  return null;
}
function stHitAt(e) { const L = ST.layout; if (!L || L.compare) return null; return stHit(L.items[0], stPt(ST.el.cv, e)); }

function stDown(e) {
  const L = ST.layout, p = stPos(); if (!L || !p) return;
  const cv = ST.el.cv;
  cv.focus({ preventScroll: true });
  const pt = stPt(cv, e);
  const hit = !L.compare && e.button === 0 ? stHit(L.items[0], pt) : null;
  if (hit) {
    if (ST.selId !== hit.o.m.id) { ST.selId = hit.o.m.id; stRenderRight(); }
    ST.drag = { type: 'move', m: hit.o.m, sx: hit.x, sy: hit.y, mx: hit.o.pl.x, my: hit.o.pl.y, view: hit.o.pl.view, snap: stSnapshot(p), moved: false, it: L.items[0] };
    cv.style.cursor = 'grabbing';
  } else {
    ST.drag = { type: 'pan', px: e.clientX, py: e.clientY, panX: ST.panX, panY: ST.panY, moved: false };
    cv.style.cursor = 'grabbing';
  }
  try { cv.setPointerCapture(e.pointerId); } catch (er) {}
  e.preventDefault();
}
function stMove(e) {
  const d = ST.drag, cv = ST.el.cv;
  if (!d) {
    if (e.pointerType === 'mouse') cv.style.cursor = stHitAt(e) ? 'grab' : 'default';
    return;
  }
  if (d.type === 'pan') {
    ST.panX = d.panX + (e.clientX - d.px); ST.panY = d.panY + (e.clientY - d.py);
    d.moved = true; stDraw(); return;
  }
  const pt = stPt(cv, e), it = d.it;
  const x = (pt.x - it.ox) / it.s, y = (pt.y - it.oy) / it.s;
  let nx = d.mx + (x - d.sx), ny = d.my + (y - d.sy);
  ST.snapX = Math.abs(nx) < 0.5 && !e.altKey;   // Alt = ohne Einrasten
  if (ST.snapX) nx = 0;
  nx = stR1(nx); ny = stR1(ny);
  if (!d.moved && Math.abs(nx - d.mx) < 0.1 && Math.abs(ny - d.my) < 0.1) return;
  d.m.x = nx; d.m.y = ny; d.m.view = d.view;
  if (!d.moved) { const p = stPos(); if (p) p.refGroesse = ST.size; }
  d.moved = true;
  stDraw(); stSyncFields();
}
function stUp(e) {
  const d = ST.drag; ST.drag = null; ST.snapX = false;
  const cv = ST.el.cv; cv.style.cursor = 'default';
  try { cv.releasePointerCapture(e.pointerId); } catch (er) {}
  if (!d) return;
  if (d.type === 'move' && d.moved) {
    stPush('drag', d.snap);
    ST.lastKey = '';
    stCommit(); stSyncFields(); stRenderTools();
  } else if (d.type === 'move' || d.type === 'pan') stDraw();
}
function stNudge(dx, dy) {
  const p = stPos(); if (!p || !ST.selId) return;
  const m = p.motive.find(x => x.id === ST.selId); if (!m || !(n(m.w) > 0 && n(m.h) > 0)) return;
  stPush('nudge' + m.id);
  stMat(p, m);
  m.x = stR1(m.x + dx); m.y = stR1(m.y + dy);
  if (Math.abs(m.x) < 0.05) m.x = 0;
  stCommit(); stSyncFields();
}
function stKey(e) {
  const t = e.target;
  const typing = t && (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || (t.tagName === 'INPUT' && !['checkbox', 'color', 'file', 'button'].includes(t.type)));
  const k = e.key;
  if ((e.ctrlKey || e.metaKey) && !e.altKey && /^[zy]$/i.test(k)) {
    if (typing || ST.tab !== 'place') return;   // in Feldern: normales Rückgängig des Browsers
    e.preventDefault();
    if (k.toLowerCase() === 'y' || e.shiftKey) stRedo(); else stUndo();
    return;
  }
  if (typing || ST.tab !== 'place' || e.ctrlKey || e.metaKey || e.altKey) return;
  const step = e.shiftKey ? 2 : 0.5;
  const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[k];
  if (mv && ST.selId && !ST.compare) { e.preventDefault(); stNudge(mv[0], mv[1]); return; }
  if (k === '+' || k === '=') { e.preventDefault(); stZoomAt(ST.zoom * 1.25); }
  else if (k === '-') { e.preventDefault(); stZoomAt(ST.zoom / 1.25); }
  else if (k === '0') { e.preventDefault(); stFit(); }
}
function stFit() { ST.zoom = 1; ST.panX = 0; ST.panY = 0; stZoomTxt(); stDraw(); }
function stZoomTxt() { if (ST.el.zoomTxt) ST.el.zoomTxt.textContent = Math.round(ST.zoom * 100) + ' %'; }
// Zoomen um einen Punkt (Gerätepixel); ohne Punkt um die Mitte
function stZoomAt(z, pt) {
  z = stClamp(z, 0.4, 8);
  const L = ST.layout, dpr = ST.dpr;
  if (!L) { ST.zoom = z; stZoomTxt(); stDraw(); return; }
  const it = L.items[0];
  if (!pt) pt = { x: L.cx, y: L.cy };
  const r = z / ST.zoom;
  const ox0 = it.ox - ST.panX * dpr, oy0 = it.oy - ST.panY * dpr;           // ohne Verschiebung
  const ox0n = L.cx - (L.cx - ox0) * r, oy0n = L.cy - (L.cy - oy0) * r;      // ohne Verschiebung, neuer Zoom
  const tx = pt.x - (pt.x - it.ox) * r, ty = pt.y - (pt.y - it.oy) * r;      // Ziel: Punkt unter dem Zeiger bleibt
  ST.panX = (tx - ox0n) / dpr; ST.panY = (ty - oy0n) / dpr; ST.zoom = z;
  stZoomTxt(); stDraw();
}

// ======================= Datenblatt =======================
async function stPdf() {
  if (typeof makeDoc !== 'function') return;
  const b = ST.el.pdf;
  b.disabled = true; stStatus('Datenblatt wird erstellt …');
  try {
    if (ST.changedAny) changed();
    const r = await makeDoc('freigabe');
    stStatus(r ? 'Datenblatt gespeichert.' : 'Datenblatt wurde nicht erstellt.');
  } catch (e) { console.error(e); stStatus('Fehler beim Erstellen des Datenblatts.'); }
  finally { b.disabled = false; }
}

// ======================= Eigene Fotos =======================
function stFotoRender() {
  const E = ST.el, box = E.fotos; box.textContent = '';
  E.fList = h('aside', { class: 'st-side st-left' });
  E.fcv = h('canvas', { class: 'st-cv', tabindex: '0', role: 'img', 'aria-label': 'Foto einmessen' });
  E.fstage = h('div', { class: 'st-stage st-fstage' }, [E.fcv]);
  E.ftools = h('div', { class: 'st-tools' });
  E.fhint = h('div', { class: 'st-warn' });
  E.fForm = h('aside', { class: 'st-side st-right' });
  box.appendChild(E.fList);
  box.appendChild(h('section', { class: 'st-center' }, [E.ftools, E.fstage, E.fhint]));
  box.appendChild(E.fForm);
  const cv = E.fcv;
  cv.addEventListener('pointerdown', stFDown);
  cv.addEventListener('pointermove', stFMove);
  cv.addEventListener('pointerup', stFUp);
  cv.addEventListener('pointercancel', stFUp);
  if (ST.ro) ST.ro.observe(E.fstage);
  stFotoList(); stFotoForm(); stFotoTools();
  requestAnimationFrame(stFotoResize);
}
function stFotoList() {
  const box = ST.el.fList; if (!box) return;
  box.textContent = '';
  box.appendChild(h('h2', { class: 'sec' }, ['Eigene Fotos']));
  const file = h('input', { type: 'file', class: 'sr', accept: 'image/jpeg,image/png,image/webp', tabindex: '-1', 'aria-hidden': 'true',
    onchange: e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) stFotoFile(f); } });
  box.appendChild(h('button', { class: 'primary mini', type: 'button', style: 'width:100%', onclick: () => file.click() }, [icon('upload'), 'Foto hochladen']));
  box.appendChild(file);
  const list = (typeof Store !== 'undefined' ? Store.list('textilfotos') : []).slice().sort((a, b) => n(b.data.createdAt) - n(a.data.createdAt));
  if (!list.length) box.appendChild(h('p', { class: 'st-note', text: 'Noch keine Fotos. Lade ein Produktfoto (Vorder- oder Rückansicht, gerade von vorn, flach liegend oder auf Puppe) hoch.' }));
  list.forEach(r => {
    const on = ST.f && ST.f.id === r.id;
    box.appendChild(h('button', { class: 'st-pos', type: 'button', 'aria-current': on ? 'true' : null, onclick: () => stFotoOpen(r) }, [
      h('img', { class: 'st-fthumb', src: r.data.img, alt: '' }),
      h('span', { class: 'st-pt' }, [
        h('b', { text: r.data.name || 'Foto' }),
        h('small', { text: [mkHasGar() && GARMENTS[r.data.garmentKey] ? GARMENTS[r.data.garmentKey].name : '', MK_VIEWS[r.data.view] || ''].filter(Boolean).join(' · ') })
      ])
    ]));
  });
  box.appendChild(h('p', { class: 'st-note st-rights' }, [h('b', { text: 'Bildrechte: ' }), 'Verwende nur eigene Fotos oder Bilder, für die du die Erlaubnis hast (z. B. Pressebilder des Lieferanten mit Freigabe). Fremde Produktfotos aus Shops dürfen nicht einfach in Angebote übernommen werden.']));
  box.appendChild(h('p', { class: 'st-note', text: 'Fotos liegen im Speicher dieses Browsers (bzw. der App-Datenbank) und sind in der Datensicherung enthalten. Ein Foto braucht ca. 150–400 KB.' }));
}
function stFotoOpen(r) {
  const d = r.data || {};
  ST.f = { id: r.id, isNew: false, name: d.name || '', garmentKey: d.garmentKey || 'tshirt', view: d.view === 'back' ? 'back' : 'front', img: d.img, el: null,
    cx: mkNum(d.cx) ? +d.cx : null, cy: mkNum(d.cy) ? +d.cy : null, pxPerCm: n(d.pxPerCm), tint: !!d.tint, createdAt: d.createdAt || Date.now(),
    line: d.messLinie ? { x1: d.messLinie.x1, y1: d.messLinie.y1, x2: d.messLinie.x2, y2: d.messLinie.y2 } : null,
    lineCm: d.messLinie && n(d.messLinie.cm) > 0 ? n(d.messLinie.cm) : 50, mode: 'collar', preview: !!(n(d.pxPerCm) > 0 && mkNum(d.cx)), dirty: false };
  mkLoad(d.img).then(im => { if (ST.f && ST.f.img === d.img) { ST.f.el = im; stFotoPaint(); } });
  stFotoList(); stFotoForm(); stFotoTools(); stFotoPaint();
}
// Foto verkleinern (max. 1600 px), JPEG 0,85 bzw. PNG bei Transparenz
function stShrinkPhoto(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = () => rej(new Error('Datei'));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => rej(new Error('Bild'));
      img.onload = () => {
        const w0 = img.naturalWidth, h0 = img.naturalHeight;
        if (!w0 || !h0) { rej(new Error('leer')); return; }
        const k = Math.min(1, 1600 / Math.max(w0, h0)), c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w0 * k)); c.height = Math.max(1, Math.round(h0 * k));
        const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, c.width, c.height);
        let alpha = false;
        if (!/jpe?g/i.test(file.type)) {
          try {
            const d = ctx.getImageData(0, 0, c.width, c.height).data, step = Math.max(4, Math.floor(d.length / 4 / 40000)) * 4;
            for (let i = 3; i < d.length; i += step) if (d[i] < 250) { alpha = true; break; }
          } catch (e) {}
        }
        res({ url: alpha ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.85), w: c.width, h: c.height, alpha });
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}
function stFotoFile(f) {
  if (!/^image\/(png|jpeg|webp)$/.test(f.type) && !/\.(png|jpe?g|webp)$/i.test(f.name)) { toast('Bitte ein JPG oder PNG wählen.', true); return; }
  stStatus('Foto wird vorbereitet …');
  stShrinkPhoto(f).then(r => {
    const p = stPos();
    const key = p && mkHasGar() ? mkGarmentKey(p) : 'tshirt';
    ST.f = { id: 'tf' + uid(), isNew: true, name: f.name.replace(/\.[^.]+$/, '').slice(0, 40), garmentKey: key, view: ST.view || 'front', img: r.url, el: null,
      cx: null, cy: null, pxPerCm: 0, tint: false, createdAt: Date.now(), line: null, lineCm: 50, mode: 'collar', preview: false, dirty: true };
    const g = mkHasGar() && GARMENTS[key];
    const ds = g && g.sizes && g.sizes[g.defSize];
    if (ds && n(ds.w) > 0) ST.f.lineCm = n(ds.w);
    mkLoad(r.url).then(im => { if (ST.f && ST.f.img === r.url) { ST.f.el = im; stFotoPaint(); } });
    stStatus('Jetzt einmessen: Kragenpunkt anklicken, dann die Messlinie ziehen.');
    stFotoList(); stFotoForm(); stFotoTools(); stFotoPaint();
  }).catch(() => toast('Das Foto konnte nicht gelesen werden.', true));
}
function stFotoTools() {
  const box = ST.el.ftools; if (!box) return;
  box.textContent = '';
  const f = ST.f;
  if (!f) return;
  const seg = h('div', { class: 'seg' }, [['collar', '1 · Kragenpunkt setzen'], ['line', '2 · Messlinie ziehen']].map(([k, l]) =>
    h('button', { type: 'button', 'aria-pressed': String(!f.preview && f.mode === k), onclick: () => { f.mode = k; f.preview = false; stFotoTools(); stFotoPaint(); } }, [l])));
  const prev = h('button', { class: 'chip', type: 'button', 'aria-pressed': String(f.preview), disabled: stFotoReady(f) ? null : true, title: 'So sieht das Foto mit Druckbereichen und Beispielmotiv aus',
    onclick: () => { f.preview = !f.preview; stFotoTools(); stFotoPaint(); } }, ['Vorschau mit Druckbereich']);
  box.appendChild(seg); box.appendChild(prev);
}
const stFotoReady = f => !!f && mkNum(f.cx) && mkNum(f.cy) && n(f.pxPerCm) > 0;
function stFotoForm() {
  const box = ST.el.fForm; if (!box) return;
  box.textContent = '';
  const f = ST.f;
  if (!f) {
    box.appendChild(h('h2', { class: 'sec' }, ['So geht’s']));
    box.appendChild(h('ol', { class: 'st-steps' }, [
      h('li', { text: 'Produktfoto hochladen (gerade von vorn oder hinten, möglichst ohne Perspektive).' }),
      h('li', { text: 'Kragenpunkt anklicken: auf der Mittellinie in Höhe der höchsten Schulterpunkte (dort, wo Kragen und Schulternaht sich treffen). Bei Taschen: Mitte der Oberkante.' }),
      h('li', { text: 'Messlinie über eine bekannte Strecke ziehen, z. B. Brustbreite (Seitennaht zu Seitennaht, 2,5 cm unter dem Ärmelansatz), und die Länge in cm eintragen.' }),
      h('li', { text: 'Speichern. Im Reiter „Platzieren“ kannst du das Foto dann einer Position zuordnen.' })
    ]));
    return;
  }
  const gsel = h('select', { 'aria-label': 'Kleidungsstück', onchange: e => { f.garmentKey = e.target.value; f.dirty = true; stFotoForm(); stFotoPaint(); } });
  if (mkHasGar()) Object.keys(GARMENTS).forEach(k => gsel.appendChild(h('option', { value: k, text: GARMENTS[k].name })));
  gsel.value = f.garmentKey;
  const viewSeg = h('div', { class: 'seg' }, ['front', 'back'].map(v => h('button', { type: 'button', 'aria-pressed': String(f.view === v), onclick: () => { f.view = v; f.dirty = true; stFotoForm(); stFotoPaint(); } }, [MK_VIEWS[v]])));
  const lenIn = h('input', { type: 'number', step: '0.5', min: '1', value: f.lineCm || '', 'aria-label': 'Länge der Messlinie in cm',
    oninput: e => { f.lineCm = n(e.target.value); stFotoCalc(); f.dirty = true; stFotoInfo(); stFotoPaint(); } });
  const G = mkHasGar() && GARMENTS[f.garmentKey];
  const ds = G && G.sizes && G.sizes[G.defSize];
  const tint = h('input', { type: 'checkbox', checked: f.tint, onchange: e => { f.tint = e.target.checked; f.dirty = true; stFotoPaint(); } });
  ST.el.fInfo = h('div', { class: 'st-note' });
  box.appendChild(h('div', { class: 'st-sec' }, [
    h('h2', { class: 'sec' }, [f.isNew ? 'Neues Foto' : 'Foto bearbeiten']),
    lbl('Name', h('input', { value: f.name, maxlength: '60', placeholder: 'z. B. Stanley Creator weiß vorne', oninput: e => { f.name = e.target.value; f.dirty = true; } })),
    lbl('Passendes Kleidungsstück', gsel),
    stGrp('Ansicht', viewSeg)
  ]));
  box.appendChild(h('div', { class: 'st-sec' }, [
    h('h2', { class: 'sec' }, ['Einmessen']),
    h('p', { class: 'st-note' }, ['1. Kragenpunkt anklicken: Mittellinie in Höhe der höchsten Schulterpunkte (Kragen trifft Schulternaht); bei Taschen Mitte der Oberkante. 2. Linie über eine bekannte Strecke ziehen.']),
    lbl('Länge der Messlinie (cm)', lenIn),
    ds && n(ds.w) > 0 ? h('button', { class: 'link', type: 'button', onclick: () => { f.lineCm = n(ds.w); lenIn.value = f.lineCm; stFotoCalc(); f.dirty = true; stFotoInfo(); stFotoPaint(); } },
      ['Brustbreite Größe ' + G.defSize + ' übernehmen (' + stFmt(n(ds.w)) + ' cm)']) : null,
    ST.el.fInfo,
    h('label', { class: 'check' }, [tint, h('span', null, ['In Textilfarbe einfärben', h('small', { text: 'Für weiße oder helle Produktfotos: das Foto wird in der Farbe der Position eingefärbt. Am besten mit freigestelltem PNG (transparenter Hintergrund), sonst wird der Hintergrund mit eingefärbt.' })])])
  ]));
  box.appendChild(h('div', { class: 'st-btns' }, [
    h('button', { class: 'primary mini', type: 'button', onclick: stFotoSave }, [icon('save'), 'Speichern']),
    !f.isNew ? h('button', { class: 'ghost mini danger', type: 'button', onclick: stFotoDelete }, [icon('trash'), 'Löschen']) : null,
    h('button', { class: 'ghost mini', type: 'button', onclick: () => { ST.f = null; stFotoList(); stFotoForm(); stFotoTools(); stFotoPaint(); } }, ['Schließen'])
  ]));
  box.appendChild(h('p', { class: 'st-note st-rights' }, [h('b', { text: 'Bildrechte: ' }), 'nur eigene Fotos oder mit Erlaubnis des Lieferanten verwenden.']));
  stFotoInfo();
}
function stFotoCalc() {
  const f = ST.f; if (!f || !f.line) return;
  const len = Math.hypot(f.line.x2 - f.line.x1, f.line.y2 - f.line.y1);
  f.pxPerCm = len > 2 && n(f.lineCm) > 0 ? Math.round(len / n(f.lineCm) * 1000) / 1000 : 0;
}
function stFotoInfo() {
  const f = ST.f, el = ST.el.fInfo; if (!f || !el) return;
  el.textContent = '';
  const ok = (b, t) => h('div', { class: b ? 'st-ok' : 'st-todo' }, [b ? '✓ ' : '○ ', t]);
  el.appendChild(ok(mkNum(f.cx), mkNum(f.cx) ? 'Kragenpunkt gesetzt' : 'Kragenpunkt fehlt'));
  el.appendChild(ok(n(f.pxPerCm) > 0, n(f.pxPerCm) > 0 ? 'Maßstab: ' + N1.format(f.pxPerCm) + ' Pixel pro cm' : 'Messlinie fehlt'));
  if (stFotoReady(f) && f.el) el.appendChild(h('div', { class: 'mut', text: 'Bild entspricht ' + stFmt(f.el.naturalWidth / f.pxPerCm) + ' × ' + stFmt(f.el.naturalHeight / f.pxPerCm) + ' cm.' }));
}
function stFotoSave() {
  const f = ST.f; if (!f) return;
  if (!String(f.name || '').trim()) { toast('Gib dem Foto einen Namen.', true); return; }
  if (!stFotoReady(f)) { toast('Erst einmessen: Kragenpunkt setzen und Messlinie ziehen.', true); return; }
  const data = { name: f.name.trim(), garmentKey: f.garmentKey, view: f.view, img: f.img, pxPerCm: f.pxPerCm, cx: Math.round(f.cx * 10) / 10, cy: Math.round(f.cy * 10) / 10,
    tint: !!f.tint, createdAt: f.createdAt || Date.now(), updatedAt: Date.now(),
    messLinie: f.line ? { x1: Math.round(f.line.x1), y1: Math.round(f.line.y1), x2: Math.round(f.line.x2), y2: Math.round(f.line.y2), cm: n(f.lineCm) } : null };
  Store.put('textilfotos', f.id, data).then(() => {
    f.isNew = false; f.dirty = false;
    stStatus('Foto gespeichert.'); toast('Foto gespeichert');
    stFotoList(); stFotoForm();
  }).catch(e => {
    console.error(e);
    toast(e && e.code === 'storage_full' ? 'Der Speicher ist voll. Lösche alte Fotos oder Aufträge mit großen Bildern.' : 'Das Foto konnte nicht gespeichert werden.', true);
  });
}
function stFotoDelete() {
  const f = ST.f; if (!f || f.isNew) return;
  ask('Das Foto „' + (f.name || 'Foto') + '“ wird gelöscht. Positionen, die es nutzen, zeigen danach wieder die Zeichnung.', { title: 'Foto löschen?', ok: 'Löschen', danger: true }).then(v => {
    if (!v) return;
    Store.del('textilfotos', f.id).then(() => { ST.f = null; stFotoList(); stFotoForm(); stFotoTools(); stFotoPaint(); stStatus('Foto gelöscht.'); });
  });
}
function stFotoResize() {
  const E = ST.el; if (!E.fstage || ST.tab !== 'fotos') return;
  const r = E.fstage.getBoundingClientRect(), dpr = Math.min(3, window.devicePixelRatio || 1);
  const w = Math.max(50, Math.floor(r.width)), hh = Math.max(50, Math.floor(r.height));
  E.fcv.width = Math.round(w * dpr); E.fcv.height = Math.round(hh * dpr);
  E.fcv.style.width = w + 'px'; E.fcv.style.height = hh + 'px';
  ST.fdpr = dpr;
  stFotoPaint();
}
// Bild ins Canvas einpassen: {s (Gerätepx je Bildpx), x0, y0}
function stFotoFit() {
  const f = ST.f, cv = ST.el.fcv;
  if (!f || !f.el) return null;
  const W = cv.width, H = cv.height, pad = 16 * (ST.fdpr || 1);
  const iw = f.el.naturalWidth, ih = f.el.naturalHeight;
  const s = Math.min((W - 2 * pad) / iw, (H - 2 * pad) / ih);
  return { s, x0: (W - iw * s) / 2, y0: (H - ih * s) / 2 };
}
function stFotoPaint() {
  const E = ST.el, cv = E.fcv; if (!cv || ST.tab !== 'fotos') return;
  const ctx = cv.getContext('2d'), W = cv.width, H = cv.height, dpr = ST.fdpr || 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#e6e9ee'; ctx.fillRect(0, 0, W, H);
  const f = ST.f;
  if (E.fhint) E.fhint.textContent = '';
  if (!f) {
    ctx.fillStyle = '#5d6878'; ctx.font = '600 ' + (14 * dpr) + 'px ' + MK_FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Foto hochladen oder links auswählen', W / 2, H / 2);
    return;
  }
  const fit = stFotoFit(); if (!fit) return;
  if (f.preview && stFotoReady(f) && mkHasGar()) {
    // Vorschau wie im Mockup: Foto (ggf. eingefärbt) + Druckbereiche + Beispielmotiv
    const s = fit.s * f.pxPerCm, ox = fit.x0 + f.cx * fit.s, oy = fit.y0 + f.cy * fit.s;
    const col = (stPos() && mkColorOf(stPos())) || '#1d1e21';
    try { drawTemplatePhoto(ctx, { img: f.el, src: f.img, pxPerCm: f.pxPerCm, cx: f.cx, cy: f.cy, view: f.view, tint: f.tint ? col : null }, { scale: s, ox, oy }); } catch (e) { console.error(e); }
    let geo = null;
    try { geo = garmentGeometry(f.garmentKey, f.view, GARMENTS[f.garmentKey].defSize); } catch (e) {}
    if (geo && geo.zones) {
      ctx.save(); ctx.setLineDash([5 * dpr, 4 * dpr]); ctx.strokeStyle = 'rgba(200,120,0,.9)'; ctx.lineWidth = 1.4 * dpr;
      Object.keys(geo.zones).forEach(k => { const z = geo.zones[k]; if (z.view && z.view !== f.view) return; ctx.strokeRect(ox + z.x0 * s, oy + z.y0 * s, z.w * s, z.h * s); });
      ctx.restore();
    }
    let d = null;
    try { d = defaultPlacement(f.garmentKey, f.view === 'back' ? 'ruecken' : 'front', GARMENTS[f.garmentKey].defSize, 21, 29.7); } catch (e) {}
    if (d) { try { drawPrint(ctx, { name: 'A4 (Beispiel)', w: 21, h: 29.7, x: d.x, y: d.y, img: null, pers: false }, { scale: s, ox, oy, garmentColor: col }); } catch (e) { console.error(e); } }
    if (E.fhint) E.fhint.appendChild(h('div', { class: 'st-w info' }, [icon('info'), h('span', { text: 'Gestrichelt: Druckbereiche laut Bibliothek, Kasten: A4-Motiv an der Standardposition. Passt beides zum Foto, stimmt das Einmessen.' })]));
    return;
  }
  ctx.drawImage(f.el, fit.x0, fit.y0, f.el.naturalWidth * fit.s, f.el.naturalHeight * fit.s);
  const P = (x, y) => [fit.x0 + x * fit.s, fit.y0 + y * fit.s];
  // Kragenpunkt mit Mittellinie
  if (mkNum(f.cx) && mkNum(f.cy)) {
    const [x, y] = P(f.cx, f.cy);
    ctx.save();
    ctx.strokeStyle = 'rgba(236,0,140,.55)'; ctx.lineWidth = 1 * dpr; ctx.setLineDash([6 * dpr, 4 * dpr]);
    ctx.beginPath(); ctx.moveTo(x, fit.y0); ctx.lineTo(x, fit.y0 + f.el.naturalHeight * fit.s); ctx.stroke();
    ctx.setLineDash([]); ctx.strokeStyle = '#ec008c'; ctx.lineWidth = 2 * dpr;
    ctx.beginPath(); ctx.arc(x, y, 7 * dpr, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 13 * dpr, y); ctx.lineTo(x + 13 * dpr, y); ctx.moveTo(x, y - 13 * dpr); ctx.lineTo(x, y + 13 * dpr); ctx.stroke();
    stFLabel(ctx, 'Kragenpunkt', x + 12 * dpr, y - 16 * dpr, '#ec008c', dpr);
    ctx.restore();
  }
  // Messlinie
  if (f.line) {
    const [x1, y1] = P(f.line.x1, f.line.y1), [x2, y2] = P(f.line.x2, f.line.y2);
    ctx.save(); ctx.strokeStyle = '#0a6cff'; ctx.lineWidth = 2 * dpr;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    const a = Math.atan2(y2 - y1, x2 - x1), t = 9 * dpr;
    [[x1, y1], [x2, y2]].forEach(([x, y]) => { ctx.beginPath(); ctx.moveTo(x - Math.sin(a) * t, y + Math.cos(a) * t); ctx.lineTo(x + Math.sin(a) * t, y - Math.cos(a) * t); ctx.stroke(); });
    stFLabel(ctx, (n(f.lineCm) > 0 ? stFmt(f.lineCm) + ' cm' : '? cm'), (x1 + x2) / 2, (y1 + y2) / 2 - 14 * dpr, '#0a6cff', dpr, true);
    ctx.restore();
  }
  if (E.fhint) E.fhint.appendChild(h('div', { class: 'st-w info' }, [icon('info'), h('span', { text: f.mode === 'collar' ? 'Klick auf den Kragenpunkt: Mittellinie in Höhe der höchsten Schulterpunkte (Kragen trifft Schulternaht).' : 'Linie ziehen: von Seitennaht zu Seitennaht (Brustbreite) oder eine andere bekannte Strecke.' })]));
}
function stFLabel(ctx, t, x, y, col, dpr, center) {
  ctx.save(); ctx.font = '700 ' + (12 * dpr) + 'px ' + MK_FONT;
  const w = ctx.measureText(t).width + 10 * dpr, hh = 18 * dpr, x0 = center ? x - w / 2 : x;
  ctx.fillStyle = 'rgba(255,255,255,.94)'; ctx.fillRect(x0, y - hh / 2, w, hh);
  ctx.strokeStyle = col; ctx.lineWidth = 1 * dpr; ctx.strokeRect(x0, y - hh / 2, w, hh);
  ctx.fillStyle = col; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(t, x0 + 5 * dpr, y + 0.5 * dpr);
  ctx.restore();
}
function stFImgPt(e) {
  const fit = stFotoFit(); if (!fit) return null;
  const pt = stPt(ST.el.fcv, e);
  return { x: (pt.x - fit.x0) / fit.s, y: (pt.y - fit.y0) / fit.s };
}
function stFDown(e) {
  const f = ST.f; if (!f || f.preview || !f.el) return;
  const q = stFImgPt(e); if (!q) return;
  if (f.mode === 'collar') {
    f.cx = stClamp(q.x, 0, f.el.naturalWidth); f.cy = stClamp(q.y, 0, f.el.naturalHeight); f.dirty = true;
    if (!f.line) f.mode = 'line';
    stFotoTools(); stFotoInfo(); stFotoPaint();
    return;
  }
  f.line = { x1: q.x, y1: q.y, x2: q.x, y2: q.y };
  ST.fdrag = true;
  try { ST.el.fcv.setPointerCapture(e.pointerId); } catch (er) {}
  e.preventDefault();
}
function stFMove(e) {
  const f = ST.f; if (!ST.fdrag || !f || !f.line) return;
  const q = stFImgPt(e); if (!q) return;
  // Umschalt: genau waagrecht/senkrecht
  if (e.shiftKey) { if (Math.abs(q.x - f.line.x1) > Math.abs(q.y - f.line.y1)) q.y = f.line.y1; else q.x = f.line.x1; }
  f.line.x2 = q.x; f.line.y2 = q.y;
  stFotoCalc(); stFotoPaint();
}
function stFUp(e) {
  if (!ST.fdrag) return;
  ST.fdrag = false;
  try { ST.el.fcv.releasePointerCapture(e.pointerId); } catch (er) {}
  const f = ST.f; if (!f) return;
  stFotoCalc(); f.dirty = true;
  stFotoTools(); stFotoInfo(); stFotoPaint();
}
