// Anfrageformular für Kunden: erzeugt eine eigenständige HTML-Datei (anfrage.html) und liest die
// Anfrage-Datei (.json), die Kunden damit erstellen, wieder als Auftrag ein.
//
// Öffentlich:
//   buildAnfrageHtml(config) → String     config = {firma, logo, email, text, artikel:[{id,name,groessen}],
//                                           druckstellen:[{id,name,w,h,ort}], sizes, erstellt}
//   jobFromAnfrage(S, data) → {job, hints}  data = Inhalt der Anfrage-Datei (app 'dtf-anfrage')
//   importAnfrageFile(file)                 Datei lesen, prüfen und als neuen Auftrag öffnen
//
// Das Skript im Formular ist die Funktion anfrageClient() weiter unten. Sie wird als Text in die
// HTML-Datei kopiert und läuft dort ganz allein (ohne diese App). Deshalb darf sie nur eigene
// Hilfsfunktionen benutzen, keine Template-Literale enthalten und kein „</script>“.

// ======================= Import =======================
// Dunkle bzw. farbige Textilien kosten im Einkauf oft mehr. Helle Farben erkennen, alles andere gilt als dunkel.
function anfIsDark(farbe) {
  const s = String(farbe || '').toLowerCase().trim();
  if (!s) return false;
  if (/dunkel|dark|schwarz|black|navy|marine|anthrazit|anthracite|charcoal|graphit|bordeaux|burgund|weinrot|flaschengr|bottle|tannengr|forest|oliv|petrol|schoko|braun|brown/.test(s)) return true;
  if (/wei(ß|ss)|white|natur|natural|creme|cream|ecru|offwhite|off-white|hellgrau|ash|beige|sand|vanill|pastell|pastel|hell|light|meliert|heather|sportgrau|sport grey/.test(s)) return false;
  return true;   // sonstige Farben (Rot, Royal, Grün …) werden wie dunkle Textilien eingekauft
}

function jobFromAnfrage(S, d) {
  const hints = [];
  const str = (v, max) => String(v === null || v === undefined ? '' : v).trim().slice(0, max || 200);
  const j = blankJob(S);
  const k = d && d.kunde && typeof d.kunde === 'object' ? d.kunde : {};
  const firma = str(k.firma, 100), ansprech = str(k.ansprech, 80), email = str(k.email, 100), tel = str(k.tel, 40);
  j.kunde = firma || ansprech;
  j.kontakt = [ansprech, tel, email].filter(Boolean).join(', ');
  j.adresse = str(k.adresse, 300);
  j.name = str(d.name, 100) || ('Anfrage ' + (j.kunde || '')).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str(d.termin))) j.lieferDatum = str(d.termin);
  const abholung = d.lieferung === 'abholung';
  j.pakete = abholung ? 0 : 1;
  const erstellt = /^\d{4}-\d{2}-\d{2}/.test(str(d.erstellt)) ? fmtDate(str(d.erstellt).slice(0, 10)) : '';
  j.notiz = ['Anfrage über das Formular' + (erstellt ? ' vom ' + erstellt : '') + '.', 'Lieferung: ' + (abholung ? 'Abholung' : 'Versand'), str(d.notiz, 1500)].filter(Boolean).join('\n');

  // Bestehenden Kunden erkennen (gleiche E-Mail oder gleicher Name)
  const kl = (typeof Store === 'object' && Array.isArray(Store.kunden)) ? Store.kunden : [];
  const low = s => String(s || '').trim().toLowerCase();
  const kd = (email && kl.find(x => low(x.data.email) === low(email))) || (firma && kl.find(x => low(x.data.firma) === low(firma))) || null;
  if (kd) {
    j.kundeId = kd.id; j.kundeNr = kd.data.nr || ''; j.kundeUstId = kd.data.ust || '';
    if (n(kd.data.rabatt) > 0) j.rabatt = n(kd.data.rabatt);
    hints.push('Bestehender Kunde erkannt: ' + (kd.data.firma || kd.data.ansprech || kd.data.nr) + '.');
  }

  j.positionen = [];
  (Array.isArray(d.positionen) ? d.positionen : []).slice(0, 40).forEach((rp, i) => {
    if (!rp || typeof rp !== 'object') return;
    const name = str(rp.artikel, 60) || 'Artikel', lname = name.toLowerCase();
    const c = (rp.catId && catById(S, rp.catId)) || S.artikel.find(a => a.name.toLowerCase() === lname) || null;
    const p = newPosition(S, c || { id: null, name, ekHell: 0, ekDunkel: 0, aufXXL: 0, auf3XL: 0, groessen: true });
    const label = '„' + name + '“';
    if (!c) { p.catId = null; p.name = name; hints.push(label + ' ist nicht im Katalog. Einkaufspreis bitte eintragen.'); }
    p.farbe = str(rp.farbe, 40);
    p.dunkel = anfIsDark(p.farbe);
    if (c) p.ek = n(p.dunkel ? c.ekDunkel : c.ekHell);
    if (!p.farbe) hints.push(label + ': keine Farbe angegeben.');
    // Größen (2XL = XXL, XXXL = 3XL)
    const g = rp.groessen && typeof rp.groessen === 'object' ? rp.groessen : null;
    let any = false;
    if (g) Object.keys(g).forEach(key => {
      const s = String(key).toUpperCase().replace('2XL', 'XXL').replace('XXXL', '3XL');
      if (SIZES.includes(s)) { p.groessen[s] = Math.max(0, Math.round(n(g[key]))); if (p.groessen[s]) any = true; }
    });
    if (any && (!c || c.groessen)) p.ohneGroessen = false;
    else { p.ohneGroessen = true; p.menge = Math.max(0, Math.round(n(rp.menge))) || SIZES.reduce((s, x) => s + n(p.groessen[x]), 0); }
    if (!qtyOf(p)) hints.push('Position ' + (i + 1) + ' ' + label + ': keine Menge angegeben.');
    // Druckstellen mit Logo
    p.motive = (Array.isArray(rp.motive) ? rp.motive : []).slice(0, 12).filter(m => m && typeof m === 'object').map(m => {
      const mn = str(m.name, 60) || 'Druckstelle';
      const mm = { id: uid(), name: mn, w: Math.max(0, n(m.w)), h: Math.max(0, n(m.h)), pers: !!m.pers, ort: ORTE[m.ort] ? m.ort : guessOrt(mn) };
      if (typeof m.img === 'string' && /^data:image\/(png|jpeg|jpg|webp|gif);base64,/.test(m.img) && m.img.length < 2500000) mm.img = m.img;
      if (!(mm.w > 0 && mm.h > 0)) hints.push(label + ', ' + mn + ': Maße fehlen.');
      return mm;
    });
    if (!p.motive.length) hints.push(label + ': keine Druckstelle gewählt.');
    if (p.motive.some(m => m.pers)) hints.push(label + ': Namen/Nummern individuell. Liste beim Kunden anfordern.');
    j.positionen.push(p);
  });
  if (!j.positionen.length) { j.positionen = [newPosition(S)]; hints.push('In der Anfrage stehen keine Artikel.'); }
  if (!email) hints.push('Keine E-Mail-Adresse angegeben.');
  return { job: j, hints };
}

