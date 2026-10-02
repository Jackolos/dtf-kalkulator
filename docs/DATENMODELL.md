# Datenmodell

Im Claude-Artifact liegen die Daten in einer Dokument-Datenbank, im Browser im localStorage. Für die Web-App bietet sich je eine Tabelle an. Zugriff nur über `js/store.js`.

| Ort | Artifact-DB | localStorage-Schlüssel |
|---|---|---|
| Einstellungen | `config/firma` | `dtf-kalk-settings-v1` |
| Aufträge | `jobs/<id>` | `dtf-kalk-jobs-v1` (Objekt id → Auftrag) |
| Kunden | `kunden/<id>` | `dtf-kalk-kunden-v1` (Objekt id → Kunde) |
| Nummernkreise | `config/zaehler` `{jahr, an, ab, ls, re, kd}` | `dtf-kalk-zaehler` |
| Lager | `lager/<id>` `{typ, catId, name, farbe, groesse, menge, notiz}` | `dtf-kalk-lager-v1` |
| Vorlagen | `vorlagen/<id>` `{name, beschreibung, job, updatedAt}` | `dtf-kalk-vorlagen-v1` |
| Sammel-Folienbestellungen | `bestellungen/<id>` `{datum, anbieterId, anbieterName, jobIds, meter, kosten, anteile, einzelKosten, createdAt}` | `dtf-kalk-bestellungen-v1` |
| Ansicht, Theme | – | `dtf-kalk-view`, `dtf-theme` |

Angebote, Bestätigungen, Lieferscheine und Rechnungen zählen pro Jahr neu, Kundennummern (`K-1001` …) durchgehend. Der alte Zähler `{jahr, next}` wird als `an` übernommen.

## Einstellungen (`S`, Version 2)
```jsonc
{
  "v": 2,
  "fName": "", "fInhaber": "", "fAdresse": "", "fKontakt": "", "fSteuerNr": "", "fUstId": "", "fBank": "", "fFuss": "",
  "fLogo": "data:image/png;base64,…", "fLogoRatio": 0.4,          // Höhe / Breite
  "praefixAN": "AN", "praefixAB": "AB", "praefixLS": "LS", "praefixRE": "RE",
  "gueltigTage": 14, "zahlungsziel": 14, "skontoTage": 7,
  "textAngebot": "…", "textAB": "…", "textRechnung": "…", "textSchluss": "…",
  "anbieter": [{ "id": "an1", "name": "", "modell": "meter",     // "meter" | "eigen"
                 "breite": 56, "staffel": [{ "id": "st1", "ab": 0, "preis": 12 }],
                 "versand": 0, "vorlauf": 10, "schritt": 0.1, "minMeter": 1, "tinteM2": 0 }],
  "anbieterId": "an1",
  "abstand": 1, "folieZuschlag": 0, "sammelMeter": 10, "ausschuss": 3,
  "lohn": 15, "lohnNK": 0, "ruestMin": 20, "pressSek": 45, "handlingSek": 30, "schneidSek": 10, "persSek": 40,
  "pressen": [{ "id": "pr1", "name": "", "preis": 1200, "jahre": 5, "zins": 5, "kw": 2, "auslastung": 50, "strom": 0.35, "wartung": 50, "stunden": 400 }],
  "presseId": "pr1",                                              // null = keine Maschinenkosten
  "fixkosten": [{ "id": "fx1", "name": "Raum / Miete", "betrag": 150 }],
  "prodStunden": 40, "mgk": 5, "fgk": 43, "vwvt": 15,
  "gewinn": 25, "pauschale": 15, "minAuftrag": 50, "rundung": "0.1", "mwst": 19,
  "verpackung": 0.15, "paketPreis": 6.5, "paketVK": 6.9, "express": 30, "anzahlung": 0,
  "artikel": [{ "id": "a1", "name": "T-Shirt", "kategorie": "", "artNr": "", "lieferant": "",
                "ekHell": 7, "ekDunkel": 7, "aufXXL": 1, "auf3XL": 2, "groessen": true,
                "pressSek": "",                                   // leer = Standard
                "temp": 150, "zeit": 12, "druck": "mittel", "abziehen": "kalt" }],
  "druckstellen": [{ "id": "d1", "name": "Brust links", "w": 10, "h": 10 }]
}
```
**Migration von Version 1** (Prototyp, ohne `v`): `folieStaffel`, `folieVersand`, `rollenbreite`, `vorlauf`, `schritt`, `minMeter` werden zu einem Anbieter. Alte Einstellungen bekommen **keine Presse** und `lohnNK = 0`, damit sich gespeicherte Kalkulationen nicht ändern.

