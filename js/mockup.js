// Mockup und Druckfreigabe (Datenblatt):
//  - Motiv-Bild und Ort pro Druckstelle (Zeile unter jeder Druckstelle), Knopf „Im Studio platzieren“
//  - Szene zeichnen: Kleidungsstück (garments.js) bzw. eigenes Foto + Motive + optional Bemaßung → mkBuild / mkDrawScene
//  - drawMockup() / mockupDataUrl() / mockupsFor() für Vorschauen
//  - Mockup-Seite im Angebot, Dokument „Druckfreigabe / Datenblatt“ (DOC_BUILDERS.freigabe)
// Das Bearbeiten (Ziehen, Maße, Farben, eigene Fotos) passiert im Mockup-Studio (js/studio.js, openStudio()).
//
// Koordinaten in cm: Ursprung = Kragenpunkt auf der Mittellinie, x nach rechts (im Bild), y nach unten.
// Motiv: m.x = Abstand Motivmitte zur Mittellinie, m.y = Abstand Motiv-Oberkante zum Kragenpunkt, m.view = 'front' | 'back'.
// Fehlen x/y/view, gilt die Standardplatzierung (defaultPlacement) für den Ort m.ort.

const MK_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
const MK_VIEWS = { front: 'Vorderseite', back: 'Rückseite' };

// ======================= Daten einer Position =======================
const mkHasGar = () => typeof GARMENTS !== 'undefined' && typeof drawGarment === 'function';
const mkIsTextil = p => !!p && (p.typ || 'textil') === 'textil';
const mkR1 = v => Math.round(v * 10) / 10;
const mkHex = v => /^#[0-9a-f]{6}$/i.test(String(v || ''));

// Welches Kleidungsstück? p.modell > Katalog (garmentForPosition) > erstes
function mkGarmentKey(p) {
  if (!mkHasGar()) return 'tshirt';
  if (p && p.modell && GARMENTS[p.modell]) return p.modell;
  try { const k = garmentForPosition(p, S); if (GARMENTS[k]) return k; } catch (e) { console.error(e); }
  return GARMENTS.tshirt ? 'tshirt' : Object.keys(GARMENTS)[0];
}
function mkGarmentName(key) { return mkHasGar() && GARMENTS[key] ? GARMENTS[key].name : 'Textil'; }
function mkColorOf(p) {
  if (p && mkHex(p.farbeHex)) return p.farbeHex.toLowerCase();
  try { const c = colorForName(p.farbe, p.dunkel); if (mkHex(c)) return c; } catch (e) {}
  return p && p.dunkel ? '#3b3f46' : '#cfd2d6';
}
// Größen des Kleidungsstücks in der Reihenfolge von SIZES (unbekannte hinten)
function mkGarSizes(key) {
  const g = mkHasGar() && GARMENTS[key]; if (!g || !g.sizes) return [];
  const ks = Object.keys(g.sizes);
  return ks.slice().sort((a, b) => { const ia = SIZES.indexOf(a), ib = SIZES.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); });
}
// Bestellte Größen (in SIZES-Reihenfolge)
function mkSizesInOrder(p) { return p && !p.ohneGroessen ? SIZES.filter(s => n(p.groessen && p.groessen[s]) > 0) : []; }
// Bezugsgröße der Maße: p.refGroesse (im Studio gesetzt) > garmentSizeForPosition > defSize
function mkRefSize(p, key) {
  key = key || mkGarmentKey(p);
  const g = mkHasGar() && GARMENTS[key], sz = (g && g.sizes) || {};
  if (p && p.refGroesse && sz[p.refGroesse]) return p.refGroesse;
  try { const s = garmentSizeForPosition(p, key); if (sz[s]) return s; } catch (e) {}
  return (g && g.defSize && sz[g.defSize]) ? g.defSize : (mkGarSizes(key)[0] || 'M');
}
// Größe lesbar (Tasche/Schürze: 'one')
const mkSizeLabel = s => s === 'one' ? 'Einheitsgröße' : String(s || '');
const mkNum = v => v !== undefined && v !== null && v !== '' && isFinite(+v);
// Platzierung eines Motivs {view, x, y} (gespeichert oder Standard)
function mkPlace(p, m, key, size) {
  let d = null;
  if (!mkNum(m.x) || !mkNum(m.y) || (m.view !== 'front' && m.view !== 'back')) {
    try { d = defaultPlacement(key || mkGarmentKey(p), m.ort, size || mkRefSize(p, key), n(m.w), n(m.h)); } catch (e) { console.error(e); }
    if (!d) d = { view: isBack(m.ort) ? 'back' : 'front', x: 0, y: isBack(m.ort) ? 8 : 10 };
  }
  return {
    view: m.view === 'front' || m.view === 'back' ? m.view : (d.view === 'back' ? 'back' : 'front'),
    x: mkNum(m.x) ? +m.x : n(d.x),
    y: mkNum(m.y) ? +m.y : n(d.y)
  };
}
// Seite vom Träger aus: Vorderansicht x > 0 = links, Rückansicht x > 0 = rechts
function mkSide(view, x) {
  if (Math.abs(x) < 0.05) return '';
  return (view === 'back') === (x > 0) ? 'rechts' : 'links';
}
function mkMitteTxt(view, x) { const s = mkSide(view, x); return s ? N1.format(Math.abs(mkR1(x))) + ' ' + s : 'mittig'; }

// Eigenes Foto für eine Ansicht (Sammlung 'textilfotos')
function mkPhotoRec(p, view) {
  if (!p || typeof Store === 'undefined') return null;
  const id = (p.fotoIds && p.fotoIds[view]) || (view === 'front' && p.fotoId) || null;
  if (!id) return null;
  const r = Store.list('textilfotos').find(x => x.id === id);
  return r && r.data && r.data.img && (r.data.view || 'front') === view ? Object.assign({ id: r.id }, r.data) : null;
}

// ======================= Bilder laden =======================
const mkImgs = new Map();   // src → Image (fertig geladen)
const mkBad = new Set();    // Bilder, die nicht geladen werden konnten (nicht endlos neu versuchen)
function mkImg(src) { return src ? mkImgs.get(src) || null : null; }
const mkWants = src => !!src && !mkImgs.has(src) && !mkBad.has(src);
function mkLoad(src) {
  if (!src) return Promise.resolve(null);
  if (mkImgs.has(src)) return Promise.resolve(mkImgs.get(src));
  if (mkBad.has(src)) return Promise.resolve(null);
  const pr = typeof garLoadImage === 'function' ? garLoadImage(src)
    : new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
  return Promise.resolve(pr).then(i => {
    if (i) { if (mkImgs.size > 150) mkImgs.clear(); mkImgs.set(src, i); } else mkBad.add(src);
    return i || null;
  }).catch(() => { mkBad.add(src); return null; });
}

