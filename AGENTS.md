# AGENTS.md

> **本文件与 `CLAUDE.md` 内容一致，供 Codex 等按 `AGENTS.md` 约定自动加载的 agent 读取。
> 两者必须同步修改——改了任何一份，另一份要一并改，不允许出现分叉。**
> 交接背景、当前进度、历史决定见 `HANDOFF.md`。

家庭保质期管理 PWA。单用户（本人）自用，不做多租户。
**完整规格见 `SPEC.md`。本文件只放不可协商的约定。**

## 技术栈（已定，不要替换）

- Vite + React 19 + TypeScript（strict）
- Tailwind CSS
- Supabase（Postgres + Auth + Edge Functions）
- TanStack Query（乐观更新）
- vite-plugin-pwa
- Vitest（单元测试）+ jsdom + @testing-library/react（组件测试）
- 部署：Cloudflare Pages

**没有路由库。** 视图切换用 `useState`。P2 会新增三个视图，路由结构到那时一次性设计，
现在定的会是错的。在 P2 明确决定引入之前，不要装 `react-router-dom`。

## 枚举值（禁止新增、改名、改顺序）

```ts
type Category = 'fresh' | 'frozen' | 'snack' | 'condiment' | 'skincare' | 'medicine' | 'other'
type Location = 'fridge' | 'freezer' | 'pantry' | 'bathroom' | 'vanity' | 'other'
type Tier     = 'L1' | 'L2' | 'L3'
type Quantity = 'full' | 'half' | 'low'
type Status   = 'expired' | 'urgent' | 'soon' | 'ok' | 'untracked'
```

## WARN_DAYS（禁止修改数值）

```ts
const WARN_DAYS: Record<Category, number> = {
  fresh: 3, frozen: 15, snack: 15, condiment: 30,
  skincare: 60, medicine: 30, other: 30,
}
```

## 核心规则（违反即为 bug）

1. **status 永远运行时计算，绝不写入数据库。** 没有 status 列，没有缓存，没有任何维护派生状态的触发器。
   （`items.updated_at` 的 moddatetime 触发器是审计字段，不是派生状态，不在此限。）
2. **tier 只影响录入表单的字段显示，不参与任何计算。** 状态计算是单一纯函数，不按 tier 分支。
3. `effectiveExpiry` 取三个来源中**最早**的非空值：显式 `expiry_date`、`opened_date + pao_months`、`purchase_date + shelf_life_days`。三者全空 → `untracked`。
4. 删除一律软删除（`consumed_at` / `discarded_at`），消耗历史是 P4 的数据基础，不能真删。
5. 所有日期用 `YYYY-MM-DD` 字符串，**不用 Date 对象跨时区传递**。时区固定 `America/Toronto`。
6. 纯逻辑放 `src/lib/`，必须零 React 依赖、可单测。
   `expiry.ts` 和 `enums.ts` 还额外受两个源码扫描测试约束：只允许相对路径 import
   （零第三方依赖），且不得出现 `new Date(` / `Date.now|UTC|parse` / `Intl.` /
   `toLocale*` / `getTimezoneOffset`。改这两个文件时先看 `expiry.test.ts` 最后那组测试。
7. **`computeExpiry` 对非法日期抛错**，不返回兜底值。调用方必须处理异常：
   列表渲染逐条隔离（走 `computeExpirySafe`），表单提交前校验（走 `validateItemForm`）。
8. 读「今天」一律走 `src/lib/today.ts` 的 `torontoToday()`。它是全项目唯一允许
   读系统时钟的模块，其余任何地方都不许直接取当前时间。

## 禁止事项

- ❌ 不引入状态管理库（Redux/Zustand），TanStack Query + useState 足够
- ❌ 不做 local-first / 离线同步层
- ❌ 不做条码扫描（v3 再说，现在不留接口）
- ❌ 不用 UI 组件库（shadcn 除外，可选）
- ❌ 不自己发明「智能提醒」「AI 推荐」等未在 SPEC 中的功能
- ❌ 不写超出当前 phase 范围的代码；phase 之间必须停下来等确认
- ❌ 不运行 `npm audit fix --force`，不为消除告警而降级或更换 vite-plugin-pwa；该链路为构建期 devDependency，不进产物
- ❌ 不引入路由库（见「技术栈」）
- ❌ **不读、不改、不打印 `.env.local`**。它由用户本人维护，含 Supabase 密钥。
  代码里只能引用 `import.meta.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`

## 环境与密钥

- `.env.local` 由用户维护，已被 `.gitignore` 的 `*.local` 忽略。agent 不得读取或修改。
- anon key 用新格式（`sb_publishable_` 开头）或旧 JWT 都可以，`supabase-js` 都支持，不需要特殊处理。
- 数据库迁移**不用 `supabase db reset`**，不依赖本地 Docker。走 Supabase Dashboard
  的 SQL Editor 手动执行，或 `supabase db push`。详见 SPEC.md §2。

## 提交约定

- commit 的 author 和 committer 一律是仓库所有者
  `Xinyi (Aven) Guo <79408973+guoxinyi0811@users.noreply.github.com>`。
- **不要在 commit message 里加 `Co-Authored-By` 之类的 AI 署名。**
  AI 协助已在 README 里注明，不重复进提交历史。
- 默认分支 `main`。远端 `https://github.com/guoxinyi0811/kill-hoarder`（public）。

## 命令

```bash
npm run dev      # 开发
npm run test     # Vitest
npm run build    # 构建（tsc -b 会连测试一起类型检查）
npm run lint     # oxlint
```

组件测试需要 DOM，在测试文件顶部单独声明 `// @vitest-environment jsdom`。
`src/lib` 的纯逻辑测试保持默认的 node 环境。

## 工作方式

- 每个 phase 开始前，先读 `SPEC.md` 对应章节，复述一遍要做什么再动手。
- P0 遵循先测试后实现。
- 完成一个 phase 后，对照 SPEC 的验收标准逐条自查并报告，然后停下。
