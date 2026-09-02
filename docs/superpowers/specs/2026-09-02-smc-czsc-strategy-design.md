# 🔄 交易策略扩展参考计划 — SMC + 缠论 双共振（决策用）

> **本文档用途**：发给决策 Agent（Claude Code / 核心决策助手），作为其制定**正式、可执行的代码开发与联调计划**的输入。Agent 需先读本文档并核对本仓库真实代码（`D:\claude-dev\agents\trade-agents`），再输出正式开发计划。
>
> **制定日期**：2026-09-02 · **项目**：trade-agents（GitHub `userzbb/trade-agents`）

---

## 0. 项目现状（Agent 必须先核实的事实）

### 0.1 架构：单插件 = 控制面，三工具 = 执行面

```
用户（中文交互）
  │
  ▼
trade-agents 插件（控制面，本仓库）──────────────────┐
  ├─ skills/trade-assistant/    分析大脑（唯一真相源）
  │   ├─ SKILL.md               三工具编排 + CONFIRM 协议 + Core Workflows A–F
  │   ├─ references/00–09       策略知识库（S1–S6 / 风控 / 引擎桥）
  │   └─ scripts/               16 个零依赖 Node 脚本（scan/coin/ta/prob/solve/…）
  ├─ agents/                    两个自治子任务 agent
  └─ mcp/binance-mcp-server.mjs 行情/账户 MCP（写操作 confirm:true）
  │
  ▼ 路由到三个工具
┌─────────────┬──────────────────┬──────────────────────┐
│ /binance    │ Freqtrade        │ Hummingbot           │
│ 手动执行     │ 方向性回测/执行    │ 网格/做市/套利/三重屏障  │
│ binance-cli │ REST 127.0.0.1:8080 │ MCP 8000 + uv        │
│ profile my-main │ Docker dry-run     │ Docker API + MCP      │
└─────────────┴──────────────────┴──────────────────────┘
```

### 0.2 关键事实（不可臆断，须以仓库为准）

| 项 | 值 | 依据 |
|---|---|---|
| 插件根目录 | `D:\claude-dev\agents\trade-agents`（**本地开发唯一范围**） | 用户明确；mirror 与 trade-plugin 已废弃 |
| 数据层 | `D:\trade`（`TRADE_HOME`）—— SQLite + 复盘/周报归档 | 独立 git 仓库，勿在插件改动里编辑 |
| Freqtrade | `E:\trade-bots\freqtrade`，Docker dry-run，REST `127.0.0.1:8080`，凭据 `freqtrader/hb_p1_ft_2026` | `references/08-freqtrade-bridge.md` |
| Hummingbot | `E:\trade-bots\hummingbot`，API `8000` + MCP（`HUMMINGBOT_MCP_DIR`），凭据 `admin/hb_p1_paper_2026`，P1 走 `binance_perpetual_paper_trade` 模拟盘 | `references/09-hummingbot-bridge.md` |
| 现有策略体系 | S1–S6 信号 + `solve.mjs`（蒙特卡洛止损止盈求解）+ `ta.mjs`（RSI/MACD/EMA/BOLL/ATR/背离）+ 三闸门（资金面→技术面→参数求解） | `references/00`、`01`、`05`、`scripts/` |
| 账户隔离 | Freqtrade / Hummingbot / binance-cli 各独立币安子账户，勿共享 key | SKILL.md / ref 00 |
| 语言边界 | Skill/refs/注释/agent 提示词 = 英文；**一切用户可见输出 = 中文** | CLAUDE.md 铁律 |
| 写操作 | 任何下单/启停/策略级部署先出完整计划表 → 用户模式 A/B → `CONFIRM` | SKILL.md 硬规则 |

### 0.3 引擎桥现状（新增策略的直接落点）

- **Freqtrade**（ref 08）：当前策略 `RsiMomentum.py`（demo）。`populate_indicators` 是策略内计算技术指标的标准位置；Freqtrade 的 DataFrame 为小写列（`date/open/high/low/close/volume`）。REST 提供 `pair_candles` / `analyzed_df` 读取策略算出的指标 → **这是 LLM 读取结构信号的路**。
- **Hummingbot**（ref 09）：V2 Controller 框架 + `manage_executors`。P1 已映射：区间/S6 → `grid_strike`、MM → `pmm_*`、三屏障 → `position_executor`、分层加仓 → `dca_executor`。官方 `hummingbot/dashboard`（365★）是 controller 基座。

