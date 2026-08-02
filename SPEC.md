# SPEC.md — 家庭保质期管理系统

## 0. 问题定义

管理者本人记不住家里有什么、什么时候过期。系统要解决两个**独立**的问题：

1. **过期预警** — 该吃/该用完的东西，在还来得及的时候提醒
2. **库存可见性** — 「我到底有没有花椒」「买菜前家里还剩什么」

第 2 个问题不需要日期。把它们混为一谈是这类系统失败的常见原因。

**唯一的失败模式是录入摩擦。** 任何增加录入步骤的功能，默认不做。

---

## 1. 三层追踪模型

| Tier | 适用 | 用户录入 | 计算依据 |
|---|---|---|---|
| **L1 精确** | 生鲜、酸奶、已开封护肤品 | 具体到期日 / 开封日 | `expiry_date` 或 `opened_date + pao_months` |
| **L2 粗略** | 冷冻、零食饼干、酱料 | 只记购入日 | `purchase_date + shelf_life_days` |
| **L3 仅存在** | 干花椒、香料、干货 | 什么都不记 | 无 → `untracked` |

tier 是**录入表单的引导**，决定显示哪些字段。它不进入状态计算。

---

## 2. 数据模型

**迁移执行方式**：本项目**不使用 `supabase db reset`**，也不依赖本地 Docker。迁移通过
Supabase Dashboard 的 SQL Editor 手动执行，或用 `supabase db push` 推到云端项目。
`supabase/migrations/` 下的文件是唯一真源，手动执行时按文件名顺序整份贴进去跑。

### 2.1 DDL

```sql
create type category_t as enum
  ('fresh','frozen','snack','condiment','skincare','medicine','other');
create type location_t as enum
  ('fridge','freezer','pantry','bathroom','vanity','other');
create type tier_t     as enum ('L1','L2','L3');
create type quantity_t as enum ('full','half','low');

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

-- 常买物品模板，录入复用的核心
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

create index items_active_idx on items (user_id)
  where consumed_at is null and discarded_at is null;
create index catalog_rank_idx on catalog (user_id, use_count desc, last_used_at desc);

-- updated_at 自动维护。仅 items 有 updated_at 列，catalog 没有，不加。
-- 这是审计字段，不是派生状态，不违反「status 绝不落库」。
create extension if not exists moddatetime schema extensions;

create trigger items_updated_at before update on items
  for each row execute procedure extensions.moddatetime(updated_at);
```

### 2.2 RLS

单用户，但仍开 RLS，避免以后要分享时返工：

```sql
alter table items   enable row level security;
alter table catalog enable row level security;

create policy owner_all on items
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy owner_all on catalog
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

Auth 用 Supabase magic link，单账号。不做注册流程，不做密码找回 UI。

### 2.3 不存在的列

`status`、`days_left`、`effective_expiry` **都不是数据库列**。全部运行时算。

---

## 3. 核心纯函数

位置：`src/lib/expiry.ts`。零 React 依赖，零 Supabase 依赖，输入输出都是普通对象。

```ts
export type DateStr = string  // 'YYYY-MM-DD'

export interface ExpiryInput {
  category:        Category
  purchase_date:   DateStr | null
  expiry_date:     DateStr | null
  shelf_life_days: number | null
  opened_date:     DateStr | null
  pao_months:      number | null
}

export interface ExpiryResult {
  effectiveExpiry: DateStr | null
  daysLeft:        number | null   // 负数 = 已过期
  status:          Status
  source:          'explicit' | 'pao' | 'shelf_life' | null  // 哪个来源胜出，UI 要显示
}

export function computeExpiry(item: ExpiryInput, today: DateStr): ExpiryResult
```

`computeExpiry` 对非法日期字符串抛错（格式不是 `YYYY-MM-DD`、月份越界、该日期不存在如
`2027-02-29`），**调用方必须处理异常**。它不返回错误码、不返回 null 兜底——保质期算错比
抛错危险得多。这条约束对 P1 的渲染层和表单层有硬性要求，见 §4 P1。

### 3.1 算法

```
candidates = [
  expiry_date                              → 'explicit'
  opened_date + pao_months 个月            → 'pao'          (两者都非空才算)
  purchase_date + shelf_life_days 天       → 'shelf_life'   (两者都非空才算)
]
去掉 null，取日期最早的一个 → effectiveExpiry, source
若两个来源算出同一天，按 explicit > pao > shelf_life 的优先级决定 source
  （即上面数组的书写顺序，effectiveExpiry 相同，只影响 UI 显示哪个来源标记）
若 candidates 为空 → { effectiveExpiry: null, daysLeft: null, status: 'untracked', source: null }

daysLeft = 日历天数差(effectiveExpiry - today)
warn     = WARN_DAYS[category]

