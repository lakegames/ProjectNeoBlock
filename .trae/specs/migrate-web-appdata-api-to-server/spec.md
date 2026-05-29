# 迁移 Web AppData API 到 Render Server Spec

## Why

当前 `apps/web` 的多组 `/api/*` 路由依赖文件型 `store.ts`（写入 `.data/neoblock.json`）。在 Vercel Serverless 运行时该写入不可依赖且无法跨实例共享，导致 500、数据不一致与多人无法互相看到房间/邀请等问题。

## What Changes

- 将依赖 `lib/store.ts`（AppData/房间/邀请/配置/资料/历史对局）的 Web API 能力迁移到 `apps/server` 常驻进程中提供（HTTP JSON）。
- `apps/web` 侧保留原有 `/api/*` 路由路径与响应结构，但实现改为“转发/代理到 Render Server”，以避免前端大量改动与跨域问题。
- 增加代理鉴权：Web → Server 的转发请求必须携带共享密钥（环境变量），防止外部伪造写入。
- 代理上下文显式传递：账号 uid / displayName / guest identity 由 Web 侧解析后传给 Server（Server 不再依赖 NextAuth）。

## Impact

- Affected specs: 线上部署可用性（Vercel）、多人一致性、房间/邀请/资料/配置的持久化来源
- Affected code:
  - `apps/server/src/server.ts`（新增/开放 HTTP API 路由入口）
  - `apps/server/src/*`（新增 AppData 存储与业务实现）
  - `apps/web/app/api/**/*`（从本地 store 改为代理转发）
  - `apps/web/lib/store.ts`（仅本地开发可继续使用；生产不再作为权威数据源）

## ADDED Requirements

### Requirement: Server 提供 AppData HTTP API

系统 SHALL 在 `apps/server` 提供一组 HTTP JSON API，用于房间/邀请/资料/配置/历史对局等操作，作为线上环境的唯一数据源。

#### Scenario: 创建房间（账号/游客）

- **WHEN** Web 侧调用 `/api/room/create`
- **THEN** Web 侧将请求代理到 Server
- **AND THEN** Server 返回与现有 `/api/room/create` 等价的 JSON（roomCode/link/room）
- **AND THEN** 若创建/加入产生了新 guest identity，Web 侧 MUST 在自身域名下写入 guest cookie

### Requirement: Web 路由代理保持兼容

系统 SHALL 保持 `apps/web/app/api/**/*` 的对外路径与响应结构不变（或仅做向后兼容的扩展），以确保前端页面无需改动即可工作。

### Requirement: 代理鉴权

系统 SHALL 要求 Web→Server 的代理请求携带共享密钥。

#### Scenario: 无密钥访问

- **WHEN** 外部直接请求 Server 的 AppData API 且未携带有效密钥
- **THEN** Server 返回 403

## MODIFIED Requirements

### Requirement: AppData 存储位置

系统 SHALL 在生产环境以 Render Server 为权威写入点，不再依赖 Vercel 实例本地文件系统的可写性与共享性。

## REMOVED Requirements

无
