export type Status =
  | 'neu' | 'recherchiert' | 'nicht_erreicht' | 'rueckruf' | 'interessiert'
  | 'muster' | 'termin' | 'angebot' | 'gewonnen' | 'kein_interesse' | 'stopp'

export interface Basis {
  id: string
  created_at?: string
  updated_at?: string
  deleted_at: string | null
}

export interface Firma extends Basis {
  name: string
  branche: string
  ort: string
  bundesland: string
  adresse: string
  website: string
  email: string
  telefon: string
  person: string
  rolle: string
  status: Status
  prio: 'A' | 'B' | 'C'
  umsatz: number | null
  hook: string
  anrufzeiten: string[]
  gesperrt_bis: string | null // YYYY-MM-DD
  quelle_url: string
  grundlage: string
}

export interface Aufgabe extends Basis {
  firma_id: string | null
  typ: 'rueckruf' | 'todo'
  titel: string
  faellig_am: string // ISO
  erledigt_am: string | null
}

export interface Aktivitaet extends Basis {
  firma_id: string
  typ: 'anruf' | 'notiz' | 'muster' | 'email' | 'termin'
  ergebnis: string
  text: string
  dauer_sek: number
  zeitpunkt: string
}

export interface Punkt extends Basis {
  firma_id: string
  typ: 'fakt' | 'agenda'
  text: string
  erledigt: boolean
  sort: number
}

export type TableName = 'firmen' | 'aufgaben' | 'aktivitaeten' | 'punkte'
export const TABLES: TableName[] = ['firmen', 'aufgaben', 'aktivitaeten', 'punkte']

export interface RowMap {
  firmen: Firma
  aufgaben: Aufgabe
  aktivitaeten: Aktivitaet
  punkte: Punkt
}
