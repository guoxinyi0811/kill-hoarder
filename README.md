# Kill Hoarder

**The pantry and vanity manager.** A single-user PWA that tracks what you own and when it goes bad.

*Assisted by [Claude](https://claude.com/claude-code).*

*[中文说明见下方](#kill-hoarder-中文)*

---

It solves two **independent** problems:

1. **Expiry warnings** — tell me what to eat or use up, while there's still time
2. **Inventory visibility** — "do I already have Sichuan peppercorns?" "what's left before I go shopping?"

The second problem needs no dates at all. Conflating the two is the usual reason systems like this fail.

> The only failure mode is entry friction. Any feature that adds a step to logging an item is off by default.

Full spec in [SPEC.md](SPEC.md); non-negotiable engineering constraints in [CLAUDE.md](CLAUDE.md).

## Three-tier tracking model

| Tier | For | You enter | Computed from |
|---|---|---|---|
| **L1 exact** | Fresh food, yogurt, opened skincare | Expiry or opening date | `expiry_date`, or `opened_date + pao_months` |
| **L2 rough** | Frozen goods, snacks, sauces | Purchase date only | `purchase_date + shelf_life_days` |
| **L3 existence only** | Dried spices, pantry staples | Nothing | none → `untracked` |

`effectiveExpiry` is the **earliest** non-null value among the three sources. All three empty means `untracked`.

Status (`expired / urgent / soon / ok / untracked`) is **always computed at runtime, never stored** —
no `status` column, no cache, no triggers maintaining derived state.

## Stack

Vite · React 19 · TypeScript (strict) · Tailwind CSS ·
Supabase (Postgres + Auth) · TanStack Query · vite-plugin-pwa · Vitest

## Progress

| Phase | Scope | Status |
|---|---|---|
| **P0** | Scaffolding, migration SQL, `computeExpiry` pure function, unit tests | ✅ Done |
| **P1** | Login, list, create / edit, mark consumed / discarded | ✅ Done |
| **P2** | Catalog-based quick entry, "what's at home" / "needs restocking" views | Not started |
| **P3** | Weekly digest (Edge Function + Actions cron + Telegram) + daily keepalive | Not started |
| **P4** | Restock-cycle inference from consumption history | Not started |

## Running locally

Requires Node 20+ and a Supabase project.

```bash
npm install
```

Create `.env.local` in the project root:

```
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-publishable-or-anon-key>
```

Either the new key format (`sb_publishable_…`) or a legacy JWT works — `supabase-js` handles both.
`.env.local` is gitignored and never reaches the repo.

For the database, paste the SQL under [`supabase/migrations/`](supabase/migrations) into the Supabase
Dashboard SQL Editor, or run `supabase db push`. **This project does not use `supabase db reset`**
and does not depend on local Docker.

```bash
npm run dev      # dev server
npm run test     # Vitest
npm run build    # production build
npm run lint     # oxlint
```

## Layout

```
src/
├── lib/                  # Pure logic: zero React, zero Supabase, fully unit-testable
│   ├── enums.ts            # Enums and WARN_DAYS — the single source of truth
│   ├── expiry.ts           # computeExpiry: never reads the clock, integer calendar math only
│   ├── today.ts            # "Today" in America/Toronto — the only module that reads the clock
│   ├── pending.ts          # Filter / sort / group / per-item error isolation for the main view
│   ├── validation.ts       # Pre-submit form validation
│   └── types.ts
├── api/                  # Supabase reads and writes (soft delete only, no .delete())
├── hooks/                # TanStack Query optimistic updates
└── components/           # PendingList · ItemForm · LoginScreen · Toast
```

`computeExpiry` contains no `Date` at all — date arithmetic is pure integer calendar math, so no
timezone or DST effect can reach it. A test scans the source to enforce exactly that.

On an invalid date it **throws** rather than returning a fallback: getting an expiry date wrong is
worse than crashing. Callers must handle it, so the list isolates errors per row and the form
validates before submit. Both defenses are covered by tests.

---

# Kill Hoarder（中文）

**家庭保质期管理 PWA。** 单用户自用，记录家里有什么、什么时候过期。

*Assisted by [Claude](https://claude.com/claude-code)。*

解决两个**独立**的问题：

1. **过期预警** —— 该吃 / 该用完的东西，在还来得及的时候提醒
2. **库存可见性** —— 「我到底有没有花椒」「买菜前家里还剩什么」

第 2 个问题不需要日期。把它们混为一谈是这类系统失败的常见原因。

> 唯一的失败模式是录入摩擦。任何增加录入步骤的功能，默认不做。

完整规格见 [SPEC.md](SPEC.md)，不可协商的工程约定见 [CLAUDE.md](CLAUDE.md)。

## 三层追踪模型

| Tier | 适用 | 用户录入 | 计算依据 |
|---|---|---|---|
| **L1 精确** | 生鲜、酸奶、已开封护肤品 | 具体到期日 / 开封日 | `expiry_date` 或 `opened_date + pao_months` |
| **L2 粗略** | 冷冻、零食饼干、酱料 | 只记购入日 | `purchase_date + shelf_life_days` |
| **L3 仅存在** | 干花椒、香料、干货 | 什么都不记 | 无 → `untracked` |

`effectiveExpiry` 取三个来源中**最早**的非空值。三者全空即 `untracked`。

状态 `expired / urgent / soon / ok / untracked` **永远运行时计算，绝不写入数据库**——
没有 `status` 列，没有缓存，没有维护派生状态的触发器。

## 技术栈

Vite · React 19 · TypeScript (strict) · Tailwind CSS ·
Supabase (Postgres + Auth) · TanStack Query · vite-plugin-pwa · Vitest

## 进度

| Phase | 内容 | 状态 |
|---|---|---|
| **P0** | 脚手架、迁移 SQL、`computeExpiry` 纯函数、单元测试 | ✅ 完成 |
| **P1** | 登录、列表、新增 / 编辑、标记消耗 / 丢弃 | ✅ 完成 |
| **P2** | catalog 快速录入、「家里有什么」/「需要补货」视图 | 未开始 |
| **P3** | 周报推送（Edge Function + Actions cron + Telegram）+ 每日 keepalive | 未开始 |
| **P4** | 基于消耗历史的复购周期推断 | 未开始 |

## 本地运行

需要 Node 20+ 和一个 Supabase 项目。

```bash
npm install
```

在项目根目录建 `.env.local`：

```
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-publishable-or-anon-key>
```

anon key 用新格式（`sb_publishable_` 开头）或旧的 JWT 都可以，`supabase-js` 都支持。
`.env.local` 已被 `.gitignore` 忽略，不会进仓库。

数据库迁移：把 [`supabase/migrations/`](supabase/migrations) 下的 SQL 整份贴进 Supabase
Dashboard 的 SQL Editor 执行，或用 `supabase db push`。**本项目不使用 `supabase db reset`**，
也不依赖本地 Docker。

```bash
npm run dev      # 开发
npm run test     # Vitest
npm run build    # 构建
npm run lint     # oxlint
```

## 结构

```
src/
├── lib/                  # 纯逻辑：零 React、零 Supabase 依赖，全部可单测
│   ├── enums.ts            # 枚举与 WARN_DAYS，唯一真源
│   ├── expiry.ts           # computeExpiry：不读系统时间，纯整数历法运算
│   ├── today.ts            # America/Toronto 的「今天」，全项目唯一读时钟的地方
│   ├── pending.ts          # 待处理视图的筛选 / 排序 / 分组 / 异常隔离
│   ├── validation.ts       # 表单提交前校验
│   └── types.ts
├── api/                  # Supabase 读写（软删除，无 .delete()）
├── hooks/                # TanStack Query 乐观更新
└── components/           # PendingList · ItemForm · LoginScreen · Toast
```

`computeExpiry` 全程不出现 `Date`，日期运算是纯整数历法算术，因此不存在任何时区或 DST 干扰。
这一点有测试直接扫描源码强制保证。

对非法日期它**抛错**而不是返回兜底值——保质期算错比崩掉更危险。调用方必须处理异常，
所以列表渲染逐条隔离、表单提交前校验，两道防线都有测试覆盖。
