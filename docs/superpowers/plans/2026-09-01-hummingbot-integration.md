# Hummingbot 集成（P1）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **部署型任务说明**：Task 1-3 是环境部署（Docker/uv），在**宿主 Windows（Git Bash）**上运行，非插件仓库内改动；Task 4-6/8/9 是 `D:\claude-dev\agents\trade-agents` 仓库内改动。

**Goal:** 在 `E:\hummingbot` 部署 Hummingbot（API+engine 于 Docker Desktop，MCP 于 uv 原生 Windows），集成进 trade-agents 插件，跑通「模拟盘 grid bot 全周期」验证闭环，并更新 README/文档。

**Architecture:** 混合部署——`hummingbot-api`（含 Cython engine）跑 Docker Desktop（Hyper-V），容器内 `HTTPS_PROXY=http://host.docker.internal:7897` 访问币安；`hummingbot/mcp` 用 uv 在 Windows 原生 stdio 运行，经 `http://localhost:8000` 连 API。插件侧只加：`.mcp.json` 一条 MCP 配置、SKILL.md 一节、references/08 一份文档、orchestrator 一行路由。

**Tech Stack:** Docker Desktop（Hyper-V）、Python 3.11+/uv、Node ≥26（插件）、Hummingbot（`binance_perpetual` / `binance_perpetual_paper_trade` connector）、MCP。

**Spec:** `docs/superpowers/specs/2026-09-01-hummingbot-integration-design.md`

## Global Constraints

- 部署目录固定 `E:\hummingbot\`（`hummingbot-api/`、`mcp/` 两个子目录）。
- 插件路径固定 `D:\claude-dev\agents\trade-agents`；**不写死绝对路径**进插件代码（MCP 配置用 `${HUMMINGBOT_MCP_DIR}` 参数化）。
- 语言边界：skill 层（SKILL.md、references）英文；docs 中文；用户可见输出中文。
- 单真相源：skill 改动在 `skills/trade-assistant/`，改后同步镜像 `D:\claude-dev\skills\trade-assistant` + `diff -rq`。
- 零依赖：插件脚本保持零 npm 依赖（Hummingbot 侧 Python/uv 不算插件依赖）。
- CONFIRM 作用域：策略级操作（部署/启停/调参）需 CONFIRM；bot 内挂撤单/止损由引擎管理。
- 不碰：实盘、condor、Gateway/DEX、Ubuntu、WSL2 两个发行版、`D:\trade` 数据层。
- P1 只做单账户，币安永续模拟盘（`binance_perpetual_paper_trade`），零 API key。

---

## 文件结构

| 文件 | 职责 | 动作 |
|---|---|---|
| `E:\hummingbot\hummingbot-api\` | API server + engine（Docker） | 部署（外部） |
| `E:\hummingbot\mcp\` | Hummingbot MCP server（uv） | 部署（外部） |
| `.mcp.json` | 注册 `hummingbot-mcp` server | Modify |
| `skills/trade-assistant/SKILL.md` | 加 Hummingbot Bridge 小节 + references 指南行 | Modify |
| `skills/trade-assistant/references/08-hummingbot-bridge.md` | 英文桥接文档（MCP 工具/controller 映射/CONFIRM 作用域） | Create |
| `agents/binance-orchestrator.md` | 决策表加 Hummingbot 行 | Modify |
| `docs/architecture.md`、`docs/usage.md` | 架构/使用更新 | Modify |
| `README.md` | 依赖 + 部署方案 | Modify |
| 镜像 `D:\claude-dev\skills\trade-assistant` | skill 层同步 | Sync |

---

## Task 1: 环境前置检查 + E:\hummingbot 初始化

**Files:** 无（宿主环境操作）

- [ ] **Step 1: 检查环境**

Run:
```bash
docker ps 2>&1 | head -3                      # Docker Desktop 必须可连接
uv --version 2>&1 | head -1                   # 需要 uv
python --version 2>&1 | head -1               # 需要 Python 3.11+
ls /e/ 2>&1 | head -3                         # E 盘必须可写
git --version
```
Expected: `docker ps` 输出容器列表（非 "cannot connect"）；`uv --version`、`python --version`、`git --version` 有版本号；`ls /e/` 不报错。
如果 Docker 未运行：提示用户启动 Docker Desktop 后重试（此步阻塞后续）。

- [ ] **Step 2: 初始化部署目录并克隆**

Run:
```bash
mkdir -p /e/hummingbot && cd /e/hummingbot
git clone --depth 1 https://github.com/hummingbot/hummingbot-api.git 2>&1 | tail -2
git clone --depth 1 https://github.com/hummingbot/mcp.git 2>&1 | tail -2
```
Expected: `hummingbot-api/`、`mcp/` 两个目录存在：
```bash
ls /e/hummingbot/hummingbot-api/Makefile /e/hummingbot/mcp/pyproject.toml
```

## Task 2: 部署 hummingbot-api（Docker Desktop）

**Files:** 无（部署到 Docker）

- [ ] **Step 1: 读官方部署说明**

Read: `E:\hummingbot\hummingbot-api\README.md` 的 Quickstart 与 `E:\hummingbot\hummingbot-api\Makefile` 的 `setup`/`deploy` 目标。确认 `make setup` 需要的输入（按 deploy skill 惯例：API username/password/config password，默认 `admin/admin/admin`）与端口（默认 8000）。

- [ ] **Step 2: 配置代理（容器访问币安必需）**

在 `E:\hummingbot\hummingbot-api\` 下按官方方式配置容器环境变量，加入：
```
HTTPS_PROXY=http://host.docker.internal:7897
HTTP_PROXY=http://host.docker.internal:7897
```
（具体位置：`docker-compose.yml` 的 `environment:` 或官方指定的 `.env`；`host.docker.internal` 是容器访问宿主机的地址。改前 `cp docker-compose.yml docker-compose.yml.bak`。）

- [ ] **Step 3: 构建并启动**

Run:
```bash
cd /e/hummingbot/hummingbot-api
make setup    # 非交互：按 Step 1 确认的方式提供默认凭据
make deploy
```
Expected: `docker compose ps` 显示 `hummingbot-api` 容器 running。

- [ ] **Step 4: 验证 API 起来**

Run:
```bash
docker logs hummingbot-api 2>&1 | grep -i "uvicorn running" | head -2
curl -s http://localhost:8000/ 2>&1 | head -5
```
Expected: 日志含 "Uvicorn running"；curl 有 HTTP 响应（401 或 JSON 均表示服务在）。

## Task 3: 准备 hummingbot/mcp（uv 原生 Windows）

**Files:** 无（外部目录 `E:\hummingbot\mcp`）

- [ ] **Step 1: uv sync**

Run:
```bash
cd /e/hummingbot/mcp && uv sync 2>&1 | tail -5
```
Expected: 无错误（uv 创建 .venv）。

- [ ] **Step 2: 冒烟测试 MCP server 可启动**

Run（给一个不存在的 API 地址也应能启动并响应 initialize）:
```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n' \
  | HUMMINGBOT_API_URL=http://localhost:8000 HUMMINGBOT_USERNAME=admin HUMMINGBOT_PASSWORD=admin \
  uv run main.py 2>&1 | head -3
