# trade-agents

**单插件即全部功能** —— Binance U 本位永续合约交易系统的唯一安装入口。skill（分析大脑）+ MCP（行情/下单）+ agents（自治子任务）+ BM25 向量检索全部内置。**外部强依赖**：`/binance` skill（数据/执行）+ **Freqtrade**（方向性回测/执行）+ **Hummingbot**（网格/做市/套利）——后两个执行引擎为必需组件，部署见下文。

> 前身是 `trade-plugin`（已退役），其 skill 与 MCP 已并入本插件。Skill 层为英文（效率优先），**所有给用户的输出为中文**。

## 安装

```bash
# 前置：/binance skill（数据/执行层强依赖）
npx skills add binance/binance-skills-hub
```

```bash
# 本插件自带 skill：npx skills 直接装本插件仓库里的 skills/trade-assistant
npx skills add userzbb/trade-agents
```

```bash
# 推荐：经 GitHub marketplace（完整插件：skill + MCP + agents + 引擎桥）
claude plugin marketplace add https://github.com/userzbb/trade-agents
claude plugin install trade-agents
```

```bash
# 或本地临时启用
claude --plugin-dir D:/claude-dev/agents/trade-agents
# 或会话内 /plugin → Add from folder → 选择 D:\claude-dev\agents\trade-agents
```

