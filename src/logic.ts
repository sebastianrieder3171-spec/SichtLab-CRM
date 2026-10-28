import * as store from './store'
import type { Aufgabe, Firma, Status } from './types'
import { at, dm, endToday, fm, iso, mins, now, parseD, sameDay, sod, uuid } from './util'

export const ST: Record<Status, { l: string; c: string }> = {
  neu: { l: 'Neu', c: '' }, recherchiert: { l: 'Recherchiert', c: '' }, nicht_erreicht: { l: 'Nicht erreicht', c: 'w' },
  rueckruf: { l: 'Rückruf', c: 'w' }, interessiert: { l: 'Interessiert', c: 'g' }, muster: { l: 'Muster versendet', c: 'g' },
  termin: { l: 'Termin', c: 'b' }, angebot: { l: 'Angebot', c: 'b' }, gewonnen: { l: 'Gewonnen', c: 'ok' },
  kein_interesse: { l: 'Kein Interesse', c: 'r' }, stopp: { l: 'Kontakt-Stopp', c: 'r' }
}
export const PIPE: Status[] = ['neu', 'nicht_erreicht', 'rueckruf', 'interessiert', 'muster', 'termin', 'angebot', 'gewonnen']
export const OUTCOMES = [
  { k: 'nicht_erreicht', l: 'Nicht erreicht', st: 'nicht_erreicht' as Status, f: 'morgen' },
  { k: 'mailbox', l: 'Mailbox', st: 'nicht_erreicht' as Status, f: 'morgen' },
  { k: 'rueckruf', l: 'Rückruf vereinbart', st: 'rueckruf' as Status, f: '3t' },
  { k: 'interessiert', l: 'Interessiert', st: 'interessiert' as Status, f: '1w' },
  { k: 'termin', l: 'Termin vereinbart', st: 'termin' as Status, f: 'keine' },
  { k: 'kein', l: 'Kein Interesse', st: 'kein_interesse' as Status, f: 'keine' }
]
export const FOLLOW = [{ k: 'morgen', l: 'Morgen' }, { k: '3t', l: '+3 Tage' }, { k: '1w', l: '+1 Woche' }, { k: 'keine', l: 'Keine' }]
export const PW = [
  { k: 'fr', l: 'Früh 7:30–9', r: [450, 540] }, { k: 'vm', l: 'Vormittag 9–12', r: [540, 720] },
  { k: 'mi', l: 'Mittag 12–14', r: [720, 840] }, { k: 'nm', l: 'Nachmittag 14–17', r: [840, 1020] }
]
export const H0 = 7 * 60, H1 = 19 * 60, SPAN = H1 - H0
export const pct = (m: number) => (Math.min(Math.max(m, H0), H1) - H0) / SPAN * 100

export const firmen = () => store.list('firmen')
export const firma = (id: string | null | undefined) => store.get('firmen', id)
export const aufgaben = () => store.list('aufgaben')
export const openTasks = () => aufgaben().filter(t => !t.erledigt_am)
export const dueDate = (t: Aufgabe) => new Date(t.faellig_am)
export const dueList = () => openTasks().filter(t => dueDate(t) <= endToday()).sort((a, b) => dueDate(a).getTime() - dueDate(b).getTime())
export const isClosed = (f: Firma) => f.status === 'gewonnen' || f.status === 'kein_interesse' || f.status === 'stopp'
export function newA() {
  const busy = new Set(openTasks().map(t => t.firma_id))
  return firmen().filter(f => f.prio === 'A' && (f.status === 'neu' || f.status === 'recherchiert') && !busy.has(f.id))
}
export const aktivitaeten = (fid: string) => store.list('aktivitaeten').filter(a => a.firma_id === fid).sort((a, b) => b.zeitpunkt.localeCompare(a.zeitpunkt))
export const punkte = (fid: string) => store.list('punkte').filter(p => p.firma_id === fid).sort((a, b) => a.sort - b.sort || (a.created_at || '').localeCompare(b.created_at || ''))
export function callsToday() {
  let n = 0, r = 0
  store.list('aktivitaeten').forEach(a => { if (a.typ === 'anruf' && sameDay(new Date(a.zeitpunkt), now())) { n++; if (a.dauer_sek > 0) r++ } })
  return { n, r }
}
export const doneToday = () => aufgaben().filter(t => t.erledigt_am && sameDay(new Date(t.erledigt_am), now())).length
export const taskTitle = (t: Aufgabe) => firma(t.firma_id)?.name || 'Allgemein'

