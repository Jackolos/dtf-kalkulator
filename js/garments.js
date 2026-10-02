// Kleidungs-Bibliothek für Mockups (Präfix gar / GAR_)
// Vektorzeichnungen (Canvas 2D, Path2D) von Textilien in beliebiger Farbe, mit Maßtabellen und Druckbereichen.
//
// KOORDINATEN: alles in Zentimetern. Jede Ansicht hat ihr eigenes Garment-System:
//   Ursprung (0,0) = Kragenpunkt auf der Mittellinie in Höhe des höchsten Schulterpunkts (HPS),
//   x nach rechts (aus Sicht des Betrachters), y nach unten.
//   Bei Tasche und Schürze ist (0,0) die Mitte der Oberkante.
// Motiv-Platzierung: x = Abstand der MOTIVMITTE von der Mittellinie (+ = rechts im Bild),
//   y = Abstand der MOTIV-OBERKANTE vom Kragenpunkt. Ärmel-Drucke liegen im System der Vorderansicht.
//   „Brust links“ = links vom Träger = in der Vorderansicht RECHTS im Bild (x positiv), ebenso „Ärmel links“.
//
// Öffentlich: GARMENTS, GARMENT_COLORS, colorForName(), garmentForPosition(), garmentSizeForPosition(),
//   garmentGeometry(), drawGarment(), drawPrint(), garLoadImage(), defaultPlacement(), checkPlacement(),
//   drawTemplatePhoto(). Alles andere ist intern (Präfix gar / GAR_).

const GAR_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
const GAR_SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL'];

// Maßtabelle erzeugen: Werte für M, je Größe +dw / +dl
function garSizeTable(wM, lM, dw, dl, last) {
  const t = {}, iLast = GAR_SIZE_ORDER.indexOf(last || '5XL');
  for (let i = 0; i <= iLast; i++) t[GAR_SIZE_ORDER[i]] = { w: wM + (i - 2) * dw, l: lM + (i - 2) * dl };
  return t;
}

// ======================= Kleidungsstücke und Maße =======================
// w = halbe Brustweite: Breite flach gelegt, 2,5 cm unter dem Ärmelansatz (von Seite zu Seite)
// l = Länge ab höchstem Schulterpunkt (HPS) bis Saum
// Typische Werte, je Hersteller ±2 cm (angelehnt an gängige Basics wie Gildan, B&C, Fruit of the Loom, Stanley/Stella).
// zones: maximale Druckbereiche für die Standardgröße defSize (unten aus der Geometrie berechnet).
// Regel zum Skalieren: Breiten wachsen mit w, Höhen mit l, Abstände zu Kragen/Tasche/Bündchen bleiben gleich –
// garmentGeometry() liefert die Bereiche für jede Größe fertig umgerechnet.
const GARMENTS = {
  tshirt:       { name: 'T-Shirt Unisex',          kategorie: 'Shirts',   views: ['front', 'back'], sizes: garSizeTable(52, 72, 3, 2), defSize: 'L' },
  tshirt_damen: { name: 'T-Shirt Damen (tailliert)', kategorie: 'Shirts', views: ['front', 'back'], sizes: garSizeTable(46, 64, 3, 2, '3XL'), defSize: 'M' },
  longsleeve:   { name: 'Longsleeve',              kategorie: 'Shirts',   views: ['front', 'back'], sizes: garSizeTable(52, 73, 3, 2), defSize: 'L' },
  polo:         { name: 'Poloshirt',               kategorie: 'Shirts',   views: ['front', 'back'], sizes: garSizeTable(53, 72, 3, 2), defSize: 'L' },
  sweat:        { name: 'Sweatshirt (Rundhals)',   kategorie: 'Pullover', views: ['front', 'back'], sizes: garSizeTable(56, 70, 3, 2), defSize: 'L' },
  hoodie:       { name: 'Hoodie',                  kategorie: 'Pullover', views: ['front', 'back'], sizes: garSizeTable(56, 73, 3, 2), defSize: 'L' },
  zip_hoodie:   { name: 'Zip-Hoodie',              kategorie: 'Pullover', views: ['front', 'back'], sizes: garSizeTable(56, 73, 3, 2), defSize: 'L' },
  tank:         { name: 'Tanktop',                 kategorie: 'Shirts',   views: ['front', 'back'], sizes: garSizeTable(50, 72, 3, 2, '3XL'), defSize: 'L' },
  bag:          { name: 'Baumwolltasche 38 × 42 cm', kategorie: 'Taschen', views: ['front', 'back'], sizes: { one: { w: 38, l: 42 } }, defSize: 'one' },
  apron:        { name: 'Latzschürze',             kategorie: 'Schürzen', views: ['front'], sizes: { one: { w: 70, l: 86 } }, defSize: 'one' }
};

// Schnitt-Parameter (intern). nh = halbe Halsweite, fo = Tiefe vorderer Ausschnitt, rb = Breite Kragenbündchen,
// shK = Schulterpunkt (Anteil von w), sy = Schulterabfall, ahK = Armlochtiefe (Anteil von w), sa/sl/so = Ärmelwinkel/-länge/-öffnung
const GAR_TEE = { type: 'top', topC: 1.0, neck: 'crew', nh: 8.6, fo: 7.4, rb: 1.8, shK: 0.452, sy: 4.2, ahK: 0.345, ahIn: 1.6,
  sleeve: 'short', sa: 19, sl: 21.5, so: 19.5, slHem: 2.2, hemC: 0.55, flare: 0.35, waist: 0 };
const GAR_SWEAT = { type: 'top', topC: 1.0, neck: 'crew', nh: 9.2, fo: 7.8, rb: 2.6, shK: 0.525, sy: 6.2, ahK: 0.335, ahIn: 0.6,
  sleeve: 'long', sa: 66, sl: 56, so: 10.5, cuff: 6.5, band: 6.5, bandIn: 1.8, hemC: 0.25, flare: 0, waist: 0 };
const GAR_STYLE = {
  tshirt: GAR_TEE,
  tshirt_damen: Object.assign({}, GAR_TEE, { topC: 1.3, nh: 9.0, fo: 8.4, rb: 1.5, shK: 0.42, sy: 4.0, ahK: 0.36, ahIn: 1.4,
    sa: 21, sl: 16.5, so: 15.5, slHem: 2.0, hemC: 0.9, flare: 0.8, waist: 2.4 }),
  longsleeve: Object.assign({}, GAR_TEE, { sleeve: 'long', sa: 64, sl: 60, so: 10, cuff: 4.5 }),
  polo: Object.assign({}, GAR_TEE, { neck: 'polo', nh: 8.3, shK: 0.455, sy: 4.3, ahK: 0.35, sa: 20, sl: 21, so: 18.5, cuffRib: 2.4,
    hemC: 0.4, flare: 0.4, vents: 6, placket: { w: 3.2, top: 7.8, len: 13.5, buttons: 2 } }),
  sweat: GAR_SWEAT,
  hoodie: Object.assign({}, GAR_SWEAT, { neck: 'hood', nh: 9.6, hood: { hT: 24.5, hw: 15.5, ow: 8.4, ring: 3.2 }, pocket: 'kangaroo', cords: true }),
  zip_hoodie: Object.assign({}, GAR_SWEAT, { neck: 'hood', nh: 9.6, hood: { hT: 24.5, hw: 15.5, ow: 8.4, ring: 3.2 }, pocket: 'split', cords: true, zip: true }),
  tank: { type: 'top', topC: 3.0, neck: 'tank', nh: 10.2, fo: 13.5, rb: 1.2, strap: 6.2, ay0: 23.5, sleeve: 'none', hemC: 0.55, flare: 0.5, waist: 0 },
  bag: { type: 'bag' },
  apron: { type: 'apron' }
};

const GAR_ZONE_LABEL = { front: 'Front', back: 'Rücken', brustL: 'Brust links', brustR: 'Brust rechts', aermelL: 'Ärmel links',
  aermelR: 'Ärmel rechts', nacken: 'Nacken', bauch: 'Bauch' };
const GAR_SEAM_LABEL = {
  kragen: { zu: 'zum Kragen', ueber: 'über dem Kragen' },
  kapuze: { zu: 'zum Kapuzenansatz', ueber: 'über dem Kapuzenansatz' },
  schulter: { zu: 'zur Schulternaht', ueber: 'über der Schulternaht' },
  aermel: { zu: 'zur Ärmelnaht', ueber: 'über der Ärmelnaht' },
  saum: { zu: 'zum Saum', ueber: 'über dem Saum' },
  buendchen: { zu: 'zum Bündchen', ueber: 'über dem Bündchen' },
  seite: { zu: 'zur Seitenkante', ueber: 'über der Seitenkante' },
  tasche: { zu: 'zur Tasche', ueber: 'über der Tasche' },
  reissverschluss: { zu: 'zum Reißverschluss', ueber: 'über dem Reißverschluss' },
  knopfleiste: { zu: 'zur Knopfleiste', ueber: 'über der Knopfleiste' },
  rand: { zu: 'zum Rand', ueber: 'über dem Rand' }
};

// ======================= Farben =======================
// Übliche Textilfarben (Richtwerte, angelehnt an gängige Farbkarten)
const GARMENT_COLORS = [
  { name: 'Weiß', hex: '#f7f7f5', dunkel: false },
  { name: 'Natur', hex: '#efe7d6', dunkel: false },
  { name: 'Sand', hex: '#d9c8a6', dunkel: false },
  { name: 'Khaki', hex: '#b3a57c', dunkel: false },
  { name: 'Heather Grey', hex: '#b8babd', dunkel: false, meliert: true },
  { name: 'Dunkelgrau', hex: '#3e4146', dunkel: true },
  { name: 'Schwarz', hex: '#1c1d20', dunkel: true },
  { name: 'Navy', hex: '#1d2a44', dunkel: true },
  { name: 'Royal', hex: '#2549a8', dunkel: true },
  { name: 'Hellblau', hex: '#9dc4e4', dunkel: false },
  { name: 'Türkis', hex: '#14a3a6', dunkel: false },
  { name: 'Mint', hex: '#a9dcc7', dunkel: false },
  { name: 'Kelly-Grün', hex: '#1d9a4c', dunkel: true },
  { name: 'Flaschengrün', hex: '#1e4a34', dunkel: true },
  { name: 'Oliv', hex: '#5d5c39', dunkel: true },
  { name: 'Gelb', hex: '#f6cf1f', dunkel: false },
  { name: 'Orange', hex: '#ee7324', dunkel: false },
  { name: 'Rot', hex: '#c42029', dunkel: true },
  { name: 'Bordeaux', hex: '#6b1c2b', dunkel: true },
  { name: 'Burgund', hex: '#55182a', dunkel: true },
  { name: 'Pink', hex: '#ec82b0', dunkel: false },
  { name: 'Rosa', hex: '#f4c6d5', dunkel: false },
  { name: 'Lila', hex: '#5b3a8f', dunkel: true },
  { name: 'Braun', hex: '#5a3d2b', dunkel: true }
];
// Deutsche (und englische) Farbnamen → Hex. Reihenfolge wichtig: Spezielles vor Allgemeinem.
const GAR_COLOR_RE = [
  [/(dunkel|dark|anthrazit).*(meliert|heather)|dark heather|graphite heather/, '#55575c'],
  [/heather|meliert|melange|sport ?gr[ae]y|ash/, '#b8babd'],
  [/bordeaux|weinrot|wine/, '#6b1c2b'],
  [/burgund|maroon/, '#55182a'],
  [/flaschengr(ü|ue)n|bottle|dunkelgr(ü|ue)n|forest|tannengr/, '#1e4a34'],
  [/kelly|grasgr(ü|ue)n|irish|apfelgr/, '#1d9a4c'],
  [/hellgr(ü|ue)n|mint|pastellgr|lime/, '#a9dcc7'],
  [/oliv|military|army/, '#5d5c39'],
  [/khaki/, '#b3a57c'],
  [/t(ü|ue)rkis|turquoise|petrol|aqua|jade/, '#14a3a6'],
  [/navy|marine|dunkelblau|dark blue|french navy/, '#1d2a44'],
  [/hellblau|himmelblau|light blue|babyblau|sky|eisblau/, '#9dc4e4'],
  [/royal|k(ö|oe)nigsblau|kornblau|blau|blue|cobalt/, '#2549a8'],
  [/dunkelgrau|anthrazit|charcoal|graphit|dark gr[ae]y|steel/, '#3e4146'],
  [/hellgrau|silber|light gr[ae]y/, '#cfd1d4'],
  [/grau|gr[ae]y/, '#9a9da2'],
  [/schwarz|black/, '#1c1d20'],
  [/natur|ecru|creme|cream|off.?white|vanille|vintage white/, '#efe7d6'],
  [/wei(ß|ss)|white/, '#f7f7f5'],
  [/sand|beige|stone|camel/, '#d9c8a6'],
  [/orange/, '#ee7324'],
  [/gelb|yellow|gold|senf/, '#f6cf1f'],
  [/rosa|light pink|babyrosa|altrosa|rose/, '#f4c6d5'],
  [/pink|magenta|fuchsia|fuchsie/, '#ec82b0'],
  [/rot|red|cherry|kirsch/, '#c42029'],
  [/lila|violett|purple|flieder|lavendel|aubergine/, '#5b3a8f'],
  [/braun|brown|schoko|chocolate|kaffee/, '#5a3d2b'],
  [/gr(ü|ue)n|green/, '#1d9a4c']
];
function colorForName(farbe, dunkel) {
  const f = String(farbe || '').toLowerCase().trim();
  if (/^#[0-9a-f]{6}$/.test(f)) return f;
  if (/^#[0-9a-f]{3}$/.test(f)) return '#' + f.slice(1).split('').map(c => c + c).join('');
  if (f) for (const [re, hex] of GAR_COLOR_RE) if (re.test(f)) return hex;
  return dunkel ? '#3e4146' : '#cfd1d4';   // unbekannt: dunkelgrau bzw. hellgrau
}
const GAR_HEATHER = ['#b8babd', '#55575c'];

function garRgb(hex) {
  let x = String(hex || '#cccccc').replace('#', '').trim();
  if (x.length === 3) x = x.split('').map(c => c + c).join('');
  const r = [0, 2, 4].map(i => parseInt(x.slice(i, i + 2), 16));
  return r.some(isNaN) ? [204, 204, 204] : r;
}
function garMixRgb(a, b, t) { return [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * t)); }
function garRgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (+a).toFixed(3) + ')'; }
function garLumRgb(c) { return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255; }
function garLumHex(hex) { return garLumRgb(garRgb(hex)); }

// Palette für Licht und Schatten: helle Stoffe bekommen graue Schatten, dunkle Stoffe stärkere Lichter
function garPal(hex, heather) {
  const c = garRgb(hex), L = garLumRgb(c), dark = L < 0.4;
  const shC = garMixRgb(c, [0, 0, 0], 0.62), hiC = garMixRgb(c, [255, 255, 255], 0.8);
  const toHex = v => '#' + v.map(x => x.toString(16).padStart(2, '0')).join('');
  const base = toHex(c);
  return {
    hex: base, c, L, dark, heather: heather === undefined ? GAR_HEATHER.includes(base) : !!heather,
    hiA: 0.05 + 0.2 * Math.pow(1 - L, 1.4),
    shA: 0.11 + 0.2 * L,
    hi: a => garRgba(hiC, a), sh: a => garRgba(shC, a),
    edge: L < 0.22 ? 'rgba(0,0,0,0.6)' : garRgba(garMixRgb(c, [0, 0, 0], 0.42), 0.85),
    inside: garRgba(garMixRgb(c, [0, 0, 0], L > 0.75 ? 0.2 : L > 0.3 ? 0.36 : 0.3), 1),
    insideDeep: garRgba(garMixRgb(c, [0, 0, 0], L > 0.75 ? 0.36 : L > 0.3 ? 0.55 : 0.45), 1),
    rib: garRgba(garMixRgb(c, [0, 0, 0], 0.06), 1),
    stitch: dark ? 'rgba(255,255,255,' + (0.16 + 0.12 * (0.4 - L)) + ')' : 'rgba(0,0,0,0.26)',
    groove: dark ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.2)',
    grooveHi: dark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.5)',
    ribD: dark ? 'rgba(0,0,0,0.32)' : 'rgba(0,0,0,0.075)',
    ribL: dark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.35)'
  };
}

// ======================= kleine Helfer =======================
const garClamp = (v, a, b) => Math.max(a, Math.min(b, v));
const garLerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const garR1 = v => Math.round(v * 10) / 10;
const garNum = v => String(garR1(v)).replace('.', ',');
function garNorm(v) { const L = Math.hypot(v[0], v[1]) || 1; return [v[0] / L, v[1] / L]; }
function garNormSize(s) {
  const x = String(s === undefined || s === null ? '' : s).toUpperCase().replace(/\s+/g, '');
  const map = { '2XL': 'XXL', 'XXXL': '3XL', 'XXXXL': '4XL', 'XXXXXL': '5XL', 'ONE': 'one', 'OS': 'one', 'ONESIZE': 'one', 'EINHEITSGRÖSSE': 'one', 'EINHEITSGROESSE': 'one' };
  return map[x] || x;
}

