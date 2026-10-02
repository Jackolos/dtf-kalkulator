# Rechenwege

Alle Beträge netto in Euro. Prozentwerte werden durch 100 geteilt (`a` = Ausschuss, `mgk`, `fgk`, `vwvt`, `gew` = Gewinnzuschlag, `sk` = Skonto, `rb` = Rabatt, `nk` = Lohnnebenkosten, `ex` = Express).
Code: `js/calc.js`. Tests: `js/selftest.js`.

## 1. Mengen und Positionsarten
| Art | Menge `q` | Gepresst / gedruckt `np` |
|---|---|---|
| Textil + Druck | Summe der Größen oder Feld „Menge“ | ⌈ q · (1 + a) ⌉ (Ausschuss eingerechnet) |
| Nur Transfers | Sätze (jeder Satz = jedes Motiv einmal) | q |
| Leistung | Menge in eigener Einheit (auch Kommazahl) | – |

`Q` = Summe von `q` über Textil und Transfers („Teile“). Auftragskosten (Rüstzeit, Zusatzarbeit, Pakete, sonstige Kosten) werden nach `q / Q` auf Textil und Transfers verteilt. Gibt es nur Leistungen, auf die Leistungen (ohne Festpreise).

## 2. Folie (Gang-Sheet-Planung, `planFilm`)
1. Jede Druckstelle wird `np`-mal gebraucht. Lage: die, die auf die Breite `W` des gewählten Anbieters passt und dabei **niedriger** ist (lange Seite quer).
2. Motivtypen nach Höhe absteigend sortieren.
3. Regal-Verfahren (First Fit Decreasing Height): Jede Reihe hat die Höhe ihres ersten Motivs. Ein Motiv kommt in die erste Reihe, die hoch genug ist und in der noch Breite frei ist (inkl. Abstand `g`), sonst neue Reihe.
4. Geplante Länge = Summe der Reihenhöhen + Abstände. `rawCm` = Länge · (1 + Planungszuschlag).
5. Normale Bestellung: `cm` = rawCm + Zuschlag je Bestellung; Meter = max(Mindestbestellung, aufgerundet auf Abrechnungsschritt). Meterpreis aus der Mengenstaffel des Anbieters (höchste Stufe mit `ab ≤ Meter`), plus Versand.
6. Sammelbestellung: Meter = rawCm / 100 exakt, Preis aus der Staffel bei „typische Sammelbestellung“, kein Versand.
7. Eigendruck: zusätzlich Tinte = bedruckte Fläche (m², ohne Abstände) · Tinte €/m².
8. Folienkosten werden nach belegter Fläche (Motiv + Abstand) auf die Positionen verteilt.

## 3. Maschinenstundensatz (`machineRate`)
```
AfA           = Anschaffung / Nutzungsjahre
Zinsen        = Anschaffung / 2 · Zinssatz
Fix pro h     = (AfA + Zinsen + Wartung pro Jahr) / Laufstunden pro Jahr
Strom pro h   = kW · Heizanteil · Strompreis
Stundensatz   = Fix pro h + Strom pro h
```
Beispiel Standardpresse: (240 + 30 + 50) / 400 + 2 · 0,5 · 0,35 = 1,15 €/h.

## 4. Zuschlagskalkulation je Position
```
Material     Textil:  q · EK + Σ(Übergrößen · Aufpreis) + ⌈q · a⌉ · EK
             Leistung (Einkauf): q · EK pro Einheit
Folie        = Folienkosten · Flächenanteil
MEK          = Material + Folie
MGK          = MEK · mgk
Materialk.   = MEK + MGK
Minuten      Textil:   np · Druckstellen · Pressen_s / 60 + q · Handling_s / 60
             Transfer: np · Druckstellen · Schneiden_s / 60
             Leistung (Zeit): q · Minuten pro Einheit
             + np · individuelle Druckstellen · Namen/Nr._s / 60
             + (Rüstzeit + Zusatzarbeit) · Anteil
Lohn         = Minuten / 60 · Stundenlohn · (1 + nk)
FGK          = Lohn · fgk
Maschine     = Presszeit / 60 · Stundensatz   (nur Textil; Presse wählbar, „keine“ möglich)
Fertigungsk. = Lohn + FGK + Maschine
Herstellk.   = Materialk. + Fertigungsk.
VwVt         = Herstellk. · vwvt
SEKVt        = q · Verpackung (nur Textil) + (Pakete · Paketpreis + Sonstige Kosten) · Anteil
Selbstkosten = Herstellk. + VwVt + SEKVt
Gewinn       = Selbstkosten · gew
Barverkaufspreis  = Selbstkosten + Gewinn
Zielverkaufspreis = Barverkaufspreis / (1 − sk)     (Skonto im Hundert)
Listenpreis       = Zielverkaufspreis / (1 − rb)   (Rabatt im Hundert)
```
Presszeit pro Druckstelle kommt aus dem Katalog-Artikel („Press s“), sonst aus den Einstellungen.
**Festpreis-Leistungen** werden nicht kalkuliert: Preis = eingegebener Preis, Kosten 0.

