# Vom Prototyp zur Web-App

Ziel: Der Kalkulator läuft unter einer eigenen Adresse, mit Login, Daten in der Cloud und dem Infoblatt-Import über die Anthropic API. Später zusammen mit dem Gang-Sheet-Konfigurator.

## Empfohlener Stack
- **Vite + TypeScript** (oder Next.js, falls der Gang-Sheet-Konfigurator schon damit läuft – dann denselben Stack nehmen)
- **Vitest** für Tests der Rechenlogik
- **Supabase** (Postgres, Login, Speicher für Gang-Sheet-Dateien) oder eine vergleichbare Lösung
- **Serverfunktion** (Vercel/Netlify Function oder Supabase Edge Function) für den Claude-Import
- Hosting z. B. auf **Vercel**

## Schritte
1. **Projekt anlegen**: Die Aufteilung gibt es schon (`js/core.js`, `calc.js`, `store.js`, `pdf.js`, `io.js`, `app.js`). Für Vite + TypeScript werden daraus Module, `css/style.css` bleibt (am besten gemeinsam mit dem Gang-Sheet-Konfigurator).
2. **Tests übernehmen:** `js/selftest.js` enthält schon alle Prüfwerte. Diese 1:1 als Vitest-Tests übernehmen, dann erst umbauen.
3. **Speicher austauschen:** Ein `store`-Modul mit gleicher Schnittstelle (`listJobs`, `saveJob`, `deleteJob`, `loadSettings`, `saveSettings`, `nextOfferNumber`) – erst localStorage, dann Supabase.
4. **Login** (E-Mail-Link reicht) und Daten pro Firma trennen (Spalte `firma_id`, Row Level Security).
5. **Infoblatt-Import:** Endpunkt `POST /api/import` nimmt Text und/oder Bilder entgegen, ruft die Anthropic Messages API mit dem Prompt aus `buildPrompt()` auf und gibt das JSON zurück. API-Schlüssel nur als Umgebungsvariable auf dem Server.
6. **Angebotsnummern** serverseitig vergeben (Datenbank-Sequenz pro Jahr), damit keine doppelt vorkommen.
7. **Gang Sheets** optional als Datei speichern (Supabase Storage), Messung bleibt im Browser.
8. **PWA** (Manifest + Service Worker), damit die App am Handy wie eine App startet.
9. **Verbindung zum Gang-Sheet-Konfigurator:** Druckstellen eines Auftrags direkt als Motiv-Liste an den Konfigurator übergeben und die fertige Bogenlänge zurück in die Kalkulation holen.

## Später sinnvoll
- Mehrere Nutzer pro Firma mit Rollen
- E-Mail-Versand der Dokumente direkt aus der App
- E-Rechnung (XRechnung/ZUGFeRD), ab 2027/28 im B2B-Bereich Pflicht
- Export für DATEV / Buchhaltungsprogramm

## Erster Auftrag an Claude Code (Vorschlag)
> Lies `CLAUDE.md` und die Dateien in `docs/`. Lege ein Vite-+-TypeScript-Projekt an, mach aus `js/calc.js` und `js/core.js` Module unter `src/calc/` und übernimm `js/selftest.js` als Vitest-Tests. Die Oberfläche soll danach genauso aussehen und funktionieren wie jetzt.
