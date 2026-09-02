# Freqtrade SMC+缠论 趋势策略 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Freqtrade 引擎内落地 SMC+缠论 双共振趋势策略：容器加装 `smartmoneyconcepts==0.0.27` + `czsc==1.0.1`（官方 Dockerfile.custom 流程）→ 实测 1.0.1 真实信号 API → 写 `SmcCzscTrendStrategy.py`（SMC 三买/三卖+BOS+FVG 回踩 → 趋势入场；去前视）→ 真实数据回测并如实报告。

**Architecture:** Freqtrade 策略在 `populate_indicators` 内直接消费其小写 OHLCV DataFrame 调用 `smartmoneyconcepts`（纯 pandas 向量化，直落零摩擦）；缠论 czsc（Rust 内核，作为 Python wheel 被策略 import）暴露三买/三卖/中枢结构信号供 LLM 与策略读取。策略模板源码放 trade-agents 仓库 `strategies/`，部署拷贝到引擎 `user_data/strategies/`。容器依赖走官方 `docker/Dockerfile.custom` + compose `build` 段（非往运行容器 pip）。写操作/策略部署仍走 CONFIRM（本 plan 只到回测，只读免 CONFIRM）。

**Tech Stack:** Freqtrade（Docker `freqtradeorg/freqtrade:stable`，容器内 Python 3.14.7）· smartmoneyconcepts==0.0.27 · czsc==1.0.1（cp310-abi3 wheel）· 币安 1h 数据 · 代理 `host.docker.internal:7897`（容器内）。

**Spec:** `docs/superpowers/specs/2026-09-02-smc-czsc-strategy-design.md`

## Global Constraints

- 本地仓库开发范围：仅 `D:\claude-dev\agents\trade-agents`（引擎 `E:\trade-bots\freqtrade` 是部署目标，改动不入本仓库 commit）。
- 依赖锁版：`smartmoneyconcepts==0.0.27`、`czsc==1.0.1`（官方 release，PyPI 核实 2026-08-09）。**禁止** 无锁 `pip install`；生产镜像 fork/vendor + pin git SHA。
- 信号函数名**不得臆断**：czsc 1.0.1 的信号名（master 已改 Rust 命名、1.0.1 可能仍 V 后缀）必须先容器内实测（Task 2 产出探针记录 `docs/superpowers/notes/czsc-1.0.1-api-probe.md`），后序任务引用该记录。
- SMC 前视偏差硬约束：`swing_highs_lows` 看未来 `swing_length//2` 根，策略里所有 SMC 信号在使用前按该滞后 shift，回测结论必须去偏差重跑。
- 语言：策略注释/文件 = 英文；一切用户可见输出 = 中文。代理走 `host.docker.internal:7897`（容器内）。账户隔离不变。
- 所有 `docker exec` 在 Windows Git Bash 下前缀 `MSYS_NO_PATHCONV=1`。

---

## 文件结构

| 文件 | 职责 | 动作 |
|---|---|---|
| `strategies/SmcCzscTrendStrategy.py`（repo 模板源码） | SMC+缠论 趋势策略 | Create |
| `docs/superpowers/notes/czsc-1.0.1-api-probe.md` | Task 2 探针记录（信号名契约） | Create |
| `skills/trade-assistant/references/10-smc-bridge.md` | SMC 信号判定规范（BOS/FVG/OB/前视滞后） | Create |
| `skills/trade-assistant/references/11-czsc-bridge.md` | 缠论信号判定规范（三买/三卖/中枢） | Create |
| `E:\trade-bots\freqtrade\docker\Dockerfile.custom` | 引擎镜像加依赖（部署目标） | Create（引擎侧） |
| `E:\trade-bots\freqtrade\docker-compose.yml` | 启用 build + 换策略名（部署目标） | Modify（引擎侧） |
| `E:\trade-bots\freqtrade\user_data\strategies\SmcCzscTrendStrategy.py` | 引擎实际运行副本 | Create（拷贝） |

---

## Task 1: 引擎容器加依赖（官方 Dockerfile.custom）

**Files:**
- Create: `E:\trade-bots\freqtrade\docker\Dockerfile.custom`（引擎侧部署）
- Modify: `E:\trade-bots\freqtrade\docker-compose.yml`（引擎侧部署）