## 5. Stückpreise und Angebot
- Aufschlagfaktor auf Textil: `k = (1+mgk)(1+vwvt)(1+gew) / ((1−sk)(1−rb))`.
- Grundpreis pro Stück = (Listenpreis − Übergrößen-Aufpreise · k) / q.
- Textil: je Aufpreisgruppe eine Angebotszeile, Stückpreis = Grundpreis + Aufpreis · k, dann **aufgerundet** (0,10 / 0,50 / ,90 / 1 €). Transfers und Leistungen: eine Zeile mit gerundetem Grundpreis.
- Summe Positionen → minus Rabatt (`rb` · Summe) → plus Einrichtung → plus Express (`ex` · (Summe − Rabatt + Einrichtung)) → plus Versand als eigene Zeile (Pakete · Paket Verkauf) → Mindermengenzuschlag bis zum Mindestauftragswert → **Angebot netto**.
- Versand als eigene Zeile: Die Paketkosten stehen dann nicht in den Positionen, sondern zusätzlich in den Selbstkosten des Auftrags.
- USt auf das Netto; bei 0 % Hinweis auf § 19 UStG. Anzahlung = Brutto · Anzahlung %.
- **Gewinn** = Netto · (1 − sk) − Selbstkosten gesamt (vorsichtig: Kunde zieht Skonto). Rundung, Einrichtung, Express und Mindermengenzuschlag erhöhen den Gewinn.

## 6. Fixkosten-Helfer
Gemeinkosten pro Stunde = Fixkosten pro Monat / produktive Stunden.
Fertigungs-Gemeinkosten in % = Gemeinkosten pro Stunde / (Stundenlohn · (1 + nk)) · 100.

## 7. Staffelpreise
Textil- und Transfer-Mengen werden mit Faktor N / Q skaliert (jede belegte Größe mindestens 1) und komplett neu gerechnet. Leistungen bleiben gleich.

## 8. Anbieter-Vergleich
Derselbe Auftrag wird mit jedem Folien-Anbieter neu gerechnet (Meter, Folienkosten, Angebot, Gewinn).

## 9. Nachkalkulation
- Echte Folie = Eingabe, sonst Summe der hochgeladenen Gang Sheets, sonst Plan.
- Abweichungen mit Zuschlägen hochgerechnet:
  - Lohn: (Ist − Plan) / 60 · Stundenlohn · (1+nk) · (1+fgk)(1+vwvt)
  - Folie: (Ist-Kosten − Plan-Kosten) · (1+mgk)(1+vwvt)
  - ungeplante Kosten 1:1
- Ist-Gewinn = Netto · (1 − sk) − Ist-Selbstkosten.

## 10. Gang Sheets messen
- PNG: Breite aus dem pHYs-Block, sonst Breite des Anbieters (Hinweis „bitte prüfen“). Länge = Pixelhöhe / Pixelbreite · Breite.
- PDF: Seitengröße in Punkt → cm. Querformat deutlich breiter als die Rolle gilt als gedreht.
- Bedruckt = Anteil der Pixel mit Alpha > 24. Leer bezahlt = 1 − bedruckt.
- Konfigurator-Projekt (.json): Motivgröße aus `cm`, `sizeRef` und Seitenverhältnis des Bildes. Übernahme als Transfer-Positionen oder als Folienlänge (Blätter laut Projekt bzw. geschätzt über `planFilm`).
- Kalibrierung: echte Länge / `planCm` über alle Aufträge mit Gang Sheets; der Durchschnitt kann als Planungszuschlag übernommen werden.

## 11. Auswertung
Umsatz = Netto aller Aufträge mit Status Bestätigt bis Bezahlt (Monat nach Rechnungsdatum, sonst Angebotsdatum). Angebotsquote = zugesagt / (zugesagt + abgelehnt). Offene Rechnungen = Status „Berechnet“, fällig am Rechnungsdatum + Zahlungsziel.

## Prüfwerte
Alte Einstellungen (`beispieldaten/einstellungen-standard.json`, keine Presse), Beispielauftrag: 30 T-Shirts schwarz (S4 M10 L9 XL5 XXL2) + 12 Hoodies navy (S2 M4 L4 XL2), je Brust links 10×10 und Rücken groß 30×40, Skonto 2 %, Zusatzarbeit 15 min, 1 Paket:
Folie 13,80 m · 144,90 €, Arbeitszeit 2 h 02 min, Selbstkosten 800,62 €, Angebot netto 1.037,60 €, Gewinn nach Skonto 216,23 €.
Mit den neuen Standardwerten (Presse 1,15 €/h): Angebot netto 1.040,40 €.
