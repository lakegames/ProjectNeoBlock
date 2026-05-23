# 将关键提示改为时间轴上方卡片堆栈 Spec

## Why
当前“购买还是拍卖/拍卖出价/债务处理”等关键流程使用模态框展示，会打断玩家观察棋盘与时间轴的连续体验；需要改为非模态的固定区域卡片堆栈，以保持玩法不中断且信息可持续可见。

## What Changes
- 在对局界面右侧“事件时间轴”上方新增固定区域的“待处理卡片堆栈（Prompt Stack）”，对所有人布局一致
- 将以下系统提示从模态框改为 Prompt Stack 内的非模态可交互卡片：
  - 交易请求（trade）
  - 购买/拍卖选择（buyOrAuction）
  - 拍卖出价（auctionBid）
  - 债务处理（debt）
- Prompt Stack 支持“收起/展开”单张卡片，但不遮罩页面、不阻塞用户浏览时间轴/棋盘
- **BREAKING**：上述提示不再以模态框出现（UI 行为变化）

## Impact
- Affected specs: 对局内交互不中断、可观察性（Timeline + Prompt Stack）、多人一致布局
- Affected code:
  - `apps/web/app/room/[code]/board-skeleton.tsx`：新增 Prompt Stack UI；移除/替换对应 Dialog 逻辑
  - `apps/web/app/room/[code]/timeline-mapper.ts`：无需改协议，但可选增加“prompted”类事件的显示（非必须）
  - `packages/shared/src/protocol/event.ts`：不修改，仅作为事件来源
  - `packages/shared/src/protocol/command.ts`：不修改，仅作为 `game/respondTrade` 指令来源

## ADDED Requirements
### Requirement: Prompt Stack（固定区域卡片堆栈）
系统 SHALL 在棋盘右侧侧栏中、事件时间轴列表上方展示一个固定区域的 Prompt Stack，用于承载关键流程提示卡片。

#### Scenario: 存在待处理提示
- **WHEN** 对局状态存在待处理提示（pendingPrompt 或 debt）
- **THEN** Prompt Stack 显示对应卡片
- **AND THEN** 卡片不以模态框形式出现（无遮罩、不会阻止用户滚动时间轴）

#### Scenario: 无待处理提示
- **WHEN** 对局状态不存在待处理提示
- **THEN** Prompt Stack 区域可保持空白或展示轻量空态（不占用过高高度）

### Requirement: 交易请求卡片（trade）
系统 SHALL 在存在待处理交易请求时，将其展示为 Prompt Stack 内的“交易请求”卡片，而非模态框。

#### Scenario: 我收到交易请求
- **WHEN** `engine.trade` 存在且 `engine.trade.toPlayerId === selfPlayerId` 且 `game.phase === 'await_prompt'`
- **THEN** 卡片展示交易发起者、对方给我（现金/地产）、我给对方（现金/地产）
- **AND THEN** 卡片提供“接受”“拒绝”按钮，点击后发送 `game/respondTrade`（accept true/false）

#### Scenario: 其他玩家正在处理交易请求
- **WHEN** `engine.trade` 存在且 `engine.trade.toPlayerId !== selfPlayerId`
- **THEN** 卡片以只读形式展示“等待某某处理交易请求…”，并展示交易摘要

### Requirement: 购买/拍卖选择卡片（buyOrAuction）
系统 SHALL 在 pendingPrompt 为 buyOrAuction 时展示“购买还是拍卖”卡片，提供操作按钮。

#### Scenario: 当前玩家需要选择买或拍卖
- **WHEN** `pendingPrompt.kind === 'buyOrAuction'` 且 `pendingPrompt.playerId === selfPlayerId`
- **THEN** 卡片展示地产名称、价格，并提供“购买”“拍卖”按钮
- **AND THEN** 点击按钮发送与现有行为一致的响应指令（保持协议与规则不变）

#### Scenario: 其他玩家正在选择
- **WHEN** `pendingPrompt.kind === 'buyOrAuction'` 且 `pendingPrompt.playerId !== selfPlayerId`
- **THEN** 卡片以只读形式展示“等待某某选择”，并展示该地产信息（避免信息缺失）

### Requirement: 拍卖出价卡片（auctionBid）
系统 SHALL 在 pendingPrompt 为 auctionBid 时展示“拍卖出价”卡片，支持输入出价或弃权。

#### Scenario: 当前玩家需要出价
- **WHEN** `pendingPrompt.kind === 'auctionBid'` 且 `pendingPrompt.playerId === selfPlayerId`
- **THEN** 卡片展示地产名称、最低出价、当前最高价与最高出价者（若可得）
- **AND THEN** 卡片提供出价输入框 + “出价”“弃权”按钮
- **AND THEN** 点击后发送与现有行为一致的响应指令（保持协议与规则不变）

#### Scenario: 其他玩家出价中
- **WHEN** `pendingPrompt.kind === 'auctionBid'` 且 `pendingPrompt.playerId !== selfPlayerId`
- **THEN** 卡片以只读形式展示“等待某某出价”，并展示拍卖状态摘要

### Requirement: 债务处理卡片（debt）
系统 SHALL 在对局处于债务阶段或存在 debt 状态时展示“债务处理”卡片，允许用户在不离开页面的情况下完成处理。

#### Scenario: 当前玩家需要处理债务
- **WHEN** `engine.debt` 存在且 `engine.debt.debtorId === selfPlayerId`
- **THEN** 卡片展示债务金额、债权人信息、原因（reason）
- **AND THEN** 卡片提供与现有行为一致的处理路径（至少包含“破产/宣告破产”入口；若已有“卖房/抵押/赎回”等操作入口则保持不变）

#### Scenario: 其他玩家债务处理中
- **WHEN** `engine.debt` 存在且 `engine.debt.debtorId !== selfPlayerId`
- **THEN** 卡片以只读形式展示“等待某某处理债务”，并展示债务摘要

### Requirement: 卡片收起/展开
系统 SHALL 允许用户收起 Prompt Stack 中的单张卡片为一行摘要（不隐藏“存在待处理提示”的事实）。

#### Scenario: 收起卡片
- **WHEN** 用户点击卡片的“收起”操作
- **THEN** 卡片变为摘要行（显示类型 + 关键摘要 + 展开按钮）

#### Scenario: 展开卡片
- **WHEN** 用户点击“展开”
- **THEN** 恢复完整卡片内容与交互控件

## MODIFIED Requirements
### Requirement: 关键提示展示形态
系统 SHALL 将 trade/buyOrAuction/auctionBid/debt 四类提示从模态框改为非模态卡片堆栈展示。

## REMOVED Requirements
### Requirement: trade/buyOrAuction/auctionBid/debt 的模态框
**Reason**: 模态打断体验且遮挡时间轴/棋盘信息。
**Migration**: 由 Prompt Stack 非模态卡片完全替代，交互与指令保持一致。
