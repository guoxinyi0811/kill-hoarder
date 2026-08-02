# CLAUDE.md

家庭保质期管理 PWA。单用户（本人）自用，不做多租户。
**完整规格见 `SPEC.md`。本文件只放不可协商的约定。**

## 技术栈（已定，不要替换）

- Vite + React 19 + TypeScript（strict）
- Tailwind CSS
- Supabase（Postgres + Auth + Edge Functions）
- TanStack Query（乐观更新）
- vite-plugin-pwa
- Vitest（单元测试）
- 部署：Cloudflare Pages

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

## 禁止事项

- ❌ 不引入状态管理库（Redux/Zustand），TanStack Query + useState 足够
- ❌ 不做 local-first / 离线同步层
- ❌ 不做条码扫描（v3 再说，现在不留接口）
- ❌ 不用 UI 组件库（shadcn 除外，可选）
- ❌ 不自己发明「智能提醒」「AI 推荐」等未在 SPEC 中的功能
- ❌ 不写超出当前 phase 范围的代码；phase 之间必须停下来等确认
- ❌ 不运行 `npm audit fix --force`，不为消除告警而降级或更换 vite-plugin-pwa；该链路为构建期 devDependency，不进产物

## 命令

```bash
npm run dev      # 开发
npm run test     # Vitest
npm run build    # 构建
```

## 工作方式

- 每个 phase 开始前，先读 `SPEC.md` 对应章节，复述一遍要做什么再动手。
- P0 遵循先测试后实现。
- 完成一个 phase 后，对照 SPEC 的验收标准逐条自查并报告，然后停下。
