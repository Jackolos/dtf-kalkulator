// Rechnungswesen: Anzahlungsrechnung, Stornorechnung, Zahlungserinnerung/Mahnung, Wiedervorlage („Zu erledigen“),
// E-Rechnung (XRechnung, XML), Rechnungsausgangsbuch (CSV) und E-Mail an Kunden.
// Lädt vor app.js: Funktionen aus app.js (makeDoc, toast, ask, openJob …) und die Variablen job, S, dirty
// werden nur innerhalb von Funktionen benutzt, also erst wenn die Seite fertig geladen ist.
// Öffentlich: mailTo(addr, subject, body), renderTodo(), renderFinJob(), xrechnungXml(J, R, S), buchCsv(jobs, S)

// ---------- kleine Helfer ----------
// Tage von a bis b (ISO-Daten)
function finDays(a, b) { return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000); }
// Anzahlung, die auf der Schlussrechnung abgezogen wird (brutto)
function finAzAbzug(J) { return J.azNr && n(J.azBetrag) > 0 ? n(J.azBetrag) : 0; }
// Noch offener Rechnungsbetrag (brutto)
function finOffen(J, brutto) { return r2(brutto - finAzAbzug(J)); }
// E-Mail-Adresse des Kunden: aus der Kundenliste, sonst aus dem Feld „Kontakt“
function finEmailOf(J) {
  const k = J.kundeId ? Store.kunden.find(x => x.id === J.kundeId) : null;
  if (k && k.data && k.data.email) return String(k.data.email).trim();
  const m = String(J.kontakt || '').match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/);
  return m ? m[0] : '';
}
// Name des Ansprechpartners (erster Teil von „Kontakt“, wenn es nach einem Namen aussieht)
function finAnrede(J) {
  const name = String(J.kontakt || '').split(',')[0].trim();
  return name && !/[@\d]/.test(name) && name.length < 60 ? 'Guten Tag ' + name + ',' : 'Sehr geehrte Damen und Herren,';
}
function finGruss(SX) { return 'Mit freundlichen Grüßen\n' + [SX.fInhaber, SX.fName].filter(Boolean).join('\n'); }

// Mailprogramm mit Empfänger, Betreff und Text öffnen
function mailTo(addr, subject, body) {
  const url = 'mailto:' + String(addr || '').replace(/[^\w.@+-]/g, '') +
    '?subject=' + encodeURIComponent(subject || '') + '&body=' + encodeURIComponent(String(body || '').replace(/\r?\n/g, '\r\n'));
  const a = document.createElement('a');
  a.href = url;
  document.body.appendChild(a); a.click(); a.remove();
}

// ======================= 1. Anzahlungsrechnung =======================
HOOKS.docPrepare.anzahlung = async (j, R) => {
  if (!(n(j.anzahlung) > 0)) { toast('Trag zuerst bei Konditionen eine Anzahlung in % ein', true); return false; }
  // Gibt es die Anzahlungsrechnung schon, wird sie unverändert (gleicher Betrag, gleiches Datum) erneut ausgegeben
  if (!(j.azNr && n(j.azBetrag) > 0)) { j.azBetrag = R.anzahlung; j.azDatum = todayIso(); markDirty(); }
  else if (Math.abs(n(j.azBetrag) - R.anzahlung) > 0.005) toast('Die Anzahlungsrechnung ' + j.azNr + ' wird mit dem ursprünglichen Betrag ' + eur(n(j.azBetrag)) + ' erneut ausgegeben.', true);
  return {};
};
HOOKS.docAfter.anzahlung = () => { renderFinJob(); };

DOC_BUILDERS.anzahlung = (J, R, SJ, nr) => {
  const mw = R.z.mwst, az = n(J.azBetrag) || R.anzahlung;
  const azNetto = r2(az / (1 + mw)), azUst = r2(az - azNetto);
  const datum = J.azDatum || todayIso();
  const info = [['Rechnung Nr.', nr], ['Datum', fmtDate(datum)], ['Kunden-Nr.', J.kundeNr], ['Ihr Auftrag', J.abNr],
    ['Leistungsdatum', J.lieferDatum ? 'voraussichtlich ' + fmtDate(J.lieferDatum) : ''], ['Ihre USt-IdNr.', J.kundeUstId]];
  const F = pdfFrame('Anzahlungsrechnung', J, SJ, { info, betreff: 'Anzahlungsrechnung ' + (J.name || '') });
  pdfIntro(F, 'wie vereinbart stellen wir Ihnen für den unten genannten Auftrag eine Anzahlung in Rechnung:');
  const auftrag = J.abNr || J.angebotNr || J.name || '';
  pdfLines(F, [{ title: 'Anzahlung ' + pct(n(J.anzahlung)) + ' auf Auftrag ' + auftrag, sizes: '', typ: 'leistung',
    druck: (J.name ? J.name + ' · ' : '') + 'Gesamt netto ' + eur(R.net) + (mw > 0 ? ', brutto ' + eur(R.brutto) : ''),
    count: 1, einheit: 'pausch.', unit: azNetto, total: azNetto }], true);
  const rows = [['Gesamt netto', azNetto, true]];
  if (mw > 0) rows.push(['zzgl. ' + pct(mw * 100) + ' USt.', azUst]);
  pdfTotals(F, rows, 'Rechnungsbetrag', az);
  const notes = [];
  if (mw === 0) notes.push('Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.');
  notes.push('Bitte überweisen Sie den Betrag ohne Abzug bis ' + fmtDate(addDays(datum, n(SJ.zahlungsziel))) + ' unter Angabe der Rechnungsnummer ' + (nr || '') + '.');
  if (SJ.fBank) notes.push('Bankverbindung: ' + SJ.fBank.replace(/\n/g, ' · '));
  notes.push('Die Anzahlung wird in der Schlussrechnung verrechnet.');
  pdfNotes(F, notes, SJ);
  return F.finish();
};