> **Windows 说明（先读）**：本项目文档里的命令以 **Git Bash（MSYS）** 为准编写 —— `/e/...` = `E:\...`、`export A=B`、`MSYS_NO_PATHCONV=1` 都是 Git Bash 语法，**PowerShell / cmd 里无效**。请装 [Git for Windows](https://git-scm.com/)，用其 Git Bash 执行各 `bash` 代码块。
>
> 要让 **Claude Code / 插件脚本**（如 `.mcp.json` 的 `${HUMMINGBOT_MCP_DIR}`）读到变量：必须设成 **Windows 用户环境变量** —— shell 里临时 `export` 只对当前进程生效，Claude Code 从别的终端/桌面启动就读不到。用下面 `setx`（永久；设置后**重开 Claude Code** 才生效），或 系统属性 → 高级系统设置 → 环境变量。

```powershell
# 设成 Windows 用户环境变量（推荐，永久生效）
setx TRADE_HOME "D:\trade"
setx BINANCE_PROXY "http://127.0.0.1:7897"
```

```bash
# 或 Git Bash：仅当前会话临时生效
export TRADE_HOME=D:/trade
export BINANCE_PROXY=http://127.0.0.1:7897
```

首次使用前：`binance-cli profile create` 配置 API 密钥（profile `my-main`）。

## 部署流程（端到端）

整个系统 = **插件（控制面）+ 两个执行引擎 + `/binance` 数据层**。按顺序部署：

| 步骤 | 做什么 | 详见 |
|---|---|---|
| ① 基础依赖 | Node ≥26、Docker Desktop、Python ≥3.11 + uv、Clash 代理 `127.0.0.1:7897` | [依赖与环境要求](#依赖与环境要求) |
| ② 部署 **Freqtrade** | clone → `docker compose up -d`（dry-run，REST 8080） | [Freqtrade 部署](#freqtrade方向性回测执行) |
| ③ 部署 **Hummingbot** | clone api → `docker compose up -d`；clone mcp → `uv sync` + `.env` | [Hummingbot 部署](#hummingbot网格做市套利执行) |
| ④ 配置环境变量 | `HUMMINGBOT_MCP_DIR` / `HUMMINGBOT_API_*` | [环境变量](#环境变量插件-mcpjson-引用) |
| ⑤ 安装插件 | `claude plugin marketplace add …` + `install`（或本地 `--plugin-dir`） | [安装](#安装) |
| ⑥ 验证 | `curl 8080/api/v1/ping`、Hummingbot MCP initialize、`claude mcp list` 见 `hummingbot-mcp` | 各引擎小节 |

> 插件 `.mcp.json` 已注册 `binance-trade` + `hummingbot-mcp` 两个 MCP server；Freqtrade 走 REST（`binance-orchestrator` 路由调用）。引擎未部署时相关能力不可用，但插件其余部分（分析/复盘/manual）照常。

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
| Docker Desktop | Hyper-V 后端 | 运行 Freqtrade / Hummingbot 引擎容器 | Docker Desktop 官网；代理设 GUI（Settings→Resources→Proxies→`127.0.0.1:7897`） |
| Python ≥3.11 + uv | — | Hummingbot MCP server 运行环境 | `uv` 官方安装器 |
| **Freqtrade**（必需·强依赖） | [freqtrade/freqtrade](https://github.com/freqtrade/freqtrade) · `E:\trade-bots\freqtrade` | 方向性回测/Hyperopt/执行（REST `127.0.0.1:8080`） | 见 [Freqtrade 部署](#freqtrade方向性回测执行) |
| **Hummingbot**（必需·强依赖） | [hummingbot/hummingbot](https://github.com/hummingbot/hummingbot) · [hummingbot/mcp](https://github.com/hummingbot/mcp) · `E:\trade-bots\hummingbot` | 网格/做市/套利执行（API `8000` + MCP） | 见 [Hummingbot 部署](#hummingbot网格做市套利执行) |
| **NFI（可选·推荐）** | [iterativv/NostalgiaForInfinity](https://github.com/iterativv/NostalgiaForInfinity) · `E:\trade-bots\nfi` | 现成高星趋势策略（币安合约/做空，回测与交叉验证） | 见 [NFI 部署](#nfi可选·推荐现成趋势策略引擎) |

**向量检索（`vector.mjs`）零外部依赖**：不是外部向量数据库，是本地 BM25 检索（中文字符 bigram 分词 + 倒排索引），纯 Node 实现。**无需安装任何数据库、无需 API key、无需外部模型**；索引自动构建到 `${TRADE_HOME}/vector-index.json`（`D:/trade/vector-index.json`），源文件变化时自动重建。详见 [向量检索](docs/vector-search.md)。

**可选依赖（binance-orchestrator 增强）**：信息面 / 信号 / 博弈面 / 链上查询走 `crypto-market-rank`、`binance-trading-signal`、`binance-wallet-tracker`、`query-token-*` 等用户级 skill，按各 skill 的安装方式（通常 `npx skills add <org>/<repo>`）安装；缺失时 orchestrator 会降级提示，不影响核心 skill/MCP。

## 交易引擎部署方案（必需 · Freqtrade + Hummingbot）

插件是**控制面**，调用两个独立部署的执行引擎。引擎是**必需强依赖**——不部署则网格/做市/套利与方向性回测执行不可用。

**官方仓库**：
- **Freqtrade**：https://github.com/freqtrade/freqtrade （文档 https://www.freqtrade.io/ ）
- **Hummingbot**：https://github.com/hummingbot/hummingbot （API https://github.com/hummingbot/hummingbot-api · MCP https://github.com/hummingbot/mcp · 文档 https://docs.hummingbot.org/ ）

部署按官方流程（P1 用模拟盘/方向性验证，零真实 API key；实盘需各自配独立子账户 key）。

### 环境变量（插件 `.mcp.json` 引用）

`.mcp.json` 里 `hummingbot-mcp` 启动时由 **Claude Code 自身进程环境** 展开 `${HUMMINGBOT_MCP_DIR}`（见 `.mcp.json:13`）——所以这 4 个变量请设成 **Windows 用户环境变量**，不要在某个 shell 里临时 `export`（Claude Code 从别处启动就丢）：

```powershell
# 永久生效；设置后需完全重开 Claude Code
setx HUMMINGBOT_MCP_DIR "E:\trade-bots\hummingbot\mcp"
setx HUMMINGBOT_API_URL "http://localhost:8000"
setx HUMMINGBOT_API_USERNAME "admin"
setx HUMMINGBOT_API_PASSWORD "hb_p1_paper_2026"
```

> 仅当前会话的临时替代（只对当前终端里新起的进程可见）：
> - PowerShell：`$env:HUMMINGBOT_MCP_DIR = 'E:\trade-bots\hummingbot\mcp'`（其余类推）
> - Git Bash：`export HUMMINGBOT_MCP_DIR=/e/trade-bots/hummingbot/mcp` —— `/e/` 是 Git Bash 对 `E:\` 的 MSYS 写法，**PowerShell/cmd 无效**（会被当成相对路径）。

> **首次调用 skill 会自动跑一次环境自检**（`scripts/envcheck.mjs`，只读）：对照「当前进程 env」与「Windows 用户环境」，发现 `HUMMINGBOT_MCP_DIR` 缺失/MSYS 路径等问题时，agent 会展示 setx 方案、等你 CONFIRM 后才执行；改完需**完全重启 Claude Code** 生效（`.mcp.json`/MCP 在启动时读环境）。也可直接说「环境自检」/「修环境变量」手动触发。

### Freqtrade（方向性回测/执行）

```bash
# Docker（dry-run，api_server 8080）
cd /e/trade-bots/freqtrade && docker compose up -d
# 下载数据 + 回测（Windows 注意 MSYS_NO_PATHCONV=1 防路径改写）
MSYS_NO_PATHCONV=1 docker exec freqtrade freqtrade download-data --config /freqtrade/user_data/config.json --pairs BTC/USDT:USDT --timeframe 1h --timerange 20250101-20250701
MSYS_NO_PATHCONV=1 docker exec freqtrade freqtrade backtesting --config /freqtrade/user_data/config.json --strategy RsiMomentum --timerange 20250101-20250701
curl -s http://127.0.0.1:8080/api/v1/ping   # {"status":"pong"}
```
要点：容器内代理 `HTTPS_PROXY=http://host.docker.internal:7897`；`api_server.listen_ip_address` 须 `0.0.0.0`；`jwt_secret_key` ≥32 字符。详见 `references/08-freqtrade-bridge.md`。

### Hummingbot（网格/做市/套利执行）

```bash
# API server（Docker，8000）+ MCP（uv）
cd /e/trade-bots/hummingbot/hummingbot-api && docker compose up -d
cd /e/trade-bots/hummingbot/mcp && uv sync && cp .env.example .env   # 填 API 凭据
# 验证 MCP（proper initialize 需 protocolVersion/capabilities/clientInfo）
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}\n' | uv run main.py
```
P1 用 `binance_perpetual_paper_trade` 模拟盘（零 key）；实盘需 `hbot connect binance_perpetual` 配独立子账户 key。详见 `references/09-hummingbot-bridge.md`。

> **账户隔离**：Freqtrade / Hummingbot / binance-cli（`my-main`）各用独立币安子账户，勿共用 key。策略级部署/启停需 CONFIRM；回测/查询只读免。

### NFI（可选·推荐）现成趋势策略引擎

NFI 是**可选·推荐**的现成高星趋势策略（非必需），定位 = **LLM 研判的交叉验证源之一 + 全市场趋势规则池**：trade-assistant 分析得出方向后，可借 NFI 的信号/回测交叉验证（多策略共同指向才高信心）。与现有引擎**独立部署并存**（官方 docker-compose，API 端口 8989，不占 8080）。**零自研策略代码**。

> ⚠️ NFI（X7）是**全市场选币**策略（40-80 pairs 设计），**不做单币局部出单验证**（单币短期 0 单是正常现象，非故障）——启用时机由 LLM 研判/交叉验证决定。

```bash
# 官方仓库 + 文档
#   repo: https://github.com/iterativv/NostalgiaForInfinity
#   docs: https://iterativv.github.io/NostalgiaForInfinity/
cd /e/trade-bots
git clone https://github.com/iterativv/NostalgiaForInfinity.git nfi && cd nfi
cp live-account-example.env .env        # 配币安 API key（类型/存放见 docs/nfi-deployment.md）；DRY_RUN=true
docker compose up -d --build            # 官方 compose，默认策略 NostalgiaForInfinityX7 / futures / 5m
curl -s http://127.0.0.1:8989/api/v1/ping
```

详见 [`docs/nfi-deployment.md`](docs/nfi-deployment.md)（部署 + 密钥类型 + 官方链接 + 实测验证记录）与 `references/10-nfi-bridge.md`。

## 组件

```
trade-agents/
├── skills/trade-assistant/   分析大脑（唯一真相源）
│   ├── SKILL.md              英文指令，三工具编排：/binance · Freqtrade · Hummingbot
│   ├── references/           策略知识库（11 个英文文件，含三工具路由与引擎桥）
│   └── scripts/              分析工具箱（零依赖：分析 · 引擎桥 · profile/envcheck · vector）
├── agents/
│   ├── retrospective-writer      复盘/周报/月报文档生成 agent
│   └── binance-orchestrator     binance 编排 agent（三工具路由，写操作交回 CONFIRM）
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
| [NFI 部署](docs/nfi-deployment.md) | NFI 现成趋势策略引擎的独立部署与回测流程（可选） |
| [规范](docs/conventions.md) | 命名、语言边界、frontmatter、防漂移、安全 |

## 语言边界（硬规则）

- **英文**：SKILL.md 指令、references 策略、脚本注释、agent 提示词。
- **中文**：一切用户可见输出 —— 复盘/周报/月报/计划文档正文、对话表格、摘要。

## 同步规则

skill 层唯一真相源在 `skills/trade-assistant/`（本插件仓库内）。策略规则或决策表变更时：直接改这里 → 检查 agents 引用即可。**旧镜像 `D:\claude-dev\skills\trade-assistant` 已弃用，不同步**。`npx skills add userzbb/trade-agents` 即从本插件仓库安装该 skill。详见 [开发文档](docs/development.md) 与 [规范](docs/conventions.md)。
