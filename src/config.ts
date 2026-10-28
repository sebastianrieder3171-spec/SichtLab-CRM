// Werte aus Supabase (Project Settings -> API). Der anon key ist für den Browser gedacht;
// geschützt sind die Daten durch die Zugriffsregeln in supabase/schema.sql.
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL || ''
export const SUPABASE_ANON_KEY: string = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
export const DEMO = !SUPABASE_URL || !SUPABASE_ANON_KEY