// Anfrage-Datei öffnen (Dialog „Infoblatt einlesen“ und Reiter „Anfrageformular“)
function importAnfrageFile(file) {
  if (!file) return Promise.resolve(false);
  if (file.size > 30 * 1024 * 1024) { toast('Die Datei ist zu groß.', true); return Promise.resolve(false); }
  return file.text().then(t => {
    let data = null;
    try { data = JSON.parse(String(t).replace(new RegExp('^' + String.fromCharCode(0xfeff)), '')); } catch (e) { throw new Error('Die Datei ist keine gültige Anfrage-Datei.'); }
    if (!data || data.app !== 'dtf-anfrage') throw new Error('Das ist keine Datei aus dem Anfrageformular.');
    const r = jobFromAnfrage(S, data);
    const dlg = $('impDlg'); if (dlg && dlg.open) dlg.close();
    loadNewJob(r.job, r.hints, 'Anfrage übernommen. Bitte prüfen und speichern.');
    return true;
  }).catch(e => { toast((e && e.message) || 'Die Datei konnte nicht gelesen werden.', true); return false; });
}

// Datei-Eingabe im Dialog „Infoblatt einlesen“
(function anfBind() {
  const go = () => {
    const i = $('impAnfrage');
    if (i) i.addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) importAnfrageFile(f); });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();

// ======================= Formular erzeugen =======================
function buildAnfrageHtml(config) {
  config = config || {};
  const cfg = {
    firma: String(config.firma || ''),
    logo: /^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,/.test(String(config.logo || '')) ? String(config.logo) : '',
    email: String(config.email || '').trim(),
    text: String(config.text || ''),
    artikel: (config.artikel || []).map(a => ({ id: String(a.id), name: String(a.name || 'Artikel'), groessen: a.groessen !== false })),
    druckstellen: (config.druckstellen || []).map(d => ({ id: String(d.id), name: String(d.name || 'Druckstelle'), w: n(d.w), h: n(d.h), ort: d.ort || guessOrt(d.name) })),
    sizes: Array.isArray(config.sizes) && config.sizes.length ? config.sizes.map(String) : SIZES.slice(),
    erstellt: String(config.erstellt || new Date().toISOString())
  };
  // Daten sicher ins Skript einsetzen: kein „<“ (sonst könnte </script> die Seite zerbrechen)
  const BS = String.fromCharCode(92);   // Backslash
  const json = JSON.stringify(cfg).replace(/</g, BS + 'u003c').split(String.fromCharCode(0x2028)).join(BS + 'u2028').split(String.fromCharCode(0x2029)).join(BS + 'u2029');
  const code = anfrageClient.toString().replace(/<\/(script)/gi, '<\\/$1');
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  return [
    '<!doctype html>',
    '<html lang="de">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="robots" content="noindex">',
    '<title>' + esc('Anfrage Textildruck' + (cfg.firma ? ' – ' + cfg.firma : '')) + '</title>',
    '<style>', ANF_CSS, '</style>',
    '</head>',
    '<body>',
    ANF_BODY,
    '<script>',
    'var CFG = ' + json + ';',
    '(' + code + ')(CFG);',
    '</scr' + 'ipt>',
    '</body>',
    '</html>'
  ].join('\n');
}

