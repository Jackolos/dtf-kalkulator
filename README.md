# DTF-Kalkulator

Kostenrechnung, Angebote und Auftragsverwaltung für Textildruck mit DTF-Transfers: von Textil, Folie, Arbeitszeit und Presse über die Gemeinkosten bis zu Angebot, Auftragsbestätigung, Produktionsauftrag, Lieferschein und Rechnung.

## Starten
`index.html` doppelklicken. Läuft im Browser und speichert im Browser (localStorage). Internet braucht die Seite nur beim ersten Erstellen eines PDFs bzw. für Excel (die Bibliotheken werden dann geladen).

**Wichtig:** Die Daten liegen nur in diesem Browser. Unter Einstellungen → Daten regelmäßig eine **Datensicherung** herunterladen.

## Funktionen
**Auftrag**
- Drei Positionsarten:
  - **Textil + Druck**: Artikel aus dem Katalog, Farbe hell/dunkel, Größen XS–5XL mit Aufpreisen, Druckstellen mit Vorlagen, Namen/Nummern (individuell)
  - **Nur Transfers**: Kunde presst selbst (Folie + Schneiden, kein Textil)
  - **Leistung**: nach Zeit (Grafik, Vektorisieren), Einkauf/Fremdleistung (z. B. Stick bei Partner) oder Festpreis
- Konditionen: Gewinnzuschlag, Kundenrabatt, Skonto, Einrichtung, Expresszuschlag, Anzahlung, Folien-Anbieter, Heißpresse, Sammelbestellung
- Versand in den Stückpreisen oder als eigene Zeile, Zusatzarbeit, sonstige Kosten
- Kennzahlen live: Angebot netto/brutto, Gewinn, Teile, Transfers, Folie, Arbeitszeit, Preisaufbau mit Gewinn-Ring
- Reiter: Angebot (mit Text zum Kopieren, „Kunde nennt einen Preis“, Wunsch-Stückpreis), Folie & Gang Sheets (Vorschau, Anbieter-Vergleich, echte Gang Sheets messen, Projekt aus dem Gang-Sheet-Konfigurator übernehmen), Kalkulationsschema (gesamt, pro Teil, je Position), Staffelpreise (eigene Mengen), Nachkalkulation

**Dokumente (PDF)**
- Angebot, Auftragsbestätigung, Produktionsauftrag (intern, mit Pressparametern und Checkliste), Lieferschein (mit Unterschriftfeld), Rechnung (mit Pflichtangaben, Zahlungsziel, Skonto, Bankverbindung)
- Fortlaufende Nummern pro Jahr mit eigenem Kürzel (z. B. RE-2026-001), Firmenlogo, Fußzeile mit Firmenangaben
- Status springt beim Erstellen automatisch weiter (Bestätigt → In Produktion → Geliefert → Berechnet)

**Neu in Version 2.2**
- **Varianten** im Angebot (z. B. Standard / Premium), der Kunde wählt, Bestätigung und Rechnung nehmen die gewählte
- **Mockups:** Motivbild pro Druckstelle hochladen, Ansicht auf T-Shirt, Polo, Hoodie oder Tasche, auch als Seite im Angebot
- **Druckfreigabe** als PDF mit Mockups, Maßen und Unterschriftsfeld
- **Preise festschreiben:** Ab dem ersten Dokument ändern spätere Einstellungen den Auftrag nicht mehr
- **Zeiterfassung** (Start/Stopp) und **Fehldrucke** in der Nachkalkulation
- **Produktion:** Kalender mit Kapazität, Textil-Bestellliste je Lieferant (mit Lagerabzug), Sammel-Folie über mehrere Aufträge mit Ersparnis, Lager, echte Ausschussquote, Export für den Gang-Sheet-Konfigurator
- **Verkauf:** Preisliste als PDF/CSV/Text, Auftragsvorlagen, Anfrageformular für Kunden (`anfrage.html` zum Verschicken oder Hochladen) und Import der Anfrage-Datei
- **Rechnungswesen:** Anzahlungs- und Schlussrechnung, Stornorechnung, Zahlungserinnerung/Mahnung, E-Rechnung (XRechnung-XML, Grundumsetzung, bitte mit einem Validator prüfen), Rechnungsausgangsbuch (CSV), E-Mail an Kunden, Liste „Zu erledigen“

**Mockup-Studio (Version 2.4)**
- 10 gezeichnete Kleidungsstücke (T-Shirt Unisex/Damen, Langarm, Polo, Sweatshirt, Hoodie, Zip-Hoodie, Tanktop, Tasche, Schürze) in jeder Farbe, mit typischen Maßtabellen XS–5XL und maximalen Druckbereichen
- Motive per Ziehen platzieren, Lineal, Maßlinien (Abstand Kragen / Mitte), Einrasten an der Mitte, Rückgängig, Größenvergleich kleinste/größte bestellte Größe, Warnungen bei zu großen Motiven oder zu wenig Abstand zu Nähten
- Eigene Produktfotos hochladen und einmessen (Kragenpunkt + bekannte Strecke)
- **Datenblatt / Druckfreigabe (PDF)** für Kunden: Mockups vorne/hinten mit Bemaßung, Tabelle der Druckstellen, Größenverteilung, Freigabe-Feld

**Aufträge, Kunden, Auswertung**
- Auftragsliste mit Status (direkt änderbar), Suche, Filter und CSV-Export für die Buchhaltung
- Kundenliste mit Kundennummer, Kontakt, USt-IdNr., Standard-Rabatt, Umsatz und Auftragshistorie
- Auswertung: Umsatz und Gewinn pro Monat, Angebotsquote, offene Angebote und Rechnungen (überfällig rot), beste Kunden

**Einstellungen**
- Firma, Logo, Steuernummer, Bank, Dokumenttexte und Nummernkürzel
- Mehrere Folien-Anbieter mit Mengenstaffel, auch Eigendruck (Folie/Pulver pro Meter + Tinte pro m²)
- Heißpressen mit Maschinenstundensatz (Abschreibung, Zinsen, Wartung, Strom)
- Arbeitszeiten, Lohnnebenkosten, Fixkosten → Gemeinkosten-Zuschlag, Preise, Rundung, MwSt
- Textil-Katalog mit Pressparametern, Druckstellen-Vorlagen
- Datensicherung, Excel-Auftragsblatt für Kunden, Selbsttest der Rechnung

## Dateien
| Datei | Inhalt |
|---|---|
| `index.html` | Seitengerüst |
| `css/style.css` | Design (gleich wie Gang-Sheet-Konfigurator) |
| `js/*.js` | Programm, aufgeteilt nach Aufgaben (siehe `CLAUDE.md`) |
| `docs/KALKULATION.md` | Alle Rechenwege |
| `docs/DATENMODELL.md` | Aufbau von Einstellungen, Aufträgen und Kunden |
| `docs/WEBAPP-PLAN.md` | Schritte zur richtigen Web-App |
| `beispieldaten/` | Einstellungen aus dem Prototyp (Prüfwerte) und ein Beispielauftrag |
| `prototyp/index-alt.html` | Der alte Ein-Datei-Prototyp |

Alle Preise in den Standard-Einstellungen sind Beispielwerte. Vor dem echten Einsatz eigene Zahlen eintragen. Die Dokumente ersetzen keine Steuerberatung: Rechnungsangaben bitte einmal mit dem Steuerberater abgleichen.