## Auftrag (`job`)
```jsonc
{
  "name": "Vereinsshirts", "status": "angebot",   // angebot | auftrag | produktion | geliefert | berechnet | bezahlt | abgelehnt
  "kundeId": null, "kunde": "", "kontakt": "", "adresse": "", "kundeUstId": "", "kundeNr": "",
  "datum": "2026-10-02", "liefertermin": "10 Werktage", "notiz": "",
  "angebotNr": "AN-2026-001", "abNr": "", "lsNr": "", "reNr": "", "reDatum": "", "leistungsDatum": "", "bezahltAm": "",
  "gewinn": 25, "rabatt": 0, "skonto": 2, "pauschale": 15, "express": 0, "anzahlung": 0,   // %
  "anbieterId": null, "presseId": null,           // null = Standard, presseId "keine" = ohne Maschine
  "pakete": 1, "versandSeparat": false, "sammel": false, "zusatzMin": 15, "zusatzKosten": 0,
  "positionen": [
    { "id": "…", "typ": "textil", "catId": "a1", "name": "T-Shirt", "farbe": "Schwarz", "dunkel": true,
      "ek": 7, "aufXXL": 1, "auf3XL": 2, "ohneGroessen": false, "menge": 10,
      "groessen": { "XS": 0, "S": 4, "M": 10, "L": 9, "XL": 5, "XXL": 2, "3XL": 0, "4XL": 0, "5XL": 0 },
      "motive": [{ "id": "…", "name": "Brust links", "w": 10, "h": 10, "pers": false }] },        // cm; pers = Namen/Nummern
    { "id": "…", "typ": "transfer", "name": "DTF-Transfers", "menge": 50, "motive": [ … ] },
    { "id": "…", "typ": "leistung", "name": "Grafikarbeit", "menge": 1, "einheit": "Std.",
      "kostenart": "zeit",                        // zeit | einkauf | festpreis
      "minuten": 60, "ekEinheit": 0, "preisEinheit": 0, "beschreibung": "" }
  ],
  "sheets": [{ "id": "…", "name": "sheet.png", "pxW": 2205, "pxH": 3937, "widthCm": 56, "lengthCm": 100, "coverage": 0.5, "note": "" }],
  "ist": { "minuten": "", "meter": "", "kosten": "" },

  // beim Speichern zusätzlich abgelegt (für Liste, Auswertung und Kalibrierung):
  "updatedAt": 1790947314000, "angebotNetto": 1040.4, "angebotBrutto": 1238.08, "gewinnEuro": 217.52, "teile": 42, "planCm": 1363
}
```
Alter Status `erledigt` wird zu `geliefert`. Positionen ohne `typ` sind `textil`.