// Pfade als Liste: ['M',x,y] ['L',x,y] ['Q',cx,cy,x,y] ['C',c1x,c1y,c2x,c2y,x,y] ['Z']
function garP2D(segs) {
  const p = new Path2D();
  for (const s of segs) {
    if (s[0] === 'M') p.moveTo(s[1], s[2]);
    else if (s[0] === 'L') p.lineTo(s[1], s[2]);
    else if (s[0] === 'Q') p.quadraticCurveTo(s[1], s[2], s[3], s[4]);
    else if (s[0] === 'C') p.bezierCurveTo(s[1], s[2], s[3], s[4], s[5], s[6]);
    else if (s[0] === 'Z') p.closePath();
  }
  return p;
}
function garEnd(s) { return [s[s.length - 2], s[s.length - 1]]; }
function garMirror(segs) { return segs.map(s => s.length === 1 ? s : [s[0]].concat(s.slice(1).map((v, i) => i % 2 === 0 ? -v : v))); }
// Offenen Pfad umdrehen (beginnt mit M, ohne Z)
function garReverse(segs) {
  const pts = segs.map(garEnd), out = [['M'].concat(pts[pts.length - 1])];
  for (let i = segs.length - 1; i > 0; i--) {
    const s = segs[i], p = pts[i - 1];
    if (s[0] === 'L') out.push(['L', p[0], p[1]]);
    else if (s[0] === 'Q') out.push(['Q', s[1], s[2], p[0], p[1]]);
    else if (s[0] === 'C') out.push(['C', s[3], s[4], s[1], s[2], p[0], p[1]]);
  }
  return out;
}
// Symmetrischer Umriss: rechte Hälfte von der Mitte oben (x=0) bis zur Mitte unten (x=0), links gespiegelt
function garSym(half) { return half.concat(garReverse(garMirror(half)).slice(1), [['Z']]); }
// Halbe Kurve von der Seite (x>0) zur Mitte → ganze Kurve von links nach rechts
function garFull(half) { return garMirror(half).concat(garReverse(half).slice(1)); }
function garSample(segs, n) {
  n = n || 10;
  const pts = []; let cx = 0, cy = 0, sx = 0, sy = 0;
  for (const s of segs) {
    if (s[0] === 'M') { cx = s[1]; cy = s[2]; sx = cx; sy = cy; pts.push([cx, cy]); }
    else if (s[0] === 'L') { cx = s[1]; cy = s[2]; pts.push([cx, cy]); }
    else if (s[0] === 'Q') {
      for (let i = 1; i <= n; i++) { const t = i / n, u = 1 - t; pts.push([u * u * cx + 2 * u * t * s[1] + t * t * s[3], u * u * cy + 2 * u * t * s[2] + t * t * s[4]]); }
      cx = s[3]; cy = s[4];
    } else if (s[0] === 'C') {
      for (let i = 1; i <= n; i++) {
        const t = i / n, u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
        pts.push([a * cx + b * s[1] + c * s[3] + d * s[5], a * cy + b * s[2] + c * s[4] + d * s[6]]);
      }
      cx = s[5]; cy = s[6];
    } else if (s[0] === 'Z') { pts.push([sx, sy]); cx = sx; cy = sy; }
  }
  return pts;
}
function garMirrorPts(pts) { return pts.map(p => [-p[0], p[1]]); }
function garShiftPts(pts, dx, dy) { return pts.map(p => [p[0] + dx, p[1] + dy]); }
// Parallele Linie im Abstand d (Normale links zur Laufrichtung, bei Umrissen im Uhrzeigersinn = nach innen)
function garOffset(pts, d) {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    return [p[0] - dy / L * d, p[1] + dx / L * d];
  });
}
// Gleichmäßig verteilte Punkte entlang einer Linie
function garResample(pts, step) {
  const out = [pts[0]]; let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let d = step - carry;
    while (d <= L) { out.push(garLerp(a, b, d / L)); d += step; }
    carry = L - (d - step);
  }
  return out;
}
function garPolyPath(pts, close) {
  const p = new Path2D(); if (!pts.length) return p;
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
  if (close) p.closePath();
  return p;
}
function garSmoothPath(pts) {
  const p = new Path2D(); p.moveTo(pts[0][0], pts[0][1]);
  if (pts.length === 2) { p.lineTo(pts[1][0], pts[1][1]); return p; }
  for (let i = 1; i < pts.length - 1; i++) {
    const last = i === pts.length - 2, n = pts[i + 1];
    p.quadraticCurveTo(pts[i][0], pts[i][1], last ? n[0] : (pts[i][0] + n[0]) / 2, last ? n[1] : (pts[i][1] + n[1]) / 2);
  }
  return p;
}
// Band entlang einer Mittellinie (für Henkel, Bänder, Kordeln)
function garStrap(pts, wd) {
  const a = garOffset(pts, wd / 2), b = garOffset(pts, -wd / 2).reverse();
  return garPolyPath(a.concat(b), true);
}
function garInPoly(pts, x, y) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c;
  }
  return c;
}
function garPtSegDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy;
  const t = L2 ? garClamp(((px - x1) * dx + (py - y1) * dy) / L2, 0, 1) : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
function garSegCross(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
}
function garPtRectDist(x, y, r) {
  const dx = Math.max(r.x0 - x, 0, x - r.x1), dy = Math.max(r.y0 - y, 0, y - r.y1);
  return Math.hypot(dx, dy);
}
function garSegRectDist(x1, y1, x2, y2, r) {
  const ins = (x, y) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
  if (ins(x1, y1) || ins(x2, y2)) return 0;
  const C = [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]];
  for (let i = 0; i < 4; i++) if (garSegCross([x1, y1], [x2, y2], C[i], C[(i + 1) % 4])) return 0;
  let d = Math.min(garPtRectDist(x1, y1, r), garPtRectDist(x2, y2, r));
  for (const c of C) d = Math.min(d, garPtSegDist(c[0], c[1], x1, y1, x2, y2));
  return d;
}
function garPolyRectDist(pts, r) {
  let d = Infinity;
  for (let i = 1; i < pts.length; i++) d = Math.min(d, garSegRectDist(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], r));
  return d;
}
function garRectInPoly(poly, x0, y0, w, h) {
  for (let i = 0; i <= 4; i++) {
    const fx = x0 + w * i / 4, fy = y0 + h * i / 4;
    if (!garInPoly(poly, fx, y0) || !garInPoly(poly, fx, y0 + h) || !garInPoly(poly, x0, fy) || !garInPoly(poly, x0 + w, fy)) return false;
  }
  return true;
}

// ======================= Geometrie =======================
const GAR_CACHE = new Map();
const GAR_ZCACHE = new Map();

function garGet(key, view, size) {
  key = GARMENTS[key] ? key : 'tshirt';
  const def = GARMENTS[key];
  size = garNormSize(size); if (!def.sizes[size]) size = def.defSize;
  if (!def.views.includes(view)) view = def.views[0];
  const ck = key + '|' + view + '|' + size;
  if (GAR_CACHE.has(ck)) return GAR_CACHE.get(ck);
  const st = GAR_STYLE[key];
  const G = st.type === 'bag' ? garBuildBag(key, view, size) : st.type === 'apron' ? garBuildApron(key, view, size) : garBuildTop(key, view, size);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of G.bboxPts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  G.bbox = { x: garR1(x0 - 0.2), y: garR1(y0 - 0.2), w: garR1(x1 - x0 + 0.4), h: garR1(y1 - y0 + 0.4) };
  delete G.bboxPts;
  GAR_CACHE.set(ck, G);
  return G;
}

function garNewG(key, view, size, w, l, st) {
  return { key, view, size, w, l, w2: w / 2, st, front: view === 'front', P: {}, seams: [], holes: [], fabricPolys: [], bboxPts: [], folds: [], stitches: [], grooves: [] };
}
function garAddSeam(G, kind, pts, mirror) {
  G.seams.push({ kind, pts });
  if (mirror) G.seams.push({ kind, pts: garMirrorPts(pts) });
}

// Oberteile: T-Shirt, Damen-Shirt, Longsleeve, Polo, Sweat, Hoodie, Zip-Hoodie, Tanktop
function garBuildTop(key, view, size) {
  const def = GARMENTS[key], st = GAR_STYLE[key];
  const m = def.sizes[size], md = def.sizes[def.defSize];
  const w = m.w, l = m.l, w2 = w / 2, kw = w / md.w, kl = l / md.l;
  const G = garNewG(key, view, size, w, l, st), P = G.P, front = G.front;
  const nh = st.nh + (w - md.w) * 0.05;
  Object.assign(G, { nh, kw, kl });
  const half = [['M', 0, st.topC], ['C', nh * 0.5, st.topC, nh * 0.93, 0.25, nh, 0]];
  let A;
  if (st.sleeve !== 'none') {
    const sy = st.sy, sw = w * st.shK;
    A = [w2, sy + st.ahK * w];
    const S = [sw, sy], a = st.sa * Math.PI / 180;
    const dir = [Math.cos(a), Math.sin(a)], nr = [-Math.sin(a), Math.cos(a)];
    const long = st.sleeve === 'long';
    const sl = long ? st.sl * kl : st.sl * Math.sqrt(kw);
    const so = long ? st.so * Math.sqrt(kw) : st.so * kw;
    const E1 = [S[0] + dir[0] * sl, S[1] + dir[1] * sl];
    const E2 = [E1[0] + nr[0] * so, E1[1] + nr[1] * so];
    const U = garLerp(A, E2, 0.12);
    const bul = long ? 0.16 * sl : 0.5;   // lange Ärmel: Oberarm breiter (Bizeps), zur Manschette schmaler
    const M1 = [(S[0] + E1[0]) / 2 + Math.sin(a) * bul, (S[1] + E1[1]) / 2 - Math.cos(a) * bul];
    const shC = [(nh + sw) / 2, sy * 0.36];
    half.push(['Q', shC[0], shC[1], S[0], S[1]], ['Q', M1[0], M1[1], E1[0], E1[1]], ['L', E2[0], E2[1]], ['L', U[0], U[1]], ['Q', A[0], A[1], A[0], A[1] + 1.6]);
    const ud = garNorm([E2[0] - A[0], E2[1] - A[1]]);
    G.sl = { S, E1, E2, A, U, dir, nr, ud, M1, long, sl, so };
    G.shoulderY = x => { const t = garClamp((x - nh) / (sw - nh), 0, 1); return 2 * (1 - t) * t * shC[1] + t * t * sy; };
    G.shoulderSegs = [['M', nh, 0], ['Q', shC[0], shC[1], S[0], S[1]]];
  } else {
    A = [w2, st.ay0 + (w - md.w) * 0.25];
    const T = [nh + st.strap, 0.6];
    G.armholeSegs = [['M', T[0], T[1]], ['C', T[0] + 0.3, A[1] * 0.5, A[0] - 4.5, A[1] - 0.8, A[0], A[1]]];
    half.push(['L', T[0], T[1]], G.armholeSegs[1]);
    G.strapT = T;
    G.shoulderY = x => 0.6 * garClamp((x - nh) / st.strap, 0, 1);
    G.shoulderSegs = [['M', nh, 0], ['L', T[0], T[1]]];
  }
  G.A = A;
  // Seite und Saum
  const band = st.band || 0, bandIn = st.bandIn || 0;
  const xsHem = band ? w2 - bandIn : w2 + st.flare;
  const yTop = A[1] + (st.sleeve !== 'none' ? 1.6 : 0);
  const yEnd = l - band - st.hemC;
  const xEnd = band ? w2 - bandIn * 0.45 : xsHem;
  const side = [];
  if (st.waist) {
    const Wp = [w2 - st.waist, yTop + (yEnd - yTop) * 0.42];
    side.push(['C', w2 + 0.1, yTop + (Wp[1] - yTop) * 0.4, Wp[0], Wp[1] - (Wp[1] - yTop) * 0.4, Wp[0], Wp[1]]);
    side.push(['C', Wp[0], Wp[1] + (yEnd - Wp[1]) * 0.4, xEnd, yEnd - (yEnd - Wp[1]) * 0.35, xEnd, yEnd]);
  } else side.push(['C', w2 + 0.15, yTop + (yEnd - yTop) * 0.35, xEnd, yEnd - (yEnd - yTop) * 0.3, xEnd, yEnd]);
  half.push(...side);
  if (band) half.push(['L', xsHem, l - st.hemC]);
  half.push(['Q', xsHem / 2, l, 0, l]);
  G.hemX = xsHem;
  G.hemY = x => l - st.hemC * Math.pow(x / xsHem, 2);
  const outline = garSym(half);
  P.body = garP2D(outline);
  const outPts = garSample(outline, 10);
  G.fabricPolys.push(outPts); G.bboxPts.push(...outPts);
  garAddSeam(G, 'seite', garSample([['M', A[0], yTop]].concat(side), 8), true);
  garAddSeam(G, 'schulter', garSample(G.shoulderSegs, 6), true);

  // Ärmel
  if (G.sl) {
    const { S, E1, E2, U, M1, dir, ud } = G.sl;
    const ahC = ['C', A[0] - st.ahIn, A[1] - 3.2, S[0] - st.ahIn * 0.55, S[1] + (A[1] - S[1]) * 0.45, S[0], S[1]];
    const sp = [['M', S[0], S[1]], ['Q', M1[0], M1[1], E1[0], E1[1]], ['L', E2[0], E2[1]], ['L', U[0], U[1]], ['L', A[0], A[1]], ahC, ['Z']];
    P.sleeveR = garP2D(sp); P.sleeveL = garP2D(garMirror(sp));
    G.armhole = garSample([['M', A[0], A[1]], ahC], 12);
    garAddSeam(G, 'aermel', G.armhole, true);
    const endW = st.cuff || st.cuffRib || 0;
    const hemW = endW || (st.slHem + 0.4);
    const P1 = [E1[0] - dir[0] * hemW, E1[1] - dir[1] * hemW], P2 = [E2[0] - ud[0] * hemW, E2[1] - ud[1] * hemW];
    // Fläche des Ärmels ohne Saum/Bündchen (für den Druckbereich)
    const lim = (P1[0] - S[0]) * dir[0] + (P1[1] - S[1]) * dir[1];
    const topEdge = garSample([['M', S[0], S[1]], ['Q', M1[0], M1[1], E1[0], E1[1]]], 16).filter(p => (p[0] - S[0]) * dir[0] + (p[1] - S[1]) * dir[1] < lim);
    G.sleevePoly = topEdge.concat([P1, P2, U, A], garSample([['M', A[0], A[1]], ahC], 8).slice(1));
    G.sleeveEnd = [P1, P2];
    if (endW) {
      const cuff = [['M', P1[0] - dir[0] * 0.3, P1[1] - dir[1] * 0.3], ['L', E1[0] + dir[0], E1[1] + dir[1]], ['L', E2[0] + ud[0], E2[1] + ud[1]], ['L', P2[0] - ud[0] * 0.3, P2[1] - ud[1] * 0.3], ['Z']];
      P.cuffR = garP2D(cuff); P.cuffL = garP2D(garMirror(cuff));
      garAddSeam(G, 'buendchen', [P1, P2], true);
      G.cuffLine = [P1, P2];
    } else {
      G.sleeveHem = [st.slHem - 0.3, st.slHem + 0.3].map(h => [[E1[0] - dir[0] * h, E1[1] - dir[1] * h], [E2[0] - ud[0] * h, E2[1] - ud[1] * h]]);
      garAddSeam(G, 'saum', G.sleeveHem[1], true);
    }
  } else {
    const ah = garSample(G.armholeSegs, 12);
    garAddSeam(G, 'aermel', ah, true);
    G.armholeStitch = garOffset(ah, -1.0);
  }

  // Saum oder Bündchen
  const hemLine = d => { const pts = []; for (let x = -xsHem - 2; x <= xsHem + 2.01; x += 1) pts.push([x, G.hemY(garClamp(x, -xsHem, xsHem)) - d]); return pts; };
  if (band) {
    const top = hemLine(band);
    P.band = garPolyPath(top.concat([[xsHem + 3, l + 3], [-xsHem - 3, l + 3]]), true);
    G.bandLine = top;
    garAddSeam(G, 'buendchen', top.slice(2, -2));
    G.stitches.push(hemLine(band + 0.45));
  } else {
    G.hemStitch = [hemLine(2.0), hemLine(2.6)];
    garAddSeam(G, 'saum', hemLine(2.6).slice(2, -2));
  }

  // Hals
  if (st.neck === 'crew' || st.neck === 'tank') garBuildCrew(G);
  else if (st.neck === 'polo') garBuildPolo(G);
  else if (st.neck === 'hood') garBuildHood(G);

  // Taschen, Reißverschluss
  if (front && st.pocket) {
    const pB = l - band - 0.15, ph = 21 * kl, pT = pB - ph, oh = 13 * kl;
    const tx = 0.205 * w, bx = 0.325 * w;
    const openC = ['C', tx + 1.2, pT + oh * 0.5, bx - 0.4, pT + oh * 0.75, bx, pT + oh];
    G.pocket = { top: pT, bottom: pB, tx, bx, oh, paths: [], open: [] };
    if (st.pocket === 'kangaroo') {
      const ps = garSym([['M', 0, pT], ['L', tx, pT], openC, ['L', bx, pB], ['L', 0, pB]]);
      G.pocket.paths.push(garP2D(ps));
      garAddSeam(G, 'tasche', garSample(ps, 8));
    } else {
      const x0 = 1.3;
      const ps = [['M', x0, pT], ['L', tx, pT], openC, ['L', bx, pB], ['L', x0, pB], ['Z']];
      G.pocket.paths.push(garP2D(ps), garP2D(garMirror(ps)));
      garAddSeam(G, 'tasche', garSample(ps, 8), true);
    }
    const op = garSample([['M', tx, pT], openC], 12);
    G.pocket.open.push(op, garMirrorPts(op));
  }
  if (st.zip) {
    const y0 = front ? G.hoodV : 0;
    if (front) {
      G.zip = { y0, y1: l + 0.1, tape: 1.2 };
      garAddSeam(G, 'reissverschluss', [[0, y0], [0, l]]);
      garAddSeam(G, 'reissverschluss', [[1.2, y0], [1.2, l]], true);
    }
  }

  G.folds = garBodyFolds(G);
  return G;
}

