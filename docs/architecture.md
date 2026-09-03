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
│  references/00-10  策略知识库 + 引擎桥接文档（建议基线）   │
│  scripts/          分析工具箱（分析/引擎桥/profile/vector）│
│  .mcp.json          外部 hummingbot-mcp（uv，仅引擎）      │
└───────────────────┬───────────────────────────────────┘
                    ▼
┌─ 引擎层（外部部署的执行引擎，插件是控制面）───────────────┐
│  Freqtrade  E:\trade-bots\freqtrade（Docker dry-run）   │
│    方向性回测/Hyperopt/执行 · REST 127.0.0.1:8080        │
│  Hummingbot E:\trade-bots\hummingbot（API+MCP）         │
│    网格/做市/套利/三重屏障 · MCP 8000                    │
│  NFI(可选) E:\trade-bots\nfi（独立 compose）            │
│    现成趋势策略 · 币安合约/做空 · REST 8989              │
│  各自独立币安子账户；策略级操作走 CONFIRM                │
└───────────────────┬───────────────────────────────────┘
                    ▼
┌─ 数据/执行层（外部强依赖 + 本地数据层） ─────────────────────┐
│  /binance skill（binance-cli）：行情/费率/持仓/下单          │
│  binance 生态：crypto-market-rank / trading-signal /         │
│    wallet-tracker / query-token-*                            │
│  D:\trade（TRADE_HOME）：SQLite + retrospectives + plans     │
│    + strategy-overrides.md（个人策略覆盖，优先于 references）│
└──────────────────────────────────────────────────────────────┘
```

## 组件职责矩阵

| 层 | 组件 | 职责 | 语言 |
|---|---|---|---|
| 交互 | trade-assistant skill | 用户入口、CONFIRM、文档编排、binance 决策 | 指令英文 / 输出中文 |
| 自治 | retrospective-writer agent | 复盘/周报/月报 md 生成 + 相似案例检索 | 提示词英文 / 输出中文 |
| 自治 | binance-orchestrator agent | 选 binance skill/CLI、格式化调用、汇总 | 提示词英文 / 输出中文 |
| 能力 | references/00-10 | 策略知识库 · **建议基线**（S1-S6/进场模板/风控/庄家剧本/引擎桥/NFI）；个人化与覆盖走数据层 `strategy-overrides.md`（优先于本层） | 英文 |
| 能力 | scripts/*.mjs | 分析工具箱 + 文档生成脚本 + vector.mjs | 注释英文 / 输出中文 |
| 能力 | .mcp.json | MCP 注册：仅外部 hummingbot-mcp（uv）；读走 scripts、写走 binance-cli+CONFIRM | JSON |
| 引擎 | Freqtrade | 方向性回测/Hyperopt/dry-run 执行（REST，插件=控制面） | — |
| 引擎 | Hummingbot | 网格/做市/套利/三重屏障执行（MCP，插件=控制面） | — |
| 引擎 | NFI（可选） | 现成趋势策略回测/交叉验证（独立 compose，REST 8989） | — |
| 数据 | /binance 生态 | 行情/费率/信号/情绪/链上数据与执行 | — |
| 数据 | D:\trade | SQLite + md 归档 + `strategy-overrides.md`（个人策略覆盖，优先于 references） | 中文文档 |

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
- **数据层**：`D:\trade`（`TRADE_HOME` 可覆盖）—— SQLite、复盘归档、交易计划、`strategy-overrides.md`（个人策略覆盖，优先于 references）。
- **环境事实**（代理 `127.0.0.1:7897`、`fapi.binance.com`、限流 sleep 2–4、时钟漂移重试、`binance-cli` v1.3.0 profile `my-main`）只写一份在 SKILL.md，agents 引用不复制。

## 英文/中文边界（硬规则）

- **英文**：SKILL.md 指令、references 策略、脚本注释、agent 提示词、README 结构。
- **中文**：一切用户可见输出 —— 复盘/周报/月报/计划文档正文、对话表格、摘要。

## 唯一真相源与防漂移

- skill 层唯一真相源 = `skills/trade-assistant/`（本插件内）。
- 旧镜像 `D:\claude-dev\skills\trade-assistant` **已废弃**：不同步、不维护、不引用（CLAUDE.md 声明）。`npx skills add userzbb/trade-agents` 从本插件仓库直接装 skill。
- 个人风险画像 `D:\trade\strategy-profile.json`（`TRADE_HOME` 下，`profile.mjs` 管理）覆盖 references 的数值默认（equity/杠杆/仓位/红线）；安全协议硬不可画像化。
- 个人策略覆盖 `D:\trade\strategy-overrides.md`（`TRADE_HOME` 下，`overrides.mjs seed|view` 管理）：用户散文级个人策略（选币 S1-S6/博弈阶段/禁区等）**优先于** references 建议；被覆盖生效时计划正文标注「应用覆盖: …（覆盖 references/0X 建议）」。references 保持建议基线、不因个人化而改。
- 环境/依赖/网络正确性：会话首个交易请求跑 `scripts/envcheck.mjs` 三层自检——默认本地 env+依赖（当前进程 env vs Windows 用户环境 + node/binance-cli/uv/docker 就绪），`--net` 追加网络联通（代理→fapi、引擎 REST）；触发词「网络联通/为什么连不上/交易前」。见 SKILL.md「Environment Self-Check」。
- 任何策略规则或决策表变更：修改真相源 `skills/trade-assistant/` → 检查 agents/文档引用（无镜像可同步）。三处保持对齐：references ↔ agents 引用 ↔ 用户输出模板。
