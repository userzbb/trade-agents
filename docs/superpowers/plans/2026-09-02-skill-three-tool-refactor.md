# trade-assistant Skill 三工具重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 trade-assistant skill 从"手动分析 + binance-cli 执行"模型，重构为**三工具编排**模型：分析栈（大脑）→ 路由到 /binance（手动 CONFIRM）、Freqtrade（方向性回测/执行）、Hummingbot（网格/做市/套利）。工作流、references（内容层）、evals 全部对齐。

**Architecture:** SKILL.md 顶层是"三工具路由"；references 00 承载决策框架，01-06 内容重写为三工具视角（信号→Freqtrade 策略参数、做市→Hummingbot controller、风控→引擎限额），08/09 是引擎桥（已建）；evals 重写覆盖三工具场景。Hummingbot MCP 冒烟故障作为前置修复。

**Tech Stack:** 插件 skill 层（Markdown/JSON，零依赖）。引擎已部署（Freqtrade REST 8080、Hummingbot API 8000 + MCP）。

**Spec:** `docs/superpowers/specs/2026-09-01-trade-engines-integration-design.md`

## Global Constraints

- 语言边界：SKILL.md/references/脚本注释英文；用户可见输出中文；docs 中文。
- 单真相源：`skills/trade-assistant/`，改后同步镜像 + `diff -rq`。
- 策略知识（S1-S6/风控/tier）**保留其核心**——重写是"对齐三工具视角"，不是删除策略逻辑。
- CONFIRM 作用域：策略级（引擎部署/启停）需 CONFIRM；回测/查询只读免；引擎内由引擎风控。
- 账户隔离：Freqtrade/Hummingbot/binance-cli 各用独立子账户。

---

## 文件结构

| 文件 | 职责 | 动作 |
|---|---|---|
| `skills/trade-assistant/SKILL.md` | 工作流重构为三工具路由 | Modify |
| `references/00-core-playbook.md` | 加「Three-Tool Decision Framework」路由章节 | Modify |
| `references/01-selection-and-signals.md` | S1-S6 信号 → 对齐 Freqtrade 策略/Hummingbot 条件 | Modify |
| `references/02-long-short-playbooks.md` | 方向性 playbook → Freqtrade 方向执行；均值回归 → Hummingbot 网格 | Modify |
| `references/03-risk-and-position.md` | 风控映射到引擎限额（solve→Freqtrade stoploss、6% 红线→Hummingbot 限额） | Modify |
| `references/04-market-maker-playbook.md` | 做市 → Hummingbot controller（pmm_mister 等）对齐 | Modify |
| `references/05-technical-analysis.md` | TA → Freqtrade 策略指标 + 手动 TA 双用 | Modify |
| `references/06-pyramid-and-psychology.md` | 金字塔 → 手动/Hummingbot DCA 对齐 | Modify |
| `references/07-trade-log-and-review-template.md` | 记账模板（引擎流水接入注记） | Modify（轻） |
| `evals/evals.json` | 重写为三工具场景 | Modify |
| `skills/trade-assistant/mcp/binance-mcp-server.mjs` | 无（不动） | — |

---

## Task 1: 修复 Hummingbot MCP 冒烟故障（前置）

**Files:** `E:\trade-bots\hummingbot\mcp`（外部）

- [ ] **Step 1: 复现并看完整异常**

Run:
```bash
cd /e/trade-bots/hummingbot/mcp
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n' \
  | HUMMINGBOT_API_URL=http://localhost:8000 HUMMINGBOT_USERNAME=admin HUMMINGBOT_PASSWORD=hb_p1_paper_2026 \
  uv run main.py 2>&1 | tail -25
```
Expected: 定位异常原因（先前在 `server.py:911 main()` 的 ExceptionGroup）。常见原因：stdlib 传输需 `uv` 正确启动、或环境变量/凭据校验。按异常修复（可能是 MCP stdio 传输的 Python 版本兼容）。

- [ ] **Step 2: 修复后重测 initialize + tools/list**