---

## 1. 本次目标（用户已确认的三项决策）

1. **策略载体 = 引擎原生**：SMC/缠论策略写成 Freqtrade strategy 文件 + Hummingbot controller，模板源码放 trade-agents 仓库，部署到对应引擎目录。**不新增 Python MCP 桥接层**（否决 Gemini 的 L2 三层架构——与"集成现有三工具"意图冲突）。
2. **SMC + 缠论 同时接入**：两个信号引擎（`smartmoneyconcepts` + `czsc`）都纳入，不做单边先行。
3. **路由判定 = 保留 LLM + CONFIRM**：SMC/CZSC 只输出**结构信号**（趋势突破 vs 中枢震荡），由 LLM 依 references 决策表判定路由，写操作仍走 CONFIRM。**不做代码自动分流**。

---

## 2. 真实项目选型（GitHub 调研结论 — 不重复造轮子）

> 调研日期 2026-09-02。完整调研见本仓库决策记录。以下为采纳结论。

### 2.1 信号引擎库（直接复用，pip 即装）

| 库 | Star | License | 复用建议 | 关键约束 |
|---|---|---|---|---|
| **`waditu/czsc`**（缠论） | 5963 | Apache-2.0 | ✅ **直接复用**：分型→笔→中枢 + 220+ 信号（含一/二/三类买卖点 `cxt_third_bs_V230318` 等）+ `Signal/Event/Position` 事件体系 + `CzscTrader` 多级联立 + Rust 核心 + 原生 Binance（`czsc.connectors.ccxt_connector`）| ① **不实现"线段"**（笔中枢体系）；② 需将 K 线映射为 8 列 DataFrame（`dt,symbol,open,close,high,low,vol,amount`）；③ `pip install czsc`（Windows 有预编译 wheel，Python ≥3.10） |
| **`joshyattridge/smart-money-concepts`**（SMC） | 1971 | MIT | ✅ **直接复用**：`fvg / swing_highs_lows / bos_choch / ob / liquidity / previous_high_low / sessions / retracements`，小写 OHLCV DataFrame 直入 | ① **前视偏差（必须处理）**：`swing_highs_lows` 看未来 `swing_length//2` 根、`fvg` 看未来 1 根；Issue #101 实测去偏差后 PF 7.32→1.82；② OB 性能慢（大回测需分段）；③ **单维护者**，供应链风险 → `pip install smartmoneyconcepts==0.0.27` 锁版本 + 校验 hash，生产 fork/pin git SHA；④ import 打印横幅用 `SMC_CREDIT=0` 关闭 |

### 2.2 策略骨架（fork 起点，非全抄）

| 仓库 | 用途 | 建议 |
|---|---|---|
| `mikedigriz/freqtrade-strategy-mikedigriz` 的 `SmartMoney` 策略 | Freqtrade SMC 策略骨架（带币安回测参考） | **fork-adapt**：注意其回测胜率可能含前视偏差，须重建指标后重跑验证 |
| `freqtrade/freqtrade-strategies`（官方 5424★） | 策略结构模板（无 SMC/缠论） | 取结构，不取逻辑 |
| `hummingbot/dashboard`（官方 365★） | V2 Controller 基座（grid/MM 等内置） | **直接复用**作 controller 基础 |
| `MobiusQuant/OpenMobius-skill`（672★） | SMC+缠论知识卡 / AI 分析层 | 可选参考（知识层），非必需 |
| `Lzh-xbccz/hermes-finance`（22★） | "缠论作确认层 + 多证据维度"架构 | 架构参考（理念同构），不引依赖 |

### 2.3 明确不引入

- `kukapay/freqtrade-mcp`（139★）：Freqtrade REST→MCP，**已有 REST 编排**，不引入避免重复。
- SMC 专用 MCP（`smc-mcp` 等，≤2★）：雏形，不采用。
- **诚实声明**：SMC+缠论"融合信号引擎"与"双引擎自动分流路由"**均无成熟现成项目** → 融合在 LLM 层做（共振判定），不做独立引擎。

---

## 3. 目标架构（改动后）