// ======================= Szene =======================
// Synchron aus den Daten bauen. Fehlende Bilder stehen in sc.missing (mit mkLoad laden, dann neu bauen).
// opt.size = angezeigte Größe (Standard: Bezugsgröße)
function mkBuild(p, view, opt) {
  opt = opt || {};
  view = view === 'back' ? 'back' : 'front';
  const key = mkGarmentKey(p), size = opt.size || mkRefSize(p, key), color = mkColorOf(p);
  const missing = [];
  const motifs = [];
  validMotifs(p).forEach((m, i) => {
    const pl = mkPlace(p, m, key, size);
    if (pl.view !== view) return;
    const img = m.img ? mkImg(m.img) : null;
    if (mkWants(m.img)) missing.push(m.img);
    motifs.push({ m, nr: i + 1, pl, img });
  });
  let tpl = null;
  const rec = opt.noPhoto ? null : mkPhotoRec(p, view);
  if (rec) {
    const im = mkImg(rec.img);
    if (im) tpl = { img: im, src: rec.img, pxPerCm: n(rec.pxPerCm) || 10, cx: n(rec.cx), cy: n(rec.cy), view, tint: rec.tint ? color : null, rec };
    else if (mkWants(rec.img)) missing.push(rec.img);
  }
  return { p, key, size, view, color, motifs, tpl, missing };
}
async function mkPrepare(p, view, opt) {
  let sc = mkBuild(p, view, opt);
  if (sc.missing.length) { await Promise.all(sc.missing.map(mkLoad)); sc = mkBuild(p, view, opt); }
  return sc;
}
// Umriss der Szene in cm {x, y, w, h}. noMotifs = nur Kleidungsstück/Foto (stabil beim Ziehen)
function mkSceneBox(sc, noMotifs) {
  let b = null;
  if (sc.tpl) {
    const k = sc.tpl.pxPerCm, im = sc.tpl.img;
    b = { x: -sc.tpl.cx / k, y: -sc.tpl.cy / k, w: (im.naturalWidth || im.width) / k, h: (im.naturalHeight || im.height) / k };
  } else {
    try { const g = garmentGeometry(sc.key, sc.view, sc.size); if (g && g.bbox) b = Object.assign({}, g.bbox); } catch (e) { console.error(e); }
  }
  if (!b) b = { x: -30, y: -3, w: 60, h: 78 };
  // Motive, die herausragen, gehören mit ins Bild
  if (!noMotifs) sc.motifs.forEach(o => {
    const x0 = o.pl.x - n(o.m.w) / 2, x1 = o.pl.x + n(o.m.w) / 2, y0 = o.pl.y, y1 = o.pl.y + n(o.m.h);
    const bx1 = Math.max(b.x + b.w, x1), by1 = Math.max(b.y + b.h, y1);
    b.x = Math.min(b.x, x0); b.y = Math.min(b.y, y0); b.w = bx1 - b.x; b.h = by1 - b.y;
  });
  return b;
}
function mkUnion(a, b) { const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y); return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y }; }

// Motiv für drawPrint / checkPlacement
function mkPrintObj(o) {
  const m = o.m;
  return { id: m.id, name: m.name, pers: !!m.pers, w: n(m.w), h: n(m.h), x: o.pl.x, y: o.pl.y, view: o.pl.view, ort: m.ort,
    img: o.img || null, src: m.img || null, imgRatio: n(m.imgRatio) || null };
}

// Szene zeichnen. o: {scale, ox, oy (Gerätepixel), u (Pixel je Bildschirmpunkt), font (px), dims, zones, numbers, sel (Motiv-ID), paper, shadow, detail}
// Gibt die Geometrie des Kleidungsstücks zurück.
function mkDrawScene(ctx, sc, o) {
  const s = o.scale, ox = o.ox, oy = o.oy, u = o.u || 1;
  let geo = null;
  ctx.save();
  try {
    if (sc.tpl) geo = drawTemplatePhoto(ctx, sc.tpl, { scale: s, ox, oy });
    else geo = drawGarment(ctx, sc.key, sc.view, sc.size, sc.color, { scale: s, ox, oy, shadow: o.shadow !== false, detail: o.detail !== false });
  } catch (e) { console.error(e); }
  ctx.restore();
  if (!geo && !sc.tpl) { try { geo = garmentGeometry(sc.key, sc.view, sc.size); } catch (e) {} }
  const X = x => ox + x * s, Y = y => oy + y * s;

  // Maximale Druckbereiche
  if (o.zones && geo && geo.zones && !sc.tpl) {
    ctx.save();
    ctx.setLineDash([5 * u, 4 * u]); ctx.lineWidth = 1.2 * u;
    const dark = mkLumHex(sc.color) < 0.45;
    ctx.strokeStyle = dark ? 'rgba(255,214,90,.85)' : 'rgba(200,120,0,.85)';
    ctx.fillStyle = ctx.strokeStyle;
    ctx.font = '600 ' + Math.round(o.font * 0.72) + 'px ' + MK_FONT; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    Object.keys(geo.zones).forEach(k => {
      const z = geo.zones[k]; if (!z || (z.view && z.view !== sc.view)) return;
      ctx.strokeRect(X(z.x0), Y(z.y0), z.w * s, z.h * s);
      ctx.fillText(z.label || (typeof GAR_ZONE_LABEL !== 'undefined' && GAR_ZONE_LABEL[k]) || k, X(z.x0) + 3 * u, Y(z.y0) + 3 * u);
    });
    ctx.restore();
  }

  // Motive
  sc.motifs.forEach(mo => {
    ctx.save();
    try { drawPrint(ctx, mkPrintObj(mo), { scale: s, ox, oy, garmentColor: sc.color }); } catch (e) { console.error(e); }
    ctx.restore();
  });

  // Auswahl
  if (o.sel) {
    const mo = sc.motifs.find(x => x.m.id === o.sel);
    if (mo) {
      const x0 = X(mo.pl.x - n(mo.m.w) / 2), y0 = Y(mo.pl.y), w = n(mo.m.w) * s, hh = n(mo.m.h) * s;
      ctx.save();
      ctx.strokeStyle = '#2f8cff'; ctx.lineWidth = 1.6 * u; ctx.setLineDash([]);
      ctx.shadowColor = 'rgba(47,140,255,.6)'; ctx.shadowBlur = 6 * u;
      ctx.strokeRect(x0 - 2 * u, y0 - 2 * u, w + 4 * u, hh + 4 * u);
      ctx.shadowBlur = 0; ctx.fillStyle = '#fff';
      [[x0, y0], [x0 + w, y0], [x0, y0 + hh], [x0 + w, y0 + hh]].forEach(([a, b]) => { ctx.fillRect(a - 3.5 * u, b - 3.5 * u, 7 * u, 7 * u); ctx.strokeRect(a - 3.5 * u, b - 3.5 * u, 7 * u, 7 * u); });
      ctx.restore();
    }
  }
  if (o.dims && sc.motifs.length) mkDims(ctx, sc, o, geo);
  if (o.numbers) sc.motifs.forEach(mo => mkNumber(ctx, X(mo.pl.x - n(mo.m.w) / 2), Y(mo.pl.y), mo.nr, o));
  return geo;
}
function mkLumHex(hex) {
  const x = String(hex || '#888888').replace('#', ''), c = [0, 2, 4].map(i => parseInt(x.slice(i, i + 2), 16) || 0);
  return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;
}
// Nummer im Kreis
function mkNumber(ctx, x, y, nr, o) {
  const r = o.font * 0.72;
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = o.paper ? '#1e293b' : '#2f8cff'; ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.16); ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = '700 ' + Math.round(r * 1.15) + 'px ' + MK_FONT;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(nr), x, y + r * 0.06);
  ctx.restore();
}

