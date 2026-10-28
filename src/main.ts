import './styles.css'
import { registerSW } from 'virtual:pwa-register'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { DEMO, SUPABASE_ANON_KEY, SUPABASE_URL } from './config'
import * as store from './store'
import * as L from './local'
import { Sync } from './sync'
import { mount, render } from './ui'
import { seedDemo } from './demo'
import { esc } from './util'

registerSW({ immediate: true })
const app = document.getElementById('app')!

async function boot() {
  try { await store.loadLocal() } catch (e) { console.error('Lokaler Speicher nicht verfügbar', e) }
  if (DEMO) {
    let seeded = false
    try { seeded = !!localStorage.getItem('sf_demo_seeded') } catch { /* egal */ }
    if (!store.count('firmen') && !seeded) { seedDemo(); try { localStorage.setItem('sf_demo_seeded', '1') } catch { /* egal */ } }
    mount(app, { email: '', demo: true, sync: () => ({ s: 'offline', err: '' }), syncNow() {}, logout() {} })
    return
  }
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  let recovery = false
  client.auth.onAuthStateChange(ev => {
    if (ev === 'PASSWORD_RECOVERY') { recovery = true; showNewPassword(client) }
    if (ev === 'SIGNED_OUT') location.reload()
  })
  const { data } = await client.auth.getSession()
  if (recovery) return
  if (!data.session) return showLogin(client)
  startApp(client, data.session.user.email || '')
}

function startApp(client: SupabaseClient, email: string) {
  const sync = new Sync(client, () => render())
  mount(app, {
    email, demo: false,
    sync: () => ({ s: sync.status, err: sync.lastError }),
    syncNow: () => { sync.kick(0); sync.pull() },
    logout: async () => {
      sync.stop()
      await L.clearAll()
      await client.auth.signOut()
      location.reload()
    }
  })
  sync.start()
}

function showLogin(client: SupabaseClient, msg = '') {
  app.innerHTML = '<div class="login"><form class="loginbox" id="lf"><h1>SICHTFAKTOR CRM</h1><div class="small">Mit deinem Team-Zugang anmelden.</div>' +
    '<input id="lf-mail" type="email" autocomplete="username" placeholder="E-Mail" required>' +
    '<input id="lf-pw" type="password" autocomplete="current-password" placeholder="Passwort" required>' +
    '<div class="err" id="lf-err">' + esc(msg) + '</div><button class="primary" type="submit">Anmelden</button>' +
    '<button class="ghost" type="button" id="lf-forgot" style="justify-content:center">Passwort vergessen</button></form></div>'
  const err = (t: string) => { document.getElementById('lf-err')!.textContent = t }
  document.getElementById('lf')!.addEventListener('submit', async e => {
    e.preventDefault()
    const email = (document.getElementById('lf-mail') as HTMLInputElement).value.trim()
    const password = (document.getElementById('lf-pw') as HTMLInputElement).value
    err('Anmeldung läuft …')
    const { data, error } = await client.auth.signInWithPassword({ email, password })
    if (error || !data.session) { err(error?.message === 'Invalid login credentials' ? 'E-Mail oder Passwort stimmt nicht.' : 'Anmeldung fehlgeschlagen: ' + (error?.message || 'unbekannt')); return }
    await L.clearAll(); await store.loadLocal()
    startApp(client, data.session.user.email || email)
  })
  document.getElementById('lf-forgot')!.addEventListener('click', async () => {
    const email = (document.getElementById('lf-mail') as HTMLInputElement).value.trim()
    if (!email) { err('Bitte zuerst die E-Mail-Adresse eintragen.'); return }
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: location.origin + import.meta.env.BASE_URL })
    err(error ? 'Das hat nicht geklappt: ' + error.message : 'Wir haben dir einen Link zum Zurücksetzen geschickt.')
  })
}

function showNewPassword(client: SupabaseClient) {
  app.innerHTML = '<div class="login"><form class="loginbox" id="np"><h1>Neues Passwort</h1><input id="np-pw" type="password" autocomplete="new-password" placeholder="Neues Passwort (mind. 8 Zeichen)" minlength="8" required><div class="err" id="np-err"></div><button class="primary" type="submit">Speichern</button></form></div>'
  document.getElementById('np')!.addEventListener('submit', async e => {
    e.preventDefault()
    const password = (document.getElementById('np-pw') as HTMLInputElement).value
    const { error } = await client.auth.updateUser({ password })
    if (error) { document.getElementById('np-err')!.textContent = 'Das hat nicht geklappt: ' + error.message; return }
    location.replace(location.origin + import.meta.env.BASE_URL)
  })
}

boot()
