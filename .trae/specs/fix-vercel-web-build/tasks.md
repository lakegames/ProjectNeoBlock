# Tasks
- [x] Task 1: 复现并定位 Vercel 构建失败的类型错误
  - [x] 在 `apps/web/app/room/[code]/use-room-connection.ts` 定位 `getDebugDump` 的实现与返回对象
  - [x] 明确与 `RoomConnectionDebugDump` 不兼容的具体字段（kind 字面量收窄）

- [x] Task 2: 修复 `getDebugDump` 的返回类型（最小改动）
  - [x] 让返回对象中的 `kind` 类型保持为 `"neoblock-debug"` 字面量（避免推断为 `string`）
  - [x] 确保不改变 debug dump 的字段含义与内容

- [ ] Task 3: 验证
  - [x] 本地运行 `npm -w @neoblock/web run build`，确认通过
  - [ ] 触发一次 Vercel 构建，确认不再因 TypeScript 类型错误失败

# Task Dependencies
- Task 2 depends on Task 1
- Task 3 depends on Task 2
