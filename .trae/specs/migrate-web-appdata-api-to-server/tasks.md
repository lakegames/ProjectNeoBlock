# Tasks
- [x] Task 1: 梳理需要迁移的 Web API 清单与兼容边界
  - [x] 列出所有依赖 `updateAppData`/`lib/store.ts` 的 `apps/web/app/api/**/*` 路由
  - [x] 标记“必须覆盖（影响创建/加入/资料/邀请/配置/历史）”与“可后置（admin/debug 等）”

- [x] Task 2: Server 侧新增 AppData 服务层（最小实现）
  - [x] 在 `apps/server` 增加 AppData 存储模块（最小可用：单实例内存 + 可选落盘路径）
  - [x] 抽出与 Web 侧等价的业务函数（create room/join/state/profile/invites/config 等），保持输入输出结构兼容
  - [x] 增加代理鉴权校验（共享密钥，缺失/错误返回 403）

- [x] Task 3: Server 侧开放 HTTP API 路由
  - [x] 在 `apps/server` 的 HTTP handler 中增加 `/api/*` 路由分发
  - [x] 覆盖 Task 1 标记为“必须覆盖”的路由集合
  - [x] 增加 `/api/config/published`（含 configDocs seed、templates 列表与 defaultTemplateVersionId），并保持代理鉴权保护

- [x] Task 4: Web 侧将 API 路由改为代理转发（保持路径不变）
  - [x] 新增一个通用的 proxy helper（转发 method/body/query/headers，附加代理鉴权与 actor 上下文）
  - [x] 将 `apps/web/app/api/**/*` 中“必须覆盖”的路由改为调用 proxy helper
  - [x] guest cookie：对于会创建 guest identity 的路由，确保由 Web 侧写 cookie（Server 仅返回 payload）

- [ ] Task 5: 部署配置
  - [ ] Render：配置 `NEOBLOCK_PROXY_KEY`（以及必要的存储路径/开关）
  - [ ] Vercel：配置 `NEOBLOCK_PROXY_KEY`、`NEOBLOCK_SERVER_HTTP_URL`（指向 Render Server Base URL）

- [ ] Task 6: 验证
  - [ ] 线上：创建房间、加入房间、查询房间状态在不同用户/不同浏览器下可互相可见
  - [ ] 线上：`/api/profile` 与 `/api/game-invite/inbox` 不再 500
  - [ ] 线上：未携带代理密钥直接访问 Server 的 AppData API 返回 403

- [x] Task 7: 修复 Vercel 构建阻塞（ESLint）
  - [x] 修复 `apps/web/app/api/room/create` 与 `apps/web/app/api/room/join` 中 `newGuest` 处理的 `no-unused-vars` 报错
  - [x] 触发 Vercel 构建确认通过

# Task Dependencies
- Task 2 depends on Task 1
- Task 3 depends on Task 2
- Task 4 depends on Task 1, Task 2, Task 3
- Task 5 depends on Task 3, Task 4
- Task 6 depends on Task 5
- Task 7 depends on Task 4
