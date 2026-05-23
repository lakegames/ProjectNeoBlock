# Tasks
- [x] Task 1: 暴露并保留最近事件列表
  - [x] 在 `use-room-connection` 中将 `recentEventsRef` 以 state/selector 的形式暴露给调用方（仅最近 N 条）
  - [x] 明确事件保留上限与排序规则（createdAtMs/seq）

- [x] Task 2: 事件 → 时间轴条目映射
  - [x] 在 web 侧新增一个纯函数映射层：输入 Event + 相关上下文（members/board）→ 输出可渲染条目（类型/标题/副标题/金额/时间）
  - [x] 覆盖 `game/playerMoved`、`game/moneyChanged`、`game/engine property/bought` 三类核心事件
  - [x] 为 `moneyChanged.reason` 实现可读化映射（buy/auction/rent/mortgage/redeem/build/sellBuilding/jailFine）
  - [x] 未识别 reason 使用通用兜底文案

- [x] Task 3: 棋盘右侧 Timeline UI
  - [x] 在 `board-skeleton` 对局视图右侧新增“事件时间轴”面板（对所有人一致可见）
  - [x] 支持滚动、固定高度、以及“最新在底部/顶部”的明确交互（在 Spec 中选定一种并实现）
  - [x] 新事件到来时追加展示；当用户停留在底部时自动滚动跟随（否则不抢滚动）

- [x] Task 4: 页面集成
  - [x] `room/[code]/page.tsx` 将 events 传入 `BoardSkeleton`
  - [x] 确保观战模式也能看到 Timeline

- [x] Task 5: 时间轴去重（购买/拍卖）
  - [x] 对 `property/bought` 与 `moneyChanged(reason=buy:/auction:)` 做去重或合并，避免同一成交出现两条几乎重复的记录

- [x] Task 6: 验证
  - [x] 本地启动后两开浏览器加入同一房间，验证两端 Timeline 内容一致
  - [x] 验证“移动/扣费/购买”至少各出现一次且文案正确（地产名可读）

# Task Dependencies
- Task 2 depends on Task 1
- Task 3 depends on Task 2
- Task 4 depends on Task 1
- Task 5 depends on Task 1, Task 2, Task 3, Task 4
- Task 6 depends on Task 1, Task 2, Task 3, Task 4, Task 5
