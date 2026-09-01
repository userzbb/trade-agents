# Agents 指南

> 本插件含两个自治 agent。**Agents 给自治多步任务**（不用用户一步步喂），**skill 给需交互的任务**（CONFIRM 审核）。两者通过 skill 的 SKILL.md 分工协作。

## 概览

| Agent | 职责 | 触发 | 工具 | 颜色 |
|---|---|---|---|---|
| `retrospective-writer` | 复盘/周报/月报 md 文档生成 + 相似案例检索 | 用户说"复盘/周报/月报/总结" | Read/Write/Grep/Glob/Bash | green |
| `binance-orchestrator` | 决定调用哪个 binance 生态 skill/CLI 并汇总 | 用户要行情/信号/情绪/链上/技术面 | Read/Grep/Glob/Bash | cyan |

两个 agent 的**系统提示词为英文**，**所有输出为中文**（硬规则写在各自文件顶部）。

---

## 一、retrospective-writer（复盘/周报/月报文档生成）

### Frontmatter

```yaml
name: retrospective-writer
model: inherit
color: green
tools: ["Read", "Write", "Grep", "Glob", "Bash"]
```

### 触发场景（When to invoke）

1. **复盘**：用户说"复盘 / 平仓了 / 这一单结束了" —— 该仓位全部平仓后，生成并归档复盘 md。
2. **周报**：用户说"周报 / 本周总结 / 这周怎么样"（每周日前后）—— 生成周报。
3. **月报**：用户说"月报 / 本月总结"（每月 1 号前后）—— 生成月报并校验下期目标。
4. **相似案例检索**：用户问"之前有没有类似的复盘 / 找一下类似行情" —— 从 BM25 索引检索并中文汇总。

### 复盘流程（8 步）

1. 与用户确认标的与时间段（或从上下文读取）。
2. `node <skill>/scripts/sync.mjs --days N` —— 保证 SQLite 是这段时间的真源。
3. 读复盘模板 + 交易日志模板：`references/07-trade-log-and-review-template.md`。
4. 从 `report.mjs` 或直接 SQLite 查询拉取：已实现盈亏、手续费、资金费、币种分级。
5. 检索相似复盘：`node <skill>/scripts/vector.mjs query "复盘 <币种> <行情特征>" --filter review --top 5`。
6. **严格按模板**生成中文复盘 md（基本信息 / 执行vs计划 / 盈亏归因 信号·纪律·运气 / 关键决策复盘 / 改进项），命中相似案例时加"相似案例参考"区块；无历史复盘则如实写"尚无历史复盘"。
7. 写入 `D:\trade\retrospectives\复盘_起始日期-结束日期_币种.md`。
8. `git -C D:/trade add -A` + `git -C D:/trade commit -m "复盘 <币种> <起始-结束> +<盈亏>U"`。

### 周报/月报流程

1. `node <skill>/scripts/summary.mjs weekly|monthly`（脚本自动写文件）。
2. 审阅输出；月报额外跑 `node <skill>/scripts/plan.mjs --target <目标U> --days <N> --equity <当前净值>` 校验下期目标。
3. 给用户中文摘要，然后 git 归档。

### 质量要求

- 数字只能来自 SQLite/实时 API，禁止凭记忆。
- 必备要素：执行vs计划偏离、盈亏归因（信号/纪律/运气）、信号类型 S1-S6 + 币种分级 T1-T3、至少一条可执行改进项。
- 找到相似复盘就引用，没有就明说。表格优先，中文。

### 边界情况

- 无新增流水 → 说"无新增流水"。
- `retrospectives/` 为空 → 向量检索返回空，优雅处理，改用 `--filter reference` 拿策略知识。
- git commit 无变更 → 跳过并告知用户。
- 仓位未全部平仓 → 延后复盘。
- 01:00–07:00 → 生成文档没问题，不开新仓。
- 特殊符号币种 → 规范为币安格式（如 `1000PEPEUSDT`）。

### 关键路径

- `TRADE_HOME` = `D:/trade`（env 可覆盖）；SQLite `data/trade.db`；归档 `retrospectives/`。
- skill 根 = `<skill-root>/skills/trade-assistant`（`<skill-root>` = `${TRADE_PLUGIN_ROOT}` 或 `D:/claude-dev/agents`）。
- 向量检索：`node <skill>/scripts/vector.mjs query "<文本>" --filter review --top 5`。
- 环境事实（代理/限流/时钟漂移）读 SKILL.md，不复制。

---

## 二、binance-orchestrator（binance 编排）

### Frontmatter

```yaml
name: binance-orchestrator
model: inherit
color: cyan
tools: ["Read", "Grep", "Glob", "Bash"]
```

### 触发场景（When to invoke）

