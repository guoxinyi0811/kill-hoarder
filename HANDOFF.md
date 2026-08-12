# HANDOFF.md

交接材料。P0、P1 由 Claude 完成，从 P2 起交给 Codex。

**先读这三份，顺序不要颠倒：**

1. `AGENTS.md` — 不可协商的工程约定（与 `CLAUDE.md` 同内容，两份必须同步改）
2. `SPEC.md` — 完整规格，phase 拆分和每个 phase 的验收标准都在 §4
3. 本文件 — 当前进度、历史决定及其理由、已知缺口

---

## 1. 当前进度

| Phase | 内容 | 状态 |
|---|---|---|
| **P0** | 脚手架、迁移 SQL、`computeExpiry`、`enums.ts`、单元测试 | ✅ 完成并验收 |
| **P1** | 登录、待处理主视图、新增 / 编辑、标记消耗 / 丢弃 | ✅ 完成，2 条验收待人工确认 |
| **P2** | catalog 快速录入、「家里有什么」/「需要补货」视图 | ⬜ 未开始 |
| **P3** | 周报推送 + 每日 keepalive | ⬜ 未开始 |
| **P4** | 复购周期推断 | ⬜ 未开始 |

当前状态：`npm run test` 198 passed / 6 files，`npm run build` 通过，`npm run lint` 通过，
`npm audit` 0 漏洞。

数据库迁移已在 Supabase 云端 SQL Editor 手动执行，`items` 和 `catalog` 两张表已建好。

**接手第一件事**：跑一遍 `npm install && npm run test && npm run build`，确认基线是绿的，
再开始改任何东西。

---

## 2. P1 两条未闭合的验收

SPEC §4 P1 的 5 条验收里，3 条有自动化断言，**2 条没有，需要人工验收**。
这两条不是遗漏，是权衡后的选择，理由如下。

### 2.1 「新增后列表立即出现（乐观更新）」——端到端接线未自动化

**已覆盖的部分**：乐观更新逻辑写在 `src/hooks/useItems.ts` 的 `onMutate`（先写缓存再发
请求，失败回滚到快照）；「该不该出现在列表里」的判定是纯函数 `appearsInPending`，有 8 个
单测覆盖全部状态组合。

**未覆盖的部分**：「点保存 → 列表真的立刻多出一行」这条端到端链路没有自动化测试。

**为什么不做**：需要 mock 掉整个 Supabase 客户端（auth session + PostgREST 查询链），
搭这套 mock 的成本和维护负担超过它能抓到的 bug——它抓的是接线错误，而接线只有一处，
人工点一次就能确认。**逻辑正确性有覆盖，接线正确性没有。**

**人工验收方法**：登录 → 新增一个到期日在 3 天内的条目 → 保存 → 列表应立刻出现该条，
不等网络往返。断网重试一次，应看到条目先出现再消失（回滚）。

### 2.2 「移动端单手可完成新增到保存全流程」——未实测

**已做的部分**：只在 375×812 视口验证了登录页渲染正常、控制台无报错。布局按移动端优先
写（点击区 ≥ 44px、底部固定「+ 新增」按钮、表单单列纵向流、`env(safe-area-inset-*)`
处理刘海屏）。

**为什么不做**：登录后的三个界面需要走用户邮箱的 magic link 才能进入，agent 不应该碰
用户的认证凭据。

**人工验收方法**：真机上单手完成「打开 App → 点新增 → 填名称 → 选类别位置 → 保存」，
确认拇指够得到所有控件、不需要换手。

---

## 3. 偏离 SPEC 的决定及理由

以下都是 SPEC 没写、由实现方决定的事。**已经全部回写进 SPEC.md / CLAUDE.md**，
这里记录理由，避免后来者当成随意选择而推翻。

### 3.1 `computeExpiry` 对非法日期抛错（P0）

**决定**：日期格式非法（`2026/07/30`、`2026-7-30`）或日期不存在（`2027-02-29`）时
抛 `TypeError` / `RangeError`，不返回 null 兜底，不返回错误码。