// ======================= Bemaßung (Stil technische Zeichnung) =======================
function mkDims(ctx, sc, o, geo) {
  const s = o.scale, ox = o.ox, oy = o.oy, u = o.u || 1, f = o.font;
  const X = x => ox + x * s, Y = y => oy + y * s;
  const col = o.paper ? '#1f2937' : '#0b5bd3';
  const lw = Math.max(0.8, (o.paper ? 0.9 : 1.1) * u);
  const ah = f * 0.42;   // Pfeillänge
  ctx.save();
  ctx.font = '600 ' + Math.round(f) + 'px ' + MK_FONT;
  ctx.lineCap = 'butt';

  // Heller Saum unter den Linien, damit sie auch auf dunklen Textilien lesbar sind
  const halo = 'rgba(255,255,255,.8)';
  const line = (x1, y1, x2, y2, dash, alpha) => {
    ctx.save(); ctx.globalAlpha = alpha || 1; ctx.setLineDash(dash || []);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.strokeStyle = halo; ctx.lineWidth = lw * (dash ? 0.8 : 1) + Math.max(1.2, lw * 1.6); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = lw * (dash ? 0.8 : 1); ctx.stroke(); ctx.restore();
  };
  const arrow = (x, y, dx, dy) => {   // Spitze bei (x, y), zeigt in Richtung (dx, dy)
    const l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, w = ah * 0.38;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - ux * ah - uy * w, y - uy * ah + ux * w); ctx.lineTo(x - ux * ah + uy * w, y - uy * ah - ux * w); ctx.closePath();
    ctx.save(); ctx.strokeStyle = halo; ctx.lineWidth = Math.max(1, lw * 1.4); ctx.lineJoin = 'round'; ctx.stroke(); ctx.restore();
    ctx.fillStyle = col; ctx.fill();
  };
  const label = (txt, x, y) => {
    const tw = ctx.measureText(txt).width, ph = f * 0.32, bw = tw + ph * 2, bh = f * 1.25;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,.94)'; ctx.strokeStyle = o.paper ? 'rgba(31,41,55,.25)' : 'rgba(11,91,211,.35)'; ctx.lineWidth = Math.max(0.6, 0.7 * u);
    const r = bh * 0.25, x0 = x - bw / 2, y0 = y - bh / 2;
    ctx.beginPath(); ctx.moveTo(x0 + r, y0); ctx.arcTo(x0 + bw, y0, x0 + bw, y0 + bh, r); ctx.arcTo(x0 + bw, y0 + bh, x0, y0 + bh, r); ctx.arcTo(x0, y0 + bh, x0, y0, r); ctx.arcTo(x0, y0, x0 + bw, y0, r); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = o.paper ? '#111827' : '#0b3f94'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, x, y + f * 0.04);
    ctx.restore();
    return bw;
  };
  // Maßlinie zwischen zwei Punkten (waagrecht oder senkrecht) mit Pfeilen und Zahl
  const dim = (x1, y1, x2, y2, txt) => {
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len < 0.5) return;
    const dx = (x2 - x1) / len, dy = (y2 - y1) / len;
    const tw = ctx.measureText(txt).width + f * 0.7;
    const roomy = len > ah * 2.4;
    line(x1, y1, x2, y2);
    if (roomy) { arrow(x1, y1, -dx, -dy); arrow(x2, y2, dx, dy); }
    else {   // zu kurz: Pfeile von außen
      line(x1 - dx * ah * 1.6, y1 - dy * ah * 1.6, x1, y1); line(x2, y2, x2 + dx * ah * 1.6, y2 + dy * ah * 1.6);
      arrow(x1, y1, dx, dy); arrow(x2, y2, -dx, -dy);
    }
    const horiz = Math.abs(dx) > Math.abs(dy);
    let lx = (x1 + x2) / 2, ly = (y1 + y2) / 2;
    if (horiz ? tw > len - ah * 2 : f * 1.3 > len - ah * 2) {   // Zahl passt nicht dazwischen → daneben
      if (horiz) ly -= f * 1.05; else lx += (dx === 0 && x1 < ox ? -1 : 1) * (tw / 2 + f * 0.25);
    }
    label(txt, lx, ly);
  };
  // Endstriche (kurze Hilfslinien) senkrecht zur Maßlinie
  const ext = (x1, y1, x2, y2) => line(x1, y1, x2, y2, [Math.max(2, 3 * u), Math.max(1.5, 2 * u)], 0.75);

  // Mittellinie und Kragenpunkt
  let top = Infinity, bot = -Infinity;
  sc.motifs.forEach(mo => { top = Math.min(top, mo.pl.y); bot = Math.max(bot, mo.pl.y + n(mo.m.h)); });
  const gb = geo && geo.bbox ? geo.bbox : mkSceneBox(sc);
  const yA = Y(Math.min(gb.y, -1)) , yB = Y(Math.max(gb.y + gb.h, bot + 4));
  ctx.save(); ctx.setLineDash([f * 0.9, f * 0.25, f * 0.12, f * 0.25]);   // Strich-Punkt
  ctx.beginPath(); ctx.moveTo(X(0), yA); ctx.lineTo(X(0), yB);
  ctx.globalAlpha = 0.5; ctx.strokeStyle = halo; ctx.lineWidth = lw * 0.8 + Math.max(1, lw * 1.2); ctx.stroke();
  ctx.globalAlpha = 0.7; ctx.strokeStyle = col; ctx.lineWidth = lw * 0.8; ctx.stroke(); ctx.restore();
  // Kragenpunkt
  ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = lw * 1.2; const cr = f * 0.32;
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(X(0), Y(0), cr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(X(0) - cr * 1.8, Y(0)); ctx.lineTo(X(0) + cr * 1.8, Y(0)); ctx.moveTo(X(0), Y(0) - cr * 1.8); ctx.lineTo(X(0), Y(0) + cr * 1.8); ctx.stroke();
  ctx.restore();
  if (o.paper || o.labels) {
    ctx.save(); ctx.font = '600 ' + Math.round(f * 0.78) + 'px ' + MK_FONT; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = Math.max(2, f * 0.22); ctx.fillStyle = col;
    const txt = (t, x, y) => { ctx.strokeText(t, x, y); ctx.fillText(t, x, y); };
    // über die Breiten-Maßlinie des obersten Motivs heben, falls die nah am Kragen liegt
    const ly = Math.min(Y(0) - cr * 0.8, isFinite(top) ? Y(top) - f * 2.3 : Infinity);
    txt(sc.key === 'bag' || sc.key === 'apron' ? 'Oberkante Mitte' : 'Kragenpunkt', X(0) + cr * 2.2, ly);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'; txt('Mitte', X(0), yB + f * 0.2);
    ctx.restore();
  }

  // Ketten-Maße außen: Stapel je Seite, damit sich Linien nicht überdecken
  const stack = { '-1': 0, '1': 0 };
  sc.motifs.slice().sort((a, b) => a.pl.y - b.pl.y).forEach(mo => {
    const m = mo.m, w = n(m.w), hh = n(m.h), x = mo.pl.x, y0 = mo.pl.y, y1 = y0 + hh;
    const xl = x - w / 2, xr = x + w / 2;
    const side = x > 0.05 ? 1 : -1;
    const k = stack[side]++;
    const off = (f * 1.9 + k * f * 2.6) / s;   // cm
    const xd = side > 0 ? xr + off : xl - off;
    const edge = side > 0 ? xr : xl;
    // Kragen → Oberkante, Oberkante → Unterkante (Kette)
    ext(X(0) + side * f * 0.5, Y(0), X(xd) + side * f * 0.4, Y(0));
    ext(X(edge), Y(y0), X(xd) + side * f * 0.4, Y(y0));
    ext(X(edge), Y(y1), X(xd) + side * f * 0.4, Y(y1));
    dim(X(xd), Y(0), X(xd), Y(y0), N1.format(mkR1(y0)));
    dim(X(xd), Y(y0), X(xd), Y(y1), N1.format(mkR1(hh)));
    // Breite oben
    const yw = y0 - (f * 1.5) / s;
    ext(X(xl), Y(y0), X(xl), Y(yw) - f * 0.4);
    ext(X(xr), Y(y0), X(xr), Y(yw) - f * 0.4);
    dim(X(xl), Y(yw), X(xr), Y(yw), N1.format(mkR1(w)));
    // Mittellinie → Motivmitte (unten)
    if (Math.abs(x) >= 0.05) {
      const yc = y1 + (f * 1.6) / s;
      ext(X(x), Y(y1), X(x), Y(yc) + f * 0.4);
      dim(X(0), Y(yc), X(x), Y(yc), N1.format(Math.abs(mkR1(x))));
    }
  });
  ctx.restore();
}

