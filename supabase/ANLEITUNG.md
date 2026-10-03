# Cloud einrichten (Supabase)

Dauert ca. 15 Minuten. Danach liegen Aufträge, Kunden und Einstellungen in der Cloud: auf allen Geräten gleich, im Team gemeinsam, jede Firma getrennt. Kunden brauchen kein Konto.

## 1. Projekt anlegen
1. Auf https://supabase.com ein kostenloses Konto anlegen (z. B. mit GitHub-Login).
2. **New project**: Name z. B. `dtf-tools`, ein sicheres Datenbank-Passwort (gut aufheben, wird selten gebraucht), Region **Central EU (Frankfurt)** – wichtig für den Datenschutz.
3. Warten, bis das Projekt bereit ist (1–2 Minuten).

## 2. Datenbank anlegen
1. Links **SQL Editor** → **New query**.
2. Den kompletten Inhalt von `supabase/schema.sql` hineinkopieren und **Run** klicken. Es muss „Success“ erscheinen.

## 3. Anmeldung einstellen
1. **Authentication → Sign In / Providers → Email**: eingeschaltet lassen. „Confirm email“ kann an bleiben.
2. **Authentication → URL Configuration**:
   - Site URL: `https://jackolos.github.io/dtf-kalkulator/`
   - Redirect URLs hinzufügen: `https://jackolos.github.io/**` und für Tests `http://localhost:*/**`
3. **Eigener Mailserver (SMTP) – nötig für Team und Kunden-Firmen:** Der eingebaute Mailversand von Supabase schickt nur an Mitglieder deiner Supabase-Organisation und nur wenige Mails pro Stunde. Unter **Authentication → Emails → SMTP Settings** einen eigenen Mailserver eintragen (z. B. vom E-Mail-Anbieter der Firma oder einem Dienst wie Brevo/Resend). Erst danach lassen sich die Vorlagen bearbeiten: dann unter **Templates → Magic link or OTP** einen deutschen Text mit Code einfügen, z. B. `Ihr Anmeldecode: {{ .Token }}` (dann klappt die Anmeldung auch in der per Doppelklick geöffneten Datei).
4. Ohne eigenen Mailserver: Anmeldung nur über den Link in der Mail und nur auf der Online-Seite (GitHub Pages) bzw. `http://localhost`.

## 4. Zugangsdaten eintragen
1. **Project Settings → API** (bzw. **Data API**): „Project URL“ und den Schlüssel **anon public** kopieren.
2. In `js/cloud-config.js` eintragen:
   ```js
   const CLOUD_CONFIG = { url: 'https://xxxx.supabase.co', anonKey: 'eyJ...' };
   ```
   Den **service_role**-Schlüssel niemals eintragen oder hochladen.
3. Speichern, committen und veröffentlichen.

## 5. Erste Anmeldung und Umzug
1. Seite öffnen → Fenster „Anmelden“ → E-Mail eintragen → Code aus der Mail eingeben.
2. Firma anlegen (du wirst Inhaber).
3. **Einstellungen → Cloud & Team → „Lokale Daten hochladen“**: übernimmt Aufträge, Kunden, Einstellungen, Lager, Vorlagen und die Nummernkreise aus diesem Browser. Das in dem Browser machen, in dem deine bisherigen Daten liegen (z. B. die per Doppelklick geöffnete Seite – dafür dort ebenfalls anmelden).
4. Team: unter **Cloud & Team** Mitarbeiter mit ihrer E-Mail-Adresse einladen. Sie melden sich einfach mit dieser Adresse an.

## Gut zu wissen
- **Kostenloser Tarif:** 500 MB Datenbank. Ein Projekt ohne Nutzung wird nach ca. einer Woche pausiert; im Dashboard mit „Restore“ wieder starten. Für den Verkauf an andere Firmen später den bezahlten Tarif nehmen.
- **Bilder** (Motive, Produktfotos) liegen mit in der Datenbank. Bei sehr vielen Bildern später auf Supabase Storage umstellen.
- **Datenschutz:** Kundendaten liegen dann bei Supabase (EU-Region). Für den Betrieb einen Auftragsverarbeitungsvertrag (DPA) mit Supabase abschließen (im Dashboard unter Organization → Legal) und in der Datenschutzerklärung erwähnen.
- **Ohne Internet** oder ohne Anmeldung („Ohne Anmeldung“) arbeitet die App wie bisher lokal im Browser – diese Daten werden nicht automatisch mit der Cloud abgeglichen.
