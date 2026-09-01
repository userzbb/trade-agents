# trade-engines 统一集成 — 设计文档

> 日期：2026-09-01 · 状态：待审阅
> 目标：trade-agents 插件作为统一控制面，调用 **Freqtrade**（方向性策略：回测/Hyperopt 验证 + 执行）与 **Hummingbot**（网格/做市/套利执行）两个引擎，实现「盘面分析 → 策略验证 → 自动化执行 → 记录复盘」的完整闭环。
> 本设计取代先前的 Hummingbot-only 设计（`2026-09-01-hummingbot-integration-design.md`），将其并入统一架构。

## 1. 最终目标与分工矩阵

| 层 | 组件 | 职责 | 角色 |
|---|---|---|---|
| 盘面情报 | trade-assistant 分析栈（scan/coin/ta/prob/solve + 策略KB + BM25） | 实时分析、信号 S1-S6、tier 分级、资金费率/多空比、参数求解、中文汇报 | **不变**（大脑） |
| 策略实验室 | **Freqtrade** | 方向性策略**回测 + Hyperopt 寻优**；验证后的策略 dry-run/实盘执行；REST API | 新增（验证+方向性执行） |
| 网格/做市/套利执行 | **Hummingbot** | 网格、做市、跨交易所套利、三重屏障等自动化执行 | 新增（自动化执行） |
| 控制面 | **binance-orchestrator**（trade-agents） | 路由到两个引擎的调用；汇报总结；CONFIRM 把关 | **扩展**（加路由） |
| 账本 | sync.mjs → D:\trade → 复盘/周报 | 记录、复盘 | **不变** |

**核心原则**：插件是**调用者/控制面**，不拥有引擎逻辑；Freqtrade 与 Hummingbot 是独立部署的引擎，各有自己的账号/风控。

## 2. 架构

```
[ trade-assistant 分析栈 ]（盘面情报/信号/参数，不变）
        │ S1-S6 想法、solve.mjs 参数
        ▼
[ binance-orchestrator ]（控制面：路由 + 汇报 + CONFIRM）
        │                                              │
        ▼ REST API                                    ▼ MCP
[ Freqtrade ]（方向性：回测/Hyperopt/执行）     [ Hummingbot ]（网格/做市/套利/三重屏障）
   Docker / pip + api_server                        Docker Desktop + hummingbot-api
        │ 执行流水                                        │ 执行流水
        ▼                                              ▼
                 币安 USDT-M 永续（子账户隔离）
```

- **Freqtrade**：`E:\freqtrade\freqtrade`；Python/Docker；`trading_mode=futures`、`margin_mode=isolated`；`api_server` 开 REST；`external_message_consumer` 支持 trade-assistant 注入信号。
- **Hummingbot**：`E:\hummingbot\hummingbot-api`（API+engine）+ `E:\hummingbot\mcp`（uv MCP）；`binance_perpetual`/`binance_perpetual_paper_trade`。
- **插件**：只加集成面（见 §4），不改分析栈。

## 3. 引擎选择依据

- 方向性择时（S1-S6、solve.mjs 止损止盈）→ **Freqtrade**（回测/Hyperopt 是其强项；trade-assistant 信号可经 external_message_consumer 注入）。
- 网格/做市/套利/三重屏障无人值守 → **Hummingbot**。
- 盘面情报（资金费率/多空比/盘口墙/tier/中文报告）→ **trade-assistant 保留**，两个引擎都不做。

## 4. 插件集成面

| 组件 | 改动 |
|---|---|
| `.mcp.json` | 加 `hummingbot-mcp`（uv/stdio，`${HUMMINGBOT_MCP_DIR}` 参数化） |
| `skills/trade-assistant/SKILL.md` | 加 **Engines Bridge** 小节（Freqtrade + Hummingbot 两小节），references 指南表加行 |
| `skills/trade-assistant/references/08-freqtrade-bridge.md` | 新建（英文）：REST API 用法、external_message_consumer 信号注入、回测/Hyperopt 命令、CONFIRM 作用域 |
| `skills/trade-assistant/references/09-hummingbot-bridge.md` | 新建（英文）：MCP 工具用法、controller↔playbook 映射、模拟盘、代理、CONFIRM 作用域 |
| `agents/binance-orchestrator.md` | 决策表加 Freqtrade + Hummingbot 两行 |
| `docs/architecture.md` / `docs/usage.md` / `README.md` | 架构、使用、依赖+部署方案 |
| 镜像 | skill 层同步 + `diff -rq` |

**CONFIRM 作用域**（两引擎统一）：策略级操作（部署/启停/调参/发起回测）需 CONFIRM；引擎内部挂撤单/止损由各自引擎风控管理。Freqtrade 的回测/Hyperopt 是只读分析，无需 CONFIRM。

**账户隔离**：Freqtrade 与 Hummingbot 各用独立币安子账户；binance-cli 手动账户另设——三者不共用 key。

## 5. 部署拓扑

| 引擎 | 目录 | 运行 | 端口/接口 | 币安访问 |
|---|---|---|---|---|
| Freqtrade | `E:\freqtrade\freqtrade` | Docker 或 pip venv | api_server `http://127.0.0.1:8080` | `HTTPS_PROXY=http://host.docker.internal:7897`（容器）/ 宿主机代理 |
| Hummingbot API | `E:\hummingbot\hummingbot-api` | Docker Desktop | `http://127.0.0.1:8000` | 容器内 `HTTPS_PROXY=http://host.docker.internal:7897` |
| Hummingbot MCP | `E:\hummingbot\mcp` | uv（Windows 原生） | MCP stdio | `HUMMINGBOT_API_URL=http://localhost:8000` |

## 6. 阶段分解（每阶段独立可测）

| 阶段 | 内容 | 验证门 |
|---|---|---|
| **A. Freqtrade 部署 + 回测演示** | Docker/pip 部署；config（futures/isolated/api_server）；下载 BTC-USDT 永续历史数据；跑一个 S1-S6 风格策略回测 | 回测输出胜率/收益/回撤；REST api_server 可访问 |
| **B. Freqtrade 集成进插件** | references/08、SKILL.md、orchestrator 行、docs | orchestrator 能调 Freqtrade REST（状态/回测）；中文汇报 |
| **C. Hummingbot 部署收尾** | 恢复 E:\hummingbot 部署（Docker 更新后）；`uv sync`；MCP 注册 | API 起来；MCP tools/list |
| **D. Hummingbot 集成进插件** | `.mcp.json`、references/09、SKILL.md、orchestrator 行、docs | MCP 注册可见；模拟盘 grid bot 全周期 |
| **E. 统一控制面** | orchestrator 双路由决策表完善；信号注入（分析→Freqtrade external_message_consumer）；CONFIRM 流程统一 | 一次会话内演示"分析→验证→部署→汇报"完整链路 |
| **F. 文档 + 收尾** | README（依赖+两引擎部署方案）、docs、镜像、一次提交 | 文档完整；插件回归绿；镜像同步 |

## 7. 验收标准

- [ ] Freqtrade 回测跑通并产出可读结果（胜率/收益/回撤/参数）
- [ ] Freqtrade REST api_server 可被 orchestrator 调用，中文汇报产出
- [ ] Hummingbot MCP 注册可见，模拟盘 grid bot 全周期经 orchestrator 成功
- [ ] 统一控制面：一次会话演示 分析→验证→部署→汇报 完整链路
- [ ] 插件测试 19/19；`node --check` 全绿；镜像 `diff -rq` 仅分发专属
- [ ] README 含两引擎依赖 + 部署方案；CONFIRM 作用域写入 SKILL.md