// Stile des Formulars: hell und freundlich, Akzent wie in der App
const ANF_CSS = [
  ':root { --bg: #f2f4f8; --card: #fff; --field: #f6f8fb; --fg: #0f141b; --mut: #5d6878; --line: #dfe4ec; --line-hi: #c9d1dd; --acc: #0a6cff; --acc-soft: rgba(10,108,255,.10); --warn: #d93025; --ok: #0f9d68; --cmyk: linear-gradient(90deg, #00b4f0 0%, #ec008c 50%, #ffe600 100%); color-scheme: light; }',
  '*, *::before, *::after { box-sizing: border-box; }',
  '[hidden] { display: none !important; }',
  'html { background: var(--bg); }',
  'body { margin: 0; color: var(--fg); background: var(--bg); font: 15px/1.5 "Segoe UI Variable", "Segoe UI", system-ui, -apple-system, Roboto, sans-serif; -webkit-font-smoothing: antialiased; }',
  '.cmyk { position: fixed; top: 0; left: 0; right: 0; height: 4px; background: var(--cmyk); z-index: 10; }',
  'main { max-width: 760px; margin: 0 auto; padding: 28px 16px 48px; }',
  'header { text-align: center; margin-bottom: 18px; }',
  'header .logo { max-width: 200px; max-height: 80px; object-fit: contain; display: block; margin: 0 auto 10px; }',
  'header .firm { font-weight: 700; font-size: 18px; margin-bottom: 4px; }',
  'h1 { font-size: 26px; margin: 0 0 6px; letter-spacing: -.3px; }',
  '.intro { color: var(--mut); margin: 0 auto; max-width: 560px; white-space: pre-line; }',
  '.card { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 18px; margin-bottom: 14px; box-shadow: 0 6px 20px rgba(20,30,50,.06); }',
  'h2 { display: flex; align-items: center; gap: 8px; font-size: 13px; text-transform: uppercase; letter-spacing: 1.2px; color: var(--mut); margin: 0 0 12px; }',
  'h2::before { content: ""; width: 3px; height: 14px; border-radius: 2px; background: var(--cmyk); }',
  'label.f { display: block; font-size: 13px; color: var(--mut); margin-top: 10px; }',
  'label.f:first-child { margin-top: 0; }',
  '.req { color: var(--warn); font-weight: 700; }',
  'input[type=text], input[type=email], input[type=tel], input[type=number], input[type=date], select, textarea { display: block; width: 100%; margin-top: 4px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--field); color: var(--fg); font: inherit; font-size: 16px; }',
  'textarea { resize: vertical; min-height: 70px; }',
  'input:focus, select:focus, textarea:focus { outline: none; border-color: var(--acc); box-shadow: 0 0 0 3px rgba(10,108,255,.18); background: #fff; }',
  '.bad { border-color: var(--warn) !important; background: #fff6f5 !important; }',
  '.two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }',
  '.two > label.f { margin-top: 10px; }',
  '.seg { display: flex; gap: 8px; margin-top: 6px; flex-wrap: wrap; }',
  '.seg label { flex: 1; min-width: 120px; display: flex; align-items: center; gap: 8px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--field); cursor: pointer; font-size: 14px; }',
  '.seg label:has(input:checked) { border-color: var(--acc); background: var(--acc-soft); }',
  '.seg input { accent-color: var(--acc); }',
  'button { font: inherit; cursor: pointer; border-radius: 10px; }',
  '.primary { display: block; width: 100%; padding: 14px; border: 0; background: var(--acc); color: #fff; font-weight: 700; font-size: 16px; box-shadow: 0 6px 18px rgba(10,108,255,.3); }',
  '.primary:hover { filter: brightness(1.06); }',
  '.ghost { padding: 10px 14px; border: 1px dashed var(--line-hi); background: transparent; color: var(--acc); font-weight: 600; width: 100%; }',
  '.ghost:hover { border-color: var(--acc); background: var(--acc-soft); }',
  '.link { border: 0; background: none; padding: 2px 0; color: var(--acc); font-weight: 600; font-size: 13px; }',
  '.pos { border: 1px solid var(--line); border-radius: 14px; padding: 14px; margin-bottom: 12px; background: #fcfdff; }',
  '.poshead { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }',
  '.sizes { display: grid; grid-template-columns: repeat(9, minmax(0, 1fr)); gap: 6px; margin-top: 6px; }',
  '.sizes label { text-align: center; font-size: 11px; font-weight: 700; color: var(--mut); border: 1px solid var(--line); border-radius: 9px; background: var(--card); overflow: hidden; }',
  '.sizes label span { display: block; padding-top: 3px; }',
  '.sizes input { margin: 0; border: 0; border-radius: 0; text-align: center; padding: 6px 2px; background: transparent; -moz-appearance: textfield; }',
  '.sizes input::-webkit-inner-spin-button { display: none; }',
  '.lab { font-size: 13px; color: var(--mut); margin-top: 10px; }',
  '.total { margin-top: 8px; font-size: 13px; font-weight: 600; color: var(--acc); }',
  '.ds { margin-top: 6px; display: flex; flex-direction: column; gap: 6px; }',
  '.dsrow { border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; background: var(--card); }',
  '.dsrow.on { border-color: var(--acc); box-shadow: 0 0 0 2px var(--acc-soft); }',
  '.dsdet { padding: 4px 0 4px 44px; }',
  'label.sw { display: flex; align-items: flex-start; gap: 10px; cursor: pointer; font-size: 14px; color: var(--fg); margin-top: 6px; }',
  'label.sw small { color: var(--mut); font-size: 12px; }',
  'input[type=checkbox] { appearance: none; -webkit-appearance: none; flex: none; position: relative; width: 34px; height: 20px; margin: 1px 0 0; border-radius: 20px; background: var(--line-hi); cursor: pointer; transition: background .2s; }',
  'input[type=checkbox]::after { content: ""; position: absolute; top: 3px; left: 3px; width: 14px; height: 14px; border-radius: 50%; background: #fff; transition: transform .2s; box-shadow: 0 1px 3px rgba(0,0,0,.3); }',
  'input[type=checkbox]:checked { background: var(--acc); }',
  'input[type=checkbox]:checked::after { transform: translateX(14px); }',
  'input[type=checkbox]:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(10,108,255,.25); }',
  'input[type=checkbox].bad { box-shadow: 0 0 0 3px rgba(217,48,37,.3); }',
  'input[type=file] { display: block; margin-top: 4px; font-size: 13px; max-width: 100%; }',
  '.prev { display: flex; align-items: center; gap: 10px; margin-top: 6px; font-size: 13px; color: var(--mut); }',
  '.prev img { max-width: 90px; max-height: 70px; border-radius: 6px; border: 1px solid var(--line); background: repeating-conic-gradient(#eee 0 25%, #fff 0 50%) 0 0 / 12px 12px; }',
  '.err { border: 1px solid var(--warn); background: #fff6f5; color: var(--warn); border-radius: 12px; padding: 12px 14px; margin-bottom: 14px; font-size: 14px; }',
  '.err ul { margin: 6px 0 0; padding-left: 18px; }',
  '.done { text-align: center; }',
  '.done .big { width: 56px; height: 56px; border-radius: 50%; background: rgba(15,157,104,.12); color: var(--ok); display: grid; place-items: center; margin: 0 auto 10px; font-size: 28px; font-weight: 700; }',
  '.done ol { text-align: left; max-width: 520px; margin: 14px auto; padding-left: 20px; }',
  '.done li { margin-bottom: 8px; }',
  '.done .btns { display: flex; flex-direction: column; gap: 8px; max-width: 360px; margin: 0 auto; }',
  '.mut { color: var(--mut); font-size: 13px; }',
  'footer { text-align: center; color: var(--mut); font-size: 12px; margin-top: 18px; }',
  '@media (max-width: 560px) { main { padding: 22px 12px 40px; } .card { padding: 14px; } h1 { font-size: 22px; } .sizes { grid-template-columns: repeat(5, minmax(0, 1fr)); } .dsdet { padding-left: 0; } }',
  '@media (max-width: 380px) { .two { grid-template-columns: 1fr; } .seg label { min-width: 0; } }'
].join('\n');

