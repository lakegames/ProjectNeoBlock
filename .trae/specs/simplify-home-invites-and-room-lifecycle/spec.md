# 首页邀请精简与房间生命周期 Spec

## Why
首页“与好友同玩”同时展示“最近房间卡片 + 邀请”，信息目标不清晰；同时当前房间清理策略会导致结束后无法回到同一房间继续下一局，也不利于留存对战记录。

## What Changes
- 首页“与好友同玩”区域**仅展示未处理且未过期的房间邀请**，不再展示“好友正在游玩/最近房间”卡片
- 邀请的有效性规则调整为：未读/未忽略 + 未过期 + 房间未关闭
- 房间支持“一局结束后继续开新一局”：无需重新创建房间，可沿用当前配置（可修改）与在场玩家重新开局
- 房间关闭机制调整：当所有玩家退出后 3 分钟自动关闭房间（roomCode 失效），但**对战记录留存**
- “历史对局”展示范围调整为“仅我的对局”，并支持“删除历史记录（仅对我隐藏）”

## Impact
- Affected specs: 首页邀请展示、房间生命周期、历史对局留存与删除
- Affected code:
  - `apps/web/app/page.tsx`（首页“与好友同玩”卡片）
  - `apps/web/app/api/game-invite/*`（邀请 inbox 与有效性）
  - `apps/web/app/api/room/*`（房间列表清理、房间关闭、对局结束记录）
  - `apps/web/app/history/page.tsx`（历史对局列表与删除）
  - `apps/web/lib/store.ts`（Room/History/隐藏记录的数据模型）
  - `apps/server/src/server.ts` + `packages/shared/src/protocol/*`（支持同房间新开一局的 WS 生命周期）

## ADDED Requirements
### Requirement: 首页只展示邀请
系统 SHALL 在首页“与好友同玩”区域仅展示未处理且未过期的房间邀请列表。

#### Scenario: 有未处理邀请
- **WHEN** 用户已登录且存在未处理房间邀请
- **THEN** 首页“与好友同玩”区域展示邀请条目（邀请人、房间码、加入/忽略操作）
- **AND THEN** 不展示任何“最近房间/好友正在游玩”的房间卡片

#### Scenario: 无邀请
- **WHEN** 用户已登录但没有未处理且未过期邀请
- **THEN** 展示空状态文案（例如“暂无邀请”）并提供刷新/进入好友页入口

### Requirement: 邀请有效性（未处理/未过期/房间未关闭）
系统 SHALL 将邀请视为“有效且可展示”当且仅当满足：
- 未被忽略（dismissedAtMs 不存在）
- 未被读取（readAtMs 不存在）
- 邀请未过期（`nowMs - createdAtMs <= inviteTtlMs`，默认 7 天）
- 邀请关联的房间未关闭（room.closedAtMs 不存在），且房间记录仍存在

#### Scenario: 邀请过期
- **WHEN** 邀请创建时间超过 7 天
- **THEN** 邀请不在首页与好友页 inbox 列表出现

#### Scenario: 房间已关闭
- **WHEN** 邀请关联房间已关闭（所有玩家退出后 3 分钟自动关闭，或房主手动关闭）
- **THEN** 邀请不在首页与好友页 inbox 列表出现

### Requirement: 一局结束后可在同房间开新一局
系统 SHALL 支持同一 roomCode 在一局游戏结束后，在不重新创建房间的前提下再次开局。

#### Scenario: 游戏结束后重新开局
- **WHEN** 一局游戏结束
- **THEN** 房间回到可开局状态（lobby 语义），保留当前房间配置
- **AND THEN** 在场玩家可继续准备，房主可再次开局，产生新的 gameId

### Requirement: 所有人退出后 3 分钟关闭房间，但保留对战记录
系统 SHALL 在房间内所有玩家退出后，延迟 3 分钟自动关闭房间（roomCode 失效），且对战记录仍可在“历史对局”中查看。

#### Scenario: 关闭房间
- **WHEN** 房间内所有玩家离开（members 为空）并持续 3 分钟
- **THEN** 房间被标记为关闭（closedAtMs 写入）
- **AND THEN** 该房间不再出现在“可加入/可邀请”的列表中
- **AND THEN** 房间对应的对战记录仍可在历史对局中展示

### Requirement: 历史对局仅展示我的记录，删除仅对我隐藏
系统 SHALL 仅展示当前用户参与过的已结束对局记录，并允许用户删除某条历史记录（仅对本人隐藏，不影响其他人）。

#### Scenario: 查看历史对局
- **WHEN** 用户打开“历史对局”
- **THEN** 仅显示 userId 为参与者的记录

#### Scenario: 删除历史记录（仅本人）
- **WHEN** 用户在历史对局列表对某条记录执行删除
- **THEN** 该记录从该用户的历史列表消失
- **AND THEN** 不影响其他参与者的历史列表

## MODIFIED Requirements
### Requirement: 房间清理策略
系统 SHALL 不再以“对局结束后 6 小时”删除房间记录（**BREAKING**），改为以“房间关闭后 + 归档 TTL”清理，并确保对战记录可被历史页引用。

## REMOVED Requirements
### Requirement: 首页展示最近房间卡片
**Reason**: 与“邀请”信息混杂，降低“与好友同玩”的信息聚焦。
**Migration**: 最近房间入口不在首页展示；用户可通过房间码加入或从历史对局进入观战。