```
Expected: 输出一行 JSON-RPC initialize 响应（含 `"serverInfo"`）。

## Task 4: 集成进 trade-agents —— `.mcp.json`

**Files:**
- Modify: `.mcp.json`

**Interfaces:**
- Consumes: Task 2/3 部署好的 `E:\hummingbot\mcp`（`${HUMMINGBOT_MCP_DIR}` 指向它）、API 于 `http://localhost:8000`
- Produces: Claude Code 可见的 `hummingbot-mcp` MCP server

- [ ] **Step 1: 读当前 .mcp.json 格式**

Read: `D:\claude-dev\agents\trade-agents\.mcp.json`。沿用其 `mcpServers` 结构与 `${CLAUDE_PLUGIN_ROOT}` 风格的变量展开。

- [ ] **Step 2: 追加 `hummingbot-mcp` server**

在该 JSON 的 `mcpServers` 中新增（保持现有 `binance` 条目不动）：

```json
"hummingbot-mcp": {
  "type": "stdio",
  "command": "uv",
  "args": ["--directory", "${HUMMINGBOT_MCP_DIR}", "run", "main.py"],
  "env": {
    "HUMMINGBOT_API_URL": "${HUMMINGBOT_API_URL:-http://localhost:8000}",
    "HUMMINGBOT_USERNAME": "${HUMMINGBOT_API_USERNAME:-admin}",
    "HUMMINGBOT_PASSWORD": "${HUMMINGBOT_API_PASSWORD:-admin}"
  }
}
```
> 若 Claude Code 的 `.mcp.json` 不支持 `${VAR:-default}` 语法，改用纯 `${VAR}` 并把默认值写进文档（README 部署方案里给出 `HUMMINGBOT_MCP_DIR`/`HUMMINGBOT_API_USERNAME`/`HUMMINGBOT_API_PASSWORD` 三个环境变量的设置示例）。

- [ ] **Step 3: 校验 JSON**

Run: `node -e "const c=require('./.mcp.json'); console.log(Object.keys(c.mcpServers).join(','))"`
Expected: 含 `binance` 与 `hummingbot-mcp`。

