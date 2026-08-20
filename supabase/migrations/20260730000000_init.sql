-- P0 initial migration: SPEC.md §2.1 DDL + §2.2 RLS.
--
-- Important (CLAUDE.md core rule 1 / SPEC §2.3):
--   status, days_left, and effective_expiry are not columns. src/lib/expiry.ts computes them at runtime.
--   There is no status column, derived-state cache, or trigger that maintains derived state.
--   The items_updated_at trigger below maintains only the updated_at audit field.
--
-- Execution (SPEC.md §2): use the Dashboard SQL Editor or supabase db push, not supabase db reset.
-- Important (CLAUDE.md core rule 4):
--   Deletion is always soft deletion through consumed_at / discarded_at; history is the basis for P4.

-- ---------------------------------------------------------------------------
-- Enum types. Values, names, and order must match CLAUDE.md; do not add, rename, or reorder them.
-- ---------------------------------------------------------------------------

create type category_t as enum
  ('fresh','frozen','snack','condiment','skincare','medicine','other');
create type location_t as enum
  ('fridge','freezer','pantry','bathroom','vanity','other');
create type tier_t     as enum ('L1','L2','L3');
create type quantity_t as enum ('full','half','low');

-- ---------------------------------------------------------------------------
-- items
-- ---------------------------------------------------------------------------

create table items (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) default auth.uid(),

  name             text        not null,
  category         category_t  not null,
  location         location_t  not null,
  tier             tier_t      not null default 'L2',

  purchase_date    date,
  expiry_date      date,
  shelf_life_days  int,
  opened_date      date,
  pao_months       int,

  quantity_level   quantity_t  not null default 'full',
  note             text,

  consumed_at      timestamptz,
  discarded_at     timestamptz,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- catalog: frequently used item templates for reusable entry (used in P2).
-- ---------------------------------------------------------------------------

create table catalog (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references auth.users(id) default auth.uid(),
  name                     text       not null,
  category                 category_t not null,
  location                 location_t not null,
  default_tier             tier_t     not null default 'L2',
  default_shelf_life_days  int,
  default_pao_months       int,
  use_count                int        not null default 0,
  last_used_at             timestamptz,
  created_at               timestamptz not null default now(),
  unique (user_id, name)
);

-- ---------------------------------------------------------------------------
-- Indexes.
-- ---------------------------------------------------------------------------

create index items_active_idx on items (user_id)
  where consumed_at is null and discarded_at is null;
create index catalog_rank_idx on catalog (user_id, use_count desc, last_used_at desc);

-- ---------------------------------------------------------------------------
-- Maintain updated_at automatically.
--
-- Only items has an updated_at column; catalog therefore has no corresponding trigger.
-- This is an audit field, not derived state, so it does not violate core rule 1 (never store status).
-- ---------------------------------------------------------------------------

create extension if not exists moddatetime schema extensions;

create trigger items_updated_at before update on items
  for each row execute procedure extensions.moddatetime(updated_at);

-- ---------------------------------------------------------------------------
-- RLS remains enabled for the single-user app to avoid rework if sharing is added later.
-- ---------------------------------------------------------------------------

alter table items   enable row level security;
alter table catalog enable row level security;

create policy owner_all on items
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy owner_all on catalog
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
