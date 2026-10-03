// Cloud mit Supabase: Anmeldung per E-Mail-Code, Firmen (Mandanten), Team und Datenabgleich.
// Ist in js/cloud-config.js nichts eingetragen, bleibt alles wie bisher lokal im Browser.
// Der Datenzugriff ahmt die Schnittstelle der Claude-Artifact-Datenbank nach
// (collection().onSnapshot, doc().get/set/delete), damit store.js kaum geändert werden muss.
// Tabellen und Sicherheitsregeln: supabase/schema.sql, Einrichtung: supabase/ANLEITUNG.md

const CL_LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
const CL_KEY_FIRMA = 'dtf-cloud-firma';     // zuletzt gewählte Firma (localStorage)
const CL_KEY_LOKAL = 'dtf-cloud-lokal';     // „ohne Anmeldung weiter“ für diese Sitzung (sessionStorage)

const Cloud = {
  client: null, user: null, firma: null, firmen: [], status: 'aus', fehler: '',
  configured() { return typeof CLOUD_CONFIG === 'object' && !!(CLOUD_CONFIG.url && CLOUD_CONFIG.anonKey); },

  async connect() {
    if (this.client) return this.client;
    await loadScript(CL_LIB);
    // Gleicher Speicherschlüssel wie im Gang-Sheet-Konfigurator: ein Login gilt für beide Tools (gleiche Domain)
    this.client = window.supabase.createClient(CLOUD_CONFIG.url, CLOUD_CONFIG.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'dtf-tools-auth' }
    });
    return this.client;
  },

  // Beim Start von store.js aufgerufen. Gibt die Datenbank-Schnittstelle zurück oder null (= lokal arbeiten).
  async start() {
    if (!this.configured()) { this.status = 'aus'; return null; }
    try {
      const c = await this.connect();
      const { data } = await c.auth.getSession();
      if (!data.session) {
        this.status = 'abgemeldet';
        if (!clSessionGet(CL_KEY_LOKAL)) setTimeout(clShowLogin, 0);
        return null;
      }
      this.user = data.session.user;
      await c.rpc('einladungen_annehmen');
      await this.loadFirmen();
      if (!this.firmen.length) { this.status = 'keineFirma'; setTimeout(clShowFirmaNeu, 0); return null; }
      let wahl = null; try { wahl = localStorage.getItem(CL_KEY_FIRMA); } catch (e) {}
      this.firma = this.firmen.find(f => f.id === wahl) || this.firmen[0];
      this.status = 'bereit';
      return clDb(c, this.firma.id);
    } catch (e) {
      console.error(e);
      this.status = 'fehler'; this.fehler = (e && e.message) || String(e);
      setTimeout(() => { if (typeof toast === 'function') toast('Cloud nicht erreichbar, es wird lokal gearbeitet: ' + this.fehler, true); }, 0);
      return null;
    }
  },

  async loadFirmen() {
    const r = await this.client.from('mitglieder').select('firma_id, rolle, firmen(name)').eq('user_id', this.user.id);
    if (r.error) throw r.error;
    this.firmen = (r.data || []).map(x => ({ id: x.firma_id, rolle: x.rolle, name: (x.firmen && x.firmen.name) || 'Firma' }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  istInhaber() { return !!(this.firma && this.firma.rolle === 'inhaber'); },

  async abmelden() {
    if (this.client) await this.client.auth.signOut();
    try { sessionStorage.removeItem(CL_KEY_LOKAL); } catch (e) {}
    location.reload();
  },
  waehleFirma(id) { try { localStorage.setItem(CL_KEY_FIRMA, id); } catch (e) {} location.reload(); }
};

function clSessionGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }

// ---------- Datenbank-Schnittstelle (wie die Artifact-DB) ----------
function clDb(client, f) {
  const cache = {};   // Sammlung → Map(id → data)
  const subs = {};    // Sammlung → [callback]
  let channel = null;

  const docsOf = col => Array.from(cache[col] || new Map(), ([id, data]) => ({ id, data: () => data }));
  const emit = col => (subs[col] || []).forEach(cb => { try { cb({ docs: docsOf(col) }); } catch (e) { console.error(e); } });

  async function loadCol(col) {
    const m = new Map();
    for (let from = 0; ; from += 1000) {   // Supabase liefert höchstens 1000 Zeilen pro Abfrage
      const r = await client.from('docs').select('id, data').eq('firma_id', f).eq('col', col).range(from, from + 999);
      if (r.error) throw r.error;
      r.data.forEach(x => m.set(x.id, x.data));
      if (r.data.length < 1000) break;
    }
    cache[col] = m;
  }

  // Änderungen von anderen Geräten live übernehmen
  function ensureChannel() {
    if (channel) return;
    channel = client.channel('docs-' + f)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'docs', filter: 'firma_id=eq.' + f }, async payload => {
        const del = payload.eventType === 'DELETE', row = del ? payload.old : payload.new;
        if (!row || !row.col || !cache[row.col]) return;
        if (del) cache[row.col].delete(row.id);
        else {
          let data = row.data;
          if (data === undefined || data === null) {   // große Datensätze (Bilder) kommen ohne Inhalt: nachladen
            const r = await client.from('docs').select('data').eq('firma_id', f).eq('col', row.col).eq('id', row.id).maybeSingle();
            data = r.data && r.data.data;
          }
          if (data) cache[row.col].set(row.id, data);
        }
        emit(row.col);
      })
      .subscribe();
  }

  function docRef(col, id) {
    return {
      get: () => client.from('docs').select('data').eq('firma_id', f).eq('col', col).eq('id', id).maybeSingle()
        .then(r => { if (r.error) throw r.error; return { exists: !!r.data, data: () => (r.data ? r.data.data : undefined) }; }),
      set: data => client.from('docs').upsert({ firma_id: f, col, id, data, updated_at: new Date().toISOString() })
        .then(r => { if (r.error) throw clErr(r.error); if (cache[col]) cache[col].set(id, data); }),
      delete: () => client.from('docs').delete().eq('firma_id', f).eq('col', col).eq('id', id)
        .then(r => { if (r.error) throw clErr(r.error); if (cache[col]) cache[col].delete(id); })
    };
  }

  return {
    cloud: true, firmaId: f,
    collection: col => ({
      onSnapshot(cb, err) {
        (subs[col] = subs[col] || []).push(cb);
        ensureChannel();
        loadCol(col).then(() => emit(col)).catch(e => { console.error(e); if (err) err(e); });
        return () => { subs[col] = (subs[col] || []).filter(x => x !== cb); };
      },
      doc: id => docRef(col, id)
    }),
    doc: path => { const i = path.indexOf('/'); return docRef(path.slice(0, i), path.slice(i + 1)); },
    // Nummern atomar auf dem Server vergeben (jahr = 0 bei Kundennummern)
    nextNumber: (key, jahr) => client.rpc('naechste_nummer', { f, p_schluessel: key, p_jahr: jahr })
      .then(r => { if (r.error) throw clErr(r.error); return r.data; }),
    setCounter: (key, jahr, wert) => client.rpc('zaehler_setzen', { f, p_schluessel: key, p_jahr: jahr, p_wert: wert })
      .then(r => { if (r.error) throw clErr(r.error); }),
    // Zählerstände im Format von store.js ({jahr, an, ab, ls, re, kd} = nächste freie Nummer)
    readCounters: () => client.from('zaehler').select('schluessel, jahr, wert').eq('firma_id', f).then(r => {
      if (r.error) throw clErr(r.error);
      const y = new Date().getFullYear(), c = { jahr: y };
      r.data.forEach(z => { if (z.jahr === y || (z.schluessel === 'kd' && z.jahr === 0)) c[z.schluessel] = z.wert + 1; });
      return c;
    })
  };
}
// Fehler mit verständlichem Code (für die Meldungen in app.js)
function clErr(e) { return { code: e.code || 'cloud', message: e.message }; }

