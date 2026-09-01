# 架构设计

> trade-agents 单插件体系的分层、数据流与依赖模型。

## 分层视图

```
┌─ 用户层（中文交互）─────────────────────────────────┐
│  "复盘 ARB 这单" / "查一下 BTC 资金费率" / "写周报"      │
└───────────────────┬───────────────────────────────────┘
                    ▼
┌─ 交互层（Claude Code 会话，英文指令/中文输出）──────────┐
│  skills/trade-assistant/SKILL.md                       │
│   ├─ Pillar A: 文档生成（计划/复盘/周报/月报，用户触发）   │
│   ├─ Pillar B: binance 编排决策表                       │
│   └─ CONFIRM 审核协议（写操作唯一入口）                  │
│    ↕ 委派自治子任务（agents）                            │
│   agents/：retrospective-writer · binance-orchestrator │
└───────────────────┬───────────────────────────────────┘
                    ▼
┌─ 能力层（本插件内）─────────────────────────────────────┐
│  references/00-09  策略知识库 + 引擎桥接文档（唯一真相源） │
│  scripts/          分析工具箱（14 个零依赖脚本）           │
│  mcp/binance-mcp-server  行情/账户 MCP（confirm:true）   │
└───────────────────┬───────────────────────────────────┘
                    ▼
┌─ 引擎层（外部部署的执行引擎，插件是控制面）───────────────┐
│  Freqtrade  E:\trade-bots\freqtrade（Docker dry-run）   │
│    方向性回测/Hyperopt/执行 · REST 127.0.0.1:8080        │
│  Hummingbot E:\trade-bots\hummingbot（API+MCP）         │
│    网格/做市/套利/三重屏障 · MCP 8000                    │
│  两者各自独立币安子账户；策略级操作走 CONFIRM             │
└───────────────────┬───────────────────────────────────┘
                    ▼
┌─ 数据/执行层（外部强依赖 + 本地数据层）──────────────────┐
│  /binance skill（binance-cli）：行情/费率/持仓/下单       │
│  binance 生态：crypto-market-rank / trading-signal /    │
│    wallet-tracker / query-token-*                      │
│  D:\trade：SQLite + retrospectives + plans（TRADE_HOME）│
└───────────────────────────────────────────────────────┘
```

## 组件职责矩阵

| 层 | 组件 | 职责 | 语言 |
|---|---|---|---|
| 交互 | trade-assistant skill | 用户入口、CONFIRM、文档编排、binance 决策 | 指令英文 / 输出中文 |
| 自治 | retrospective-writer agent | 复盘/周报/月报 md 生成 + 相似案例检索 | 提示词英文 / 输出中文 |
| 自治 | binance-orchestrator agent | 选 binance skill/CLI、格式化调用、汇总 | 提示词英文 / 输出中文 |
| 能力 | references/00-07 | 策略唯一真相源（S1-S6/进场模板/风控/庄家剧本） | 英文 |
| 能力 | scripts/*.mjs | 分析工具箱 + 文档生成脚本 + vector.mjs | 注释英文 / 输出中文 |
| 能力 | mcp/binance-mcp-server.mjs | 行情/账户 MCP + 下单(confirm:true) | JS |
| 引擎 | Freqtrade | 方向性回测/Hyperopt/dry-run 执行（REST，插件=控制面） | — |
| 引擎 | Hummingbot | 网格/做市/套利/三重屏障执行（MCP，插件=控制面） | — |
| 数据 | /binance 生态 | 行情/费率/信号/情绪/链上数据与执行 | — |
| 数据 | D:\trade | SQLite + md 归档（用户数据） | 中文文档 |

## 关键数据流

1. **复盘流**：用户"复盘" → retrospective-writer → `sync.mjs` 拉流水 → `vector.mjs query` 检索相似复盘 → 按 `references/07` 模板生成**中文**复盘 md → `D:\trade\retrospectives\` → git commit。
2. **binance 查询流**：用户"查 X" → skill 决策表 → binance-orchestrator → 对应 binance skill/CLI → **中文表格**汇总。
3. **下单流**：skill 输出完整计划表 → 用户选模式 A/B → 输 `CONFIRM` → binance-cli 执行 → 日志入 07。
4. **向量检索流**：`vector.mjs index` 扫描 retrospectives + references → bigram 倒排 + BM25 → `query` 返回 top-N（区分复盘/策略来源）。
5. **周报/月报流**：用户"周报/月报" → retrospective-writer → `summary.mjs weekly|monthly` → 中文 md → git 归档。
6. **策略验证流（Freqtrade）**：用户"回测这个策略" → orchestrator → Freqtrade REST（download-data/backtesting/Hyperopt，只读免 CONFIRM）→ **中文汇报**胜率/收益/回撤。
7. **引擎 bot 管理流（Hummingbot）**：用户"部署网格/查 bot 状态" → orchestrator → `hummingbot-mcp` → 策略级部署需 CONFIRM，查询直接调 → **中文汇报** bot 状态/模拟 PnL。

## 依赖模型

- **外部强依赖**：`/binance` skill（binance-cli）—— 数据与执行层。`npx skills add binance/binance-skills-hub`。
- **数据层**：`D:\trade`（`TRADE_HOME` 可覆盖）—— SQLite、复盘归档、交易计划。
- **环境事实**（代理 `127.0.0.1:7897`、`fapi.binance.com`、限流 sleep 2–4、时钟漂移重试、`binance-cli` v1.3.0 profile `my-main`）只写一份在 SKILL.md，agents 引用不复制。

## 英文/中文边界（硬规则）

- **英文**：SKILL.md 指令、references 策略、脚本注释、agent 提示词、README 结构。
- **中文**：一切用户可见输出 —— 复盘/周报/月报/计划文档正文、对话表格、摘要。

## 唯一真相源与防漂移

- skill 层唯一真相源 = `skills/trade-assistant/`（本插件内）。
- 独立分发镜像 `D:\claude-dev\skills\trade-assistant`（npx skills 路径）只读镜像，改动后需同步。
- 任何策略规则或 binance 决策表变更：修改真相源 → 同步镜像 → 检查 agents 引用。三处保持对齐。