// ======================= Bild einer Ansicht (für PDF und Vorschau) =======================
// Rendert beide Ansichten einer Position im gleichen Maßstab.
// opt: {w, h (px), dims, numbers, bg: 'white' | 'studio', views: ['front','back'], quality}
async function mkRenderViews(p, opt) {
  opt = opt || {};
  const W = Math.round(opt.w || 1000), H = Math.round(opt.h || W * 1.2);
  const views = opt.views || ['front', 'back'];
  const scenes = {};
  for (const v of views) scenes[v] = await mkPrepare(p, v, { size: opt.size });
  // gemeinsamer Ausschnitt
  let box = null;
  views.forEach(v => { const b = mkSceneBox(scenes[v]); box = box ? mkUnion(box, b) : b; });
  const mx = opt.dims ? 3 : 1.5, mt = opt.dims ? 3 : 1.5, mb = opt.dims ? 4 : 1.5;
  box = { x: box.x - mx, y: box.y - mt, w: box.w + 2 * mx, h: box.h + mt + mb };
  const pad = W * 0.04;
  const s = Math.min((W - 2 * pad) / box.w, (H - 2 * pad) / box.h);
  const ox = W / 2 - s * (box.x + box.w / 2), oy = H / 2 - s * (box.y + box.h / 2);
  const out = { w: W, h: H, scale: s };
  for (const v of views) {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    if (opt.bg === 'studio') {
      const g = ctx.createRadialGradient(W / 2, H * 0.38, W * 0.05, W / 2, H * 0.5, W * 0.85);
      g.addColorStop(0, '#fbfbfc'); g.addColorStop(1, '#e6e9ee');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    } else { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H); }
    mkDrawScene(ctx, scenes[v], { scale: s, ox, oy, u: W / 420, font: W * 0.034, dims: !!opt.dims, numbers: !!opt.numbers, paper: true, shadow: opt.bg === 'studio', detail: true });
    let url = null;
    try { url = c.toDataURL('image/jpeg', opt.quality || 0.92); } catch (e) { console.error(e); }
    out[v] = url;
    out['n_' + v] = scenes[v].motifs.length;
  }
  return out;
}

