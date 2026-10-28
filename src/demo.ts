import * as store from './store'
import { neueFirma } from './logic'
import type { Aktivitaet, Aufgabe, Firma, Punkt } from './types'
import { at, iso, isoD, uuid } from './util'

/** Beispieldaten für den Demo-Modus (ohne Datenbank-Verbindung). */
export function seedDemo() {
  const F: Firma[] = [
    ['Brauerei Waldhof', 'Privatbrauerei', 'Waldkirchen', 'NÖ', '+43 2800 100-0', 'Mag. Karl Muster', 'Geschäftsführer', 'rueckruf', 'A', 3500, 'Bierfest, Schanigarten-Saison, Gastro-Partner: Holzbrille mit Logo-Gravur als Gewinnspiel- oder Partnergeschenk.', ['nm']],
    ['Brauerei Bergquell', 'Privatbrauerei', 'Bergdorf', 'OÖ', '+43 7200 2204', 'Peter Beispiel', 'Inhaber & GF', 'nicht_erreicht', 'A', null, 'Inhaber entscheidet selbst: Brille als Merch im Ab-Hof-Shop oder Geschenk bei Brauereiführungen.', ['vm', 'nm']],
    ['Seebräu Privatbrauerei', 'Privatbrauerei', 'Seedorf', 'Sbg', '+43 6200 7411-0', 'Familie Huber', 'Eigentümer', 'interessiert', 'A', 4500, 'Lifestyle-Marke mit Pils-Image: gravierte Sonnenbrille als Sommer-Promotion für Gastro-Partner.', ['vm', 'nm']],
    ['Naturhotel Sonnhang', 'Familienhotel', 'Sonnberg', 'Stmk', '+43 3300 2690', 'Ulrike Sonnleitner', 'Geschäftsführerin', 'neu', 'B', null, 'Seminarhotel: Brille als Geschenk für Seminargäste oder Mitarbeiter-Goodie.', ['nm']],
    ['Baumeister Steiner', 'Bauunternehmen', 'Steinfeld', 'NÖ', '+43 2850 501-0', 'Stefan Steiner', 'CEO', 'interessiert', 'A', 9000, '100-Jahr-Jubiläum 2026: Jubiläums-Brille für Mitarbeiter.', ['fr', 'nm']],
    ['Kakaomanufaktur Süß', 'Lebensmittel', 'Burgdorf', 'Stmk', '+43 3150 5554', 'Julia Süß', 'Geschäftsführerin', 'angebot', 'A', 8000, 'Erlebniswelt mit Shop: Holzbrille als nachhaltiger Merch-Artikel passend zur Bio-Linie.', ['vm']],
    ['Gipfelalm', 'Almhütte/Skihütte', 'Almdorf', 'Tirol', '+43 5300 64 235', 'Verena (Wirtin)', 'Wirtin', 'neu', 'A', null, 'Skirennen-Event-Location: Brille als Event-Merch.', ['nm']],
    ['Radhaus Flott', 'Sport- & Radhandel', 'Raddorf', 'NÖ', '+43 2600 48217', 'Johann Flott', 'Inhaber', 'gewonnen', 'B', 1200, 'Radkauf-Zugabe: gravierte Holzbrille zum neuen Bike.', ['vm', 'nm']]
  ].map(a => neueFirma({ name: a[0] as string, branche: a[1] as string, ort: a[2] as string, bundesland: a[3] as string, telefon: a[4] as string, person: a[5] as string, rolle: a[6] as string, status: a[7] as Firma['status'], prio: a[8] as Firma['prio'], umsatz: a[9] as number | null, hook: a[10] as string, anrufzeiten: a[11] as string[] }))
  F[5].gesperrt_bis = isoD(at(2))
  store.saveMany('firmen', F)
  const id = (i: number) => F[i].id
  const P: Punkt[] = []
  const pt = (i: number, typ: Punkt['typ'], text: string) => P.push({ id: uuid(), firma_id: id(i), typ, text, erledigt: false, sort: P.length, deleted_at: null, created_at: iso(at(0)) })
  pt(0, 'fakt', 'Entscheidet selbst'); pt(0, 'fakt', 'Sekretariat stellt erst ab 14 Uhr durch')
  pt(0, 'agenda', 'Muster Walnuss zeigen (Foto vorab per Mail)'); pt(0, 'agenda', 'Stückzahl fürs Bierfest klären'); pt(0, 'agenda', 'Logo-Datei als Vektor anfragen')
  pt(2, 'fakt', 'Will Muster mit Logo sehen'); pt(2, 'agenda', 'Logo-Platzierung: Bügel oder Glasrand?'); pt(2, 'agenda', 'Staffelpreise ab 250 Stk. nennen')
  pt(4, 'agenda', 'Ansprechpartner Marketing erfragen'); pt(4, 'agenda', 'Budgetrahmen klären')
  store.saveMany('punkte', P)
  const A: Aktivitaet[] = [
    [0, 'Rückruf vereinbart', 'Sekretariat erreicht, GF ab 14 Uhr.', at(0, 8, 52), 95],
    [1, 'Nicht erreicht', '', at(-1, 9, 40), 0],
    [2, 'Interessiert', 'Interesse an Sommer-Promotion für Gastro-Partner.', at(-2, 11, 15), 312],
    [5, 'Interessiert', 'Angebot über 500 Stk. gewünscht.', at(-8, 10, 30), 380],
    [7, 'Gewonnen', 'Bestellung 100 Stk.', at(-10, 14, 0), 200]
  ].map(a => ({ id: uuid(), firma_id: id(a[0] as number), typ: 'anruf' as const, ergebnis: a[1] as string, text: a[2] as string, zeitpunkt: iso(a[3] as Date), dauer_sek: a[4] as number, deleted_at: null, created_at: iso(a[3] as Date) }))
  store.saveMany('aktivitaeten', A)
  const T: Aufgabe[] = [
    [1, 'rueckruf', 'Nochmal versuchen, eher Vormittag', at(-1, 10, 0)],
    [3, 'rueckruf', 'Erstanruf', at(0, 14, 0)],
    [0, 'rueckruf', 'Rückruf GF, Muster besprechen', at(0, 14, 30)],
    [6, 'rueckruf', 'Erstanruf vor Saisonstart', at(0, 15, 0)],
    [2, 'todo', 'Muster mit Kundenlogo gravieren lassen', at(0, 17, 0)],
    [5, 'rueckruf', 'Angebot nachfassen', at(2, 10, 30)],
    [4, 'rueckruf', 'Budget für Jubiläum', at(1, 8, 0)]
  ].map(a => ({ id: uuid(), firma_id: id(a[0] as number), typ: a[1] as Aufgabe['typ'], titel: a[2] as string, faellig_am: iso(a[3] as Date), erledigt_am: null, deleted_at: null, created_at: iso(at(-1)) }))
  store.saveMany('aufgaben', T)
}
