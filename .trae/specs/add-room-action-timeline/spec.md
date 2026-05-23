# 棋盘右侧事件时间轴 Spec

## Why
对局进行中缺少“发生了什么”的统一记录视图，玩家需要在右侧看到移动、扣费、购买等关键结算，以便理解回合进展与资金变化来源。

## What Changes
- 在对局界面“棋盘右侧”新增一个对所有人一致可见的“事件时间轴（Timeline）”面板
- Timeline 以服务器事件流为数据源，将关键事件（移动/扣费/购买等）转成可读文案并按时间顺序展示
- Timeline 支持滚动与保留最近 N 条记录（默认 50），并在新事件到来时追加
- **BREAKING** 无

## Impact
- Affected specs: 对局内信息展示、可观察性（Observability）、多人一致性
- Affected code:
  - `apps/web/app/room/[code]/use-room-connection.ts`：暴露并维护事件列表（来自 WS `events`）
  - `apps/web/app/room/[code]/page.tsx`：将事件列表传递到棋盘 UI
  - `apps/web/app/room/[code]/board-skeleton.tsx`：新增右侧 Timeline 面板与渲染逻辑
  - `packages/shared/src/protocol/event.ts`：作为事件类型来源（不要求变更，但需要映射）
  - `packages/rules/src/engine.ts`：作为 `moneyChanged.reason` 约定来源（不要求变更，但需要映射）

## ADDED Requirements
### Requirement: 对局事件时间轴
系统 SHALL 在对局界面棋盘右侧展示一个对所有玩家与观战者一致的事件时间轴，用于记录并回放对局关键事件。

#### Scenario: 对局中持续追加事件
- **WHEN** 客户端通过 WebSocket 收到服务端 `events` 消息
- **THEN** 系统将其中“可展示事件”转换为时间轴条目并追加到时间轴列表
- **AND THEN** 时间轴保持按事件时间顺序展示（以 `createdAtMs` 为主、`seq` 为辅）
- **AND THEN** 超过保留上限的旧条目被移除（仅保留最近 N 条）

#### Scenario: 展示移动记录
- **WHEN** 收到事件 `game/playerMoved`
- **THEN** 时间轴展示一条“移动”记录，包含玩家昵称、起点格序号、终点格序号
- **AND THEN** 若可从棋盘配置推断终点格名称，则附带终点格名称（例如 `#12 伦敦`）

#### Scenario: 展示扣费/入账记录
- **WHEN** 收到事件 `game/moneyChanged`
- **THEN** 时间轴展示一条“资金变化”记录，包含玩家昵称、金额变化（正/负）与原因（reason）
- **AND THEN** 系统 SHALL 对常见 `reason` 进行可读化映射（至少覆盖）：
  - `buy:<propertyId>` → 购买地产（展示地产名）
  - `auction:<propertyId>` → 拍卖购得（展示地产名）
  - `rent:<propertyId>` → 支付租金（展示地产名与收款方信息若可得）
  - `mortgage:<propertyId>` / `redeem:<propertyId>` → 抵押/赎回
  - `build:<propertyId>` / `sellBuilding:<propertyId>` → 建房/卖房
  - `jailFine` → 监狱罚金
- **AND THEN** 对未识别的 `reason` 使用通用展示：`资金变化（reason 原文）`

#### Scenario: 展示购买确认记录
- **WHEN** 收到事件 `game/engine` 且 `name === 'property/bought'`
- **THEN** 时间轴展示一条“购买”记录，包含买家昵称、地产名、成交价
- **AND THEN** 若同一成交对应同时出现 `moneyChanged`（`buy:`/`auction:`），系统 MAY 选择只展示一条合并记录，避免重复信息

#### Scenario: 一致性（所有人看到相同记录）
- **WHEN** 同一房间内的不同客户端在同一时间窗口内接收到了同一批服务器事件
- **THEN** 时间轴展示的条目集合与顺序应一致（不依赖 Debug 开关、不依赖本地随机）

## MODIFIED Requirements
无

## REMOVED Requirements
无

