# 开发文档（AI / 维护者）

> 本文件 + `CLAUDE.md` 是 **AI 开发此项目的规范入口**（CLAUDE.md 进仓库自动加载，本文件给详细操作）。配套硬约定见 `docs/conventions.md`。改动代码时必须同步相关 md 文档（见文末「文档维护纪律」）——md 是项目一等公民。

## 项目结构（当前 v0.4.0）

```
trade-agents/
├── .claude-plugin/
│   ├── plugin.json          # 清单（name/version；每次用户可见变更 bump version）
│   └── marketplace.json     # marketplace 发布清单（source: 完整仓库 URL）
├── README.md                # 入口 README（安装/部署/环境变量，链接 docs/）
├── CLAUDE.md                # AI 进仓库自动加载：Iron Rules + Common tasks + Env facts
├── docs/                    # 用户 + 开发者文档（md，全部需随代码维护）
│   ├── architecture.md      # ★ 架构设计（md 真相源；不用 archify 可视化图）
│   ├── conventions.md       # ★ 规范：命名/语言/结构/防漂移/安全/发布/架构md/Agent开发
│   ├── development.md       # 本文件：AI/维护者开发文档
│   ├── skill-guide.md       # skill 层详解（含脚本工具箱全表）
│   ├── agents.md            # agents 指南
│   ├── usage.md             # 使用场景速查（你说→触发→得到）
│   ├── vector-search.md     # 向量检索（BM25）
│   └── nfi-deployment.md    # NFI 引擎部署（可选）
├── agents/*.md              # agent 定义（retrospective-writer · binance-orchestrator）
├── hooks/block-trading-commands.mjs   # PreToolUse 安全门（拦截引擎/资金写命令）
├── skills/trade-assistant/   # ★ skill 层（唯一真相源）
│   ├── SKILL.md             # 英文指令 + 三工具编排 + ABSOLUTE GATE + 环境自检
│   ├── references/          # 策略知识库 00-10（08/09/10 = Freqtrade/Hummingbot/NFI 引擎桥）
│   ├── scripts/             # 零依赖脚本（分析 · 引擎桥 engines/optimize/backtest · profile/envcheck · vector）
│   └── evals/evals.json     # skill 触发测试用例
└── tests/                   # node:test 单测（tests/*.test.mjs）
```

> 已废弃（不维护、不引用、勿重新引入）：独立分发镜像 `D:\claude-dev\skills\trade-assistant`；archify 可视化架构图（HTML/spec，2026-09-02 删除）；自带 Binance 行情/账户 MCP server（2026-09-02 退役，勿重新引入）。

## 如何扩展

### 新增/修改策略知识
1. 编辑 `skills/trade-assistant/references/<NN>-*.md`（英文；用户输出模板保持中文）。
2. 改文件名/序号时同步 SKILL.md 的 references 指引表。
3. 改动是用户可见内容 → 遵守发布纪律 bump version（conventions §6）。

### 新增脚本
1. 放 `skills/trade-assistant/scripts/`，**零依赖**（只用 `node:` 内置 + 既有 `_lib.mjs`）。
2. 注释英文；面向用户输出中文。
3. 在 **SKILL.md 工具箱表 + docs/skill-guide.md + docs/usage.md** 各补一行。
4. `node --check <file>` 过语法；跑一次真实用例；逻辑可单测的加 `tests/<name>.test.mjs`。

### 新增 agent
1. `agents/<kebab-name>.md`，frontmatter 含 name/description/model/color/tools。
2. 描述 2–4 个触发场景 + 正文 "When to invoke"；遵守 plugin-dev:agent-development + conventions §10。
3. 校验 `bash <plugin-dev>/skills/agent-development/scripts/validate-agent.sh agents/<name>.md`。
4. 在 docs/agents.md 与 README 组件树补充。

