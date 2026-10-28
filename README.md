# SICHTFAKTOR Akquise-CRM

Schlanke Web-App für die telefonische Neukundenakquise. Eine App für Laptop und Handy (PWA), alle Geräte sehen denselben Stand.

- **Heute:** fällige Rückrufe und To-dos, überfällige oben
- **Anrufen per Tipp** (`tel:`-Link). Nach der Rückkehr in die App öffnet sich automatisch das Ergebnis-Fenster
- **Agendapunkte und Key Facts** je Kunde, Verlauf aller Gespräche
- **Kalender:** Tages-Timeline mit Anrufzeiten des Kunden, Wochenansicht mit Ziehen und Ablegen
- **Pipeline**, **Statistik**, **Excel-Import** eurer Listen, **CSV-Export**
- **Offline-fähig:** Änderungen werden lokal gespeichert und automatisch abgeglichen

## Technik

| Teil | Lösung |
|---|---|
| Oberfläche | TypeScript + Vite, als PWA installierbar (`vite-plugin-pwa`) |
| Lokaler Speicher | IndexedDB (alle Daten liegen auch am Gerät) |
| Datenbank, Login, Live-Sync | Supabase (Postgres), Region Frankfurt |
| Hosting | GitHub Pages (automatisch per GitHub Actions) |
| Schriften | lokal eingebunden, keine Anfragen an Google |

Sync: Jede Änderung geht zuerst in den lokalen Speicher und eine Warteschlange (`src/store.ts`). `src/sync.ts` lädt die Warteschlange hoch, holt Änderungen seit dem letzten Abgleich und hört über Supabase Realtime live mit. Bei gleichzeitigen Änderungen gewinnt die zuletzt gespeicherte. Notizen und Anrufe werden nur angehängt, nie überschrieben.

## Einrichtung

### 1. Supabase

1. Auf [supabase.com](https://supabase.com) ein Projekt anlegen, Region in der EU (z. B. Frankfurt oder Paris).
2. Im Dashboard unter **SQL Editor** den Inhalt von [`supabase/schema.sql`](supabase/schema.sql) einfügen. In der letzten Zeile die eigene E-Mail-Adresse eintragen, dann **Run**.
3. Unter **Authentication → Sign In / Providers** den Schalter **Allow new users to sign up** ausschalten.
4. Unter **Authentication → Users → Add user** sich selbst mit E-Mail und Passwort anlegen (Haken bei *Auto Confirm User*). Weitere Teammitglieder genauso anlegen und ihre E-Mail zusätzlich in die Tabelle `team` eintragen.
5. Unter **Authentication → URL Configuration** als *Site URL* die Adresse der App eintragen (nach Schritt 2 unten).
6. Unter **Project Settings → API** die *Project URL* und den *anon public key* kopieren.

Nur E-Mail-Adressen in der Tabelle `team` sehen Daten. Das regeln die Zugriffsregeln (Row Level Security) direkt in der Datenbank.

### 2. Veröffentlichen (GitHub Pages)

1. Im Repository unter **Settings → Pages** bei *Source* **GitHub Actions** wählen.
2. Jeder Push auf `main` baut und veröffentlicht die App automatisch (`.github/workflows/deploy.yml`).
3. Adresse: `https://<benutzer>.github.io/<repository>/`

Project URL und publishable key stehen in `src/config.ts`. Sie sind öffentlich gedacht; geschützt werden die Daten durch Login und Row Level Security. Den *secret key* niemals ins Repository schreiben.

### 3. Am Handy installieren

- **iPhone:** Adresse in Safari öffnen → Teilen → **Zum Home-Bildschirm**
- **Android:** In Chrome öffnen → Menü ⋮ → **App installieren**
- **Laptop:** In Chrome oder Edge das Installieren-Symbol in der Adressleiste, oder als Lesezeichen

## Lokal entwickeln

```bash
npm install
cp .env.example .env.local   # Werte eintragen; ohne Werte startet der Demo-Modus
npm run dev
```

Ohne Supabase-Werte läuft die App im **Demo-Modus** mit Beispieldaten, die nur im Browser gespeichert werden.

## Kosten

Läuft komplett gratis: Supabase Free (500 MB, reicht für viele tausend Kunden) und GitHub Pages.
Einschränkungen im Gratis-Tarif: Supabase pausiert das Projekt nach 7 Tagen ohne Nutzung (Daten bleiben, im Dashboard „Restore“ klicken) und macht keine automatischen Backups. Deshalb unter **Einstellungen → Komplette Sicherung herunterladen** regelmäßig eine Sicherung ziehen.

## Datenschutz

- Daten liegen in der EU (Supabase-Region EU). Mit Supabase einen Auftragsverarbeitungsvertrag (DPA) abschließen: Dashboard → Organization → Legal Documents.
- Zugang nur für eingetragene Teammitglieder, Verbindung verschlüsselt.
- Status **Kontakt-Stopp** sperrt das Anrufen. CSV-Export unter Einstellungen hilft bei Auskunftsanfragen.
- Beim Abmelden werden die Daten auf dem Gerät gelöscht.
- Hinweis Österreich: Werbeanrufe ohne vorherige Einwilligung sind nach § 174 TKG 2021 auch gegenüber Unternehmen grundsätzlich unzulässig. Vor der Kaltakquise rechtlich prüfen lassen.

## Nächste Ausbaustufe

- Push-Nachrichten bei geschlossener App (Supabase Edge Function + Web Push)
- Tägliche E-Mail mit der Anrufliste
- Automatische Löschfristen für „Kein Interesse“ und „Kontakt-Stopp“