// Gerüst des Formulars (Inhalte setzt das Skript aus CFG)
const ANF_BODY = [
  '<div class="cmyk"></div>',
  '<main>',
  '<header id="hd"></header>',
  '<form id="f" novalidate>',
  '<section class="card"><h2>Ihre Kontaktdaten</h2>',
  '<label class="f">Firma / Verein<input type="text" id="firma" maxlength="100" autocomplete="organization"></label>',
  '<label class="f">Ansprechpartner <b class="req">*</b><input type="text" id="ansprech" maxlength="80" autocomplete="name"></label>',
  '<div class="two"><label class="f">E-Mail <b class="req">*</b><input type="email" id="email" maxlength="100" autocomplete="email"></label>',
  '<label class="f">Telefon<input type="tel" id="tel" maxlength="40" autocomplete="tel"></label></div>',
  '<label class="f">Adresse<textarea id="adresse" rows="3" maxlength="300" autocomplete="street-address" placeholder="Straße, PLZ Ort"></textarea></label>',
  '</section>',
  '<section class="card"><h2>Ihr Auftrag</h2>',
  '<label class="f">Anlass / Auftragsname <b class="req">*</b><input type="text" id="name" maxlength="100" placeholder="z. B. Vereinsshirts Sommerfest"></label>',
  '<label class="f">Wunschtermin<input type="date" id="termin"></label>',
  '<div class="lab">Versand oder Abholung</div>',
  '<div class="seg"><label><input type="radio" name="lief" value="versand" checked> Versand</label><label><input type="radio" name="lief" value="abholung"> Abholung</label></div>',
  '</section>',
  '<section class="card"><h2>Artikel und Druck</h2>',
  '<div id="pos"></div>',
  '<button type="button" class="ghost" id="addPos">+ Weiteren Artikel hinzufügen</button>',
  '</section>',
  '<section class="card"><h2>Sonstiges</h2>',
  '<label class="f">Notiz<textarea id="notiz" rows="4" maxlength="1500" placeholder="Wünsche, Fragen, Namensliste …"></textarea></label>',
  '<label class="sw" style="margin-top:14px"><input type="checkbox" id="ok"><span>Ich bin einverstanden, dass meine Angaben zur Bearbeitung der Anfrage verwendet werden. <small>Ihre Daten werden nur für Ihre Anfrage genutzt.</small></span></label>',
  '</section>',
  '<div id="err" class="err" hidden></div>',
  '<button type="submit" class="primary">Anfrage erstellen</button>',
  '<p class="mut" style="text-align:center">Felder mit * sind Pflichtfelder.</p>',
  '</form>',
  '<section id="done" class="card done" hidden></section>',
  '<footer id="ft"></footer>',
  '</main>'
].join('\n');

