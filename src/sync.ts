import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js'
import * as L from './local'
import * as store from './store'
import { TABLES, type RowMap, type TableName } from './types'

export type SyncStatus = 'ok' | 'syncing' | 'offline' | 'error'

export class Sync {
  status: SyncStatus = 'syncing'
  lastError = ''
  private flushing = false
  private again = false
  private timer: number | undefined
  private retry = 2000
  private channel: RealtimeChannel | null = null
  /** false = angemeldet, aber die E-Mail steht nicht in der Tabelle team. Dann liefert die Datenbank still nichts. */
  private member: boolean | null = null

  constructor(private client: SupabaseClient, private onStatus: (s: SyncStatus) => void) {}

  private set(s: SyncStatus, err = '') {
    this.status = s; this.lastError = err; this.onStatus(s)
  }

  start() {
    store.setKick(() => this.kick())
    window.addEventListener('online', () => { this.kick(0); this.pull() })
    window.addEventListener('offline', () => this.set('offline'))
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { this.kick(0); this.pull() } })
    this.subscribe()
    this.kick(0)
    this.pull()
  }

  stop() {
    store.setKick(null)
    if (this.channel) this.client.removeChannel(this.channel)
    this.channel = null
  }

  /** Manuell abgleichen: Freigabe neu prüfen (z. B. nachdem die E-Mail in team eingetragen wurde). */
  now() { this.member = this.member === false ? null : this.member; this.kick(0); this.pull() }

  kick(delay = 300) {
    clearTimeout(this.timer)
    this.timer = window.setTimeout(() => this.flush(), delay)
  }

  async flush() {
    if (this.flushing) { this.again = true; return }
    this.flushing = true
    try {
      await store.flushed()
      const items = await L.outboxAll()
      if (!items.length) { this.set(navigator.onLine ? 'ok' : 'offline'); return }
      if (!navigator.onLine) { this.set('offline'); return }
      if (!(await this.checkMember())) return
      this.set('syncing')
      for (const t of TABLES) {
        const byId = new Map<string, Record<string, unknown>>()
        items.filter(i => i.table === t).forEach(i => byId.set(String(i.row.id), clean(i.row)))
        const rows = [...byId.values()]
        for (let i = 0; i < rows.length; i += 500) {
          const { error } = await this.client.from(t).upsert(rows.slice(i, i + 500), { onConflict: 'id' })
          if (error) throw error
        }
      }
      await L.outboxDelete(items.map(i => i.key!).filter(k => k != null))
      const rest = await L.outboxAll()
      store.setPending(rest.map(i => String(i.row.id)))
      this.retry = 2000
      this.set('ok')
      if (rest.length) this.again = true
    } catch (e) {
      const msg = errText(e)
      console.error('Sync-Fehler', e)
      this.set(navigator.onLine ? 'error' : 'offline', msg)
      this.timer = window.setTimeout(() => this.flush(), this.retry)
      this.retry = Math.min(this.retry * 2, 60000)
    } finally {
      this.flushing = false
      if (this.again) { this.again = false; this.kick(50) }
    }
  }

  async pull() {
    if (!navigator.onLine) return
    try {
      if (!(await this.checkMember())) return
      for (const t of TABLES) {
        const cursor = (await L.metaGet<string>('cursor_' + t)) || '1970-01-01T00:00:00Z'
        let from = 0
        let max = cursor
        for (;;) {
          const { data, error } = await this.client.from(t).select('*')
            .gt('updated_at', cursor).order('updated_at').order('id').range(from, from + 999)
          if (error) throw error
          const rows = (data || []) as RowMap[typeof t][]
          if (rows.length) {
            store.applyRemote(t, rows)
            const last = rows[rows.length - 1].updated_at
            if (last && last > max) max = last
          }
          if (rows.length < 1000) break
          from += 1000
        }
        if (max !== cursor) await L.metaSet('cursor_' + t, max)
      }
      if (this.status !== 'syncing') this.set('ok')
    } catch (e) {
      console.error('Abruf-Fehler', e)
      const msg = errText(e)
      this.set(navigator.onLine ? 'error' : 'offline', msg)
    }
  }

  /** Prüft über public.ist_team(), ob das Konto Daten sehen darf. Ohne Freigabe: klare Meldung statt leerer Liste. */
  private async checkMember(): Promise<boolean> {
    if (this.member === true) return true
    const { data, error } = await this.client.rpc('ist_team')
    if (error) { console.warn('Team-Prüfung nicht möglich', error); return true }
    this.member = data === true
    if (!this.member) {
      const { data: u } = await this.client.auth.getUser()
      this.set('error', NOT_TEAM(u.user?.email || ''))
    }
    return this.member
  }

  private subscribe() {
    const ch = this.client.channel('crm-live')
    for (const t of TABLES) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, payload => {
        const row = payload.new as RowMap[TableName]
        if (row && (row as { id?: string }).id) store.applyRemote(t, [row as never])
      })
    }
    ch.subscribe(status => { if (status === 'SUBSCRIBED') this.pull() })
    this.channel = ch
  }
}

const NOT_TEAM = (email: string) =>
  'Dein Konto ' + (email ? '(' + email + ') ' : '') + 'ist in der Datenbank nicht freigeschaltet. Deshalb wird nichts hochgeladen oder abgerufen. ' +
  'Im Supabase-Dashboard unter SQL Editor ausführen: insert into public.team (email) values (\'' + (email || 'deine@email') + '\'); Danach hier auf „Jetzt abgleichen“ tippen.'

function errText(e: unknown): string {
  const err = e as { code?: string; message?: string }
  if (err?.code === '42501') return 'Keine Schreibrechte in der Datenbank (Row Level Security). Ist die E-Mail-Adresse in der Tabelle team eingetragen?'
  return e instanceof Error ? e.message : err?.message || String(e)
}

function clean(row: Record<string, unknown>) {
  const { updated_at: _u, ...rest } = row
  void _u
  return rest
}