**理由**：保质期算错比崩掉危险得多。静默兜底会让一条坏数据表现成「没有到期日」，
从而被主视图筛掉——用户永远看不到它，也永远不知道有问题。

**代价**：调用方必须处理异常。这直接派生出 P1 的两道防线（见 3.2、3.3），
以及 SPEC §4 P1 里新增的那组验收标准。

**落点**：SPEC.md §3 段末；CLAUDE.md 核心规则 7。

### 3.2 渲染侧逐条隔离走 `computeExpirySafe`（P1）

**决定**：`expiry.ts` 导出一个不抛错的包装 `computeExpirySafe`，返回
`{ ok: true, result } | { ok: false, message }`。列表分组逻辑 `groupPending` 对每条
独立调用它，非法条目落进 `invalid` 组渲染成可点击占位。

**理由**：SPEC 要求「每一条独立 try/catch 或等价的 per-item error boundary」。
用 React error boundary 需要每行包一个 class 组件，且 boundary 抓不到渲染前的计算异常；
在纯函数层集中 try/catch 更简单，而且让整条规则可以脱离 React 单测。

**代价**：`groupPending` 是纯函数，所以「异常不冒泡」这件事在 `pending.test.ts` 里
可以直接断言，不依赖 DOM。

### 3.3 日期输入框在值非法时降级成 `type="text"`（P1）

**决定**：`ItemForm` 里的日期输入框正常是 `type="date"`；当前值非空且非法时，
渲染成 `type="text"`。

**理由**：浏览器（以及 jsdom）会把非法值从 `type="date"` 里**静默清洗成空串**。
而「⚠️ 日期数据异常」占位的整个意义就是点进去修——如果进了编辑页看到的是空白日期框，
用户根本不知道坏的是什么，随手一保存坏值就被无声抹掉了。降级成文本框才能把坏值显示出来。

**代价**：非法态下失去原生日期选择器。这是可接受的——非法态本来就是异常路径，
值一旦改回合法就自动切回 `type="date"`。

**位置**：`src/components/ItemForm.tsx` 的 `DateInput`。

### 3.4 tier 按钮组用 `role="group"` 而不是 `<label>`（P1）

**决定**：包裹单个输入控件用 `<label>`（`Field` 组件），包裹一组按钮用
`<div role="group" aria-label>`（`FieldGroup` 组件）。

**理由**：`<button>` 是可关联控件（labelable element）。三个 tier 按钮被同一个
`<label>` 包住时，整段 label 文本会变成**每个**按钮的可访问名——三个按钮名字全一样，
读屏用户分不清，测试也选不中。这是第一版的真 bug，被组件测试撞出来的。

**给后来者**：再加任何按钮组（比如 P2 的 `quantity_level` 三档切换）时，
用 `FieldGroup` 不要用 `Field`。

### 3.5 同日并列时 source 的优先级（P0）

**决定**：两个来源算出同一天时，`source` 取 `explicit > pao > shelf_life`。

**理由**：SPEC 原文只说「取日期最早的一个」，没定义并列怎么办。实现上是候选数组的
书写顺序 + 严格小于比较，天然保留靠前者。这只影响 UI 显示哪个来源标记，
`effectiveExpiry` 和 `daysLeft` 不受影响。

**落点**：已写进 SPEC.md §3.1 算法块，是规格不是实现细节。有 2 个测试锁住。

### 3.6 `items.updated_at` 加 moddatetime 触发器（P0 复盘）

**决定**：迁移里加 `create extension moddatetime` + `items_updated_at` 触发器。
`catalog` 没有 `updated_at` 列，不加。

**理由**：SPEC 原 DDL 里 `updated_at` 只有 `default now()`，UPDATE 时不会变，
这列会永远停在创建时间。这是 SPEC 的疏漏，用户确认后补的。

**连带改动**：CLAUDE.md 核心规则 1 原文是「没有触发器」，加了触发器后字面自相矛盾，
改成「没有任何**维护派生状态的**触发器」，并注明 `updated_at` 是审计字段不在此限。

