# 账号头像功能 Spec

## Why
目前账号系统只有 displayName，没有统一的头像能力，导致 AppShell、房间玩家卡片、管理后台用户列表等位置无法形成稳定的用户识别。

## What Changes
- 为账号 Profile 增加头像字段：支持 GitHub 头像作为默认来源，并支持用户上传自定义头像覆盖。
- 增加头像相关 API：获取公开头像信息、设置/清除自定义头像。
- 增加统一 Avatar 渲染能力：在 AppShell、Profile 页、房间玩家卡片、Admin 用户列表等“全局用户卡片”展示头像，并提供首字母占位回退。
- **BREAKING**：Button API 不再使用 tone/variant，改为 mode（此变更已在代码中进行迁移；本 spec 不重复展开实现细节，仅作为依赖背景）。

## Impact
- Affected specs: 账号资料（Profile）、AppShell 顶栏、房间 UI（玩家列表/卡片）、Admin 用户列表
- Affected code:
  - 数据模型：apps/web/lib/store.ts（Profile）
  - Profile API：apps/web/app/api/profile/route.ts
  - 新增 Profile Public API：apps/web/app/api/profile/public/route.ts（新）
  - 新增 Avatar API：apps/web/app/api/profile/avatar/route.ts（新）
  - Profile UI：apps/web/app/profile/page.tsx
  - AppShell：apps/web/app/app-shell.tsx
  - 房间 UI：apps/web/app/room/[code]/board-skeleton.tsx、apps/web/app/room/[code]/page.tsx
  - Admin UI：apps/web/app/admin/page.tsx、apps/web/app/api/admin/user/list/route.ts

## ADDED Requirements
### Requirement: 账号头像（GitHub + 自定义覆盖）
系统 SHALL 支持账号头像显示：默认使用 GitHub OAuth 提供的头像（若可用），并允许用户上传自定义头像覆盖默认头像。

#### Scenario: GitHub 头像作为默认
- **WHEN** 用户通过 GitHub 登录
- **THEN** 系统应能获取到该用户的 GitHub 头像 URL（若 NextAuth session 可提供），并作为默认头像来源
- **AND** 若用户未上传自定义头像，则所有展示头像的位置应显示 GitHub 头像

#### Scenario: 上传自定义头像覆盖
- **WHEN** 用户在“账号资料”页面选择图片并提交上传
- **THEN** 系统应保存该自定义头像并在所有展示头像的位置优先显示该自定义头像

#### Scenario: 清除自定义头像回退
- **WHEN** 用户清除自定义头像
- **THEN** 系统应回退到 GitHub 头像（若可用），否则回退到首字母占位

### Requirement: 头像回退（首字母占位）
系统 SHALL 在头像缺失、加载失败或不可用时，以“首字母圆形占位”回退渲染。

#### Scenario: 无头像/失败回退
- **WHEN** 用户没有 GitHub 头像且没有自定义头像，或头像 URL 加载失败
- **THEN** 系统应使用 displayName（或其回退）生成首字母占位

### Requirement: 公开头像信息接口
系统 SHALL 提供“公开头像信息”接口，用于在房间玩家卡片、管理员用户列表等位置展示其他用户头像信息。

#### Scenario: 公开查询
- **WHEN** 前端以 userId 请求公开头像信息
- **THEN** 返回信息仅包含展示所需字段（例如 displayName、avatarUrl、avatarKind），不返回 email 等敏感字段

### Requirement: 上传校验与大小限制
系统 SHALL 对自定义头像上传进行校验与限制，避免存储膨胀与 XSS 风险。

#### Scenario: 类型与大小校验
- **WHEN** 用户上传非图片（或 SVG）/超出大小限制的内容
- **THEN** 接口返回错误并拒绝保存

## MODIFIED Requirements
### Requirement: Profile 数据模型
Profile SHALL 扩展为包含头像相关字段（可为空）：
- githubAvatarUrl?: string
- customAvatarDataUrl?: string
- avatarUpdatedAt?: string

系统 SHALL 保持对旧数据文件的兼容（旧 Profile 没有头像字段时仍可正常读取，并按空值处理）。

### Requirement: /api/profile GET 的返回结构
/api/profile GET SHALL 返回 profile（包含头像字段）以及 friends，并在可获取到 session.user.image 时更新 profile.githubAvatarUrl。

## REMOVED Requirements
无

