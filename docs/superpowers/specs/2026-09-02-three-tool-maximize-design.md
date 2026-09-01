# 三工具最大化利用 — 设计文档

> 日期：2026-09-02 · 状态：待审阅
> 目标：在 `D:\claude-dev\agents\trade-agents` 插件内，最大化利用三个强依赖工具（Freqtrade / Hummingbot / /binance+cli）的功能，通过三层能力（验证 / 执行 / 监控）增强现有三工具编排。
> **开发范围（唯一开发对象）**：`D:\claude-dev\agents\trade-agents`。
> **镜像 `D:\claude-dev\skills\trade-assistant` 与 `plugins/trade-plugin` 均已弃用**：**镜像完全不用管**（不同步、不维护）；`plugins/trade-plugin` 完全不碰。

## 1. 背景

功能盘点确认插件当前只用了每个工具的一小部分能力：
- **Freqtrade**：只用了回测 + dry-run；未用 Hyperopt 寻优、forceenter 注入、WS 信号流、动态 pairlist、custom_stoploss、protections/locks。
- **Hummingbot**：只用了基础 grid；未用 8 类 executors、V2 回测、funding-rate 套利、盘口流动性查询。
- **/binance**：只用了 6 个公开端点 + 3 个账户调用；未用 OI、taker 成交、账户级 LS、原子多单、TWAP、子账户管理。

本设计把未用能力按"验证 / 执行 / 监控"三层接入插件工作流。

## 2. 架构

```
分析栈（大脑）→ 路由到三工具
   ├─ 验证层（P2）  Freqtrade Hyperopt · Hummingbot V2 回测   → 上线前验证/寻优
   ├─ 执行层（P3）  forceenter · executors · 原子单/TWAP       → 信号→自动执行
   ├─ 监控层（P1）  WS 信号流 · OI/taker 确认 · 统一引擎看板   → 实时感知
   └─ 复盘层（已有） D:\trade 账本
```

## 3. 监控层（P1，先做）

| 能力 | 实现 | 接口 |
|---|---|---|
| **统一引擎看板** | 新脚本 `scripts/engines.mjs`：聚合 Freqtrade `/api/v1/status`+`/profit_all`、Hummingbot MCP `get_portfolio_overview`+`manage_bots`、binance `position.mjs` → 一张中文表 | `node scripts/engines.mjs` |
| **OI/成交确认** | `scan.mjs`/`coin.mjs` 增强：加 `open-interest`（趋势确认）+ `taker-buy-sell-volume`（主动盘确认）+ `top-trader-long-short-ratio-accounts`（账户级） | binance-cli 新增 3 个端点 |
| **WS 信号流** | Freqtrade message WebSocket（`analyzed_df`/`new_candle`）→ 实时信号轮询（作为后续信号注入的输入源） | REST/WS 文档化于 references/08 |

## 4. 验证层（P2）

| 能力 | 实现 | 接口 |
|---|---|---|
| **Freqtrade Hyperopt 桥** | 新脚本 `scripts/optimize.mjs`：读 solve.mjs 输出（信号/止损/止盈/tier）→ 生成 Freqtrade 策略参数 → 跑 `backtesting` + `hyperopt` → 返回优化 stop/TP/ROI/trailing 参数回填计划 | `node scripts/optimize.mjs <SYM> <side>`；结果中文汇报 |
| **Hummingbot V2 回测** | 新脚本 `scripts/backtest.mjs`：grid/position controller 配置 → `POST /backtesting`（REST 8000）→ 验证 net_pnl/drawdown/sharpe 再部署 | `node scripts/backtest.mjs <controller-config>` |

## 5. 执行层（P3）

| 能力 | 实现 | 接口 |
|---|---|---|
| **Freqtrade 信号注入** | orchestrator：S1-S6 信号 → `POST /forceenter`（enter_tag + leverage）→ `/forceexit`；CONFIRM | REST 8080 |
| **Hummingbot executors** | orchestrator：`manage_executors` 驱动 position/grid/DCA/TWAP/arbitrage/XEMM；CONFIRM | MCP |
| **binance 原子单/TWAP** | `place-multiple-orders`（进场+止损+止盈一次下）、`algo` TWAP 大单拆单、`new-algo-order` TP/SL、杠杆/保证金 | binance-cli |

## 6. 新脚本（零依赖，插件内 `scripts/`）

- `engines.mjs` — 三引擎统一中文看板（P1）
- `optimize.mjs` — Freqtrade Hyperopt 参数寻优桥（P2）
- `backtest.mjs` — Hummingbot V2 回测桥（P2）
- 全部：注释英文、输出中文、零 npm 依赖、`node --check` + 测试

## 7. CONFIRM 作用域

- **免 CONFIRM（只读）**：回测、Hyperopt、engines.mjs 看板、OI/taker 查询、WS 订阅、Hummingbot 回测。
- **需 CONFIRM**：forceenter/forceexit、executor 创建、binance 原子单/TWAP/杠杆、策略部署启停。
- 引擎内挂撤单：引擎风控。

## 8. 单账户协作（当前只有一个交易账号）

不采用多子账户隔离；三工具在**同一账号**按功能分工协作：
- **binance-cli**：分析 + 手动 CONFIRM + 账本真源（`sync.mjs`）。
- **Freqtrade**：方向性策略**验证**（回测/Hyperopt 只读，不占账号）。
- **Hummingbot**：网格/做市/套利**执行**（占账号，P3）。
- **协调规则**：同一时刻只部署**一个**自动化策略（或不同币对互不重叠）；手动单与引擎单错开币对/时段，避免双系统抢单。策略级部署仍走 CONFIRM。

## 8. 阶段与验收

| 阶段 | 内容 | 验收 |
|---|---|---|
| **P1 监控** | engines.mjs 看板 + OI/taker 增强 + WS 文档 | `node scripts/engines.mjs` 输出中文三引擎表；scan/coin 含 OI/taker；19/19 测试绿；提交 |
| **P2 验证** | optimize.mjs + backtest.mjs | optimize.mjs 产出优化参数中文汇报；backtest.mjs 跑通 Hummingbot 回测；提交 |
| **P3 执行** | forceenter + executors + 原子单/TWAP 工作流 | orchestrator 路由到引擎执行 + CONFIRM 流程；提交 |

**整体验收**：插件 19/19 测试绿、`node --check` 全绿、镜像同步零漂移、三阶段各自独立可测提交。
