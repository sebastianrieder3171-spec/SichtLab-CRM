// Supabase-Projekt (Project Settings -> API Keys). Der Publishable Key ist für den Browser gedacht;
// geschützt sind die Daten durch Login und die Zugriffsregeln in supabase/schema.sql.
// Über VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY lässt sich ein anderes Projekt setzen,
// VITE_DEMO=1 startet den Demo-Modus ohne Datenbank.
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL || 'https://exlkhnfxfnmqkctmzqzb.supabase.co'
export const SUPABASE_ANON_KEY: string = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_QQfKrTlY8LNf7KZJha_j7A_gq5CgslS'
export const DEMO = import.meta.env.VITE_DEMO === '1' || !SUPABASE_URL || !SUPABASE_ANON_KEY
