# 修复 Vercel Web 构建失败 Spec

## Why
当前 Vercel 在执行 `@neoblock/web` 的 `next build` 时出现 TypeScript 类型错误，导致无法完成部署，需要修复以保证生产构建可通过。

## What Changes
- 修复 `use-room-connection.ts` 中 `getDebugDump` 的返回值类型，使其严格符合 `RoomConnectionDebugDump`（尤其是 `kind: "neoblock-debug"` 字面量类型）。
- 确保在 Next.js 生产构建阶段（`next build` 的类型检查）不再出现同类字面量/可选属性类型不兼容错误。

## Impact
- Affected specs: 部署/构建稳定性、对局连接调试信息导出
- Affected code:
  - `apps/web/app/room/[code]/use-room-connection.ts`

## ADDED Requirements
### Requirement: Vercel 生产构建可通过
系统 SHALL 在 Vercel（Next.js 生产构建）环境下通过 `next build` 的类型检查。

#### Scenario: `getDebugDump` 返回类型一致
- **WHEN** `useRoomConnection()` 返回 `getDebugDump` 方法
- **THEN** `getDebugDump()` 的返回值类型 MUST 可赋值给 `RoomConnectionDebugDump`
- **AND** `kind` 字段 MUST 为字面量 `"neoblock-debug"`（而非宽泛的 `string`）

## MODIFIED Requirements
### Requirement: Debug Dump 输出结构
系统 SHALL 输出固定结构的 debug dump，其中：
- `kind` 字段为 `"neoblock-debug"`
- `version` 字段为 `1`
- 其余字段保持既有含义与内容不变

## REMOVED Requirements
无

