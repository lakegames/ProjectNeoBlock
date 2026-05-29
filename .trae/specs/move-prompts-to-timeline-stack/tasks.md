# Tasks

- [x] Task 1: 梳理并定位现有三类模态实现
  - [x] 在 `board-skeleton.tsx` 中定位 buyOrAuction / auctionBid / debt 的 Dialog/Popover/UI 片段
  - [x] 明确每类提示当前发送的 command、校验条件（仅自己可操作 / 其他人只读）

- [x] Task 2: Prompt Stack 数据模型
  - [x] 定义 Prompt Stack 的渲染输入（来自 `engine.pendingPrompt` 与 `engine.debt`）
  - [x] 定义卡片顺序策略（推荐：debt > trade > auctionBid > buyOrAuction）
  - [x] 定义卡片“收起状态”的本地存储键（按 promptId / debtKey）

- [x] Task 3: Prompt Stack UI（非模态）
  - [x] 在右侧侧栏“事件时间轴”上方新增 Prompt Stack 容器
  - [x] 实现 buyOrAuction 卡片：信息展示 + 按钮（自己可操作，其他人只读）
  - [x] 实现 auctionBid 卡片：信息展示 + 出价输入 + 出价/弃权（自己可操作，其他人只读）
  - [x] 实现 debt 卡片：信息展示 + 处理入口（至少破产；其余沿用现有债务处理 UI）
  - [x] 实现卡片收起/展开（摘要行）

- [x] Task 4: 移除/替换原模态框
  - [x] 删除或禁用 buyOrAuction/auctionBid/debt 的 Dialog 触发与渲染
  - [x] 确保不会再出现遮罩型模态（同类提示仅通过 Prompt Stack 呈现）

- [x] Task 5: 验证
  - [x] 两开浏览器加入同一房间：一端触发 buyOrAuction/auctionBid/debt，验证两端布局一致且信息都可见
  - [x] 验证“自己可操作/他人只读”逻辑正确
  - [x] 验证时间轴可滚动且不被卡片遮挡；卡片收起/展开可用

- [x] Task 6: 将交易请求（trade）纳入 Prompt Stack
  - [x] 在 `board-skeleton.tsx` 中定位“收到交易请求”的模态框实现
  - [x] 在 Prompt Stack 中新增 trade 卡片（信息展示 + 接受/拒绝；他人只读等待态）
  - [x] 移除“收到交易请求”的模态框与其触发占位条
  - [x] 验证：两开浏览器加入同一房间，发起交易后接收方在 Prompt Stack 中处理，时间轴可继续滚动

# Task Dependencies

- Task 2 depends on Task 1
- Task 3 depends on Task 2
- Task 4 depends on Task 3
- Task 5 depends on Task 3, Task 4
- Task 6 depends on Task 4
