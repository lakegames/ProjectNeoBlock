# 房间与对局流程 UX 改造计划

## Summary
本计划聚焦 `/room/[code]` 的准备态与对局态用户体验改造，包含：
- 房间页 TabsBar 行为调整（房间页隐藏 Tab 项目，TabsBar 内提供返回首页按钮但不作为 tab item）
- 房间准备态：加入/观战/分享/复制等按钮重排与行为重做（禁止匿名玩家加入，未登录弹登录模态）
- 对局态：收敛页面信息密度（隐藏房间信息/邀请/列表等），观战列表改为标题行按钮触发 Popover
- 对局体验：玩家面板改为棋盘下方横条、掷骰动画（使用 `packages/ui/assets/lucks` 素材）、点击地块 Popover、局内聊天/悄悄话（非持久化、悬浮消息减干扰）
- 离开房间确认：准备态离开=需要重新加入；对局态离开=强制破产资产归银行

## Current State Analysis (Grounded)
### 导航与登录
- 全站 TabsBar 在 [app-shell.tsx](file:///e:/code/ProjectNeoBlock/apps/web/app/app-shell.tsx#L185-L293) 内硬编码渲染 tabItems，无法按路由定制（例如房间页隐藏 tab item）。
- 登录模态已实现：路由 `/login` 通过 parallel route `@modal/(.)login` 展示 [login-modal-client.tsx](file:///e:/code/ProjectNeoBlock/apps/web/app/@modal/(.)login/login-modal-client.tsx)；可用 `router.push('/login')` 触发。

### 房间页（WS 版）
- 房间页主实现为 [room/[code]/page.tsx](file:///e:/code/ProjectNeoBlock/apps/web/app/room/%5Bcode%5D/page.tsx)，准备态顶部包含：
  - “返回首页 / 作为玩家加入 / 观战链接 / 复制调试信息 / 离开房间”等按钮
  - 一段说明文案 “对局交互：掷骰/购买/拍卖/交易/建房/抵押/卡牌展示；并补齐弹窗与关键按钮的键盘可访问性” 位于 [page.tsx](file:///e:/code/ProjectNeoBlock/apps/web/app/room/%5Bcode%5D/page.tsx#L846-L851)
- 对局 UI 主体在 [board-skeleton.tsx](file:///e:/code/ProjectNeoBlock/apps/web/app/room/%5Bcode%5D/board-skeleton.tsx)：
  - 右侧为纵向玩家面板（需改为棋盘下横条）
  - 棋盘 tile 目前仅 Tooltip，未提供点击 Popover 的详情/操作入口

### UI 组件现状
- `Dialog` 已内置键盘焦点圈定与 Escape 关闭，满足模态可访问性基础：[dialog.tsx](file:///e:/code/ProjectNeoBlock/packages/ui/src/dialog.tsx)
- `Tooltip` 为非交互浮层，无法承载观战列表/地块操作，需要新增 Popover 组件：[tooltip.tsx](file:///e:/code/ProjectNeoBlock/packages/ui/src/tooltip.tsx)
- 分享图标已存在：`symbol_link` 位于 `packages/ui/assets/icons/symbol`（已被 icons registry 收录）
- 掷骰素材在 `packages/ui/assets/lucks/Point01.svg`~`Point06.svg`（需要在 web 中可用）

### 协议与服务端
- 当前 WS 协议无聊天/悄悄话命令与事件：[command.ts](file:///e:/code/ProjectNeoBlock/packages/shared/src/protocol/command.ts)
- 破产逻辑存在且会把资产回收至银行（债权人为 bank 时）：`bankruptcy/declared` 的 apply 逻辑见 [engine.ts](file:///e:/code/ProjectNeoBlock/packages/rules/src/engine.ts#L1919-L1971)
  - 但 `game/declareBankruptcy` 仅在 `await_debt` 阶段可用，无法满足“对局中任意时刻离开=资产归银行”

## Assumptions & Decisions (Locked)
- 观战允许未登录游客进入（玩家加入必须登录）
- 房间页全程隐藏 TabsBar 的 Tab 项目（准备态与对局态都隐藏）
- 对局中离开=强制破产，现金/地产/建筑等回收为银行资产
- 聊天/悄悄话不做持久化；仅在线实时广播 + 客户端保留最近 N 条用于短期回放

## Proposed Changes
### 1) AppShell：房间页 TabsBar 定制 + “你还有游戏进行中”提示
**Files**
- 修改 [app-shell.tsx](file:///e:/code/ProjectNeoBlock/apps/web/app/app-shell.tsx)
- 修改 [app-shell.css](file:///e:/code/ProjectNeoBlock/apps/web/app/app-shell.css)
- 新增 `apps/web/lib/active-game.ts`（localStorage 记录进行中房间）

**Implementation**
- TabsBar 渲染逻辑改为：
  - `pathname.startsWith('/room/')` 时：不渲染 tabItems；在 tabsbar 内渲染一个“返回首页”按钮（不作为 tab item，仅为左侧操作）
  - 其它路由：保持现有 tabItems
- “进行中对局提示”：
  - 房间页在 `game.status==='playing' && !selfMember.isSpectator` 时写入 `localStorage.nb_active_game = { roomCode, updatedAtMs }`
  - 房间页在“确认离开成功”时清理该 key；或当检测到自己变为 spectator/离开后清理
  - AppShell 在 `pathname==='/'` 且存在未过期 active_game（例如 2 小时内）时，在 topbar center 渲染 Special 样式按钮“你还有游戏进行中”，点击跳回 `/room/{roomCode}`

### 2) 房间准备态 UX：按钮重排、加入流程、分享/复制、离开确认
**Files**
- 修改 [room/[code]/page.tsx](file:///e:/code/ProjectNeoBlock/apps/web/app/room/%5Bcode%5D/page.tsx)
- 修改 [use-room-connection.ts](file:///e:/code/ProjectNeoBlock/apps/web/app/room/%5Bcode%5D/use-room-connection.ts)

**UI/Behavior**
- 移除准备态页面顶部说明文案（删除该 `<p>`）
- 标题行改造：
  - “房间 {code}”降级为更低层级样式（例如 20px/700）
  - 标题行右侧工具区（同一行）放置：
    - 复制房间号（仅 roomCode）
    - 分享按钮：纯图标按钮 `symbol_link`，优先 `navigator.share({ url })`，否则复制房间链接到剪贴板
    - 观战按钮：切换为 `?spectate=1` 进入观战（未登录允许）
    - 离开按钮：触发确认 Dialog（准备态文案：“确定退出房间吗？退出后需要重新加入才能继续游玩”）
    - 复制调试信息：保留，放入工具区
- TabsBar 内的返回首页按钮替代页面内“返回首页”
- “作为玩家加入”按钮改造：
  - 仅在准备态、且当前不是 spectator、且未加入房间时显示（或显示为“加入游戏”）
  - 点击后：
    - 未登录：`router.push('/login')` 打开登录模态
    - 已登录：直接 `POST /api/room/join { roomCode, mode:'account' }`，成功后触发 `refreshWebTemplate()` + 让 WS 连接以 user 身份 join（见下一条）
- 禁止匿名玩家加入（仅 player 模式）：
  - `useRoomConnection` 在 `options.mode==='player'` 时：若 `fetchActor()` 返回 `kind:'guest'`，则视为 `null`（不发起 WS join）
  - room page 对未登录状态不再展示“游客昵称/以游客身份进入”入口（保留观战可游客）

### 3) 对局态信息收敛 + 观战列表 Popover
**Files**
- 修改 [room/[code]/page.tsx](file:///e:/code/ProjectNeoBlock/apps/web/app/room/%5Bcode%5D/page.tsx)
- 新增 UI 组件 `packages/ui/src/popover.tsx` 并导出（见下一节）

**Implementation**
- 当 `room.status==='playing'`（或 `snapshot.game?.status==='playing'`）时：
  - 隐藏：房间信息、我的状态、邀请好友加入房间、玩家列表等准备态块
  - 标题行保留工具区按钮（分享/复制/离开/观战入口等）
- 观战列表：
  - 标题行提供“观战”按钮，在对局态点击后打开非模态 Popover，展示 spectators 列表（头像/昵称/数量）
  - Popover 支持键盘：Enter/Space 打开，Escape 关闭，Tab 正常流转；点击外部关闭

### 4) 新增 Popover 组件（供观战列表/地块详情/聊天面板复用）
**Files**
- 新增 `packages/ui/src/popover.tsx`
- 修改 `packages/ui/src/index.ts` 导出 `Popover`

**API Design**
- `Popover` 形态与 `Tooltip` 类似但可交互：
  - Props：`open?`, `defaultOpen?`, `onOpenChange?`, `content`, `children(trigger)`
  - 触发：click + keyboard（Enter/Space）
  - 关闭：Escape、点击外部、触发器再次点击
  - 定位：基于 trigger bounding rect 计算 fixed 定位（支持 top/bottom/left/right，默认 bottom）

### 5) BoardSkeleton：玩家横条、掷骰动画、点击地块 Popover
**Files**
- 修改 [board-skeleton.tsx](file:///e:/code/ProjectNeoBlock/apps/web/app/room/%5Bcode%5D/board-skeleton.tsx)
- 新增样式文件（优先局部）：`apps/web/app/room/[code]/room.css` 并在 page.tsx 引入
- 新增静态资源映射（两种方案二选一，执行时以可编译为准）
  - A（优先）：把 `packages/ui/assets/lucks/*.svg` 复制到 `apps/web/public/lucks/*.svg`，用 `/lucks/Point0X.svg` 引用
  - B：直接在 Next 客户端 `import` 这些 svg 并用 `next/image` 渲染（若 Next 对 workspace svg 静态导入可用）

**玩家面板横条**
- 把现有右侧 `<aside>` 玩家面板改为棋盘下方横向条：
  - 横向滚动（overflow-x: auto），每个玩家为紧凑 card（头像/颜色点/现金/位置/资产按钮）
  - 仍保留“详情 Dialog / 资产 Drawer”交互，但入口放在每个玩家卡片上

**掷骰动画**
- 当 `engine.lastDice` 变化时，在棋盘中心显示 2 个骰子面 SVG：
  - 进入动画：scale/rotate + fade-in；停留 900ms；fade-out
  - 无障碍：动画容器 `aria-live="polite"` 或隐藏但按钮有明确文案；图像 `alt=""` 并由旁边文本描述（例如“上次掷骰：2 + 6”）

**点击地块 Popover**
- tile cell 改为可点击按钮语义（或 `div role="button" tabIndex=0`）：
  - click/Enter 打开 Popover，内容包含：
    - 地块名称/序号
    - 功能地块说明（start/jail/goToJail/tax/chance/communityChest）
    - 资产地块：价格、归属、楼层、抵押状态
    - 若满足条件（例如 self 拥有且 `canAct` 且 phase 允许）：展示建房/卖房/抵押/赎回快捷按钮（复用现有 sendCommand）

### 6) 对局中离开：强制破产归银行 + 离开确认
**Files**
- 修改 `packages/shared/src/protocol/command.ts`、`validation.ts`
- 修改 `packages/rules/src/engine.ts`
- 修改 `apps/server/src/server.ts`
- 修改 [room/[code]/page.tsx](file:///e:/code/ProjectNeoBlock/apps/web/app/room/%5Bcode%5D/page.tsx)

**Protocol**
- 新增命令：`game/forfeit`（或 `game/forfeitToBank`），字段：
  - `roomId`, `gameId`, `playerId`
- Validation：校验 roomId/gameId/playerId，且仅允许游戏进行中、玩家未出局

**Rules Engine**
- 在 `step()` 中处理 `game/forfeit`：
  - 生成一个 `bankruptcy/declared` engine event，`DebtState` 形如 `{ debtorId, creditor:{kind:'bank'}, amount:0, reason:'forfeit' }`
  - 复用现有 applyEvent 的 `bankruptcy/declared` 分支完成资产回收
  - 之后按现有逻辑推进回合/检测结束（deriveEndEvents）

**Room Page**
- 对局态“离开房间”弹 Dialog 二次确认，文案包含“退出后你的资产将会归属银行”
- 确认后顺序：
  - 若自己是玩家且 game.status=playing：先发 `game/forfeit`，再发 `room/leave`
  - 同时 `POST /api/room/leave` 保持 Web 数据层 members 同步
  - 清理 `localStorage.nb_active_game`

### 7) 局内聊天/悄悄话（非持久化、悬浮消息）
**Files**
- 协议：`packages/shared/src/protocol/command.ts`、`event.ts`、`validation.ts`
- 服务端：`apps/server/src/server.ts`
- 前端：`apps/web/app/room/[code]/use-room-connection.ts`、`apps/web/app/room/[code]/page.tsx`、`board-skeleton.tsx`

**Protocol**
- 新增命令：`room/sendChat`
  - 字段：`roomId`, `playerId`, `text`, `toPlayerId?`（存在则视为 whisper）
- 新增事件：`room/chatMessage`
  - 字段：`messageId`, `roomId`, `gameId?`, `fromPlayerId`, `toPlayerId?`, `text`, `createdAtMs`
- Validation：
  - `text.trim().length` 1~200
  - `toPlayerId` 若存在必须为同房间成员
  - 基础频控（服务端处理）：例如同一 playerId 300ms 内最多 1 条（超限返回 error）

**Server**
- 处理 `room/sendChat`：
  - 校验发送者在 room.members 且非 spectator 也可发（是否允许 spectator 发言可在实现时固定为允许）
  - 生成 event 并广播：
    - 公聊：发给 room 全体连接
    - 悄悄话：仅发给 from 与 to（并在事件上保留 toPlayerId）

**Client**
- `useRoomConnection`：
  - 解析 `room/chatMessage` 并维护 `chatMessages`（ring buffer，例如 60 条）
  - 提供 `sendChat(text, toPlayerId?)` 帮助函数（内部发 command）
- UI：
  - 在对局态提供一个悬浮聊天入口（右下角 message 图标）
  - 展示为非模态 Popover：上方消息列表、下方输入框（Enter 发送，Shift+Enter 换行）
  - 新消息以轻量 toast 形式在棋盘上方短暂浮现（可关闭/自动消失）

## Verification (Executor Checklist)
### 手测（必须）
- 房间页（准备态）
  - TabsBar 不显示任何 tab item，显示“返回首页”按钮
  - 未登录点击“加入游戏”会弹登录模态；登录后可直接加入（不需要跳 /join）
  - 分享按钮可复制/分享房间链接；复制房间号按钮正常
  - 观战按钮可进入 `?spectate=1`；未登录允许观战
  - 离开房间弹确认；确认后回首页，再进入需要重新加入
- 对局态
  - 页面隐藏准备态信息块，仅保留棋盘+玩家横条+必要工具
  - 标题行“观战”按钮弹 Popover 展示观战列表
  - 掷骰触发时棋盘中心显示骰子动画并正确对应点数
  - 点击地块可弹 Popover 显示信息，键盘可用 Enter/Escape
  - 离开房间弹确认；确认后触发强制破产，资产回收；自己从对局中移除
- 聊天/悄悄话
  - 公聊能广播到房间所有在线用户
  - 悄悄话只对双方可见
  - 消息以悬浮方式展示，不阻挡主要操作

### 类型检查
- 在具备 Node/npm 的环境运行：`npm -w @neoblock/web run typecheck`

