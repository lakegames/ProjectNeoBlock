# Tasks
- [ ] Task 1: 定义标准 40 格棋盘数据模板
  - [ ] 在 apps/web/lib/config.ts 新增 `fullBoardConfig()`（或等价函数），生成 40 格 tiles
  - [ ] 覆盖关键格子：start/jail/goToJail/tax/chance/communityChest/property
  - [ ] 保证 `jailIndex` 与 `goToJail` 的 target index 合理（例如 jailIndex=10，goToJail=30）

- [ ] Task 2: Seed 新增内置测试棋盘并发布
  - [ ] 在 apps/web/lib/config-service.ts 的 seed 逻辑中：若不存在 `builtin:board-full`（或等价 docId），则创建文档并写入 fullBoardConfig 的 draftData
  - [ ] 自动发布该文档的首个版本，使其出现在 `/api/config/published` 的 boards 列表里
  - [ ] 不影响已有棋盘文档与其发布状态（只新增，不替换）

- [ ] Task 3: 验证创建房间可选择并正常渲染
  - [ ] 在大厅页面确认“棋盘”下拉框出现测试棋盘选项
  - [ ] 使用该棋盘创建房间，确认对局页面棋盘渲染正常（40 格环形/网格均可）

- [ ] Task 4: 构建与类型检查
  - [ ] npm -w @neoblock/web run typecheck

# Task Dependencies
- Task 2 依赖 Task 1
- Task 3 依赖 Task 2
