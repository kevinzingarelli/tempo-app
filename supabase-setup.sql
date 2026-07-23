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
alter table public.profiles add column if not exists annual_leave_days numeric; -- monte ferie annuo (giorni), impostato dall'admin
-- Monte ANNUO di ferie e permessi in ORE (per il calcolo maturato/residuo
-- preciso, aggiunto in v19). Se presenti, hanno precedenza su annual_leave_days.
alter table public.profiles add column if not exists annual_leave_hours numeric;   -- ore ferie/anno
alter table public.profiles add column if not exists annual_permit_hours numeric;  -- ore permessi (ROL)/anno
alter table public.profiles add column if not exists work_hours_per_day numeric;    -- ore lavorative al giorno (per convertire g<->h)

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
-- Nota interna per singola voce (es. dettagli per il cliente):
alter table public.time_entries add column if not exists note text;

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
       or new.annual_leave_days is distinct from old.annual_leave_days
       or new.annual_leave_hours is distinct from old.annual_leave_hours
       or new.annual_permit_hours is distinct from old.annual_permit_hours
       or new.work_hours_per_day is distinct from old.work_hours_per_day
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

-- I clienti (solo il NOME) sono visibili a tutti gli utenti attivi: serve
-- ai dipendenti per sapere su quale cliente stanno lavorando e per cercarli.
-- I dati economici NON stanno qui (sono in project_finance, solo admin).
drop policy if exists clients_all on public.clients;
drop policy if exists clients_select on public.clients;
drop policy if exists clients_write on public.clients;
create policy clients_select on public.clients
  for select using (public.is_active());
create policy clients_write on public.clients
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

-- Categoria di assenza (aggiunto in Boschetto v12). Default 'ferie' per
-- non alterare i dati esistenti. Valori: ferie | permesso | malattia.
alter table public.time_off add column if not exists kind text not null default 'ferie';

drop policy if exists timeoff_select on public.time_off;
create policy timeoff_select on public.time_off
  for select using (user_id = auth.uid() or public.is_admin());

-- v27: un admin può inserire un'assenza (già approvata) per conto di
-- un'altra persona. Prima l'insert era permesso solo su sé stessi.
drop policy if exists timeoff_insert on public.time_off;
create policy timeoff_insert on public.time_off
  for insert with check ((user_id = auth.uid() and public.is_active()) or public.is_admin());

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
--  AVVISI BLOCCANTI (es. chiusura aziendale) — aggiunto in Boschetto v26.
--  Un admin crea un avviso; ogni utente deve "confermare" (ack) prima che
--  il pop-up sparisca. Non distruttivo: crea solo se non esiste.
-- ============================================================
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);
alter table public.announcements enable row level security;

drop policy if exists announcements_select on public.announcements;
create policy announcements_select on public.announcements
  for select using (auth.uid() is not null);

drop policy if exists announcements_write on public.announcements;
create policy announcements_write on public.announcements
  for all using (public.is_admin()) with check (public.is_admin());

create table if not exists public.announcement_acks (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  acked_at timestamptz default now(),
  primary key (announcement_id, user_id)
);
alter table public.announcement_acks enable row level security;

drop policy if exists announcement_acks_select on public.announcement_acks;
create policy announcement_acks_select on public.announcement_acks
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists announcement_acks_insert on public.announcement_acks;
create policy announcement_acks_insert on public.announcement_acks
  for insert with check (user_id = auth.uid());

-- ============================================================
--  SALDI FERIE CONFERMATI MESE PER MESE — aggiunto in Boschetto v26.
--  Ogni riga rappresenta il saldo ferie di una persona CONFERMATO
--  dall'admin all'inizio di un mese ("period" = primo giorno del mese).
--  L'app propone il saldo del mese successivo (maturato - preso), l'admin
--  conferma o corregge. E' una stima gestionale: il saldo ufficiale resta
--  quello del consulente del lavoro. Non distruttivo.
-- ============================================================
create table if not exists public.leave_checkpoints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  period date not null, -- primo giorno del mese a cui si riferisce il saldo
  opening_days numeric not null, -- giorni residui confermati all'inizio di questo mese
  accrued_days numeric default 0, -- maturato nel mese precedente (informativo)
  used_days numeric default 0, -- ferie approvate nel mese precedente (informativo)
  note text,
  confirmed_by uuid references public.profiles(id),
  confirmed_at timestamptz default now(),
  created_at timestamptz default now(),
  unique (user_id, period)
);
alter table public.leave_checkpoints enable row level security;