Run:
```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}\n' \
  | HUMMINGBOT_API_URL=http://localhost:8000 HUMMINGBOT_USERNAME=admin HUMMINGBOT_PASSWORD=hb_p1_paper_2026 \
  uv run main.py 2>&1 | grep -E '^\{"jsonrpc"' | head -2
```
Expected: initialize + tools/list 两行 JSON-RPC 响应。若仍失败，按 README 的 Docker/stdio 配置对比修正启动方式。

## Task 2: SKILL.md 工作流重构（三工具路由）

**Files:**
- Modify: `skills/trade-assistant/SKILL.md`

**Interfaces:**
- Produces: 后续 Task 3-4 引用的路由规则与工作流

- [ ] **Step 1: 定位现有 Core Workflows（A 文档生成 / B 分析）**

把 `## Core Workflows` 重构为**三工具路由**结构：
- `### A. Analysis (feeds all three)` — 分析产出信号/参数（保持 scan/coin/ta/prob/solve），但明确"产出喂给路由层"。
- `### B. Route to a tool` — 决策表：分析结果 → 选工具（手动 /binance、Freqtrade、Hummingbot），引用 `references/00` 的 Decision Framework。
- `### C. Freqtrade workflow` — 回测/验证/运行方向性（已加，微调对齐路由）。
- `### D. Hummingbot workflow` — 部署/查询（已加，微调）。
- `### E. Manual /binance workflow` — 主观交易 CONFIRM 流（现有，明确归到三工具之一）。

确保每节引用对应的 references（00 路由、08/09 桥）。

- [ ] **Step 2: 校验 SKILL.md 结构自洽**

Run: `grep -n "^### \|^## " skills/trade-assistant/SKILL.md`
Expected: 三工具路由 → 各工具工作流小节齐全，无悬空引用。

## Task 3: references 内容层重写（三工具视角）

**Files:**
- Modify: `references/00-core-playbook.md` … `07-trade-log-and-review-template.md`

**Interfaces:**
- Consumes: Task 2 的路由框架
- Produces: 决策路由规则 + 各 reference 的三工具对齐

- [ ] **Step 1: `00-core-playbook.md` — 加「Three-Tool Decision Framework」**

新增章节（英文），内容：
- 何时手动 `/binance`（主观判断/量小/需要人盯）vs **Freqtrade**（方向性信号可回测、要验证参数、要无人值守方向执行）vs **Hummingbot**（网格/做市/套利、均值回归、双边挂单）。
- 决策规则：信号类型 S1-S6 分类 → 映射（趋势类→Freqtrade；网格/做市条件→Hummingbot；主观/低流动性→手动）。
- CONFIRM 作用域（策略级 vs 引擎内）重申。

- [ ] **Step 2: `01-selection-and-signals.md` — 信号对齐引擎**

每个 S1-S6 信号：标注"适合 Freqtrade 回测/策略"（给出对应 Freqtrade 策略形态/指标）或"适合 Hummingbot 条件"（如区间震荡→网格）。保留信号判定逻辑（大脑），新增"执行路由"列。

- [ ] **Step 3: `02-long-short-playbooks.md` — 执行对齐**

方向性（趋势）→ Freqtrade 方向执行（stoploss/trailing 对齐 solve.mjs 输出）；均值回归/区间 → Hummingbot 网格。保留原有 playbook 参数（入场/风控），新增路由标注。

- [ ] **Step 4: `03-risk-and-position.md` — 风控映射**

新增映射表：`solve.mjs` 止损止盈 → Freqtrade `stoploss`/`trailing_stop`/`minimal_roi`；6% 红线/tier 仓位乘数 → Hummingbot controller 资金上限/`position_executor` 三重屏障。

- [ ] **Step 5: `04-market-maker-playbook.md` — 对齐 Hummingbot**

做市/插针/庄家博弈 → Hummingbot `pmm_mister`/`grid_strike` controller 对齐。保留博弈论内容，新增"如何用 Hummingbot 落地"。

- [ ] **Step 6: `05-technical-analysis.md` — TA 双用**

