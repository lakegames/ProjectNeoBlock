# NeoBlock 全站包裹式框架（App Shell）Spec

## Why
当前各页面布局缺少统一的“应用外壳”，用户在不同页面间缺乏一致的导航与内容承载结构。需要先搭建与截图一致的包裹式框架，后续由你在此结构上统一调整样式与主题。

## What Changes
- 为 `apps/web` 全站页面引入统一 App Shell 结构（顶栏 + 内容承载区）
- 顶栏固定在页面顶部：左侧菜单按钮 + NeoBlock 字样；中间状态胶囊区域；右侧 Admin 入口与头像按钮
- 内容区放置各页面原有内容，不改动页面现有样式，仅增加结构包裹与可挂载样式的 className/data-attributes
- 预留“状态胶囊”的渲染占位（结构与挂载点），其样式由你后续实现

## Impact
- Affected specs: 前端全站导航与布局骨架
- Affected code:
  - `apps/web/app/layout.tsx`（或等效布局文件）：引入 App Shell
  - `apps/web/app/**/page.tsx`：仅在必要时做结构适配（避免破坏现有页面）
  - `packages/ui`：如需，可新增纯结构组件（不包含样式）用于复用壳结构

## ADDED Requirements
### Requirement: App Shell 结构
系统 SHALL 为所有页面提供统一的包裹式框架（App Shell），用于承载顶栏与页面内容。

#### Scenario: 进入任意页面
- **WHEN** 用户访问任意路由页面
- **THEN** 页面顶部存在统一顶栏区域（Topbar）
- **AND THEN** 页面内容位于统一内容承载区（Content）

### Requirement: 顶栏结构与挂载点
系统 SHALL 在顶栏中提供明确的结构挂载点，顺序与语义与截图一致：
- 左：菜单按钮 + NeoBlock 标识
- 中：状态胶囊区域（可为空，但必须存在 DOM 挂载点）
- 右：Admin 入口与头像按钮

#### Scenario: 顶栏元素可定位
- **WHEN** 用户打开页面
- **THEN** 可以通过稳定的 className/data 属性定位上述四个区域以便后续加样式

### Requirement: 不修改样式（结构改造仅加壳）
系统 SHALL 在实现本次框架改造时不更改任何现有样式表现（不改动现有 inline style、tokens、组件样式），仅新增结构层级与样式挂载点。

#### Scenario: 旧页面内容保持不变
- **WHEN** App Shell 上线
- **THEN** 各页面原有内容的布局与样式保持一致（除新增的外层结构容器）

### Requirement: 顶栏固定（由样式实现）
系统 SHALL 满足“顶栏固定在顶部”的交互目标；实现阶段只需提供结构与挂载点，使该行为可通过样式实现。

#### Scenario: 页面滚动
- **WHEN** 页面内容滚动
- **THEN** 顶栏区域在视觉上保持固定（由后续样式实现）

## MODIFIED Requirements
无

## REMOVED Requirements
无