// Rundhals (auch Tanktop): Bündchen, Innenseite, Etikett
function garBuildCrew(G) {
  const st = G.st, nh = G.nh, P = G.P, md = GARMENTS[G.key].sizes[GARMENTS[G.key].defSize];
  const fo = st.fo + (G.w - md.w) * 0.04, rb = st.rb, topC = st.topC, rbB = rb * 0.9;
  G.fo = fo;
  const ySh = x => G.shoulderY(x);
  const open = [['M', nh, 0], ['C', nh, fo * 0.55, nh * 0.55, fo, 0, fo]];
  const seamF = d => [['M', nh + d * 0.9, ySh(nh + d * 0.9)], ['C', nh + d * 0.9, (fo + d) * 0.6, (nh + d) * 0.55, fo + d, 0, fo + d]];
  const seamB = d => [['M', nh + d * 0.9, ySh(nh + d * 0.9)], ['C', nh + d * 0.75, topC + d * 0.95, (nh + d) * 0.45, topC + d, 0, topC + d]];
  const backInner = [['M', nh, 0], ['C', nh * 0.85, rbB * 0.6, nh * 0.5, topC + rbB, 0, topC + rbB]];
  const top = [['M', nh, 0], ['C', nh * 0.93, 0.25, nh * 0.5, topC, 0, topC]];
  const openFull = garFull(open), innerFull = garFull(backInner), topFull = garFull(top);
  if (G.front) {
    const seamFull = garFull(seamF(rb)), sR = seamF(rb)[0];
    P.inside = garP2D(innerFull.concat(garReverse(openFull).slice(1), [['Z']]));
    P.bandF = garP2D(openFull.concat([['L', sR[1], sR[2]]], garReverse(seamFull).slice(1), [['Z']]));
    P.bandB = garP2D(topFull.concat(garReverse(innerFull).slice(1), [['Z']]));
    G.holes.push(garSample(innerFull.concat(garReverse(openFull).slice(1), [['Z']]), 8));
    G.openPts = garSample(openFull, 16);
    G.innerPts = garSample(innerFull, 12);
    G.collarSeam = garSample(seamFull, 16);
    G.collarY = fo + rb;
    G.labelY = topC + rbB;
    garAddSeam(G, 'kragen', G.collarSeam);
    G.stitches.push(garSample(garFull(seamF(rb + 0.35)), 16), garSample(garFull(seamF(rb + 0.8)), 16));
  } else {
    const seamFull = garFull(seamB(rb)), sR = seamB(rb)[0];
    P.bandBack = garP2D(topFull.concat([['L', sR[1], sR[2]]], garReverse(seamFull).slice(1), [['Z']]));
    G.topPts = garSample(topFull, 16);
    G.collarSeam = garSample(seamFull, 16);
    G.collarY = topC + rb;
    G.labelY = topC + rb;
    garAddSeam(G, 'kragen', G.collarSeam);
    G.stitches.push(garSample(garFull(seamB(rb + 0.35)), 16), garSample(garFull(seamB(rb + 0.8)), 16));
  }
}

// Polo: Kragen, Knopfleiste, Ärmelbündchen, Seitenschlitze
function garBuildPolo(G) {
  const st = G.st, nh = G.nh, P = G.P, pk = st.placket;
  const pw = pk.w / 2, pTop = pk.top, pBot = pk.top + pk.len * Math.sqrt(G.kl);
  if (G.front) {
    const collar = garSym([['M', 0, -1.0], ['C', nh * 0.6, -1.0, nh + 2.3, -0.7, nh + 2.5, 1.3], ['C', nh + 2.6, 5.5, 8.6, 10.3, 6.1, 12.7],
      ['L', pw + 0.15, pTop + 0.5], ['C', 4.2, 6.0, nh - 0.6, 2.9, nh - 1.0, 1.9], ['C', nh * 0.55, 2.5, 2.2, 2.5, 0, 2.5]]);
    P.collar = garP2D(collar);
    const inside = garSym([['M', 0, 2.5], ['C', 2.2, 2.5, nh * 0.55, 2.5, nh - 1.0, 1.9], ['C', nh - 0.6, 2.9, 4.2, 6.0, pw + 0.15, pTop + 0.5], ['L', 0, pTop + 0.6]]);
    P.inside = garP2D(inside);
    G.holes.push(garSample(inside, 8));
    const cPts = garSample(collar, 10);
    G.bboxPts.push(...cPts); G.fabricPolys.push(cPts);
    garAddSeam(G, 'kragen', cPts);
    G.placket = { pw, pTop, pBot, buttons: [pTop + 3.0, pTop + 3.0 + (pBot - pTop - 4.2) * 0.62] };
    garAddSeam(G, 'knopfleiste', [[-pw, pTop], [-pw, pBot], [pw, pBot], [pw, pTop]]);
    G.collarY = pTop;
  } else {
    const collar = garSym([['M', 0, -1.0], ['C', nh * 0.6, -1.0, nh + 2.3, -0.7, nh + 2.5, 1.3], ['C', nh + 2.2, 3.8, nh * 0.55, 5.3, 0, 5.3]]);
    P.collarBack = garP2D(collar);
    const cPts = garSample(collar, 10);
    G.bboxPts.push(...cPts); G.fabricPolys.push(cPts);
    garAddSeam(G, 'kragen', cPts);
    G.collarFall = garSample(garFull([['M', nh + 2.5, 1.3], ['C', nh + 2.2, 3.8, nh * 0.55, 5.3, 0, 5.3]]), 14);
    G.collarY = 5.3;
  }
}

// Kapuze: vorne Kapuzenöffnung mit Futter, hinten Kapuzenrücken mit Mittelnaht
function garBuildHood(G) {
  const st = G.st, nh = G.nh, P = G.P, md = GARMENTS[G.key].sizes[GARMENTS[G.key].defSize];
  const hT = st.hood.hT + (G.w - md.w) * 0.12, hw = st.hood.hw + (G.w - md.w) * 0.1, ow = st.hood.ow, r = st.hood.ring;
  G.hood = { hT, hw, ow, r };
  if (G.front) {
    const shell = garSym([['M', 0, -hT], ['C', hw * 0.62, -hT, hw, -hT * 0.7, hw, -hT * 0.32], ['C', hw, -1, nh + 4.5, 2.6, nh + 1, 3.6], ['L', 0, 4]]);
    P.hoodShell = garP2D(shell);
    const sp = garSample(shell, 10);
    G.bboxPts.push(...sp); G.fabricPolys.push(sp);
    const yw = -hT * 0.2;
    const oval = (rx, top, bot) => [['M', 0, top], ['C', rx * 0.63, top, rx, top + (yw - top) * 0.45, rx, yw],
      ['C', rx, yw + (bot - yw) * 0.55, rx * 0.42, bot - (bot - yw) * 0.06, 0, bot]];
    const vb = st.zip ? 10.6 : 10;
    G.hoodV = vb;
    const lining = garSym(oval(ow, -hT + r + 0.9, vb)), ring = garSym(oval(ow + r, -hT + 0.5, vb + 2.6));
    P.lining = garP2D(lining); P.ringOut = garP2D(ring);
    G.liningPts = garSample(lining, 12);
    G.holes.push(G.liningPts);
    G.ringStitch = garSample(garSym(oval(ow + 2.3, -hT + r + 0.9 - 2.3, vb + 1.9)), 14);
    const rp = garSample(ring, 12);
    garAddSeam(G, 'kapuze', rp);
    G.collarY = vb + 2.6;
    if (st.cords) {
      const cl = 20 * Math.sqrt(G.kl);
      G.eyelets = [[2.7, vb + 0.75], [-2.7, vb + 0.75]];
      G.cords = [
        [[2.7, vb + 0.75], [3.1, vb + cl * 0.3], [2.85, vb + cl * 0.65], [3.4, vb + cl]],
        [[-2.7, vb + 0.75], [-3.2, vb + cl * 0.35], [-2.95, vb + cl * 0.7], [-3.6, vb + cl * 0.95]]
      ];
      G.cords.forEach(c => G.bboxPts.push(c[c.length - 1]));
    }
  } else {
    const hb = garSym([['M', 0, -hT], ['C', hw * 0.64, -hT, hw + 0.4, -hT * 0.68, hw + 0.4, -hT * 0.3], ['C', hw + 0.4, 0.5, nh + 5, 3.2, nh + 1.8, 4.3], ['Q', nh * 0.5, 5.2, 0, 5.2]]);
    P.hoodBack = garP2D(hb);
    const hp = garSample(hb, 10);
    G.bboxPts.push(...hp); G.fabricPolys.push(hp);
    const bottom = garSample(garFull([['M', hw + 0.4, -hT * 0.3], ['C', hw + 0.4, 0.5, nh + 5, 3.2, nh + 1.8, 4.3], ['Q', nh * 0.5, 5.2, 0, 5.2]]), 12);
    garAddSeam(G, 'kapuze', bottom);
    G.hoodBottom = bottom;
    G.collarY = 5.2;
  }
}

// Baumwolltasche: Ursprung = Mitte der Oberkante
function garBuildBag(key, view, size) {
  const m = GARMENTS[key].sizes[size], w = m.w, l = m.l, w2 = w / 2;
  const G = garNewG(key, view, size, w, l, GAR_STYLE[key]), P = G.P;
  const body = [['M', -w2 + 0.5, 0], ['L', w2 - 0.5, 0], ['Q', w2, 0, w2, 0.5], ['L', w2 + 0.25, l - 0.7], ['Q', w2 + 0.25, l, w2 - 0.45, l],
    ['L', -w2 + 0.45, l], ['Q', -w2 - 0.25, l, -w2 - 0.25, l - 0.7], ['L', -w2, 0.5], ['Q', -w2, 0, -w2 + 0.5, 0], ['Z']];
  P.body = garP2D(body);
  const bp = garSample(body, 6);
  G.fabricPolys.push(bp); G.bboxPts.push(...bp);
  const hx = 9.5, hwd = 2.5, hH = 29;
  const arch = (xa, apex) => garFull([['M', xa, 4], ['C', xa + 1.2, -12, xa * 0.62, apex, 0, apex]]);
  const handle = (dy, sx) => {
    const outer = garSample(arch(hx + hwd / 2, -hH), 14), inner = garSample(arch(hx - hwd / 2, -hH + hwd), 14);
    const pts = outer.concat(inner.reverse()).map(p => [p[0] * sx, p[1] + dy * (p[1] < 0 ? 1 : 0)]);
    return pts;
  };
  const hf = handle(0, 1), hb = handle(-1.2, 1.05);
  P.handleF = garPolyPath(hf, true); P.handleB = garPolyPath(hb, true);
  G.bboxPts.push(...hf, ...hb);
  G.handleStitch = [garSample(arch(hx + hwd / 2 - 0.35, -hH + 0.35), 14), garSample(arch(hx - hwd / 2 + 0.35, -hH + hwd - 0.35), 14)];
  G.handleX = hx; G.handleW = hwd;
  G.hemTop = 3;
  G.collarY = 0;
  garAddSeam(G, 'saum', [[-w2, 3], [w2, 3]]);
  garAddSeam(G, 'rand', [[-w2, 0], [-w2, l]]); garAddSeam(G, 'rand', [[w2, 0], [w2, l]]);
  garAddSeam(G, 'rand', [[-w2, l], [w2, l]]);
  const P2 = (fx, fy) => [fx * w2, fy * l];
  const add = (type, a, wd, bl, pts) => G.folds.push({ type, a, wd, bl, pts: pts.map(p => P2(p[0], p[1])) });
  add('sh', 0.55, 1.6, 2.6, [[-0.58, 0.12], [-0.62, 0.5], [-0.52, 0.95]]);
  add('hi', 0.5, 1.6, 2.4, [[-0.44, 0.14], [-0.47, 0.55], [-0.4, 0.92]]);
  add('sh', 0.45, 1.4, 2.4, [[0.42, 0.25], [0.5, 0.65], [0.46, 0.98]]);
  add('hi', 0.45, 1.6, 2.4, [[0.3, 0.18], [0.36, 0.7]]);
  add('sh', 0.5, 0.9, 1.4, [[-0.62, 0.03], [-0.8, 0.13]]);
  add('sh', 0.5, 0.9, 1.4, [[0.62, 0.03], [0.8, 0.13]]);
  add('hi', 0.35, 5, 5, [[-0.1, 0.1], [0.0, 0.5], [-0.12, 0.9]]);
  return G;
}

// Latzschürze: Ursprung = Mitte der Latz-Oberkante
function garBuildApron(key, view, size) {
  const m = GARMENTS[key].sizes[size], w = m.w, l = m.l, w2 = w / 2;
  const G = garNewG(key, view, size, w, l, GAR_STYLE[key]), P = G.P;
  const bt = 13, wy = 28;
  const half = [['M', 0, 0], ['L', bt - 0.4, 0], ['Q', bt, 0, bt, 0.4], ['L', bt, 11], ['C', bt + 0.4, 22, bt + 8, wy - 0.4, w2 - 0.5, wy],
    ['Q', w2, wy, w2, wy + 0.6], ['L', w2, l - 0.6], ['Q', w2, l, w2 - 0.6, l], ['L', 0, l]];
  const outline = garSym(half);
  P.body = garP2D(outline);
  const op = garSample(outline, 10);
  G.fabricPolys.push(op); G.bboxPts.push(...op);
  G.hemStitch = [garOffset(op, 1.1)];
  garAddSeam(G, 'saum', garOffset(op, 1.1));
  // Nackenband und Bindebänder
  const neck = garSample(garFull([['M', bt - 1.6, 1.5], ['C', bt - 0.6, -10, 7, -23, 0, -23]]), 16);
  const tieR = garSample([['M', w2 - 1, wy + 1.2], ['C', w2 + 7, wy + 1.5, w2 + 12, wy + 6, w2 + 13.5, wy + 23]], 14);
  const tieL = garSample([['M', -w2 + 1, wy + 1.2], ['C', -w2 - 6, wy + 2, -w2 - 11.5, wy + 8, -w2 - 12, wy + 25]], 14);
  G.straps = [neck, tieR, tieL];
  G.strapW = 2.4;
  [neck, tieR, tieL].forEach(s => { G.bboxPts.push(...garOffset(s, 1.3), ...garOffset(s, -1.3)); });
  // Tasche
  const pk = { x0: -21, x1: 21, y0: 50, y1: 67 };
  G.pocketA = pk;
  P.pocket = garP2D([['M', pk.x0, pk.y0], ['L', pk.x1, pk.y0], ['L', pk.x1, pk.y1 - 1], ['Q', pk.x1, pk.y1, pk.x1 - 1, pk.y1], ['L', pk.x0 + 1, pk.y1], ['Q', pk.x0, pk.y1, pk.x0, pk.y1 - 1], ['Z']]);
  garAddSeam(G, 'tasche', [[pk.x0, pk.y1], [pk.x0, pk.y0], [pk.x1, pk.y0], [pk.x1, pk.y1], [pk.x0, pk.y1]]);
  garAddSeam(G, 'tasche', [[0, pk.y0], [0, pk.y1]]);
  G.collarY = 0;
  const P2 = (x, y) => [x, y];
  const add = (type, a, wd, bl, pts) => G.folds.push({ type, a, wd, bl, pts: pts.map(p => P2(p[0], p[1])) });
  add('sh', 0.5, 1.2, 2, [[-10, 12], [-15, 24], [-20, 29]]);
  add('sh', 0.5, 1.2, 2, [[10, 12], [15, 24], [20, 29]]);
  add('sh', 0.45, 1.8, 3, [[-18, 32], [-20, 55], [-17, 84]]);
  add('hi', 0.45, 2, 3, [[-14, 32], [-15, 55], [-12, 84]]);
  add('sh', 0.4, 1.8, 3, [[16, 34], [19, 60], [17, 85]]);
  add('hi', 0.4, 2, 3, [[12, 34], [14, 60], [12, 85]]);
  add('hi', 0.35, 6, 6, [[-2, 4], [0, 40], [-3, 80]]);
  return G;
}