**Interfaces:**
- Produces: 带 `smartmoneyconcepts==0.0.27` + `czsc==1.0.1` 的 freqtrade 镜像（Task 2 在其内探针）

- [ ] **Step 1: 写 Dockerfile.custom**

内容依据官方模板 `freqtrade/freqtrade` → `docker/Dockerfile.custom`（GitHub 核实）：`FROM freqtradeorg/freqtrade:stable`（我们现有镜像标签）+ `RUN pip install --user <pkg>`。锁版本：

```dockerfile
FROM freqtradeorg/freqtrade:stable

# smartmoneyconcepts: pin 0.0.27 (single-maintainer supply-chain risk → lock + hash check)
# czsc: pin 1.0.1 (official PyPI release 2026-08-09, Rust core, cp310-abi3 wheel)
RUN pip install --user smartmoneyconcepts==0.0.27 czsc==1.0.1
```

> 官方模板用 `--user` 是因为镜像默认非 root；不切 USER root 时 `--user` 是唯一可行路径。写完后 `docker build` 用代理（Docker Desktop GUI 代理已设 7897）。

- [ ] **Step 2: 启用 compose build + 换策略**

`E:\trade-bots\freqtrade\docker-compose.yml`：把注释掉的 build 段取消注释（官方模板原文）：
```yaml
    build:
      context: .
      dockerfile: "./docker/Dockerfile.custom"
```
并确认 `image:` 行仍在（build 覆盖 image 也可保留）。

- [ ] **Step 3: 重建容器**

Run: `cd /e/trade-bots/freqtrade && docker compose up -d --build`
Expected: 镜像构建成功（拉 base + pip 装两库）；`docker compose ps` 显示 freqtrade Up。构建期间 freqtrade 容器会短暂重启（dry-run，无真实仓，安全）。

- [ ] **Step 4: 验证 import**

Run:
```bash
MSYS_NO_PATHCONV=1 docker exec freqtrade sh -c 'python -c "import smartmoneyconcepts; import czsc; print(\"smc\", smartmoneyconcepts.__version__ if hasattr(smartmoneyconcepts,\"__version__\") else \"?\"); print(\"czsc\", czsc.__version__ if hasattr(czsc,\"__version__\") else \"?\")"'
```
Expected: 两库 import 无错，打印版本（或 ?）。

## Task 2: czsc==1.0.1 API 探针（信号名契约）

**Files:**
- Create: `docs/superpowers/notes/czsc-1.0.1-api-probe.md`

**Interfaces:**
- Consumes: Task 1 镜像
- Produces: czsc 1.0.1 实际暴露的信号名/结构 API 记录 —— Task 3 策略代码按此写

- [ ] **Step 1: 列出信号子模块与买卖点函数**

