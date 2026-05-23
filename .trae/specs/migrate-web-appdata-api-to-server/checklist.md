- [ ] Render Server 提供 AppData HTTP API（/api/*），并启用代理密钥校验（无/错密钥返回 403）
- [ ] Web 侧 `/api/room/create`、`/api/room/join`、`/api/room/state` 已改为代理转发，线上不再 500
- [ ] Web 侧 `/api/profile`、`/api/profile/public` 已改为代理转发，线上不再 500
- [ ] Web 侧 `/api/game-invite/inbox` 已改为代理转发，线上不再 500
- [ ] 不同浏览器/不同用户创建与加入房间后，可在对方侧看到房间状态一致（跨实例一致性）
- [ ] Vercel/Render 环境变量配置齐全：`NEOBLOCK_SERVER_HTTP_URL`、`NEOBLOCK_PROXY_KEY`