// ======================= 2. Stornorechnung =======================
// Rechnungen darf man nicht löschen: Eine Stornorechnung mit eigener Nummer hebt sie auf.
async function stornoRechnung() {
  if (!job.reNr) { toast('Dieser Auftrag hat noch keine Rechnung.', true); return null; }
  const ok = await ask('Rechnungen darf man nicht löschen oder ändern. Stattdessen entsteht eine Stornorechnung mit eigener Nummer, die die Rechnung ' + job.reNr +
    ' mit negativen Beträgen aufhebt. Danach kannst du eine neue Rechnung schreiben. Wichtig: Erstell das Storno, bevor du Positionen oder Preise änderst.', {
    title: 'Rechnung stornieren?', ok: 'Stornorechnung erstellen', danger: true });
  if (!ok) return null;
  return makeDoc('storno');
}
HOOKS.docPrepare.storno = async j => {
  if (!j.reNr) { toast('Dieser Auftrag hat noch keine Rechnung.', true); return false; }
  return { orig: { reNr: j.reNr, reDatum: j.reDatum } };
};
HOOKS.docAfter.storno = (j, nr) => {
  const R = calcJob(j, S, false);
  j.stornos.push({ nr, reNr: j.reNr, reDatum: j.reDatum, datum: todayIso(), brutto: -R.brutto, netto: -R.net, satz: r2(R.z.mwst * 100), az: finAzAbzug(j) });
  j.reNr = ''; j.reDatum = ''; j.status = 'geliefert';
  markDirty();
  toast('Rechnung storniert. Status: ' + STATUS.geliefert.l);
  renderFinJob();
};

DOC_BUILDERS.storno = (J, R, SJ, nr, extra) => {
  const o = (extra && extra.orig) || { reNr: J.reNr, reDatum: J.reDatum };
  const info = [['Stornorechnung Nr.', nr], ['Datum', fmtDate(todayIso())], ['Kunden-Nr.', J.kundeNr], ['Zu Rechnung', o.reNr],
    ['Rechnungsdatum', fmtDate(o.reDatum)], ['Leistungsdatum', fmtDate(J.leistungsDatum || o.reDatum)], ['Ihre USt-IdNr.', J.kundeUstId]];
  const F = pdfFrame('Stornorechnung', J, SJ, { info, betreff: 'Storno zu Rechnung Nr. ' + o.reNr + ' vom ' + fmtDate(o.reDatum) });
  pdfIntro(F, 'hiermit stornieren wir die oben genannte Rechnung vollständig. Alle Positionen und Beträge werden mit umgekehrtem Vorzeichen aufgeführt:');
  pdfLines(F, R.lines.map(l => Object.assign({}, l, { unit: -l.unit, total: -l.total })), true);
  const rows = totalRows(R, J).map(r => [r[0], -r[1], r[2]]);
  const az = finAzAbzug(J);
  if (az > 0) {
    // Die ursprüngliche Rechnung war eine Schlussrechnung mit abgezogener Anzahlung
    pdfTotals(F, rows, 'Gesamtbetrag', -R.brutto);
    const azNetto = r2(az / (1 + R.z.mwst));
    pdfTotals(F, [['zzgl. verrechnete Anzahlung (Rechnung ' + J.azNr + ')', azNetto], R.z.mwst > 0 ? ['zzgl. darin enthaltene USt.', r2(az - azNetto)] : null].filter(Boolean), 'Storno-Betrag', -r2(R.brutto - az));
  } else pdfTotals(F, rows, 'Storno-Betrag', -R.brutto);
  const notes = [];
  if (R.z.mwst === 0) notes.push('Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.');
  notes.push('Die Rechnung Nr. ' + o.reNr + ' vom ' + fmtDate(o.reDatum) + ' ist damit aufgehoben.');
  if (az > 0) notes.push('Die Anzahlungsrechnung ' + J.azNr + ' bleibt bestehen und wird in der neuen Rechnung verrechnet.');
  notes.push('Falls Sie den Betrag bereits bezahlt haben, verrechnen wir ihn mit der neuen Rechnung oder erstatten ihn Ihnen.');
  pdfNotes(F, notes, SJ);
  return F.finish();
};

// ======================= 4. Zahlungserinnerung / Mahnung =======================
// Stufe 1 = Zahlungserinnerung, 2 = Mahnung, 3 = 2. Mahnung … Mahnwesen-Werte aus den aktuellen Einstellungen.
function finMahnInfo(J) {
  const stufe = (J.mahnungen || []).length + 1;
  const titel = stufe === 1 ? 'Zahlungserinnerung' : stufe === 2 ? 'Mahnung' : (stufe - 1) + '. Mahnung';
  const gebuehr = stufe >= 2 ? r2(n(S.mahngebuehr)) : 0;
  const bisher = (J.mahnungen || []).reduce((s, m) => s + n(m.gebuehr), 0);
  return { stufe, titel, gebuehr, bisher: r2(bisher), frist: addDays(todayIso(), n(S.mahnFristTage) || 7) };
}
HOOKS.docPrepare.mahnung = async j => {
  if (!j.reNr) { toast('Für eine Zahlungserinnerung brauchst du zuerst eine Rechnung.', true); return false; }
  return {};
};
HOOKS.docAfter.mahnung = j => {
  const M = finMahnInfo(j);
  j.mahnungen.push({ datum: todayIso(), stufe: M.stufe, frist: M.frist, gebuehr: M.gebuehr });
  markDirty();
  renderFinJob();
};

