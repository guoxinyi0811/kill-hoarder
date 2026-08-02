-- P0 初始迁移：SPEC.md §2.1 DDL + §2.2 RLS
--
-- 注意（CLAUDE.md 核心规则 1 / SPEC §2.3）：
--   status、days_left、effective_expiry 都不是列。全部由 src/lib/expiry.ts 运行时计算。
--   这里没有 status 列、没有缓存列、没有维护派生状态的触发器。
--   （末尾的 items_updated_at 触发器只维护审计字段 updated_at，不是派生状态。）
--
-- 执行方式（SPEC.md §2）：不用 supabase db reset，走 Dashboard SQL Editor 或 supabase db push。
-- 注意（CLAUDE.md 核心规则 4）：
--   删除一律软删除，走 consumed_at / discarded_at，消耗历史是 P4 的数据基础。

-- ---------------------------------------------------------------------------
-- 枚举类型（值、名称、顺序与 CLAUDE.md 一致，禁止新增/改名/改顺序）
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
-- catalog：常买物品模板，录入复用的核心（P2 使用）
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
-- 索引
-- ---------------------------------------------------------------------------

create index items_active_idx on items (user_id)
  where consumed_at is null and discarded_at is null;
create index catalog_rank_idx on catalog (user_id, use_count desc, last_used_at desc);

-- ---------------------------------------------------------------------------
-- updated_at 自动维护
--
-- 仅 items 有 updated_at 列，catalog 没有该列，故不加触发器。
-- 这是审计字段而非派生状态，不违反 CLAUDE.md 核心规则 1（status 绝不落库）。
-- ---------------------------------------------------------------------------

create extension if not exists moddatetime schema extensions;

create trigger items_updated_at before update on items
  for each row execute procedure extensions.moddatetime(updated_at);

-- ---------------------------------------------------------------------------
-- RLS（单用户，但仍开，避免以后要分享时返工）
-- ---------------------------------------------------------------------------

alter table items   enable row level security;
alter table catalog enable row level security;

create policy owner_all on items
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy owner_all on catalog
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