// ---------- Fenster: Anmelden, Firma anlegen ----------
function clDialog(id, title, body, foot) {
  let d = document.getElementById(id);
  if (d) d.remove();
  d = h('dialog', { id, class: 'bigdlg' }, [
    h('div', { class: 'head' }, [h('strong', { text: title })]),
    h('div', { class: 'body' }, body),
    h('div', { class: 'foot' }, foot)
  ]);
  document.body.appendChild(d);
  d.addEventListener('cancel', e => e.preventDefault());   // nur über die Knöpfe schließen
  d.showModal();
  return d;
}

function clShowLogin() {
  const mail = h('input', { type: 'email', placeholder: 'name@firma.de', autocomplete: 'email' });
  const code = h('input', { inputmode: 'numeric', placeholder: '6-stelliger Code', maxlength: '10', autocomplete: 'one-time-code' });
  const info = h('p', { class: 'hint', style: 'margin-top:10px' }, [location.protocol.startsWith('http') ? 'Du bekommst eine E-Mail mit einem Anmelde-Link. Ein Passwort brauchst du nicht.' : 'Hinweis: Die Anmeldung per Link funktioniert nur auf der Online-Seite (https://jackolos.github.io/dtf-kalkulator/), nicht in der per Doppelklick geöffneten Datei – außer deine Mail enthält einen Code.']);
  const step2 = h('div', { hidden: true, style: 'margin-top:12px' }, [h('label', null, ['Code aus der E-Mail', code])]);
  const send = h('button', { class: 'primary', type: 'button' }, ['Code senden']);
  const verify = h('button', { class: 'primary', type: 'button', hidden: true }, ['Anmelden']);
  const lokal = h('button', { class: 'ghost', type: 'button' }, ['Ohne Anmeldung (nur dieser Browser)']);
  const d = clDialog('clLogin', 'Anmelden', [
    h('p', { class: 'hint' }, ['Melde dich an, um deine Aufträge, Kunden und Einstellungen auf allen Geräten und im Team zu nutzen.']),
    h('label', null, ['E-Mail-Adresse', mail]), step2, info
  ], [lokal, h('div', { class: 'row' }, [send, verify])]);
  setTimeout(() => mail.focus(), 30);

  send.addEventListener('click', async () => {
    const email = mail.value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { info.textContent = 'Bitte eine gültige E-Mail-Adresse eintragen.'; return; }
    send.disabled = true; info.textContent = 'Wird gesendet …';
    const redirect = location.protocol.startsWith('http') ? location.origin + location.pathname : undefined;
    const r = await Cloud.client.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect, shouldCreateUser: true } });
    send.disabled = false;
    if (r.error) { info.textContent = 'Das hat nicht geklappt: ' + r.error.message; return; }
    info.textContent = 'E-Mail ist unterwegs (prüf auch den Spam-Ordner). Klick auf den Link in der E-Mail – diese Seite meldet dich dann an. Enthält die Mail einen Code, kannst du ihn auch hier eintragen.';
    step2.hidden = false; verify.hidden = false; send.textContent = 'Erneut senden'; send.className = 'ghost';
    code.focus();
  });
  verify.addEventListener('click', async () => {
    verify.disabled = true; info.textContent = 'Wird geprüft …';
    const r = await Cloud.client.auth.verifyOtp({ email: mail.value.trim(), token: code.value.trim(), type: 'email' });
    verify.disabled = false;
    if (r.error) { info.textContent = 'Der Code stimmt nicht oder ist abgelaufen. Lass dir einen neuen schicken.'; return; }
    location.reload();
  });
  code.addEventListener('keydown', e => { if (e.key === 'Enter') verify.click(); });
  mail.addEventListener('keydown', e => { if (e.key === 'Enter') send.click(); });
  lokal.addEventListener('click', () => { try { sessionStorage.setItem(CL_KEY_LOKAL, '1'); } catch (e) {} d.close(); d.remove(); });
}

