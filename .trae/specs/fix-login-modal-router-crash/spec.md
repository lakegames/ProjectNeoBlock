# 登录模态路由稳定性修复 Spec

## Why
将 `/login` 做成拦截路由模态框后，开发态出现 App Router 内部状态补丁错误（`initialTree is not iterable`）并伴随 `HotReload/Router` 的 render-phase update 警告，影响本地开发与路由可靠性。

## What Changes
- 规避 Next.js 开发态对“并行路由 + 拦截路由”组合的崩溃问题，将站内“去登录”改为状态驱动弹窗（不再通过导航到 `/login` 来触发模态）。
- 保留 `/login` 整页访问能力，用于直达/刷新/分享链接；并复用同一份登录 UI。
- 保留现有 `@modal` 结构不作为主要入口依赖（避免大范围删除/回滚），以“站内入口不触发拦截导航”为稳定目标。

## Impact
- Affected specs: 登录入口交互、路由导航稳定性、开发态 HMR 体验
- Affected code:
  - `apps/web/app/layout.tsx`（并行路由槽位渲染）
  - `apps/web/app/@modal/**`（并行路由与拦截路由）
  - `apps/web/app/login/**`（登录 UI 复用）
  - `apps/web/app/app-shell.tsx`（触发进入登录的导航入口）

## ADDED Requirements
### Requirement: Modal Login UX
系统 SHALL 在用户从站内点击“去登录”时，以模态框形式呈现登录内容，并保持背景页不丢失。

#### Scenario: Success case
- **WHEN** 用户在任意站内页面点击“去登录”
- **THEN** 页面保持当前内容作为背景，并展示登录弹窗
- **AND** 关闭弹窗后回到原页面

### Requirement: Dev Stability
系统 SHALL 在开发态（含 Fast Refresh/HMR）下避免因登录模态路由导致的 App Router 崩溃与致命异常。

#### Scenario: Success case
- **WHEN** 开发态运行时多次打开/关闭登录模态框并触发 Fast Refresh
- **THEN** 控制台不出现 `initialTree is not iterable` 之类导致页面崩溃的异常

## MODIFIED Requirements
### Requirement: Login Page Accessibility
现有 `/login` 作为整页的能力 SHALL 保持可用（可被直接访问、刷新、深链分享），且其内容复用同一份 UI（避免逻辑分叉）。

## REMOVED Requirements
无
