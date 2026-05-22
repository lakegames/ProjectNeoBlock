# Tasks

- [x] Task 1: 设计并落地 App Shell 结构（不改样式）
  - [x] SubTask 1.1: 在 `apps/web` 增加 AppShell 结构组件（Topbar + Content 容器），只提供结构与 className/data 挂载点
  - [x] SubTask 1.2: 顶栏结构包含：左菜单按钮+NeoBlock、中间状态胶囊挂载点、右侧 Admin 与头像按钮挂载点

- [x] Task 2: 将 App Shell 应用于全站页面
  - [x] SubTask 2.1: 在全站根布局中包裹 `{children}`，确保所有页面获得统一壳结构
  - [x] SubTask 2.2: 对少数页面做最小结构适配（如存在重复外层 `<main>` 容器导致语义/结构冲突），但不改动任何样式

- [x] Task 3: 行为与兼容性验证
  - [x] SubTask 3.1: Typecheck 通过（至少 web）
  - [x] SubTask 3.2: 手工检查：任意页面均出现顶栏与内容承载区，且页面原有样式不发生变化

# Task Dependencies
- Task 2 depends on Task 1
- Task 3 depends on Task 2
