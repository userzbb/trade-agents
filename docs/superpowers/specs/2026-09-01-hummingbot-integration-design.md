# Hummingbot 集成 — 设计文档

> 日期：2026-09-01 · 状态：待审阅
> 目标：把 Hummingbot 作为「币安永续自动化执行引擎」集成进 trade-agents 插件，agent 承担控制面（汇报总结 + 调用工具），执行权交给引擎风控。
> 路径：混合部署（引擎/API 在 Docker Desktop，MCP 用 uv 跑 Windows 原生）。

## 1. 背景与目标

- **现状**：trade-agents 做分析 + CONFIRM 人工确认下单，**无任何自动化策略执行**（无网格 bot、无做市、无 TWAP、无无人值守风控持仓）。
- **用户决策（A：自动化）**：Hummingbot 在币安永续上无人值守跑策略；agent 出参数、部署、监控；执行交给引擎确定性风控。
- **Agent 角色**：控制面——汇报总结 + 调用工具，不自主决策。
- **市场**：币安 USDT-M 永续（`binance_perpetual` connector 已核实完整可用）。P1 用 `binance_perpetual_paper_trade` 模拟盘，零 API key。

## 2. 架构（混合部署）

```
[ trade-agents agent（Windows 原生）]   ← 控制面：汇报总结 + 调用工具
        │ MCP(stdio)
        ▼
[ hummingbot-mcp · uv 原生 Windows ]    ← HUMMINGBOT_API_URL=http://localhost:8000
        │
        ▼
[ hummingbot-api（Docker Desktop · Hyper-V）]  ← 含 engine；HTTPS_PROXY=http://host.docker.internal:7897
        │
     币安（模拟盘拉实时订单簿 / 实盘走代理）
```

- **引擎/API**：Docker Desktop（Cython 引擎 Windows 原生不可行；官方生产路径）。
- **MCP**：uv 原生 Windows stdio（你有 Python+uv；比 docker-run MCP 稳、少一跳网络）。
- **多账户（后续 P2）**：N 个 API 容器 + N 个 MCP 进程，按账户路由；P1 只做单账户。

## 3. 部署拓扑（P1）

**部署目录 `E:\hummingbot\`**：
1. `hummingbot-api`：`git clone` → `make setup`（设 API 用户名/密码）→ `make deploy`（Docker Compose，端口 8000）。
2. `hummingbot/mcp`：`git clone` → `uv sync`。

**集成进 trade-agents**（`D:\claude-dev\agents\trade-agents`）：

| 组件 | 改动 |
|---|---|
| `.mcp.json` | 新增 `hummingbot-mcp`（uv/stdio），路径用 `${HUMMINGBOT_MCP_DIR}` 参数化（不写死绝对路径），env `HUMMINGBOT_API_URL`/`USERNAME`/`PASSWORD` 经 `${...}` 注入 |
| `skills/trade-assistant/SKILL.md` | 新增 **Hummingbot Bridge** 小节；references 指南表加一行 |
| `skills/trade-assistant/references/08-hummingbot-bridge.md` | 新建：MCP 工具用法、controller↔playbook 映射、模拟盘模式、代理要求、CONFIRM 作用域（英文层） |
| `agents/binance-orchestrator.md` | 决策表新增 Hummingbot 行（bot 部署/状态/PnL 汇报 → 走 hummingbot-mcp） |
| `docs/architecture.md` / `docs/usage.md` | 架构与使用场景更新 |
| 镜像 `D:\claude-dev\skills\trade-assistant` | skill 层同步 + `diff -rq` 验证 |

## 4. CONFIRM 作用域（核心设计决策）

- **策略级操作 → CONFIRM**：部署/启动/停止 bot、调整参数。agent 展示完整计划（策略类型、交易对、资金、止损/止盈、风控上限），用户确认后 agent 才调 MCP 执行。
- **bot 内部 → 引擎风控**：挂撤单、止损止盈、仓位管理由引擎（三重屏障/网格规则）确定性执行，不逐单 CONFIRM。
- 写入 SKILL.md 与 orchestrator 作为硬规则。

## 5. P1 验证闭环（成功标准）

1. `claude mcp list` 见 `hummingbot-mcp`（由插件 `.mcp.json` 带起）；MCP `tools/list` 正常。
2. 模拟盘（`binance_perpetual_paper_trade`）部署第一个 controller → 启动 → `status` → 停止，**全程经 orchestrator 路由调用**。
3. 生成中文汇报（bot 状态 / 模拟 PnL / 仓位）。
4. 所有文档 + 镜像同步完成。

## 6. 错误处理

- 代理挂了 → engine 拉不到币安 → MCP 工具返回错误，agent 如实汇报，不编造数据。
- API 容器重启 → MCP 重连（401 已由 MCP 层清晰报错）。
- 模拟盘成交延迟/缺数据 → 明确提示「模拟盘，非实盘」。
- MCP 未注册/API 未起 → 检查 `HUMMINGBOT_MCP_DIR` 与 `HUMMINGBOT_API_URL` 环境变量。

## 7. 测试/验证

- MCP 冒烟：`initialize` → `tools/list` → 一个只读行情调用。
- 模拟盘 bot 全周期：创建 → 运行 → 状态 → 停止，每一步用 MCP 工具验证。
- `node --test tests/*.test.mjs` 回归保持 19/19（插件现有测试不受影响）。

## 8. 边界（P1 不做，列入后续阶段）

- **P2**：多账户编排（N 实例）、solve.mjs→controller 参数桥、网格/三重屏障策略接入 playbook。
- **P3**：铁律映射到引擎风控（6% 红线、tier 仓位乘数、插针缓冲）、全局 kill switch。
- **P4**：引擎执行流水 → `D:\trade` 数据层，纳入复盘/周报闭环。
- 全程不碰：condor、Gateway/DEX、Ubuntu 安装、WSL2 两个发行版。

## 9. 阶段分解

| 阶段 | 内容 | 依赖 |
|---|---|---|
| P1 | 基础设施部署 + 单账户模拟盘验证闭环 + 插件集成（本 spec 详述） | 无 |
| P2 | 多账户编排 + 策略桥（agent 分析 → controller 配置） | P1 |
| P3 | 风控映射 + kill switch | P2 |
| P4 | 记录闭环（引擎 → D:\trade → 复盘） | P2 |

## 10. 验收标准

- [ ] `claude mcp list` 见 `hummingbot-mcp`，MCP `tools/list` 可用
- [ ] 模拟盘 grid_strike controller 全周期（创建/运行/状态/停止）经 orchestrator 路由成功
- [ ] 中文汇报产出（bot 状态/模拟 PnL/仓位）
- [ ] 插件测试 19/19；`node --check` 全绿；镜像 `diff -rq` 仅分发专属
- [ ] CONFIRM 作用域规则写入 SKILL.md 与 orchestrator