```
现有部分（不动）
  trade-agents 插件 ──► /binance（手动）· Freqtrade · Hummingbot

新增部分（引擎内策略 + 插件内编排补充）
┌─────────────────────────────────────────────────────────────┐
│ trade-agents 插件（控制面 + 决策）                            │
│  ├─ references/10-smc-bridge.md      SMC 信号与判定规范      │
│  ├─ references/11-czsc-bridge.md     缠论信号与判定规范      │
│  ├─ references/00 更新                决策表加 SMC/缠论映射    │
│  ├─ SKILL.md 更新                    工具箱表/工作流 A–F      │
│  ├─ scripts/ 薄脚本                   读 Freqtrade analyzed_df │
│  │                                    → 输出结构信号 JSON      │
│  └─ strategies/（新增，模板源码）      Freqtrade 策略 .py      │
│  │                                    + Hummingbot controller │
│  ▼ 结构信号读取（REST pair_candles / analyzed_df）           │
│  ▼ LLM 共振判定 → 趋势→Freqtrade / 震荡→Hummingbot → CONFIRM │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┴─────────────────────┐
        ▼                                         ▼
┌─ Freqtrade 容器（E:\trade-bots）            ┌─ Hummingbot（E:\trade-bots）
│  strategies/SmcCzscTrendStrategy.py         │  controllers/czsc_range_controller.py
│  ├─ populate_indicators:                    │  ├─ 中枢上下沿 → grid_strike 边界
│  │   smc.*(df) 向量化                        │  ├─ liquidity sweep 无 CHoCH → 持仓
│  │   + czsc 结构信号（三买/三卖/中枢）         │  └─ 破中枢 → 停 controller + 提示趋势
│  └─ 入场: 三买/三卖 + BOS + FVG/OB 回踩      │
│  └─ 风控: trailing_stop / 6% 红线约束        │
│  Docker 内 pip install czsc                 │
│           smartmoneyconcepts==0.0.27        │
└───────────────────────────┴─────────────────┘
                            ▼
                     Binance 子账户 A/B
```

**关键点**：
- **信号计算在引擎内**（Freqtrade `populate_indicators` 直接消费其 DataFrame），trade-agents 只**读**结果 + 做**判定** → 零新增 Python 服务。
- 缠论计算较重：作为**决策用结构信号**（由 LLM 读），不作为每根 K 线强制触发；趋势入场主判据 = SMC（向量化、轻），缠论三买/三卖作**共振确认**。
- 路由是**人机协同**：脚本/策略输出结构信号 → LLM 结合 S1–S6 与资金面判方向 → 完整计划表 → 模式 A/B → CONFIRM。

---

## 4. SMC + 缠论 → 现有信号体系映射（核心策略逻辑）

### 4.1 共振判定矩阵（LLM 决策表，进 references）

| 场景 | 缠论条件 | SMC 条件 | 判定 → 路由 |
|---|---|---|---|
| **趋势爆发（追单）** | 放量脱离中枢，形成**三买/三卖**，或离开段力度极强 | 顺势 **BOS** 突破 + 回踩精准触及 **FVG / Order Block** | **趋势** → Freqtrade（backtest 验证 → 运行/forceenter），或手动追单 |
| **震荡盘整（做市）** | 价格在大级别**中枢区间**内反复，未形成有效离开段 | 关键流动性高低点之间**扫损（Liquidity Sweep）但无 CHoCH** | **区间** → Hummingbot（中枢上下沿 = 网格边界，grid_strike / 自建 controller） |
| **共振冲突** | 缠论三买 + SMC 无 BOS / 或 SMC 已 CHoCH 但缠论未走完 | — | 降级：保守处理（放弃或极小仓），不得强行入场 |

### 4.2 与现有 S1–S6 的关系（不推翻，只增强）

| 现有信号 | 增强 | 新增结构确认 |
|---|---|---|
| S1 负资金费率+动能突破（多） | 加 SMC BOS + 缠论三买确认 | 三买+BOS 双确认才高信心 |
| S2 健康回调（多） | 加 FVG/OB 回踩位 | 回踩进 FVG 区 |
| S3 追跌链（空） | 加缠论三卖 + BOS(空) | 三卖+BOS(空) |
| S4 派发破位（空） | 加 CHoCH 确认 | CHoCH 破位 |
| S6 区间伏击（唯一震荡合法入场） | **升级为缠论中枢 + SMC 无 CHoCH 双条件** | 中枢边界 + 扫损不破位 → Hummingbot |
| MM 币（BTR 类） | 不加结构信号（模型失效） | 维持 ref 04 博弈论判断 |