## Task 5: SKILL.md Hummingbot Bridge 小节 + references/08

**Files:**
- Modify: `skills/trade-assistant/SKILL.md`
- Create: `skills/trade-assistant/references/08-hummingbot-bridge.md`

**Interfaces:**
- Produces: orchestrator（Task 6）引用的能力描述与规则

- [ ] **Step 1: SKILL.md 加小节与 references 指南行**

在 SKILL.md 加一节 `## Hummingbot Bridge (automated execution — additive, not replacement)`，内容：
- 定位：Hummingbot 是**自动化执行引擎**，由本 skill/agent 通过 `hummingbot-mcp` MCP server 控制；**不替代** binance-cli 分析/人工路径。
- 触发：部署/启停/监控 Hummingbot bot、查询 bot 状态/PnL。
- 前置：`HUMMINGBOT_MCP_DIR`、`HUMMINGBOT_API_URL/USERNAME/PASSWORD` 环境变量已设；API 容器在跑。
- 硬规则：**策略级操作需 CONFIRM**（展示完整计划后用户确认）；bot 内挂撤单/止损由引擎管理。
- P1 模式：`binance_perpetual_paper_trade` 模拟盘。
在 `## references Guide` 表加一行：`| 08-hummingbot-bridge.md | Hummingbot automated-execution bridge (MCP tools, controller mapping, CONFIRM scope) | deploy/monitor bots; "帮我部署个网格/查 bot 状态" |`

- [ ] **Step 2: 创建 `references/08-hummingbot-bridge.md`（英文 skill 层）**

内容须覆盖（英文撰写，用户可见输出中文）：
- **MCP 工具**：列 `hummingbot-mcp` 提供的工具类别（account / bot_management / controllers / executors / market_data / portfolio / trading / history），给出查询类工具的用法示例。
- **Controller ↔ playbook 映射**：`grid_strike`（网格）、`pmm_mister`（做市）、`position_executor`（三重屏障）——各对应本 skill playbook 的什么用途。
- **模拟盘**：`binance_perpetual_paper_trade` 用法与"非实盘"标注要求。
- **代理**：容器内 `host.docker.internal:7897` 说明。
- **CONFIRM 作用域**：策略级 vs bot 内（逐字引用 Task 5 Step 1 的规则）。
- **账户隔离**：Hummingbot 管理的账户与 binance-cli 手动账户分开（子账户）。

## Task 6: binance-orchestrator 决策表 + docs

**Files:**
- Modify: `agents/binance-orchestrator.md`
- Modify: `docs/architecture.md`、`docs/usage.md`

**Interfaces:**
- Consumes: Task 5 定义的 Hummingbot Bridge 能力

- [ ] **Step 1: orchestrator 决策表加 Hummingbot 行**

在 `agents/binance-orchestrator.md` 的 `## Provider Decision Table` 加一行：
```
| **Hummingbot bot 部署/启停/状态/PnL** | `hummingbot-mcp`（MCP server） | read SKILL.md → Hummingbot Bridge + `references/08`; 策略级操作先展示计划等 CONFIRM; 查询类直接调 MCP tools |
```
并在 `## Path Resolution` 的 external-skills 说明里补一句：Hummingbot 的 MCP server 由 `HUMMINGBOT_MCP_DIR` 环境变量定位（不写死路径）。

- [ ] **Step 2: docs/architecture.md 加 Hummingbot 分层**

在分层视图补 Hummingbot 执行层（`分析栈 → 决策 → hummingbot-mcp → hummingbot-api(Docker) → 币安`），标注"执行权交引擎，策略级 CONFIRM"。

- [ ] **Step 3: docs/usage.md 加触发场景**

在速查表加：`"帮我部署个网格bot" → 读 references/08 → 展示计划 → CONFIRM → 经 hummingbot-mcp 部署`；`"查 Hummingbot bot 状态/盈亏" → 直接调 MCP 查询 → 中文表格`。

## Task 7: 端到端验证闭环

**Files:** 无（验证操作）

**Interfaces:**
- Consumes: Task 4 的 `.mcp.json`、Task 2/3 部署

- [ ] **Step 1: MCP 注册可见**

Run: `claude mcp list 2>&1 | grep -i hummingbot`
Expected: 出现 `hummingbot-mcp`。

- [ ] **Step 2: MCP tools/list + 只读行情**

Run:
```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}\n' \
  | HUMMINGBOT_API_URL=http://localhost:8000 HUMMINGBOT_USERNAME=admin HUMMINGBOT_PASSWORD=admin \
  uv --directory /e/hummingbot/mcp run main.py 2>&1 | head -3
```
Expected: initialize + tools/list 两行响应；tools/list 含 bot/controller/portfolio 类工具。