daysLeft <  0        → 'expired'
daysLeft <= warn     → 'urgent'
daysLeft <= warn * 2 → 'soon'
否则                  → 'ok'
```

### 3.2 必须覆盖的测试用例（P0）

- 三个来源各自单独存在
- 多来源冲突时取最早（尤其：护肤品有 2027 的 expiry_date，但开封后 PAO 6 个月 → 取 PAO）
- 全空 → `untracked`
- 半空组合：只有 `opened_date` 没有 `pao_months` → 该来源不参与
- 边界：`daysLeft === 0` → `urgent`；`daysLeft === warn` → `urgent`；`daysLeft === warn + 1` → `soon`
- 跨月/跨年加月份：`2026-01-31 + 1 month` 的处理（约定：溢出则取当月最后一天，即 `2026-02-28`）
- 闰年 `2028-02-29`
- 不同 category 走不同 warn 阈值
- 时区：`today` 由调用方传入，函数内部不读系统时间

---

## 4. Phase 拆分

每个 phase 独立可跑。做完停下来等确认，不要连做。

### P0 — 地基

**范围**：项目脚手架、Supabase 迁移文件、`src/lib/expiry.ts`、`src/lib/enums.ts`、完整单元测试。

**不做**：任何 UI、任何数据库查询。

**验收**：
- `npm run test` 全绿，§3.2 每条用例都有对应 test
- `computeExpiry` 不 import 任何 React / Supabase / 全局时间
- 迁移 SQL 能在 Supabase 云端项目跑通（Dashboard SQL Editor 手动执行，见 §2）
- 枚举值与 CLAUDE.md 完全一致

### P1 — CRUD + 主视图

**范围**：登录、列表、新增、编辑、标记消耗/丢弃。

**主视图「⚠️ 待处理」**：
- 筛选 `status ∈ {expired, urgent, soon}`
- 按 `daysLeft` 升序
- 分组标题：已过期 / 快到期 / 留意
- 每条显示：名称、位置、剩余天数、状态色点、来源标记（PAO 的显示「开封计」）
- 右滑或按钮：一键「已用完」（写 `consumed_at`）
- **空状态是成功状态**，文案要正向，不要显示「暂无数据」

**非法日期的处理（由 §3 的抛错约定引出，必须做）**：

`computeExpiry` 对非法日期抛错，所以 P1 必须在两个位置挡住：

1. **渲染侧——逐条隔离异常。** 列表渲染时每一条独立 try/catch（或等价的
   per-item error boundary），单条日期数据异常只把该条渲染成
   「⚠️ 日期数据异常」占位，且该占位可点击进入编辑页修复。
   **异常不得冒泡导致整个列表白屏。**
2. **录入侧——提交前校验。** 新增/编辑表单提交前校验日期格式为 `YYYY-MM-DD`
   且该日期真实存在（例如拒绝 `2027-02-29`），从源头阻止非法值入库。
3. 以上两点都要有对应测试。

**验收**：
- 新增后列表立即出现（乐观更新，不等网络往返）
- 标记消耗后条目消失且不可被普通视图查到
- 移动端单手可完成新增到保存全流程
- 列表中混入一条日期非法的数据时，其余条目正常渲染，该条显示为可点击的「⚠️ 日期数据异常」
- 表单无法提交格式非法或不存在的日期

### P2 — 快速录入 + 库存视图

**范围**：catalog 复用 + 按位置分组视图。

**快速录入流程**：
1. 打开录入 → 顶部直接展示 catalog 中 `use_count` 最高的 8 项（大按钮）
2. 点一下 → 名称/类别/位置/tier/保质期全部预填，购入日默认今天
3. 再点保存 → 完成。**目标：两次点击录入一件常买物品**
4. 保存时 `use_count += 1`，`last_used_at = now()`
5. 录入一个 catalog 里没有的名称时，静默创建 catalog 条目

**「📦 家里有什么」视图**：
- 全部未消耗条目，按 `location` 分组
- 包含 `untracked`（L3）——这是这个视图存在的主要理由
- 顶部搜索框，输入即过滤（本地过滤，不查库）
- 每条右侧 `quantity_level` 三档快速切换

**「🛒 需要补货」视图**：筛选 `quantity_level = 'low'`，按 location 分组。

**验收**：
- 常买物品从打开 App 到录入完成 ≤ 3 次点击
- 搜索「花椒」能查到没有任何日期的 L3 条目
- 种子数据（§5）已导入 catalog

### P3 — 周报推送

**范围**：Supabase Edge Function + GitHub Actions cron + Telegram Bot。

- cron：每周日 20:00 America/Toronto（注意 GH Actions 用 UTC，夏令时会漂移，用 `0 0 * * 1` UTC 并在函数内校正，或接受 ±1 小时）
- Edge Function 查所有 `status ∈ {expired, urgent}` 的条目，按状态和天数排序
- 推送格式：纯文本，带 emoji 状态、名称、位置、剩余天数
- 若无待处理项，也推一条简短确认（沉默会让人怀疑系统挂了）
- Token 存 Supabase secrets，**不进代码库**

**keepalive（必做，与周报同等重要）**：

Supabase 免费项目在**连续 7 天无数据库活动后自动暂停**。周报是每周一次，恰好和这个
7 天边界重合——项目可能刚好在周报触发前被暂停，导致周报打到一个已暂停的项目上，
而且暂停本身是静默的。因此必须额外加一个每日 keepalive：

- 每天执行一次，跑一个极轻量查询（如 `select 1 from items limit 1`）
- **独立的 workflow 文件**，与周报分开，两者互不影响（周报挂了不能连带 keepalive 挂）
- 仓库设为 public，GitHub Actions 分钟数不计费
- Telegram token 一律走 GitHub Secrets，**不进代码库**

**验收**：
- 手动触发周报 workflow 能收到消息；无数据时也收到消息
- keepalive workflow 独立存在、可单独手动触发、执行成功
- 代码库里搜不到任何 token 明文

### P4 — 复购周期推断

**范围**：基于 `consumed_at` 历史，估算每个 catalog 条目的平均消耗周期，在补货视图中标注「通常 X 天用完，已过 Y 天」。

**规则**：样本 < 3 次不给估算，显示「数据不足」。不做任何自动下单、自动加购。

---

## 5. 种子数据（P2 导入 catalog）

首次使用不应该面对空库。以下为默认值，用户可改。

| name | category | location | tier | shelf_life_days | pao_months |
|---|---|---|---|---|---|
| 花椒 | condiment | pantry | L3 | — | — |
| 八角 | condiment | pantry | L3 | — | — |
| 干辣椒 | condiment | pantry | L3 | — | — |
| 桂皮 | condiment | pantry | L3 | — | — |
| 生抽 | condiment | pantry | L2 | 540 | — |
| 老抽 | condiment | pantry | L2 | 540 | — |
| 蚝油 | condiment | fridge | L2 | 365 | — |
| 香醋 | condiment | pantry | L2 | 730 | — |
| 芝麻油 | condiment | pantry | L2 | 540 | — |
| 郫县豆瓣酱 | condiment | fridge | L2 | 365 | — |
| 老干妈 | condiment | fridge | L2 | 365 | — |
| 米 | snack | pantry | L2 | 365 | — |
| 糙米 | snack | pantry | L2 | 180 | — |
| 燕麦片 | snack | pantry | L2 | 365 | — |
| 全麦面包 | fresh | fridge | L1 | 7 | — |
| 鸡蛋 | fresh | fridge | L2 | 28 | — |
| 牛奶/植物奶 | fresh | fridge | L1 | 10 | — |
| 希腊酸奶 | fresh | fridge | L1 | 21 | — |
| 蛋白粉 | snack | pantry | L2 | 730 | — |
| 冷冻鸡胸 | frozen | freezer | L2 | 180 | — |
| 冷冻虾 | frozen | freezer | L2 | 180 | — |
| 冷冻蓝莓 | frozen | freezer | L2 | 365 | — |
| 冷冻西兰花 | frozen | freezer | L2 | 365 | — |
| 亚麻籽粉 | condiment | fridge | L2 | 120 | — |
| 奇亚籽 | condiment | pantry | L2 | 365 | — |
| 锡兰肉桂粉 | condiment | pantry | L2 | 730 | — |
| 生可可粉 | condiment | pantry | L2 | 540 | — |
| 洁面 | skincare | bathroom | L1 | — | 12 |
| 化妆水 | skincare | vanity | L1 | — | 6 |
| 精华 | skincare | vanity | L1 | — | 6 |
| 面霜 | skincare | vanity | L1 | — | 12 |
| 防晒 | skincare | vanity | L1 | — | 12 |
| 维生素D3 | medicine | vanity | L2 | 730 | — |
| 甘氨酸镁 | medicine | vanity | L2 | 730 | — |

护肤品 PAO 以罐体开盖图标为准，种子值只是默认。开封日未填时，L1 护肤品应在列表里显示「未记录开封日」提示。

---

## 6. UI 原则

- 移动端优先，桌面只需不难看
- 首页默认落在「⚠️ 待处理」
- 状态色：🔴 expired / 🟠 urgent / 🟡 soon / 🟢 ok / ⚪ untracked
- 录入表单按 tier 折叠字段：L3 只显示名称/类别/位置；L2 加购入日；L1 加到期日或开封日
- 不做仪表盘、不做统计图表、不做成就系统

---

## 7. 明确不做（v1）

条码扫描、OCR 识别小票、多用户共享、离线同步、iOS 原生推送、营养成分、价格与开支统计、自动补货下单。
