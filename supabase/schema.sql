-- =====================================================================
-- DTF-Kalkulator – Datenbank für Supabase
-- Einmal komplett im Supabase-Dashboard unter „SQL Editor“ ausführen.
-- Mehrere Firmen (Mandanten) mit getrennten Daten; jede Firma hat
-- Mitglieder (Inhaber, Mitarbeiter). Wer was sehen darf, regelt die
-- Datenbank selbst über Row Level Security (RLS).
-- =====================================================================

-- ---------- Tabellen ----------
create table if not exists public.firmen (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(name) between 1 and 120),
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null default auth.uid()
);

create table if not exists public.mitglieder (
  firma_id    uuid not null references public.firmen(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  rolle       text not null default 'mitarbeiter' check (rolle in ('inhaber', 'mitarbeiter')),
  email       text,
  created_at  timestamptz not null default now(),
  primary key (firma_id, user_id)
);

create table if not exists public.einladungen (
  id          uuid primary key default gen_random_uuid(),
  firma_id    uuid not null references public.firmen(id) on delete cascade,
  email       text not null,
  rolle       text not null default 'mitarbeiter' check (rolle in ('inhaber', 'mitarbeiter')),
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  unique (firma_id, email)
);

-- Alle Daten der App: col = Sammlung (jobs, kunden, lager, vorlagen, bestellungen, textilfotos, config), id = Dokument
create table if not exists public.docs (
  firma_id    uuid not null references public.firmen(id) on delete cascade,
  col         text not null,
  id          text not null,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null default auth.uid(),
  primary key (firma_id, col, id)
);
create index if not exists docs_firma_col on public.docs (firma_id, col);

-- Fortlaufende Nummern (Angebote, Rechnungen …) pro Firma, Schlüssel und Jahr (Kunden: jahr = 0)
create table if not exists public.zaehler (
  firma_id    uuid not null references public.firmen(id) on delete cascade,
  schluessel  text not null,
  jahr        int  not null,
  wert        int  not null default 0,   -- zuletzt vergebene Nummer
  primary key (firma_id, schluessel, jahr)
);

-- ---------- Hilfsfunktionen (prüfen die Mitgliedschaft des angemeldeten Nutzers) ----------
create or replace function public.ist_mitglied(f uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from mitglieder where firma_id = f and user_id = auth.uid());
$$;

create or replace function public.ist_inhaber(f uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from mitglieder where firma_id = f and user_id = auth.uid() and rolle = 'inhaber');
$$;

-- ---------- Row Level Security ----------
alter table public.firmen      enable row level security;
alter table public.mitglieder  enable row level security;
alter table public.einladungen enable row level security;
alter table public.docs        enable row level security;
alter table public.zaehler     enable row level security;

drop policy if exists firmen_lesen on public.firmen;
create policy firmen_lesen on public.firmen for select using (public.ist_mitglied(id));
drop policy if exists firmen_aendern on public.firmen;
create policy firmen_aendern on public.firmen for update using (public.ist_inhaber(id)) with check (public.ist_inhaber(id));

drop policy if exists mitglieder_lesen on public.mitglieder;
create policy mitglieder_lesen on public.mitglieder for select using (public.ist_mitglied(firma_id));
drop policy if exists mitglieder_entfernen on public.mitglieder;
create policy mitglieder_entfernen on public.mitglieder for delete using (public.ist_inhaber(firma_id) or user_id = auth.uid());
drop policy if exists mitglieder_rolle on public.mitglieder;
create policy mitglieder_rolle on public.mitglieder for update using (public.ist_inhaber(firma_id)) with check (public.ist_inhaber(firma_id));

drop policy if exists einladungen_lesen on public.einladungen;
create policy einladungen_lesen on public.einladungen for select
  using (public.ist_inhaber(firma_id) or lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
drop policy if exists einladungen_anlegen on public.einladungen;
create policy einladungen_anlegen on public.einladungen for insert with check (public.ist_inhaber(firma_id));
drop policy if exists einladungen_loeschen on public.einladungen;
create policy einladungen_loeschen on public.einladungen for delete using (public.ist_inhaber(firma_id));

drop policy if exists docs_lesen on public.docs;
create policy docs_lesen on public.docs for select using (public.ist_mitglied(firma_id));
drop policy if exists docs_anlegen on public.docs;
create policy docs_anlegen on public.docs for insert with check (public.ist_mitglied(firma_id));
drop policy if exists docs_aendern on public.docs;
create policy docs_aendern on public.docs for update using (public.ist_mitglied(firma_id)) with check (public.ist_mitglied(firma_id));
drop policy if exists docs_loeschen on public.docs;
create policy docs_loeschen on public.docs for delete using (public.ist_mitglied(firma_id));

drop policy if exists zaehler_lesen on public.zaehler;
create policy zaehler_lesen on public.zaehler for select using (public.ist_mitglied(firma_id));
-- Schreiben nur über die Funktionen unten

-- ---------- Funktionen, die die App aufruft ----------
-- Neue Firma anlegen; der Aufrufer wird Inhaber
create or replace function public.firma_anlegen(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare f uuid;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  insert into firmen (name, created_by) values (trim(p_name), auth.uid()) returning id into f;
  insert into mitglieder (firma_id, user_id, rolle, email) values (f, auth.uid(), 'inhaber', auth.jwt() ->> 'email');
  return f;
end $$;

-- Alle Einladungen an die eigene E-Mail-Adresse annehmen; gibt die Anzahl zurück
create or replace function public.einladungen_annehmen() returns int
language plpgsql security definer set search_path = public as $$
declare mail text := lower(coalesce(auth.jwt() ->> 'email', '')); n int := 0; e record;
begin
  if auth.uid() is null or mail = '' then return 0; end if;
  for e in select * from einladungen where lower(email) = mail loop
    insert into mitglieder (firma_id, user_id, rolle, email) values (e.firma_id, auth.uid(), e.rolle, mail)
      on conflict (firma_id, user_id) do nothing;
    delete from einladungen where id = e.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Nächste Nummer atomar vergeben (keine doppelten Rechnungsnummern, auch bei mehreren Geräten gleichzeitig)
create or replace function public.naechste_nummer(f uuid, p_schluessel text, p_jahr int) returns int
language plpgsql security definer set search_path = public as $$
declare w int;
begin
  if not public.ist_mitglied(f) then raise exception 'Kein Zugriff'; end if;
  insert into zaehler (firma_id, schluessel, jahr, wert) values (f, p_schluessel, p_jahr, 1)
    on conflict (firma_id, schluessel, jahr) do update set wert = zaehler.wert + 1
    returning wert into w;
  return w;
end $$;

-- Zählerstand setzen (beim Umzug der Daten aus dem Browser; nur Inhaber, nur erhöhen)
create or replace function public.zaehler_setzen(f uuid, p_schluessel text, p_jahr int, p_wert int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.ist_inhaber(f) then raise exception 'Nur für Inhaber'; end if;
  insert into zaehler (firma_id, schluessel, jahr, wert) values (f, p_schluessel, p_jahr, p_wert)
    on conflict (firma_id, schluessel, jahr) do update set wert = greatest(zaehler.wert, excluded.wert);
end $$;

-- Nur angemeldete Nutzer dürfen die Funktionen aufrufen
revoke all on function public.firma_anlegen(text) from public, anon;
revoke all on function public.einladungen_annehmen() from public, anon;
revoke all on function public.naechste_nummer(uuid, text, int) from public, anon;
revoke all on function public.zaehler_setzen(uuid, text, int, int) from public, anon;
grant execute on function public.firma_anlegen(text) to authenticated;
grant execute on function public.einladungen_annehmen() to authenticated;
grant execute on function public.naechste_nummer(uuid, text, int) to authenticated;
grant execute on function public.zaehler_setzen(uuid, text, int, int) to authenticated;

-- ---------- Live-Abgleich zwischen Geräten (Realtime) ----------
alter table public.docs replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.docs;
exception when duplicate_object then null; end $$;
