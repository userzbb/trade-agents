# trade-agents

**单插件即全部功能** —— Binance U 本位永续合约交易系统的唯一安装入口。skill（分析大脑）+ MCP（行情/下单）+ agents（自治子任务）+ BM25 向量检索全部内置，外部仅强依赖 `/binance` skill。

> 前身是 `trade-plugin`（已退役），其 skill 与 MCP 已并入本插件。Skill 层为英文（效率优先），**所有给用户的输出为中文**。

## 安装

```bash
# 前置：/binance skill（数据/执行层强依赖）
npx skills add binance/binance-skills-hub
```

```bash
# 推荐：经 GitHub marketplace
claude plugin marketplace add https://github.com/userzbb/trade-agents
claude plugin install trade-agents
```

```bash
# 或本地临时启用
claude --plugin-dir D:/claude-dev/agents/trade-agents
# 或会话内 /plugin → Add from folder → 选择 D:\claude-dev\agents
```

```bash
# 数据层配置（默认 D:/trade）
export TRADE_HOME=D:/trade
export BINANCE_PROXY=http://127.0.0.1:7897
```

首次使用前：`binance-cli profile create` 配置 API 密钥（profile `my-main`）。

## 依赖与环境要求

| 依赖 | 版本 / 来源 | 作用 | 安装方式 |
|---|---|---|---|
| Node.js | ≥ 26（脚本依赖内置 `node:sqlite`） | 所有 scripts + MCP server 的运行时 | 官网 installer，或 `winget install OpenJS.NodeJS.LTS` / nvm-windows |
| curl | Windows 10 1803+ 自带（`System32\curl.exe`） | 脚本/MCP 访问 `fapi.binance.com` | 无需安装（系统自带） |
| /binance skill | 最新 | **强依赖**：数据/执行层（binance-cli 端点字典、认证规则） | `npx skills add binance/binance-skills-hub` |
| binance-cli | npm v1.3.0（**仅 Windows npm 版**，官方安装脚本不兼容 Windows） | 签名账户查询 / 下单执行 | `npm install -g @binance/binance-cli` |
| Binance API 密钥 | profile `my-main` | 签名请求鉴权（只在 `binance-cli` 里配置，勿写进代码） | `binance-cli profile create` → 填 API Key / Secret |
| 本地代理 | `127.0.0.1:7897`（Clash 等） | 直连币安被墙时走代理 | `export BINANCE_PROXY=http://127.0.0.1:7897`（另设 `HTTPS_PROXY`/`HTTP_PROXY` 给 binance-cli） |
| 数据层 | `D:\trade`（可覆盖） | SQLite（`data/trade.db`）+ 复盘归档（`retrospectives/`） | `export TRADE_HOME=D:/trade`（目录可自动创建） |

**向量检索（`vector.mjs`）零外部依赖**：不是外部向量数据库，是本地 BM25 检索（中文字符 bigram 分词 + 倒排索引），纯 Node 实现。**无需安装任何数据库、无需 API key、无需外部模型**；索引自动构建到 `${TRADE_HOME}/vector-index.json`（`D:/trade/vector-index.json`），源文件变化时自动重建。详见 [向量检索](docs/vector-search.md)。

**可选依赖（binance-orchestrator 增强）**：信息面 / 信号 / 博弈面 / 链上查询走 `crypto-market-rank`、`binance-trading-signal`、`binance-wallet-tracker`、`query-token-*` 等用户级 skill，按各 skill 的安装方式（通常 `npx skills add <org>/<repo>`）安装；缺失时 orchestrator 会降级提示，不影响核心 skill/MCP。

## 组件

```
trade-agents/
├── skills/trade-assistant/   分析大脑（唯一真相源）
│   ├── SKILL.md              英文指令，双支柱：文档生成 · binance 编排
│   ├── references/           策略知识库（8 个英文文件，含中文输出模板）
│   └── scripts/              分析工具箱（14 个零依赖脚本，含 vector.mjs）
├── agents/
│   ├── retrospective-writer      复盘/周报/月报文档生成 agent
│   └── binance-orchestrator     binance 编排 agent（写操作交回 CONFIRM）
└── mcp/
    └── binance-mcp-server    行情/账户 MCP + 下单（confirm:true）
```

## 📚 文档

| 文档 | 内容 |
|---|---|
| [架构设计](docs/architecture.md) | 分层视图、组件职责、数据流、依赖模型、语言边界 |
| [Skill 层指南](docs/skill-guide.md) | 双支柱、文档生命周期、策略知识库、脚本工具箱、CONFIRM 协议 |
| [Agents 指南](docs/agents.md) | 两个 agent 的职责、触发、流程、决策表 |
| [向量检索](docs/vector-search.md) | vector.mjs 用法、BM25 原理、命令示例 |
| [使用场景速查](docs/usage.md) | 你说什么 → 触发什么 → 得到什么 |
| [开发文档](docs/development.md) | 项目结构、如何扩展、测试、git 工作流 |
| [规范](docs/conventions.md) | 命名、语言边界、frontmatter、防漂移、安全 |

## 语言边界（硬规则）

- **英文**：SKILL.md 指令、references 策略、脚本注释、agent 提示词。
- **中文**：一切用户可见输出 —— 复盘/周报/月报/计划文档正文、对话表格、摘要。

## 同步规则

skill 层唯一真相源在 `skills/trade-assistant/`。策略规则或 binance 决策表变更时：修改这里 → 同步镜像 `D:\claude-dev\skills\trade-assistant` → 检查 agents 引用。详见 [开发文档](docs/development.md) 与 [规范](docs/conventions.md)。
