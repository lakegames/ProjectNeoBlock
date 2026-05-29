# 标准 40 格测试棋盘 Spec

## Why

当前内置棋盘格子数量过少（仅少量地产/事件格），导致很多游戏流程（长路径移动、地产组、监狱/去监狱、税、抽卡等）难以进行完整端到端测试。

## What Changes

- 新增一个“标准 40 格”棋盘配置，作为用于测试的内置棋盘文档。
- 该棋盘作为已发布配置出现在大厅的“棋盘”下拉框中，便于创建房间时选择。
- 保持现有默认棋盘与其他棋盘配置不变，仅做新增，不做替换与回滚。

## Impact

- Affected specs: 配置系统（棋盘）、大厅创建房间流程（选择棋盘版本）、对局内棋盘渲染（环形布局覆盖 40 格）
- Affected code:
  - apps/web/lib/config.ts（新增 full board 模板函数）
  - apps/web/lib/config-service.ts（seed：新增内置测试棋盘文档并发布）
  - apps/web/app/page.tsx（无需改动，已支持从已发布列表选择棋盘）

## ADDED Requirements

### Requirement: 内置标准 40 格测试棋盘

系统 SHALL 提供一个内置的“标准 40 格”棋盘配置（用于测试），并可被发布以用于创建房间。

#### Scenario: 内置棋盘出现在大厅可选项中

- **WHEN** 用户打开大厅页面
- **THEN** 系统应在“棋盘”下拉框中展示该测试棋盘（作为已发布配置）
- **AND** 用户可选择该棋盘创建房间

#### Scenario: 棋盘结构满足基础流程覆盖

- **WHEN** 使用该棋盘创建房间并进入对局
- **THEN** 棋盘应包含以下关键格子类型，以覆盖核心流程测试：
  - 起点（start）
  - 监狱（jail）与去监狱（goToJail）
  - 税收格（tax）
  - 抽卡格（chance / communityChest）
  - 多组地产（property），用于测试购买、租金、抵押、建房/卖房等

## MODIFIED Requirements

无

## REMOVED Requirements

无
