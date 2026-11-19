-- Pilotage budget — schéma initial
-- À exécuter une fois dans Supabase : SQL Editor > New query > coller > Run.
-- Principe : chaque compte appartient à un « foyer ». Toutes les données de courses
-- sont rattachées au foyer, et seuls ses membres peuvent les lire ou les modifier.
-- Les données bancaires ne sont PAS stockées ici (elles restent sur le téléphone).

create extension if not exists pgcrypto;

-- ---------- Foyers et membres ----------
create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Mon foyer',
  invite_code text not null unique default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null default '',
  role text not null default 'membre' check (role in ('admin','membre')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- Vrai si l'utilisateur connecté est membre du foyer (utilisé par toutes les règles d'accès)
create or replace function public.is_member(hid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.household_members m where m.household_id = hid and m.user_id = auth.uid());
$$;

-- Créer un foyer et en devenir administrateur
create or replace function public.create_household(p_name text, p_display_name text)
returns public.households language plpgsql security definer set search_path = public as $$
declare h public.households;
begin
  if auth.uid() is null then raise exception 'non connecté'; end if;
  insert into public.households(name, created_by) values (coalesce(nullif(trim(p_name),''),'Mon foyer'), auth.uid()) returning * into h;
  insert into public.household_members(household_id, user_id, display_name, role) values (h.id, auth.uid(), coalesce(p_display_name,''), 'admin');
  return h;
end $$;

-- Rejoindre un foyer avec son code d'invitation
create or replace function public.join_household(p_code text, p_display_name text)
returns public.households language plpgsql security definer set search_path = public as $$
declare h public.households;
begin
  if auth.uid() is null then raise exception 'non connecté'; end if;
  select * into h from public.households where invite_code = upper(trim(p_code));
  if h.id is null then raise exception 'code inconnu'; end if;
  if (select count(*) from public.household_members where household_id = h.id) >= 6 then raise exception 'foyer complet'; end if;
  insert into public.household_members(household_id, user_id, display_name) values (h.id, auth.uid(), coalesce(p_display_name,''))
  on conflict (household_id, user_id) do update set display_name = excluded.display_name;
  return h;
end $$;

alter table public.households enable row level security;
alter table public.household_members enable row level security;

drop policy if exists "membres lisent leur foyer" on public.households;
create policy "membres lisent leur foyer" on public.households for select using (public.is_member(id));
drop policy if exists "admin renomme le foyer" on public.households;
create policy "admin renomme le foyer" on public.households for update using (
  exists (select 1 from public.household_members m where m.household_id = id and m.user_id = auth.uid() and m.role = 'admin'));

drop policy if exists "membres se voient" on public.household_members;
create policy "membres se voient" on public.household_members for select using (public.is_member(household_id));
drop policy if exists "chacun modifie son nom" on public.household_members;
create policy "chacun modifie son nom" on public.household_members for update using (user_id = auth.uid());
drop policy if exists "chacun peut partir" on public.household_members;
create policy "chacun peut partir" on public.household_members for delete using (user_id = auth.uid());

-- ---------- Liste de courses partagée ----------
create table if not exists public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  qty text not null default '',
  rayon text not null default 'Autres',
  checked boolean not null default false,
  added_by uuid references auth.users(id) on delete set null,
  checked_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists shopping_items_household on public.shopping_items(household_id);

-- ---------- Tickets de caisse (vérifiés avant enregistrement) ----------
create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  store_brand text not null,            -- ex. E.Leclerc
  store_name text not null default '',  -- ex. E.Leclerc Ancenis
  store_osm_id text,
  purchased_on date not null,
  total numeric(10,2),
  fingerprint text not null,            -- enseigne + date + total : détecte un ticket importé deux fois
  status text not null default 'valide' check (status in ('a_verifier','valide')),
  bank_operation_ref text,              -- rapprochement avec une opération bancaire (référence locale, sans données bancaires)
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (household_id, fingerprint)
);

-- ---------- Relevés de prix (tickets du foyer et saisies manuelles) ----------
create table if not exists public.price_observations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  product_key text not null,            -- nom normalisé ou code-barres
  product_name text not null,
  ean text,
  store_brand text not null,
  store_name text not null default '',
  store_osm_id text,
  channel text not null default 'magasin' check (channel in ('magasin','drive')),
  price numeric(10,2) not null check (price >= 0),
  quantity numeric(10,3),               -- contenance d'une unité (g, ml ou pièces)
  unit text check (unit in ('g','ml','pc')),
  price_per_unit numeric(10,4),         -- € par kg, par litre ou par pièce
  observed_on date not null,
  source text not null check (source in ('ticket','manuel')),
  ticket_id uuid references public.tickets(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists price_obs_lookup on public.price_observations(household_id, product_key, store_brand, observed_on desc);

-- ---------- Menus et réglages du foyer ----------
create table if not exists public.menus (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  week_start date not null,
  data jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (household_id, week_start)
);

create table if not exists public.household_settings (
  household_id uuid primary key references public.households(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------- Recettes traduites (cache partagé, pour ne traduire qu'une fois) ----------
create table if not exists public.recipe_translations (
  source text not null,                 -- ex. themealdb
  source_id text not null,
  lang text not null default 'fr',
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (source, source_id, lang)
);

-- ---------- Règles d'accès : seuls les membres du foyer ----------
do $$
declare t text;
begin
  foreach t in array array['shopping_items','tickets','price_observations','menus','household_settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "foyer lit" on public.%I', t);
    execute format('create policy "foyer lit" on public.%I for select using (public.is_member(household_id))', t);
    execute format('drop policy if exists "foyer ajoute" on public.%I', t);
    execute format('create policy "foyer ajoute" on public.%I for insert with check (public.is_member(household_id))', t);
    execute format('drop policy if exists "foyer modifie" on public.%I', t);
    execute format('create policy "foyer modifie" on public.%I for update using (public.is_member(household_id)) with check (public.is_member(household_id))', t);
    execute format('drop policy if exists "foyer supprime" on public.%I', t);
    execute format('create policy "foyer supprime" on public.%I for delete using (public.is_member(household_id))', t);
  end loop;
end $$;

alter table public.recipe_translations enable row level security;
drop policy if exists "connectés lisent" on public.recipe_translations;
create policy "connectés lisent" on public.recipe_translations for select using (auth.uid() is not null);
drop policy if exists "connectés ajoutent" on public.recipe_translations;
create policy "connectés ajoutent" on public.recipe_translations for insert with check (auth.uid() is not null);

-- Mise à jour automatique de updated_at
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists shopping_items_touch on public.shopping_items;
create trigger shopping_items_touch before update on public.shopping_items for each row execute function public.touch_updated_at();

-- Liste de courses en direct entre les téléphones
do $$ begin
  alter publication supabase_realtime add table public.shopping_items;
exception when duplicate_object then null; end $$;

-- Petite fonction appelée chaque jour par GitHub pour éviter la mise en pause du projet gratuit
create or replace function public.ping() returns text language sql security definer as $$ select 'ok'::text $$;
grant execute on function public.ping() to anon, authenticated;
grant execute on function public.create_household(text, text) to authenticated;
grant execute on function public.join_household(text, text) to authenticated;