DOC_BUILDERS.mahnung = (J, R, SJ) => {
  const M = finMahnInfo(J);
  const info = [['Datum', fmtDate(todayIso())], ['Kunden-Nr.', J.kundeNr], ['Rechnung Nr.', J.reNr], ['Rechnungsdatum', fmtDate(J.reDatum)],
    ['Fällig war', J.reDatum ? fmtDate(addDays(J.reDatum, n(SJ.zahlungsziel))) : '']];
  const F = pdfFrame(M.titel, J, SJ, { info, betreff: M.titel + ' zu Rechnung Nr. ' + J.reNr + (J.name ? ' (' + J.name + ')' : '') });
  const vorher = (J.mahnungen || []).slice(-1)[0];
  pdfIntro(F, M.stufe === 1
    ? 'sicher ist es Ihrer Aufmerksamkeit entgangen: Für die unten genannte Rechnung konnten wir bis heute keinen Zahlungseingang feststellen. Wir bitten Sie freundlich, den offenen Betrag zu überweisen. Falls Sie bereits bezahlt haben, betrachten Sie dieses Schreiben bitte als gegenstandslos.'
    : 'leider konnten wir trotz unseres Schreibens' + (vorher ? ' vom ' + fmtDate(vorher.datum) : '') + ' bis heute keinen Zahlungseingang für die unten genannte Rechnung feststellen. Wir bitten Sie, den offenen Betrag nun umgehend zu überweisen. Falls sich Ihre Zahlung mit diesem Schreiben gekreuzt hat, betrachten Sie es bitte als gegenstandslos.');
  const rows = [['Rechnung ' + J.reNr + (J.reDatum ? ' vom ' + fmtDate(J.reDatum) : ''), R.brutto]];
  const az = finAzAbzug(J);
  if (az > 0) rows.push(['abzgl. Anzahlung (Rechnung ' + J.azNr + ')', -az]);
  if (M.bisher > 0) rows.push(['Mahngebühren aus früheren Schreiben', M.bisher]);
  if (M.gebuehr > 0) rows.push(['Mahngebühr', M.gebuehr]);
  const total = r2(R.brutto - az + M.bisher + M.gebuehr);
  pdfTotals(F, rows, 'Offener Betrag', total);
  const notes = ['Bitte überweisen Sie den offenen Betrag von ' + eur(total) + ' bis spätestens ' + fmtDate(M.frist) + ' unter Angabe der Rechnungsnummer ' + J.reNr + '.'];
  if (SJ.fBank) notes.push('Bankverbindung: ' + SJ.fBank.replace(/\n/g, ' · '));
  if (M.stufe >= 3) notes.push('Sollte der Betrag bis zu diesem Datum nicht bei uns eingegangen sein, müssen wir weitere Schritte einleiten.');
  notes.push('Bei Fragen zur Rechnung melden Sie sich gerne bei uns.');
  pdfNotes(F, notes, SJ);
  return F.finish();
};

// ======================= Bereich im Auftrag (#finJobBox) =======================
function renderFinJob() {
  const box = $('finJobBox'); if (!box || typeof job === 'undefined' || !job) return;
  box.textContent = '';
  const kids = [];
  const btns = [];
  if (job.reNr) {
    if (job.status === 'berechnet') btns.push(h('button', { class: 'ghost mini', type: 'button', onclick: () => makeDoc('mahnung') }, [icon('alert'), finMahnInfo(job).titel + ' erstellen']));
    btns.push(h('button', { class: 'ghost mini danger', type: 'button', onclick: () => stornoRechnung() }, [icon('trash'), 'Rechnung stornieren']));
  }
  if (btns.length) kids.push(h('div', { class: 'row' }, btns));
  if (job.azNr && !job.azBezahlt) kids.push(h('p', { class: 'fin-note', text: 'Anzahlung ' + job.azNr + ' über ' + eur(n(job.azBetrag)) + ' ist noch nicht bezahlt.' }));
  const list = [];
  (job.stornos || []).forEach(s => list.push(h('li', null, [h('b', { text: 'Storno ' + (s.nr || '') }), ' zu Rechnung ' + (s.reNr || '–') + ' · ' + fmtDate(s.datum) + ' · ' + eur(n(s.brutto))])));
  (job.mahnungen || []).forEach((m, i) => list.push(h('li', null, [h('b', { text: i === 0 ? 'Zahlungserinnerung' : i === 1 ? 'Mahnung' : i + '. Mahnung' }),
    ' · ' + fmtDate(m.datum) + ' · Frist bis ' + fmtDate(m.frist) + (n(m.gebuehr) > 0 ? ' · Gebühr ' + eur(n(m.gebuehr)) : '')])));
  if (list.length) kids.push(h('ul', { class: 'fin-hist' }, list));
  if (!kids.length) return;
  box.appendChild(h('div', { class: 'fin-job' }, kids));
}
HOOKS.jobRender.push(renderFinJob);
HOOKS.resultsRender.push(() => renderFinJob());

// ======================= 3. Wiedervorlage „Zu erledigen“ =======================
let finTodoAll = false;   // alle Einträge zeigen statt nur die ersten

// Gespeicherten Auftrag ändern (aus der Liste heraus). Ist er gerade offen, bekommt auch der offene Auftrag die Werte.
function finPatch(id, patch, msg) {
  const e = Store.jobs.find(x => x.id === id); if (!e) return Promise.resolve();
  const d = Object.assign({}, e.data, patch, { updatedAt: Date.now() });
  return Store.saveJob(id, d).then(() => {
    if (msg) toast(msg);
    if (job.id === id) { if (dirty) Object.assign(job, patch); else openJob(id); }
    renderList();
  }, () => toast('Speichern hat nicht geklappt. Versuch es nochmal.', true));
}
// Auftrag öffnen und danach etwas tun (z. B. ein Dokument erstellen)
function finOpen(id, then) {
  guardSwitch(() => { openJob(id); showView('auftrag'); if (then) then(); });
}
function finNachfassen(id) {
  const e = Store.jobs.find(x => x.id === id); if (!e) return;
  const d = e.data;
  const body = finAnrede(d) + '\n\n' +
    'vor einigen Tagen haben wir Ihnen unser Angebot' + (d.angebotNr ? ' Nr. ' + d.angebotNr : '') + (d.name ? ' für „' + d.name + '“' : '') +
    ' über ' + eur(n(d.angebotBrutto)) + ' geschickt. Haben Sie noch Fragen oder Änderungswünsche? Wir passen das Angebot gerne an.\n\n' +
    'Das Angebot ist gültig bis ' + fmtDate(addDays(d.datum, n(S.gueltigTage))) + '. Wenn Sie zusagen, starten wir direkt mit der Druckfreigabe.\n\n' + finGruss(S);
  mailTo(finEmailOf(d), 'Unser Angebot' + (d.angebotNr ? ' ' + d.angebotNr : '') + (d.name ? ' – ' + d.name : ''), body);
  if (!finEmailOf(d)) toast('Keine E-Mail-Adresse beim Kunden gefunden. Trag sie im Mailprogramm ein.', true);
  finPatch(id, { nachgefasstAm: todayIso() }, 'Mailprogramm geöffnet');
}

