# NeoBlock

在线大富翁（Monopoly-like）演示项目：Next.js Web + WebSocket 权威服务端 + 规则引擎（可重放）。

## 项目结构

- apps/web：Next.js Web（大厅/房间/棋盘 UI、配置管理、NextAuth 登录）
- apps/server：WebSocket 权威房间服务（断线重连、事件增量补发、幂等/乱序校验）
- packages/rules：规则引擎（事件日志、确定性随机、可回放）
- packages/shared：共享协议（命令/事件/快照/错误码）
- packages/ui：设计系统与主题变量

## 开发环境

### 依赖

- Node.js >= 20
- npm（建议使用 `npm ci`）

### 安装

```bash
npm ci
```

### 配置

Web 端环境变量（NextAuth / 登录相关）：

```bash
cp apps/web/.env.example apps/web/.env.local
```

建议把 `NEXTAUTH_SECRET` 从 `replace_me` 改为任意随机字符串（否则会有 NextAuth 警告）。

本地不配置第三方 OAuth 也可以体验登录：保持 `NEOBLOCK_DEV_CREDENTIALS=1`，即可在 `/login` 使用“用户名登录”。

### 启动（本地）

- 一键脚本（Windows PowerShell）：

```powershell
.\scripts\dev-local.ps1
```

- 一键脚本（macOS/Linux）：

```bash
./scripts/dev-local.sh
```

- 或直接启动：

```bash
npm run dev
```

启动后：

- Web: http://localhost:3000
- Server: http://localhost:3001
- WebSocket: ws://localhost:3001/ws

## 本地体验流程

### 1) 登录（可选）

- 访问 http://localhost:3000/login
- Dev Credentials（默认推荐）
  - 确保 `apps/web/.env.local` 中 `NEOBLOCK_DEV_CREDENTIALS=1`
  - 输入任意用户名并登录
- GitHub OAuth（可选）
  - 配置 `GITHUB_ID` / `GITHUB_SECRET` 后刷新 `/login`，使用 GitHub 登录

### 2) 创建房间与开局

- 打开 http://localhost:3000
- 使用“匿名创建”输入昵称，创建并进入房间
- 再开一个浏览器窗口/无痕窗口，使用“匿名加入”输入同一个房间码与昵称加入
- 两个玩家都点击“准备”，房主点击“房主开局”
- 开局后进入棋盘页面，可进行掷骰、购买/放弃、拍卖、交易、建房、抵押、卡牌等交互

### 3) 配置管理（可选）

- 访问 http://localhost:3000/config
- 可编辑 规则/棋盘/卡牌 的草稿，发布版本，回滚
- 创建房间时可选择版本；开局后参数会锁定

## 常用命令

```bash
# 启动全栈开发（shared/ui/server/web）
npm run dev

# 只启动 Web / Server
npm run dev:web
npm run dev:server

# 全仓类型检查
npm run typecheck

# 端到端测试（2/3/4 人破产结算 + 重连 + 幂等 + 观战）
npm run test:e2e
```

## 最小部署（本机/单机）

```bash
npm ci
npm run build
npm run start
```

部署时需要为 Web 配置 `apps/web` 下的运行环境变量（参考 `apps/web/.env.example`）。Server 端可通过 `PORT` 指定监听端口（默认 3001）。

## 端到端验证

端到端测试覆盖：

- 2/3/4 人加入房间、准备、开局、触发债务、破产清算、对局结束
- 断线重连（带游标增量补发）
- 重复指令（commandId 幂等）
- 观战中途加入与权限校验

运行：

```bash
npm run test:e2e
```

## 常见问题

### 登录相关警告（NEXTAUTH_URL / NO_SECRET）

- 确保 `apps/web/.env.local` 至少包含：
  - `NEXTAUTH_URL=http://localhost:3000`
  - `NEXTAUTH_SECRET=任意随机字符串`

### 预览容器/开发态 hydration 警告

开发预览环境可能会为 `html/body` 注入属性，导致 Next.js 在控制台输出 hydration warning。建议用 Chrome 直接访问 `http://localhost:3000` 进行排查，以避免预览环境噪声干扰。