### 3.7 删掉了一个写错的测试（P1）

**记录这件事是为了防止有人把它加回来。**

原本写过一个测试「把日期改成非法值后仍然拦得住」，做法是 `userEvent.clear()` 再输入
非法值。但清空后字段变合法、输入框切回 `type="date"`，随后输入的非法值被浏览器清洗掉，
表单反而正常提交了——**这个测试测的是原生日期控件根本不允许的路径**。

已替换成两个测真正可达路径的测试：坏值从数据库回填时显示在文本框里（`input.type === 'text'`）；
以及文本框态下整体替换成另一个非法值（用 `fireEvent.change` 模拟粘贴），仍然拦得住。

### 3.8 主视图筛选规则不可放宽 + toast 回执（P1）

**背景**：SPEC 同时要求「主视图只显示 expired/urgent/soon」和「新增后列表立即出现」。
新增一件 L3 花椒（`untracked`）或保质期还剩一年的米（`ok`）时，这两条无法同时满足。

**决定**（用户拍板）：筛选规则**不动**——一旦开「显示全部」的口子，主视图就退化成
普通列表，「打开只看到该管的」这个核心设计就没了。改为保存成功后弹 toast 回执，
文案必须含名称与位置，例如「已保存：花椒 · 橱柜（目前无需处理）」。

**理由**：录入 L3 的动机就是怕忘了买过，回显位置能强化记忆。

**落点**：SPEC.md §4 P1 主视图小节 + 验收第 1 条已按此改写。
实现见 `App.tsx` 的 `handleCreate`，判定走 `appearsInPending`。

### 3.9 视图切换用 `useState`，不装路由库（P1）

**决定**（用户拍板）：不装 `react-router-dom`，`App.tsx` 里用
`type View = { name: 'list' } | { name: 'new' } | { name: 'edit'; item: Item }`。

**理由**：范围控制。P2 要新增三个视图，路由结构那时必然要重设计一次，现在定的会是错的。
如果 P2 之后确实需要 router，那时一次性设计。

**代价**：没有浏览器后退键支持，没有可分享 URL，刷新回到列表页。P1 范围内可接受。

### 3.10 React 19（不是 SPEC 初稿写的 18）

`create-vite` 模板默认给 React 19。P0 时按 CLAUDE.md 原文压回过 18.3.1，
用户复盘时决定接受 19 并同步改了 CLAUDE.md。**宪法和实际依赖必须一致**——
这条原则对后续任何依赖变更同样适用。

---

## 4. 已知未做项

按优先级排，都不是 bug，是明确划到后面的范围。

| 项 | 现状 | 归属 |
|---|---|---|
| **PWA manifest icons 为空** | `vite.config.ts` 里 `icons: []`，装到桌面没图标 | 未归属任何 phase，随时可做 |
| **`quantity_level` 不在录入表单** | not null 列，新增时走数据库默认 `'full'` | P2 的三档快速切换 |
| **护肤品「未记录开封日」提示** | SPEC §5 末尾写了，P1 未做 | P2 |
| **catalog 表已建但完全没用** | 迁移建了表和索引，无任何读写代码 | P2 |
| **§5 种子数据未导入** | 34 条常买物品，还在 SPEC 表格里 | P2 |
| **端到端 / E2E 测试** | 完全没有 | 未规划 |
| **错误上报、监控** | 没有 | 未规划，SPEC 也没要求 |

`quantity_level` 和护肤品提示这两条已经分别写进 SPEC.md §4 P1 和 §5，不会丢。

---

## 5. 环境

### 5.1 Supabase 免费项目会自动暂停 ⚠️

**免费项目在连续 7 天无数据库活动后自动暂停，且暂停是静默的。**

- 暂停后所有查询失败，App 会显示「读取失败」。
- **恢复方式：到 Supabase Dashboard 手动点 Restore**，没有 API 可以自动恢复。
- 开始 P3 之前先确认项目是 active 的，否则周报会打到一个已暂停的项目上。

