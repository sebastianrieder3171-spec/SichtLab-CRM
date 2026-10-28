import readXlsxFile from 'read-excel-file/browser'
import * as store from './store'
import { firmen, neueAufgabe, neueFirma } from './logic'
import type { Aktivitaet, Firma, Punkt, Status } from './types'
import { iso, normTel, now, uuid } from './util'

type Cell = string | number | boolean | Date | null
const H: Record<string, string[]> = {
  name: ['unternehmen', 'firmenname', 'firma / organisation', 'firma'],
  branche: ['branche'],
  ort: ['ort / region', 'plz / ort', 'ort'],
  bundesland: ['bundesland', 'land / region'],
  adresse: ['adresse'],
  telefon: ['telefonnummer', 'telefon'],
  email: ['e-mail-adresse', 'e-mail', 'marketing / allgemeine e-mail'],
  website: ['website', 'webseite'],
  person: ['ansprechpartner', 'eigentümer / führung'],
  rolle: ['funktion des ansprechpartners', 'funktion'],
  hook: ['gesprächsaufhänger'],
  status: ['status'],
  umsatz: ['gesamtumsatz erwartet €'],
  quelle_url: ['quelle (url)', 'quelle kontaktdaten (url)'],
  followup: ['nächster follow-up-kontakt'],
  stopp: ['kontakt-stopp?'],
  notiz: ['notiz', 'hinweis']
}
const FAKTEN: Record<string, string> = {
  'hauptgeschäft': 'Hauptgeschäft', 'größe': 'Größe', 'größe / mitarbeiter': 'Größe', 'umsatz ca.': 'Umsatz ca.', 'bedarf / einsatz': 'Bedarf', 'geschätzte menge': 'Geschätzte Menge'
}
function mapStatus(s: string): Status {
  const v = s.toLowerCase()
  if (v.includes('recherch')) return 'recherchiert'
  if (v.includes('gewonnen')) return 'gewonnen'
  if (v.includes('kein interesse')) return 'kein_interesse'
  if (v.includes('follow') || v.includes('rückruf')) return 'rueckruf'
  if (v.includes('muster')) return 'muster'
  if (v.includes('termin')) return 'termin'
  if (v.includes('angebot')) return 'angebot'
  if (v.includes('interess')) return 'interessiert'
  return 'neu'
}
const str = (c: Cell) => c == null ? '' : c instanceof Date ? c.toISOString() : String(c).trim()

export interface ImportPlan { sheets: { name: string; rows: number }[]; neu: ImportRow[]; doppelt: number }
interface ImportRow { firma: Firma; fakten: string[]; notiz: string; followup: Date | null }

export async function analyse(file: File): Promise<ImportPlan> {
  const sheets = await readXlsxFile(file) as unknown as { sheet: string; data: Cell[][] }[]
  const known = new Set<string>()
  firmen().forEach(f => { if (f.telefon) known.add('t' + normTel(f.telefon)); known.add('n' + f.name.toLowerCase().trim()) })
  const plan: ImportPlan = { sheets: [], neu: [], doppelt: 0 }
  for (const sh of sheets) {
    // Kopfzeile = die Zeile mit den meisten bekannten Spaltennamen (mindestens Firma + Telefon)
    const all = Object.values(H).flat()
    let hi = -1, best = 0
    sh.data.slice(0, 15).forEach((r, i) => {
      const vals = r.map(c => str(c).toLowerCase())
      const score = vals.filter(v => all.includes(v)).length
      if (score > best && vals.some(v => H.name.includes(v)) && vals.some(v => H.telefon.includes(v))) { best = score; hi = i }
    })
    if (hi < 0 || best < 3) continue
    const head = sh.data[hi].map(c => str(c).toLowerCase())
    const col = (k: string) => head.findIndex(h => H[k].includes(h))
    const cols: Record<string, number> = {}
    Object.keys(H).forEach(k => { cols[k] = col(k) })
    const factCols = head.map((h, i) => [h, i] as const).filter(([h]) => FAKTEN[h])
    let n = 0
    for (const r of sh.data.slice(hi + 1)) {
      const g = (k: string) => cols[k] >= 0 ? str(r[cols[k]]) : ''
      const name = g('name')
      if (!name || name.startsWith('=') || !/[A-Za-zÄÖÜäöüß]{2}/.test(name) || /^"?nicht gefunden"?$/i.test(name)) continue
      n++
      const tel = g('telefon')
      const kt = tel ? 't' + normTel(tel) : '', kn = 'n' + name.toLowerCase()
      if ((kt && known.has(kt)) || known.has(kn)) { plan.doppelt++; continue }
      if (kt) known.add(kt); known.add(kn)
      const um = parseFloat(g('umsatz').replace(',', '.'))
      const f = neueFirma({
        name, branche: g('branche') || sh.sheet, ort: g('ort'), bundesland: g('bundesland'), adresse: g('adresse'), telefon: tel,
        email: g('email'), website: g('website'), person: g('person'), rolle: g('rolle'), hook: g('hook'),
        status: g('stopp').toLowerCase().startsWith('j') ? 'stopp' : mapStatus(g('status')), umsatz: isFinite(um) && um > 0 ? um : null,
        quelle_url: g('quelle_url'), grundlage: 'Öffentliche Firmenangaben (Impressum/Website)'
      })
      const fakten = factCols.map(([h, i]) => { const v = str(r[i]); return v ? FAKTEN[h] + ': ' + v : '' }).filter(Boolean)
      const fu = cols.followup >= 0 ? r[cols.followup] : null
      plan.neu.push({ firma: f, fakten, notiz: g('notiz'), followup: fu instanceof Date ? fu : null })
    }
    plan.sheets.push({ name: sh.sheet, rows: n })
  }
  return plan
}

export function ausfuehren(plan: ImportPlan) {
  store.saveMany('firmen', plan.neu.map(r => r.firma))
  const P: Punkt[] = []; const A: Aktivitaet[] = []
  plan.neu.forEach(r => {
    r.fakten.forEach((t, i) => P.push({ id: uuid(), firma_id: r.firma.id, typ: 'fakt', text: t, erledigt: false, sort: i, deleted_at: null, created_at: iso(now()) }))
    if (r.notiz) A.push({ id: uuid(), firma_id: r.firma.id, typ: 'notiz', ergebnis: '', text: 'Import-Notiz: ' + r.notiz, dauer_sek: 0, zeitpunkt: iso(now()), deleted_at: null, created_at: iso(now()) })
  })
  if (P.length) store.saveMany('punkte', P)
  if (A.length) store.saveMany('aktivitaeten', A)
  plan.neu.forEach(r => { if (r.followup) { const d = new Date(r.followup); d.setHours(9, 0, 0, 0); neueAufgabe(r.firma.id, 'rueckruf', 'Follow-up aus Liste', d) } })
  return plan.neu.length
}
