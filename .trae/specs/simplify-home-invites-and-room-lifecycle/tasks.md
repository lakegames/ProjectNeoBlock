# Tasks

- [x] Task 1: 首页“与好友同玩”仅展示邀请
  - [x] 移除首页中“最近房间/好友正在游玩”卡片渲染分支，仅保留邀请列表与空状态
  - [x] 空状态包含：暂无邀请文案 + 刷新邀请按钮 + 跳转好友页按钮

- [x] Task 2: 邀请有效性与过期规则收敛
  - [x] 调整 `GET /api/game-invite/inbox`：只返回“未读+未忽略+未过期+房间未关闭”的邀请
  - [x] 明确 inviteTtlMs=7天（集中常量），并在接口返回时过滤

- [x] Task 3: 房间生命周期：同房间多局 + 自动关闭
  - [x] Web 数据层：拆分“房间状态”与“对战记录”
    - [x] 为已结束对局新增独立记录结构（含 roomCode、gameId、participants、endedAtMs、configSnapshot、hostId 等最小字段）
    - [x] 房间关闭后仍保留对战记录
  - [x] WS 生命周期：支持游戏结束后房间回到可开局状态并可生成新 gameId
  - [x] 自动关闭：当房间 members 为空持续 3 分钟，写入 closedAtMs（roomCode 失效），且邀请 inbox 视为无效

- [x] Task 4: 历史对局改为“仅我的对局”并支持删除（仅对我隐藏）
  - [x] 新增“历史记录删除”接口：对当前 uid 记录隐藏（不影响其他参与者）
  - [x] 调整历史对局页的数据源与过滤逻辑：仅展示我参与的记录，且剔除已隐藏
  - [x] 在历史对局卡片提供“删除”按钮

- [ ] Task 5: 验证与回归
  - [ ] Typecheck：`npm -w @neoblock/web run typecheck`
  - [ ] 手测：首页邀请列表与空状态；邀请过期/房间关闭过滤
  - [ ] 手测：一局结束后同房间再次开局；所有人退出后 3 分钟关闭房间但历史可见
  - [ ] 手测：历史对局仅展示本人记录，删除仅对本人隐藏

# Task Dependencies
- Task 2 depends on Task 1
- Task 4 depends on Task 3