function clShowFirmaNeu() {
  const name = h('input', { maxlength: '120', placeholder: 'z. B. Musterdruck GbR' });
  const info = h('p', { class: 'hint', style: 'margin-top:10px' });
  const go = h('button', { class: 'primary', type: 'button' }, ['Firma anlegen']);
  const d = clDialog('clFirma', 'Firma anlegen', [
    h('p', { class: 'hint' }, ['Du bist angemeldet als ', h('b', { text: Cloud.user ? Cloud.user.email : '' }), '. Leg deine Firma an. Du wirst Inhaber und kannst danach Mitarbeiter einladen.']),
    h('label', null, ['Name der Firma', name]),
    h('p', { class: 'mut', style: 'margin-top:10px' }, ['Wurdest du von einer Firma eingeladen? Dann muss dich der Inhaber mit genau dieser E-Mail-Adresse einladen. Danach hier „Erneut prüfen“.']),
    info
  ], [
    h('div', { class: 'row' }, [
      h('button', { class: 'ghost', type: 'button', onclick: () => location.reload() }, ['Erneut prüfen']),
      h('button', { class: 'ghost', type: 'button', onclick: () => Cloud.abmelden() }, ['Abmelden'])
    ]),
    go
  ]);
  setTimeout(() => name.focus(), 30);
  go.addEventListener('click', async () => {
    if (!name.value.trim()) { info.textContent = 'Bitte einen Namen eintragen.'; return; }
    go.disabled = true;
    const r = await Cloud.client.rpc('firma_anlegen', { p_name: name.value.trim() });
    go.disabled = false;
    if (r.error) { info.textContent = 'Das hat nicht geklappt: ' + r.error.message; return; }
    try { localStorage.setItem(CL_KEY_FIRMA, r.data); } catch (e) {}
    d.close();
    // Gibt es Daten in diesem Browser? Dann gleich den Umzug anbieten.
    location.reload();
  });
}