- [ ] **Step 3: 模拟盘 grid bot 全周期（经 MCP/API）**

按 `references/08` 的用法，用 MCP tools（或直接 Hummingbot API）在 `binance_perpetual_paper_trade` 上：
1. 部署 `grid_strike` controller（交易对如 `BTC-USDT`，模拟资金用 API 配置的 paper balance）。
2. 启动 bot → `status` 确认 running。
3. 查询 portfolio/positions → 有模拟持仓或挂单数据。
4. 停止 bot。
Each step verified by the tool's returned data. 若 MCP 工具的部署流程与文档不符，按 API 实际响应调整（记录到 Task 8 的 README）。

- [ ] **Step 4: 中文汇报 + 插件回归**

用 agent 模式生成中文汇报（bot 状态/模拟 PnL/仓位，标注"模拟盘非实盘"）。
Run: `cd /d/claude-dev/agents/trade-agents && node --test tests/*.test.mjs`
Expected: 19 pass / 0 fail（插件现有测试不受影响）。

## Task 8: README 更新（依赖 + 部署方案）

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 1-7 验证过的实际部署步骤

- [ ] **Step 1: 依赖清单更新**

在 README「依赖与环境要求」表补充 Hummingbot 相关行：Docker Desktop（Hyper-V）、Python ≥3.11 + uv、`HUMMINGBOT_MCP_DIR`/`HUMMINGBOT_API_URL`/`HUMMINGBOT_API_USERNAME`/`HUMMINGBOT_API_PASSWORD` 环境变量。

- [ ] **Step 2: 新增「Hummingbot 部署方案」小节**

写入实际跑通的步骤（Task 1-3 的顺序 + 关键命令 + 代理配置 + 凭据 + `claude mcp` 注册说明），明确"P1 模拟盘、零 API key"与"实盘需 `hbot connect binance_perpetual` 配 key + 账户隔离建议"。

## Task 9: 镜像同步 + 最终提交

**Files:**
- Sync: `D:\claude-dev\skills\trade-assistant`
- Commit: 插件仓库

**Interfaces:**
- Consumes: Task 4-6/8 的全部插件改动

- [ ] **Step 1: 同步镜像并校验**

Run:
```bash
cd /d/claude-dev/agents/trade-agents
cp skills/trade-assistant/SKILL.md skills/trade-assistant/references/*.md /d/claude-dev/skills/trade-assistant/
cp skills/trade-assistant/references/08-hummingbot-bridge.md /d/claude-dev/skills/trade-assistant/references/
diff -rq skills/trade-assistant /d/claude-dev/skills/trade-assistant
```
Expected: 仅剩分发专属文件差异（`.git/.gitignore/CLAUDE.md/LICENSE/README.md`），无 `Files ... differ`。

- [ ] **Step 2: 全量验证 + 提交**

Run:
```bash
cd /d/claude-dev/agents/trade-agents
node --test tests/*.test.mjs 2>&1 | tail -4
for f in skills/trade-assistant/scripts/*.mjs mcp/binance-mcp-server.mjs; do node --check "$f" || echo "FAIL $f"; done
node -e "console.log('mcpServers:', Object.keys(require('./.mcp.json').mcpServers).join(','))"
git add -A && git commit -m "feat: integrate Hummingbot automated-execution bridge (P1: deploy + MCP + docs)"
git log --oneline -3 && git status --short
```
Expected: 19/19 测试通过；node --check 无 FAIL；mcpServers 含 binance + hummingbot-mcp；一次干净提交；工作树 clean。

---

## 自审记录

- **Spec 覆盖**：§3 部署拓扑→Task 1-3；§3 集成表→Task 4-6；§5 验证闭环→Task 7；§10 验收（README/依赖/部署方案，用户补充要求）→Task 8；镜像/提交→Task 9。§4 CONFIRM 作用域→Task 5 Step 1；§6 错误处理→各任务验证门 + references/08；§8 边界（P2-P4 不做）→Global Constraints。
- **占位符**：无 TBD/TODO；每步有命令与预期输出。Task 2 Step 1 要求 executor 读 hummingbot-api 自身 README/Makefile 确认交互参数——这是外部项目部署的合理依据，非占位。
- **类型一致**：`hummingbot-mcp` server 名、`${HUMMINGBOT_MCP_DIR}`、`binance_perpetual_paper_trade`、`grid_strike` 在 Task 4-7 间一致。
- **环境相关风险（执行时需适应）**：`make setup` 交互提示、`${VAR:-default}` 语法支持、Docker 镜像拉取耗时、MCP 工具实际部署流程——Task 7 Step 3 明确"按 API 实际响应调整并记录到 README"。
