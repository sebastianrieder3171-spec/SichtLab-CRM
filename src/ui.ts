import * as store from './store'
import * as Lg from './logic'
import { analyse, ausfuehren, type ImportPlan } from './importer'
import type { Aufgabe, Firma, Status } from './types'
import { WD, at, daysBetween, dm, due, endToday, esc, eur, fm, hm, iso, isoD, mins, now, parseD, sameDay, sod, telHref, uuid } from './util'

export interface AppCtx {
  email: string
  demo: boolean
  sync: () => { s: string; err: string }
  syncNow: () => void
  logout: () => void
}

type EditState = { f: Firma; isNew: boolean; confirmDel: boolean }
const U = {
  view: 'heute', sel: null as string | null, q: '', fs: '', fb: '', fp: '',
  cal: 'tag', day: 0, wk: 0,
  modal: null as Lg.ResultSheet | null,
  edit: null as EditState | null,
  mtab: 'heute', mmore: '' as '' | 'plan' | 'stat' | 'import' | 'settings', mq: '',
  importPlan: null as ImportPlan | null, importMsg: '', importBusy: false,
  toast: '' as string
}
let ctx: AppCtx
let root: HTMLElement
const mq = window.matchMedia('(max-width: 860px)')
let mobile = mq.matches
let deferred = false
let toastT: number | undefined

const ICON = {
  phone: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>',
  today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.8.7 3 2.5 3.5 5.2"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="m8 12 3 3 5-6"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>'
}

/* ---------------- Grundgerüst ---------------- */

export function mount(el: HTMLElement, c: AppCtx) {
  root = el; ctx = c
  mq.addEventListener('change', () => { mobile = mq.matches; render(true) })
  store.onChange(() => render())
  bind()
  render(true)
  startReminders()
  ;['visibilitychange', 'focus', 'pageshow'].forEach(ev => window.addEventListener(ev, () => { if (document.visibilityState === 'visible') checkPendingCall() }))
}

const TYPING = 'input:not([type=checkbox]):not([type=file]):not([type=radio]),textarea,select'
export function render(force = false) {
  if (!root) return
  const ae = document.activeElement as HTMLElement | null
  if (!force && ae && root.contains(ae) && ae.matches(TYPING)) { deferred = true; return }
  deferred = false
  if (U.sel && !Lg.firma(U.sel)) U.sel = null
  const sc: Record<string, number> = {}
  root.querySelectorAll<HTMLElement>('[data-sk]').forEach(e => { sc[e.dataset.sk!] = e.scrollTop })
  root.innerHTML = (mobile ? renderMobile() : renderDesktop()) + (U.toast ? '<div class="toast" role="status">' + esc(U.toast) + '</div>' : '')
  root.querySelectorAll<HTMLElement>('[data-sk]').forEach(e => { const v = sc[e.dataset.sk!]; if (v) e.scrollTop = v })
}
function toast(t: string) { U.toast = t; render(true); clearTimeout(toastT); toastT = window.setTimeout(() => { U.toast = ''; render() }, 2600) }

function pill(st: Status) { const s = Lg.ST[st] || Lg.ST.neu; return '<span class="pill ' + s.c + '">' + s.l + '</span>' }
function syncDot() {
  if (ctx.demo) return '<span class="syncdot offline"><i></i>Demo</span>'
  const s = ctx.sync().s
  const l = ({ ok: 'Synchron', syncing: 'Gleicht ab …', offline: 'Offline', error: 'Sync-Fehler' } as Record<string, string>)[s] || s
  return '<span class="syncdot ' + s + '"><i></i>' + l + '</span>'
}
const demoBanner = () => ctx.demo ? '<div class="demo">Demo-Modus: noch keine Datenbank verbunden. Daten bleiben nur auf diesem Gerät.</div>' : ''

function callLink(f: Firma, cls: string, label: string) {
  const tel = telHref(f.telefon)
  if (!tel || f.status === 'stopp') return '<a class="' + cls + '" aria-disabled="true" aria-label="Anrufen nicht möglich">' + label + '</a>'
  return '<a class="' + cls + '" href="tel:' + esc(tel) + '" data-a="call" data-id="' + f.id + '" aria-label="' + esc(f.name) + ' anrufen">' + label + '</a>'
}

/* ---------------- Laptop ---------------- */

function renderDesktop() {
  const dl = Lg.dueList(); const over = dl.filter(t => due(Lg.dueDate(t)).o).length
  const nav: [string, string, number?, boolean?][] = [['heute', 'Heute', dl.length, over > 0], ['kalender', 'Kalender'], ['kontakte', 'Kontakte', Lg.firmen().length], ['pipeline', 'Pipeline'], ['statistik', 'Statistik'], ['import', 'Import']]
  let h = '<div class="shell"><aside class="lside"><div class="brand">SICHTFAKTOR<small>AKQUISE-CRM</small></div>' +
    nav.map(n => '<button class="navb' + (U.view === n[0] ? ' on' : '') + '" data-a="view" data-v="' + n[0] + '"><span>' + n[1] + '</span>' + (n[2] != null ? '<span class="cnt' + (n[3] ? ' alert' : '') + '">' + n[2] + '</span>' : '') + '</button>').join('') +
    '<div class="foot">' + syncDot() + '<span>' + esc(ctx.demo ? 'Demo-Modus' : ctx.email) + '</span><button data-a="view" data-v="einstellungen">Einstellungen</button></div></aside>'
  const f = Lg.firma(U.sel)
  h += '<div class="lmain' + (f ? ' withdet' : '') + '"><div class="lcontent" data-sk="main">' + demoBanner() + dView() + '</div>' + (f ? dDetail(f) : '') + '</div></div>'
  if (U.modal) h += '<div class="modal" data-a="modalbg"><div class="modalbox">' + resultForm(U.modal) + '</div></div>'
  if (U.edit) h += '<div class="modal" data-a="modalbg"><div class="modalbox wide">' + editForm(U.edit) + '</div></div>'
  return h
}

function dView(): string {
  switch (U.view) {
    case 'kalender': return U.cal === 'tag' ? calDay() : calWeek()
    case 'kontakte': return dKontakte()
    case 'pipeline': return dPipeline()
    case 'statistik': return statistik()
    case 'import': return importView()
    case 'einstellungen': return settingsView()
    default: return dHeute()
  }
}

function dHeute() {
  const dl = Lg.dueList(); const c = Lg.callsToday(); const over = dl.filter(t => due(Lg.dueDate(t)).o).length
  const terms = Lg.firmen().filter(f => f.status === 'termin').length
  let h = '<div class="lhead"><div><h2>Heute</h2><div class="sub">' + dm(now()) + ' · ' + dl.length + ' fällig, ' + Lg.doneToday() + ' erledigt</div></div><button class="ghost" data-a="newfirm">+ Neue Firma</button></div>'
  h += '<div class="kpis"><div class="kpi"><b>' + c.n + '</b><span>Anrufe heute</span></div><div class="kpi"><b>' + c.r + '</b><span>davon erreicht</span></div><div class="kpi' + (over ? ' alert' : '') + '"><b>' + over + '</b><span>überfällig</span></div><div class="kpi"><b>' + terms + '</b><span>offene Termine</span></div></div>'
  h += '<div class="sec">Fällige Rückrufe und To-dos</div><div class="tablebox"><table><thead><tr><th>Fällig</th><th>Firma</th><th>Aufgabe</th><th>Status</th><th></th></tr></thead><tbody>'
  if (!dl.length) h += '<tr><td colspan="5" class="empty">Alles erledigt für heute.</td></tr>'
  dl.forEach(t => {
    const d = due(Lg.dueDate(t)); const f = Lg.firma(t.firma_id); const w = Lg.warnOf(t)
    h += '<tr class="' + (f && U.sel === f.id ? 'sel' : '') + '"' + (f ? ' data-a="sel" data-id="' + f.id + '"' : '') + '><td><span class="time' + (d.o ? ' over' : '') + '">' + d.t + '</span></td>' +
      '<td><div class="firm">' + esc(Lg.taskTitle(t)) + '</div>' + (f ? '<div class="small">' + esc(f.person) + (f.ort ? ' · ' + esc(f.ort) : '') + '</div>' : '') + '</td>' +
      '<td>' + (t.typ === 'rueckruf' ? 'Rückruf: ' : 'To-do: ') + esc(t.titel) + (w ? '<div class="warntx">⚠ ' + esc(w) + '</div>' : '') + '</td><td>' + (f ? pill(f.status) : '') + '</td>' +
      '<td style="text-align:right">' + (f && t.typ === 'rueckruf' ? '<button class="callbtn" data-a="log" data-id="' + f.id + '">Gespräch erfassen</button>' : '<button class="ghost" data-a="done" data-id="' + t.id + '">Erledigt</button>') + '</td></tr>'
  })
  h += '</tbody></table></div>'
  const na = Lg.newA()
  if (na.length) h += '<div class="sec">Neue Kontakte mit Priorität A, noch ohne Termin</div><div class="tablebox"><table><tbody>' +
    na.slice(0, 30).map(f => '<tr data-a="sel" data-id="' + f.id + '"><td><div class="firm">' + esc(f.name) + '</div><div class="small">' + esc(f.branche) + ' · ' + esc(f.ort) + '</div></td><td><div class="hook">' + esc(f.hook) + '</div></td><td>' + pill(f.status) + '</td><td style="text-align:right"><button class="ghost" data-a="plan" data-id="' + f.id + '">Einplanen</button></td></tr>').join('') + '</tbody></table></div>'
  return h
}