function todoItems() {
  const heute = todayIso(), items = [];
  const ziel = n(S.zahlungsziel), nachfass = n(S.nachfassTage) || 7;
  Store.jobs.forEach(e => {
    const d = e.data || {}, id = e.id, st = d.status || 'angebot';
    const base = { id, name: d.name || 'Ohne Namen', kunde: d.kunde || '' };
    const add = o => items.push(Object.assign({}, base, o));
    // (a) Angebot nachfassen
    if (st === 'angebot' && d.datum) {
      const due = addDays(d.nachgefasstAm || d.datum, nachfass);
      if (due <= heute) add({ art: 'Angebot', betrag: n(d.angebotBrutto), due, tone: 'amber',
        text: d.nachgefasstAm ? 'zuletzt nachgefasst ' + fmtDate(d.nachgefasstAm) : 'seit ' + finDays(d.datum, heute) + ' Tagen ohne Antwort',
        actions: [['Nachfassen', () => finNachfassen(id), true], ['Abgelehnt', () => finPatch(id, { status: 'abgelehnt' }, 'Status: ' + STATUS.abgelehnt.l)]] });
    }
    // (b) Rechnung überfällig
    if (st === 'berechnet' && d.reDatum) {
      const mahn = Array.isArray(d.mahnungen) ? d.mahnungen : [];
      const letzte = mahn[mahn.length - 1];
      const due = letzte && letzte.frist ? letzte.frist : addDays(d.reDatum, ziel);
      if (due < heute) add({ art: 'Rechnung', betrag: r2(n(d.angebotBrutto) - finAzAbzug(d)), due, tone: 'warn',
        text: (d.reNr || '') + (mahn.length ? ' · ' + mahn.length + ' Schreiben verschickt' : ''),
        actions: [[mahn.length ? 'Nächste Mahnung' : 'Zahlungserinnerung', () => finOpen(id, () => makeDoc('mahnung')), true],
          ['Bezahlt', () => finPatch(id, { status: 'bezahlt', bezahltAm: heute }, 'Status: ' + STATUS.bezahlt.l)]] });
    }
    // (c) geliefert, aber noch keine Rechnung
    if (st === 'geliefert' && !d.reNr) add({ art: 'Rechnung fehlt', betrag: n(d.angebotBrutto), due: '', tone: 'amber', text: 'geliefert, noch nicht berechnet',
      actions: [['Rechnung schreiben', () => finOpen(id, () => makeDoc('rechnung')), true]] });
    // (d) Anzahlung offen
    if (d.azNr && !d.azBezahlt && !['bezahlt', 'abgelehnt'].includes(st)) {
      const due = d.azDatum ? addDays(d.azDatum, ziel) : '';
      add({ art: 'Anzahlung', betrag: n(d.azBetrag), due, tone: due && due < heute ? 'warn' : '', text: d.azNr,
        actions: [['Anzahlung erhalten', () => finPatch(id, { azBezahlt: heute }, 'Anzahlung als bezahlt eingetragen'), true]] });
    }
    // (e) Liefertermin in höchstens 3 Tagen
    if ((st === 'auftrag' || st === 'produktion') && d.lieferDatum && finDays(heute, d.lieferDatum) <= 3) {
      add({ art: 'Liefertermin', betrag: n(d.angebotBrutto), due: d.lieferDatum, tone: d.lieferDatum < heute ? 'warn' : 'amber',
        text: STATUS[st].l, actions: [] });
    }
  });
  // Überfälliges zuerst, dann nach Datum
  const rank = t => t.tone === 'warn' ? 0 : t.tone === 'amber' ? 1 : 2;
  return items.sort((a, b) => rank(a) - rank(b) || (a.due || '9').localeCompare(b.due || '9'));
}

function renderTodo() {
  const box = $('todoBox'); if (!box) return;
  box.textContent = '';
  const items = todoItems();
  if (!items.length) return;
  const heute = todayIso(), MAX = 6;
  const shown = finTodoAll ? items : items.slice(0, MAX);
  const list = h('div', { class: 'todo-list' });
  shown.forEach(t => {
    let faellig = '';
    if (t.due) {
      const dd = finDays(heute, t.due);
      faellig = dd < 0 ? 'seit ' + (-dd) + (dd === -1 ? ' Tag' : ' Tagen') + ' fällig' : dd === 0 ? 'heute fällig' : 'fällig ' + fmtDate(t.due);
      if (t.art === 'Liefertermin') faellig = dd < 0 ? 'Liefertermin seit ' + (-dd) + (dd === -1 ? ' Tag' : ' Tagen') + ' vorbei' : dd === 0 ? 'Lieferung heute' : 'Lieferung ' + fmtDate(t.due);
    } else faellig = 'jetzt erledigen';
    list.appendChild(h('div', { class: 'todo-item' + (t.tone ? ' ' + t.tone : '') }, [
      h('span', { class: 'todo-art', text: t.art }),
      h('div', { class: 'todo-main' }, [
        h('button', { class: 'link', type: 'button', title: 'Auftrag öffnen', onclick: () => finOpen(t.id) }, [t.name]),
        h('small', { text: [t.kunde, t.text].filter(Boolean).join(' · ') })
      ]),
      h('span', { class: 'todo-sum', text: t.betrag ? eur(t.betrag) : '' }),
      h('span', { class: 'todo-due', text: faellig }),
      h('div', { class: 'todo-act' }, t.actions.map(([label, fn, main]) => h('button', { class: (main ? 'primary' : 'ghost') + ' mini', type: 'button', onclick: fn }, [label])))
    ]));
  });
  const head = h('h2', { class: 'sec' }, ['Zu erledigen ', h('span', { class: 'chip', text: String(items.length) })]);
  if (items.length > MAX) head.appendChild(h('button', { class: 'link right', type: 'button', onclick: () => { finTodoAll = !finTodoAll; renderTodo(); } }, [finTodoAll ? 'Weniger zeigen' : 'Alle ' + items.length + ' zeigen']));
  box.appendChild(h('div', { class: 'panel todo' }, [head, list]));
}
HOOKS.listRender.push(renderTodo);

