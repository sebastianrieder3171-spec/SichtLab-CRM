export const uuid = (): string =>
  (crypto as Crypto & { randomUUID?: () => string }).randomUUID?.() ??
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })

export const now = () => new Date()
export const iso = (d: Date) => d.toISOString()
export function at(dOff: number, h = 0, m = 0): Date {
  const d = new Date(); d.setDate(d.getDate() + dOff); d.setHours(h, m, 0, 0); return d
}
export function sod(d: Date): Date { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
export function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
export const endToday = () => at(0, 23, 59)
export const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
export const hm = (d: Date) => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
export const dm = (d: Date) => WD[d.getDay()] + ' ' + String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.'
export const isoD = (d: Date) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
export const parseD = (s: string) => new Date(s + 'T00:00')
export const mins = (d: Date) => d.getHours() * 60 + d.getMinutes()
export const fm = (m: number) => Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0')
export const daysBetween = (a: Date, b: Date) => Math.round((sod(b).getTime() - sod(a).getTime()) / 864e5)

export function due(d: Date): { t: string; o: boolean } {
  const t = now()
  if (d < t && !sameDay(d, t)) return { t: 'Überfällig · ' + dm(d), o: true }
  if (sameDay(d, t)) return { t: (d < t ? 'Fällig ' : '') + hm(d), o: d < t }
  return { t: dm(d) + ' ' + hm(d), o: false }
}

export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}
export const eur = (n: number | null | undefined) => (n ? n.toLocaleString('de-AT') + ' €' : '–')

/** Telefonnummer für tel:-Links ins internationale Format bringen (Standard Österreich). */
export function telHref(raw: string): string {
  let s = (raw || '').replace(/\(0\)/g, '').replace(/[^\d+]/g, '')
  if (s.startsWith('00')) s = '+' + s.slice(2)
  else if (s.startsWith('0')) s = '+43' + s.slice(1)
  else if (s && !s.startsWith('+')) s = '+43' + s
  return s
}
export const normTel = (raw: string) => telHref(raw).replace(/^\+/, '')