Run（容器内）:
```bash
MSYS_NO_PATHCONV=1 docker exec freqtrade sh -c 'python -c "
import czsc
print(\"version:\", getattr(czsc,\"__version__\",\"?\"))
from czsc import CZSC, Freq, format_standard_kline
print(\"core imports OK\")
# 列交易门面
from czsc import traders
print(\"traders:\", [x for x in dir(traders) if not x.startswith(\"_\")][:30])
# 尝试定位信号模块（1.0.1 可能 czsc.signals.* 或 czsc._native.signals.*，实测哪个存在）
for mod in [\"czsc.signals\", \"czsc._native.signals\", \"czsc._native.signals.cxt\"]:
    try:
        m = __import__(mod, fromlist=[\"*\"]); print(\"FOUND\", mod, [x for x in dir(m) if not x.startswith(\"_\")][:50]); break
    except ImportError as e: print(\"no\", mod, str(e)[:80])
"' 2>&1 | head -40`
```
Expected: 确定 1.0.1 信号模块真实路径 + 买卖点函数名（记录到探针文件）。

- [ ] **Step 2: 实测结构核心 API（CZSC/format_standard_kline）**

Run（容器内，用 mock 或最小 K 线）:
```bash
MSYS_NO_PATHCONV=1 docker exec freqtrade sh -c 'python -c "
from czsc import CZSC, Freq
# 最小 K 线喂 CZSC 验证对象构造与关键属性
bars=[{\"dt\":\"2026-01-01 00:00:00\",\"open\":100,\"close\":101,\"high\":102,\"low\":99,\"vol\":1000,\"amount\":0}]  # 至少 1 根示范；实际按 format_standard_kline 需要 RawBar
print(\"placeholder-needs-realtime-fill\")  # 探针记录将在此按实测结果写真实调用
"' 2>&1 | head -20`
```
> 若 `format_standard_kline` 要求标准 DataFrame 8 列（`dt,open,close,high,low,vol,amount` 等），此处实测确认列名与 `Freq` 枚举用法，记入探针文件。**探针记录须含**：①信号模块路径 ②三买/三卖函数名 ③结构对象属性 ④freq 周期枚举 ⑤`format_standard_kline` 输入列。全部以实测输出为准。

- [ ] **Step 3: 落盘探针记录并提交**

把实测结果整理写入 `docs/superpowers/notes/czsc-1.0.1-api-probe.md`（含失败尝试与最终可用调用），`git add` 提交：
```bash
git add docs/superpowers/notes/czsc-1.0.1-api-probe.md
git commit -m "docs(P2): czsc 1.0.1 API probe — signal names contract for SMC/CZSC strategy"
```
> 若某信号名探针失败，记录"该名不存在 + 备选路径"，不臆造。

## Task 3: SMC 信号桥（references/10 + 策略内 SMC 指标）

**Files:**
- Create: `skills/trade-assistant/references/10-smc-bridge.md`
- Create: `strategies/SmcCzscTrendStrategy.py`（先骨架+SMC 部分）

**Interfaces:**
- Consumes: Task 2 探针（缠论部分）+ smartmoneyconcepts 已知 API
- Produces: `populate_indicators` 输出的 SMC 列（`smc_bos`/`smc_choch`/`smc_fvg_top`/`smc_ob_top`…，已 shift 去前视）→ Task 4 用它写入场

- [ ] **Step 1: 写 references/10**

`10-smc-bridge.md` 内容（英文文档、中文判定表可放）：
- 信号定义：`swing_highs_lows(ohlc, swing_length)` / `bos_choch(ohlc, swings, close_break=True)` / `fvg(ohlc, join_consecutive=True)` / `ob(ohlc, swings)` / `liquidity(ohlc, swings)`（列名以 smartmoneyconcepts 0.0.27 实测返回为准）
- **前视滞后硬规则**：所有 SMC 信号使用前 `df[col] = df[col].shift(swing_length//2)`；禁止用未确认 swing 触发
- 判定矩阵：`三买+BOS+FVG回踩→趋势(多)` / `三卖+BOS(空)+FVG→趋势(空)` / `扫损无CHoCH→震荡(交 Hummingbot)`
- 模型失效边界：T3 庄家币不加结构信号（ref 00/04）

- [ ] **Step 2: 策略骨架 + SMC populate_indicators**

`strategies/SmcCzscTrendStrategy.py`（freight 标准 IStrategy）：
```python
# SmcCzscTrendStrategy — SMC(趋势) + czsc(缠论确认) 双共振方向策略（engine-native）
# Zero-lookahead: all SMC columns shifted by swing_length//2 before entry use.
from freqtrade.strategy import IStrategy
import pandas as pd
import smartmoneyconcepts.smc as smc  # smartmoneyconcepts==0.0.27

class SmcCzscTrendStrategy(IStrategy):
    timeframe = "1h"
    can_short = True
    stoploss = -0.06          # playbook 6% 红线（引擎侧兜底；ref 00）
    trailing_stop = True
    startup_candle_count = 200  # swing_length=50 → 需 ≥25+ 预热，保守 200
    # 调优参数（Hyperopt 可扫）
    swing_length = 50
    # freqtrade 回测要求返回 input df；指标列会进 analyzed_df 供 orchestrator 读
    def populate_indicators(self, df: pd.DataFrame, metadata: dict) -> pd.DataFrame:
        df = smc.swing_highs_lows(df, swing_length=self.swing_length)   # HighLow/Level
        df = smc.bos_choch(df, df, close_break=True)                    # BOS/CHOCH/Level/BrokenIndex
        df = smc.fvg(df, join_consecutive=True)                         # FVG/Top/Bottom/MitigatedIndex
        df = smc.ob(df, df, close_mitigation=True)                      # OB/Top/Bottom
        # 去前视：shift 未来 swing_length//2 根
        df["smc_bos_lag"] = df["BOS"].shift(self.swing_length // 2)
        df["smc_choch_lag"] = df["CHOCH"].shift(self.swing_length // 2)
        df["smc_fvg_top_lag"] = df["FVG_Top"].shift(self.swing_length // 2)
        df["smc_ob_top_lag"] = df["OB_Top"].shift(self.swing_length // 2)
        # czsc 缠论列占位：Task 4 依探针填充（此处只留结构，不臆造信号名）
        return df
    def populate_entry_trend(self, df, metadata):
        # 趋势多：BOS(多) 且 已回踩 FVG 区域（Task 4 依实际列名补全入场条件）
        return df
    def populate_exit_trend(self, df, metadata):
        return df
```
> **占位声明**：`populate_entry_trend` 完整条件与 czsc 列在 Task 4（探针结果已知后）补全；Task 3 只交付"可跑通的 SMC 指标 + references/10"，保证独立可验证（`python -c "import ast; ast.parse(open('strategies/SmcCzscTrendStrategy.py').read())"` 语法通过 + 容器内能 import）。

- [ ] **Step 3: 语法 + 容器可加载验证**

Run:
```bash
cd /d/claude-dev/agents/trade-agents
python -c "import ast; ast.parse(open('strategies/SmcCzscTrendStrategy.py',encoding='utf-8').read()); print('syntax OK')"
# 拷贝到引擎试加载（freqtrade 语法检查）
cp strategies/SmcCzscTrendStrategy.py /e/trade-bots/freqtrade/user_data/strategies/
MSYS_NO_PATHCONV=1 docker exec freqtrade sh -c 'cd /freqtrade && python -c "import sys; sys.path.insert(0,\"user_data/strategies\"); import SmcCzscTrendStrategy; print(\"strategy imports OK\")"'
```
Expected: syntax OK + strategy imports OK（此时 populate_entry_trend 返回空入场，属预期——Task 4 补全）。

## Task 4: 缠论 czsc 共振列 + 入场条件补全

**Files:**
- Modify: `strategies/SmcCzscTrendStrategy.py`
- Create: `skills/trade-assistant/references/11-czsc-bridge.md`

**Interfaces:**
- Consumes: Task 2 探针（czsc 1.0.1 信号名/结构 API）
- Produces: 完整共振入场/出场条件 + analyzed_df 暴露结构信号

- [ ] **Step 1: 依探针补 czsc 结构列**

在 `populate_indicators` 中，把 Task 2 探针实测的 czsc 调用接上（**函数名/列名一律抄自探针记录，不得猜测**）。结构形态（以探针实测为准，示例为 1.0.1 可能形态）：
```python
        # czsc 缠论共振 —— 调用名以 czsc-1.0.1-api-probe.md 实测为准
        # 用 format_standard_kline(df) 转 RawBar → CZSC(bars) → 取最新三买/三卖/中枢状态
        # 缠论列仅作确认（decision layer），不作逐根触发；与 SMC 列共振判定
        df["czsc_third_buy"] = 0    # 由探针确认的 czsc 信号 → 三买=1
        df["czsc_third_sell"] = 0
        df["czsc_zhongshu_top"] = df["close"].rolling(self.swing_length).max()  # 中枢上沿近似（占位，探针确认后替换）
        return df
```
> 若 czsc 结构计算成本高（笔/中枢需整段重算），采用"决策层"定位：策略内算一次、暴露到 analyzed_df，LLM/编排读，不作每根事件流。探针记录决定精确实现。

- [ ] **Step 2: 补全入场/出场条件**

共振逻辑（按 references/10+11 判定矩阵）：
```python
    def populate_entry_trend(self, df, metadata):
        # 趋势多：SMC BOS(多) 且 缠论三买 共振 → 入场（条件可再按探针列微调）
        long = (df["smc_bos_lag"] > 0) & (df["czsc_third_buy"] == 1)
        df.loc[long, "enter_long"] = 1
        short = (df["smc_choch_lag"] > 0) & (df["czsc_third_sell"] == 1)
        df.loc[short, "enter_short"] = 1
        return df
    def populate_exit_trend(self, df, metadata):
        return df  # 出场交由 trailing_stop + engine 兜底（本阶段）
```

- [ ] **Step 3: references/11 + 语法 + 拷贝引擎**

- `11-czsc-bridge.md`：三买/三卖/中枢定义、1.0.1 API 契约（抄探针）、共振判定矩阵、数据格式 8 列映射。
- 语法 + 容器加载验证同 Task 3 Step 3（syntax OK + strategy imports OK）。

## Task 5: 真实数据回测（去前视）+ 如实报告

**Files:**
- Run（引擎侧，只读免 CONFIRM）

- [ ] **Step 1: 下载数据（如缺）**

Run:
```bash
cd /e/trade-bots/freqtrade
MSYS_NO_PATHCONV=1 docker exec freqtrade freqtrade download-data --config /freqtrade/user_data/config.json --pairs BTC/USDT:USDT --timeframe 1h --timerange 20250101-20250701
```
Expected: 数据下载成功（代理走 host.docker.internal:7897）。

- [ ] **Step 2: 回测**

Run:
```bash
MSYS_NO_PATHCONV=1 docker exec freqtrade freqtrade backtesting --config /freqtrade/user_data/config.json --strategy SmcCzscTrendStrategy --timerange 20250101-20250701
```
Expected: 回测完成，输出胜率/收益/回撤。**如实汇报**——亏损是有效结果，不美化。

- [ ] **Step 3: 前视对照（诚实验证）**

Run 一次把 `swing_length//2` shift 注释掉的对照组（临时分支），对比去偏差前后 PF——记录差异到回测结论（预期：去偏差后显著下降，如调研 Issue #101 所示 PF 7.32→1.82 量级）。若两者差异过大或策略仍虚高，明确标注"信号含残余前视"，不当作有效策略推进。

## Task 6: 回归 + 提交（仓库侧）

**Files:** 全部（repo 内）

- [ ] **Step 1: 全量验证**

Run:
```bash
cd /d/claude-dev/agents/trade-agents
node --test tests/*.test.mjs 2>&1 | tail -4   # 存量 19/19 保持绿
for f in skills/trade-assistant/scripts/*.mjs mcp/binance-mcp-server.mjs; do node --check "$f" || echo "FAIL $f"; done
python -c "import ast; ast.parse(open('strategies/SmcCzscTrendStrategy.py',encoding='utf-8').read()); print('strategy syntax OK')"
```
Expected: 存量测试 0 fail、mjs 无 FAIL、strategy 语法 OK。

- [ ] **Step 2: 提交**

Run: `git add -A && git commit -m "feat(P2): SMC+CZSC Freqtrade trend strategy (references 10/11, strategy template, API probe)"`
Expected: 一次干净提交；工作树 clean（引擎侧改动 `E:\trade-bots` 不入本仓库）。

---

## 自审记录

- **Spec 覆盖**：spec §5.1 的 references/10、11 + `strategies/` 模板 → Task 3/4；§5.2 Freqtrade 部署 + 容器依赖 → Task 1/5；前视偏差 §4.3 → Task 3/5；诚实回测 §0.3 ref 08 → Task 5。
- **占位符**：Task 3 策略里 `populate_entry_trend` 与 czsc 列为**有意的契约占位**——由 Task 2 探针结果决定，探针是独立可验证任务（不臆断信号名）。references/10/11 是真实文档。Task 2 Step 2 的 CZSC 调用在探针时按实测写真实代码，非长期 TBD。
- **类型一致**：`swing_length`、`smc_*_lag` 列名、`czsc_third_buy/sell` 在 Task 3/4/5 一致；Dockerfile 锁版与 Global Constraints 一致。
- **范围**：本 plan 只到 Freqtrade 策略 + 回测（spec Phase 1+2）。Hummingbot 中枢 controller（Phase 3）与编排收尾（Phase 4，smc-signal.mjs/SKILL 更新）为后续独立 plan——每个独立可验证。
- **风险**：czsc 1.0.1 在 Python 3.14 容器的运行时兼容（abi3 wheel 应 OK，Task 1 Step 4 验证）；信号名与 master 不同（Task 2 实测锁定）；SMC 前视（Task 5 Step 3 对照）。