### MCP 注册（.mcp.json）
- `.mcp.json` 只注册外部 `hummingbot-mcp`（uv/stdio）；**不要新增自带 Binance MCP server** —— 读走 `scripts/`、写走 `binance-cli` + CONFIRM（见 conventions / architecture）。
- `.mcp.json` 引用的环境变量（`HUMMINGBOT_MCP_DIR` 等）变更时同步 README「环境变量」节。

## 测试

```bash
# 全部单测（53 个，node --test；Windows 须用 tests/*.test.mjs glob，勿传目录）
node --test tests/*.test.mjs

# JS 语法
for f in skills/trade-assistant/scripts/*.mjs; do node --check "$f"; done

# 插件清单 JSON
node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/plugin.json'))"

# 环境/依赖自检（先报运行环境 OS/shell；本机真实环境，只读；默认本地 env+依赖）
node skills/trade-assistant/scripts/envcheck.mjs
# 追加网络联通自检（代理→fapi + 引擎 REST）
node skills/trade-assistant/scripts/envcheck.mjs --net

# 向量检索（真实数据）
node skills/trade-assistant/scripts/vector.mjs index
node skills/trade-assistant/scripts/vector.mjs query "止损 插针" --top 5

# 周报生成（回归；跑完删临时文件）
node skills/trade-assistant/scripts/summary.mjs weekly --date YYYY-MM-DD
```

## Git 工作流

```bash
git add -A && git commit -m "<type>: <desc>"
git push origin main
```

提交前缀（conventions §6）：`feat` 新能力 · `fix` 修复 · `docs` 文档 · `refactor` 重构 · `release` 发布（bump version）。**任何用户可见功能改动 push 前先 bump `.claude-plugin/plugin.json` version**，否则 marketplace 用户 `plugin update` 拉不到。

## 数据层（独立 git 仓库，不在本插件仓库内）

- `D:\trade`（`TRADE_HOME` 可覆盖）：`data/trade.db`、`retrospectives/`、`plans/`、`strategy-profile.json`、`strategy-overrides.md`（个人策略覆盖，`overrides.mjs seed|view` 管理）、`coin-classification.json`、`vector-index.json`（gitignore）。
- 个人策略覆盖文件 `D:\trade\strategy-overrides.md`（`TRADE_HOME` 下）：用户个人策略（选币 S1-S6 过滤/博弈阶段/禁区等散文规则）**优先于** `references/` 建议；模板随插件分发，`overrides.mjs seed` 幂等首建（已存在不覆盖，保留你的编辑）、`view` 查看。改动 = 对话里用户明确选择 → agent 编辑该 md 并在 `D:\trade` 数据层 git 仓库 commit（同复盘/周报归档先例）；**勿改 references 做个人化**（references 是共享建议基线）。相关计划/执行方案标注「应用覆盖: …（覆盖 references/0X 建议）」。
- 复盘/周报/月报归档在 `D:\trade\retrospectives\`，由 agent 或 `summary.mjs` 生成并 git commit。

## 文档维护纪律（每次改动必读）

| 改了什么 | 必须同步的 md |
|---|---|
| 组件/引擎/数据层/安全机制（架构级） | `docs/architecture.md`（分层 ASCII 视图/职责矩阵/数据流） |
| 开发约定、发布、防漂移、命名、语言 | `docs/conventions.md` |
| AI 开发入口规范 | `CLAUDE.md` + 本文件 `docs/development.md` |
| skill 指令/工作流/工具箱/环境自检 | `skills/trade-assistant/SKILL.md`（真相源） |
| 新脚本/新命令 | SKILL.md 工具箱表 + `docs/skill-guide.md` + `docs/usage.md` |
| agent 行为 | `docs/agents.md` |
| 用户可见功能变更 | 顺手 bump `.claude-plugin/plugin.json` version（release 提交） |

不允许"只改代码/只改 SKILL，其余文档留着过期"。所有 md 与代码同 commit 演进。
