# DTF-Kalkulator – Projektkontext für Claude Code

## Worum es geht
Kostenrechnung und Auftragsverwaltung für Textildruck mit DTF-Transfers (Transfers werden als Gang Sheet pro Laufmeter eingekauft oder selbst gedruckt und mit der Heißpresse auf Textilien gepresst).
Aus einem Auftrag (Textilien, Größen, Druckstellen, Transfers, Leistungen) entsteht ein Angebotspreis nach der klassischen Zuschlagskalkulation mit Maschinenstundensatz, dazu Angebot, Auftragsbestätigung, Produktionsauftrag, Lieferschein und Rechnung als PDF.

Der Entwickler ist Programmier-Einsteiger und arbeitet unter Windows. Erklärungen bitte einfach und auf Deutsch halten. Schwesterprojekt: Gang-Sheet-Konfigurator (https://github.com/Jackolos/gang-sheet-tool). Hintergrundwissen zu DTF steht in `DTF-Wissen.md` (nur lokal, nicht im Repository).

## Technik
- Reines Browser-Projekt, **kein Build, kein Node/Python** nötig: `index.html` doppelklicken.
- Normale `<script>`-Tags (keine ES-Module, die gehen über `file://` nicht). Alle Dateien teilen sich den globalen Namensraum.
- An Skript- und CSS-Links hängt `?v=2.2`.
- Dateien immer als UTF-8 lesen und schreiben (in PowerShell `-Encoding utf8`), sonst werden Umlaute zerstört. Bei einem Update hochzählen, sonst mischt der Browser-Cache alte und neue Dateien (GitHub Pages).
- Externe Bibliotheken werden erst bei Bedarf von cdnjs geladen: jsPDF 2.5.1 (Dokumente), pdf.js 3.11.174 (PDF-Gang-Sheets, PDF-Infoblätter), SheetJS 0.18.5 (Excel).
- Der alte Ein-Datei-Prototyp liegt in `prototyp/index-alt.html`.

## Dateien
| Datei | Inhalt |
|---|---|
| `index.html` | Seitengerüst: Kopfzeile, fünf Ansichten (Auftrag, Aufträge, Kunden, Auswertung, Einstellungen), Fenster |
| `css/style.css` | Design „Dark Tech“ wie im Gang-Sheet-Konfigurator (Tokens oben im `:root`, Hellmodus über `data-theme="light"`) |
| `js/core.js` | Konstanten (`SIZES`, `STATUS`, `POS_TYPES`, `DOCS`), `DEFAULTS()`, Hilfsfunktionen (`h()`, `n()`, Formatierer), Migration `migrateSettings()` / `normalizeJob()` |
| `js/calc.js` | **Reine Rechenfunktionen** ohne DOM: `calc(J, S)`, `planFilm()`, `machineRate()`, `fixHelper()`, `scaleJob()`, `compareAnbieter()`, `istValues()`, `summarizeJobs()` |
| `js/store.js` | Speichern: Claude-Artifact-DB oder localStorage, Nummernkreise, Datensicherung, `saveFile()` |
| `js/pdf.js` | `buildPdf(kind, J, R, S, nr)` für alle fünf Dokumentarten, `docMissing()` |
| `js/io.js` | Gang Sheets messen, Konfigurator-Projekt (.json) lesen, Infoblatt-Import mit Claude, Excel-Vorlage, CSV-Export |
| `js/garments.js` | Kleidungs-Bibliothek (Präfix `gar`): `GARMENTS` (10 Teile mit Maßtabellen XS–5XL und Druckbereichen), `drawGarment`, `drawPrint`, `defaultPlacement`, `checkPlacement`, `drawTemplatePhoto`, `GARMENT_COLORS` |
| `js/mockup.js` | Präfix `mk`: Motivbild-Upload je Druckstelle, Szene rendern mit Bemaßung, Mockup-Seite im Angebot, `DOC_BUILDERS.freigabe` (Datenblatt / Druckfreigabe) |
| `js/studio.js` | Mockup-Studio (Präfix `st`): `openStudio(posId?)`, Platzieren per Ziehen, Lineal, Maßlinien, Größenvergleich, eigene Produktfotos einmessen |
| `js/finanzen.js` | Anzahlungs-, Storno-, Mahn-PDF, XRechnung (UBL), Rechnungsausgangsbuch (CSV), E-Mail (mailto), „Zu erledigen“-Liste |
| `js/produktion.js` | Ansicht Produktion: Plan/Kalender, Textil-Einkauf, Sammel-Folie, Lager, Fehldruck-Auswertung (Präfix `prod`) |
| `js/verkauf.js` | Ansicht Verkauf: Preisliste, Vorlagen, Einstellungen Anfrageformular (Präfix `vk`) |
| `js/anfrage.js` | Erzeugt das eigenständige Kunden-Anfrageformular `anfrage.html` und liest Anfrage-Dateien ein (Präfix `anf`) |
| `js/selftest.js` | `runSelfTest()` mit den Prüfwerten (Einstellungen → Selbsttest oder `index.html?test`) |
| `js/app.js` | Oberfläche: Rendern, Datenbindung (`data-job`, `data-set`, `data-ist`), Varianten, Zeiterfassung, Dokument-Ablauf `makeDoc()`, Start |

### Zusatzmodule und Andockstellen
Die Module unter `js/` (mockup, finanzen, produktion, verkauf, anfrage) ändern `app.js` nicht. Sie melden sich über `HOOKS` (in `core.js`) an: `motifExtras`, `posExtras`, `views`, `docPrepare`, `docExtras`, `docAfter`, `listRender`, `jobRender`, `resultsRender`. Neue Dokumentarten über `DOC_BUILDERS[kind]`, Zusatzseiten über `PDF_EXTRA_PAGES` (beides in `pdf.js`, Bausteine `pdfFrame`, `pdfLines`, `pdfTotals`, `pdfNotes`). Jedes Modul hat eigene CSS-Datei und eigenes Namenspräfix, damit sich globale Namen nicht überschneiden.

### Wichtige Abläufe
- **Varianten:** `job.varNamen` (z. B. A/B), Positionen mit `p.var`. `calcJob()` rechnet die gewählte Variante (`job.variante`); das Angebot zeigt alle.
- **Preise festschreiben:** Beim ersten Dokument wird `job.Ssnap` (Kopie der Einstellungen ohne Logo) gespeichert. `settingsFor()` / `calcJob()` rechnen danach damit.
- **Mockup-Koordinaten:** cm, Ursprung = Kragenpunkt auf der Mittellinie in Höhe der höchsten Schulterpunkte (HPS), x nach rechts im Bild (Brust links des Trägers = x > 0), y nach unten. `m.x` = Motivmitte, `m.y` = Motiv-Oberkante. Fehlen sie, gilt `defaultPlacement()`. Standardabstände („7–8 cm unter Kragen“) zählen ab der Kragennaht `collar.y0`.
- **Nummernkreise:** `DOCS[kind].cnt` bestimmt den Zähler; Anzahlungs- und Stornorechnungen teilen sich den Rechnungskreis.

## Regeln für Änderungen
- Oberfläche komplett auf Deutsch. Kunden siezen (Dokumente), Nutzer duzen (App).
- Geldbeträge mit `eur()` (Intl de-DE). Stückpreise werden nach Einstellung **immer aufgerundet**.
- `calc()` bleibt eine reine Funktion von Auftrag und Einstellungen. Bei Änderungen an der Rechnung: Test in `js/selftest.js` ergänzen und `docs/KALKULATION.md` nachziehen.
- Gespeicherte Daten nie ohne Migration umbauen: neue Felder in `DEFAULTS()` / `blankJob()` mit Standardwert, Umbauten in `migrateSettings()` / `normalizeJob()`. Neue Felder, die die Rechnung ändern, müssen für alte Daten neutral sein (Beispiel: alte Einstellungen bekommen keine Presse).
- Design mit dem Gang-Sheet-Konfigurator einheitlich halten (gleiche Tokens, `h2.sec` mit CMYK-Balken, `.panel`, `.stats`, Schalter statt Häkchen).

## Artifact-spezifische Stellen (für die Web-App ersetzen)
`window.claude.use(...)` gibt es nur im Claude-Artifact:
- `db` → Sammlungen `jobs`, `kunden`, Dokumente `config/firma`, `config/zaehler`. Ausweichlösung localStorage. Nur `js/store.js` muss getauscht werden.
- `downloads` → Ausweichlösung `saveFile()` mit normalem Download.
- `sample` → Infoblatt einlesen. In der Web-App über einen Server-Endpunkt mit der Anthropic API (Schlüssel nie im Browser). Prompt in `buildPrompt()`, Antwort verarbeitet `jobFromImport()`.

## Prüfen
- `index.html?test` öffnen: alle Tests müssen grün sein.
- Prüfwerte (alte Einstellungen aus `beispieldaten/einstellungen-standard.json`, Beispielauftrag „Vereinsshirts“): 42 Teile, 13,80 m Folie, Selbstkosten 800,62 €, Angebot 1.037,60 € netto, Gewinn nach Skonto 216,23 €.
- Mit den neuen Standardwerten (inkl. Heißpresse 1,15 €/h) ergibt der Beispielauftrag 1.040,40 € netto.
