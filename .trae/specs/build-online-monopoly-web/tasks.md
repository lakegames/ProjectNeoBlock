# Tasks

- [x] Task 1: 初始化项目结构与基础工程化
  - [x] SubTask 1.1: 建立 monorepo 目录结构（web/server/shared/rules/ui）
  - [x] SubTask 1.2: 配置 TypeScript、lint/format、基础 CI（仅跑测试与构建）
  - [x] SubTask 1.3: 定义共享协议与事件模型（对局快照、事件、命令、错误码）

- [x] Task 2: 账号体系与邀请/匿名加入
  - [x] SubTask 2.1: 接入成熟认证框架（第三方登录）
  - [x] SubTask 2.2: 实现账号资料与好友/邀请基础能力（最小可用：生成邀请链接或邀请码）
  - [x] SubTask 2.3: 实现匿名昵称加入（房间码 + 昵称），并与账号用户共存

- [x] Task 3: 房间大厅、房间参数与观战
  - [x] SubTask 3.1: 大厅页：创建房间/加入房间/查看基础房间信息
  - [x] SubTask 3.2: 房间页：玩家列表、准备/取消准备、房主开局、观战入口
  - [x] SubTask 3.3: 房间参数：玩家上限、回合时间、托管/AI开关（先做开关与校验，AI可延后）

- [x] Task 4: 权威联机同步与鲁棒性基建
  - [x] SubTask 4.1: WebSocket 通道：连接、鉴权、加入房间、广播
  - [x] SubTask 4.2: 断线重连：重连窗口、对局快照下发、事件增量补发
  - [x] SubTask 4.3: 指令校验与幂等：重复消息、乱序处理、超时与错误响应

- [x] Task 5: 规则引擎（可测试、可重放）
  - [x] SubTask 5.1: 对局状态机：回合/阶段建模（掷骰、移动、结算、交易/拍卖等）
  - [x] SubTask 5.2: 确定性随机：骰子与抽牌种子机制、可审计记录
  - [x] SubTask 5.3: 事件日志：由命令生成事件，事件应用到状态；支持回放重建状态
  - [x] SubTask 5.4: 单元测试：覆盖核心流程（移动、买地、收租、入狱/出狱、破产）

- [x] Task 6: 标准规则实现（完整版）
  - [x] SubTask 6.1: 地产/租金/成套加成与银行交互
  - [x] SubTask 6.2: 监狱规则与出狱卡
  - [x] SubTask 6.3: 机会/命运卡牌系统（牌堆、洗牌、回收、执行）
  - [x] SubTask 6.4: 交易系统（现金/资产交换，确认流程）
  - [x] SubTask 6.5: 拍卖系统（竞价、结算、超时处理）
  - [x] SubTask 6.6: 抵押/赎回（含利息/手续费可配置）
  - [x] SubTask 6.7: 建房/旅馆（均衡建造、库存限制、出售规则）
  - [x] SubTask 6.8: 破产清算与出局（对玩家/银行两类）

- [x] Task 7: 前端棋盘 UI 与设计系统
  - [x] SubTask 7.1: 建立设计系统包：主题变量、基础组件（Button/Input/Dialog/Drawer/Tooltip）
  - [x] SubTask 7.2: 棋盘渲染：格子、棋子动画、玩家面板、资产/现金展示
  - [x] SubTask 7.3: 交互与流程 UI：掷骰、购买/放弃、拍卖、交易、建房、抵押、卡牌展示
  - [x] SubTask 7.4: 可访问性与键盘基础支持（至少覆盖弹窗与关键按钮）

- [x] Task 8: 配置管理（规则/棋盘/卡牌）与版本化
  - [x] SubTask 8.1: 数据模型：棋盘、地产、租金表、卡牌、规则参数
  - [x] SubTask 8.2: 配置编辑 UI：表单编辑、校验提示、预览
  - [x] SubTask 8.3: 版本流转：草稿/发布/回滚与房间选择并在开局锁定

- [x] Task 9: 端到端验证与交付
  - [x] SubTask 9.1: 对局端到端脚本或测试：2-4 人完成一局到破产结算
  - [x] SubTask 9.2: 失败与恢复演练：断线重连、重复指令、观战加入中途对局
  - [x] SubTask 9.3: 最小部署说明与本地启动脚本（开发环境）

- [x] Task 10: 补齐端到端多人覆盖（3-4 人破产结算）
  - 当前 e2e 仅覆盖 2 人破产结算；需补齐 3 人与 4 人场景，确保规则与同步在多人下同样稳定
  - [x] SubTask 10.1: 新增 e2e：3 人完成一局至破产结算（断言 game ended + 至少 1 人出局）
  - [x] SubTask 10.2: 新增 e2e：4 人完成一局至破产结算（断言 game ended + 至少 1 人出局）
  - [x] SubTask 10.3: 将新用例加入 server 的 e2e 聚合入口（apps/server/test/e2e.test.ts）

# Task Dependencies

- Task 2 depends on Task 1
- Task 3 depends on Task 1, Task 2
- Task 4 depends on Task 3
- Task 5 depends on Task 1
- Task 6 depends on Task 5
- Task 7 depends on Task 1, Task 3, Task 4
- Task 8 depends on Task 1
- Task 9 depends on Task 2, Task 3, Task 4, Task 6, Task 7, Task 8