// ======================= 5. E-Rechnung (XRechnung, UBL 2.1) =======================
// Ehrlicher Hinweis: Das ist eine Grundumsetzung. Sie erzeugt die üblichen Pflichtfelder nach XRechnung 3.0
// (UBL-Syntax), wurde aber nicht gegen jede Geschäftsregel geprüft. Adressen werden aus Freitext geraten.
// Vor dem ersten echten Versand die Datei mit einem Validator (z. B. KoSIT-Validator) prüfen.
function finEsc(s) { return String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;'); }
function finAmt(v) { return (Math.round(n(v) * 100) / 100).toFixed(2); }
function finQty(v) { return String(Math.round(n(v) * 10000) / 10000); }
function finUnit(e) {
  const s = String(e || '').toLowerCase();
  if (/std|stunde/.test(s)) return 'HUR';
  if (/min/.test(s)) return 'MIN';
  if (/satz/.test(s)) return 'SET';
  if (/pausch/.test(s)) return 'LS';
  if (/^m$|meter/.test(s)) return 'MTR';
  if (/stk|stück|st\./.test(s)) return 'H87';
  return 'C62';
}
// Adresse aus Freitext zerlegen: Straße, PLZ, Ort, Land (geraten)
function finAddr(text) {
  const lines = String(text || '').split(/\n|,/).map(s => s.trim()).filter(Boolean);
  let plz = '', city = '', street = '', country = 'DE', idx = -1;
  lines.forEach((l, i) => { const m = l.match(/^(?:(?:D|A|CH)\s*-\s*)?(\d{4,5})\s+(.+)$/i); if (m && idx < 0) { idx = i; plz = m[1]; city = m[2]; } });
  const before = idx >= 0 ? lines.slice(0, idx) : lines;
  street = before.slice().reverse().find(l => /\d/.test(l) && /[a-zäöüß]/i.test(l)) || before[before.length - 1] || '';
  const all = lines.join(' ');
  if (/österreich|austria/i.test(all) || /^A\s*-/i.test(lines[idx] || '')) country = 'AT';
  else if (/schweiz|switzerland|suisse/i.test(all) || /^CH\s*-/i.test(lines[idx] || '')) country = 'CH';
  if (!city && lines.length) city = lines[lines.length - 1];
  return { street, plz, city, country };
}
function finAddrXml(a) {
  return '<cac:PostalAddress>' + (a.street ? '<cbc:StreetName>' + finEsc(a.street) + '</cbc:StreetName>' : '') +
    '<cbc:CityName>' + finEsc(a.city) + '</cbc:CityName>' + (a.plz ? '<cbc:PostalZone>' + finEsc(a.plz) + '</cbc:PostalZone>' : '') +
    '<cac:Country><cbc:IdentificationCode>' + a.country + '</cbc:IdentificationCode></cac:Country></cac:PostalAddress>';
}
function finIban(text) {
  const m = String(text || '').toUpperCase().match(/\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{1,4}){3,8}\b/);   // nur Leerzeichen, nicht über Zeilen hinweg
  if (!m) return '';
  const iban = m[0].replace(/\s/g, '');
  return iban.length >= 15 && iban.length <= 34 ? iban : '';
}
function finBic(text) { const m = String(text || '').match(/BIC\s*:?\s*([A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?)\b/i); return m ? m[1].toUpperCase() : ''; }
function finKontakt(SX) {
  const t = String(SX.fKontakt || '');
  const mail = (t.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/) || [''])[0];
  const tel = ((t.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '').match(/\+?\d[\d\s\/()-]{5,}\d/) || [''])[0]).trim();
  return { name: SX.fInhaber || SX.fName || '', tel, mail };
}