// Altes Mockup-Canvas (3:4) – weiter verfügbar. side: 'front' | 'back'. Gibt die Zahl der Motive auf dieser Seite zurück (Promise).
async function drawMockup(canvas, p, side) {
  side = side === 'back' ? 'back' : 'front';
  const ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H);
  if (!mkIsTextil(p) || !mkHasGar()) return 0;
  const sc = await mkPrepare(p, side);
  ctx.fillStyle = '#f3f4f6'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#6b7280'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '600 ' + Math.round(H * 0.03) + 'px ' + MK_FONT;
  ctx.fillText(MK_VIEWS[side], W / 2, H * 0.05);
  const b = mkSceneBox(sc), top = H * 0.09, pad = W * 0.05;
  const s = Math.min((W - 2 * pad) / (b.w + 2), (H - top - H * 0.03) / (b.h + 2));
  const ox = W / 2 - s * (b.x + b.w / 2), oy = top + (H - top - H * 0.03) / 2 - s * (b.y + b.h / 2);
  mkDrawScene(ctx, sc, { scale: s, ox, oy, u: W / 420, font: W * 0.03, paper: true });
  return sc.motifs.length;
}
// Mockup als Bild (JPEG-Data-URL, 3:4). null, wenn auf der Seite kein Motiv ist.
async function mockupDataUrl(p, side, px) {
  if (!mkIsTextil(p)) return null;
  px = Math.round(n(px) || 600);
  const c = document.createElement('canvas');
  c.width = px; c.height = Math.round(px * 4 / 3);
  const cnt = await drawMockup(c, p, side);
  if (!cnt) return null;
  try { return c.toDataURL('image/jpeg', 0.9); } catch (e) { return null; }
}
// Mockups (ohne Bemaßung) für alle Textil-Positionen mit Druckstellen: [{posId, name, sub, front, back, w, h}]
async function mockupsFor(positionen, px) {
  const out = [];
  if (!mkHasGar()) return out;
  for (const p of positionen) {
    if (!mkIsTextil(p) || !validMotifs(p).length || !(wholeQty(p) > 0)) continue;
    const r = await mkRenderViews(p, { w: px || 900, h: (px || 900) * 1.05, bg: 'studio', quality: 0.9 });
    const front = r.n_front ? r.front : null, back = r.n_back ? r.back : null;
    if (front || back) out.push({ posId: p.id, name: p.name || 'Textil', sub: [p.farbe, mkGarmentName(mkGarmentKey(p))].filter(Boolean).join(' · '), front, back, w: r.w, h: r.h });
  }
  return out;
}

// ======================= Motiv-Bild hochladen =======================
// Bild auf max. lange Seite verkleinern, als PNG (Transparenz bleibt)
function mkShrink(file, max) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = () => rej(new Error('Datei'));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => rej(new Error('Bild'));
      img.onload = () => {
        const w0 = img.naturalWidth, h0 = img.naturalHeight;
        if (!w0 || !h0) { rej(new Error('leer')); return; }
        const k = Math.min(1, max / Math.max(w0, h0)), c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w0 * k)); c.height = Math.max(1, Math.round(h0 * k));
        const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, c.width, c.height);
        res({ url: c.toDataURL('image/png'), ratio: Math.round(h0 / w0 * 10000) / 10000 });
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}
// Bild setzen. done() statt structural(), z. B. im Studio
function mkSetImage(p, m, f, done) {
  if (!/^image\/(png|jpeg|webp)$/.test(f.type) && !/\.(png|jpe?g|webp)$/i.test(f.name)) { toast('Bitte ein PNG, JPG oder WebP wählen.', true); return; }
  if (f.size > 4 * 1024 * 1024) toast('Das Bild ist größer als 4 MB. Es wird für die Vorschau verkleinert.', true);
  mkShrink(f, 500).then(r => {
    m.img = r.url; m.imgRatio = r.ratio;
    if (!(n(m.h) > 0) && n(m.w) > 0) m.h = Math.round(n(m.w) * r.ratio * 10) / 10;   // Höhe aus dem Seitenverhältnis
    if (done) done(); else structural();
  }).catch(() => toast('Das Bild konnte nicht gelesen werden.', true));
}

// Zeile unter jeder Druckstelle: Bild, Ort, Bild entfernen, im Studio platzieren
HOOKS.motifExtras.push((p, m) => {
  if (p.typ !== 'textil' && p.typ !== 'transfer') return null;
  const file = h('input', { type: 'file', class: 'sr', accept: 'image/png,image/jpeg,image/webp', tabindex: '-1', 'aria-hidden': 'true',
    onchange: e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) mkSetImage(p, m, f); } });
  const pick = m.img
    ? h('button', { class: 'mk-thumb', type: 'button', title: 'Motiv-Bild ändern', 'aria-label': 'Motiv-Bild ändern', onclick: () => file.click() }, [h('img', { src: m.img, alt: '' })])
    : h('button', { class: 'chip mk-add', type: 'button', title: 'Bild vom Motiv hochladen (PNG, JPG, WebP) – für Mockup und Datenblatt', onclick: () => file.click() }, [icon('upload'), 'Motiv-Bild']);
  const ort = h('select', { class: 'mk-ort', 'aria-label': 'Ort der Druckstelle', title: 'Wo sitzt der Druck? (für Mockup und Datenblatt)',
    onchange: e => {
      m.ort = e.target.value;
      // Neuer Ort = Standardplatzierung für diesen Ort
      delete m.x; delete m.y; delete m.view;
      changed();
    } });
  Object.keys(ORTE).forEach(k => ort.appendChild(h('option', { value: k, text: ORTE[k] })));
  ort.value = ORTE[m.ort] ? m.ort : guessOrt(m.name);
  const placed = mkNum(m.x) && mkNum(m.y);
  return h('div', { class: 'mk-row' }, [
    pick, file,
    h('label', { class: 'mk-l' }, ['Ort', ort]),
    p.typ === 'textil' ? h('button', { class: 'chip mk-studio', type: 'button', title: 'Im Mockup-Studio verschieben, Abstände und Größe einstellen',
      onclick: () => { if (typeof openStudio === 'function') openStudio(p.id, m.id); } }, [icon('shirt'), placed ? 'Im Studio: ' + N1.format(mkR1(m.y)) + ' cm unter Kragen' : 'Im Studio platzieren']) : null,
    m.img ? h('button', { class: 'link mk-del', type: 'button', onclick: () => { delete m.img; delete m.imgRatio; structural(); } }, ['Bild entfernen']) : null
  ]);
});

// ======================= Studio öffnen =======================
function openMockup(posId) { if (typeof openStudio === 'function') openStudio(posId); }
(function () { const b = $('btnMockup'); if (b) b.addEventListener('click', () => openMockup()); })();

// Link „Mockup ansehen“ am Ende jeder Textil-Position
HOOKS.posExtras.push(p => {
  if (!mkIsTextil(p)) return null;
  return h('div', { class: 'mk-poslink' }, [h('button', { class: 'link', type: 'button', onclick: () => openMockup(p.id) }, [icon('shirt'), 'Mockup ansehen / im Studio bearbeiten'])]);
});