export function wins(f: Firma) { return PW.filter(p => (f.anrufzeiten || []).includes(p.k)).map(p => p.r) }
export function inWin(f: Firma, d: Date) { const w = wins(f); if (!w.length) return true; const m = mins(d); return w.some(r => m >= r[0] && m < r[1]) }
export function blocked(f: Firma, d: Date) { return !!f.gesperrt_bis && sod(d) < parseD(f.gesperrt_bis) }
export function winTxt(f: Firma) { const w = wins(f); return w.length ? w.map(r => fm(r[0]) + '–' + fm(r[1])).join(', ') : 'jederzeit' }
export function warnOf(t: Aufgabe): string {
  if (!t.firma_id || t.typ !== 'rueckruf' || t.erledigt_am) return ''
  const f = firma(t.firma_id); if (!f) return ''
  const d = dueDate(t)
  if (blocked(f, d)) return 'Gesperrt bis ' + dm(parseD(f.gesperrt_bis!))
  if (!inWin(f, d)) return 'Außerhalb der Anrufzeit (' + winTxt(f) + ')'
  return ''
}
export function slotOn(f: Firma, day: Date) {
  let d = sod(day)
  if (f.gesperrt_bis && d < parseD(f.gesperrt_bis)) d = parseD(f.gesperrt_bis)
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
  const w = wins(f); d.setMinutes(w.length ? w[0][0] : 540)
  return d
}
export function freeSlot(f: Firma, day: Date) {
  let d = slotOn(f, day); let n = 0
  const ts = openTasks()
  while (n < 40 && ts.some(t => Math.abs(dueDate(t).getTime() - d.getTime()) < 15 * 60000)) { d = new Date(d.getTime() + 15 * 60000); n++ }
  return d
}
export function followDate(k: string, f: Firma): Date | null {
  const off = ({ morgen: 1, '3t': 3, '1w': 7 } as Record<string, number>)[k]
  if (!off) return null
  return freeSlot(f, at(off))
}

export function neueAufgabe(firma_id: string | null, typ: 'rueckruf' | 'todo', titel: string, d: Date): Aufgabe {
  return store.save('aufgaben', { id: uuid(), firma_id, typ, titel, faellig_am: iso(d), erledigt_am: null, deleted_at: null, created_at: iso(now()) })
}
export function neueFirma(p: Partial<Firma>): Firma {
  return {
    id: uuid(), name: '', branche: '', ort: '', bundesland: '', adresse: '', website: '', email: '', telefon: '',
    person: '', rolle: '', status: 'neu', prio: 'B', umsatz: null, hook: '', anrufzeiten: ['vm', 'nm'], gesperrt_bis: null,
    quelle_url: '', grundlage: '', deleted_at: null, created_at: iso(now()), ...p
  }
}

export interface ResultSheet { firm: string; erg: string | null; follow: string | null; followTouched?: boolean; note: string; dur: number; ag: string[] }

export function saveResult(sh: ResultSheet) {
  const f = firma(sh.firm); if (!f) return
  const o = OUTCOMES.find(x => x.k === sh.erg) || OUTCOMES[0]
  const bes = sh.ag.map(id => store.get('punkte', id)).filter(Boolean) as ReturnType<typeof punkte>
  bes.forEach(p => store.save('punkte', { ...p, erledigt: true }))
  const txt = [bes.length ? 'Besprochen: ' + bes.map(p => p.text).join(' · ') : '', sh.note.trim()].filter(Boolean).join('\n')
  const reached = !(o.k === 'nicht_erreicht' || o.k === 'mailbox')
  store.save('aktivitaeten', { id: uuid(), firma_id: f.id, typ: 'anruf', ergebnis: o.l, text: txt, dauer_sek: reached ? Math.max(sh.dur, 1) : 0, zeitpunkt: iso(now()), deleted_at: null, created_at: iso(now()) })
  store.save('firmen', { ...f, status: o.st })
  openTasks().forEach(t => { if (t.firma_id === f.id && t.typ === 'rueckruf' && dueDate(t) <= endToday()) store.save('aufgaben', { ...t, erledigt_am: iso(now()) }) })
  const d = sh.follow ? followDate(sh.follow, f) : null
  if (d) neueAufgabe(f.id, 'rueckruf', o.k === 'interessiert' ? 'Nachfassen' : 'Erneut anrufen', d)
}
