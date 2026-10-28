import * as store from './store'
import { neueFirma } from './logic'
import type { Aktivitaet, Aufgabe, Firma, Punkt } from './types'
import { at, iso, isoD, uuid } from './util'

/** Beispieldaten für den Demo-Modus (ohne Datenbank-Verbindung). */
export function seedDemo() {
  const F: Firma[] = [
    ['Privatbrauerei Zwettl', 'Privatbrauerei', 'Zwettl', 'NÖ', '+43 2822 500-0', 'Mag. Karl Schwarz', 'Geschäftsführer', 'rueckruf', 'A', 3500, 'Bierfest, Schanigarten-Saison, Gastro-Partner: Holzbrille mit Zwettler-Gravur als Gewinnspiel- oder Partnergeschenk.', ['nm']],
    ['Brauerei Hofstetten', 'Privatbrauerei', 'St. Martin i. M.', 'OÖ', '+43 7232 2204', 'Peter Krammer', 'Inhaber & GF', 'nicht_erreicht', 'A', null, 'Inhaber entscheidet selbst: Brille als Merch im Ab-Hof-Shop oder Geschenk bei Brauereiführungen.', ['vm', 'nm']],
    ['Trumer Privatbrauerei', 'Privatbrauerei', 'Obertrum am See', 'Sbg', '+43 6219 7411-0', 'Familie Sigl', 'Eigentümer', 'interessiert', 'A', 4500, 'Lifestyle-Marke mit Pils-Image: gravierte Sonnenbrille als Sommer-Promotion für Gastro-Partner.', ['vm', 'nm']],
    ['Retter Bio-Natur-Resort', 'Familienhotel', 'Pöllauberg', 'Stmk', '+43 3335 2690', 'Ulrike Retter', 'Geschäftsführerin', 'neu', 'B', null, 'Seminarhotel: Brille als Geschenk für Seminargäste oder Mitarbeiter-Goodie.', ['nm']],
    ['Leyrer + Graf', 'Bauunternehmen', 'Gmünd', 'NÖ', '+43 2852 501-0', 'Stefan Graf', 'CEO', 'interessiert', 'A', 9000, '100-Jahr-Jubiläum 2026: Jubiläums-Brille für Mitarbeiter.', ['fr', 'nm']],
    ['Zotter Schokolade', 'Lebensmittel', 'Riegersburg', 'Stmk', '+43 3152 5554', 'Julia Zotter', 'Geschäftsführerin', 'angebot', 'A', 8000, 'Erlebniswelt mit Shop: Holzbrille als nachhaltiger Merch-Artikel passend zur Bio-Linie.', ['vm']],
    ['Seidlalm', 'Almhütte/Skihütte', 'Kitzbühel', 'Tirol', '+43 5356 64 235', 'Verena (Wirtin)', 'Wirtin', 'neu', 'A', null, 'Hahnenkamm-Event-Location: Brille als Event-Merch.', ['nm']],
    ['2rad-Schnabl', 'Sport- & Radhandel', 'Bad Erlach', 'NÖ', '+43 2627 48217', 'Johann Schnabl', 'Inhaber', 'gewonnen', 'B', 1200, 'Radkauf-Zugabe: gravierte Holzbrille zum neuen Bike.', ['vm', 'nm']]
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
    [2, 'todo', 'Muster mit Trumer-Logo gravieren lassen', at(0, 17, 0)],
    [5, 'rueckruf', 'Angebot nachfassen', at(2, 10, 30)],
    [4, 'rueckruf', 'Budget für Jubiläum', at(1, 8, 0)]
  ].map(a => ({ id: uuid(), firma_id: id(a[0] as number), typ: a[1] as Aufgabe['typ'], titel: a[2] as string, faellig_am: iso(a[3] as Date), erledigt_am: null, deleted_at: null, created_at: iso(at(-1)) }))
  store.saveMany('aufgaben', T)
}
