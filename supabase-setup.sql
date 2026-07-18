-- ============================================================
--  TEMPO — Configurazione database Supabase (v2)
--  Incolla TUTTO questo testo nel SQL Editor di Supabase e premi RUN.
--  È sicuro rieseguirlo più volte: NON cancella i dati esistenti.
--  Se avevi già la versione 1, questo script aggiorna senza perdite.
-- ============================================================

-- ---------- 1. TABELLE ----------

create table if not exists public.clients (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text,
  role        text not null default 'member',
  active      boolean not null default true,
  hourly_rate numeric,
  created_at  timestamptz not null default now()
);

alter table public.profiles add column if not exists cost_rate numeric;
alter table public.profiles add column if not exists contracted_hours_weekly numeric;
alter table public.profiles add column if not exists weekly_goal_hours numeric; -- obiettivo personale, modificabile dall'utente stesso

create table if not exists public.projects (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  color            text default '#27264d',
  billable_default boolean not null default false,
  archived         boolean not null default false,
  created_at       timestamptz not null default now()
);

alter table public.projects add column if not exists client_id uuid references public.clients(id) on delete set null;
alter table public.projects add column if not exists estimated_seconds integer;
alter table public.projects add column if not exists budget_seconds integer; -- budget ore totale (opzionale)

create table if not exists public.project_finance (
  project_id    uuid primary key references public.projects(id) on delete cascade,
  billable_rate numeric
);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'projects' and column_name = 'hourly_rate'
  ) then
    insert into public.project_finance (project_id, billable_rate)
    select id, hourly_rate from public.projects where hourly_rate is not null
    on conflict (project_id) do nothing;
    alter table public.projects drop column hourly_rate;
  end if;
end $$;

create table if not exists public.time_entries (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id       uuid references public.projects(id) on delete set null,
  description      text default '',
  started_at       timestamptz not null,
  stopped_at       timestamptz,
  duration_seconds integer,
  billable         boolean not null default false,
  tags             text[] not null default '{}',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Campi per la funzione "pausa" del timer (aggiunti solo se mancano):
alter table public.time_entries add column if not exists paused_at timestamptz;
alter table public.time_entries add column if not exists paused_seconds integer not null default 0;

create table if not exists public.favorites (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id  uuid references public.projects(id) on delete set null,
  description text default '',
  tags        text[] not null default '{}',
  created_at  timestamptz not null default now()
);

create index if not exists time_entries_user_idx on public.time_entries(user_id);
create index if not exists time_entries_started_idx on public.time_entries(started_at);
create index if not exists favorites_user_idx on public.favorites(user_id);
create index if not exists projects_client_idx on public.projects(client_id);

-- ---------- 2. FUNZIONI DI SUPPORTO ----------

create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_active()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active = true);
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    'member'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.protect_profile_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    if new.role is distinct from old.role
       or new.active is distinct from old.active
       or new.cost_rate is distinct from old.cost_rate
       or new.contracted_hours_weekly is distinct from old.contracted_hours_weekly
       or new.hourly_rate is distinct from old.hourly_rate then
      raise exception 'Non autorizzato a modificare questi campi del profilo';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_role on public.profiles;
drop trigger if exists protect_profile on public.profiles;
create trigger protect_profile
  before update on public.profiles
  for each row execute function public.protect_profile_fields();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists time_entries_touch on public.time_entries;
create trigger time_entries_touch
  before update on public.time_entries
  for each row execute function public.touch_updated_at();

-- ---------- 3. SICUREZZA (RLS) ----------

alter table public.profiles        enable row level security;
alter table public.projects        enable row level security;
alter table public.project_finance enable row level security;
alter table public.clients         enable row level security;
alter table public.time_entries    enable row level security;
alter table public.favorites       enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects
  for select using (auth.uid() is not null);

drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects
  for insert with check (public.is_admin());

drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects
  for delete using (public.is_admin());

drop policy if exists finance_all on public.project_finance;
create policy finance_all on public.project_finance
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists clients_all on public.clients;
create policy clients_all on public.clients
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists entries_select on public.time_entries;
create policy entries_select on public.time_entries
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists entries_insert on public.time_entries;
create policy entries_insert on public.time_entries
  for insert with check (user_id = auth.uid() and public.is_active());

drop policy if exists entries_update on public.time_entries;
create policy entries_update on public.time_entries
  for update using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

drop policy if exists entries_delete on public.time_entries;
create policy entries_delete on public.time_entries
  for delete using (user_id = auth.uid() or public.is_admin());

drop policy if exists favorites_all on public.favorites;
create policy favorites_all on public.favorites
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================
--  FERIE E GIORNI DI CHIUSURA (aggiunto in Kesia Time v8)
--  Non distruttivo: crea le tabelle solo se non esistono.
-- ============================================================

create table if not exists public.time_off (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  note text,
  status text not null default 'pending',   -- pending | approved | rejected
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  created_at timestamptz default now()
);
alter table public.time_off enable row level security;

drop policy if exists timeoff_select on public.time_off;
create policy timeoff_select on public.time_off
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists timeoff_insert on public.time_off;
create policy timeoff_insert on public.time_off
  for insert with check (user_id = auth.uid() and public.is_active());

drop policy if exists timeoff_update on public.time_off;
create policy timeoff_update on public.time_off
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists timeoff_delete on public.time_off;
create policy timeoff_delete on public.time_off
  for delete using ((user_id = auth.uid() and status = 'pending') or public.is_admin());

-- Giorni rossi comuni (feste, chiusure aziendali). Sab/dom sono gestiti dall'app.
create table if not exists public.closures (
  id uuid primary key default gen_random_uuid(),
  day date not null unique,
  label text,
  created_at timestamptz default now()
);
alter table public.closures enable row level security;

drop policy if exists closures_select on public.closures;
create policy closures_select on public.closures
  for select using (auth.uid() is not null);

drop policy if exists closures_all on public.closures;
create policy closures_all on public.closures
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
--  FATTO. Database pronto e sicuro.
--
--  ULTIMO PASSO — diventare amministratore:
--  1) Crea il tuo account (Authentication -> Users -> Add user),
--     spuntando "Auto Confirm User".
--  2) Esegui questa riga (con la tua email):
--
--     update public.profiles set role = 'admin'
--     where id = (select id from auth.users where email = 'TUA-EMAIL@esempio.it');
-- ============================================================
