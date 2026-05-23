## Summary

在现有“房间页准备态/对局态 UX 改造”已落地的基础上，补齐对局中剩余体验：离开资产归银行（game/forfeit）、棋盘下方玩家横条、骰子动画与素材接入、点击地块 Popover（信息 + 资产相关操作）、局内聊天/悄悄话（悬浮消息展示）。

## Current State Analysis

### 已完成

- 房间准备态：Tabs 隐藏 tab items；“返回首页”位于 TabsBar；“加入游戏”要求登录且点击即加入；分享（symbol_link）/复制房间号/复制调试/离开确认等在标题行；移除多余文案
  - [app-shell.tsx](file:///e:/code/ProjectNeoBlock/apps/web/app/app-shell.tsx)
  - [page.tsx](file:///e:/code/ProjectNeoBlock/apps/web/app/room/%5Bcode%5D/page.tsx)
  - [use-room-connection.ts](file:///e:/code/ProjectNeoBlock/apps/web/app/room/%5Bcode%5D/use-room-connection.ts)
- 对局态：隐藏房间信息/我的状态/邀请/玩家列表/观战列表卡片；观战列表由标题行按钮触发 Popover；首页出现“你还有游戏进行中”
- UI 基础：已新增通用 Popover 组件
  - [popover.tsx](file:///e:/code/ProjectNeoBlock/packages/ui/src/popover.tsx)

### 未完成（本阶段范围）

- 离开房间“资产归银行”仅前端尝试发送 `game/forfeit`，协议/引擎/服务端尚未支持
  - `confirmLeaveRoom()` 已调用 `sendCommand({ type: 'game/forfeit', ... })`（需要后端实现）
- 对局 UI：玩家面板仍在棋盘右侧 `<aside>`，未改为棋盘下横条
  - 现状位置：[board-skeleton.tsx:L1119-L1219](file:///e:/code/ProjectNeoBlock/apps/web/app/room/%5Bcode%5D/board-skeleton.tsx#L1119-L1219)
- 棋盘交互：地块目前仅 Tooltip 展示名称，未支持“点击弹 Popover”
  - 现状位置：[board-skeleton.tsx:L969-L1000](file:///e:/code/ProjectNeoBlock/apps/web/app/room/%5Bcode%5D/board-skeleton.tsx#L969-L1000)
- 骰子动画：仅文本显示上次点数，缺动画与棋盘中央图片
  - 素材位于：`packages/ui/assets/lucks/Point01.svg ~ Point06.svg`
- 聊天/悄悄话：协议/服务端/前端均未实现

## Assumptions & Decisions

- 聊天权限：允许观战者发送消息
- 悄悄话传输：仍走全体事件流，前端仅对“发送者/接收者/公聊”展示（不做强隐私隔离）
- 地块 Popover 操作范围：仅做“资产相关”（建房/卖房/抵押/赎回）与信息展示；不新增“直接购买/拍卖”等新能力
- 聊天消息不做持久化（不写入 Web 数据 store），仅作为 WS 事件流的一部分

## Proposed Changes

### 1) 协议层：新增命令与事件

#### files

- [command.ts](file:///e:/code/ProjectNeoBlock/packages/shared/src/protocol/command.ts)
- [validation.ts](file:///e:/code/ProjectNeoBlock/packages/shared/src/protocol/validation.ts)
- [event.ts](file:///e:/code/ProjectNeoBlock/packages/shared/src/protocol/event.ts)

#### changes

- 新增命令：
  - `game/forfeit`：`{ roomId, gameId, playerId }`
  - `room/sendChat`：`{ roomId, playerId, text, toPlayerId?: PlayerId }`（缺省为公聊；提供则为悄悄话）
- 新增事件：
  - `room/chatMessage`：`{ fromPlayerId, text, toPlayerId?: PlayerId }`
- `validation.ts`：
  - `validateCommand()` 增加对应分支，校验 required 字段与 `text` 非空、长度上限（建议 1~400）
  - 事件校验维持现状（仅校验 base 字段）

### 2) 规则引擎：实现 game/forfeit（资产归银行）

#### files

- [engine.ts](file:///e:/code/ProjectNeoBlock/packages/rules/src/engine.ts)
- [types.ts](file:///e:/code/ProjectNeoBlock/packages/rules/src/types.ts)（若需要复用 DebtState 类型引用，不新增字段）

#### changes

- `validateGameCommand()` 支持 `game/forfeit`
- `handleCommand()` 增加 `game/forfeit` 分支：
  - 允许任意回合/阶段触发（只要求 player 存在且未 eliminated）
  - 产出 `game/engine` 事件：`name: 'player/forfeited'`，`data: { playerId }`
  - 若 forfeited 玩家为当前玩家，则补发 `game/turnStarted` 给下一位存活玩家（round 计算沿用 endTurn 逻辑）
  - 与 `deriveEndEvents` 串联：若剩余存活玩家 <= 1，则触发 `game/ended`
- `applyEvent()` 在 `event.type === 'game/engine'` 分支中新增处理 `player/forfeited`：
  - 将该玩家的地产与建筑全部回收给银行（与 `bankruptcy/declared` 中 bank creditor 的效果一致：地产清除 owner、解除抵押、建筑归还 bank）
  - 清空玩家现金、properties、标记 eliminated
  - 清理该玩家相关的交互状态（仅当交互对象与该玩家相关时才清理）：
    - `pendingPrompt?.playerId === playerId` 时清空 `pendingPrompt`
    - `trade` 存在且 `fromPlayerId/toPlayerId` 任一等于 playerId 时清空 `trade`
    - `debt?.debtorId === playerId` 时清空 `debt`
    - `auction` 存在且 `activeBidders` 包含 playerId 时将其移除；移除后：
      - 若 `currentBidderIndex >= activeBidders.length`，则将 `currentBidderIndex` 置 0
      - 若 `highestBidderId === playerId`，则将 `highestBidderId` 置空且 `highestBid` 置 0（让后续出价重新开始）

### 3) WS 服务端：接入 room/sendChat + 广播 room/chatMessage

#### files

- [server.ts](file:///e:/code/ProjectNeoBlock/apps/server/src/server.ts)

#### changes

- 在 command 分发中新增 `command.type === 'room/sendChat'`：
  - `requireInRoom()`、`requireClientSeq()`、`requireSelfPlayer(command.playerId)`
  - 创建并 append `room/chatMessage` 事件（带 causedBy.commandId 以清理 pending）
  - `broadcast(room, { kind:'events', roomId, gameId: room.game?.gameId ?? null, fromSeqExclusive, events:[e] })`
  - `broadcast(room, { kind:'snapshot', snapshot: buildSnapshot(room) })`（保持与其他 room/* 一致）

### 4) Web：useRoomConnection 增加 chat buffer；BoardSkeleton 接入聊天 UI

#### files

- [use-room-connection.ts](file:///e:/code/ProjectNeoBlock/apps/web/app/room/%5Bcode%5D/use-room-connection.ts)
- [board-skeleton.tsx](file:///e:/code/ProjectNeoBlock/apps/web/app/room/%5Bcode%5D/board-skeleton.tsx)
- [page.tsx](file:///e:/code/ProjectNeoBlock/apps/web/app/room/%5Bcode%5D/page.tsx)

#### changes

- `useRoomConnection`：
  - 新增 state：`chatMessages`（ring buffer，例如 60 条）
  - 在 `onServerMessage(parsed.kind==='events')` 中，提取 `type === 'room/chatMessage'` 的事件追加到 buffer
  - 对悄悄话：仅当 `toPlayerId` 缺省（公聊）或 `fromPlayerId===actor.playerId` 或 `toPlayerId===actor.playerId` 时入 buffer
  - hook 返回值增加 `chatMessages`
- `RoomPage`：
  - 将 `chatMessages` 透传给 `BoardSkeleton`
- `BoardSkeleton`：
  - 在棋盘区域右下角展示“悬浮消息”堆栈（只显示最近 3 条，超时自动淡出）
  - 在玩家横条中加入“聊天”按钮，打开 Popover：
    - 收件人选择：所有人 + 所有玩家（可包含观战者由后续需求决定；本阶段先仅列出房间成员）
    - 文本输入框 + 发送按钮（发送 `room/sendChat`）

### 5) Web：玩家面板改为棋盘下方横条

#### files

- [board-skeleton.tsx](file:///e:/code/ProjectNeoBlock/apps/web/app/room/%5Bcode%5D/board-skeleton.tsx)

#### changes

- 将现有右侧 `<aside>` 玩家面板拆为“横条布局”，放置在棋盘组件下方（同一 section 内）
- 横条每个玩家以紧凑卡片展示：
  - 颜色点 + 头像/首字母 + 昵称 + 现金 + 位置
  - 资产按钮（打开 Drawer）与详情按钮（打开 Dialog）保留
- 棋盘上方的动作区（掷骰/结束回合/我的资产/发起交易）保留；其中“我的资产”可考虑在横条内对“我”提供更直达入口（不改行为，仅移动入口）

### 6) Web：骰子动画 + lucks 素材接入

#### files

- `apps/web/public/lucks/Point01.svg ~ Point06.svg`（从 `packages/ui/assets/lucks` 同步一份到 web public）
- [board-skeleton.tsx](file:///e:/code/ProjectNeoBlock/apps/web/app/room/%5Bcode%5D/board-skeleton.tsx)

#### changes

- 素材接入：
  - 将 `packages/ui/assets/lucks/` 下的 6 个 SVG 复制到 `apps/web/public/lucks/`，通过 `/lucks/Point0X.svg` 引用
- 动画表现：
  - 监听 `engine.lastDice` 变化，触发“棋盘中心覆盖层”展示两枚骰子（对应两点数），并在 800~1200ms 内自动消失
  - 覆盖层不拦截棋盘点击（pointerEvents: none），避免影响地块 Popover

### 7) Web：点击地块 Popover（信息 + 资产相关操作）

#### files

- [board-skeleton.tsx](file:///e:/code/ProjectNeoBlock/apps/web/app/room/%5Bcode%5D/board-skeleton.tsx)

#### changes

- 将 tile name 区域从 Tooltip 改为 Popover 触发（保持键盘可访问：tabIndex + Enter/Space 打开）
- Popover 内容：
  - 通用：序号、名称、地块类型说明（start/jail/tax/chance/communityChest/property）
  - 物业地块：价格、房价、归属、抵押/建筑状态
  - 若为我名下地产：
    - 建房：`game/build`
    - 卖房：`game/sellBuilding`
    - 抵押：`game/mortgageProperty`
    - 赎回：`game/redeemProperty`
  - 按钮可用性沿用现有规则：spectator 禁用；非自己回合禁用；phase 不支持时禁用

## Verification

### 开发验证（本地）

- 启动前端与 WS 服务端（若你已经在终端里启动了服务端/前端，执行阶段我会先向你确认已有的地址/端口再继续）
- 准备态：
  - 未登录点击“加入游戏”打开登录模态；登录后可加入；不可匿名作为玩家加入
- 对局态：
  - 点击“离开房间”确认后，退出玩家资产归银行，且该玩家在玩家横条显示为出局；对局可继续直至结束
  - 玩家面板在棋盘下方横条展示；资产 Drawer 与详情 Dialog 可用
  - 掷骰后棋盘中心出现骰子图片并自动消失
  - 点击任意地块出现 Popover，地产在满足条件时可做资产相关操作
  - 发送公聊/悄悄话：自己能看到；悄悄话仅双方可见（前端过滤）；悬浮消息正常弹出

### 命令

- `npm -w @neoblock/shared run typecheck`
- `npm -w @neoblock/rules run typecheck`
- `npm -w @neoblock/server run typecheck`
- `npm -w @neoblock/web run typecheck`