// Weiche Falten (normierte Lage, damit sie mit der Größe mitwachsen)
function garBodyFolds(G) {
  const w2 = G.w2, l = G.l, ay = G.A[1], H = l - ay - (G.st.band || 0) * 0.5;
  const P = (fx, fy) => [fx * w2, ay + fy * H];
  const F = [];
  const add = (type, a, wd, bl, pts) => F.push({ type, a, wd, bl, pts: pts.map(p => P(p[0], p[1])) });
  add('sh', 0.9, 0.8, 1.3, [[0.97, 0.05], [0.84, 0.17], [0.7, 0.29]]);
  add('hi', 0.7, 1.1, 1.6, [[0.95, 0.12], [0.82, 0.24], [0.68, 0.36]]);
  add('sh', 0.5, 0.6, 1.0, [[0.98, 0.24], [0.86, 0.33]]);
  add('sh', 0.85, 0.8, 1.3, [[-0.97, 0.07], [-0.85, 0.17], [-0.72, 0.27], [-0.62, 0.33]]);
  add('hi', 0.6, 1.1, 1.6, [[-0.95, 0.15], [-0.81, 0.27], [-0.69, 0.36]]);
  add('hi', 0.32, 7, 7, [[-0.12, -0.35], [-0.08, 0.3], [-0.16, 0.9]]);
  add('sh', 0.5, 1.3, 2.4, [[-0.9, 0.8], [-0.5, 0.73], [-0.05, 0.76], [0.35, 0.83]]);
  add('hi', 0.5, 1.5, 2.4, [[-0.85, 0.71], [-0.48, 0.65], [-0.05, 0.68], [0.3, 0.74]]);
  add('hi', 0.4, 1.2, 2.0, [[0.2, 0.52], [0.55, 0.58], [0.9, 0.64]]);
  add('sh', 0.38, 1.0, 1.8, [[0.25, 0.6], [0.58, 0.66], [0.92, 0.71]]);
  add('sh', 0.3, 2.2, 3.5, [[-0.55, 0.15], [-0.6, 0.45]]);
  add('hi', 0.5, 1.4, 1.5, [[G.nh / w2 + 0.08, -ay / H + 0.035], [0.75, (-ay + 3.5) / H]]);
  add('hi', 0.45, 1.4, 1.5, [[-G.nh / w2 - 0.08, -ay / H + 0.035], [-0.75, (-ay + 3.5) / H]]);
  return F;
}
// Falten im Ärmel, Lage in (t entlang, u quer) – t=0 Schulter, u=0 Oberkante
function garSleeveFolds(G, side) {
  const s = G.sl; if (!s) return [];
  const Q = (t, u) => { const a = garLerp(s.S, s.E1, t), b = garLerp(s.A, s.E2, t), p = garLerp(a, b, u); return [p[0] * side, p[1]]; };
  const F = [], add = (type, a, wd, bl, pts) => F.push({ type, a, wd, bl, pts: pts.map(p => Q(p[0], p[1])) });
  if (!s.long) {
    add('hi', 0.8, 1.6, 2.0, [[0.08, 0.2], [0.5, 0.16], [0.92, 0.22]]);
    add('sh', 0.7, 0.9, 1.4, [[0.08, 0.78], [0.45, 0.58], [0.85, 0.62]]);
    add('sh', 0.45, 0.7, 1.2, [[0.72, 0.12], [0.78, 0.5]]);
  } else {
    add('hi', 0.8, 1.8, 2.2, [[0.05, 0.22], [0.5, 0.2], [0.95, 0.26]]);
    add('sh', 0.7, 1.0, 1.6, [[0.05, 0.8], [0.3, 0.6], [0.5, 0.5]]);
    add('sh', 0.7, 0.8, 1.2, [[0.5, 0.12], [0.55, 0.45], [0.52, 0.85]]);
    add('hi', 0.6, 0.9, 1.3, [[0.46, 0.15], [0.49, 0.5], [0.46, 0.85]]);
    add('sh', 0.55, 0.7, 1.1, [[0.62, 0.2], [0.65, 0.62]]);
    add('sh', 0.55, 0.7, 1.0, [[0.82, 0.15], [0.84, 0.62]]);
    add('hi', 0.5, 0.8, 1.1, [[0.78, 0.2], [0.8, 0.72]]);
  }
  return F;
}

// ======================= Druckbereiche =======================
function garNeckMaxY(G, x0, x1) {
  let m = 0;
  for (const s of G.seams) {
    if (s.kind !== 'kragen' && s.kind !== 'kapuze') continue;
    const p = s.pts;
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1], b = p[i];
      const lo = Math.max(Math.min(a[0], b[0]), x0), hi = Math.min(Math.max(a[0], b[0]), x1);
      if (lo > hi) continue;
      const yAt = x => a[0] === b[0] ? Math.max(a[1], b[1]) : a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
      m = Math.max(m, yAt(lo), yAt(hi));
    }
  }
  return m;
}
// Oberkante so weit nach unten schieben, bis der Abstand zu Kragen/Kapuze/Knopfleiste reicht
function garClearTop(G, x0, x1, top, h, minD) {
  const kinds = ['kragen', 'kapuze', 'knopfleiste'];
  for (let i = 0; i < 80; i++) {
    const r = { x0, x1, y0: top, y1: top + h };
    let d = Infinity;
    for (const s of G.seams) if (kinds.includes(s.kind)) d = Math.min(d, garPolyRectDist(s.pts, r));
    if (d >= minD) break;
    top += 0.25;
  }
  return top;
}
// Größtes achsparalleles Rechteck (Ziel 9 × 9 cm, lange Ärmel 9 × 11 cm) auf dem Ärmel, 1,5 cm Abstand zu allen Kanten
function garSleeveZone(F) {
  const s = F.sl, poly = F.sleevePoly; if (!s || !poly) return null;
  const Ma = garLerp(s.S, s.A, 0.5), Me = garLerp(s.E1, s.E2, 0.5), pref = garLerp(Ma, Me, s.long ? 0.22 : 0.42);
  const k = Math.sqrt(F.kw), tw = 9 * k, th = (s.long ? 11 : 9) * k, m = 1.5;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of poly) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  for (let f = 1; f >= 0.4; f -= 0.05) {
    let best = null, bd = Infinity;
    for (const [aw, ah] of [[tw * f, th * f], [tw * f * 1.12, th * f * 0.88], [tw * f * 0.88, th * f * 1.12]]) {
      for (let cy = y0 + ah / 2 + m; cy <= y1 - ah / 2 - m; cy += 0.5) for (let cx = x0 + aw / 2 + m; cx <= x1 - aw / 2 - m; cx += 0.5) {
        const d = Math.hypot(cx - pref[0], cy - pref[1]);
        if (d >= bd) continue;
        const ax = [Me[0] - Ma[0], Me[1] - Ma[1]], tp = ((cx - Ma[0]) * ax[0] + (cy - Ma[1]) * ax[1]) / (ax[0] * ax[0] + ax[1] * ax[1]);
        if (s.long && tp > 0.42) continue;   // lange Ärmel: nur Oberarm
        // 0,8 cm zu den gefalteten Außenkanten, 1,5 cm zu Armloch-Naht und Ärmelsaum/Bündchen
        const r = { x0: cx - aw / 2, x1: cx + aw / 2, y0: cy - ah / 2, y1: cy + ah / 2 };
        if (garRectInPoly(poly, r.x0 - 0.8, r.y0 - 0.8, aw + 1.6, ah + 1.6) && garPolyRectDist(F.sleeveEnd, r) >= m && F.seams.every(sm => garPolyRectDist(sm.pts, r) >= m)) {
          bd = d; best = { x0: r.x0, y0: r.y0, w: aw, h: ah };
        }
      }
    }
    if (best) return best;
  }
  return null;
}
// Druckbereiche je Ort-Gruppe für eine Größe (beide Ansichten)
function garZonesFor(key, size) {
  key = GARMENTS[key] ? key : 'tshirt';
  const def = GARMENTS[key];
  size = garNormSize(size); if (!def.sizes[size]) size = def.defSize;
  const ck = key + '|' + size;
  if (GAR_ZCACHE.has(ck)) return GAR_ZCACHE.get(ck);
  const st = GAR_STYLE[key], Z = {};
  const R = (view, x0, y0, w, h) => ({ view, x0: garR1(x0), y0: garR1(y0), w: garR1(Math.max(0, w)), h: garR1(Math.max(0, h)) });
  if (st.type === 'bag') {
    const m = def.sizes[size];
    Z.front = R('front', -m.w / 2 + 4, 4.5, m.w - 8, m.l - 8);
    Z.back = R('back', -m.w / 2 + 4, 4.5, m.w - 8, m.l - 8);
  } else if (st.type === 'apron') {
    Z.front = R('front', -10, 3, 20, 20);
    Z.brustL = R('front', 1.6, 3, 8.5, 8.5);
    Z.brustR = R('front', -10.1, 3, 8.5, 8.5);
    Z.bauch = R('front', -24, 31, 48, 17);
  } else {
    const F = garGet(key, 'front', size), B = garGet(key, 'back', size), w = F.w, l = F.l;
    const fw = Math.min(36, w * (st.waist ? 0.57 : 0.545)), fh = Math.min(46, l * 0.54);
    const hemLimit = st.band ? l - st.band - 2 : l - 5;
    const fTop = F.placket ? F.placket.pBot + 1.5 : F.collarY + 1.5;
    const fBot = F.pocket ? F.pocket.top - 1.5 : hemLimit;
    if (!st.zip) Z.front = R('front', -fw / 2, fTop, fw, Math.min(fh, fBot - fTop));
    const bw = st.hood ? Math.min(38, w * 0.6) : fw, bh = st.hood ? Math.min(50, l * 0.62) : fh + 3;
    const bTop = B.collarY + 1.5;
    Z.back = R('back', -bw / 2, bTop, bw, Math.min(bh, hemLimit - bTop));
    const cx = w * (st.waist ? 0.19 : 0.18), zs = garClamp(w * 0.2, 8.5, 12);
    const minX = F.placket ? F.placket.pw + 1.5 : st.zip ? 2.7 : st.cords ? 4.6 : 1.5;
    const bx0 = Math.max(minX, cx - zs / 2);
    const by0 = garClearTop(F, bx0, bx0 + zs, Math.max(6, garNeckMaxY(F, bx0, bx0 + zs) + 1.5), zs, 1.5);
    Z.brustL = R('front', bx0, by0, zs, zs);
    Z.brustR = R('front', -bx0 - zs, by0, zs, zs);
    if (F.pocket && st.pocket === 'kangaroo') Z.bauch = R('front', -F.pocket.tx, F.pocket.top - 13, 2 * F.pocket.tx, 11.5);
    else if (!st.zip) { const y0 = Math.max(fTop, 25 * F.kl); Z.bauch = R('front', -fw / 2, y0, fw, Math.min(25, hemLimit - y0)); }
    if (F.sl) {
      const z = garSleeveZone(F);
      if (z) { Z.aermelL = R('front', z.x0, z.y0, z.w, z.h); Z.aermelR = R('front', -z.x0 - z.w, z.y0, z.w, z.h); }
    }
    Z.nacken = R('back', -6, B.collarY + 1.2, 12, 7);
  }
  GAR_ZCACHE.set(ck, Z);
  return Z;
}
// Ort (aus ORTE in core.js) → Zone
function garZoneKey(key, ort) {
  const st = GAR_STYLE[GARMENTS[key] ? key : 'tshirt'];
  if (st.type === 'bag') return ort === 'ruecken' || ort === 'nacken' ? 'back' : 'front';
  const m = { brustL: 'brustL', brustR: 'brustR', brustM: 'front', front: 'front', bauch: 'bauch', ruecken: 'back', nacken: 'nacken',
    aermelL: 'aermelL', aermelR: 'aermelR', sonst: 'front' };
  return m[ort] || 'front';
}

// ======================= Öffentliche Funktionen: Auswahl =======================
// Welche Kleidungsform? Zuerst Feld `modell` des Katalogartikels, sonst Name/Kategorie
function garmentForPosition(p, S) {
  p = p || {};
  let cat = null;
  try { if (S && p.catId && typeof catById === 'function') cat = catById(S, p.catId); } catch (e) { cat = null; }
  if (cat && cat.modell && GARMENTS[cat.modell]) return cat.modell;
  if (p.modell && GARMENTS[p.modell]) return p.modell;
  const t = [p.name, cat && cat.name, cat && cat.kategorie].filter(Boolean).join(' ').toLowerCase();
  if (/sch(ü|ue)rze|apron|\blatz/.test(t)) return 'apron';
  if (/zip|rei(ß|ss)verschluss|sweatjacke|kapuzenjacke|jacke/.test(t)) return 'zip_hoodie';
  if (/hood|kapuze/.test(t)) return 'hoodie';
  if (/tasche|beutel|\bbag|tote/.test(t)) return 'bag';
  if (/polo/.test(t)) return 'polo';
  if (/sweat|pullover|pulli|crewneck/.test(t)) return 'sweat';
  if (/tank|\btop\b|tr(ä|ae)gershirt|muscle/.test(t)) return 'tank';
  if (/long ?sleeve|langarm|\blang/.test(t)) return 'longsleeve';
  if (/damen|lady|ladies|women|woman|frauen|girl|tailliert/.test(t)) return 'tshirt_damen';
  return 'tshirt';
}
// Größe für das Mockup: die am häufigsten bestellte, die es in der Maßtabelle gibt
function garmentSizeForPosition(p, key) {
  const def = GARMENTS[key] || GARMENTS.tshirt, keys = Object.keys(def.sizes);
  if (keys.length === 1) return keys[0];
  const g = (p && p.groessen) || {};
  let best = null, bn = 0;
  for (const s of GAR_SIZE_ORDER.concat(Object.keys(g))) {
    const k = garNormSize(s), n = +g[s] || 0;
    if (n > bn && def.sizes[k]) { best = k; bn = n; }
  }
  return best || def.defSize;
}

// Geometrie einer Ansicht (cm, Garment-System)
function garmentGeometry(key, view, size) {
  const G = garGet(key, view, size), Z = garZonesFor(G.key, G.size), zones = {};
  for (const k in Z) if (Z[k].view === G.view) zones[k] = Object.assign({}, Z[k]);
  const seams = [];
  for (const s of G.seams) for (let i = 1; i < s.pts.length; i++) {
    const a = s.pts[i - 1], b = s.pts[i];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.05) continue;
    seams.push({ x1: garR1(a[0]), y1: garR1(a[1]), x2: garR1(b[0]), y2: garR1(b[1]), kind: s.kind });
  }
  return {
    key: G.key, view: G.view, size: G.size, name: GARMENTS[G.key].name,
    bbox: Object.assign({}, G.bbox), chestW: G.w, length: G.l,
    collar: { y0: garR1(G.collarY || 0) }, zones, seams,
    pocket: G.pocket ? { top: garR1(G.pocket.top), bottom: garR1(G.pocket.bottom), x: garR1(G.pocket.bx) } : null,
    zip: G.zip ? { y0: garR1(G.zip.y0), y1: garR1(G.zip.y1), w: G.zip.tape * 2 } : null
  };
}

// ======================= Zeichnen: Grundbausteine =======================
function garScaleOf(ctx) { try { const m = ctx.getTransform(); return Math.hypot(m.a, m.b) || 1; } catch (e) { return 1; } }
// Weiche (unscharfe) Linie über den Schatten-Trick: die Linie selbst liegt weit außerhalb, nur ihr Schatten ist sichtbar
function garBlurStroke(ctx, path, color, wd, blur) {
  let m; try { m = ctx.getTransform(); } catch (e) { m = { a: 1, b: 0, c: 0, d: 1 }; }
  const det = (m.a * m.d - m.b * m.c) || 1, OFF = 40000, sc = Math.hypot(m.a, m.b) || 1;
  ctx.save();
  ctx.shadowColor = color; ctx.shadowBlur = Math.max(0.5, blur * sc); ctx.shadowOffsetX = OFF; ctx.shadowOffsetY = 0;
  ctx.translate(-OFF * m.d / det, OFF * m.b / det);
  ctx.lineWidth = wd; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#000';
  ctx.stroke(path);
  ctx.restore();
}
function garInnerShadow(ctx, path, color, blur, offY) {
  const sc = garScaleOf(ctx);
  ctx.save(); ctx.clip(path);
  ctx.shadowColor = color; ctx.shadowBlur = blur * sc; ctx.shadowOffsetY = (offY || 0) * sc; ctx.shadowOffsetX = 0;
  const p = new Path2D(); p.rect(-600, -600, 1200, 1200); p.addPath(path);
  ctx.fillStyle = '#000'; ctx.fill(p, 'evenodd');
  ctx.restore();
}
function garDrop(ctx, path, a, blur, off) {
  const sc = garScaleOf(ctx);
  ctx.save();
  ctx.shadowColor = 'rgba(16,20,28,' + a + ')'; ctx.shadowBlur = blur * sc; ctx.shadowOffsetX = off * 0.25 * sc; ctx.shadowOffsetY = off * sc;
  ctx.fillStyle = '#888'; ctx.fill(path);
  ctx.shadowColor = 'rgba(16,20,28,' + (a * 0.7) + ')'; ctx.shadowBlur = 0.35 * sc; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0.12 * sc;
  ctx.fill(path);
  ctx.restore();
}
function garEdge(ctx, path, pal, px, k) { ctx.save(); ctx.lineWidth = (k || 1.1) * px; ctx.strokeStyle = pal.edge; ctx.lineJoin = 'round'; ctx.stroke(path); ctx.restore(); }
function garDrawFolds(ctx, folds, pal, k) {
  for (const f of folds) {
    const a = Math.min(0.95, (f.type === 'hi' ? pal.hiA * 1.25 : pal.shA * 1.1) * f.a * (k || 1));
    garBlurStroke(ctx, garSmoothPath(f.pts), f.type === 'hi' ? pal.hi(a) : pal.sh(a), f.wd, f.bl);
  }
}
function garStitch(ctx, pts, pal, px, close) {
  ctx.save(); ctx.setLineDash([0.3, 0.2]); ctx.lineCap = 'butt';
  ctx.lineWidth = Math.max(0.05, 0.9 * px); ctx.strokeStyle = pal.stitch;
  ctx.stroke(garPolyPath(pts, close)); ctx.restore();
}
function garGroove(ctx, pts, pal, px, k) {
  const p = garPolyPath(pts);
  garBlurStroke(ctx, p, pal.sh(Math.min(0.9, pal.shA * 1.5 * (k || 1))), 0.3, 0.45);
  ctx.save();
  ctx.lineWidth = Math.max(0.06, px); ctx.strokeStyle = pal.groove; ctx.stroke(p);
  ctx.translate(0, 0.09); ctx.strokeStyle = pal.grooveHi; ctx.lineWidth = Math.max(0.04, 0.7 * px); ctx.stroke(p);
  ctx.restore();
}