1. **行情查询**："查一下 XX 的行情 / 资金费率 / 多空比 / 持仓量 / 盘口" → binance-cli 拉原始数据。
2. **信号查询**："XX 有没有信号 / 能不能买 / 回测一下这个策略" → binance-trading-signal。
3. **信息面**："最近什么火 / 聪明钱在买什么 / 谁是这周最赚的交易员" → crypto-market-rank（+ wallet-tracker）。
4. **行为/技术面**："看看 XX 是吸筹还是派发" / "XX 的技术面 / 指标" → wallet-tracker / ta.mjs。

### 能力 → 提供方决策表

| 需求 | 提供方 | 调用方式 |
|---|---|---|
| 原始行情/K线/费率/多空比/持仓量/盘口/taker | `/binance`（binance-cli） | `binance-cli futures-usds <endpoint> --symbol <SYM> ...`（语法查 `/binance` references） |
| 账户/持仓/挂单/流水 | `/binance` | `account-information-v2` / `position-risk` / `get-income-history` |
| **下单/平仓/撤单/改杠杆/划转** | **交回 trade-assistant CONFIRM** | **不执行** —— 展示计划后转交 |
| 信息面排名/热度/聪明钱流入/地址PnL榜 | `crypto-market-rank` | 按运行时解析其 CLI（见 agent 的 Path Resolution），`node <market-rank-cli> <subcmd> '<json>'` |
| 信号/回测/策略/可买性 | `binance-trading-signal` | `baw signal ...` |
| 博弈面行为（吸筹/派发/round-trip/首动） | `binance-wallet-tracker` | `baw tracker ...` |
| 链上 token/地址/审计 | `query-token-info` / `query-address-info` / `query-token-audit` | 读其 references + 跑 CLI |
| 技术指标（RSI/MACD/EMA/布林/ATR/背离/形态） | 本插件工具箱 | `node <skill>/scripts/ta.mjs <SYM> [--interval 1h]` |
| 全市场扫描/单币体检/概率/求解/金字塔 | 本插件工具箱 | `scan.mjs` / `coin.mjs` / `prob.mjs` / `solve.mjs` / `pyramid.mjs` |

### 执行流程（6 步）

1. 将用户意图归类到决策表的一行。
2. 对 skill 支撑的行，先读对应 skill 的 SKILL.md/references 确认确切语法。
3. 通过 Bash **串行**执行，请求间 `sleep 2-4`。
4. 遇限流（"Way too many requests"）等 30–60 秒；遇时钟漂移（recvWindow 错误）sleep 5–8 秒重试。
5. 用**中文表格**汇总，标注数据来源。
6. **写操作意图** → 停下：展示计划，转交 trade-assistant 的 CONFIRM 协议，不执行。

### 环境要点（权威版在 SKILL.md）

- 调 binance-cli 前：`export HTTPS_PROXY=http://127.0.0.1:7897 HTTP_PROXY=http://127.0.0.1:7897`
- `binance-cli` Windows = npm v1.3.0，profile `my-main`（**不要**用 /binance skill 里的 v2 安装脚本，不支持 Windows）
- 不并行调用币安 API。
- 路径一律运行时解析（`TRADE_PLUGIN_ROOT`/`CRYPTO_MARKET_RANK_CLI` env 或读对应 skill），不写死绝对路径。

### 质量要求与边界

- 中文输出、表格优先、来源标注、不编造数字。
- 端点/参数不确定 → 先读 `/binance` references 再猜。
- 技术面查询注明所用周期，且说明 TA 是第二道确认而非进场依据。
- 能力不在表内 → 读 `/binance` references 或问用户；代理挂了如实报告。
- 查询 vs 写：绝不执行写操作，一律转 CONFIRM。

---

## 三、与 skill 的协作

```
用户请求
  │
  ├─ 需交互（下单/改单/撤单）→ skill 输出计划 → 模式A/B → CONFIRM
  ├─ 需文档（复盘/周报/月报）→ skill 委派 retrospective-writer → 中文 md + git
  └─ 需数据/信号（行情/情绪/链上）→ skill 决策表 → binance-orchestrator → 中文表格
```

- agents 不复制 skill 的环境事实/决策表大段（防漂移），引用 SKILL.md。
- agents 的写操作（下单类）一律不执行，交回 skill 的 CONFIRM。

## 四、测试 agent

1. 校验 frontmatter：`bash <plugin-dev>/skills/agent-development/scripts/validate-agent.sh agents/<name>.md`
2. 触发测试（真实会话）：说触发短语，观察是否选中对应 agent 且输出为中文。
3. 检查描述长度（10–5000 字符）、触发场景数（2–4 个）、`When to invoke` 区块完整。