drop policy if exists leave_checkpoints_select on public.leave_checkpoints;
create policy leave_checkpoints_select on public.leave_checkpoints
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists leave_checkpoints_write on public.leave_checkpoints;
create policy leave_checkpoints_write on public.leave_checkpoints
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
--  NOTE SETTIMANALI ADMIN + BLOCCO PERIODI (aggiunto in Boschetto)
--  Non distruttivo: crea solo se non esiste.
-- ============================================================

create table if not exists public.team_notes (
  id uuid primary key default gen_random_uuid(),
  week_start date not null unique,
  content text not null default '',
  updated_by uuid references auth.users(id),
  updated_at timestamptz default now()
);
alter table public.team_notes enable row level security;

drop policy if exists team_notes_select on public.team_notes;
create policy team_notes_select on public.team_notes
  for select using (auth.uid() is not null);

drop policy if exists team_notes_all on public.team_notes;
create policy team_notes_all on public.team_notes
  for all using (public.is_admin()) with check (public.is_admin());

-- Riga unica: data fino a cui le voci sono "chiuse" (approvate).
-- I dipendenti non possono più modificarle/eliminarle; l'admin sì.
create table if not exists public.time_lock (
  id boolean primary key default true,
  locked_until date,
  constraint time_lock_single_row check (id = true)
);
alter table public.time_lock enable row level security;

drop policy if exists time_lock_select on public.time_lock;
create policy time_lock_select on public.time_lock
  for select using (auth.uid() is not null);

drop policy if exists time_lock_all on public.time_lock;
create policy time_lock_all on public.time_lock
  for all using (public.is_admin()) with check (public.is_admin());

insert into public.time_lock (id, locked_until) values (true, null)
  on conflict (id) do nothing;

-- Le policy di time_entries ora rispettano il blocco: il proprietario
-- può modificare/eliminare solo le voci NON ancora bloccate; l'admin sempre.
drop policy if exists entries_update on public.time_entries;
create policy entries_update on public.time_entries
  for update using (
    public.is_admin()
    or (user_id = auth.uid() and started_at::date > coalesce((select locked_until from public.time_lock limit 1), '1900-01-01'::date))
  )
  with check (
    public.is_admin()
    or (user_id = auth.uid() and started_at::date > coalesce((select locked_until from public.time_lock limit 1), '1900-01-01'::date))
  );

drop policy if exists entries_delete on public.time_entries;
create policy entries_delete on public.time_entries
  for delete using (
    public.is_admin()
    or (user_id = auth.uid() and started_at::date > coalesce((select locked_until from public.time_lock limit 1), '1900-01-01'::date))
  );

-- ============================================================
--  GOOGLE CALENDAR (sola lettura) — aggiunto in Boschetto v10
--  Ogni utente collega il PROPRIO Google e vede i propri eventi
--  dentro Boschetto. Salviamo solo il necessario, per utente.
-- ============================================================

create table if not exists public.google_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  refresh_token text,
  access_token text,
  expiry timestamptz,
  email text,
  connected_at timestamptz default now()
);
alter table public.google_tokens enable row level security;