// ---------- Umzug: Daten aus diesem Browser in die Cloud ----------
function clLocalData() {
  const out = { settings: lsGet(LS.settings), zaehler: lsGet(LS.zaehler) || {} };
  ['jobs', 'kunden'].concat(EXTRA_COLS).forEach(c => { out[c] = lsGet(LS[c]) || {}; });
  out.anzahl = ['jobs', 'kunden'].concat(EXTRA_COLS).reduce((s, c) => s + Object.keys(out[c]).length, 0);
  return out;
}
async function clUploadLocal() {
  const L = clLocalData();
  if (!L.anzahl && !L.settings) { toast('In diesem Browser sind keine lokalen Daten gespeichert.', true); return; }
  const ok = await ask('Aus diesem Browser werden ' + Object.keys(L.jobs).length + ' Aufträge, ' + Object.keys(L.kunden).length + ' Kunden'
    + (L.settings ? ' und die Einstellungen' : '') + ' in die Firma „' + Cloud.firma.name + '“ hochgeladen. Gleiche Einträge in der Cloud werden überschrieben. Die lokalen Daten bleiben als Sicherung im Browser.',
    { title: 'Lokale Daten hochladen?', ok: 'Hochladen' });
  if (!ok) return;
  const db = Store.db;
  try {
    if (L.settings) await db.doc('config/firma').set(L.settings);
    let cnt = 0;
    for (const c of ['jobs', 'kunden'].concat(EXTRA_COLS)) {
      for (const id of Object.keys(L[c])) { await db.collection(c).doc(id).set(L[c][id]); cnt++; if (cnt % 20 === 0) toast(cnt + ' Einträge hochgeladen …'); }
    }
    // Zähler: lokal steht die nächste freie Nummer, in der Cloud die zuletzt vergebene
    const z = L.zaehler, y = new Date().getFullYear();
    if (z.next !== undefined && z.an === undefined) z.an = z.next;
    if (z.jahr === y) for (const k of ['an', 'ab', 'ls', 're']) if (n(z[k]) > 1) await db.setCounter(k, y, n(z[k]) - 1);
    if (n(z.kd) > 1) await db.setCounter('kd', 0, n(z.kd) - 1);
    toast('Fertig: ' + cnt + ' Einträge in der Cloud');
    setTimeout(() => location.reload(), 900);
  } catch (e) {
    console.error(e);
    toast('Hochladen abgebrochen: ' + (e.message || e.code || e), true);
  }
}