### Weitere Auftragsfelder (Version 2.2)
```jsonc
{
  "lieferDatum": "2026-10-20", "prodDatum": "2026-10-15",          // Termine (Produktionsplan)
  "zeiten": [{ "s": 1790000000000, "e": 1790003600000 }],          // Zeiterfassung, e = null: läuft
  "textilBestellt": "2026-10-05", "sammelId": "…",                  // Einkauf / Sammel-Folie
  "varNamen": { "A": "Standard", "B": "Premium" }, "variante": "A", // Varianten; Positionen haben "var": "" | "A" | …
  "azNr": "RE-2026-001", "azDatum": "", "azBetrag": 300, "azBezahlt": "",
  "stornos": [{ "nr": "", "reNr": "", "reDatum": "", "datum": "", "brutto": -0, "netto": -0, "satz": 19, "az": 0 }],
  "mahnungen": [{ "datum": "", "stufe": 1, "frist": "", "gebuehr": 0 }],
  "nachgefasstAm": "",
  "Ssnap": { … },                                                   // festgeschriebene Einstellungen (ab erstem Dokument)
  "ist": { "minuten": "", "meter": "", "kosten": "", "fehldrucke": "", "folieKosten": "" }
}
```
**Mockup-Studio (Version 2.4):** Druckstellen optional `x`, `y` (cm, siehe CLAUDE.md „Mockup-Koordinaten“) und `view` ('front' | 'back'). Positionen optional `modell` (Kleidungsform, überschreibt den Katalog), `farbeHex` (#rrggbb), `fotoIds` {front, back} (eigene Produktfotos) und `refGroesse` (Bezugsgröße der Maße im Datenblatt). Katalogartikel haben `modell` ('' = automatisch). Sammlung `textilfotos/<id>`: `{name, garmentKey, view, img, pxPerCm, cx, cy, tint, messLinie {x1,y1,x2,y2,cm}, createdAt, updatedAt}` (localStorage-Schlüssel `dtf-kalk-textilfotos-v1`).

Druckstellen haben zusätzlich `ort` (siehe `ORTE` in `core.js`), optional `img` (PNG-Data-URL, max. 500 px) und `imgRatio` (Höhe/Breite). Bilder vergrößern den gespeicherten Auftrag; der localStorage fasst nur ca. 5 MB.

Neue Einstellungen: `kapazitaetH`, `nachfassTage`, `mahnFristTage`, `mahngebuehr`, `erloeskonto`, `mockupImAngebot`, `preisliste[]` `{id, name, catId, dunkel, ds[], mengen}`, `preislisteBrutto`, `preislisteText`, `anfrageEmail`, `anfrageText`, `anfrageArtikel`, `anfrageDruckstellen` (ID-Listen, `null` = alle).

## Anfrage-Datei (aus dem Kundenformular `anfrage.html`)
```jsonc
{ "app": "dtf-anfrage", "version": 1, "erstellt": "ISO", "kunde": { "firma": "", "ansprech": "", "email": "", "tel": "", "adresse": "" },
  "name": "", "termin": "2026-10-30", "lieferung": "versand", "notiz": "",
  "positionen": [{ "catId": "a1", "artikel": "T-Shirt", "farbe": "", "groessen": { "M": 5 }, "menge": 0,
    "motive": [{ "name": "Brust links", "w": 10, "h": 10, "ort": "brustL", "pers": false, "img": "data:…" }] }] }
```

## Kunde
```jsonc
{ "nr": "K-1001", "firma": "", "ansprech": "", "tel": "", "email": "", "adresse": "", "ust": "", "rabatt": 0, "notiz": "", "updatedAt": 0 }
```

## Datensicherung (Datei)
```jsonc
{ "app": "dtf-kalkulator", "version": 2, "saved": "ISO-Datum", "settings": { … }, "jobs": { "id": { … } }, "kunden": { "id": { … } }, "zaehler": { … } }
```

## Antwortformat beim Infoblatt-Import
```json
{"name":"","kunde":"","kontakt":"","adresse":"","liefertermin":"","notiz":"","pakete":null,
 "positionen":[{"typ":"textil","artikel":"T-Shirt","farbe":"Schwarz","dunkel":true,"groessen":{"S":5,"M":10},"menge":15,
   "motive":[{"name":"Brust links","w":10,"h":10,"individuell":false}]}],
 "hinweise":["…"]}
```