// Stoffstruktur (Rauschen), meliert oder Canvas-Gewebe – einmal erzeugt, dann als Muster wiederverwendet
const GAR_TEX = {};
function garTexCanvas(kind) {
  if (GAR_TEX[kind] !== undefined) return GAR_TEX[kind];
  if (typeof document === 'undefined') return (GAR_TEX[kind] = null);
  const N = 128, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const c = cv.getContext('2d'), im = c.createImageData(N, N), d = im.data;
  let seed = kind === 'heather' ? 7 : kind === 'canvas' ? 13 : 3;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = (y * N + x) * 4, light = rnd() > 0.5;
    let a = rnd() * 26;
    if (kind === 'jersey') a += (x % 3 === 0 ? 9 : 0) + (y % 2 === 0 ? 4 : 0);
    if (kind === 'canvas') a = 5 + rnd() * 14 + (((x >> 1) + (y >> 1)) % 2 ? 14 : 0);
    const v = light ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = a;
  }
  if (kind === 'heather') {
    for (let k = 0; k < N * N * 0.05; k++) {
      const x = Math.floor(rnd() * N), y = Math.floor(rnd() * N), len = 1 + Math.floor(rnd() * 3), light = rnd() > 0.45;
      for (let j = 0; j < len; j++) { const i = (y * N + ((x + j) % N)) * 4; d[i] = d[i + 1] = d[i + 2] = light ? 245 : 40; d[i + 3] = 35 + rnd() * 45; }
    }
  }
  c.putImageData(im, 0, 0);
  return (GAR_TEX[kind] = cv);
}
function garTexFill(ctx, path, pal, o, kind, alpha) {
  kind = kind || (pal.heather ? 'heather' : 'jersey');
  const cv = garTexCanvas(kind); if (!cv) return;
  const pat = ctx.createPattern(cv, 'repeat'); if (!pat) return;
  const k = (kind === 'canvas' ? 1.1 : 1) / o.scale;
  try { pat.setTransform(new DOMMatrix([k, 0, 0, k, 0, 0])); } catch (e) { /* ältere Browser: Muster im cm-Raster */ }
  ctx.save(); ctx.clip(path);
  ctx.globalAlpha = alpha || (kind === 'heather' ? 0.75 : pal.dark ? 0.42 : 0.45);
  ctx.fillStyle = pat; ctx.fillRect(-120, -80, 240, 260);
  ctx.restore();
}
// Text in Bildschirmpixeln (kleine Schriftgrößen in cm-Einheiten werden sonst unscharf)
function garText(ctx, txt, x, y, sizeCm, color, weight, align) {
  let m; try { m = ctx.getTransform(); } catch (e) { return; }
  const sc = Math.hypot(m.a, m.b) || 1, fs = sizeCm * sc;
  if (fs < 3) return;
  const X = m.a * x + m.c * y + m.e, Y = m.b * x + m.d * y + m.f;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.font = (weight || 600) + ' ' + fs.toFixed(1) + 'px ' + GAR_FONT;
  ctx.fillStyle = color; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(txt, X, Y);
  ctx.restore();
}

// Rippstrick-Struktur: feine helle/dunkle Linien
function garRibLines(ctx, lines, pal, px) {
  const d = new Path2D(), li = new Path2D();
  for (const [a, b, light] of lines) { const p = light ? li : d; p.moveTo(a[0], a[1]); p.lineTo(b[0], b[1]); }
  ctx.save(); ctx.lineCap = 'butt';
  ctx.lineWidth = Math.max(0.07, 0.8 * px); ctx.strokeStyle = pal.ribD; ctx.stroke(d);
  ctx.lineWidth = Math.max(0.05, 0.6 * px); ctx.strokeStyle = pal.ribL; ctx.stroke(li);
  ctx.restore();
}
function garRadialRibs(pts, c, len, step) {
  const out = [];
  garResample(pts, step).forEach((p, i) => {
    const n = garNorm([p[0] - c[0], p[1] - c[1]]);
    out.push([[p[0] - n[0] * 0.4, p[1] - n[1] * 0.4], [p[0] + n[0] * len, p[1] + n[1] * len], i % 2 === 1]);
  });
  return out;
}

// ======================= Zeichnen: Oberteile =======================
function garDrawTop(ctx, G, pal, o) {
  const P = G.P, st = G.st, px = o.px, det = o.detail;
  // Kapuze hinter dem Körper (Vorderansicht)
  if (P.hoodShell) {
    if (o.shadow) garDrop(ctx, P.hoodShell, 0.2, 1.6, 0.5);
    ctx.fillStyle = pal.hex; ctx.fill(P.hoodShell);
    ctx.save(); ctx.clip(P.hoodShell);
    const hw = G.hood.hw, g = ctx.createLinearGradient(-hw, 0, hw, 0);
    g.addColorStop(0, pal.sh(pal.shA * 1.4)); g.addColorStop(0.3, pal.sh(pal.shA * 0.5)); g.addColorStop(0.5, pal.sh(pal.shA * 0.3));
    g.addColorStop(0.7, pal.sh(pal.shA * 0.5)); g.addColorStop(1, pal.sh(pal.shA * 1.5));
    ctx.fillStyle = g; ctx.fillRect(-hw - 2, -G.hood.hT - 2, 2 * hw + 4, G.hood.hT + 8);
    ctx.restore();
    garInnerShadow(ctx, P.hoodShell, pal.sh(Math.min(0.9, pal.shA * 2)), 1.0);
    if (det) garTexFill(ctx, P.hoodShell, pal, o);
    garEdge(ctx, P.hoodShell, pal, px);
  }
  // Körper
  if (o.shadow) garDrop(ctx, P.body, 0.26, 1.8, 0.6);
  ctx.fillStyle = pal.hex; ctx.fill(P.body);
  ctx.save(); ctx.clip(P.body);
  garBodyLight(ctx, G, pal);
  if (det) garDrawFolds(ctx, G.folds, pal, 1);
  ctx.restore();
  // Ärmel
  if (G.sl) for (const side of [1, -1]) {
    const sp = side > 0 ? P.sleeveR : P.sleeveL;
    ctx.save(); ctx.clip(P.body); ctx.clip(sp);
    garSleeveLight(ctx, G, pal, side);
    if (det) garDrawFolds(ctx, garSleeveFolds(G, side), pal, 1);
    ctx.restore();
  }
  // Bündchen
  if (P.band) garDrawBand(ctx, G, pal, o);
  if (P.cuffR) { garDrawCuff(ctx, G, pal, o, 1); garDrawCuff(ctx, G, pal, o, -1); }
  // Hals
  if (P.inside && !P.collar) garDrawCrewFront(ctx, G, pal, o);
  if (P.bandBack) garDrawCrewBack(ctx, G, pal, o);
  // Kantenschatten und Stoffstruktur
  garInnerShadow(ctx, P.body, pal.sh(Math.min(0.9, pal.shA * 2.2)), 1.0);
  if (det) garTexFill(ctx, P.body, pal, o);
  if (det) garDrawTopSeams(ctx, G, pal, o);
  if (G.pocket) garDrawPockets(ctx, G, pal, o);
  if (G.zip) garDrawZip(ctx, G, pal, o);
  garEdge(ctx, P.body, pal, px);
  if (P.collar) garDrawPoloFront(ctx, G, pal, o);
  if (P.collarBack) garDrawPoloBack(ctx, G, pal, o);
  if (P.lining) garDrawHoodFront(ctx, G, pal, o);
  if (P.hoodBack) garDrawHoodBack(ctx, G, pal, o);
  if (G.cords) garDrawCords(ctx, G, pal, o);
}