function filteredFirmen(q: string, fs = '', fb = '', fp = '') {
  const qq = q.toLowerCase().replace(/\s/g, '')
  return Lg.firmen().filter(f => (!fs || f.status === fs) && (!fb || f.branche === fb) && (!fp || f.prio === fp) &&
    (!qq || (f.name + f.person + f.ort + f.telefon + f.branche + f.email).toLowerCase().replace(/\s/g, '').includes(qq)))
    .sort((a, b) => a.prio.localeCompare(b.prio) || a.name.localeCompare(b.name, 'de'))
}
function dKontakte() {
  const br = [...new Set(Lg.firmen().map(f => f.branche).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'))
  return '<div class="lhead"><div><h2>Kontakte</h2><div class="sub">' + Lg.firmen().length + ' Firmen</div></div><button class="ghost" data-a="newfirm">+ Neue Firma</button></div>' +
    '<div class="filters"><input id="f-q" data-in="q" placeholder="Suche nach Firma, Person, Ort oder Nummer" value="' + esc(U.q) + '" autocomplete="off">' +
    '<select id="f-fs" data-in="fs"><option value="">Alle Status</option>' + (Object.keys(Lg.ST) as Status[]).map(k => '<option value="' + k + '"' + (U.fs === k ? ' selected' : '') + '>' + Lg.ST[k].l + '</option>').join('') + '</select>' +
    '<select id="f-fb" data-in="fb"><option value="">Alle Branchen</option>' + br.map(b => '<option' + (U.fb === b ? ' selected' : '') + '>' + esc(b) + '</option>').join('') + '</select>' +
    '<select id="f-fp" data-in="fp"><option value="">Alle Prioritäten</option>' + ['A', 'B', 'C'].map(p => '<option' + (U.fp === p ? ' selected' : '') + '>' + p + '</option>').join('') + '</select></div>' +
    '<div class="tablebox"><table><thead><tr><th>Prio</th><th>Firma</th><th>Ansprechpartner</th><th>Telefon</th><th>Status</th><th>Nächster Schritt</th></tr></thead><tbody id="rows">' + dRows() + '</tbody></table></div>'
}
function nextStep(f: Firma) {
  const t = Lg.openTasks().filter(t => t.firma_id === f.id).sort((a, b) => a.faellig_am.localeCompare(b.faellig_am))[0]
  if (!t) return '<span class="small">–</span>'
  const d = due(Lg.dueDate(t)); return '<span class="time' + (d.o ? ' over' : '') + '">' + d.t + '</span>'
}
function dRows() {
  const fs = filteredFirmen(U.q, U.fs, U.fb, U.fp)
  if (!fs.length) return '<tr><td colspan="6" class="empty">' + (Lg.firmen().length ? 'Keine Treffer.' : 'Noch keine Firmen. Lege eine an oder importiere eure Excel-Listen unter „Import“.') + '</td></tr>'
  return fs.map(f => '<tr class="' + (U.sel === f.id ? 'sel' : '') + '" data-a="sel" data-id="' + f.id + '"><td><span class="prio ' + f.prio + '">' + f.prio + '</span></td><td><div class="firm">' + esc(f.name) + '</div><div class="small">' + esc([f.branche, f.ort].filter(Boolean).join(' · ')) + '</div></td><td>' + esc(f.person) + '<div class="small">' + esc(f.rolle) + '</div></td><td class="time">' + esc(f.telefon) + '</td><td>' + pill(f.status) + '</td><td>' + nextStep(f) + '</td></tr>').join('')
}

function dPipeline() {
  return '<div class="lhead"><div><h2>Pipeline</h2><div class="sub">Karten in eine andere Spalte ziehen, um den Status zu ändern</div></div></div><div class="board">' +
    Lg.PIPE.map(st => {
      const fs = Lg.firmen().filter(f => f.status === st || (st === 'neu' && f.status === 'recherchiert'))
      const sum = fs.reduce((a, f) => a + (f.umsatz || 0), 0)
      return '<div class="col" data-drop="' + st + '"><div class="colh">' + Lg.ST[st].l + '<span>' + fs.length + '</span></div><div class="colsum">' + (sum ? eur(sum) : '&nbsp;') + '</div>' +
        fs.slice(0, 80).map(f => '<div class="card" draggable="true" data-drag="' + f.id + '" data-a="sel" data-id="' + f.id + '"><b>' + esc(f.name) + '</b><span class="small">' + esc(f.person) + '</span><span class="small">' + (f.umsatz ? eur(f.umsatz) : esc(f.branche)) + '</span></div>').join('') +
        (fs.length > 80 ? '<div class="small">+ ' + (fs.length - 80) + ' weitere</div>' : '') + '</div>'
    }).join('') + '</div>'
}

function statistik() {
  const days: Date[] = []
  for (let i = 0; days.length < 5 && i < 14; i++) { const d = at(-i, 12); if (d.getDay() !== 0 && d.getDay() !== 6) days.unshift(d) }
  const akts = store.list('aktivitaeten').filter(a => a.typ === 'anruf')
  const vals = days.map(d => akts.filter(a => sameDay(new Date(a.zeitpunkt), d)).length)
  const mx = Math.max(...vals, 1)
  const F = Lg.firmen(); const N = Math.max(F.length, 1)
  const cnt = (...st: Status[]) => F.filter(f => st.includes(f.status)).length
  const recent = akts.filter(a => daysBetween(new Date(a.zeitpunkt), now()) <= 30)
  const reachRate = recent.length ? Math.round(recent.filter(a => a.dauer_sek > 0).length / recent.length * 100) : 0
  const fun: [string, number][] = [['Kontakte gesamt', F.length], ['Schon angerufen', F.filter(f => !['neu', 'recherchiert'].includes(f.status)).length], ['Interessiert und weiter', cnt('interessiert', 'muster', 'termin', 'angebot', 'gewonnen')], ['Termin oder Angebot', cnt('termin', 'angebot', 'gewonnen')], ['Gewonnen', cnt('gewonnen')]]
  const won = F.filter(f => f.status === 'gewonnen').reduce((a, f) => a + (f.umsatz || 0), 0)
  const pipe = F.filter(f => ['interessiert', 'muster', 'termin', 'angebot'].includes(f.status)).reduce((a, f) => a + (f.umsatz || 0), 0)
  return '<div class="lhead"><div><h2>Statistik</h2><div class="sub">Anrufe der letzten fünf Werktage und Stand aller Kontakte</div></div></div>' +
    '<div class="kpis"><div class="kpi"><b>' + eur(won) + '</b><span>gewonnener Umsatz</span></div><div class="kpi"><b>' + eur(pipe) + '</b><span>offen in der Pipeline</span></div><div class="kpi"><b>' + reachRate + ' %</b><span>erreicht (30 Tage)</span></div><div class="kpi"><b>' + cnt('gewonnen') + '</b><span>Abschlüsse</span></div></div>' +
    '<div class="statgrid"><div class="panel"><h3>Anrufe pro Werktag</h3><div class="bars">' + vals.map((v, i) => '<div class="bar' + (sameDay(days[i], now()) ? ' today' : '') + '"><span>' + v + '</span><i style="height:' + Math.max(2, v / mx * 100) + '%"></i></div>').join('') + '</div><div class="barlbl">' + days.map(d => '<span>' + (sameDay(d, now()) ? 'heute' : WD[d.getDay()]) + '</span>').join('') + '</div></div>' +
    '<div class="panel"><h3>Vom Kontakt zum Abschluss</h3><div class="funnel">' + fun.map(r => '<div class="frow"><span>' + r[0] + '</span><div class="ftrack"><i style="width:' + (r[1] / N * 100) + '%"></i></div><b>' + r[1] + '</b></div>').join('') + '</div></div></div>'
}

/* Kalender */
function calTabs() {
  return '<div class="seg"><button class="' + (U.cal === 'tag' ? 'on' : '') + '" data-a="calmode" data-v="tag">Tag</button><button class="' + (U.cal === 'woche' ? 'on' : '') + '" data-a="calmode" data-v="woche">Woche</button></div>'
}
function calDay() {
  const day = at(U.day); const isToday = U.day === 0
  const ts = Lg.openTasks().filter(t => sameDay(Lg.dueDate(t), day)).sort((a, b) => a.faellig_am.localeCompare(b.faellig_am))
  const rows: { k: string; ts: Aufgabe[] }[] = []
  ts.forEach(t => { const k = t.firma_id || '_'; let r = rows.find(r => r.k === k); if (!r) { r = { k, ts: [] }; rows.push(r) } r.ts.push(t) })
  const calls = ts.filter(t => t.typ === 'rueckruf').length; const warns = ts.filter(t => Lg.warnOf(t)).length
  let h = '<div class="lhead"><div><h2>Tagesplan · ' + (isToday ? 'Heute, ' : '') + dm(day) + '</h2><div class="sub">Balken mit der Maus ziehen, um einen Anruf zu verschieben. Klick auf die Firma öffnet die Details.</div></div>' +
    '<div class="calbar"><button class="ghost" data-a="calnav" data-v="-1" aria-label="Vorheriger Tag">‹</button><button class="ghost" data-a="calnav" data-v="0">Heute</button><button class="ghost" data-a="calnav" data-v="1" aria-label="Nächster Tag">›</button>' + calTabs() + '</div></div>'
  h += '<div class="calsum"><span class="pill g">' + calls + ' Anrufe geplant</span><span class="pill b">' + (ts.length - calls) + ' To-dos</span>' + (warns ? '<span class="pill r">' + warns + ' außerhalb Anrufzeit oder gesperrt</span>' : '<span class="pill">Keine Konflikte</span>') + '</div>'
  let ax = ''; for (let m = Lg.H0; m < Lg.H1; m += 60) ax += '<span style="left:' + Lg.pct(m) + '%">' + String(m / 60).padStart(2, '0') + '</span>'
  h += '<div class="gantt"><div class="grow gaxis"><div class="glabel" style="cursor:default"><span class="small">Firma · Anrufzeit</span></div><div class="gtrack">' + ax + '</div></div>'
  if (!rows.length) h += '<div class="empty">Für diesen Tag ist nichts geplant.</div>'
  rows.forEach(r => {
    const f = r.k === '_' ? undefined : Lg.firma(r.k)
    let tr = ''
    if (f) {
      tr += Lg.wins(f).map(w => '<i class="gband" style="left:' + Lg.pct(w[0]) + '%;width:' + (Lg.pct(w[1]) - Lg.pct(w[0])) + '%"></i>').join('')
      if (Lg.blocked(f, day)) tr += '<i class="gblock"></i><span class="gblocktx">gesperrt bis ' + dm(parseD(f.gesperrt_bis!)) + '</span>'
    }
    if (isToday) tr += '<i class="gnow" style="left:' + Lg.pct(mins(now())) + '%"></i>'
    tr += r.ts.map(t => { const w = Lg.warnOf(t); const d = Lg.dueDate(t); return '<div class="gbar ' + t.typ + (w ? ' warn' : '') + '" data-gt="' + t.id + '" style="left:' + Lg.pct(mins(d)) + '%;width:' + ((t.typ === 'rueckruf' ? 20 : 30) / Lg.SPAN * 100) + '%" title="' + esc(t.titel + (w ? ' · ' + w : '')) + '"><span>' + hm(d) + '</span></div>' }).join('')
    h += '<div class="grow"><div class="glabel"' + (f ? ' data-a="sel" data-id="' + f.id + '"' : '') + '><b>' + esc(f ? f.name : 'Allgemein') + '</b><span class="small">' + (f ? esc(f.person) + ' · ' + Lg.winTxt(f) : esc(r.ts.map(t => t.titel).join(', '))) + '</span></div><div class="gtrack">' + tr + '</div></div>'
  })
  h += '</div><div class="legend"><span><i style="background:var(--accent-soft)"></i>Anrufzeit des Kunden</span><span><i style="background:var(--accent)"></i>Rückruf</span><span><i style="background:var(--info)"></i>To-do</span><span><i style="background:var(--bad)"></i>Konflikt</span><span><i style="background:repeating-linear-gradient(135deg,var(--bad-soft) 0 3px,transparent 3px 6px)"></i>gesperrt</span>' + (isToday ? '<span><i style="background:var(--bad);width:2px"></i>jetzt</span>' : '') + '</div>'
  const busy = new Set(Lg.openTasks().map(t => t.firma_id))
  const un = Lg.firmen().filter(f => !busy.has(f.id) && ['neu', 'recherchiert', 'nicht_erreicht', 'rueckruf', 'interessiert', 'muster'].includes(f.status)).sort((a, b) => a.prio.localeCompare(b.prio) || a.name.localeCompare(b.name, 'de'))
  if (un.length) h += '<div class="sec">Noch nicht eingeplant · ' + un.length + '</div><div class="unpl">' + un.slice(0, 40).map(f => '<div class="row"><div style="min-width:0"><b>' + esc(f.name) + '</b> <span class="prio ' + f.prio + '">' + f.prio + '</span><div class="small">' + esc(f.person) + ' · Anrufzeit ' + Lg.winTxt(f) + (f.gesperrt_bis ? ' · frühestens ab ' + dm(parseD(f.gesperrt_bis)) : '') + '</div></div><button class="ghost" data-a="plan" data-id="' + f.id + '">Einplanen</button></div>').join('') + '</div>'
  return h
}
function calWeek() {
  const mon = sod(now()); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7) + 7 * U.wk)
  const days = [0, 1, 2, 3, 4].map(i => { const d = new Date(mon); d.setDate(d.getDate() + i); return d })
  let h = '<div class="lhead"><div><h2>Woche ' + dm(days[0]) + ' – ' + dm(days[4]) + '</h2><div class="sub">Einträge auf einen anderen Tag ziehen, die Uhrzeit bleibt gleich. Klick auf einen Tag öffnet den Tagesplan.</div></div>' +
    '<div class="calbar"><button class="ghost" data-a="wknav" data-v="-1" aria-label="Vorherige Woche">‹</button><button class="ghost" data-a="wknav" data-v="0">Diese Woche</button><button class="ghost" data-a="wknav" data-v="1" aria-label="Nächste Woche">›</button>' + calTabs() + '</div></div>'
  const over = Lg.openTasks().filter(t => Lg.dueDate(t) < days[0]).length
  if (over && U.wk >= 0) h += '<div class="calsum"><span class="pill r">' + over + ' überfällig aus früheren Tagen</span></div>'
  h += '<div class="week">' + days.map(d => {
    const ts = Lg.openTasks().filter(t => sameDay(Lg.dueDate(t), d)).sort((a, b) => a.faellig_am.localeCompare(b.faellig_am))
    return '<div class="wcol' + (sameDay(d, now()) ? ' today' : '') + '" data-dropday="' + isoD(d) + '"><button class="whead" data-a="gotoday" data-v="' + daysBetween(now(), d) + '">' + WD[d.getDay()] + ' ' + dm(d).slice(3) + '<span>' + ts.length + '</span></button>' +
      ts.map(t => { const w = Lg.warnOf(t); return '<div class="wchip ' + t.typ + (w ? ' warn' : '') + '" draggable="true" data-dragtask="' + t.id + '" data-a="sel" data-id="' + (t.firma_id || '') + '"><b>' + hm(Lg.dueDate(t)) + '</b><span class="nm">' + esc(Lg.taskTitle(t)) + '</span><span class="small">' + esc(t.titel) + '</span>' + (w ? '<span class="warntx">⚠ ' + (w.startsWith('Gesperrt') ? 'gesperrt' : 'außerhalb Anrufzeit') + '</span>' : '') + '</div>' }).join('') + '</div>'
  }).join('') + '</div>'
  return h
}

