// Speichern und Laden.
// Ist die Cloud eingerichtet und man angemeldet (js/cloud.js), liegen die Daten in Supabase.
// Läuft die Seite als Claude-Artifact, gibt es eine Datenbank (window.claude.use('db')).
// Sonst (Doppelklick auf index.html) landet alles im localStorage dieses Browsers.
// Für die spätere Web-App muss nur dieses Modul gegen eine echte Datenbank getauscht werden.

const LS = { settings: 'dtf-kalk-settings-v1', jobs: 'dtf-kalk-jobs-v1', kunden: 'dtf-kalk-kunden-v1', zaehler: 'dtf-kalk-zaehler', view: 'dtf-kalk-view', theme: 'dtf-theme',
  lager: 'dtf-kalk-lager-v1', vorlagen: 'dtf-kalk-vorlagen-v1', bestellungen: 'dtf-kalk-bestellungen-v1', textilfotos: 'dtf-kalk-textilfotos-v1' };
// Weitere Sammlungen (gleiche Schnittstelle wie Kunden): Store.list(name), Store.put(name, id, data), Store.del(name, id)
// lager: Lagerbestand, vorlagen: Auftragsvorlagen, bestellungen: Sammel-Folienbestellungen
// textilfotos: eigene Produktfotos als Mockup-Vorlage (siehe js/garments.js)
const EXTRA_COLS = ['lager', 'vorlagen', 'bestellungen', 'textilfotos'];
function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }

