# NeoBlock 设计系统与大厅 UI 改造 Spec

## Why

当前 UI 组件与页面存在样式分散、内联样式重复、交互一致性不足的问题，影响后续迭代效率与整体质感。需要先建立统一的设计系统基础，再以大厅为第一块落地点持续推进全站体验升级。

## What Changes

- 建立/完善设计系统基础：颜色、排版、圆角、阴影、间距等 tokens 与主题注入机制
- 升级通用组件：Button、Input（以及与它们强相关的交互状态/尺寸体系）
- 新增基础布局组件：Card（通用容器）与 RoomCard（大厅房间卡片）
- 将大厅页房间列表与“加入/创建房间”区域改造为新设计系统的用法

## Impact

- Affected specs: 设计系统/主题、前端大厅体验
- Affected code:
  - `packages/ui`：tokens 与基础组件（Button/Input/新增 Card/RoomCard）
  - `apps/web`：大厅页面与房间列表 UI

## ADDED Requirements

### Requirement: 设计系统 Tokens

系统 SHALL 提供一套可在 Web 全站复用的设计 tokens，并通过 ThemeProvider 注入为 CSS 变量供组件消费。

#### Scenario: 组件使用 tokens 渲染

- **WHEN** Button/Input/RoomCard 渲染
- **THEN** 组件的颜色、间距、圆角、阴影、字体等来源于统一 tokens（而不是页面内联常量）
- **AND THEN** tokens 可在不改组件逻辑的前提下进行整体风格调整

### Requirement: Button 组件体系

系统 SHALL 提供与 Figma 设计一致的 Button 组件规范，至少覆盖：尺寸、变体、色调、禁用态、加载态（如设计包含）。

#### Scenario: Button 状态一致

- **WHEN** Button 处于 default/hover/active/disabled（以及可选的 loading）状态
- **THEN** 视觉表现与交互反馈符合 Figma 设计系统定义

### Requirement: Input 组件体系

系统 SHALL 提供与 Figma 设计一致的 Input 组件规范，至少覆盖：尺寸、占位符、禁用态、错误态（如设计包含）。

#### Scenario: Input 错误态提示

- **WHEN** Input 处于错误态（例如表单校验失败）
- **THEN** Input 的边框/底色/文案反馈符合 Figma 设计系统定义

### Requirement: RoomCard 组件

系统 SHALL 提供 RoomCard 组件用于大厅房间列表展示，包含房间码、房间状态、人数/观战人数等关键摘要信息，并提供可点击入口。

#### Scenario: 大厅房间列表展示

- **WHEN** 大厅展示可加入房间列表
- **THEN** 列表以 RoomCard 呈现，并与 Figma 设计一致
- **AND THEN** 点击 RoomCard 可进入该房间（或触发加入动作，按现有逻辑）

## MODIFIED Requirements

### Requirement: 大厅页面布局与信息层级

大厅页面 SHALL 使用统一的页面栅格与卡片容器规范，减少重复的内联样式，提升信息层级清晰度与可读性。

#### Scenario: 大厅整体体验

- **WHEN** 用户进入大厅
- **THEN** 能清晰区分“房间列表”和“加入房间”等区域，且组件间距、标题层级符合设计系统

## REMOVED Requirements

无