// ---------- Skript des Formulars (läuft nur in anfrage.html) ----------
// Keine Template-Literale, keine App-Funktionen benutzen!
function anfrageClient(CFG) {
  var d = document;
  function $(id) { return d.getElementById(id); }
  function el(tag, attrs, kids) {
    var e = d.createElement(tag), k, v;
    attrs = attrs || {};
    for (k in attrs) {
      if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
      v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'text') e.textContent = v;
      else if (k === 'class') e.className = v;
      else if (k === 'value') e.value = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    (kids || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      e.appendChild(typeof c === 'object' ? c : d.createTextNode(String(c)));
    });
    return e;
  }
  function num(v) { v = parseFloat(String(v === undefined || v === null ? '' : v).replace(',', '.')); return isFinite(v) ? v : 0; }
  function cm(v) { return String(Math.round(num(v) * 10) / 10).replace('.', ','); }
  function fmtDate(iso) { var p = String(iso || '').slice(0, 10).split('-'); return p.length === 3 ? p[2] + '.' + p[1] + '.' + p[0] : ''; }
  function val(id) { return String($(id).value || '').trim(); }

  // ---------- Kopf und Fuß ----------
  var hd = $('hd');
  if (CFG.logo) hd.appendChild(el('img', { class: 'logo', src: CFG.logo, alt: CFG.firma || 'Logo' }));
  else if (CFG.firma) hd.appendChild(el('div', { class: 'firm', text: CFG.firma }));
  hd.appendChild(el('h1', { text: 'Anfrage Textildruck' }));
  if (CFG.text) hd.appendChild(el('p', { class: 'intro', text: CFG.text }));
  $('ft').textContent = (CFG.firma ? CFG.firma + ' · ' : '') + 'Formular Stand ' + fmtDate(CFG.erstellt);
  var tmin = new Date(); tmin.setDate(tmin.getDate() + 1);
  $('termin').setAttribute('min', tmin.getFullYear() + '-' + ('0' + (tmin.getMonth() + 1)).slice(-2) + '-' + ('0' + tmin.getDate()).slice(-2));

  // ---------- Bild verkleinern (max. 500 px), Ergebnis als Data-URL ----------
  function shrink(file, cb) {
    if (!/^image\//.test(file.type || '')) { cb(null, 'Bitte eine Bilddatei (PNG oder JPG) wählen. Andere Dateien schicken Sie uns bitte per E-Mail mit.'); return; }
    var r = new FileReader();
    r.onerror = function () { cb(null, 'Die Datei konnte nicht gelesen werden.'); };
    r.onload = function () {
      var img = new Image();
      img.onerror = function () { cb(null, 'Das Bild konnte nicht geöffnet werden.'); };
      img.onload = function () {
        var w0 = img.naturalWidth || img.width || 500, h0 = img.naturalHeight || img.height || 500;
        var s = Math.min(1, 500 / Math.max(w0, h0));
        var w = Math.max(1, Math.round(w0 * s)), hh = Math.max(1, Math.round(h0 * s));
        var c = d.createElement('canvas'); c.width = w; c.height = hh;
        try {
          c.getContext('2d').drawImage(img, 0, 0, w, hh);
          cb(/jpe?g/i.test(file.type) ? c.toDataURL('image/jpeg', 0.85) : c.toDataURL('image/png'));
        } catch (e) { cb(null, 'Das Bild konnte nicht verarbeitet werden.'); }
      };
      img.src = r.result;
    };
    r.readAsDataURL(file);
  }

  // ---------- Positionen ----------
  var items = [];
  var posBox = $('pos');

  function renumber() {
    items.forEach(function (it, i) {
      it.nr.textContent = 'Artikel ' + (i + 1);
      it.del.hidden = items.length < 2;
    });
  }

  // Eine Druckstelle (Vorlage ds oder null = eigene Stelle)
  function dsRow(ds, parent) {
    var row = { ds: ds, img: '' };
    row.cb = el('input', { type: 'checkbox' });
    row.nameIn = ds ? null : el('input', { type: 'text', maxlength: '40', placeholder: 'z. B. Ärmel rechts' });
    row.w = el('input', { type: 'number', min: '0', step: '0.5', inputmode: 'decimal', value: ds && ds.w ? String(ds.w) : '' });
    row.h = el('input', { type: 'number', min: '0', step: '0.5', inputmode: 'decimal', value: ds && ds.h ? String(ds.h) : '' });
    row.pers = el('input', { type: 'checkbox' });
    var file = el('input', { type: 'file', accept: 'image/*' });
    var prev = el('div', { class: 'prev' });
    file.addEventListener('change', function () {
      var f = file.files && file.files[0];
      if (!f) return;
      prev.textContent = 'Bild wird vorbereitet …';
      shrink(f, function (url, err) {
        prev.textContent = '';
        if (!url) { row.img = ''; file.value = ''; prev.textContent = err; return; }
        row.img = url;
        prev.appendChild(el('img', { src: url, alt: 'Vorschau' }));
        prev.appendChild(el('button', { type: 'button', class: 'link', text: 'Bild entfernen', onclick: function () { row.img = ''; file.value = ''; prev.textContent = ''; } }));
      });
    });
    var det = el('div', { class: 'dsdet', hidden: true }, [
      row.nameIn ? el('label', { class: 'f' }, ['Welche Stelle?', row.nameIn]) : null,
      el('div', { class: 'two' }, [el('label', { class: 'f' }, ['Breite (cm)', row.w]), el('label', { class: 'f' }, ['Höhe (cm)', row.h])]),
      el('label', { class: 'sw' }, [row.pers, el('span', null, ['Namen/Nummern individuell ', el('small', { text: '(auf jedem Teil anders)' })])]),
      el('label', { class: 'f' }, ['Logo / Motiv (optional, Bilddatei)', file]),
      prev
    ]);
    var wrap = el('div', { class: 'dsrow' }, [
      el('label', { class: 'sw' }, [row.cb, el('span', null, [ds ? ds.name : 'Andere Stelle', ds && ds.w && ds.h ? el('small', { text: ' ca. ' + cm(ds.w) + ' × ' + cm(ds.h) + ' cm' }) : null])]),
      det
    ]);
    row.cb.addEventListener('change', function () { det.hidden = !row.cb.checked; wrap.className = 'dsrow' + (row.cb.checked ? ' on' : ''); });
    parent.appendChild(wrap);
    return row;
  }

  function addPos() {
    var it = {};
    var box = el('div', { class: 'pos' });
    it.nr = el('strong');
    it.del = el('button', { type: 'button', class: 'link', text: 'Entfernen', onclick: function () {
      if (items.length < 2) return;
      box.parentNode.removeChild(box);
      items.splice(items.indexOf(it), 1);
      renumber();
    } });
    var sel = el('select', { 'aria-label': 'Artikel' });
    CFG.artikel.forEach(function (a) { sel.appendChild(el('option', { value: a.id, text: a.name })); });
    sel.appendChild(el('option', { value: '_', text: 'Anderer Artikel' }));
    var other = el('input', { type: 'text', maxlength: '60', placeholder: 'z. B. Kappe, Schürze, Jacke' });
    var otherL = el('label', { class: 'f' }, ['Welcher Artikel? ', el('b', { class: 'req', text: '*' }), other]);
    var farbe = el('input', { type: 'text', maxlength: '40', placeholder: 'z. B. Schwarz, Weiß, Navy' });
    var sizeIns = {}, grid = el('div', { class: 'sizes' });
    CFG.sizes.forEach(function (s) {
      var i = el('input', { type: 'number', min: '0', step: '1', inputmode: 'numeric', 'aria-label': 'Anzahl Größe ' + s, oninput: sum });
      sizeIns[s] = i;
      grid.appendChild(el('label', null, [el('span', { text: s }), i]));
    });
    var sizesBox = el('div', null, [el('div', { class: 'lab', text: 'Anzahl je Größe' }), grid]);
    var menge = el('input', { type: 'number', min: '0', step: '1', inputmode: 'numeric', oninput: sum });
    var mengeTxt = el('span', { text: 'Menge (Stück)' });
    var mengeL = el('label', { class: 'f' }, [mengeTxt, menge]);
    var total = el('div', { class: 'total' });
    var dsBox = el('div', { class: 'ds' });
    var rows = CFG.druckstellen.map(function (ds) { return dsRow(ds, dsBox); });
    rows.push(dsRow(null, dsBox));

    function art() {
      for (var i = 0; i < CFG.artikel.length; i++) if (CFG.artikel[i].id === sel.value) return CFG.artikel[i];
      return null;
    }
    function hasSizes() { var a = art(); return sel.value === '_' || !!(a && a.groessen); }
    function sizeSum() { var s = 0; CFG.sizes.forEach(function (k) { s += Math.max(0, Math.round(num(sizeIns[k].value))); }); return s; }
    function qty() { var s = hasSizes() ? sizeSum() : 0; return s > 0 ? s : (mengeL.hidden ? 0 : Math.max(0, Math.round(num(menge.value)))); }
    function sum() { var q = qty(); total.textContent = q > 0 ? 'Summe: ' + q + ' Stück' : ''; }
    function upd() {
      var isOther = sel.value === '_', a = art();
      otherL.hidden = !isOther;
      sizesBox.hidden = !hasSizes();
      mengeL.hidden = !!(a && a.groessen);
      mengeTxt.textContent = isOther ? 'Oder Gesamtmenge (wenn ohne Größen)' : 'Menge (Stück)';
      sum();
    }
    sel.addEventListener('change', upd);

    // Daten dieser Position für die Anfrage-Datei
    it.get = function () {
      var a = art(), g = {}, useSizes = hasSizes() && sizeSum() > 0;
      if (useSizes) CFG.sizes.forEach(function (k) { var v = Math.max(0, Math.round(num(sizeIns[k].value))); if (v) g[k] = v; });
      var motive = [];
      rows.forEach(function (r) {
        if (!r.cb.checked) return;
        var name = r.ds ? r.ds.name : (String(r.nameIn.value || '').trim() || 'Andere Stelle');
        var m = { name: name, w: num(r.w.value), h: num(r.h.value), ort: r.ds ? r.ds.ort : '', pers: !!r.pers.checked };
        if (r.img) m.img = r.img;
        motive.push(m);
      });
      return { catId: a ? a.id : null, artikel: a ? a.name : String(other.value || '').trim(), farbe: String(farbe.value || '').trim(), groessen: g, menge: qty(), motive: motive };
    };
    // Prüfen: gibt Fehlertexte zurück und markiert Felder
    it.check = function (nr) {
      var errs = [], p = it.get();
      other.className = ''; menge.className = '';
      if (sel.value === '_' && !p.artikel) { errs.push('Artikel ' + nr + ': Bitte geben Sie an, welcher Artikel gewünscht ist.'); other.className = 'bad'; }
      if (!(p.menge > 0)) { errs.push('Artikel ' + nr + ': Bitte geben Sie die Anzahl an.'); if (!mengeL.hidden) menge.className = 'bad'; }
      if (!p.motive.length) errs.push('Artikel ' + nr + ': Bitte wählen Sie mindestens eine Druckstelle.');
      return errs;
    };

    box.appendChild(el('div', { class: 'poshead' }, [it.nr, it.del]));
    box.appendChild(el('div', { class: 'two' }, [el('label', { class: 'f' }, ['Artikel', sel]), el('label', { class: 'f' }, ['Farbe', farbe])]));
    box.appendChild(otherL);
    box.appendChild(sizesBox);
    box.appendChild(mengeL);
    box.appendChild(total);
    box.appendChild(el('div', { class: 'lab', text: 'Wo soll gedruckt werden?' }));
    box.appendChild(dsBox);
    posBox.appendChild(box);
    items.push(it);
    upd();
    renumber();
    return box;
  }
  $('addPos').addEventListener('click', function () {
    var b = addPos();
    if (b.scrollIntoView) b.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  addPos();

  // ---------- Absenden ----------
  var last = null;   // {data, fname, mail}

  function collect() {
    return {
      app: 'dtf-anfrage', version: 1, erstellt: new Date().toISOString(),
      kunde: { firma: val('firma'), ansprech: val('ansprech'), email: val('email'), tel: val('tel'), adresse: val('adresse') },
      name: val('name'), termin: val('termin'),
      lieferung: (d.querySelector('input[name=lief]:checked') || {}).value === 'abholung' ? 'abholung' : 'versand',
      notiz: val('notiz'),
      positionen: items.map(function (it) { return it.get(); })
    };
  }
  function validate() {
    var errs = [];
    ['ansprech', 'email', 'name'].forEach(function (id) { $(id).className = ''; });
    $('ok').className = '';
    if (!val('ansprech')) { errs.push('Bitte geben Sie einen Ansprechpartner an.'); $('ansprech').className = 'bad'; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val('email'))) { errs.push('Bitte geben Sie eine gültige E-Mail-Adresse an.'); $('email').className = 'bad'; }
    if (!val('name')) { errs.push('Bitte geben Sie einen Anlass oder Auftragsnamen an.'); $('name').className = 'bad'; }
    items.forEach(function (it, i) { errs = errs.concat(it.check(i + 1)); });
    if (!$('ok').checked) { errs.push('Bitte bestätigen Sie den Hinweis zur Verwendung Ihrer Angaben.'); $('ok').className = 'bad'; }
    return errs;
  }
  function safeName(s) { return String(s || '').replace(/[^A-Za-z0-9ÄÖÜäöüß_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'Anfrage'; }
  function download(fname, text) {
    var blob = new Blob([text], { type: 'application/json' });
    if (window.navigator && window.navigator.msSaveOrOpenBlob) { window.navigator.msSaveOrOpenBlob(blob, fname); return; }
    var url = URL.createObjectURL(blob), a = el('a', { href: url, download: fname });
    d.body.appendChild(a); a.click(); d.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }
  function mailLink(data, fname) {
    if (!CFG.email) return '';
    var L = ['Guten Tag,', '', 'anbei sende ich Ihnen meine Anfrage' + (data.name ? ' „' + data.name + '“' : '') + '.',
      'Die Datei „' + fname + '“ habe ich an diese E-Mail angehängt.', '', 'Kurzfassung:'];
    data.positionen.forEach(function (p) {
      L.push('- ' + p.menge + '× ' + (p.artikel || 'Artikel') + (p.farbe ? ', ' + p.farbe : '') +
        (p.motive.length ? ' (' + p.motive.map(function (m) { return m.name; }).join(', ') + ')' : ''));
    });
    if (data.termin) L.push('Wunschtermin: ' + fmtDate(data.termin));
    L.push('Lieferung: ' + (data.lieferung === 'abholung' ? 'Abholung' : 'Versand'));
    L.push('', 'Viele Grüße', data.kunde.ansprech);
    if (data.kunde.firma) L.push(data.kunde.firma);
    if (data.kunde.tel) L.push(data.kunde.tel);
    var body = L.join('\n');
    if (body.length > 1500) body = body.slice(0, 1500) + '\n…';
    return 'mailto:' + CFG.email + '?subject=' + encodeURIComponent('Anfrage Textildruck: ' + (data.name || data.kunde.ansprech)) + '&body=' + encodeURIComponent(body);
  }
  function openMail() { if (last && last.mail) window.location.href = last.mail; }

  function showDone() {
    var box = $('done');
    box.textContent = '';
    box.appendChild(el('div', { class: 'big', text: '✓' }));
    box.appendChild(el('h1', { text: 'Vielen Dank!' }));
    box.appendChild(el('p', { class: 'mut', text: 'Ihre Anfrage ist fast fertig. Bitte schicken Sie uns jetzt noch die Datei.' }));
    var steps = el('ol', null, [
      el('li', { text: 'Die Datei „' + last.fname + '“ wurde heruntergeladen (meist im Ordner „Downloads“).' }),
      el('li', { text: CFG.email ? 'Ihr E-Mail-Programm öffnet sich mit einer vorbereiteten Nachricht an ' + CFG.email + '.' : 'Schreiben Sie uns eine E-Mail.' }),
      el('li', { text: 'Hängen Sie die Datei an die E-Mail an und senden Sie sie ab.' }),
      el('li', { text: 'Wir melden uns mit einem Angebot bei Ihnen.' })
    ]);
    box.appendChild(steps);
    if (CFG.email) box.appendChild(el('p', { class: 'mut', text: 'Öffnet sich kein E-Mail-Programm? Dann schicken Sie die Datei bitte direkt an ' + CFG.email + '.' }));
    box.appendChild(el('div', { class: 'btns' }, [
      CFG.email ? el('button', { type: 'button', class: 'primary', text: 'E-Mail erneut öffnen', onclick: openMail }) : null,
      el('button', { type: 'button', class: 'ghost', text: 'Datei erneut herunterladen', onclick: function () { download(last.fname, JSON.stringify(last.data, null, 1)); } }),
      el('button', { type: 'button', class: 'link', text: 'Zurück zum Formular', onclick: function () { box.hidden = true; $('f').hidden = false; window.scrollTo(0, 0); } })
    ]));
    $('f').hidden = true;
    box.hidden = false;
    window.scrollTo(0, 0);
  }

  $('f').addEventListener('submit', function (e) {
    e.preventDefault();
    var err = $('err'), errs = validate();
    if (errs.length) {
      err.textContent = '';
      err.appendChild(el('strong', { text: 'Bitte prüfen Sie Ihre Angaben:' }));
      err.appendChild(el('ul', null, errs.map(function (t) { return el('li', { text: t }); })));
      err.hidden = false;
      if (err.scrollIntoView) err.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    err.hidden = true;
    var data = collect();
    var fname = 'Anfrage_' + safeName(data.name || data.kunde.firma || data.kunde.ansprech) + '.json';
    last = { data: data, fname: fname, mail: mailLink(data, fname) };
    download(fname, JSON.stringify(data, null, 1));
    showDone();
    if (last.mail) setTimeout(openMail, 900);
  });
}