-- Ognuno vede/gestisce SOLO il proprio token. Nessuno (nemmeno l'admin)
-- può leggere i token altrui: sono dati personali di accesso.
drop policy if exists google_tokens_own on public.google_tokens;
create policy google_tokens_own on public.google_tokens
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================
--  COLLEGAMENTO EVENTI GOOGLE -> VOCI (aggiunto in Boschetto v11)
--  Ricorda quali eventi del calendario sono già stati registrati
--  come voce di lavoro, e con quale progetto (per proporlo la
--  prossima volta). Dati personali: ognuno vede solo i propri.
-- ============================================================

create table if not exists public.calendar_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  google_event_id text not null,
  entry_id uuid references public.time_entries(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  event_title text,
  created_at timestamptz default now(),
  unique (user_id, google_event_id)
);
alter table public.calendar_links enable row level security;

drop policy if exists calendar_links_own on public.calendar_links;
create policy calendar_links_own on public.calendar_links
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================
--  CONTROLLO DI GESTIONE — COSTO PERSONALE (Boschetto v13, Blocco B)
--
--  IMPORTANTE PRIVACY/RUOLI: tutti i dati di costo sono visibili
--  SOLO agli admin (Kevin, Asia). I dipendenti non vedono mai il
--  proprio costo aziendale né i margini. Garantito da RLS qui sotto.
-- ============================================================

-- Componenti del costo aziendale per persona, con storico nel tempo.
-- Il costo può cambiare (aumenti, straordinari); teniamo la data di
-- validità così lo storico resta corretto. La riga con valid_from più
-- recente (<= oggi) è quella attiva.
create table if not exists public.staff_cost (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  valid_from date not null default current_date,
  -- Modalità A: costo orario già pronto (es. 31 €/h)
  cost_per_hour numeric,
  -- Modalità B: componenti annui (l'app calcola il costo orario teorico)
  annual_gross numeric,          -- RAL / retribuzione lorda annua
  contrib_pct numeric,           -- % contributi a carico azienda (es. 24)
  tfr_pct numeric,               -- % TFR (es. 7.4)
  other_annual numeric,          -- altri costi annui (assicurazioni, ecc.)
  -- ore lavorabili annue da contratto (per il costo orario teorico)
  workable_hours_year numeric,
  note text,
  created_at timestamptz default now()
);
alter table public.staff_cost enable row level security;

-- SOLO admin: né select né modifica per i non-admin.
drop policy if exists staff_cost_admin on public.staff_cost;
create policy staff_cost_admin on public.staff_cost
  for all using (public.is_admin()) with check (public.is_admin());

-- Ore pianificate sui progetti (accanto a estimated_seconds già esistente).
alter table public.projects add column if not exists planned_seconds integer;

-- Flag "contenitore overhead": progetti interni/studio le cui ore sono
-- costi generali da ribaltare sui clienti (es. "Interno/Studio").
alter table public.projects add column if not exists is_overhead boolean not null default false;

-- ============================================================
--  INTEGRAZIONE ZOHO CRM (Boschetto v14, Blocco C)
--
--  Il collegamento a Zoho è UNICO per l'azienda (non per persona, a
--  differenza di Google Calendar): un admin lo collega una volta e
--  tutti gli admin possono importare le opportunità.
-- ============================================================

-- Token OAuth Zoho (una sola riga per l'azienda: id fisso 'company').
create table if not exists public.zoho_tokens (
  id text primary key default 'company',
  access_token text,
  refresh_token text,
  expiry timestamptz,
  connected_by uuid references auth.users(id),
  connected_at timestamptz default now()
);
alter table public.zoho_tokens enable row level security;

drop policy if exists zoho_tokens_admin on public.zoho_tokens;
create policy zoho_tokens_admin on public.zoho_tokens
  for all using (public.is_admin()) with check (public.is_admin());

-- Opportunità importate da Zoho CRM (Deals), collegate ai nostri
-- clienti/progetti. Il valore economico resta quello di Zoho: qui non
-- lo ricalcoliamo, lo leggiamo per il margine di commessa.
create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  zoho_deal_id text unique,
  title text not null,
  account_name text,             -- nome cliente su Zoho (per il match)
  client_id uuid references public.clients(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  amount numeric,                 -- imponibile (dal Deal)
  vat_pct numeric default 22,     -- aliquota IVA presunta
  currency text default 'EUR',
  stage text,                     -- fase Zoho (es. "Chiusa vinta")
  closing_date date,
  margin_target_pct numeric,      -- margine-obiettivo impostato da noi
  imported_at timestamptz default now(),
  imported_by uuid references auth.users(id),
  created_at timestamptz default now()
);
alter table public.opportunities enable row level security;

-- Solo admin: le opportunità mostrano valori economici.
drop policy if exists opportunities_admin on public.opportunities;
create policy opportunities_admin on public.opportunities
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

-- ============================================================
--  TASK ADMIN GAMIFICATI (v30) — solo Kevin e Asia.
--  Task con scadenza, priorità, passi di avanzamento (checklist) e
--  assegnazione reciproca tra admin. Non distruttivo: crea solo se manca.
-- ============================================================
create table if not exists public.admin_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  notes text,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_by uuid references auth.users(id),
  due_date date,
  priority text not null default 'media',   -- bassa | media | alta
  steps jsonb not null default '[]'::jsonb, -- [{id, text, done}]
  status text not null default 'open',      -- open | done
  completed_at timestamptz,
  created_at timestamptz default now()
);
alter table public.admin_tasks enable row level security;

drop policy if exists admin_tasks_all on public.admin_tasks;
create policy admin_tasks_all on public.admin_tasks
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
--  ERRORI CLIENT (v30) — l'app registra gli errori JavaScript che
--  capitano agli utenti, così gli admin li vedono in Dashboard invece
--  di scoprirli per sentito dire. Scrittura: ogni utente loggato.
--  Lettura: solo admin.
-- ============================================================
create table if not exists public.client_errors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  message text,
  stack text,
  url text,
  user_agent text,
  created_at timestamptz default now()
);
alter table public.client_errors enable row level security;

drop policy if exists client_errors_insert on public.client_errors;
create policy client_errors_insert on public.client_errors
  for insert with check (auth.uid() is not null);

drop policy if exists client_errors_select on public.client_errors;
create policy client_errors_select on public.client_errors
  for select using (public.is_admin());