function xrechnungXml(J, R, SX) {
  const A = finAmt, X = finEsc, cur = ' currencyID="EUR"';
  const rate = r2(R.z.mwst * 100), cat = rate > 0 ? 'S' : 'E';
  const taxCat = tag => '<cac:' + tag + '><cbc:ID>' + cat + '</cbc:ID><cbc:Percent>' + A(rate) + '</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:' + tag + '>';
  const reDatum = J.reDatum || todayIso();
  const due = addDays(reDatum, n(SX.zahlungsziel));
  // Rechnungszeilen: Positionen + Einrichtung, Express, Versand, Mindermenge
  const lines = R.lines.map(l => ({ name: l.title, desc: [l.sizes ? 'Größen: ' + l.sizes : '', l.druck].filter(Boolean).join('; '), qty: l.count, unit: finUnit(l.einheit), price: l.unit, total: l.total }));
  const flat = (name, v) => { if (v > 0) lines.push({ name, desc: '', qty: 1, unit: 'C62', price: v, total: v }); };
  flat('Einrichtung und Datenaufbereitung', R.pausch);
  flat('Expresszuschlag ' + pct(R.z.express * 100), R.expressAmt);
  flat('Versand (' + n(J.pakete) + ' Paket' + (n(J.pakete) > 1 ? 'e' : '') + ')', R.versandVK);
  flat('Mindermengenzuschlag', R.minder);
  const lineExt = r2(lines.reduce((s, l) => s + n(l.total), 0));
  const rabatt = r2(R.rabattAmt);
  const taxExcl = r2(lineExt - rabatt);
  const tax = r2(taxExcl * rate / 100);
  const taxIncl = r2(taxExcl + tax);
  const prepaid = finAzAbzug(J);
  const payable = r2(taxIncl - prepaid);
  const K = finKontakt(SX), seller = finAddr(SX.fAdresse), buyer = finAddr(J.adresse);
  const iban = finIban(SX.fBank), bic = finBic(SX.fBank), buyerMail = finEmailOf(J);
  const o = [];
  o.push('<?xml version="1.0" encoding="UTF-8"?>');
  o.push('<ubl:Invoice xmlns:ubl="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">');
  o.push('<cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0</cbc:CustomizationID>');
  o.push('<cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>');
  o.push('<cbc:ID>' + X(J.reNr) + '</cbc:ID>');
  o.push('<cbc:IssueDate>' + reDatum + '</cbc:IssueDate>');
  o.push('<cbc:DueDate>' + due + '</cbc:DueDate>');
  o.push('<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>');
  if (J.name) o.push('<cbc:Note>' + X('Auftrag: ' + J.name) + '</cbc:Note>');
  o.push('<cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>');
  o.push('<cbc:BuyerReference>' + X(J.kundeNr || J.abNr || 'n/a') + '</cbc:BuyerReference>');
  if (J.azNr) o.push('<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>' + X(J.azNr) + '</cbc:ID>' + (J.azDatum ? '<cbc:IssueDate>' + J.azDatum + '</cbc:IssueDate>' : '') + '</cac:InvoiceDocumentReference></cac:BillingReference>');
  // Verkäufer
  o.push('<cac:AccountingSupplierParty><cac:Party>');
  if (K.mail) o.push('<cbc:EndpointID schemeID="EM">' + X(K.mail) + '</cbc:EndpointID>');
  o.push('<cac:PartyName><cbc:Name>' + X(SX.fName) + '</cbc:Name></cac:PartyName>');
  o.push(finAddrXml(seller));
  if (SX.fUstId) o.push('<cac:PartyTaxScheme><cbc:CompanyID>' + X(SX.fUstId.replace(/\s/g, '')) + '</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>');
  if (SX.fSteuerNr) o.push('<cac:PartyTaxScheme><cbc:CompanyID>' + X(SX.fSteuerNr) + '</cbc:CompanyID><cac:TaxScheme><cbc:ID>FC</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>');
  o.push('<cac:PartyLegalEntity><cbc:RegistrationName>' + X(SX.fName) + '</cbc:RegistrationName></cac:PartyLegalEntity>');
  o.push('<cac:Contact><cbc:Name>' + X(K.name) + '</cbc:Name>' + (K.tel ? '<cbc:Telephone>' + X(K.tel) + '</cbc:Telephone>' : '') + (K.mail ? '<cbc:ElectronicMail>' + X(K.mail) + '</cbc:ElectronicMail>' : '') + '</cac:Contact>');
  o.push('</cac:Party></cac:AccountingSupplierParty>');
  // Käufer
  o.push('<cac:AccountingCustomerParty><cac:Party>');
  if (buyerMail) o.push('<cbc:EndpointID schemeID="EM">' + X(buyerMail) + '</cbc:EndpointID>');
  if (J.kundeNr) o.push('<cac:PartyIdentification><cbc:ID>' + X(J.kundeNr) + '</cbc:ID></cac:PartyIdentification>');
  o.push('<cac:PartyName><cbc:Name>' + X(J.kunde) + '</cbc:Name></cac:PartyName>');
  o.push(finAddrXml(buyer));
  if (J.kundeUstId) o.push('<cac:PartyTaxScheme><cbc:CompanyID>' + X(J.kundeUstId.replace(/\s/g, '')) + '</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>');
  o.push('<cac:PartyLegalEntity><cbc:RegistrationName>' + X(J.kunde) + '</cbc:RegistrationName></cac:PartyLegalEntity>');
  o.push('</cac:Party></cac:AccountingCustomerParty>');
  // Lieferung, Zahlung
  o.push('<cac:Delivery><cbc:ActualDeliveryDate>' + (J.leistungsDatum || reDatum) + '</cbc:ActualDeliveryDate></cac:Delivery>');
  o.push('<cac:PaymentMeans><cbc:PaymentMeansCode>' + (iban ? '58' : '1') + '</cbc:PaymentMeansCode><cbc:PaymentID>' + X(J.reNr) + '</cbc:PaymentID>' +
    (iban ? '<cac:PayeeFinancialAccount><cbc:ID>' + iban + '</cbc:ID><cbc:Name>' + X(SX.fInhaber || SX.fName) + '</cbc:Name>' +
      (bic ? '<cac:FinancialInstitutionBranch><cbc:ID>' + bic + '</cbc:ID></cac:FinancialInstitutionBranch>' : '') + '</cac:PayeeFinancialAccount>' : '') + '</cac:PaymentMeans>');
  let terms = 'Zahlbar ohne Abzug bis ' + fmtDate(due) + '.';
  if (R.z.sk > 0) terms += '\n#SKONTO#TAGE=' + n(SX.skontoTage) + '#PROZENT=' + A(R.z.sk * 100) + '#\n';
  o.push('<cac:PaymentTerms><cbc:Note>' + X(terms) + '</cbc:Note></cac:PaymentTerms>');
  // Rabatt auf Belegebene
  if (rabatt > 0) o.push('<cac:AllowanceCharge><cbc:ChargeIndicator>false</cbc:ChargeIndicator><cbc:AllowanceChargeReason>' + X('Rabatt ' + pct(R.z.rb * 100)) + '</cbc:AllowanceChargeReason><cbc:Amount' + cur + '>' + A(rabatt) + '</cbc:Amount>' + taxCat('TaxCategory') + '</cac:AllowanceCharge>');
  // Steuer
  o.push('<cac:TaxTotal><cbc:TaxAmount' + cur + '>' + A(tax) + '</cbc:TaxAmount><cac:TaxSubtotal><cbc:TaxableAmount' + cur + '>' + A(taxExcl) + '</cbc:TaxableAmount><cbc:TaxAmount' + cur + '>' + A(tax) + '</cbc:TaxAmount>' +
    '<cac:TaxCategory><cbc:ID>' + cat + '</cbc:ID><cbc:Percent>' + A(rate) + '</cbc:Percent>' + (cat === 'E' ? '<cbc:TaxExemptionReason>Kleinunternehmer gemäß § 19 UStG</cbc:TaxExemptionReason>' : '') +
    '<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>');
  // Summen
  o.push('<cac:LegalMonetaryTotal><cbc:LineExtensionAmount' + cur + '>' + A(lineExt) + '</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount' + cur + '>' + A(taxExcl) + '</cbc:TaxExclusiveAmount>' +
    '<cbc:TaxInclusiveAmount' + cur + '>' + A(taxIncl) + '</cbc:TaxInclusiveAmount>' + (rabatt > 0 ? '<cbc:AllowanceTotalAmount' + cur + '>' + A(rabatt) + '</cbc:AllowanceTotalAmount>' : '') +
    (prepaid > 0 ? '<cbc:PrepaidAmount' + cur + '>' + A(prepaid) + '</cbc:PrepaidAmount>' : '') + '<cbc:PayableAmount' + cur + '>' + A(payable) + '</cbc:PayableAmount></cac:LegalMonetaryTotal>');
  // Zeilen
  lines.forEach((l, i) => {
    o.push('<cac:InvoiceLine><cbc:ID>' + (i + 1) + '</cbc:ID><cbc:InvoicedQuantity unitCode="' + l.unit + '">' + finQty(l.qty) + '</cbc:InvoicedQuantity>' +
      '<cbc:LineExtensionAmount' + cur + '>' + A(l.total) + '</cbc:LineExtensionAmount><cac:Item>' + (l.desc ? '<cbc:Description>' + X(l.desc) + '</cbc:Description>' : '') +
      '<cbc:Name>' + X(l.name || 'Position ' + (i + 1)) + '</cbc:Name>' + taxCat('ClassifiedTaxCategory') + '</cac:Item>' +
      '<cac:Price><cbc:PriceAmount' + cur + '>' + A(l.price) + '</cbc:PriceAmount></cac:Price></cac:InvoiceLine>');
  });
  o.push('</ubl:Invoice>');
  return { xml: o.join('\n'), warn: [!iban ? 'keine IBAN in der Bankverbindung gefunden' : '', !K.mail ? 'keine E-Mail-Adresse bei deinen Kontaktdaten' : '', !buyerMail ? 'keine E-Mail-Adresse beim Kunden' : ''].filter(Boolean) };
}