// ---------- Bereich „Cloud & Team“ in den Einstellungen ----------
async function renderCloudBox() {
  const box = document.getElementById('cloudBox'); if (!box) return;
  box.textContent = '';
  const st = Cloud.status;
  if (st === 'aus') {
    box.appendChild(h('p', { class: 'hint' }, ['Die Cloud ist noch nicht eingerichtet. Deine Daten liegen nur in diesem Browser. Einrichtung: Supabase-Konto anlegen und Zugangsdaten in ', h('code', { text: 'js/cloud-config.js' }), ' eintragen (Anleitung in ', h('code', { text: 'supabase/ANLEITUNG.md' }), ').']));
    return;
  }
  if (st === 'fehler') {
    box.appendChild(h('p', { class: 'hint neg', text: 'Cloud nicht erreichbar: ' + Cloud.fehler + '. Es wird lokal gearbeitet.' }));
    box.appendChild(h('button', { class: 'ghost mini', type: 'button', onclick: () => location.reload() }, ['Erneut verbinden']));
    return;
  }
  if (st === 'abgemeldet') {
    box.appendChild(h('p', { class: 'hint', text: 'Nicht angemeldet. Du arbeitest gerade nur mit den Daten in diesem Browser.' }));
    box.appendChild(h('button', { class: 'primary mini', type: 'button', onclick: () => { try { sessionStorage.removeItem(CL_KEY_LOKAL); } catch (e) {} clShowLogin(); } }, ['Anmelden']));
    return;
  }
  if (st === 'keineFirma') { box.appendChild(h('button', { class: 'primary mini', type: 'button', onclick: clShowFirmaNeu }, ['Firma anlegen'])); return; }

  // Angemeldet
  const F = Cloud.firma;
  box.appendChild(h('div', { class: 'cl-who' }, [
    h('div', null, [h('strong', { text: F.name }), h('small', { class: 'mut', text: (F.rolle === 'inhaber' ? 'Inhaber' : 'Mitarbeiter') + ' · ' + Cloud.user.email })]),
    h('button', { class: 'ghost mini', type: 'button', onclick: () => Cloud.abmelden() }, ['Abmelden'])
  ]));
  if (Cloud.firmen.length > 1) {
    const sel = h('select', { onchange: e => Cloud.waehleFirma(e.target.value) }, Cloud.firmen.map(x => h('option', { value: x.id, text: x.name + (x.rolle === 'inhaber' ? '' : ' (Mitarbeiter)') })));
    sel.value = F.id;
    box.appendChild(h('label', { style: 'margin-top:10px' }, ['Firma wechseln', sel]));
  }
  const L = clLocalData();
  box.appendChild(h('div', { class: 'row', style: 'margin-top:10px' }, [
    L.anzahl || L.settings ? h('button', { class: 'ghost mini', type: 'button', onclick: clUploadLocal }, [icon('upload'), 'Lokale Daten hochladen (' + L.anzahl + ')']) : null,
    h('button', { class: 'ghost mini', type: 'button', onclick: clShowFirmaNeu }, ['Weitere Firma anlegen'])
  ]));

  // Team
  const team = h('div', { class: 'cl-team' }, [h('div', { class: 'sub', text: 'Team' }), h('p', { class: 'mut', text: 'Wird geladen …' })]);
  box.appendChild(team);
  try {
    const [m, e] = await Promise.all([
      Cloud.client.from('mitglieder').select('user_id, rolle, email').eq('firma_id', F.id),
      Cloud.istInhaber() ? Cloud.client.from('einladungen').select('id, email, rolle').eq('firma_id', F.id) : Promise.resolve({ data: [] })
    ]);
    if (m.error) throw m.error;
    team.lastChild.remove();
    (m.data || []).forEach(x => team.appendChild(h('div', { class: 'cl-row' }, [
      h('span', null, [x.email || 'Mitglied', x.user_id === Cloud.user.id ? h('small', { class: 'mut', text: ' (du)' }) : null]),
      h('span', { class: 'tag', text: x.rolle === 'inhaber' ? 'Inhaber' : 'Mitarbeiter' }),
      Cloud.istInhaber() && x.user_id !== Cloud.user.id ? h('button', { class: 'x', type: 'button', title: 'Aus der Firma entfernen', onclick: async () => {
        if (!(await ask((x.email || 'Dieses Mitglied') + ' verliert den Zugriff auf alle Daten der Firma.', { title: 'Mitglied entfernen?', ok: 'Entfernen', danger: true }))) return;
        const r = await Cloud.client.from('mitglieder').delete().eq('firma_id', F.id).eq('user_id', x.user_id);
        if (r.error) toast(r.error.message, true); renderCloudBox();
      } }, ['×']) : null
    ])));
    (e.data || []).forEach(x => team.appendChild(h('div', { class: 'cl-row' }, [
      h('span', null, [x.email, h('small', { class: 'mut', text: ' (eingeladen)' })]),
      h('span', { class: 'tag', text: x.rolle === 'inhaber' ? 'Inhaber' : 'Mitarbeiter' }),
      h('button', { class: 'x', type: 'button', title: 'Einladung zurückziehen', onclick: async () => { await Cloud.client.from('einladungen').delete().eq('id', x.id); renderCloudBox(); } }, ['×'])
    ])));
    if (Cloud.istInhaber()) {
      const mail = h('input', { type: 'email', placeholder: 'E-Mail des Mitarbeiters' });
      const rolle = h('select', null, [h('option', { value: 'mitarbeiter', text: 'Mitarbeiter' }), h('option', { value: 'inhaber', text: 'Inhaber' })]);
      team.appendChild(h('div', { class: 'cl-invite' }, [mail, rolle, h('button', { class: 'primary mini', type: 'button', onclick: async () => {
        const email = mail.value.trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast('Bitte eine gültige E-Mail-Adresse eintragen.', true); return; }
        const r = await Cloud.client.from('einladungen').insert({ firma_id: F.id, email, rolle: rolle.value });
        if (r.error) { toast(r.error.code === '23505' ? 'Diese Adresse ist schon eingeladen.' : r.error.message, true); return; }
        toast('Eingeladen. Die Person meldet sich einfach mit dieser E-Mail-Adresse an.');
        renderCloudBox();
      } }, ['Einladen'])]));
      team.appendChild(h('p', { class: 'mut', style: 'margin-top:6px', text: 'Eingeladene melden sich mit genau dieser E-Mail-Adresse an und sind dann automatisch in der Firma. Es wird keine eigene Einladungs-Mail verschickt; sag der Person Bescheid.' }));
    }
  } catch (err) {
    team.lastChild.textContent = 'Team konnte nicht geladen werden: ' + (err.message || err);
  }
}

// Kleine Anzeige in der Kopfzeile
function renderCloudChip() {
  const c = document.getElementById('cloudChip'); if (!c) return;
  const st = Cloud.status;
  c.hidden = st === 'aus';
  c.className = 'cloudchip ' + (st === 'bereit' ? 'on' : st === 'fehler' ? 'err' : '');
  c.textContent = st === 'bereit' ? Cloud.firma.name : st === 'fehler' ? 'Cloud-Fehler' : 'Nicht angemeldet';
  c.title = st === 'bereit' ? 'Angemeldet als ' + Cloud.user.email + ' – Daten in der Cloud' : 'Daten nur in diesem Browser';
}
