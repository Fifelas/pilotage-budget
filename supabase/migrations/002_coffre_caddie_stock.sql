-- Pilotage budget — version 0.3.0
-- À exécuter une fois dans Supabase : SQL Editor → New query → coller → Run.
-- Peut être relancé sans risque.

-- ---------- Coffre chiffré du foyer ----------
-- Le budget (relevés, paie, prêt, saisies) est chiffré SUR LE TÉLÉPHONE (AES-GCM 256 bits,
-- clé dérivée de la phrase secrète du foyer par PBKDF2). Supabase ne reçoit qu'un bloc illisible :
-- ni la phrase, ni la clé, ni les montants ne quittent les téléphones en clair.
create table if not exists public.household_vault (
  household_id uuid primary key references public.households(id) on delete cascade,
  salt text not null,                    -- sel aléatoire (public, sert à dériver la clé)
  iv text not null,                      -- vecteur d'initialisation aléatoire du dernier envoi
  data text not null check (length(data) < 8000000),   -- données chiffrées (base64)
  rev bigint not null default 1,         -- numéro de version, pour ne jamais écraser une mise à jour de l'autre
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.household_vault enable row level security;
drop policy if exists "foyer lit" on public.household_vault;
create policy "foyer lit" on public.household_vault for select using (public.is_member(household_id));
-- Écriture uniquement par la fonction ci-dessous (contrôle de version)
drop policy if exists "foyer ajoute" on public.household_vault;
create policy "foyer ajoute" on public.household_vault for insert with check (public.is_member(household_id));
drop policy if exists "foyer modifie" on public.household_vault;
create policy "foyer modifie" on public.household_vault for update using (public.is_member(household_id)) with check (public.is_member(household_id));

-- Envoie une nouvelle version seulement si personne n'a écrit entre-temps.
-- Renvoie le nouveau numéro de version, ou -1 s'il faut d'abord récupérer la version de l'autre.
create or replace function public.vault_put(hid uuid, p_salt text, p_iv text, p_data text, p_rev bigint)
returns bigint language plpgsql security invoker as $$
declare r bigint;
begin
  if not public.is_member(hid) then raise exception 'Accès refusé'; end if;
  if p_rev = 0 then
    insert into public.household_vault(household_id, salt, iv, data, rev, updated_by)
    values (hid, p_salt, p_iv, p_data, 1, auth.uid())
    on conflict (household_id) do nothing
    returning rev into r;
    return coalesce(r, -1);
  end if;
  update public.household_vault
     set salt = p_salt, iv = p_iv, data = p_data, rev = rev + 1, updated_by = auth.uid(), updated_at = now()
   where household_id = hid and rev = p_rev
  returning rev into r;
  return coalesce(r, -1);
end $$;
grant execute on function public.vault_put(uuid, text, text, text, bigint) to authenticated;

-- Remise à zéro du coffre (phrase secrète oubliée) : réservée aux membres
create or replace function public.vault_reset(hid uuid) returns void language plpgsql security invoker as $$
begin
  if not public.is_member(hid) then raise exception 'Accès refusé'; end if;
  delete from public.household_vault where household_id = hid;
end $$;
drop policy if exists "foyer supprime" on public.household_vault;
create policy "foyer supprime" on public.household_vault for delete using (public.is_member(household_id));
grant execute on function public.vault_reset(uuid) to authenticated;

-- ---------- Caddie en direct : prix et code-barres sur la liste partagée ----------
alter table public.shopping_items add column if not exists price numeric(10,2) check (price is null or price >= 0);
alter table public.shopping_items add column if not exists units integer not null default 1 check (units between 1 and 99);
alter table public.shopping_items add column if not exists barcode text;
alter table public.shopping_items add column if not exists brand text;

-- ---------- Stock anti-gaspi (frigo, congélateur, placard) ----------
create table if not exists public.pantry_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  qty text not null default '',
  place text not null default 'Frigo' check (place in ('Frigo','Congélateur','Placard')),
  expires_on date,
  barcode text,
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pantry_household on public.pantry_items(household_id, expires_on);
alter table public.pantry_items enable row level security;
drop policy if exists "foyer lit" on public.pantry_items;
create policy "foyer lit" on public.pantry_items for select using (public.is_member(household_id));
drop policy if exists "foyer ajoute" on public.pantry_items;
create policy "foyer ajoute" on public.pantry_items for insert with check (public.is_member(household_id));
drop policy if exists "foyer modifie" on public.pantry_items;
create policy "foyer modifie" on public.pantry_items for update using (public.is_member(household_id)) with check (public.is_member(household_id));
drop policy if exists "foyer supprime" on public.pantry_items;
create policy "foyer supprime" on public.pantry_items for delete using (public.is_member(household_id));
drop trigger if exists pantry_touch on public.pantry_items;
create trigger pantry_touch before update on public.pantry_items for each row execute function public.touch_updated_at();

-- ---------- Temps réel entre les deux téléphones ----------
do $$ begin alter publication supabase_realtime add table public.household_vault; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.pantry_items; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.household_settings; exception when duplicate_object then null; end $$;