async function finXRechnung() {
  if (!last || !last.lines.length) { showMsg('Der Auftrag ist noch leer.'); return; }
  if (!job.reNr) {
    const ok = await ask('Für die E-Rechnung brauchst du zuerst eine Rechnung mit Nummer. Jetzt die Rechnung erstellen?', { title: 'Zuerst Rechnung erstellen?', ok: 'Rechnung erstellen' });
    if (!ok) return;
    const nr = await makeDoc('rechnung');
    if (!nr || !job.reNr) return;
  }
  try {
    const SX = settingsFor(job, S);
    const res = xrechnungXml(job, calcJob(job, S, false), SX);
    await saveFile('XRechnung_' + job.reNr.replace(/[^A-Za-z0-9_-]+/g, '_') + '.xml', res.xml);
    toast('E-Rechnung gespeichert. Prüf die Datei vor dem Versand mit einem Validator, z. B. dem kostenlosen KoSIT-Validator oder einem Online-Validator für XRechnung.' + (res.warn.length ? ' Achtung: ' + res.warn.join(', ') + '.' : ''), res.warn.length > 0);
  } catch (e) {
    if (e && e.code === 'declined') return;
    console.error(e); toast('Die E-Rechnung konnte nicht gespeichert werden.', true);
  }
}

// ======================= 6. Rechnungsausgangsbuch (CSV) =======================
function buchCsv(jobs, SX) {
  const head = ['Belegart', 'Belegnr.', 'Datum', 'Kunden-Nr.', 'Kunde', 'Netto', 'USt-Satz', 'USt', 'Brutto', 'Erlöskonto', 'Gegenkonto (Debitor)', 'Bezahlt am', 'Auftrag', 'Bemerkung'];
  const esc = v => { const s = String(v === null || v === undefined ? '' : v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const num = v => N2.format(n(v));
  const konto = SX.erloeskonto || '';
  const rows = [];
  jobs.forEach(e => {
    const d = e.data || {};
    // USt-Satz aus den gespeicherten Beträgen ableiten (Netto → Brutto)
    const satz = n(d.angebotNetto) > 0 ? Math.round((n(d.angebotBrutto) / n(d.angebotNetto) - 1) * 100) : n(SX.mwst);
    const row = (art, nr, datum, netto, brutto, s, bezahlt, bem) => rows.push({ datum: datum || '', nr: nr || '', cells: [art, nr, fmtDate(datum), d.kundeNr, d.kunde, num(netto), N1.format(s) + ' %', num(r2(brutto - netto)), num(brutto), konto, d.kundeNr, fmtDate(bezahlt), d.name, bem || ''] });
    const azNetto = (az, s) => r2(az / (1 + s / 100));
    // Anzahlungsrechnung
    if (d.azNr && n(d.azBetrag) > 0) row('Anzahlungsrechnung', d.azNr, d.azDatum, azNetto(n(d.azBetrag), satz), n(d.azBetrag), satz, d.azBezahlt, '');
    // Stornierte Rechnungen und ihre Stornorechnungen
    (Array.isArray(d.stornos) ? d.stornos : []).forEach(s => {
      const ss = isBlank(s.satz) ? satz : n(s.satz);
      const az = n(s.az), brutto = -n(s.brutto) - az;
      const netto = (isBlank(s.netto) ? azNetto(-n(s.brutto), ss) : -n(s.netto)) - azNetto(az, ss);
      row('Rechnung (storniert)', s.reNr, s.reDatum, netto, brutto, ss, '', 'storniert durch ' + (s.nr || ''));
      row('Stornorechnung', s.nr, s.datum, -netto, -brutto, ss, '', 'Storno zu ' + (s.reNr || ''));
    });
    // Aktuelle Rechnung (bei Anzahlung nur der Restbetrag, sonst wäre die Anzahlung doppelt gebucht)
    if (d.reNr) {
      const az = d.azNr && n(d.azBetrag) > 0 ? n(d.azBetrag) : 0;
      row(az ? 'Schlussrechnung' : 'Rechnung', d.reNr, d.reDatum, r2(n(d.angebotNetto) - azNetto(az, satz)), r2(n(d.angebotBrutto) - az), satz,
        d.status === 'bezahlt' ? d.bezahltAm : '', az ? 'Anzahlung ' + d.azNr + ' verrechnet, Gesamt brutto ' + num(d.angebotBrutto) : '');
    }
  });
  rows.sort((a, b) => a.datum.localeCompare(b.datum) || a.nr.localeCompare(b.nr));
  return { count: rows.length, csv: '﻿' + [head.join(';')].concat(rows.map(r => r.cells.map(esc).join(';'))).join('\r\n') };
}
function finBuchExport() {
  const res = buchCsv(Store.jobs, S);
  if (!res.count) { toast('Noch keine Rechnungen vorhanden.', true); return; }
  saveFile('Rechnungsausgangsbuch_' + todayIso() + '.csv', res.csv).then(() => toast('Rechnungsausgangsbuch mit ' + res.count + ' Belegen gespeichert'), () => {});
}

// ======================= 7. E-Mail an den Kunden =======================
async function finMail() {
  const kind = await ask('Welches Dokument möchtest du dem Kunden schicken? Das Mailprogramm öffnet sich mit fertigem Text, das PDF hängst du selbst an.', {
    title: 'E-Mail an Kunden',
    buttons: [{ label: 'Angebot', value: 'angebot', cls: 'primary' }, { label: 'Auftragsbestätigung', value: 'ab', cls: 'ghost' }, { label: 'Druckfreigabe', value: 'freigabe', cls: 'ghost' },
      { label: 'Rechnung', value: 'rechnung', cls: 'ghost' }, { label: 'Abbrechen', value: false, cls: 'ghost' }]
  });
  if (!kind) return;
  const SX = settingsFor(job, S), R = calcJob(job, S, false), J = job;
  const name = J.name ? ' „' + J.name + '“' : '';
  const termin = J.lieferDatum ? fmtDate(J.lieferDatum) : J.liefertermin;
  let subject = '', text = '';
  if (kind === 'angebot') {
    subject = 'Angebot' + (J.angebotNr ? ' ' + J.angebotNr : '') + (J.name ? ' – ' + J.name : '');
    text = 'vielen Dank für Ihre Anfrage. Im Anhang finden Sie unser Angebot' + (J.angebotNr ? ' Nr. ' + J.angebotNr : '') + name + ' über ' + eur(R.brutto) +
      (R.z.mwst > 0 ? ' (' + eur(R.net) + ' netto)' : '') + '.\n\nDas Angebot ist gültig bis ' + fmtDate(addDays(J.datum, n(SX.gueltigTage))) + '.' +
      (termin ? ' Die Lieferzeit beträgt ' + termin + ' nach Freigabe der Druckdaten.' : '') +
      '\n\nBei Fragen oder Änderungswünschen melden Sie sich gerne. Wir freuen uns auf Ihren Auftrag.';
  } else if (kind === 'ab') {
    subject = 'Auftragsbestätigung' + (J.abNr ? ' ' + J.abNr : '') + (J.name ? ' – ' + J.name : '');
    text = 'vielen Dank für Ihren Auftrag' + name + '. Im Anhang finden Sie unsere Auftragsbestätigung' + (J.abNr ? ' Nr. ' + J.abNr : '') + ' über ' + eur(R.brutto) + '.' +
      (termin ? '\n\nVoraussichtlicher Liefertermin: ' + termin + '.' : '') +
      (R.anzahlung > 0 ? '\n\nBitte überweisen Sie die vereinbarte Anzahlung von ' + eur(R.anzahlung) + '. Die Produktion beginnt nach Zahlungseingang und Freigabe der Druckdaten.' : '');
  } else if (kind === 'freigabe') {
    subject = 'Druckfreigabe' + (J.name ? ' – ' + J.name : '');
    text = 'im Anhang finden Sie die Druckfreigabe für Ihren Auftrag' + name + '. Bitte prüfen Sie Motive, Druckstellen, Größen, Farben und Mengen sorgfältig.' +
      '\n\nWenn alles stimmt, bestätigen Sie die Freigabe bitte kurz per Antwort auf diese E-Mail. Erst danach beginnen wir mit der Produktion.';
  } else {
    if (!J.reNr) toast('Dieser Auftrag hat noch keine Rechnungsnummer. Erstell zuerst die Rechnung.', true);
    const reD = J.reDatum || todayIso(), offen = finOffen(J, R.brutto);
    subject = 'Rechnung' + (J.reNr ? ' ' + J.reNr : '') + (J.name ? ' – ' + J.name : '');
    text = 'vielen Dank für Ihren Auftrag' + name + '. Im Anhang finden Sie unsere Rechnung' + (J.reNr ? ' Nr. ' + J.reNr : '') + ' über ' + eur(offen) + '.' +
      '\n\nBitte überweisen Sie den Betrag bis ' + fmtDate(addDays(reD, n(SX.zahlungsziel))) + (J.reNr ? ' unter Angabe der Rechnungsnummer' : '') + '.' +
      (R.z.sk > 0 ? ' Bei Zahlung bis ' + fmtDate(addDays(reD, n(SX.skontoTage))) + ' können Sie ' + pct(R.z.sk * 100) + ' Skonto abziehen.' : '') +
      (SX.fBank ? '\n\nBankverbindung: ' + SX.fBank.replace(/\n/g, ' · ') : '');
  }
  const body = finAnrede(J) + '\n\n' + text + '\n\nDas PDF finden Sie im Anhang.\n\n' + finGruss(SX);
  const addr = finEmailOf(J);
  mailTo(addr, subject, body);
  toast('Mailprogramm geöffnet – PDF bitte anhängen' + (addr ? '' : '. Beim Kunden ist keine E-Mail-Adresse hinterlegt.'), !addr);
}

// ---------- Knöpfe verbinden (DOM existiert schon, Funktionen aus app.js erst beim Klick nötig) ----------
(function () {
  const on = (id, fn) => { const b = $(id); if (b) b.addEventListener('click', fn); };
  on('btnXRechnung', () => finXRechnung());
  on('btnMail', () => finMail());
  on('btnBuchCsv', () => finBuchExport());
})();
