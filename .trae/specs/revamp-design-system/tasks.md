# Tasks

- [x] Task 1: 对齐 Figma 设计系统资产与范围
  - [x] SubTask 1.1: 基于“设计系统”Figma 链接梳理需要落地的 tokens 与组件清单（Button/Input/RoomCard）
  - [x] SubTask 1.2: 明确本阶段不做的范围（例如复杂表单组件、全站页面改造）

- [x] Task 2: 设计 tokens 落地到 `@neoblock/ui`
  - [x] SubTask 2.1: 在 `packages/ui` 中补齐/调整主题 tokens（颜色/排版/圆角/阴影/间距）并保持命名体系一致
  - [x] SubTask 2.2: 确保 ThemeProvider/全站注入路径不变（避免破坏现有页面）

- [x] Task 3: 升级基础组件（Button/Input）
  - [x] SubTask 3.1: Button：按 Figma 定义梳理 size/variant/tone 与状态（hover/active/disabled）
  - [x] SubTask 3.2: Input：按 Figma 定义梳理 size/状态（默认/禁用/错误）
  - [x] SubTask 3.3: 保持 API 尽量兼容现有调用点；如需变更，集中在最小范围内调整调用方

- [x] Task 4: 新增 Card 与 RoomCard 组件
  - [x] SubTask 4.1: Card：抽象通用容器样式（边框/圆角/阴影/背景/间距）
  - [x] SubTask 4.2: RoomCard：实现大厅房间卡片 UI，并暴露必要 props（roomCode、人数、状态等）

- [x] Task 5: 改造大厅页使用新组件
  - [x] SubTask 5.1: 房间列表：使用 RoomCard 替换现有卡片实现
  - [x] SubTask 5.2: “加入房间/创建房间”区域：替换为新版 Button/Input 视觉

- [ ] Task 6: 验证与回归
  - [x] SubTask 6.1: Typecheck 通过（全仓或至少 web/ui）
  - [ ] SubTask 6.2: 手工核对：按钮/输入框/RoomCard 与 Figma 截图一致（关键尺寸、圆角、阴影、字体层级）

# Task Dependencies

- Task 3 depends on Task 2
- Task 4 depends on Task 2
- Task 5 depends on Task 3, Task 4
- Task 6 depends on Task 5
