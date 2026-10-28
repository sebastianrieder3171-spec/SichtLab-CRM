import * as L from './local'
import { TABLES, type RowMap, type TableName } from './types'

type Maps = { [K in TableName]: Map<string, RowMap[K]> }
const maps: Maps = { firmen: new Map(), aufgaben: new Map(), aktivitaeten: new Map(), punkte: new Map() }
const listeners = new Set<() => void>()
const pending = new Set<string>()
let kick: (() => void) | null = null
let chain: Promise<unknown> = Promise.resolve()
let emitT: number | undefined

export function onChange(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn) }
function emit() { listeners.forEach(fn => fn()) }
function emitSoon() { clearTimeout(emitT); emitT = window.setTimeout(emit, 60) }
export function setKick(fn: (() => void) | null) { kick = fn }

export async function loadLocal() {
  for (const t of TABLES) {
    const rows = await L.getAll<RowMap[typeof t]>(t)
    const m = maps[t] as Map<string, RowMap[typeof t]>
    m.clear()
    rows.forEach(r => m.set(r.id, r))
  }
  const ob = await L.outboxAll()
  pending.clear()
  ob.forEach(i => pending.add(String(i.row.id)))
}

export function list<T extends TableName>(t: T): RowMap[T][] {
  return [...(maps[t] as Map<string, RowMap[T]>).values()].filter(r => !r.deleted_at)
}
export function get<T extends TableName>(t: T, id: string | null | undefined): RowMap[T] | undefined {
  if (!id) return undefined
  const r = (maps[t] as Map<string, RowMap[T]>).get(id)
  return r && !r.deleted_at ? r : undefined
}
export const count = (t: TableName) => maps[t].size

/** Lokal speichern, sofort anzeigen, dann im Hintergrund hochladen. */
export function save<T extends TableName>(t: T, row: RowMap[T]) {
  const r = { ...row, updated_at: new Date().toISOString() } as RowMap[T]
  ;(maps[t] as Map<string, RowMap[T]>).set(r.id, r)
  pending.add(r.id)
  emit()
  chain = chain.then(async () => {
    await L.putMany(t, [r])
    await L.outboxAdd({ table: t, row: r as unknown as Record<string, unknown> })
    kick?.()
  }).catch(e => console.error('Speichern fehlgeschlagen', e))
  return r
}

export function saveMany<T extends TableName>(t: T, rows: RowMap[T][]) {
  const stamp = new Date().toISOString()
  const rs = rows.map(row => ({ ...row, updated_at: stamp }) as RowMap[T])
  rs.forEach(r => { (maps[t] as Map<string, RowMap[T]>).set(r.id, r); pending.add(r.id) })
  emit()
  chain = chain.then(async () => {
    await L.putMany(t, rs)
    for (const r of rs) await L.outboxAdd({ table: t, row: r as unknown as Record<string, unknown> })
    kick?.()
  }).catch(e => console.error('Speichern fehlgeschlagen', e))
}

export function remove<T extends TableName>(t: T, id: string) {
  const r = (maps[t] as Map<string, RowMap[T]>).get(id)
  if (r) save(t, { ...r, deleted_at: new Date().toISOString() })
}

/** Änderung vom Server übernehmen, außer es gibt lokal noch nicht hochgeladene Änderungen. */
export function applyRemote<T extends TableName>(t: T, rows: RowMap[T][]) {
  const take = rows.filter(r => r && r.id && !pending.has(r.id))
  if (!take.length) return
  take.forEach(r => (maps[t] as Map<string, RowMap[T]>).set(r.id, r))
  L.putMany(t, take).catch(e => console.error(e))
  emitSoon()
}

export function setPending(ids: Iterable<string>) { pending.clear(); for (const id of ids) pending.add(id) }
export const flushed = () => chain