> **边界**：SMC/缠论结构信号对 T1 主流币有效；**T3 庄家币上结构与 TA 一样失效**，维持 ref 00/04 的"模型失效声明"，不因引入新信号放宽该边界。

### 4.3 前视偏差工程约束（硬性）

- 所有 SMC 信号在回测/实盘信号触发上**滞后 `swing_length//2` 根 K 线**（或等 swing 确认后再触发）。
- 缠论信号以已确认的笔/中枢为准，禁止用未闭合结构。
- 回测结论必须重跑（不得引用 fork 仓库里带偏差的胜率）。

---

## 5. 交付物清单（Agent 据此细化成开发计划）

### 5.1 trade-agents 仓库内（本地开发唯一范围）

| 文件 | 内容 | 类型 |
|---|---|---|
| `skills/trade-assistant/references/10-smc-bridge.md` | SMC 信号定义（BOS/CHoCH/FVG/OB/Liquidity）+ 判定矩阵 + 前视滞后规则 + 与 S1–S6 映射 | 新增 |
| `skills/trade-assistant/references/11-czsc-bridge.md` | 缠论信号定义（分型/笔/中枢/三买卖点）+ czsc 数据格式映射 + 与 S1–S6 映射 | 新增 |
| `skills/trade-assistant/references/00-core-playbook.md` | 决策表加"结构共振"行 + 模型失效边界重申 | 修改 |
| `skills/trade-assistant/SKILL.md` | 工具箱表、Core Workflows 加"结构信号读取与共振判定"步骤 | 修改 |
| `skills/trade-assistant/scripts/smc-signal.mjs` | 读 Freqtrade `pair_candles`/`analyzed_df` → 输出结构信号 JSON（趋势/震荡/共振强度） | 新增（零依赖） |
| `strategies/`（新增目录） | `SmcCzscTrendStrategy.py` 模板 + `czsc_range_controller.py` 模板（**源码真相源**，部署时拷到引擎） | 新增 |
| `docs/` | architecture/usage/development 同步更新 | 修改 |
| `tests/` | `smc-signal` 脚本单测 + evals 增加 SMC/CZSC 场景 | 新增 |

### 5.2 引擎内（部署物，非仓库 scope，但计划需覆盖）

| 引擎 | 部署内容 | 验证方式 |
|---|---|---|
| Freqtrade | `user_data/strategies/SmcCzscTrendStrategy.py`；Docker 内 `pip install czsc smartmoneyconcepts==0.0.27` | `download-data` → `backtesting`（无偏差数据）→ 报告胜率/收益/回撤 |
| Hummingbot | `controllers/czsc_range_controller.py`（中枢区间 grid）；或先用内置 `grid_strike` + 中枢边界参数验证 | 模拟盘 `binance_perpetual_paper_trade` 跑通 → 标注"模拟盘非实盘" |

---

## 6. 技术风险与对策（Agent 须纳入计划）

| 风险 | 等级 | 对策 |
|---|---|---|
| **SMC 前视偏差**虚高回测 | 🔴 高 | 信号滞后 `swing_length//2`；回测结论重跑；`causal` 参数未合并（Issue #95）需自行处理 |
| `smartmoneyconcepts` 单维护者供应链风险 | 🔴 高 | 锁 `==0.0.27` + 校验 hash；生产 fork/vendor + pin git SHA；禁自动升级 |
| `czsc` 不实现线段（笔中枢体系） | 🟡 中 | 接受简化（对机器交易足够）；如坚持线段级信号，评估补 `Vespa314/chan.py`（2051★）作对照信号 |
| czsc 依赖较重（pandas/polars/scipy/wbt…） | 🟡 中 | 只装进 Freqtrade 容器，不进插件 Node 栈；离线 DataFrame 回测避免网络依赖 |
| OB 计算性能慢 | 🟡 中 | 低频（≥1h）回测；分段处理；不进实时逐根触发 |
| 流式 OB 不稳定（Issue #93） | 🟡 中 | 已生成 OB 固化，不随新 K 线重算漂移 |
| 缠论在 Freqtrade `populate_indicators` 内重算开销 | 🟡 中 | 缠论信号作**决策层**（LLM 读 analyzed_df），不作每根触发；或后台预计算 |
| Docker 内装 Python 依赖需走代理 | 🟢 低 | 复用 `host.docker.internal:7897` 代理（ref 08 既有事实） |