// ======================= PDFs =======================
// Bilder für Angebot (falls eingestellt) und Datenblatt, 2–3-fache Auflösung
HOOKS.docExtras.push(async (kind, J, R) => {
  if (!mkHasGar()) return null;
  if (kind === 'angebot') {
    if (S.mockupImAngebot === false) return null;
    const list = await mockupsFor(J.positionen, 900);   // Angebot: alle Positionen (auch aus anderen Varianten)
    return list.length ? { mockups: list } : null;
  }
  if (kind !== 'freigabe') return null;
  const sheets = [];
  for (const r of R.rows) {
    const p = r.p;
    if (!mkIsTextil(p)) continue;
    const key = mkGarmentKey(p);
    const img = await mkRenderViews(p, { w: 1000, h: 1120, dims: true, numbers: true, bg: 'white', quality: 0.92 });
    sheets.push({ posId: p.id, key, size: mkRefSize(p, key), color: mkColorOf(p), front: img.front, back: img.back, w: img.w, h: img.h, nFront: img.n_front, nBack: img.n_back,
      photo: !!(mkPhotoRec(p, 'front') || mkPhotoRec(p, 'back')) });
  }
  return { mkSheets: sheets };
});

// Kreis mit Nummer im PDF
function mkPdfNr(doc, x, y, nr, r) {
  r = r || 2.4;
  doc.setFillColor(30, 41, 59); doc.circle(x, y, r, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(r * 3.1); doc.setTextColor(255);
  doc.text(String(nr), x, y + r * 0.36, { align: 'center' });
  doc.setTextColor(0);
}
function mkRgbArr(hex) { const x = String(hex).replace('#', ''); return [0, 2, 4].map(i => parseInt(x.slice(i, i + 2), 16) || 0); }

// Zusatzseite im Angebot: „Ansicht Ihrer Textilien“
PDF_EXTRA_PAGES.push((F, kind, J, R, S, extra) => {
  const list = extra && extra.mockups;
  if (kind !== 'angebot' || !list || !list.length) return;
  const { doc, L, W, setF } = F;
  F.onNewPage = null;
  F.newPage();
  setF('bold', 14); F.text('Ansicht Ihrer Textilien'); F.y += 5.5;
  setF('normal', 8.5, 100); F.text('Darstellung ähnlich. Farben und Positionen können leicht abweichen; die genauen Maße erhalten Sie mit der Druckfreigabe.'); F.y += 8;
  setF();
  list.forEach(mk => {
    const imgs = [['Vorderseite', mk.front], ['Rückseite', mk.back]].filter(x => x[1]);
    const iw = imgs.length > 1 ? 80 : 92, ih = iw * (mk.h / mk.w), gap = 6;
    F.need(ih + 20);
    setF('bold', 10.5); F.text(mk.name);
    if (mk.sub) { setF('normal', 8.5, 100); F.text(mk.sub, L + W, { align: 'right' }); }
    F.y += 3;
    const tot = imgs.length * iw + (imgs.length - 1) * gap;
    let x = L + (W - tot) / 2;
    imgs.forEach(([lab, src]) => {
      try { doc.addImage(src, 'JPEG', x, F.y, iw, ih); } catch (e) { console.error(e); }
      doc.setDrawColor(225); doc.setLineWidth(0.2); doc.roundedRect(x, F.y, iw, ih, 2, 2);
      setF('normal', 8, 110); doc.text(pdfTxt(lab), x + iw / 2, F.y + ih + 4.2, { align: 'center' });
      x += iw + gap;
    });
    F.y += ih + 12; setF();
  });
});

// ======================= Dokument „Druckfreigabe / Datenblatt“ =======================
DOC_BUILDERS.freigabe = (J, R, S, nr, extra) => {
  extra = extra || {};
  const F = pdfFrame('Druckfreigabe', J, S, {
    info: [['Datum', fmtDate(todayIso())], ['Angebot', J.angebotNr], ['Auftrag', J.abNr], ['Kunden-Nr.', J.kundeNr]],
    betreff: 'Druckfreigabe / Datenblatt' + (J.name ? ': ' + J.name : '')
  });
  const { doc, L, Rr, W, setF } = F;
  const sheets = extra.mkSheets || [];
  const rows = R.rows.filter(r => r.typ === 'textil' || r.typ === 'transfer');
  pdfIntro(F, 'anbei erhalten Sie das Datenblatt zu Ihrem Auftrag. Bitte prüfen Sie Motive, Schreibweisen, Größen und Positionen der Drucke sowie die Textilfarben sorgfältig. '
    + 'Die Produktion startet erst, wenn Ihre Freigabe vorliegt. Bitte senden Sie uns die letzte Seite unterschrieben zurück (Scan oder Foto genügt).');

  // ---------- Übersicht ----------
  F.need(20);
  setF('bold', 10.5); F.text('Übersicht'); F.y += 5.5;
  const oc = [L, L + 9, L + 74, L + 118, L + 140];
  setF('bold', 7.5, 90);
  ['Nr.', 'Artikel', 'Farbe', 'Menge', 'Druckstellen'].forEach((t, k) => doc.text(pdfTxt(t), oc[k], F.y));
  F.y += 1.8; doc.setDrawColor(190); doc.setLineWidth(0.2); doc.line(L, F.y, Rr, F.y); F.y += 4.4;
  rows.forEach((r, i) => {
    const p = r.p, textil = r.typ === 'textil';
    const gName = textil ? mkGarmentName(mkGarmentKey(p)) : '';
    const art = (p.name || POS_TYPES[r.typ].short) + (gName && gName.toLowerCase() !== String(p.name || '').toLowerCase() ? ' (' + gName + ')' : '');
    const ds = doc.splitTextToSize(pdfTxt(validMotifs(p).map(m => m.name || 'Motiv').join(', ') || '–'), Rr - oc[4]).slice(0, 3);
    const step = Math.max(5.4, ds.length * 3.8 + 1.6);
    F.need(step + 2);
    setF('bold', 9); doc.text(String(i + 1), oc[0], F.y);
    setF('normal', 9);
    doc.text(doc.splitTextToSize(pdfTxt(art), 62)[0], oc[1], F.y);
    if (textil) {
      const hex = mkColorOf(p);
      doc.setFillColor.apply(doc, mkRgbArr(hex)); doc.setDrawColor(150); doc.rect(oc[2], F.y - 2.9, 3.4, 3.4, 'FD');
      doc.text(doc.splitTextToSize(pdfTxt(p.farbe || '–'), 38)[0], oc[2] + 5, F.y);
    } else doc.text('–', oc[2], F.y);
    doc.text(pdfTxt(r.q + ' ' + (textil ? 'Stk.' : 'Sätze')), oc[3], F.y);
    doc.text(ds, oc[4], F.y, { lineHeightFactor: 1.15 });
    F.y += step; doc.setDrawColor(230); doc.line(L, F.y - 3.8, Rr, F.y - 3.8);
  });
  F.y += 3;
  setF('normal', 8.5, 90);
  F.para('Auf den folgenden Seiten finden Sie jede Textil-Position mit Vorder- und Rückansicht, allen Maßen und der Liste der Druckstellen. Die letzte Seite ist Ihre Freigabe.', 4.2);
  setF();

  // ---------- Tabelle der Druckstellen ----------
  // Spalten: Nr, Bezeichnung, Ort, B × H, Abst. Kragen, Abst. Mitte, Verfahren, Indiv., Motiv
  const tc = { nr: L, bez: L + 8, ort: L + 38, bh: L + 60, kr: L + 79, mi: L + 94, ver: L + 116, ind: L + 137, mot: Rr };
  const tableHead = () => {
    setF('bold', 7.2, 90);
    const y = F.y;
    doc.text('Nr.', tc.nr, y); doc.text('Bezeichnung', tc.bez, y); doc.text('Ort', tc.ort, y);
    doc.text(pdfTxt('Größe B × H'), tc.bh, y); doc.text('Abstand', tc.kr, y - 3); doc.text('Kragen', tc.kr, y);
    doc.text('Abstand Mitte', tc.mi, y - 3); doc.text(pdfTxt('(vom Träger)'), tc.mi, y); doc.text('Verfahren', tc.ver, y);
    doc.text('Indiv.', tc.ind, y); doc.text('Motiv', tc.mot, y, { align: 'right' });
    F.y += 1.8; doc.setDrawColor(150); doc.setLineWidth(0.25); doc.line(L, F.y, Rr, F.y); F.y += 4.6;
    setF();
  };
  const motifTable = (p, key, size, textil) => {
    const mots = validMotifs(p);
    if (!mots.length) { setF('normal', 9, 120); F.text('Noch keine Druckstelle mit Maßen.', L + 2); F.y += 6; setF(); return; }
    F.need(22);
    tableHead();
    F.onNewPage = tableHead;
    mots.forEach((m, i) => {
      const pl = textil ? mkPlace(p, m, key, size) : null;
      let tw = 0, th = 0;
      if (m.img) { const ra = n(m.imgRatio) || 1; th = Math.min(11, 18 * ra); tw = th / ra; if (tw > 18) { tw = 18; th = tw * ra; } }
      setF('normal', 8.4);
      const bez = doc.splitTextToSize(pdfTxt(m.name || 'Motiv'), 29).slice(0, 2);
      const step = Math.max(8.4, th + 3, bez.length * 3.6 + 4.4);
      F.need(step + 1);
      const y = F.y;
      mkPdfNr(doc, tc.nr + 2.6, y - 1.2, i + 1, 2.5);
      setF('bold', 8.4); doc.text(bez, tc.bez, y);
      setF('normal', 8.4);
      doc.text(doc.splitTextToSize(pdfTxt(ORTE[m.ort] || '–'), 21)[0], tc.ort, y);
      if (pl) { setF('normal', 7, 110); doc.text(pdfTxt(MK_VIEWS[pl.view]), tc.ort, y + 3.4); setF('normal', 8.4); }
      doc.text(pdfTxt(N1.format(n(m.w)) + ' × ' + N1.format(n(m.h))), tc.bh, y);
      doc.text(pl ? pdfTxt(N1.format(mkR1(pl.y))) : '–', tc.kr, y);
      doc.text(pl ? pdfTxt(mkMitteTxt(pl.view, pl.x)) : '–', tc.mi, y);
      doc.text('DTF-Transfer', tc.ver, y);
      doc.text(m.pers ? 'ja' : 'nein', tc.ind, y);
      if (m.pers) { setF('normal', 6.6, 110); doc.text('Namen/Nr.', tc.ind, y + 3.2); setF('normal', 8.4); }
      if (m.img) {
        // Karomuster als Hintergrund (Transparenz sichtbar)
        try { doc.addImage(m.img, 'PNG', tc.mot - tw, y - 3.6, tw, th); } catch (e) { console.error(e); }
        doc.setDrawColor(215); doc.setLineWidth(0.15); doc.rect(tc.mot - tw, y - 3.6, tw, th);
      } else { setF('normal', 8.4, 150); doc.text('kein Bild', tc.mot, y, { align: 'right' }); setF(); }
      F.y += step;
      doc.setDrawColor(228); doc.setLineWidth(0.2); doc.line(L, F.y - 4.6, Rr, F.y - 4.6);
    });
    F.onNewPage = null;
  };
  const sizeBoxes = (p, ref) => {
    if (p.ohneGroessen) return;
    const sz = SIZES.filter(s => n(p.groessen[s]) > 0);
    if (!sz.length) return;
    setF('normal', 7, 100); doc.text(pdfTxt('GRÖSSEN'), L, F.y); F.y += 2;
    sz.forEach((s, k) => {
      const x = L + k * 17, isRef = s === ref;
      if (isRef) { doc.setFillColor(232, 240, 254); doc.setDrawColor(40, 90, 200); doc.setLineWidth(0.45); doc.rect(x, F.y, 15, 10, 'FD'); }
      else { doc.setDrawColor(190); doc.setLineWidth(0.2); doc.rect(x, F.y, 15, 10); }
      setF('normal', 7.2, 100); doc.text(s, x + 7.5, F.y + 3.4, { align: 'center' });
      setF('bold', 10); doc.text(String(n(p.groessen[s])), x + 7.5, F.y + 8.3, { align: 'center' });
    });
    if (sz.includes(ref)) { setF('normal', 7, 60); doc.text(pdfTxt('Blau = Bezugsgröße der Maße'), L + sz.length * 17 + 2, F.y + 6); }
    F.y += 15; setF();
  };

  // ---------- Seiten je Position ----------
  let tIdx = 0;
  rows.forEach((r, i) => {
    const p = r.p, textil = r.typ === 'textil';
    if (textil) {
      const sh = sheets.find(x => x.posId === p.id);
      const key = sh ? sh.key : mkGarmentKey(p), size = sh ? sh.size : mkRefSize(p, key), hex = sh ? sh.color : mkColorOf(p);
      F.onNewPage = null; F.newPage();
      // Kopf
      doc.setFillColor(242, 244, 248); doc.rect(L, F.y - 5, W, 8.5, 'F');
      doc.setFillColor(0, 180, 240); doc.rect(L, F.y - 5, 1.2, 8.5, 'F');
      setF('bold', 11.5); F.text((i + 1) + '. ' + (p.name || 'Textil'), L + 4);
      setF('normal', 8, 90); F.text('Textil + Druck · Datenblatt', Rr - 2, { align: 'right' });
      F.y += 10;
      // Eckdaten
      const cols = [[L, 'KLEIDUNGSSTÜCK', mkGarmentName(key)], [L + 62, 'FARBE', p.farbe || 'nach Absprache'], [L + 122, 'MENGE', r.q + ' Stück']];
      cols.forEach(([x, lab, val], k) => {
        setF('normal', 7, 100); doc.text(pdfTxt(lab), x, F.y);
        setF('bold', 10);
        if (k === 1) {
          doc.setFillColor.apply(doc, mkRgbArr(hex)); doc.setDrawColor(120); doc.setLineWidth(0.2); doc.rect(x, F.y + 1.6, 5, 5, 'FD');
          doc.text(doc.splitTextToSize(pdfTxt(val), 52)[0], x + 7, F.y + 5.6);
        } else doc.text(doc.splitTextToSize(pdfTxt(val), 56)[0], x, F.y + 5.6);
      });
      F.y += 12;
      sizeBoxes(p, size);
      // Ansichten
      if (sh && (sh.front || sh.back)) {
        const iw = 83, gap = W - 2 * iw, ih = iw * (sh.h / sh.w);
        F.need(ih + 8);
        setF('bold', 8.5, 60);
        doc.text('Vorderseite', L + iw / 2, F.y, { align: 'center' }); doc.text(pdfTxt('Rückseite'), L + iw + gap + iw / 2, F.y, { align: 'center' });
        F.y += 2;
        [[sh.front, L], [sh.back, L + iw + gap]].forEach(([src, x]) => {
          if (src) { try { doc.addImage(src, 'JPEG', x, F.y, iw, ih); } catch (e) { console.error(e); } }
          doc.setDrawColor(210); doc.setLineWidth(0.2); doc.rect(x, F.y, iw, ih);
        });
        F.y += ih + 3;
        setF('normal', 7, 110);
        F.text('Maße in cm · Zahlen im Kreis = Nr. der Druckstelle · ' + (sh.photo ? 'Ansicht mit Produktfoto' : 'Schematische Darstellung des Kleidungsstücks'), L);
        F.y += 6; setF();
      } else { setF('normal', 9, 120); F.text('Keine Ansicht verfügbar.', L); F.y += 6; setF(); }
      // Druckstellen
      F.need(16);
      setF('bold', 10); F.text('Druckstellen'); F.y += 6.5;
      motifTable(p, key, size, true);
      // Hinweise
      F.y += 1;
      const notes = [
        'Alle Maße in cm, Toleranz ±0,5 cm. Abstand Kragen: ' + (key === 'bag' || key === 'apron' ? 'von der Mitte der Oberkante' : 'vom Kragenpunkt (Mittellinie in Höhe der höchsten Schulterpunkte, wo Kragen und Schulternaht sich treffen)') + ' bis zur Oberkante des Motivs. Abstand Mitte: von der Mittellinie bis zur Motivmitte, links/rechts vom Träger aus gesehen.',
        size === 'one' || p.ohneGroessen ? 'Die Motivgröße ist für alle Teile gleich.' : 'Die Positionen beziehen sich auf Größe ' + size + '. Bei anderen Größen bleibt der Abstand zum Kragen gleich, die Motivgröße ändert sich nicht.',
        'Farbhinweis: Textil- und Motivfarben werden am Bildschirm und im Ausdruck nur ähnlich dargestellt. Maßgeblich sind die Textilfarbe laut Hersteller' + (p.farbe ? ' („' + p.farbe + '“)' : '') + ' und Ihre Druckdaten.'
      ];
      setF('normal', 7.8, 70);
      notes.forEach(t => { doc.splitTextToSize(pdfTxt(t), W).forEach(l => { F.need(4.5); doc.text(l, L, F.y); F.y += 3.6; }); F.y += 0.8; });
      setF();
    } else {
      // Transfers (Kunde presst selbst): nur Tabelle
      if (!tIdx++) { F.onNewPage = null; F.need(60); }
      F.need(30); F.y += 4;
      doc.setFillColor(242, 244, 248); doc.rect(L, F.y - 5, W, 8.5, 'F');
      setF('bold', 11); F.text((i + 1) + '. ' + (p.name || 'Transfers') + '  (' + r.q + ' Sätze)', L + 3);
      setF('normal', 8, 90); F.text('Nur Transfers', Rr - 2, { align: 'right' });
      F.y += 9; setF();
      motifTable(p, null, null, false);
      F.y += 2;
    }
  });

  // ---------- Freigabe ----------
  F.onNewPage = null;
  if (F.y > 175) F.newPage(); else F.y += 6;
  doc.setDrawColor(40); doc.setLineWidth(0.3); doc.rect(L, F.y - 5, W, 92);
  F.y += 2;
  setF('bold', 12); F.text('Ihre Freigabe', L + 5);
  setF('normal', 8, 90);
  F.text([J.name, J.angebotNr ? 'Angebot ' + J.angebotNr : '', J.abNr ? 'Auftrag ' + J.abNr : '', J.kunde].filter(Boolean).join(' · ').slice(0, 90), Rr - 5, { align: 'right' });
  F.y += 6.5;
  setF('normal', 9.2);
  doc.splitTextToSize(pdfTxt('Mit Ihrer Unterschrift bestätigen Sie, dass Motive, Texte, Größen, Positionen und Textilfarben wie in diesem Datenblatt beschrieben produziert werden sollen.'), W - 10)
    .forEach(l => { doc.text(l, L + 5, F.y); F.y += 4.4; });
  F.y += 5;
  const box = (x, label) => { doc.setDrawColor(40); doc.setLineWidth(0.35); doc.rect(x, F.y - 4, 4.8, 4.8); setF('normal', 9.5); doc.text(pdfTxt(label), x + 7.5, F.y); };
  box(L + 5, 'Freigegeben'); box(L + 60, 'Freigegeben mit Änderungen (siehe unten)');
  F.y += 10;
  setF('normal', 8.5, 90); doc.text(pdfTxt('Änderungen:'), L + 5, F.y); F.y += 8;
  doc.setDrawColor(170); doc.setLineWidth(0.2);
  for (let k = 0; k < 4; k++) { doc.line(L + 5, F.y, Rr - 5, F.y); F.y += 8; }
  F.y += 8;
  doc.setDrawColor(90); doc.setLineWidth(0.25); doc.line(L + 5, F.y, L + 70, F.y); doc.line(L + 85, F.y, Rr - 5, F.y); F.y += 4;
  setF('normal', 8, 90); doc.text('Ort, Datum', L + 5, F.y); doc.text('Unterschrift, Name in Druckbuchstaben', L + 85, F.y); setF();
  F.y += 8;

  PDF_EXTRA_PAGES.forEach(fn => { try { fn(F, 'freigabe', J, R, S, extra); } catch (e) { console.error(e); } });
  return F.finish();
};