`ta.mjs` 输出：手动判断 + 作为 Freqtrade 策略指标（RSI/MACD/EMA 进策略 `populate_indicators`）。

- [ ] **Step 7: `06-pyramid-and-psychology.md` — 金字塔对齐**

手动金字塔 vs Hummingbot DCA executor 对比；心理博弈保留。

- [ ] **Step 8: `07-trade-log-and-review-template.md` — 流水接入注记**

加一句：引擎（Freqtrade/Hummingbot）执行流水经 `sync.mjs`/API 接入 `D:\trade`（P4），复盘模板兼容。

## Task 4: evals 重写（三工具场景）

**Files:**
- Modify: `skills/trade-assistant/evals/evals.json`

**Interfaces:**
- Consumes: Task 2-3 的工作流与路由

- [ ] **Step 1: 重写为三工具场景（保持 10 条，id 1-10）**

覆盖矩阵：
| id | prompt | 路由 |
|---|---|---|
| 1 | 现在呢 | 手动 /binance（position.mjs） |
| 2 | 看看今天盘面 | 手动 /binance（scan.mjs） |
| 3 | ARB 挂止盈 | 手动 CONFIRM（prob/solve + 模式A/B） |
| 4 | 开多 ARB 定止损止盈 | 手动 CONFIRM（solve.mjs） |
| 5 | 复盘 ARB | retrospective-writer（账本） |
| 6 | 查 BTC 资金费率 | 手动 /binance |
| 7 | 回测 RSI 策略 | **Freqtrade**（download-data+backtesting→中文汇报） |
| 8 | 部署网格 bot | **Hummingbot**（hummingbot-mcp，CONFIRM→部署→状态） |
| 9 | 查 Hummingbot bot 盈亏 | **Hummingbot**（只读查询→中文表格） |
| 10 | 这个策略能 Freqtrade 跑吗 | **Freqtrade**（评估→回测→参数建议） |

每条保持 `{id, prompt, expected_output, files}`。

- [ ] **Step 2: 校验 JSON**

Run: `node -e "console.log(require('./skills/trade-assistant/evals/evals.json').evals.length)"`
Expected: `10`，无解析错误。

## Task 5: 回归 + 镜像同步 + 提交

**Files:** 全部

- [ ] **Step 1: 插件回归 + 语法**

Run:
```bash
cd /d/claude-dev/agents/trade-agents
node --test tests/*.test.mjs 2>&1 | tail -4
for f in skills/trade-assistant/scripts/*.mjs mcp/binance-mcp-server.mjs; do node --check "$f" || echo "FAIL $f"; done
node -e "console.log(require('./skills/trade-assistant/evals/evals.json').evals.length)"
```
Expected: 19/19；node --check 无 FAIL；evals 10。

- [ ] **Step 2: 同步镜像**

Run:
```bash
cp skills/trade-assistant/SKILL.md skills/trade-assistant/references/*.md skills/trade-assistant/evals/evals.json /d/claude-dev/skills/trade-assistant/
diff -rq skills/trade-assistant /d/claude-dev/skills/trade-assistant
```
Expected: 仅剩分发专属差异。

- [ ] **Step 3: 提交**

Run:
```bash
git add -A && git commit -m "refactor: three-tool orchestration — workflows + references + evals (Freqtrade/Hummingbot//binance)"
git log --oneline -3 && git status --short
```
Expected: 一次干净提交；工作树 clean。

---

## 自审记录

- **Spec 覆盖**：用户确认内容层重写 + evals。Task 1 修 MCP 故障（前置）；Task 2 工作流重构；Task 3 references 内容重写（00-07）；Task 4 evals 重写；Task 5 收尾。
- **占位符**：无 TBD。Task 1 Step 1 要求读异常定位——这是外部 MCP 故障修复的合理调试步骤。
- **类型一致**：三工具命名（Freqtrade/Hummingbot//binance）、references 08/09、evals id 1-10 在 Task 间一致。
- **风险**：references 内容重写是大编辑，需保留策略核心逻辑（只加"执行路由"对齐，不删 S1-S6/风控）。执行时逐文件确认不丢失原内容。