---

## 7. 里程碑排期建议（4 个 Phase）

> Agent 可调整，但依赖顺序应保持。

**Phase 1 — 环境与 SMC 趋势策略验证**
- Freqtrade 容器装 `smartmoneyconcepts==0.0.27`（锁版本）；写 `SmcCzscTrendStrategy.py`（先 SMC 部分）
- 处理前视偏差 → 真实数据 `backtesting` → **诚实汇报**胜率/收益/回撤
- 产出：references/10-smc-bridge.md 初稿 + 可回测的 SMC 趋势策略

**Phase 2 — 缠论 czsc 接入 + 双共振**
- Freqtrade 容器装 `czsc`；写结构信号产出路径（analyzed_df 暴露缠论三买/三卖/中枢状态）
- `scripts/smc-signal.mjs` 读结构信号 → JSON
- 产出：references/11-czsc-bridge.md + 结构信号读取链路 + 共振判定矩阵

**Phase 3 — Hummingbot 中枢震荡 controller**
- `czsc_range_controller.py`（中枢边界 = 网格）；或先用 `grid_strike` + 中枢参数验证
- 模拟盘跑通 → 标注"模拟盘非实盘"
- 产出：可部署的中枢震荡 controller

**Phase 4 — 编排层收尾 + 双引擎联调**
- SKILL.md / ref 00 决策表 / docs / tests / evals 全部更新
- 端到端：结构信号 → LLM 共振判定 → 完整计划表 → CONFIRM → 对应引擎执行
- 19/19 存量测试保持绿 + 新增测试绿

---

## 8. 给决策 Agent 的任务清单（输出正式开发计划时需回答）

1. **策略实现**：`SmcCzscTrendStrategy.py` 的 `populate_indicators` 具体怎么写——`smc.swing_highs_lows → bos_choch → fvg → ob` 的调用顺序、参数（`swing_length` 选值、滞后处理）、以及缠论三买/三卖如何以事件形式暴露给 analyzed_df？给出可回测的代码骨架。
2. **前视偏差落地**：在 Freqtrade 回测与实盘两套路径里，"信号滞后 `swing_length//2`"具体落在哪（`populate_indicators` 的 shift？`populate_entry/exit_trend` 的确认条件？）？给出可验证（去偏差前后对比）的方案。
3. **数据桥**：Freqtrade analyzed_df / `pair_candles` 暴露哪些列？`scripts/smc-signal.mjs` 如何零依赖读取并转成中文结构信号 JSON？
4. **controller 设计**：`czsc_range_controller.py` 用 V2 Controller 怎么写（中枢边界 → grid levels）？还是先用内置 `grid_strike` 参数化验证更稳？
5. **编排**：共振判定矩阵进 references/00 的哪个位置？SKILL.md 工作流 A–F 哪一步插"结构信号读取"？evals 增加哪几条 SMC/CZSC 场景？
6. **依赖与安全**：Docker 内 `pip install` 的确切命令（含代理、锁版本、hash）？`requirements.txt` 放哪？
7. **排期细化**：把 Phase 1–4 拆成具体任务、依赖、验收标准、预估工作量。

---

## 9. 验收标准

- [ ] Freqtrade 容器内 `pip install czsc smartmoneyconcepts==0.0.27` 成功，回测在**去前视偏差**数据上运行并如实报告
- [ ] 缠论三买/三卖/中枢状态能从 analyzed_df 读出，`scripts/smc-signal.mjs` 输出中文结构信号 JSON
- [ ] Hummingbot 中枢震荡 controller（或 grid_strike 参数化验证）在模拟盘跑通，输出标注"模拟盘非实盘"
- [ ] references/10、11 + ref 00 决策表 + SKILL.md 全部更新，三处对齐（真相源）
- [ ] 存量 19/19 测试保持绿 + 新增测试/evals 绿
- [ ] 全程遵守：写操作 CONFIRM、语言边界、账户隔离、模型失效边界（T3 币不加结构信号）