const Store = {
  mode: 'memory', db: null, caps: { sample: null, downloads: null },
  jobs: [],     // [{id, data}]
  kunden: [],   // [{id, data}]
  lager: [], vorlagen: [], bestellungen: [], textilfotos: [],
  listeners: [],   // Funktionen, die bei Änderungen an Sammlungen aufgerufen werden: fn(name)
  onChange(fn) { this.listeners.push(fn); },
  _notify(name) { this.listeners.forEach(fn => { try { fn(name); } catch (e) { console.error(e); } }); },
  list(name) { return this[name] || []; },
  put(name, id, data) { return this._put(name, LS[name], id, data).then(r => { this._notify(name); return r; }); },
  del(name, id) { return this._del(name, LS[name], id).then(r => { this._notify(name); return r; }); },

  init(cb) {
    const use = (window.claude && window.claude.use) ? nm => window.claude.use(nm).catch(() => null) : () => Promise.resolve(null);
    use('sample').then(s => { this.caps.sample = s; });
    use('downloads').then(d => { this.caps.downloads = d; });
    const cloudP = typeof Cloud === 'object' ? Cloud.start() : Promise.resolve(null);
    return cloudP.then(cdb => cdb || use('db')).then(db => {
      if (typeof renderCloudChip === 'function') renderCloudChip();
      if (db) {
        this.db = db; this.mode = db.cloud ? 'cloud' : 'db';
        db.doc('config/firma').get().then(snap => { if (snap.exists) cb.onSettings(snap.data()); }).catch(() => {});
        let first = true, firstK = true;
        db.collection('jobs').onSnapshot(snap => {
          this.jobs = snap.docs.map(d => ({ id: d.id, data: d.data() || {} }));
          cb.onJobs(first); first = false; this._notify('jobs');
        }, () => cb.onError('Gespeicherte Aufträge konnten nicht geladen werden. Lade die Seite neu.'));
        db.collection('kunden').onSnapshot(snap => {
          this.kunden = snap.docs.map(d => ({ id: d.id, data: d.data() || {} }));
          cb.onKunden(firstK); firstK = false; this._notify('kunden');
        }, () => {});
        EXTRA_COLS.forEach(c => db.collection(c).onSnapshot(snap => {
          this[c] = snap.docs.map(d => ({ id: d.id, data: d.data() || {} }));
          this._notify(c);
        }, () => {}));
      } else {
        EXTRA_COLS.forEach(c => { const m = lsGet(LS[c]) || {}; this[c] = Object.keys(m).map(id => ({ id, data: m[id] })); });
        this.mode = 'local';
        cb.onSettings(lsGet(LS.settings));
        const jm = lsGet(LS.jobs) || {}, km = lsGet(LS.kunden) || {};
        this.jobs = Object.keys(jm).map(id => ({ id, data: jm[id] }));
        this.kunden = Object.keys(km).map(id => ({ id, data: km[id] }));
        cb.onKunden(true);
        cb.onJobs(true);
      }
    });
  },

  // Ein Dokument in einer Sammlung speichern (jobs oder kunden)
  _put(col, lsKey, id, data) {
    const list = this[col], ex = list.find(x => x.id === id);
    if (ex) ex.data = data; else list.push({ id, data });
    if (this.db) return this.db.collection(col).doc(id).set(data);
    const map = lsGet(lsKey) || {}; map[id] = data;
    return lsSet(lsKey, map) ? Promise.resolve() : Promise.reject({ code: 'storage_full' });
  },
  _del(col, lsKey, id) {
    this[col] = this[col].filter(x => x.id !== id);
    if (this.db) return this.db.collection(col).doc(id).delete();
    const map = lsGet(lsKey) || {}; delete map[id]; lsSet(lsKey, map);
    return Promise.resolve();
  },
  saveJob(id, data) { return this.put('jobs', id, data); },
  deleteJob(id) { return this.del('jobs', id); },
  saveKunde(id, data) { return this.put('kunden', id, data); },
  deleteKunde(id) { return this.del('kunden', id); },

  saveSettings(S) {
    const data = clone(S);
    if (this.db) return this.db.doc('config/firma').set(data);
    return lsSet(LS.settings, data) ? Promise.resolve() : Promise.reject({ code: 'storage_full' });
  },

  // Fortlaufende Nummern: Angebote, Bestätigungen, Lieferscheine und Rechnungen pro Jahr, Kunden durchgehend
  _readCounter() {
    if (this.db && this.db.readCounters) return this.db.readCounters();
    if (this.db) { const ref = this.db.doc('config/zaehler'); return ref.get().then(s => (s.exists ? s.data() : {}) || {}); }
    return Promise.resolve(lsGet(LS.zaehler) || {});
  },
  _writeCounter(c) {
    if (this.db && this.db.setCounter) {   // Cloud: zuletzt vergebene Nummern setzen
      const y = new Date().getFullYear(), t = [];
      if (c.jahr === y) ['an', 'ab', 'ls', 're'].forEach(k => { if (n(c[k]) > 1) t.push(this.db.setCounter(k, y, n(c[k]) - 1)); });
      if (n(c.kd) > 1) t.push(this.db.setCounter('kd', 0, n(c.kd) - 1));
      return Promise.all(t);
    }
    if (this.db) return this.db.doc('config/zaehler').set(c);
    lsSet(LS.zaehler, c); return Promise.resolve();
  },
  nextNumber(kind, S) {
    const y = new Date().getFullYear();
    const fmt = k => kind === 'kunde' ? 'K-' + (1000 + k) : ((S[DOCS[kind].pre] || '') ? S[DOCS[kind].pre] + '-' : '') + y + '-' + String(k).padStart(3, '0');
    if (this.db && this.db.nextNumber) {   // Cloud: Nummer atomar auf dem Server
      const key = kind === 'kunde' ? 'kd' : (DOCS[kind] && DOCS[kind].cnt) || 'an';
      return this.db.nextNumber(key, kind === 'kunde' ? 0 : y).then(fmt);
    }
    return this._readCounter().then(c => {
      if (c.next !== undefined && c.an === undefined) c.an = c.next;   // Zähler aus dem Prototyp übernehmen
      if (c.jahr !== y) { c.jahr = y; c.an = 1; c.ab = 1; c.ls = 1; c.re = 1; }
      const key = kind === 'kunde' ? 'kd' : (DOCS[kind] && DOCS[kind].cnt) || 'an';
      const k = Math.max(1, n(c[key]) || 1);
      c[key] = k + 1;
      delete c.next;
      return this._writeCounter(c).then(() => {
        if (kind === 'kunde') return 'K-' + (1000 + k);
        const pre = S[DOCS[kind].pre] || '';
        return (pre ? pre + '-' : '') + y + '-' + String(k).padStart(3, '0');
      });
    });
  },

  // Datensicherung: alles in eine Datei und zurück
  exportAll(S) {
    const out = { app: 'dtf-kalkulator', version: 2, saved: new Date().toISOString(), settings: clone(S) };
    ['jobs', 'kunden'].concat(EXTRA_COLS).forEach(c => { out[c] = {}; this[c].forEach(x => { out[c][x.id] = x.data; }); });
    return this._readCounter().then(z => { out.zaehler = z; return out; });
  },
  importAll(data) {
    const tasks = [];
    Object.keys(data.jobs || {}).forEach(id => tasks.push(this.saveJob(id, data.jobs[id])));
    Object.keys(data.kunden || {}).forEach(id => tasks.push(this.saveKunde(id, data.kunden[id])));
    EXTRA_COLS.forEach(c => Object.keys(data[c] || {}).forEach(id => tasks.push(this.put(c, id, data[c][id]))));
    if (data.zaehler) tasks.push(this._writeCounter(data.zaehler));
    return Promise.all(tasks);
  }
};

// Datei speichern: im Claude-Artifact über die downloads-Fähigkeit, sonst als normaler Browser-Download
function saveFile(filename, data) {
  if (Store.caps.downloads) return Store.caps.downloads.save({ filename, data });
  const blob = data instanceof Blob ? data : new Blob([data]);
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return Promise.resolve({ status: 'saved' });
}
