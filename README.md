# Kill Hoarder

家庭保质期管理 PWA。单用户自用，解决两个**独立**的问题：

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
没有 `status` 列，没有缓存，没有触发器。

## 技术栈

Vite · React 19 · TypeScript (strict) · Tailwind CSS · Supabase (Postgres + Auth + Edge Functions) ·
TanStack Query · vite-plugin-pwa · Vitest · Cloudflare Pages

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
