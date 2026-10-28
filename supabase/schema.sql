-- SICHTFAKTOR Akquise-CRM: Datenbank-Schema
-- Einmalig im Supabase-Dashboard unter "SQL Editor" einfügen und ausführen.
-- Vorher in der letzten Zeile die eigene E-Mail-Adresse eintragen.

-- Teammitglieder: nur diese E-Mail-Adressen sehen und ändern Daten.
create table if not exists public.team (
  email text primary key
);
alter table public.team enable row level security;
-- Keine Policy auf team: die Tabelle ist nur über das Dashboard änderbar.

create or replace function public.ist_team()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.team
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- Setzt Änderungszeit und Bearbeiter bei jedem Speichern (Grundlage für den Sync).
create or replace function public.setze_aenderung()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create table if not exists public.firmen (
  id uuid primary key,
  name text not null,
  branche text not null default '',
  ort text not null default '',
  bundesland text not null default '',
  adresse text not null default '',
  website text not null default '',
  email text not null default '',
  telefon text not null default '',
  person text not null default '',
  rolle text not null default '',
  status text not null default 'neu',
  prio text not null default 'B',
  umsatz numeric,
  hook text not null default '',
  anrufzeiten text[] not null default '{vm,nm}',
  gesperrt_bis date,
  quelle_url text not null default '',
  grundlage text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz
);

create table if not exists public.aufgaben (
  id uuid primary key,
  firma_id uuid references public.firmen(id),
  typ text not null default 'rueckruf',
  titel text not null default '',
  faellig_am timestamptz not null,
  erledigt_am timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz
);

create table if not exists public.aktivitaeten (
  id uuid primary key,
  firma_id uuid not null references public.firmen(id),
  typ text not null default 'notiz',
  ergebnis text not null default '',
  text text not null default '',
  dauer_sek integer not null default 0,
  zeitpunkt timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz
);

create table if not exists public.punkte (
  id uuid primary key,
  firma_id uuid not null references public.firmen(id),
  typ text not null default 'agenda',
  text text not null default '',
  erledigt boolean not null default false,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz
);

do $$
declare t text;
begin
  foreach t in array array['firmen','aufgaben','aktivitaeten','punkte'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists team_alles on public.%I', t);
    execute format('create policy team_alles on public.%I for all to authenticated using (public.ist_team()) with check (public.ist_team())', t);
    execute format('drop trigger if exists aenderung on public.%I', t);
    execute format('create trigger aenderung before insert or update on public.%I for each row execute function public.setze_aenderung()', t);
    execute format('create index if not exists %I on public.%I (updated_at)', t || '_updated_idx', t);
  end loop;
end $$;

create index if not exists aufgaben_firma_idx on public.aufgaben (firma_id);
create index if not exists aktivitaeten_firma_idx on public.aktivitaeten (firma_id);
create index if not exists punkte_firma_idx on public.punkte (firma_id);

-- Live-Updates zwischen Handy und Laptop
do $$
declare t text;
begin
  foreach t in array array['firmen','aufgaben','aktivitaeten','punkte'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Eigene E-Mail-Adresse eintragen (weitere Teammitglieder genauso):
insert into public.team (email) values ('DEINE-EMAIL@beispiel.at') on conflict do nothing;