/* Firmen-Details (gemeinsame Bausteine) */
function tasksHtml(f: Firma) {
  const ts = store.list('aufgaben').filter(t => t.firma_id === f.id).sort((a, b) => (+!!a.erledigt_am - +!!b.erledigt_am) || a.faellig_am.localeCompare(b.faellig_am)).slice(0, 8)
  if (!ts.length) return '<div class="small">Kein nächster Schritt geplant.</div>'
  return '<div class="tasks">' + ts.map(t => { const d = due(Lg.dueDate(t)); const w = Lg.warnOf(t); return '<label class="task' + (t.erledigt_am ? ' done' : '') + '"><input type="checkbox" data-a="toggle" data-id="' + t.id + '"' + (t.erledigt_am ? ' checked' : '') + '><span>' + (t.typ === 'rueckruf' ? 'Rückruf: ' : '') + esc(t.titel) + (w ? '<br><span class="warntx">⚠ ' + esc(w) + '</span>' : '') + '</span><span class="time' + (d.o && !t.erledigt_am ? ' over' : '') + '">' + d.t + '</span></label>' }).join('') + '</div>'
}
function timelineHtml(f: Firma) {
  const a = Lg.aktivitaeten(f.id)
  if (!a.length) return '<div class="small">Noch keine Einträge.</div>'
  return '<div class="timeline">' + a.slice(0, 50).map(e => { const d = new Date(e.zeitpunkt); return '<div class="ev ' + e.typ + '"><div class="h">' + dm(d) + ' ' + hm(d) + ' · ' + ({ anruf: 'Anruf', muster: 'Muster', email: 'E-Mail', termin: 'Termin', notiz: 'Notiz' }[e.typ] || 'Notiz') + (e.ergebnis ? ' · ' + esc(e.ergebnis) : '') + (e.dauer_sek ? ' · ' + Math.max(1, Math.round(e.dauer_sek / 60)) + ' Min.' : '') + '</div>' + (e.text ? '<div>' + esc(e.text) + '</div>' : '') + '</div>' }).join('') + '</div>'
}
function factsHtml(f: Firma, s: string) {
  const fs = Lg.punkte(f.id).filter(p => p.typ === 'fakt')
  return '<div class="sec">Key Facts</div><ul class="facts">' + (fs.length ? fs.map(p => '<li><span>' + esc(p.text) + '</span><button class="del" data-a="delpt" data-id="' + p.id + '" aria-label="Key Fact löschen">✕</button></li>').join('') : '<li class="none">Noch keine Key Facts.</li>') + '</ul>' +
    '<div class="addrow"><input id="' + s + '-fact" placeholder="Key Fact, z. B. Entscheider: GF" autocomplete="off"><button data-a="addpt" data-t="fakt" data-s="' + s + '" data-id="' + f.id + '">+</button></div>'
}
function agendaHtml(f: Firma, s: string) {
  const as = Lg.punkte(f.id).filter(p => p.typ === 'agenda'); const open = as.filter(p => !p.erledigt).length
  return '<div class="sec">Agenda fürs nächste Gespräch · ' + open + ' offen</div><div class="agenda">' + (as.length ? as.map(p => '<label class="apt' + (p.erledigt ? ' done' : '') + '"><input type="checkbox" data-a="togpt" data-id="' + p.id + '"' + (p.erledigt ? ' checked' : '') + '><span>' + esc(p.text) + '</span><button class="del" data-a="delpt" data-id="' + p.id + '" aria-label="Agendapunkt löschen">✕</button></label>').join('') : '<div class="small" style="padding:7px 0">Noch keine Punkte.</div>') + '</div>' +
    '<div class="addrow"><input id="' + s + '-ag" placeholder="Agendapunkt hinzufügen" autocomplete="off"><button data-a="addpt" data-t="agenda" data-s="' + s + '" data-id="' + f.id + '">+</button></div>'
}
function winHtml(f: Firma) {
  return '<div class="sec">Anrufzeiten und Sperre</div><div class="chips">' + Lg.PW.map(p => '<button class="chip' + (f.anrufzeiten.includes(p.k) ? ' on' : '') + '" data-a="togwin" data-id="' + f.id + '" data-v="' + p.k + '">' + p.l + '</button>').join('') + '</div>' +
    '<div class="addrow" style="align-items:center"><span class="small">Frühestens wieder anrufen ab</span><input type="date" id="ab-' + f.id + '" data-in="ab" data-id="' + f.id + '" value="' + (f.gesperrt_bis || '') + '" style="flex:0 0 auto"></div>'
}
function nowLine(f: Firma) {
  if (f.status === 'stopp') return '<div class="badline">Kontakt-Stopp: nicht mehr anrufen.</div>'
  if (Lg.blocked(f, now())) return '<div class="badline">Gesperrt bis ' + dm(parseD(f.gesperrt_bis!)) + '</div>'
  return Lg.inWin(f, now()) ? '<div class="okline">Jetzt gute Anrufzeit (' + Lg.winTxt(f) + ')</div>' : '<div class="badline">Jetzt außerhalb der Anrufzeit (' + Lg.winTxt(f) + ')</div>'
}
function contactLines(f: Firma) {
  const tel = telHref(f.telefon)
  return (f.telefon ? '<div class="tel">' + (tel ? '<a href="tel:' + esc(tel) + '">' + esc(f.telefon) + '</a>' : esc(f.telefon)) + '</div>' : '<div class="small">Keine Telefonnummer</div>') +
    (f.email ? '<div class="small"><a href="mailto:' + esc(f.email) + '">' + esc(f.email) + '</a></div>' : '') +
    (f.website ? '<div class="small"><a href="' + esc(/^https?:/i.test(f.website) ? f.website : 'https://' + f.website) + '" target="_blank" rel="noopener">' + esc(f.website.replace(/^https?:\/\//, '')) + '</a></div>' : '')
}
function dDetail(f: Firma) {
  return '<aside class="det" data-sk="det"><div class="dethead"><div><h3>' + esc(f.name) + '</h3><div class="small">' + esc([f.branche, [f.ort, f.bundesland].filter(Boolean).join(', ')].filter(Boolean).join(' · ')) + '</div></div><div class="btnrow"><button class="ghost" data-a="editfirm" data-id="' + f.id + '">Bearbeiten</button><button class="x" data-a="close" aria-label="Schließen">✕</button></div></div>' +
    '<div class="meta"><select id="st-' + f.id + '" data-in="status" data-id="' + f.id + '" aria-label="Status">' + (Object.keys(Lg.ST) as Status[]).map(k => '<option value="' + k + '"' + (f.status === k ? ' selected' : '') + '>' + Lg.ST[k].l + '</option>').join('') + '</select><span class="prio ' + f.prio + '">Prio ' + f.prio + '</span><span class="small">Erwartet: ' + eur(f.umsatz) + '</span></div>' +
    '<div class="person"><div style="min-width:0"><b>' + esc(f.person || 'Kein Ansprechpartner') + '</b><div class="small">' + esc(f.rolle) + '</div>' + contactLines(f) + '</div><button class="callbtn" data-a="log" data-id="' + f.id + '"' + (f.status === 'stopp' ? ' disabled' : '') + '>Gespräch erfassen</button></div>' +
    nowLine(f) + agendaHtml(f, 'd') + factsHtml(f, 'd') +
    (f.hook ? '<div class="sec">Gesprächsaufhänger</div><div class="hookbox">' + esc(f.hook) + '</div>' : '') + winHtml(f) +
    '<div class="sec">Nächste Schritte</div>' + tasksHtml(f) +
    '<div class="addrow"><input id="d-tt" style="flex-basis:100%" placeholder="Wiedervorlage, z. B. Muster nachfassen" autocomplete="off"><input id="d-td" type="datetime-local" style="flex:0 0 auto" aria-label="Datum und Uhrzeit"><button data-a="addtask" data-id="' + f.id + '">Planen</button></div>' +
    '<div class="sec">Verlauf</div><div class="addrow"><textarea id="d-nt" placeholder="Notiz hinzufügen …"></textarea><button data-a="addnote" data-s="d" data-id="' + f.id + '">Speichern</button></div>' + timelineHtml(f) +
    (f.quelle_url || f.grundlage ? '<div class="small">Quelle: ' + (f.quelle_url ? '<a href="' + esc(f.quelle_url) + '" target="_blank" rel="noopener">' + esc(f.quelle_url.replace(/^https?:\/\//, '').slice(0, 60)) + '</a>' : '') + (f.grundlage ? ' · ' + esc(f.grundlage) : '') + '</div>' : '') + '</aside>'
}

/* Ergebnis-Fenster */
function resultForm(sh: Lg.ResultSheet) {
  const f = Lg.firma(sh.firm); if (!f) return ''
  const dur = sh.dur ? 'ca. ' + Math.floor(sh.dur / 60) + ':' + String(sh.dur % 60).padStart(2, '0') + ' Min.' : ''
  const as = Lg.punkte(f.id).filter(p => p.typ === 'agenda' && !p.erledigt)
  return '<div class="rf"><div class="rfhead"><b>' + esc(f.name) + '</b><span class="small">' + dur + '</span></div>' +
    '<div class="sec">Ergebnis</div><div class="chips">' + Lg.OUTCOMES.map(o => '<button class="chip' + (sh.erg === o.k ? ' on' : '') + '" data-a="erg" data-v="' + o.k + '">' + o.l + '</button>').join('') + '</div>' +
    (as.length ? '<div class="sec">Agenda abhaken</div><div class="agenda">' + as.map(p => '<label class="apt"><input type="checkbox" data-a="shag" data-id="' + p.id + '"' + (sh.ag.includes(p.id) ? ' checked' : '') + '><span>' + esc(p.text) + '</span></label>').join('') + '</div>' : '') +
    '<div class="sec">Notiz</div><textarea id="rf-note" data-in="note" placeholder="Was wurde besprochen? Menge, Einwände, nächste Schritte …">' + esc(sh.note) + '</textarea>' +
    '<div class="sec">Wiedervorlage</div><div class="chips">' + Lg.FOLLOW.map(o => '<button class="chip' + (sh.follow === o.k ? ' on' : '') + '" data-a="follow" data-v="' + o.k + '">' + o.l + '</button>').join('') + '</div>' +
    (sh.follow && sh.follow !== 'keine' ? '<div class="small">Termin: ' + (() => { const d = Lg.followDate(sh.follow!, f); return d ? dm(d) + ' ' + hm(d) + ' (nach Anrufzeit des Kunden)' : '' })() + '</div>' : '') +
    '<button class="savebtn" data-a="save">' + (mobile ? 'Speichern und nächster Kontakt' : 'Speichern') + '</button>' +
    '<button class="ghost" data-a="closemodal" style="justify-content:center">Abbrechen</button></div>'
}

/* Firma anlegen / bearbeiten */
function editForm(e: EditState) {
  const f = e.f
  const inp = (k: keyof Firma, l: string, type = 'text', full = false) => '<label' + (full ? ' class="full"' : '') + '>' + l + '<input id="e-' + k + '" type="' + type + '" value="' + esc(f[k] ?? '') + '"' + (type === 'tel' ? ' inputmode="tel"' : '') + ' autocomplete="off"></label>'
  return '<div class="rf"><div class="rfhead"><b>' + (e.isNew ? 'Neue Firma' : 'Firma bearbeiten') + '</b></div><div class="form' + (mobile ? ' one' : '') + '">' +
    inp('name', 'Firmenname *', 'text', true) + inp('person', 'Ansprechpartner') + inp('rolle', 'Funktion') + inp('telefon', 'Telefon', 'tel') + inp('email', 'E-Mail', 'email') +
    inp('branche', 'Branche') + inp('ort', 'Ort') + inp('bundesland', 'Bundesland') + inp('adresse', 'Adresse') + inp('website', 'Website', 'text') +
    '<label>Priorität<select id="e-prio">' + ['A', 'B', 'C'].map(p => '<option' + (f.prio === p ? ' selected' : '') + '>' + p + '</option>').join('') + '</select></label>' +
    '<label>Status<select id="e-status">' + (Object.keys(Lg.ST) as Status[]).map(k => '<option value="' + k + '"' + (f.status === k ? ' selected' : '') + '>' + Lg.ST[k].l + '</option>').join('') + '</select></label>' +
    '<label>Erwarteter Umsatz €<input id="e-umsatz" type="number" inputmode="decimal" min="0" step="50" value="' + (f.umsatz ?? '') + '"></label>' +
    '<label class="full">Gesprächsaufhänger<textarea id="e-hook">' + esc(f.hook) + '</textarea></label>' +
    inp('quelle_url', 'Quelle (URL)', 'text') + inp('grundlage', 'Grundlage für die Kontaktaufnahme') +
    '</div><div id="e-err" class="err" hidden>Bitte einen Firmennamen eintragen.</div><div class="btnrow">' +
    (!e.isNew ? (e.confirmDel ? '<button class="ghost danger" data-a="delfirm2">Wirklich löschen</button><button class="ghost" data-a="delfirm0">Doch nicht</button>' : '<button class="ghost danger" data-a="delfirm1">Löschen</button>') : '') +
    '<span class="spacer"></span><button class="ghost" data-a="closemodal">Abbrechen</button><button class="primary" data-a="savefirm">Speichern</button></div></div>'
}

/* Import & Einstellungen (Laptop und Handy) */
function importView() {
  const p = U.importPlan
  let h = '<div class="lhead"><div><h2>Import</h2><div class="sub">Excel-Listen (.xlsx) einlesen. Firmen, die schon da sind (gleiche Nummer oder gleicher Name), werden übersprungen.</div></div></div>'
  h += '<div class="panel"><label class="small" for="imp-file">Excel-Datei auswählen</label><input type="file" id="imp-file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">' +
    '<div class="small">Erkannt werden die Spalten eurer Listen: Unternehmen bzw. Firmenname, Branche, Ort, Bundesland, Telefon, E-Mail, Website, Ansprechpartner, Funktion, Gesprächsaufhänger, Status, Quelle und Notiz. Jedes Tabellenblatt wird gelesen.</div></div>'
  if (U.importBusy) h += '<div class="empty">Datei wird gelesen …</div>'
  if (p) {
    h += '<div class="panel"><h3>Vorschau</h3><div class="tablebox"><table><thead><tr><th>Tabellenblatt</th><th>Zeilen</th></tr></thead><tbody>' + p.sheets.map(s => '<tr><td>' + esc(s.name) + '</td><td>' + s.rows + '</td></tr>').join('') + '</tbody></table></div>' +
      '<div><b>' + p.neu.length + ' neue Firmen</b>' + (p.doppelt ? ', ' + p.doppelt + ' schon vorhanden (werden übersprungen)' : '') + '</div>' +
      '<div class="btnrow">' + (p.neu.length ? '<button class="primary" data-a="doimport">' + p.neu.length + ' Firmen importieren</button>' : '') + '<button class="ghost" data-a="cancelimport">Verwerfen</button></div></div>'
  }
  if (U.importMsg) h += '<div class="okline">' + esc(U.importMsg) + '</div>'
  return h
}
function settingsView() {
  const s = ctx.sync()
  const perm = typeof Notification === 'undefined' ? 'nicht verfügbar' : Notification.permission
  const counts = 'Firmen ' + Lg.firmen().length + ' · Aufgaben ' + store.list('aufgaben').length + ' · Einträge ' + store.list('aktivitaeten').length
  return '<div class="lhead"><div><h2>Einstellungen</h2></div></div><div class="settings">' +
    '<div class="panel"><h3>Konto</h3><div>' + (ctx.demo ? 'Demo-Modus ohne Datenbank' : esc(ctx.email)) + '</div>' + (!ctx.demo ? '<div class="btnrow"><button class="ghost" data-a="logout">Abmelden</button></div><div class="small">Beim Abmelden werden die Daten auf diesem Gerät gelöscht. In der Datenbank bleiben sie erhalten.</div>' : '') + '</div>' +
    '<div class="panel"><h3>Synchronisierung</h3><div>' + syncDot() + '</div>' + (s.err ? '<div class="err">' + esc(s.err) + '</div>' : '') + '<div class="small">' + counts + '</div>' + (!ctx.demo ? '<div class="btnrow"><button class="ghost" data-a="syncnow">Jetzt abgleichen</button></div>' : '') + '</div>' +
    '<div class="panel"><h3>Erinnerungen</h3><div class="small">Die App meldet sich 5 Minuten vor einem Rückruf, solange sie geöffnet oder im Hintergrund aktiv ist. Push-Nachrichten bei geschlossener App folgen im nächsten Ausbauschritt. Am iPhone funktionieren Erinnerungen nur, wenn die App zum Home-Bildschirm hinzugefügt wurde.</div><div>Status: <b>' + ({ granted: 'erlaubt', denied: 'blockiert (in den Geräte-Einstellungen freigeben)', default: 'noch nicht gefragt' } as Record<string, string>)[perm] + '</b></div>' + (perm === 'default' ? '<div class="btnrow"><button class="ghost" data-a="notify">Erinnerungen erlauben</button></div>' : '') + '</div>' +
    '<div class="panel"><h3>Als App installieren</h3><div class="small"><b>iPhone:</b> In Safari öffnen, unten auf Teilen tippen, dann „Zum Home-Bildschirm“.<br><b>Android:</b> In Chrome öffnen, Menü ⋮, dann „App installieren“.<br><b>Laptop:</b> In Chrome oder Edge auf das Installieren-Symbol in der Adressleiste klicken, oder einfach als Lesezeichen nutzen.</div></div>' +
    '<div class="panel"><h3>Daten</h3><div class="btnrow"><button class="ghost" data-a="csv">Firmen als CSV exportieren</button></div><div class="small">Für Excel, als Sicherung oder für eine DSGVO-Auskunft.</div></div></div>'
}

/* ---------------- Handy ---------------- */

function renderMobile() {
  const dl = Lg.dueList(); const over = dl.filter(t => due(Lg.dueDate(t)).o).length
  const f = Lg.firma(U.sel)
  let h = '<div class="mshell"><div class="mtop"><span>SICHTFAKTOR</span>' + syncDot() + '</div>' + demoBanner() +
    '<div class="pbody" data-sk="m-' + (f ? 'det' : U.mtab + U.mmore) + '">' + (f ? mDetail(f) : mTab()) + '</div>' +
    '<nav class="tabbar">' + ([['heute', 'Heute', ICON.today, over], ['kontakte', 'Kontakte', ICON.people, 0], ['aufgaben', 'Aufgaben', ICON.check, 0], ['mehr', 'Mehr', ICON.more, 0]] as [string, string, string, number][]).map(t => '<button class="' + (U.mtab === t[0] && !f ? 'on' : '') + '" data-a="mtab" data-v="' + t[0] + '">' + t[2] + (t[3] ? '<span class="badge">' + t[3] + '</span>' : '') + t[1] + '</button>').join('') + '</nav></div>'
  const pc = pendingCall()
  if (pc && !U.modal) { const pf = Lg.firma(pc.firm); if (pf) h += '<button class="callbanner" data-a="pcopen"><div>Gespräch mit ' + esc(pf.name) + ' erfassen<span>Tippen, sobald das Telefonat vorbei ist</span></div>' + ICON.phone + '</button>' }
  if (U.modal) h += '<div class="sheetbg" data-a="modalbg"><div class="sheet"><div class="grab"></div>' + resultForm(U.modal) + '</div></div>'
  if (U.edit) h += '<div class="sheetbg" data-a="modalbg"><div class="sheet"><div class="grab"></div>' + editForm(U.edit) + '</div></div>'
  return h
}
function pCard(f: Firma, line: string, d?: { t: string; o: boolean }) {
  return '<div class="pcard" data-a="sel" data-id="' + f.id + '"><div class="info">' + (d ? '<span class="time' + (d.o ? ' over' : '') + '">' + d.t + '</span>' : '') + '<b>' + esc(f.name) + '</b><span class="small">' + esc(line) + '</span><span>' + pill(f.status) + '</span></div>' + callLink(f, 'round', ICON.phone) + '</div>'
}
function mTab(): string {
  if (U.mtab === 'kontakte') {
    return '<div class="ptitle"><h2>Kontakte</h2><button class="ghost" data-a="newfirm">+ Neu</button></div><input class="psearch" id="m-q" data-in="mq" type="search" placeholder="Firma, Person, Ort oder Nummer suchen" value="' + esc(U.mq) + '" autocomplete="off"><div id="mrows" style="display:flex;flex-direction:column;gap:8px">' + mRows() + '</div>'
  }
  if (U.mtab === 'aufgaben') {
    const ts = Lg.openTasks().sort((a, b) => a.faellig_am.localeCompare(b.faellig_am))
    const grp: [string, Aufgabe[]][] = [['Überfällig', ts.filter(t => Lg.dueDate(t) < sod(now()))], ['Heute', ts.filter(t => sameDay(Lg.dueDate(t), now()))], ['Später', ts.filter(t => Lg.dueDate(t) > endToday())]]
    return '<div class="ptitle"><h2>Aufgaben</h2></div><div class="addrow"><input id="m-tt" placeholder="Neues To-do für heute" autocomplete="off"><button data-a="addtodo">+</button></div>' +
      grp.filter(g => g[1].length).map(g => '<div class="sec">' + g[0] + ' · ' + g[1].length + '</div><div class="mlist" style="padding:2px 12px">' + g[1].slice(0, 100).map(t => { const d = Lg.dueDate(t); return '<label class="task"><input type="checkbox" data-a="toggle" data-id="' + t.id + '"><span><b>' + esc(Lg.taskTitle(t)) + '</b><br>' + (t.typ === 'rueckruf' ? 'Rückruf: ' : '') + esc(t.titel) + '</span><span class="time' + (due(d).o ? ' over' : '') + '">' + (sameDay(d, now()) ? hm(d) : dm(d)) + '</span></label>' }).join('') + '</div>').join('') +
      (ts.length ? '' : '<div class="empty">Keine offenen Aufgaben.</div>')
  }
  if (U.mtab === 'mehr') {
    if (U.mmore) {
      const back = '<button class="back" data-a="mmore" data-v="">‹ Mehr</button>'
      if (U.mmore === 'plan') return back + mPlan()
      if (U.mmore === 'stat') return back + statistik()
      if (U.mmore === 'import') return back + importView()
      return back + settingsView()
    }
    return '<div class="ptitle"><h2>Mehr</h2></div><div class="mlist">' + ([['plan', 'Tagesplan'], ['stat', 'Statistik'], ['import', 'Excel-Import'], ['settings', 'Einstellungen']] as [string, string][]).map(m => '<button data-a="mmore" data-v="' + m[0] + '">' + m[1] + '<span>›</span></button>').join('') + '</div>'
  }
  const dl = Lg.dueList(); const calls = dl.filter(t => t.firma_id && t.typ === 'rueckruf'); const todos = dl.filter(t => !(t.firma_id && t.typ === 'rueckruf'))
  const done = Lg.doneToday(); const tot = done + dl.length
  let h = '<div class="ptitle"><h2>Heute</h2><span class="small">' + dm(now()) + '</span></div><div class="small">' + done + ' von ' + tot + ' erledigt</div><div class="prog"><i style="width:' + (tot ? done / tot * 100 : 0) + '%"></i></div>'
  if (!calls.length) h += '<div class="empty">Keine Rückrufe mehr offen.</div>'
  h += calls.map(t => { const f = Lg.firma(t.firma_id)!; return pCard(f, [f.person, t.titel].filter(Boolean).join(' · '), due(Lg.dueDate(t))) }).join('')
  if (todos.length) h += '<div class="sec">To-dos</div><div class="mlist" style="padding:2px 12px">' + todos.map(t => '<label class="task"><input type="checkbox" data-a="toggle" data-id="' + t.id + '"><span>' + esc(t.titel) + (t.firma_id ? '<br><span class="small">' + esc(Lg.taskTitle(t)) + '</span>' : '') + '</span><span class="time">' + hm(Lg.dueDate(t)) + '</span></label>').join('') + '</div>'
  const na = Lg.newA(); if (na.length) h += '<div class="sec">Neu · Priorität A</div>' + na.slice(0, 20).map(f => pCard(f, [f.person, f.ort].filter(Boolean).join(' · '))).join('')
  return h
}
function mRows() {
  const fs = filteredFirmen(U.mq)
  if (!fs.length) return '<div class="empty">' + (Lg.firmen().length ? 'Keine Treffer.' : 'Noch keine Firmen.') + '</div>'
  return fs.slice(0, 200).map(f => pCard(f, [f.person, f.ort].filter(Boolean).join(' · '))).join('') + (fs.length > 200 ? '<div class="small">Weitere ' + (fs.length - 200) + ' Treffer: Suche genauer eingrenzen.</div>' : '')
}
function mPlan() {
  const ts = Lg.openTasks().filter(t => sameDay(Lg.dueDate(t), at(U.day))).sort((a, b) => a.faellig_am.localeCompare(b.faellig_am))
  return '<div class="ptitle"><h2>Tagesplan</h2><span class="small">' + dm(at(U.day)) + '</span></div><div class="btnrow"><button class="ghost" data-a="calnav" data-v="-1">‹</button><button class="ghost" data-a="calnav" data-v="0">Heute</button><button class="ghost" data-a="calnav" data-v="1">›</button></div>' +
    (ts.length ? ts.map(t => { const f = Lg.firma(t.firma_id); const w = Lg.warnOf(t); return f ? pCard(f, hm(Lg.dueDate(t)) + ' · ' + t.titel + ' · Anrufzeit ' + Lg.winTxt(f) + (w ? ' · ⚠ Konflikt' : '')) : '<div class="pcard"><div class="info"><span class="time">' + hm(Lg.dueDate(t)) + '</span><b>' + esc(t.titel) + '</b></div></div>' }).join('') : '<div class="empty">Nichts geplant.</div>')
}
function mDetail(f: Firma) {
  return '<button class="back" data-a="close">‹ Zurück</button><div class="dethead"><div><h2 style="font-family:var(--f-display);margin:0;font-size:1.35rem;line-height:1.2">' + esc(f.name) + '</h2><div class="small">' + esc([f.branche, f.ort].filter(Boolean).join(' · ')) + '</div></div><button class="ghost" data-a="editfirm" data-id="' + f.id + '">Bearbeiten</button></div>' +
    '<div class="meta"><select id="mst-' + f.id + '" data-in="status" data-id="' + f.id + '" aria-label="Status">' + (Object.keys(Lg.ST) as Status[]).map(k => '<option value="' + k + '"' + (f.status === k ? ' selected' : '') + '>' + Lg.ST[k].l + '</option>').join('') + '</select><span class="prio ' + f.prio + '">Prio ' + f.prio + '</span></div>' +
    '<div class="person" style="background:var(--surface);border:1px solid var(--line)"><div style="min-width:0"><b>' + esc(f.person || 'Kein Ansprechpartner') + '</b><div class="small">' + esc(f.rolle) + '</div>' + contactLines(f) + '</div></div>' +
    callLink(f, 'callbtn big', ICON.phone + ' Anrufen') + nowLine(f) + agendaHtml(f, 'm') + factsHtml(f, 'm') +
    (f.hook ? '<div class="sec">Aufhänger</div><div class="hookbox">' + esc(f.hook) + '</div>' : '') +
    '<div class="sec">Nächste Schritte</div>' + tasksHtml(f) +
    '<div class="chips">' + Lg.FOLLOW.slice(0, 3).map(o => '<button class="chip" data-a="quickfollow" data-id="' + f.id + '" data-v="' + o.k + '">+ ' + o.l + '</button>').join('') + '</div>' +
    '<div class="sec">Notiz</div><div class="addrow"><textarea id="m-nt" placeholder="Kurz notieren …"></textarea><button data-a="addnote" data-s="m" data-id="' + f.id + '">OK</button></div>' +
    '<button class="ghost" data-a="log" data-id="' + f.id + '" style="justify-content:center">Gespräch ohne Anruf erfassen</button>' +
    '<div class="sec">Verlauf</div>' + timelineHtml(f) + winHtml(f)
}
function mRowsRefresh() { const el = document.getElementById('mrows'); if (el) el.innerHTML = mRows() }

/* ---------------- Anrufe ---------------- */

interface PendingCall { firm: string; start: number }
function pendingCall(): PendingCall | null {
  try { const v = JSON.parse(localStorage.getItem('sf_call') || 'null'); return v && Date.now() - v.start < 3 * 3600e3 ? v : null } catch { return null }
}
function setPendingCall(v: PendingCall | null) { try { v ? localStorage.setItem('sf_call', JSON.stringify(v)) : localStorage.removeItem('sf_call') } catch { /* egal */ } }
function openResult(firm: string, dur: number) {
  U.modal = { firm, erg: null, follow: null, note: '', dur, ag: [] }
  render(true)
}
function checkPendingCall() {
  const pc = pendingCall(); if (!pc || U.modal) return
  const el = Date.now() - pc.start
  if (el < 4000) return
  setPendingCall(null)
  if (Lg.firma(pc.firm)) openResult(pc.firm, Math.round(el / 1000))
}

/* ---------------- Erinnerungen ---------------- */

function startReminders() { window.setInterval(checkReminders, 30000); window.setTimeout(checkReminders, 4000) }
async function checkReminders() {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  let sent: string[] = []
  try { sent = JSON.parse(localStorage.getItem('sf_notified') || '[]') } catch { /* leer */ }
  const t0 = Date.now()
  const soon = Lg.openTasks().filter(t => t.typ === 'rueckruf' && !sent.includes(t.id) && Lg.dueDate(t).getTime() - t0 <= 5 * 60000 && Lg.dueDate(t).getTime() - t0 > -10 * 60000)
  if (!soon.length) return
  const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined
  for (const t of soon) {
    const f = Lg.firma(t.firma_id)
    const title = 'Rückruf ' + hm(Lg.dueDate(t)) + (f ? ' · ' + f.name : '')
    const body = [f?.person, t.titel].filter(Boolean).join(' · ')
    try { if (reg) await reg.showNotification(title, { body, tag: t.id, icon: '/icons/icon-192.png' }); else new Notification(title, { body, tag: t.id }) } catch (e) { console.warn(e) }
    sent.push(t.id)
  }
  try { localStorage.setItem('sf_notified', JSON.stringify(sent.slice(-300))) } catch { /* egal */ }
}

/* ---------------- Aktionen ---------------- */

function val(id: string) { return (document.getElementById(id) as HTMLInputElement | null)?.value ?? '' }
function saveFirmFromForm() {
  const e = U.edit!; const f = { ...e.f }
  const keys: (keyof Firma)[] = ['name', 'person', 'rolle', 'telefon', 'email', 'branche', 'ort', 'bundesland', 'adresse', 'website', 'quelle_url', 'grundlage']
  keys.forEach(k => { (f as Record<string, unknown>)[k] = val('e-' + k).trim() })
  f.hook = val('e-hook').trim(); f.prio = val('e-prio') as Firma['prio']; f.status = val('e-status') as Status
  const um = parseFloat(val('e-umsatz').replace(',', '.')); f.umsatz = isFinite(um) && um > 0 ? um : null
  if (!f.name) { const er = document.getElementById('e-err'); if (er) er.hidden = false; return }
  store.save('firmen', f)
  U.edit = null; U.sel = f.id
  toast(e.isNew ? 'Firma angelegt' : 'Gespeichert')
}
function exportCsv() {
  const cols: (keyof Firma)[] = ['name', 'branche', 'ort', 'bundesland', 'adresse', 'telefon', 'email', 'website', 'person', 'rolle', 'status', 'prio', 'umsatz', 'hook', 'quelle_url']
  const q = (v: unknown) => '"' + String(v ?? '').replace(/"/g, '""') + '"'
  const lines = [cols.join(';'), ...Lg.firmen().map(f => cols.map(c => q(c === 'status' ? Lg.ST[f.status]?.l : f[c])).join(';'))]
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'sichtfaktor-firmen-' + isoD(now()) + '.csv'
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

function onClick(e: MouseEvent) {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-a]'); if (!el || !root.contains(el)) return
  const a = el.dataset.a!, id = el.dataset.id || '', v = el.dataset.v ?? ''
  if (el.matches('select,textarea,input:not([type=checkbox])')) return
  switch (a) {
    case 'view': U.view = v; U.sel = null; render(true); break
    case 'sel': if (!id) break; U.sel = id; render(true); break
    case 'close': U.sel = null; render(true); break
    case 'mtab': U.mtab = v; U.sel = null; U.mmore = ''; render(true); break
    case 'mmore': U.mmore = v as typeof U.mmore; render(true); break
    case 'call': { setPendingCall({ firm: id, start: Date.now() }); window.setTimeout(() => render(true), 300); break }
    case 'pcopen': { const pc = pendingCall(); setPendingCall(null); if (pc) openResult(pc.firm, Math.round((Date.now() - pc.start) / 1000)); break }
    case 'log': openResult(id, 0); break
    case 'modalbg': if (e.target === el) { U.modal = null; U.edit = null; render(true) } break
    case 'closemodal': U.modal = null; U.edit = null; render(true); break
    case 'erg': { const sh = U.modal!; sh.erg = v; if (!sh.followTouched) sh.follow = Lg.OUTCOMES.find(o => o.k === v)!.f; render(true); break }
    case 'follow': { const sh = U.modal!; sh.follow = v; sh.followTouched = true; render(true); break }
    case 'shag': { const sh = U.modal!; sh.ag = sh.ag.includes(id) ? sh.ag.filter(x => x !== id) : sh.ag.concat(id); break }
    case 'save': {
      const sh = U.modal!; sh.note = val('rf-note')
      if (!sh.erg) { sh.erg = 'nicht_erreicht'; if (!sh.followTouched) sh.follow = 'morgen' }
      Lg.saveResult(sh); U.modal = null
      if (mobile) { const nx = Lg.dueList().find(t => t.firma_id && t.typ === 'rueckruf'); U.sel = nx ? nx.firma_id : null; if (!nx) U.mtab = 'heute' }
      toast('Gespräch gespeichert'); break
    }
    case 'done': { const t = store.get('aufgaben', id); if (t) store.save('aufgaben', { ...t, erledigt_am: iso(now()) }); render(true); break }
    case 'toggle': { const t = store.get('aufgaben', id); if (t) store.save('aufgaben', { ...t, erledigt_am: t.erledigt_am ? null : iso(now()) }); render(true); break }
    case 'addtask': {
      const f = Lg.firma(id); if (!f) break
      const dv = val('d-td'); const d = dv ? new Date(dv) : Lg.freeSlot(f, at(1))
      Lg.neueAufgabe(id, 'rueckruf', val('d-tt').trim() || 'Rückruf', d); render(true); toast('Geplant für ' + dm(d) + ' ' + hm(d)); break
    }
    case 'quickfollow': { const f = Lg.firma(id); if (!f) break; const d = Lg.followDate(v, f); if (d) { Lg.neueAufgabe(id, 'rueckruf', 'Erneut anrufen', d); toast('Rückruf am ' + dm(d) + ' ' + hm(d)) } break }
    case 'addtodo': { const tt = val('m-tt').trim(); if (!tt) break; Lg.neueAufgabe(null, 'todo', tt, at(0, 17)); render(true); break }
    case 'addnote': {
      const tx = val(el.dataset.s + '-nt').trim(); if (!tx) break
      store.save('aktivitaeten', { id: uuid(), firma_id: id, typ: 'notiz', ergebnis: '', text: tx, dauer_sek: 0, zeitpunkt: iso(now()), deleted_at: null, created_at: iso(now()) }); render(true); break
    }
    case 'addpt': {
      const inpId = el.dataset.s + (el.dataset.t === 'fakt' ? '-fact' : '-ag'); const tx = val(inpId).trim(); if (!tx) break
      const n = Lg.punkte(id).length
      store.save('punkte', { id: uuid(), firma_id: id, typ: el.dataset.t as 'fakt' | 'agenda', text: tx, erledigt: false, sort: n, deleted_at: null, created_at: iso(now()) })
      render(true); document.getElementById(inpId)?.focus(); break
    }
    case 'delpt': e.preventDefault(); store.remove('punkte', id); render(true); break
    case 'togpt': { const p = store.get('punkte', id); if (p) store.save('punkte', { ...p, erledigt: !p.erledigt }); render(true); break }
    case 'togwin': { const f = Lg.firma(id); if (!f) break; const w = f.anrufzeiten.includes(v) ? f.anrufzeiten.filter(k => k !== v) : f.anrufzeiten.concat(v); store.save('firmen', { ...f, anrufzeiten: w }); render(true); break }
    case 'plan': {
      const f = Lg.firma(id); if (!f) break
      const base = U.view === 'kalender' ? at(U.day) : now()
      let d = Lg.freeSlot(f, base); if (d < now()) d = Lg.freeSlot(f, at(1))
      Lg.neueAufgabe(id, 'rueckruf', 'Anruf', d)
      if (U.view === 'kalender' && !sameDay(d, at(U.day))) U.day = daysBetween(now(), d)
      toast('Eingeplant: ' + dm(d) + ' ' + hm(d)); break
    }
    case 'calmode': U.cal = v; render(true); break
    case 'calnav': U.day = v === '0' ? 0 : U.day + parseInt(v, 10); render(true); break
    case 'wknav': U.wk = v === '0' ? 0 : U.wk + parseInt(v, 10); render(true); break
    case 'gotoday': U.cal = 'tag'; U.day = parseInt(v, 10); render(true); break
    case 'newfirm': U.edit = { f: Lg.neueFirma({}), isNew: true, confirmDel: false }; render(true); setTimeout(() => document.getElementById('e-name')?.focus(), 50); break
    case 'editfirm': { const f = Lg.firma(id); if (f) { U.edit = { f: { ...f }, isNew: false, confirmDel: false }; render(true) } break }
    case 'savefirm': saveFirmFromForm(); break
    case 'delfirm1': U.edit!.confirmDel = true; render(true); break
    case 'delfirm0': U.edit!.confirmDel = false; render(true); break
    case 'delfirm2': {
      const fid = U.edit!.f.id
      store.list('aufgaben').filter(t => t.firma_id === fid && !t.erledigt_am).forEach(t => store.remove('aufgaben', t.id))
      store.remove('firmen', fid); U.edit = null; U.sel = null; toast('Firma gelöscht'); break
    }
    case 'doimport': { if (!U.importPlan) break; const n = ausfuehren(U.importPlan); U.importPlan = null; U.importMsg = n + ' Firmen importiert.'; render(true); break }
    case 'cancelimport': U.importPlan = null; render(true); break
    case 'syncnow': ctx.syncNow(); toast('Abgleich gestartet'); break
    case 'notify': Notification.requestPermission().then(() => render(true)); break
    case 'csv': exportCsv(); break
    case 'logout': ctx.logout(); break
  }
}

function onInput(e: Event) {
  const el = e.target as HTMLInputElement; const k = el.dataset?.in; if (!k) return
  if (k === 'q') { U.q = el.value; const r = document.getElementById('rows'); if (r) r.innerHTML = dRows() }
  if (k === 'mq') { U.mq = el.value; mRowsRefresh() }
  if (k === 'note' && U.modal) U.modal.note = el.value
}
function onChange(e: Event) {
  const el = e.target as HTMLInputElement; const k = el.dataset?.in
  if (el.id === 'imp-file' && el.files?.[0]) {
    U.importBusy = true; U.importMsg = ''; U.importPlan = null; render(true)
    analyse(el.files[0]).then(p => { U.importPlan = p }).catch(err => { console.error(err); U.importMsg = 'Die Datei konnte nicht gelesen werden. Ist es eine .xlsx-Datei?' }).finally(() => { U.importBusy = false; render(true) })
    return
  }
  if (!k) return
  if (k === 'fs' || k === 'fb' || k === 'fp') { (U as Record<string, unknown>)[k] = el.value; const r = document.getElementById('rows'); if (r) r.innerHTML = dRows() }
  if (k === 'status') { const f = Lg.firma(el.dataset.id); if (f) store.save('firmen', { ...f, status: el.value as Status }); el.blur(); render(true) }
  if (k === 'ab') { const f = Lg.firma(el.dataset.id); if (f) store.save('firmen', { ...f, gesperrt_bis: el.value || null }); el.blur(); render(true) }
}

function bind() {
  root.addEventListener('click', onClick)
  root.addEventListener('input', onInput)
  root.addEventListener('change', onChange)
  root.addEventListener('focusout', () => { setTimeout(() => { if (deferred && !(document.activeElement && root.contains(document.activeElement) && (document.activeElement as HTMLElement).matches(TYPING))) render() }, 0) })
  root.addEventListener('keydown', e => {
    const t = e.target as HTMLElement
    if (e.key === 'Escape' && (U.modal || U.edit)) { U.modal = null; U.edit = null; render(true); return }
    if (e.key !== 'Enter' || t.tagName !== 'INPUT') return
    if (t.closest('.form')) { e.preventDefault(); saveFirmFromForm(); return }
    const row = t.closest('.addrow'); const b = row?.querySelector('button'); if (b) { e.preventDefault(); b.click() }
  })
  // Pipeline und Woche: Ziehen mit der Maus
  let dragFirm: string | null = null, dragTask: string | null = null
  root.addEventListener('dragstart', e => {
    const t = e.target as HTMLElement
    const c = t.closest<HTMLElement>('[data-drag]'); if (c) { dragFirm = c.dataset.drag!; e.dataTransfer?.setData('text/plain', dragFirm) }
    const w = t.closest<HTMLElement>('[data-dragtask]'); if (w) { dragTask = w.dataset.dragtask!; e.dataTransfer?.setData('text/plain', dragTask) }
  })
  root.addEventListener('dragover', e => {
    const t = e.target as HTMLElement
    const c = (dragFirm && t.closest<HTMLElement>('[data-drop]')) || (dragTask && t.closest<HTMLElement>('[data-dropday]'))
    if (c) { e.preventDefault(); root.querySelectorAll('.over').forEach(x => x !== c && x.classList.remove('over')); c.classList.add('over') }
  })
  root.addEventListener('drop', e => {
    const t = e.target as HTMLElement
    const c = t.closest<HTMLElement>('[data-drop]'); if (c && dragFirm) { e.preventDefault(); const f = Lg.firma(dragFirm); if (f) store.save('firmen', { ...f, status: c.dataset.drop as Status }) }
    const w = t.closest<HTMLElement>('[data-dropday]'); if (w && dragTask) { e.preventDefault(); const a = store.get('aufgaben', dragTask); if (a) { const d = parseD(w.dataset.dropday!); d.setMinutes(mins(Lg.dueDate(a))); store.save('aufgaben', { ...a, faellig_am: iso(d) }) } }
    dragFirm = dragTask = null; render(true)
  })
  root.addEventListener('dragend', () => { dragFirm = dragTask = null; root.querySelectorAll('.over').forEach(x => x.classList.remove('over')) })
  // Tagesplan: Balken verschieben
  let gd: { id: string; el: HTMLElement; tr: DOMRect; x0: number; moved: boolean; m: number | null } | null = null
  root.addEventListener('pointerdown', e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-gt]'); if (!b) return
    gd = { id: b.dataset.gt!, el: b, tr: b.parentElement!.getBoundingClientRect(), x0: e.clientX, moved: false, m: null }
    try { b.setPointerCapture(e.pointerId) } catch { /* egal */ }
    b.classList.add('drag'); e.preventDefault()
  })
  root.addEventListener('pointermove', e => {
    if (!gd) return
    if (Math.abs(e.clientX - gd.x0) > 3) gd.moved = true
    if (!gd.moved) return
    let m = Lg.H0 + (e.clientX - gd.tr.left) / gd.tr.width * Lg.SPAN
    m = Math.max(Lg.H0, Math.min(Lg.H1 - 15, Math.round(m / 15) * 15)); gd.m = m
    gd.el.style.left = Lg.pct(m) + '%'; (gd.el.firstChild as HTMLElement).textContent = fm(m)
  })
  root.addEventListener('pointerup', () => {
    if (!gd) return
    const g = gd; gd = null; g.el.classList.remove('drag')
    const t = store.get('aufgaben', g.id); if (!t) return
    if (g.moved && g.m != null) { const d = sod(Lg.dueDate(t)); d.setMinutes(g.m); store.save('aufgaben', { ...t, faellig_am: iso(d) }); render(true) }
    else if (t.firma_id) { U.sel = t.firma_id; render(true) }
  })
  // Uhrzeit-abhängige Anzeigen (fällig, jetzt-Linie) jede Minute auffrischen
  window.setInterval(() => { if (!U.modal && !U.edit) render() }, 60000)
}