这也正是 SPEC §4 P3 要求额外加一个**每日 keepalive workflow** 的原因——周报是每周一次，
恰好和 7 天边界重合。keepalive 必须是独立的 workflow 文件，周报挂了不能连带它挂。

### 5.2 `.env.local`

由**用户本人维护**，含 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`。

- **agent 不读、不改、不打印这个文件。**
- 已被 `.gitignore` 的 `*.local` 覆盖，不会进仓库。
- 代码里只能引用 `import.meta.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`，
  类型声明在 `src/env.d.ts`。
- anon key 是新格式（`sb_publishable_` 开头）不是旧 JWT，`supabase-js` 原生支持，
  不需要任何特殊处理。

### 5.3 数据库迁移

**不用 `supabase db reset`**，不依赖本地 Docker。整份 SQL 贴进 Supabase Dashboard 的
SQL Editor 执行，或 `supabase db push`。

现有迁移 `supabase/migrations/20260730000000_init.sql` **不可重复执行**——
`create type` / `create table` / `create policy` 都没有 `if not exists`，
第二次跑会在第一句就报 `type already exists`。它已经跑过了，不要再跑。

新增迁移请另建文件，不要改这一份。

### 5.4 仓库

- `https://github.com/guoxinyi0811/kill-hoarder`，public，默认分支 `main`。
- commit 的 author / committer 一律是仓库所有者，
  **不要加 `Co-Authored-By` 之类的 AI 署名**（AI 协助已在 README 注明）。
- 本地可能还留着 `backup-before-rewrite` 分支和 `refs/original/`，是一次 author
  改写的备份，未推远端，确认无误后可删。

---

## 6. 目录结构与模块职责

```
src/
├── lib/                    纯逻辑层：零 React、零 Supabase 依赖，全部可单测
│   ├── enums.ts              5 个枚举 + WARN_DAYS，唯一真源，与 CLAUDE.md 逐字对应
│   ├── expiry.ts             computeExpiry 及其安全包装；纯整数历法运算，全程不出现 Date
│   ├── today.ts              torontoToday()：全项目唯一允许读系统时钟的模块
│   ├── pending.ts            待处理主视图的筛选 / 排序 / 分组 / 异常隔离
│   ├── validation.ts         表单提交前校验 + 表单值与 draft 的双向转换
│   └── types.ts              items 行类型、draft 类型、枚举的中文显示名
├── api/                    Supabase 读写层
│   ├── client.ts             客户端实例；环境变量缺失时给 configError 而不是直接崩
│   └── items.ts              items 的增改查；只软删除，全文件没有 .delete()
├── hooks/
│   └── useItems.ts           TanStack Query 封装；增 / 改 / 消耗 / 丢弃全部乐观更新
├── components/             纯展示组件，数据和回调由外部传入，不碰网络
│   ├── PendingList.tsx       「⚠️ 待处理」列表，含非法条目占位
│   ├── ItemForm.tsx          新增 / 编辑表单，按 tier 折叠字段
│   ├── LoginScreen.tsx       magic link 登录
│   └── Toast.tsx             底部回执
├── App.tsx                 容器：auth 门禁 + useState 视图切换 + toast 决策
├── main.tsx                入口：QueryClientProvider
└── env.d.ts                import.meta.env 的类型声明
```

**测试文件与被测模块同目录**：`*.test.ts`（node 环境）在 `src/lib/`，
`*.test.tsx`（jsdom 环境，顶部需 `// @vitest-environment jsdom`）在 `src/components/`。

**分层原则**：`lib` 不 import `api` / `hooks` / `components`；`components` 不 import
`api`；网络只在 `api` 和 `hooks` 里发生。P2 加新视图时保持这个方向。

---

## 7. 开始 P2 前的建议动作

1. `npm install && npm run test && npm run build`，确认基线绿
2. 确认 Supabase 项目没被暂停（见 5.1）
3. 读 `SPEC.md` §4 P2 和 §5，按 `AGENTS.md`「工作方式」先复述范围再动手
4. P2 会引入第一个多视图场景，路由要不要装在那时一并决定（见 3.9）
