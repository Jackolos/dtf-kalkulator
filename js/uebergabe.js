// Übergabe zwischen Kalkulator und Gang-Sheet-Konfigurator.
// Beide Tools liegen unter https://jackolos.github.io und teilen sich deshalb den Browser-Speicher.
// Gemeinsame IndexedDB: Datenbank 'dtf-uebergabe' (Version 1), ObjectStore 'pakete' (keyPath 'id').
//
// Kalkulator → Konfigurator, id 'an-konfigurator':
//   {id, erstellt, quelle:'kalkulator', jobId, jobName, kunde,
//    motive:[{name, img (PNG-DataURL oder null), w, h (cm), anzahl}], anbieter:{name, breite (cm)}, abstand (cm)}
// Konfigurator → Kalkulator, id 'an-kalkulator':
//   {id, erstellt, jobId, jobName, blaetter:[{breiteCm, laengeCm, bedeckung (0..1 oder null)}], gesamtLaengeCm}
// Gleiche Datei-Logik gibt es im Konfigurator (js/uebergabe.js).

const UEB_URL_KONFIGURATOR = 'https://jackolos.github.io/gang-sheet-tool/?von=kalkulator';

function uebDb() {
  return new Promise((res, rej) => {
    if (!window.indexedDB) { rej(new Error('Dieser Browser kann keine Daten zwischen den Tools übergeben.')); return; }
    const r = indexedDB.open('dtf-uebergabe', 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('pakete')) r.result.createObjectStore('pakete', { keyPath: 'id' }); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function uebergabeTx(mode, fn) {
  return uebDb().then(db => new Promise((res, rej) => {
    const tx = db.transaction('pakete', mode), st = tx.objectStore('pakete'), req = fn(st);
    tx.oncomplete = () => { db.close(); res(req && req.result); };
    tx.onerror = () => { db.close(); rej(tx.error); };
  }));
}
const uebergabeLesen = id => uebergabeTx('readonly', st => st.get(id));
const uebergabeSchreiben = paket => uebergabeTx('readwrite', st => st.put(paket));
const uebergabeLoeschen = id => uebergabeTx('readwrite', st => st.delete(id));

// ---------- Senden: Druckstellen des offenen Auftrags an den Konfigurator ----------
function uebMotiveAusAuftrag() {
  const R = calcJob(job, S, false), motive = [];
  R.rows.forEach(r => {
    if (r.typ !== 'textil' && r.typ !== 'transfer') return;
    validMotifs(r.p).forEach(m => motive.push({
      name: (m.name || 'Motiv') + ' · ' + (r.p.name || 'Position') + (r.p.farbe ? ' ' + r.p.farbe : ''),
      img: m.img || null, w: n(m.w), h: n(m.h), anzahl: r.np
    }));
  });
  return { motive, anbieter: R.anbieter };
}
async function uebAnKonfigurator() {
  if (!location.protocol.startsWith('http')) { toast('Die Übergabe klappt nur auf der Online-Seite (jackolos.github.io), nicht per Doppelklick.', true); return; }
  const { motive, anbieter } = uebMotiveAusAuftrag();
  if (!motive.length) { toast('Der Auftrag hat keine Druckstellen mit Maßen.', true); return; }
  const ohneBild = motive.filter(m => !m.img).length;
  if (ohneBild && !(await ask(ohneBild + ' von ' + motive.length + ' Druckstellen haben noch kein Motivbild. Der Konfigurator übernimmt nur Motive mit Bild (Bilder lädst du bei der Druckstelle hoch). Trotzdem senden?', { title: 'Motivbilder fehlen', ok: 'Senden' }))) return;
  if (job.id === null || dirty) await persistJob();   // damit das Ergebnis später dem gespeicherten Auftrag zugeordnet werden kann
  try {
    await uebergabeSchreiben({ id: 'an-konfigurator', erstellt: new Date().toISOString(), quelle: 'kalkulator', jobId: job.id, jobName: job.name, kunde: job.kunde,
      motive, anbieter: { name: anbieter.name, breite: n(anbieter.breite) }, abstand: n(S.abstand) });
    window.open(UEB_URL_KONFIGURATOR, 'gang-sheet-tool');
    toast('An den Konfigurator geschickt. Dort „Ergebnis an Kalkulator senden“ klicken, wenn die Bögen fertig sind.');
  } catch (e) { toast('Übergabe fehlgeschlagen: ' + (e.message || e), true); }
}

// ---------- Empfangen: Bogenlänge aus dem Konfigurator ----------
let uebBusy = false;
async function uebPruefen() {
  if (uebBusy || !window.indexedDB) return;
  uebBusy = true;
  try {
    const p = await uebergabeLesen('an-kalkulator');
    if (!p || !Array.isArray(p.blaetter) || !p.blaetter.length) return;
    const gesamt = p.gesamtLaengeCm || p.blaetter.reduce((s, b) => s + n(b.laengeCm), 0);
    const ziel = job.id === p.jobId ? 'offen' : Store.jobs.some(j => j.id === p.jobId) ? 'gespeichert' : 'neu';
    const ok = await ask(p.blaetter.length + ' Blätter mit zusammen ' + N2.format(gesamt / 100) + ' m Folie aus dem Konfigurator'
      + (ziel === 'neu' ? '. Den Auftrag „' + (p.jobName || '') + '“ gibt es hier nicht mehr; das Ergebnis kommt in den offenen Auftrag.' : ' für „' + (p.jobName || 'Auftrag') + '“.')
      + ' Die echte Folienlänge erscheint unter „Folie & Gang Sheets“ und in der Nachkalkulation.',
      { title: 'Ergebnis übernehmen?', buttons: [{ label: 'Übernehmen', value: true, cls: 'primary' }, { label: 'Verwerfen', value: 'weg', cls: 'ghost danger' }, { label: 'Später', value: false, cls: 'ghost' }] });
    if (ok === 'weg') { await uebergabeLoeschen('an-kalkulator'); return; }
    if (ok !== true) return;
    const anwenden = () => {
      job.sheets = (job.sheets || []).filter(s => s.quelle !== 'konfigurator');   // altes Ergebnis ersetzen
      p.blaetter.forEach((b, i) => job.sheets.push({
        id: uid(), quelle: 'konfigurator', name: 'Konfigurator · Blatt ' + (i + 1),
        pxW: n(b.breiteCm), pxH: n(b.laengeCm), widthCm: n(b.breiteCm), lengthCm: n(b.laengeCm),
        coverage: b.bedeckung === null || b.bedeckung === undefined ? null : n(b.bedeckung), note: 'aus dem Gang-Sheet-Konfigurator'
      }));
      showView('auftrag'); showTab('folie'); changed();
      toast('Folienlänge aus dem Konfigurator übernommen');
    };
    await uebergabeLoeschen('an-kalkulator');
    if (ziel === 'gespeichert') guardSwitch(() => { openJob(p.jobId); anwenden(); });
    else anwenden();
  } catch (e) { console.error(e); }
  finally { uebBusy = false; }
}
