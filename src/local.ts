import { TABLES, type TableName } from './types'

const DB_NAME = 'sichtfaktor-crm'
const VERSION = 1
let dbp: Promise<IDBDatabase> | null = null

export interface OutboxItem { key?: number; table: TableName; row: Record<string, unknown> }

function open(): Promise<IDBDatabase> {
  if (dbp) return dbp
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      for (const t of TABLES) if (!db.objectStoreNames.contains(t)) db.createObjectStore(t, { keyPath: 'id' })
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'key', autoIncrement: true })
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbp
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode)
    const s = t.objectStore(store)
    const r = fn(s)
    t.oncomplete = () => resolve(r ? (r as IDBRequest<T>).result : undefined)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  }))
}

export const getAll = <T>(table: string) => tx<T[]>(table, 'readonly', s => s.getAll() as IDBRequest<T[]>).then(r => r || [])
export const putMany = (table: string, rows: object[]) => tx(table, 'readwrite', s => { rows.forEach(r => s.put(r)) })
export const outboxAdd = (item: OutboxItem) => tx('outbox', 'readwrite', s => { s.add(item) })
export const outboxAll = () => tx<OutboxItem[]>('outbox', 'readonly', s => s.getAll() as IDBRequest<OutboxItem[]>).then(r => r || [])
export const outboxDelete = (keys: number[]) => tx('outbox', 'readwrite', s => { keys.forEach(k => s.delete(k)) })
export const metaGet = <T>(key: string) => tx<T>('meta', 'readonly', s => s.get(key) as IDBRequest<T>)
export const metaSet = (key: string, v: unknown) => tx('meta', 'readwrite', s => { s.put(v, key) })

export async function clearAll() {
  for (const t of [...TABLES, 'outbox', 'meta']) await tx(t, 'readwrite', s => { s.clear() })
}