function garBodyLight(ctx, G, pal) {
  const w2 = G.w2, l = G.l;
  let g = ctx.createLinearGradient(0, -3, 0, l);
  g.addColorStop(0, pal.hi(pal.hiA * 0.8)); g.addColorStop(0.32, pal.hi(0)); g.addColorStop(0.72, pal.sh(0)); g.addColorStop(1, pal.sh(pal.shA * 0.6));
  ctx.fillStyle = g; ctx.fillRect(-90, -40, 180, l + 50);
  g = ctx.createLinearGradient(-w2 - 4, 0, w2 + 4, 0);
  g.addColorStop(0, pal.sh(pal.shA * 0.75)); g.addColorStop(0.2, pal.sh(0)); g.addColorStop(0.42, pal.hi(pal.hiA * 0.55));
  g.addColorStop(0.6, pal.hi(0)); g.addColorStop(0.82, pal.sh(0)); g.addColorStop(1, pal.sh(pal.shA * 0.85));
  ctx.fillStyle = g; ctx.fillRect(-90, -40, 180, l + 50);
}
function garSleeveLight(ctx, G, pal, side) {
  const s = G.sl, T = garLerp(s.S, s.E1, 0.5), B = garLerp(s.A, s.E2, 0.5);
  const g = ctx.createLinearGradient(T[0] * side, T[1], B[0] * side, B[1]);
  g.addColorStop(0, pal.hi(pal.hiA * 0.9)); g.addColorStop(0.4, pal.hi(0)); g.addColorStop(0.7, pal.sh(0)); g.addColorStop(1, pal.sh(pal.shA * 0.75));
  ctx.fillStyle = g; ctx.fillRect(-90, -40, 180, G.l + 50);
  // Schatten an der Armlochnaht
  garBlurStroke(ctx, garPolyPath(G.armhole.map(p => [p[0] * side, p[1]])), pal.sh(pal.shA * 0.9), 0.8, 1.4);
}
function garDrawBand(ctx, G, pal, o) {
  const P = G.P, l = G.l, st = G.st;
  ctx.save(); ctx.clip(P.body); ctx.clip(P.band);
  ctx.fillStyle = pal.sh(pal.shA * 0.35); ctx.fillRect(-90, l - st.band - 3, 180, st.band + 6);
  if (o.detail) {
    const lines = [];
    for (let x = -G.w2 - 2, i = 0; x <= G.w2 + 2; x += 0.32, i++) lines.push([[x, l - st.band - 3], [x, l + 1], i % 2 === 1]);
    garRibLines(ctx, lines, pal, o.px);
  }
  const g = ctx.createLinearGradient(0, l - st.band, 0, l);
  g.addColorStop(0, pal.sh(pal.shA * 0.9)); g.addColorStop(0.25, pal.hi(pal.hiA * 0.5)); g.addColorStop(0.75, pal.sh(0)); g.addColorStop(1, pal.sh(pal.shA * 0.6));
  ctx.fillStyle = g; ctx.fillRect(-90, l - st.band - 3, 180, st.band + 6);
  ctx.restore();
}
function garDrawCuff(ctx, G, pal, o, side) {
  const s = G.sl, P = G.P, path = side > 0 ? P.cuffR : P.cuffL, c = G.st.cuff || G.st.cuffRib;
  ctx.save(); ctx.clip(P.body); ctx.clip(path);
  ctx.fillStyle = pal.sh(pal.shA * 0.35); ctx.fill(path);
  if (o.detail) {
    const lines = [], n = Math.round(s.so / 0.3);
    for (let i = 0; i <= n + 4; i++) {
      const p = garLerp(s.E1, s.E2, (i - 2) / n), a = [p[0] + s.dir[0], p[1] + s.dir[1]], b = [p[0] - s.dir[0] * (c + 2.5), p[1] - s.dir[1] * (c + 2.5)];
      lines.push([[a[0] * side, a[1]], [b[0] * side, b[1]], i % 2 === 1]);
    }
    garRibLines(ctx, lines, pal, o.px);
  }
  garBlurStroke(ctx, garPolyPath(G.cuffLine.map(p => [p[0] * side, p[1]])), pal.sh(pal.shA * 1.1), 0.5, 0.8);
  ctx.restore();
}
function garDrawCrewFront(ctx, G, pal, o) {
  const P = G.P, st = G.st, sc = garScaleOf(ctx);
  // Innenseite (Rückenteil von innen)
  ctx.fillStyle = pal.inside; ctx.fill(P.inside);
  ctx.save(); ctx.clip(P.inside);
  const g = ctx.createLinearGradient(0, st.topC, 0, G.fo);
  g.addColorStop(0, 'rgba(0,0,0,0.04)'); g.addColorStop(1, 'rgba(0,0,0,0.32)');
  ctx.fillStyle = g; ctx.fillRect(-20, -2, 40, G.fo + 3);
  if (o.detail) garLabel(ctx, G, pal, o);
  ctx.restore();
  garInnerShadow(ctx, P.inside, 'rgba(0,0,0,0.45)', 0.8, 0.25);
  // hinteres Bündchen (Innenseite)
  ctx.save(); ctx.fillStyle = pal.hex; ctx.fill(P.bandB); ctx.clip(P.bandB);
  ctx.fillStyle = pal.sh(pal.shA * 1.2); ctx.fill(P.bandB);
  if (o.detail) garRibLines(ctx, garRadialRibs(G.innerPts, [0, -14], st.rb + 0.8, 0.3), pal, o.px);
  ctx.restore();
  // vorderes Bündchen
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 0.5 * sc; ctx.shadowOffsetY = 0.2 * sc;
  ctx.fillStyle = pal.hex; ctx.fill(P.bandF); ctx.restore();
  ctx.save(); ctx.clip(P.bandF);
  ctx.fillStyle = pal.sh(pal.shA * 0.25); ctx.fill(P.bandF);
  if (o.detail) garRibLines(ctx, garRadialRibs(G.openPts, [0, -G.fo * 0.4], st.rb + 1, 0.3), pal, o.px);
  garBlurStroke(ctx, garPolyPath(G.openPts), pal.hi(Math.min(0.9, pal.hiA * 1.6)), 0.35, 0.35);
  garBlurStroke(ctx, garPolyPath(G.collarSeam), pal.sh(pal.shA * 1.2), 0.3, 0.45);
  ctx.restore();
  ctx.save(); ctx.lineWidth = 0.9 * o.px; ctx.strokeStyle = pal.edge; ctx.stroke(garPolyPath(G.openPts)); ctx.restore();
}
function garDrawCrewBack(ctx, G, pal, o) {
  const P = G.P, st = G.st;
  ctx.save(); ctx.clip(P.bandBack);
  ctx.fillStyle = pal.sh(pal.shA * 0.3); ctx.fill(P.bandBack);
  if (o.detail) garRibLines(ctx, garRadialRibs(G.topPts, [0, -16], st.rb + 1, 0.3), pal, o.px);
  garBlurStroke(ctx, garPolyPath(G.topPts), pal.hi(Math.min(0.9, pal.hiA * 1.5)), 0.35, 0.4);
  garBlurStroke(ctx, garPolyPath(G.collarSeam), pal.sh(pal.shA * 1.1), 0.3, 0.45);
  ctx.restore();
  // angedeutetes Nacken-Etikett (Steppnaht scheint durch)
  if (o.detail) {
    const y = G.labelY + 0.1;
    ctx.save(); ctx.clip(P.body);
    ctx.fillStyle = pal.dark ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.035)';
    ctx.fillRect(-2.4, y, 4.8, 2.6);
    ctx.globalAlpha = 0.45;
    garStitch(ctx, [[-2.4, y], [-2.4, y + 2.6], [2.4, y + 2.6], [2.4, y]], pal, o.px);
    ctx.restore();
  }
}
function garLabel(ctx, G, pal, o) {
  const y = G.labelY + 0.05, w = 4.6, h = Math.min(2.8, G.fo - G.labelY - 1.2);
  if (h < 1) return;
  const lc = pal.L > 0.85 ? '#2d3038' : '#f4f3ef', tc = pal.L > 0.85 ? 'rgba(255,255,255,.85)' : 'rgba(40,44,52,.75)';
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 0.3 * garScaleOf(ctx); ctx.shadowOffsetY = 0.1 * garScaleOf(ctx);
  ctx.fillStyle = lc; ctx.fillRect(-w / 2, y, w, h);
  ctx.restore();
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, 'rgba(0,0,0,0.18)'); g.addColorStop(0.4, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.12)');
  ctx.fillStyle = g; ctx.fillRect(-w / 2, y, w, h);
  garText(ctx, G.size, 0, y + h * 0.58, Math.min(1.1, h * 0.55), tc, 700);
}
function garDrawTopSeams(ctx, G, pal, o) {
  const st = G.st, px = o.px;
  ctx.save(); ctx.clip(G.P.body);
  for (const s of G.seams) {
    if (s.kind === 'schulter') garGroove(ctx, garShiftPts(s.pts, 0, G.front ? 0.35 : 0.3), pal, px, 0.6);
    if (s.kind === 'aermel') {
      garGroove(ctx, s.pts, pal, px, 0.8);
      if (st.ahIn < 1 || st.sleeve === 'none') {
        const sgn = s.pts[0][0] > 0 ? 1 : -1;
        garStitch(ctx, s.pts.map(p => [p[0] - 0.45 * sgn * (st.sleeve === 'none' ? 2.2 : 1), p[1] + (st.sleeve === 'none' ? 0.3 : 0)]), pal, px);
      }
    }
  }
  if (G.sleeveHem) for (const side of [1, -1]) {
    const mk = seg => seg.map(p => [p[0] * side, p[1]]);
    garStitch(ctx, mk(G.sleeveHem[0]), pal, px); garStitch(ctx, mk(G.sleeveHem[1]), pal, px);
    const s = G.sl, e = [[s.E1[0] * side, s.E1[1]], [s.E2[0] * side, s.E2[1]]];
    garBlurStroke(ctx, garPolyPath(mk(G.sleeveHem[1])), pal.sh(pal.shA * 0.6), 0.25, 0.4);
    garBlurStroke(ctx, garPolyPath(e), pal.hi(pal.hiA * 0.8), 0.4, 0.5);
  }
  if (G.st.cuffRib && G.cuffLine) for (const side of [1, -1]) garGroove(ctx, G.cuffLine.map(p => [p[0] * side, p[1]]), pal, px, 0.6);
  if (G.cuffLine && st.cuff) for (const side of [1, -1]) {
    const s = G.sl, c = st.cuff + 0.45, a = [G.cuffLine[0][0] - s.dir[0] * 0.45, G.cuffLine[0][1] - s.dir[1] * 0.45], b = [G.cuffLine[1][0] - s.ud[0] * 0.45, G.cuffLine[1][1] - s.ud[1] * 0.45];
    if (c) garStitch(ctx, [[a[0] * side, a[1]], [b[0] * side, b[1]]], pal, px);
  }
  if (G.hemStitch) {
    G.hemStitch.forEach(h => garStitch(ctx, h, pal, px));
    garBlurStroke(ctx, garPolyPath(G.hemStitch[1]), pal.sh(pal.shA * 0.5), 0.25, 0.45);
  }
  if (G.bandLine) garGroove(ctx, G.bandLine, pal, px, 0.8);
  G.stitches.forEach(s => garStitch(ctx, s, pal, px));
  if (G.collarSeam && !G.P.collar) garGroove(ctx, G.collarSeam, pal, px, 0.5);
  if (G.armholeStitch) { garStitch(ctx, G.armholeStitch, pal, px); garStitch(ctx, garMirrorPts(G.armholeStitch), pal, px); }
  // Seitenschlitze beim Polo
  if (st.vents) for (const side of [1, -1]) {
    const x = (G.hemX - 0.9) * side, y0 = G.l - st.vents;
    garGroove(ctx, [[x + 0.9 * side, y0 - 0.2], [x + 0.9 * side, G.l + 0.5]], pal, px, 1);
    garStitch(ctx, [[x, G.l], [x, y0], [x + 0.9 * side, y0]], pal, px);
    ctx.save(); ctx.fillStyle = pal.stitch; ctx.fillRect(Math.min(x, x + 0.9 * side), y0 - 0.15, 0.9, 0.3); ctx.restore();
  }
  ctx.restore();
}
function garDrawPockets(ctx, G, pal, o) {
  const pk = G.pocket, px = o.px;
  // Schatten in den Taschenöffnungen
  ctx.save(); ctx.clip(G.P.body);
  pk.open.forEach(op => {
    const sg = op[op.length - 1][0] > 0 ? 1 : -1;
    garBlurStroke(ctx, garSmoothPath(garShiftPts(op, 0.35 * sg, 0.15)), pal.sh(Math.min(0.95, pal.shA * 3)), 0.6, 0.6);
  });
  ctx.restore();
  pk.paths.forEach(p => {
    if (o.shadow) { ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 0.6 * garScaleOf(ctx); ctx.shadowOffsetY = 0.2 * garScaleOf(ctx); ctx.fillStyle = pal.hex; ctx.fill(p); ctx.restore(); }
    ctx.fillStyle = pal.hex; ctx.fill(p);
    ctx.save(); ctx.clip(p);
    const g = ctx.createLinearGradient(0, pk.top, 0, pk.bottom);
    g.addColorStop(0, pal.hi(pal.hiA * 0.9)); g.addColorStop(0.3, pal.hi(0)); g.addColorStop(1, pal.sh(pal.shA * 0.7));
    ctx.fillStyle = g; ctx.fillRect(-60, pk.top - 1, 120, pk.bottom - pk.top + 2);
    const g2 = ctx.createLinearGradient(-pk.bx, 0, pk.bx, 0);
    g2.addColorStop(0, pal.sh(pal.shA * 0.6)); g2.addColorStop(0.25, pal.sh(0)); g2.addColorStop(0.75, pal.sh(0)); g2.addColorStop(1, pal.sh(pal.shA * 0.6));
    ctx.fillStyle = g2; ctx.fillRect(-60, pk.top - 1, 120, pk.bottom - pk.top + 2);
    if (o.detail) {
      garDrawFolds(ctx, [
        { type: 'sh', a: 0.5, wd: 0.8, bl: 1.4, pts: [[-pk.tx * 0.6, pk.top + 4], [0, pk.top + 6.5], [pk.tx * 0.7, pk.top + 4.5]] },
        { type: 'hi', a: 0.5, wd: 1.0, bl: 1.6, pts: [[-pk.tx * 0.7, pk.top + 2.5], [0, pk.top + 4.6], [pk.tx * 0.6, pk.top + 2.8]] }
      ], pal, 1);
      garTexFill(ctx, p, pal, o);
    }
    ctx.restore();
    garInnerShadow(ctx, p, pal.sh(Math.min(0.9, pal.shA * 1.6)), 0.6);
    garEdge(ctx, p, pal, px, 0.9);
  });
  if (o.detail) {
    ctx.save(); ctx.clip(G.P.body);
    const top = G.st.zip ? [[[1.3, pk.top + 0.6], [pk.tx + 0.1, pk.top + 0.6]], [[-1.3, pk.top + 0.6], [-pk.tx - 0.1, pk.top + 0.6]]] : [[[-pk.tx - 0.1, pk.top + 0.6], [pk.tx + 0.1, pk.top + 0.6]]];
    top.forEach(t => garStitch(ctx, t, pal, px));
    pk.open.forEach(op => { const sg = op[0][0] > 0 ? 1 : -1; garStitch(ctx, garShiftPts(op, -0.8 * sg, 0), pal, px); });
    for (const sg of [1, -1]) garStitch(ctx, [[(pk.bx - 0.5) * sg, pk.top + pk.oh + 0.5], [(pk.bx - 0.5) * sg, pk.bottom]], pal, px);
    ctx.restore();
  }
}
function garMetal(ctx, x0, y0, x1, y1, dark) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  if (dark) { g.addColorStop(0, '#2a2c30'); g.addColorStop(0.5, '#5a5e66'); g.addColorStop(1, '#1d1f22'); }
  else { g.addColorStop(0, '#8e939b'); g.addColorStop(0.45, '#e8eaee'); g.addColorStop(1, '#7c8188'); }
  return g;
}
function garDrawZip(ctx, G, pal, o) {
  const z = G.zip, px = o.px, t = z.tape;
  ctx.save(); ctx.clip(G.P.body);
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 0.4 * garScaleOf(ctx);
  ctx.fillStyle = garRgba(garMixRgb(pal.c, [0, 0, 0], 0.12), 1); ctx.fillRect(-t, z.y0, 2 * t, z.y1 - z.y0); ctx.restore();
  if (o.detail) {
    for (const sg of [1, -1]) garStitch(ctx, [[0.95 * sg, z.y0], [0.95 * sg, z.y1]], pal, px);
    ctx.fillStyle = garMetal(ctx, -0.4, 0, 0.4, 0, false);
    const pl = new Path2D();
    for (let y = z.y0 + 1; y < z.y1 - 0.2; y += 0.34) { pl.rect(-0.42, y, 0.46, 0.2); pl.rect(-0.04, y + 0.17, 0.46, 0.2); }
    ctx.fill(pl);
  } else { ctx.fillStyle = '#9aa0a8'; ctx.fillRect(-0.4, z.y0, 0.8, z.y1 - z.y0); }
  garEdge(ctx, garPolyPath([[-t, z.y0], [-t, z.y1]]), pal, px, 0.8); garEdge(ctx, garPolyPath([[t, z.y0], [t, z.y1]]), pal, px, 0.8);
  ctx.restore();
  // Schieber und Zipper
  const y = z.y0 + 0.6, sc = garScaleOf(ctx);
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 0.4 * sc; ctx.shadowOffsetY = 0.15 * sc;
  ctx.fillStyle = garMetal(ctx, -0.8, 0, 0.8, 0, false);
  ctx.beginPath(); ctx.moveTo(-0.75, y); ctx.lineTo(0.75, y); ctx.lineTo(0.6, y + 2.2); ctx.lineTo(-0.6, y + 2.2); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-0.48, y + 1.4, 0.96, 3.8, 0.4) : ctx.rect(-0.48, y + 1.4, 0.96, 3.8); ctx.fill();
  ctx.restore();
  ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-0.2, y + 3.8, 0.4, 1.0, 0.2) : ctx.rect(-0.2, y + 3.8, 0.4, 1.0); ctx.fill();
  ctx.lineWidth = 0.8 * o.px; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.rect(-0.48, y + 1.4, 0.96, 3.8); ctx.stroke(); ctx.restore();
}
function garDrawPoloFront(ctx, G, pal, o) {
  const P = G.P, pk = G.placket, px = o.px, sc = garScaleOf(ctx);
  // Innenseite am Kragensteg
  ctx.fillStyle = pal.insideDeep; ctx.fill(P.inside);
  garInnerShadow(ctx, P.inside, 'rgba(0,0,0,0.5)', 0.7, 0.2);
  // Knopfleiste
  const pl = new Path2D(); pl.rect(-pk.pw, pk.pTop, pk.pw * 2, pk.pBot - pk.pTop);
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.28)'; ctx.shadowBlur = 0.35 * sc; ctx.shadowOffsetX = 0.12 * sc;
  ctx.fillStyle = pal.hex; ctx.fill(pl); ctx.restore();
  ctx.save(); ctx.clip(pl);
  const g = ctx.createLinearGradient(-pk.pw, 0, pk.pw, 0);
  g.addColorStop(0, pal.hi(pal.hiA * 0.6)); g.addColorStop(1, pal.sh(pal.shA * 0.5));
  ctx.fillStyle = g; ctx.fill(pl);
  if (o.detail) garTexFill(ctx, pl, pal, o);
  ctx.restore();
  if (o.detail) {
    garStitch(ctx, [[-pk.pw + 0.3, pk.pTop], [-pk.pw + 0.3, pk.pBot - 0.3], [pk.pw - 0.3, pk.pBot - 0.3], [pk.pw - 0.3, pk.pTop]], pal, px);
    garStitch(ctx, [[-pk.pw + 0.3, pk.pBot - 1.4], [pk.pw - 0.3, pk.pBot - 1.4]], pal, px);
  }
  garEdge(ctx, pl, pal, px, 0.9);
  // Knöpfe
  pk.buttons.forEach(y => garButton(ctx, 0, y, 0.55, pal, o));
  // Kragen
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.32)'; ctx.shadowBlur = 0.7 * sc; ctx.shadowOffsetY = 0.3 * sc;
  ctx.fillStyle = pal.hex; ctx.fill(P.collar); ctx.restore();
  ctx.save(); ctx.clip(P.collar);
  const gc = ctx.createLinearGradient(0, -1, 0, 13);
  gc.addColorStop(0, pal.hi(pal.hiA * 1.1)); gc.addColorStop(0.5, pal.hi(0)); gc.addColorStop(1, pal.sh(pal.shA * 0.6));
  ctx.fillStyle = gc; ctx.fill(P.collar);
  if (o.detail) {
    const lines = [];
    for (let a = -Math.PI * 0.98, i = 0; a <= 0.02; a += 0.022, i++) {
      const d = [Math.cos(a), -Math.sin(a)];
      lines.push([[d[0] * 2, 5 + d[1] * 2], [d[0] * 26, 5 + d[1] * 26], i % 2 === 1]);
    }
    for (let a = 0.05, i = 0; a <= Math.PI * 0.45; a += 0.03, i++) {
      for (const sg of [1, -1]) { const d = [Math.cos(a) * sg, Math.sin(a)]; lines.push([[d[0] * 2, 5 + d[1] * 2], [d[0] * 26, 5 + d[1] * 26], i % 2 === 1]); }
    }
    garRibLines(ctx, lines, pal, px);
    garTexFill(ctx, P.collar, pal, o);
  }
  ctx.restore();
  garInnerShadow(ctx, P.collar, pal.sh(Math.min(0.9, pal.shA * 1.6)), 0.5);
  garEdge(ctx, P.collar, pal, px);
}
function garDrawPoloBack(ctx, G, pal, o) {
  const P = G.P, px = o.px, sc = garScaleOf(ctx);
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 0.7 * sc; ctx.shadowOffsetY = 0.3 * sc;
  ctx.fillStyle = pal.hex; ctx.fill(P.collarBack); ctx.restore();
  ctx.save(); ctx.clip(P.collarBack);
  const g = ctx.createLinearGradient(0, -1, 0, 5.3);
  g.addColorStop(0, pal.hi(pal.hiA * 1.2)); g.addColorStop(0.6, pal.hi(0)); g.addColorStop(1, pal.sh(pal.shA * 0.7));
  ctx.fillStyle = g; ctx.fill(P.collarBack);
  if (o.detail) {
    garRibLines(ctx, garRadialRibs(G.collarFall, [0, -12], 9, 0.25).map(([a, b, li]) => [b, [a[0] + (a[0] - b[0]) * 0.1, a[1] + (a[1] - b[1]) * 0.1], li]), pal, px);
    garStitch(ctx, garShiftPts(G.collarFall, 0, -0.6), pal, px);
    garTexFill(ctx, P.collarBack, pal, o);
  }
  ctx.restore();
  garInnerShadow(ctx, P.collarBack, pal.sh(Math.min(0.9, pal.shA * 1.5)), 0.5);
  garEdge(ctx, P.collarBack, pal, px);
}
function garButton(ctx, x, y, r, pal, o) {
  const sc = garScaleOf(ctx);
  const bc = pal.L > 0.8 ? garMixRgb(pal.c, [0, 0, 0], 0.06) : garMixRgb(pal.c, [255, 255, 255], 0.1);
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 0.25 * sc; ctx.shadowOffsetY = 0.08 * sc;
  ctx.fillStyle = garRgba(bc, 1); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
  g.addColorStop(0, 'rgba(255,255,255,0.45)'); g.addColorStop(0.6, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 0.7 * o.px; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(x, y, r * 0.72, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  for (const dx of [-0.17, 0.17]) { ctx.beginPath(); ctx.arc(x + dx, y, 0.075, 0, Math.PI * 2); ctx.fill(); }
}
function garDrawHoodFront(ctx, G, pal, o) {
  const P = G.P, hd = G.hood, px = o.px, sc = garScaleOf(ctx);
  // Futter (Innenseite der Kapuze)
  ctx.fillStyle = pal.insideDeep; ctx.fill(P.lining);
  ctx.save(); ctx.clip(P.lining);
  const g = ctx.createRadialGradient(0, -hd.hT * 0.55, 1, 0, -hd.hT * 0.35, hd.hT * 0.9);
  g.addColorStop(0, 'rgba(0,0,0,0.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fill(P.lining);
  const g2 = ctx.createLinearGradient(0, 2, 0, G.hoodV);
  g2.addColorStop(0, 'rgba(255,255,255,0)'); g2.addColorStop(1, pal.dark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.12)');
  ctx.fillStyle = g2; ctx.fill(P.lining);
  ctx.restore();
  garInnerShadow(ctx, P.lining, 'rgba(0,0,0,0.6)', 1.3, 0.35);
  // Kapuzenrand
  const ring = new Path2D(); ring.addPath(P.ringOut); ring.addPath(P.lining);
  ctx.save();
  if (o.shadow) { ctx.shadowColor = 'rgba(0,0,0,0.32)'; ctx.shadowBlur = 0.9 * sc; ctx.shadowOffsetY = 0.35 * sc; }
  ctx.fillStyle = pal.hex; ctx.fill(ring, 'evenodd'); ctx.restore();
  ctx.save(); ctx.clip(ring, 'evenodd');
  const gr = ctx.createLinearGradient(0, -hd.hT, 0, G.hoodV + 3);
  gr.addColorStop(0, pal.hi(pal.hiA * 1.1)); gr.addColorStop(0.45, pal.hi(pal.hiA * 0.2)); gr.addColorStop(1, pal.sh(pal.shA * 0.5));
  ctx.fillStyle = gr; ctx.fill(ring, 'evenodd');
  const gs = ctx.createLinearGradient(-hd.ow - hd.r, 0, hd.ow + hd.r, 0);
  gs.addColorStop(0, pal.sh(pal.shA * 0.7)); gs.addColorStop(0.2, pal.sh(0)); gs.addColorStop(0.8, pal.sh(0)); gs.addColorStop(1, pal.sh(pal.shA * 0.8));
  ctx.fillStyle = gs; ctx.fill(ring, 'evenodd');
  if (o.detail) {
    garDrawFolds(ctx, [
      { type: 'hi', a: 0.8, wd: 1.0, bl: 1.2, pts: [[-hd.ow * 0.6, -hd.hT + 2.2], [0, -hd.hT + 1.7], [hd.ow * 0.6, -hd.hT + 2.2]] },
      { type: 'sh', a: 0.6, wd: 0.7, bl: 1.0, pts: [[hd.ow + 1.6, -hd.hT * 0.55], [hd.ow + 2.1, -hd.hT * 0.3], [hd.ow + 1.5, -2]] },
      { type: 'sh', a: 0.6, wd: 0.7, bl: 1.0, pts: [[-hd.ow - 1.4, -hd.hT * 0.6], [-hd.ow - 2.0, -hd.hT * 0.3], [-hd.ow - 1.6, -1]] }
    ], pal, 1);
    garTexFill(ctx, ring, pal, o);
    garStitch(ctx, G.ringStitch, pal, px, true);
  }
  ctx.restore();
  ctx.save(); ctx.lineWidth = 1.1 * px; ctx.strokeStyle = pal.edge; ctx.stroke(P.ringOut); ctx.stroke(P.lining); ctx.restore();
  // Überlappung der Kapuzenteile vorne
  if (!G.st.zip) {
    const vb = G.hoodV, ov = garPolyPath(garSample([['M', 0.4, vb - 0.15], ['Q', -1.2, vb + 1.3, -3.9, vb + 2.3]], 10));
    ctx.save(); ctx.clip(ring, 'evenodd');
    garBlurStroke(ctx, ov, 'rgba(0,0,0,' + (0.35 + pal.shA) + ')', 0.4, 0.5);
    ctx.lineWidth = 1.1 * px; ctx.strokeStyle = pal.edge; ctx.stroke(ov);
    ctx.restore();
  }
  // Ösen
  if (G.eyelets) G.eyelets.forEach(e => {
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 0.2 * sc;
    ctx.fillStyle = garMetal(ctx, e[0] - 0.45, e[1] - 0.45, e[0] + 0.45, e[1] + 0.45, false);
    ctx.beginPath(); ctx.arc(e[0], e[1], 0.42, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    ctx.fillStyle = pal.insideDeep; ctx.beginPath(); ctx.arc(e[0], e[1], 0.22, 0, Math.PI * 2); ctx.fill();
  });
}
function garDrawHoodBack(ctx, G, pal, o) {
  const P = G.P, hd = G.hood, px = o.px, sc = garScaleOf(ctx);
  ctx.save();
  if (o.shadow) { ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 1.3 * sc; ctx.shadowOffsetY = 0.55 * sc; }
  ctx.fillStyle = pal.hex; ctx.fill(P.hoodBack); ctx.restore();
  ctx.save(); ctx.clip(P.hoodBack);
  const g = ctx.createRadialGradient(-hd.hw * 0.25, -hd.hT * 0.65, 1, 0, -hd.hT * 0.4, hd.hT * 1.1);
  g.addColorStop(0, pal.hi(pal.hiA * 1.2)); g.addColorStop(0.5, pal.hi(0)); g.addColorStop(1, pal.sh(pal.shA * 0.9));
  ctx.fillStyle = g; ctx.fill(P.hoodBack);
  const gs = ctx.createLinearGradient(-hd.hw, 0, hd.hw, 0);
  gs.addColorStop(0, pal.sh(pal.shA * 0.9)); gs.addColorStop(0.25, pal.sh(0)); gs.addColorStop(0.75, pal.sh(0)); gs.addColorStop(1, pal.sh(pal.shA * 1.0));
  ctx.fillStyle = gs; ctx.fill(P.hoodBack);
  if (o.detail) {
    garDrawFolds(ctx, [
      { type: 'sh', a: 0.6, wd: 0.9, bl: 1.6, pts: [[-1.5, -hd.hT * 0.75], [-5.5, -hd.hT * 0.4], [-9, 1]] },
      { type: 'hi', a: 0.6, wd: 1.2, bl: 1.8, pts: [[-2.6, -hd.hT * 0.8], [-6.6, -hd.hT * 0.45], [-10.4, -1]] },
      { type: 'sh', a: 0.55, wd: 0.9, bl: 1.6, pts: [[1.5, -hd.hT * 0.7], [5.2, -hd.hT * 0.35], [8.5, 1.5]] },
      { type: 'hi', a: 0.45, wd: 1.2, bl: 1.8, pts: [[2.8, -hd.hT * 0.78], [6.6, -hd.hT * 0.42], [10.2, 0]] }
    ], pal, 1);
    garTexFill(ctx, P.hoodBack, pal, o);
    garGroove(ctx, [[0, -hd.hT - 1], [0, 6]], pal, px, 0.8);
    garStitch(ctx, [[0.45, -hd.hT], [0.45, 6]], pal, px); garStitch(ctx, [[-0.45, -hd.hT], [-0.45, 6]], pal, px);
  }
  ctx.restore();
  garInnerShadow(ctx, P.hoodBack, pal.sh(Math.min(0.9, pal.shA * 2)), 0.9);
  garEdge(ctx, P.hoodBack, pal, px);
}
function garDrawCords(ctx, G, pal, o) {
  const sc = garScaleOf(ctx), cc = pal.L > 0.85 ? garMixRgb(pal.c, [0, 0, 0], 0.04) : garMixRgb(pal.c, [255, 255, 255], 0.06);
  G.cords.forEach(c => {
    const pts = garSample([['M', c[0][0], c[0][1]], ['C', c[1][0], c[1][1], c[2][0], c[2][1], c[3][0], c[3][1]]], 16);
    const body = pts.slice(0, -4), tip = pts.slice(-5);
    const cord = garStrap(body, 0.75);
    ctx.save(); if (o.shadow) { ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 0.45 * sc; ctx.shadowOffsetX = 0.15 * sc; ctx.shadowOffsetY = 0.2 * sc; }
    ctx.fillStyle = garRgba(cc, 1); ctx.fill(cord); ctx.restore();
    ctx.save(); ctx.clip(cord);
    garBlurStroke(ctx, garPolyPath(garOffset(body, 0.15)), pal.hi(Math.min(0.9, pal.hiA * 2.2)), 0.2, 0.2);
    garBlurStroke(ctx, garPolyPath(garOffset(body, -0.3)), pal.sh(Math.min(0.9, pal.shA * 2)), 0.25, 0.25);
    ctx.restore();
    garEdge(ctx, cord, pal, o.px, 0.8);
    // Endstück (Aglet)
    const ag = garStrap(tip, 0.6);
    ctx.save(); ctx.fillStyle = garMetal(ctx, tip[0][0] - 0.4, 0, tip[0][0] + 0.4, 0, pal.L > 0.3); ctx.fill(ag); ctx.restore();
    garEdge(ctx, ag, pal, o.px, 0.7);
  });
}

// ======================= Zeichnen: Tasche und Schürze =======================
function garDrawBag(ctx, G, pal, o) {
  const P = G.P, px = o.px, w2 = G.w2, l = G.l, sc = garScaleOf(ctx);
  // Henkel (hinterer dunkler, vorderer)
  ctx.save(); ctx.fillStyle = garRgba(garMixRgb(pal.c, [0, 0, 0], 0.3), 1); ctx.fill(P.handleB); ctx.restore();
  garEdge(ctx, P.handleB, pal, px, 0.9);
  if (o.shadow) { ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 0.8 * sc; ctx.shadowOffsetY = 0.3 * sc; ctx.fillStyle = pal.hex; ctx.fill(P.handleF); ctx.restore(); }
  ctx.fillStyle = pal.hex; ctx.fill(P.handleF);
  ctx.save(); ctx.clip(P.handleF);
  const gh = ctx.createLinearGradient(0, -29, 0, 3);
  gh.addColorStop(0, pal.hi(pal.hiA)); gh.addColorStop(1, pal.sh(pal.shA * 0.9));
  ctx.fillStyle = gh; ctx.fillRect(-20, -32, 40, 36);
  if (o.detail) { garTexFill(ctx, P.handleF, pal, o, 'canvas'); G.handleStitch.forEach(s => garStitch(ctx, s, pal, px)); }
  ctx.restore();
  garEdge(ctx, P.handleF, pal, px);
  // Taschenkörper
  if (o.shadow) garDrop(ctx, P.body, 0.26, 1.6, 0.6);
  ctx.fillStyle = pal.hex; ctx.fill(P.body);
  ctx.save(); ctx.clip(P.body);
  let g = ctx.createLinearGradient(0, 0, 0, l);
  g.addColorStop(0, pal.sh(pal.shA * 0.5)); g.addColorStop(0.12, pal.hi(pal.hiA * 0.6)); g.addColorStop(0.6, pal.hi(0)); g.addColorStop(1, pal.sh(pal.shA * 0.6));
  ctx.fillStyle = g; ctx.fillRect(-w2 - 2, -2, G.w + 4, l + 4);
  g = ctx.createLinearGradient(-w2, 0, w2, 0);
  g.addColorStop(0, pal.sh(pal.shA * 0.8)); g.addColorStop(0.12, pal.sh(0)); g.addColorStop(0.88, pal.sh(0)); g.addColorStop(1, pal.sh(pal.shA * 0.9));
  ctx.fillStyle = g; ctx.fillRect(-w2 - 2, -2, G.w + 4, l + 4);
  if (o.detail) garDrawFolds(ctx, G.folds, pal, 1);
  // Saum oben
  const hb = new Path2D(); hb.rect(-w2 - 1, -1, G.w + 2, G.hemTop + 1);
  ctx.fillStyle = pal.hi(pal.hiA * 0.4); ctx.fill(hb);
  garBlurStroke(ctx, garPolyPath([[-w2, G.hemTop], [w2, G.hemTop]]), pal.sh(pal.shA * 1.4), 0.35, 0.5);
  ctx.restore();
  garInnerShadow(ctx, P.body, pal.sh(Math.min(0.9, pal.shA * 2)), 0.9);
  if (o.detail) {
    garTexFill(ctx, P.body, pal, o, 'canvas', 0.5);
    ctx.save(); ctx.clip(P.body);
    garGroove(ctx, [[-w2, G.hemTop], [w2, G.hemTop]], pal, px, 0.6);
    garStitch(ctx, [[-w2, G.hemTop - 0.5], [w2, G.hemTop - 0.5]], pal, px);
    // Henkel-Annähung (Kästchen mit Kreuz)
    for (const hx of [-G.handleX, G.handleX]) {
      const x0 = hx - G.handleW / 2 + 0.15, x1 = hx + G.handleW / 2 - 0.15, y0 = 0.4, y1 = G.hemTop - 0.4;
      garStitch(ctx, [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0], [x1, y1]], pal, px);
      garStitch(ctx, [[x1, y0], [x0, y1]], pal, px);
    }
    ctx.restore();
  }
  garEdge(ctx, P.body, pal, px);
}
function garDrawApron(ctx, G, pal, o) {
  const P = G.P, px = o.px, sc = garScaleOf(ctx);
  const strapCol = garRgba(garMixRgb(pal.c, [0, 0, 0], 0.08), 1);
  G.straps.forEach((s, i) => {
    const sp = garStrap(s, G.strapW);
    ctx.save(); if (o.shadow) { ctx.shadowColor = 'rgba(0,0,0,0.22)'; ctx.shadowBlur = 0.7 * sc; ctx.shadowOffsetY = 0.25 * sc; }
    ctx.fillStyle = strapCol; ctx.fill(sp); ctx.restore();
    ctx.save(); ctx.clip(sp);
    garBlurStroke(ctx, garPolyPath(garOffset(s, 0.5)), pal.hi(pal.hiA), 0.5, 0.5);
    if (o.detail) { garTexFill(ctx, sp, pal, o); garStitch(ctx, garOffset(s, G.strapW / 2 - 0.3), pal, px); garStitch(ctx, garOffset(s, -G.strapW / 2 + 0.3), pal, px); }
    ctx.restore();
    garEdge(ctx, sp, pal, px, 0.9);
    if (i > 0) { const e = s[s.length - 1]; garEdge(ctx, garPolyPath([[e[0] - 1.2, e[1]], [e[0] + 1.2, e[1]]]), pal, px); }
  });
  if (o.shadow) garDrop(ctx, P.body, 0.24, 1.8, 0.6);
  ctx.fillStyle = pal.hex; ctx.fill(P.body);
  ctx.save(); ctx.clip(P.body);
  let g = ctx.createLinearGradient(0, 0, 0, G.l);
  g.addColorStop(0, pal.hi(pal.hiA * 0.7)); g.addColorStop(0.4, pal.hi(0)); g.addColorStop(1, pal.sh(pal.shA * 0.6));
  ctx.fillStyle = g; ctx.fillRect(-40, -2, 80, G.l + 4);
  g = ctx.createLinearGradient(-G.w2, 0, G.w2, 0);
  g.addColorStop(0, pal.sh(pal.shA * 0.8)); g.addColorStop(0.15, pal.sh(0)); g.addColorStop(0.85, pal.sh(0)); g.addColorStop(1, pal.sh(pal.shA * 0.8));
  ctx.fillStyle = g; ctx.fillRect(-40, -2, 80, G.l + 4);
  if (o.detail) garDrawFolds(ctx, G.folds, pal, 1);
  ctx.restore();
  garInnerShadow(ctx, P.body, pal.sh(Math.min(0.9, pal.shA * 2)), 1.0);
  if (o.detail) {
    garTexFill(ctx, P.body, pal, o, 'canvas', 0.45);
    ctx.save(); ctx.clip(P.body); G.hemStitch.forEach(h => garStitch(ctx, h, pal, px)); ctx.restore();
  }
  // Tasche
  const pk = G.pocketA;
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 0.6 * sc; ctx.shadowOffsetY = 0.2 * sc; ctx.fillStyle = pal.hex; ctx.fill(P.pocket); ctx.restore();
  ctx.save(); ctx.clip(P.pocket);
  g = ctx.createLinearGradient(0, pk.y0, 0, pk.y1);
  g.addColorStop(0, pal.hi(pal.hiA * 0.8)); g.addColorStop(0.25, pal.hi(0)); g.addColorStop(1, pal.sh(pal.shA * 0.6));
  ctx.fillStyle = g; ctx.fill(P.pocket);
  if (o.detail) {
    garTexFill(ctx, P.pocket, pal, o, 'canvas', 0.45);
    garStitch(ctx, [[pk.x0, pk.y0 + 1.2], [pk.x1, pk.y0 + 1.2]], pal, px);
    garStitch(ctx, [[pk.x0 + 0.4, pk.y0 + 1.2], [pk.x0 + 0.4, pk.y1 - 0.4], [pk.x1 - 0.4, pk.y1 - 0.4], [pk.x1 - 0.4, pk.y0 + 1.2]], pal, px);
    garStitch(ctx, [[-0.2, pk.y0 + 1.2], [-0.2, pk.y1 - 0.4]], pal, px); garStitch(ctx, [[0.2, pk.y0 + 1.2], [0.2, pk.y1 - 0.4]], pal, px);
  }
  ctx.restore();
  garInnerShadow(ctx, P.pocket, pal.sh(Math.min(0.9, pal.shA * 1.5)), 0.5);
  garEdge(ctx, P.pocket, pal, px, 0.9);
  garEdge(ctx, P.body, pal, px);
}

// ======================= Öffentlich: zeichnen =======================
// opt = { scale: px pro cm, ox, oy: Pixelposition des Kragenpunkts, shadow: true, detail: true, heather: optional }
function drawGarment(ctx, key, view, size, colorHex, opt) {
  opt = Object.assign({ scale: 4, ox: 0, oy: 0, shadow: true, detail: true }, opt || {});
  const G = garGet(key, view, size);
  const pal = garPal(colorHex || '#f7f7f5', opt.heather);
  const o = { scale: opt.scale, px: 1 / opt.scale, shadow: opt.shadow !== false, detail: opt.detail !== false };
  ctx.save();
  ctx.translate(opt.ox, opt.oy); ctx.scale(opt.scale, opt.scale);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (G.st.type === 'bag') garDrawBag(ctx, G, pal, o);
  else if (G.st.type === 'apron') garDrawApron(ctx, G, pal, o);
  else garDrawTop(ctx, G, pal, o);
  ctx.restore();
  try { ctx.__garLast = { G, pal, o, scale: opt.scale, ox: opt.ox, oy: opt.oy }; } catch (e) { /* egal */ }
  return garmentGeometry(G.key, G.view, G.size);
}

// Bilder laden (mit Cache). garLoadImage(src) → Promise<HTMLImageElement|null>
const GAR_IMG = new Map();
function garLoadImage(src) {
  if (!src) return Promise.resolve(null);
  if (typeof HTMLImageElement !== 'undefined' && src instanceof HTMLImageElement) {
    return src.complete && src.naturalWidth ? Promise.resolve(src) : new Promise(res => { src.onload = () => res(src); src.onerror = () => res(null); });
  }
  if (GAR_IMG.size > 120) GAR_IMG.clear();
  if (!GAR_IMG.has(src)) {
    const e = { img: null, p: null };
    e.p = new Promise(res => {
      const i = new Image();
      i.onload = () => { e.img = i; res(i); };
      i.onerror = () => { GAR_IMG.delete(src); res(null); };
      i.src = src;
    });
    GAR_IMG.set(src, e);
  }
  return GAR_IMG.get(src).p;
}
function garImgSync(src) {
  if (!src) return null;
  if (typeof HTMLImageElement !== 'undefined' && src instanceof HTMLImageElement) return src.complete && src.naturalWidth ? src : null;
  if (typeof HTMLCanvasElement !== 'undefined' && src instanceof HTMLCanvasElement) return src;
  const e = GAR_IMG.get(src);
  if (e && e.img) return e.img;
  garLoadImage(src);   // für das nächste Zeichnen
  return null;
}
let garInkCv = null;
// Motiv zeichnen: x = Mitte, y = Oberkante (cm). opt = { scale, ox, oy, garmentColor }
function drawPrint(ctx, motif, opt) {
  if (!motif) return;
  opt = opt || {};
  const s = opt.scale || 4, ox = opt.ox || 0, oy = opt.oy || 0;
  const w = +motif.w || 0, h = +motif.h || 0; if (w <= 0 || h <= 0) return;
  const x0 = (+motif.x || 0) - w / 2, y0 = +motif.y || 0;
  const img = garImgSync(motif.img);
  const bg = opt.garmentColor || '#f7f7f5', dark = garLumHex(bg) < 0.45;
  const last = ctx.__garLast && Math.abs(ctx.__garLast.scale - s) < 1e-6 && Math.abs(ctx.__garLast.ox - ox) < 0.5 && Math.abs(ctx.__garLast.oy - oy) < 0.5 ? ctx.__garLast : null;
  ctx.save();
  ctx.translate(ox, oy); ctx.scale(s, s);
  if (img) {
    const sc = garScaleOf(ctx);
    let pw = Math.ceil(w * sc), ph = Math.ceil(h * sc);
    const f = Math.min(1, 2400 / Math.max(pw, ph)); pw = Math.max(1, Math.ceil(pw * f)); ph = Math.max(1, Math.ceil(ph * f));
    let src = img;
    if (last && opt.ink !== false && typeof document !== 'undefined') {
      if (!garInkCv) garInkCv = document.createElement('canvas');
      const cv = garInkCv; cv.width = pw; cv.height = ph;
      const c2 = cv.getContext('2d');
      c2.clearRect(0, 0, pw, ph);
      c2.drawImage(img, 0, 0, pw, ph);
      // Falten des Stoffs auf dem Druck (nur dort, wo Farbe ist)
      c2.globalCompositeOperation = 'source-atop';
      const k = pw / w;
      c2.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
      const ink = { hiA: 0.1, shA: 0.17, hi: a => 'rgba(255,255,255,' + a + ')', sh: a => 'rgba(0,0,0,' + a + ')' };
      garDrawFolds(c2, last.G.folds, ink, 0.85);
      if (last.G.sl) { garDrawFolds(c2, garSleeveFolds(last.G, 1), ink, 0.85); garDrawFolds(c2, garSleeveFolds(last.G, -1), ink, 0.85); }
      c2.setTransform(1, 0, 0, 1, 0, 0);
      const tex = garTexCanvas('jersey');
      if (tex) { c2.globalAlpha = 0.35; c2.fillStyle = c2.createPattern(tex, 'repeat'); c2.fillRect(0, 0, pw, ph); c2.globalAlpha = 1; }
      c2.globalCompositeOperation = 'source-over';
      src = cv;
    }
    ctx.globalAlpha = 0.95;
    if (src === img) ctx.drawImage(img, x0, y0, w, h); else ctx.drawImage(src, 0, 0, pw, ph, x0, y0, w, h);
    ctx.globalAlpha = 1;
  } else {
    const col = dark ? 'rgba(255,255,255,0.85)' : 'rgba(30,34,42,0.8)', solid = dark ? '#ffffff' : '#1d1e21';
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.08)' : 'rgba(20,30,50,0.06)'; ctx.fillRect(x0, y0, w, h);
    ctx.save(); ctx.setLineDash([0.6, 0.4]); ctx.lineWidth = Math.max(0.06, 1.2 / s); ctx.strokeStyle = col; ctx.strokeRect(x0, y0, w, h); ctx.restore();
    if (motif.pers) {
      garFitText(ctx, 'NAME', motif.x || 0, y0 + h * 0.24, w * 0.86, h * 0.3, solid, 800);
      garFitText(ctx, '10', motif.x || 0, y0 + h * 0.66, w * 0.8, h * 0.55, solid, 800);
    } else {
      const nm = String(motif.name || 'Motiv');
      garFitText(ctx, nm, motif.x || 0, y0 + h * 0.42, w * 0.86, Math.min(h * 0.22, 2.4), col, 700);
      garFitText(ctx, garNum(w) + ' × ' + garNum(h) + ' cm', motif.x || 0, y0 + h * 0.66, w * 0.86, Math.min(h * 0.16, 1.6), col, 500);
    }
  }
  // Kordeln des Hoodies liegen über dem Druck
  if (last && last.G.cords && opt.cords !== false) {
    const hit = last.G.cords.some(c => c.some(p => p[0] > x0 - 1 && p[0] < x0 + w + 1 && p[1] > y0 - 1 && p[1] < y0 + h + 1));
    if (hit) garDrawCords(ctx, last.G, last.pal, last.o);
  }
  ctx.restore();
}
// Text so groß wie möglich in ein Feld (cm) einpassen
function garFitText(ctx, txt, cx, cy, maxW, maxH, color, weight) {
  let m; try { m = ctx.getTransform(); } catch (e) { return; }
  const sc = Math.hypot(m.a, m.b) || 1;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  let fs = maxH * sc;
  ctx.font = weight + ' ' + fs.toFixed(1) + 'px ' + GAR_FONT;
  const tw = ctx.measureText(txt).width;
  if (tw > maxW * sc) fs *= maxW * sc / tw;
  ctx.restore();
  garText(ctx, txt, cx, cy, fs / sc, color, weight);
}

// Eigenes Foto als Vorlage: tpl = { img, pxPerCm, cx, cy, view, tint: false|'#hex' }
const GAR_TINT = new Map();
function drawTemplatePhoto(ctx, tpl, opt) {
  opt = opt || {};
  const s = opt.scale || 4, ox = opt.ox || 0, oy = opt.oy || 0;
  const geo = { key: 'foto', view: (tpl && tpl.view) || 'front', size: null, bbox: { x: 0, y: 0, w: 0, h: 0 }, chestW: null, length: null, collar: { y0: 0 }, zones: {}, seams: [] };
  try { ctx.__garLast = null; } catch (e) { /* egal */ }
  if (!tpl) return geo;
  const img = garImgSync(tpl.img); if (!img) return geo;
  const ppc = +tpl.pxPerCm || 10, W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  geo.bbox = { x: garR1(-(+tpl.cx || 0) / ppc), y: garR1(-(+tpl.cy || 0) / ppc), w: garR1(W / ppc), h: garR1(H / ppc) };
  let src = img;
  if (tpl.tint && typeof document !== 'undefined') {
    const ck = (typeof tpl.img === 'string' ? tpl.img.length + ':' + tpl.img.slice(-40) : W + 'x' + H) + '|' + tpl.tint;
    if (!GAR_TINT.has(ck)) {
      if (GAR_TINT.size > 10) GAR_TINT.clear();
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const c = cv.getContext('2d');
      c.drawImage(img, 0, 0);
      c.globalCompositeOperation = 'multiply'; c.fillStyle = tpl.tint; c.fillRect(0, 0, W, H);
      c.globalCompositeOperation = 'destination-in'; c.drawImage(img, 0, 0);
      GAR_TINT.set(ck, cv);
    }
    src = GAR_TINT.get(ck);
  }
  ctx.save();
  ctx.translate(ox, oy); ctx.scale(s, s);
  ctx.drawImage(src, -(+tpl.cx || 0) / ppc, -(+tpl.cy || 0) / ppc, W / ppc, H / ppc);
  ctx.restore();
  return geo;
}

// ======================= Öffentlich: Platzierung =======================
// Standardposition je Druckstelle – übliche Richtwerte aus der Textilveredelung:
//   Front/Brust Mitte: Oberkante ca. 7–8 cm unter der Kragennaht (Hoodie: 9–10 cm unter dem Kapuzenansatz)
//   Brust links/rechts: Motivmitte ca. 9–10 cm neben der Mitte, Oberkante ca. 2 cm unter der Kragennaht an dieser Stelle
//   Rücken: Oberkante 8–10 cm unter der Kragennaht, Nacken: 2–3 cm, Ärmel: Mitte des Ärmels (4–6 cm unter der Schulternaht)
//   Bauch: über der Hoodie-Tasche bzw. ca. 25 cm unter dem Kragenpunkt, Tasche: mittig, 8 cm unter der Oberkante
// Hinweis: Der Kragenpunkt (0,0) liegt auf Höhe HPS; die vordere Kragennaht liegt beim T-Shirt ca. 9 cm tiefer.
function defaultPlacement(key, ort, size, w, h) {
  key = GARMENTS[key] ? key : 'tshirt';
  const def = GARMENTS[key], st = GAR_STYLE[key];
  size = garNormSize(size); if (!def.sizes[size]) size = def.defSize;
  w = +w || 10; h = +h || 10;
  const Z = garZonesFor(key, size), zk = garZoneKey(key, ort), z = Z[zk] || null;
  const fit = (top, zz) => zz ? garClamp(top, zz.y0, Math.max(zz.y0, zz.y0 + zz.h - h)) : top;
  const res = (view, x, y) => ({ view, x: garR1(x), y: garR1(y), zone: z ? zk : null });
  if (st.type === 'bag') return res(zk === 'back' ? 'back' : 'front', 0, fit(8, z));
  if (st.type === 'apron') {
    if (zk === 'bauch') return res('front', 0, Z.bauch.y0 + Math.max(0, (Z.bauch.h - h) / 2));
    if (zk === 'brustL' || zk === 'brustR') return res('front', z.x0 + z.w / 2, fit(4, z));
    return res('front', 0, fit(5, Z.front));
  }
  const F = garGet(key, 'front', size), B = garGet(key, 'back', size), kl = garClamp(F.kl, 0.9, 1.05);
  const brust = sg => {
    const zz = Z[sg > 0 ? 'brustL' : 'brustR'];
    const cx = Math.max(Math.abs(zz.x0 + zz.w / 2), (sg > 0 ? zz.x0 : -(zz.x0 + zz.w)) + w / 2);
    let top = Math.max(7 * kl, garNeckMaxY(F, cx - w / 2, cx + w / 2) + 2);
    top = garClearTop(F, cx - w / 2, cx + w / 2, top, h, 1.6);
    if (h <= zz.h) top = garClamp(top, zz.y0, zz.y0 + zz.h - h);
    return res('front', cx * sg, top);
  };
  switch (zk) {
    case 'brustL': return brust(1);
    case 'brustR': return brust(-1);
    case 'bauch':
      if (F.pocket) return res('front', 0, Math.max(Z.front ? Z.front.y0 : F.collarY + 2, F.pocket.top - 2.5 - h));
      return res('front', 0, fit(25 * kl, z));
    case 'back': return res('back', 0, fit(B.collarY + (st.hood ? 8 : 8.5) * kl, z));
    case 'nacken': return res('back', 0, B.collarY + 2.5);
    case 'aermelL': case 'aermelR':
      if (z) return res('front', z.x0 + z.w / 2, z.y0 + (z.h - h) / 2);
      return brust(zk === 'aermelL' ? 1 : -1);
    default: {
      const off = (st.hood ? 9.5 : 7.5) * kl;
      return res('front', 0, fit(F.collarY + off, z));
    }
  }
}

function garBestZone(Z, view, r) {
  const area = (r.x1 - r.x0) * (r.y1 - r.y0) || 1;
  let best = null, bs = -Infinity;
  for (const k in Z) {
    const z = Z[k]; if (z.view !== view) continue;
    const ix = Math.max(0, Math.min(r.x1, z.x0 + z.w) - Math.max(r.x0, z.x0)), iy = Math.max(0, Math.min(r.y1, z.y0 + z.h) - Math.max(r.y0, z.y0));
    const ov = ix * iy / area;
    if (ov < 0.5) continue;
    const sc = ov * 100 - z.w * z.h * 0.001;
    if (sc > bs) { bs = sc; best = k; }
  }
  return best;
}
function garRectOnFabric(G, r) {
  const pts = [], n = 8;
  for (let i = 0; i <= n; i++) {
    const fx = r.x0 + (r.x1 - r.x0) * i / n, fy = r.y0 + (r.y1 - r.y0) * i / n;
    pts.push([fx, r.y0], [fx, r.y1], [r.x0, fy], [r.x1, fy]);
  }
  pts.push([(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2]);
  return pts.every(p => G.fabricPolys.some(poly => garInPoly(poly, p[0], p[1])) && !G.holes.some(hp => garInPoly(hp, p[0], p[1])));
}

// Warnungen zur Platzierung (deutsche Sätze). motif = { w, h, x, y, ort? }, sizesInOrder = bestellte Größen (optional)
function checkPlacement(key, view, size, motif, sizesInOrder) {
  const out = [];
  if (!motif || !(+motif.w > 0) || !(+motif.h > 0)) return out;
  key = GARMENTS[key] ? key : 'tshirt';
  const G = garGet(key, view, size), st = GAR_STYLE[key];
  view = G.view; size = G.size;
  const Z = garZonesFor(key, size);
  const mw = +motif.w, mh = +motif.h, mx = +motif.x || 0, my = +motif.y || 0;
  const r = { x0: mx - mw / 2, x1: mx + mw / 2, y0: my, y1: my + mh };
  const sz = s => s === 'one' ? 'Einheitsgröße' : 'Größe ' + s;
  // 1) Druckbereich
  let zk = motif.ort ? garZoneKey(key, motif.ort) : null;
  if (zk && (!Z[zk] || Z[zk].view !== view)) zk = null;
  if (!zk) zk = garBestZone(Z, view, r);
  const z = zk ? Z[zk] : null;
  if (st.zip && view === 'front' && (['front', 'brustM', 'bauch'].includes(motif.ort) || (r.x0 < 0 && r.x1 > 0 && r.y1 > G.zip.y0)))
    out.push('Beim Zip-Hoodie geht vorne kein durchgehendes Motiv – der Reißverschluss ist im Weg. Teile das Motiv auf Brust links und rechts auf.');
  if (z) {
    const lbl = zk === 'bauch' && st.pocket === 'kangaroo' ? 'Bauch (über der Tasche)' : GAR_ZONE_LABEL[zk];
    if (mw > z.w + 0.05 || mh > z.h + 0.05)
      out.push('Das Motiv (' + garNum(mw) + ' × ' + garNum(mh) + ' cm) ist größer als der Druckbereich „' + lbl + '“ (max. ' + garNum(z.w) + ' × ' + garNum(z.h) + ' cm bei ' + sz(size) + ').');
    else if (r.x0 < z.x0 - 0.3 || r.x1 > z.x0 + z.w + 0.3 || r.y0 < z.y0 - 0.3 || r.y1 > z.y0 + z.h + 0.3)
      out.push('Das Motiv ragt aus dem empfohlenen Druckbereich „' + lbl + '“ heraus.');
  }
  // 2) über das Teil hinaus
  const onFabric = garRectOnFabric(G, { x0: r.x0 + 0.15, x1: r.x1 - 0.15, y0: r.y0 + 0.15, y1: r.y1 - 0.15 });
  if (!onFabric) out.push(G.holes.length ? 'Das Motiv ragt über das Kleidungsstück hinaus (Rand oder Halsausschnitt).' : 'Das Motiv ragt über das Kleidungsstück hinaus.');
  // 3) Abstand zu Nähten, Kragen, Saum, Tasche, Reißverschluss
  const minD = {};
  for (const s of G.seams) { const d = garPolyRectDist(s.pts, r); if (minD[s.kind] === undefined || d < minD[s.kind]) minD[s.kind] = d; }
  for (const k of Object.keys(minD)) {
    const d = minD[k], L = GAR_SEAM_LABEL[k] || { zu: 'zur Naht', ueber: 'über einer Naht' };
    if (d <= 0.001) {
      if ((k === 'seite' || k === 'rand') && !onFabric) continue;
      if (k === 'reissverschluss' && out.some(t => t.indexOf('Zip-Hoodie') === 0)) continue;
      if (k === 'tasche') out.push(st.pocket === 'kangaroo' ? 'Das Motiv liegt über der Kängurutasche – an den Taschenkanten wird der Druck uneben und kann brechen.' : 'Das Motiv liegt über der Tasche – an den Taschenkanten wird der Druck uneben.');
      else if (k === 'reissverschluss') out.push('Das Motiv liegt über dem Reißverschluss – dort kann nicht gedruckt werden.');
      else if (k === 'knopfleiste') out.push('Das Motiv liegt über der Knopfleiste – dort kann nicht sauber gepresst werden.');
      else out.push('Das Motiv liegt ' + L.ueber + ' – die Kante drückt sich im Transfer ab, er haftet dort schlecht.');
    } else if (d < 1.45) {
      out.push('Nur ' + garNum(d) + ' cm Abstand ' + L.zu + ' – empfohlen sind mindestens 1,5 cm.');
    }
  }
  // 4) kleinste bestellte Größe
  if (Array.isArray(sizesInOrder) && sizesInOrder.length && zk) {
    const want = sizesInOrder.map(garNormSize);
    const small = GAR_SIZE_ORDER.find(s => want.includes(s) && GARMENTS[key].sizes[s]);
    const zs = small ? garZonesFor(key, small)[zk] : null;
    if (zs) {
      const lbl = GAR_ZONE_LABEL[zk];
      if (small !== size && (mw > zs.w + 0.05 || mh > zs.h + 0.05))
        out.push('In Größe ' + small + ' ist der Druckbereich „' + lbl + '“ nur ' + garNum(zs.w) + ' × ' + garNum(zs.h) + ' cm – das Motiv passt dort nicht, plane eine kleinere Variante ein.');
      else if (mw > 0.9 * zs.w && mw <= zs.w + 0.05)
        out.push('Auf ' + small + ' wirkt das Motiv sehr groß (' + Math.round(mw / zs.w * 100) + ' % der Druckbreite von ' + garNum(zs.w) + ' cm).');
    }
  }
  return out;
}

// Druckbereiche der Standardgröße in GARMENTS eintragen
for (const k in GARMENTS) {
  try {
    GARMENTS[k].zones = garZonesFor(k, GARMENTS[k].defSize);
    GARMENTS[k].zoneRule = 'Werte für ' + GARMENTS[k].defSize + '; Breiten wachsen mit w, Höhen mit l, Abstände zu Kragen/Tasche/Bündchen bleiben gleich. Fertig umgerechnet: garmentGeometry(key, view, size).zones';
  } catch (e) { GARMENTS[k].zones = {}; }
}
