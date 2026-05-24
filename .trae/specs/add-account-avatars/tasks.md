# Tasks

- [x] Task 1: 扩展 Profile 数据模型以支持头像
  - [x] 更新 apps/web/lib/store.ts 的 Profile 类型与读写兼容策略（旧数据字段缺失时按空处理）

- [x] Task 2: 扩展 /api/profile 以返回并维护 GitHub 头像信息
  - [x] 在 GET 时，若 session 中可获得 user.image，则写入/更新 profile.githubAvatarUrl
  - [x] 在返回体中包含 githubAvatarUrl/customAvatarDataUrl/avatarUpdatedAt

- [x] Task 3: 新增自定义头像上传/清除 API
  - [x] 新增 route：apps/web/app/api/profile/avatar/route.ts
  - [x] 支持 POST 设置 customAvatarDataUrl、DELETE 清除
  - [x] 校验：仅允许 png/jpg/jpeg/webp 的 dataUrl；限制最大长度（例如 150KB）；拒绝 svg

- [x] Task 4: 新增公开头像信息 API
  - [x] 新增 route：apps/web/app/api/profile/public/route.ts?userId=...
  - [x] 返回最小公开信息：displayName、avatarUrl（按 custom > github > null）、avatarKind
  - [x] 不返回 email 等敏感字段

- [x] Task 5: 前端增加 Avatar 展示与上传入口
  - [x] Profile 页面：显示当前头像（优先自定义）、提供上传与清除按钮、上传前本地校验与预览
  - [x] AppShell：右上角账号按钮显示头像（无头像时显示首字母占位）

- [x] Task 6: 全局用户卡片接入头像
  - [x] 房间玩家卡片/列表：为 userId 批量拉取 public 头像信息，并在 UI 渲染中展示
  - [x] Admin 用户列表：后端返回 avatar 字段并在 UI 渲染中展示
  - [x] 统一回退：无头像/加载失败时使用首字母圆形占位

- [x] Task 7: 构建与验证
  - [x] npm -w @neoblock/ui run build
  - [x] npm -w @neoblock/web run typecheck

- [x] Task 8: 对齐 customAvatarDataUrl 字段（spec/checklist）
  - [x] Profile 持久化保存/清除 customAvatarDataUrl（与现有文件存储方案可并存）
  - [x] /api/profile/avatar 在 POST/DELETE 时同步更新 customAvatarDataUrl
  - [x] /api/profile 与 /api/profile/public 返回结构包含 customAvatarDataUrl（或等价信号）并保持不泄露敏感字段

# Task Dependencies

- Task 5 依赖 Task 2/3
- Task 6 依赖 Task 4（房间/全局展示）与 Task 2/3（管理员/本人头像）
