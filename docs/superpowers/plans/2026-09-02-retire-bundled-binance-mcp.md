# Retire bundled `binance-trade` MCP server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 退役并删除插件自带的 `binance-trade` MCP server（`mcp/binance-mcp-server.mjs` + `.mcp.json` 注册 + 全部提及），把 Binance 读/写收敛到 skill 原生路径（scripts 读 + `binance-cli` 手动执行，PreToolUse hook + CONFIRM + permissions.ask 安全门不变）。**保留**外部 `hummingbot-mcp` 注册与外部引擎。这是用户决策（2026-09-02）。

**Architecture:** `binance-trade` MCP 是"无消费者的平行面"——skill 从不在运行时调用它的 11 个工具（读=scripts 重复、写=`binance-cli` 重复），却让每个会话多一个常驻 MCP 进程 + 工具 schema 占上下文。退役 = 删除 server 源文件 + 其测试 + `.mcp.json`/`.claude/settings.local.json` 注册项，并把文档里把它当"已内置功能"的表述改成"读走 scripts / 执行走 binance-cli"。**改动不触碰** `skills/trade-assistant/` 任何运行时指令（全库检索确认 SKILL/references 不调用它），只改插件基础设施 + 文档。

**Tech Stack:** 纯删除/文档编辑；无新增代码。验证 = grep 无残留 + `node --test tests/*.test.mjs` 绿 + plugin.json JSON 合法。

**Spec:** (inline) 依据本会话事实核查：
- `mcp/binance-mcp-server.mjs` 暴露 8 读 + 3 写（place_order/set_stop_loss/cancel_order，`_meta['anthropic/requiresUserInteraction']`）。`tests/mcp.test.mjs` import 它。
- 引用它的文件（grep 结果）：`.claude/settings.local.json`（enabledMcpjsonServers）、`.mcp.json`（binance-trade 块）、`.claude-plugin/plugin.json`（description 含 "Binance market-data & order MCP server"、keywords 含 mcp）、`CLAUDE.md`（Key paths MCP 行、Common tasks "Edit the MCP server"）、`README.md`（组件树/特性/环境变量段落）、`docs/architecture.md`（能力层 box + 职责矩阵）、`docs/conventions.md`（§1 命名表 `binance-trade` 行）、`docs/development.md`（结构树 + MCP 小节）。
- `skills/trade-assistant/**` 与 `agents/**`：**不引用**它（保留）。
- `.mcp.json` 只保留 `hummingbot-mcp`；`HUMMINGBOT_MCP_DIR/API_*` 环境变量语义不变（envcheck 不受影响）。

## Global Constraints

- 零 npm 依赖；纯删除/文档。不引入新运行时文件。
- 用户输出中文、注释英文（涉及文档均为中文文档）。
- **保留**：`hooks/block-trading-commands.mjs`、CONFIRM 协议、`.mcp.json` 的 `hummingbot-mcp`、`HUMMINGBOT_*` 环境变量、`.claude/settings.local.json`（仅删 `binance-trade` 项）。**不触碰** `skills/trade-assistant/`（SKILL/references/scripts）运行时行为，除非 grep 证明有死引用（如有，最小改）。
- 文档纪律：改一处补一处，不留死链。release：完成 bump `.claude-plugin/plugin.json` 0.4.0 → 0.5.0（用户可见变更，release commit）。
- 测试：删除 `tests/mcp.test.mjs` 后全量 `node --test tests/*.test.mjs` 须绿；`git grep -n "binance-mcp-server\|binance-trade" -- . ':!docs/superpowers'` 收敛为 0（历史计划/本文件除外）。

## 文件结构

- Delete: `mcp/binance-mcp-server.mjs`、`tests/mcp.test.mjs`
- Modify: `.mcp.json`、`.claude/settings.local.json`、`.claude-plugin/plugin.json`、`CLAUDE.md`、`README.md`、`docs/architecture.md`、`docs/conventions.md`、`docs/development.md`、`docs/usage.md`（若 grep 命中）
- Create: 无

---

### Task A: 删除 server 源/测试 + 取消注册（代码面）

**Files:** delete `mcp/binance-mcp-server.mjs`、`tests/mcp.test.mjs`；modify `.mcp.json`、`.claude/settings.local.json`

**Interfaces:** 无对外接口保留；`hummingbot-mcp` 注册与 env 语义不变。后续任务依赖：git 里此二文件已删、注册项已清。

- [ ] **Step 1: 删源与测试**
```bash
git rm mcp/binance-mcp-server.mjs tests/mcp.test.mjs
```
Expected: `tests/mcp.test.mjs` 不再 import 已删模块；全量测试仍在（无其他文件 import 该 server——先跑 `git grep -n "binance-mcp-server" -- 'tests/**' 'skills/**' 'agents/**' 'hooks/**' ':!docs/superpowers'` 确认无引用再删；有则先随 Task 一并去掉）。

- [ ] **Step 2: `.mcp.json` 移除 `binance-trade` 块，保留 `hummingbot-mcp`**
从当前 `.mcp.json` 删掉整个 `"binance-trade": {…}` 键（4-9 行区域，含其 `env.BINANCE_PROXY`）。结果形如：
```json
{
  "mcpServers": {
    "hummingbot-mcp": {
      "type": "stdio",
      "command": "uv",
      "args": ["--directory", "${HUMMINGBOT_MCP_DIR}", "run", "main.py"],
      "env": {
        "HUMMINGBOT_API_URL": "${HUMMINGBOT_API_URL:-http://localhost:8000}",
        "HUMMINGBOT_USERNAME": "${HUMMINGBOT_API_USERNAME:-admin}",
        "HUMMINGBOT_PASSWORD": "${HUMMINGBOT_API_PASSWORD:-hb_p1_paper_2026}"
      }
    }
  }
}
```
校验 `node -e "JSON.parse(require('fs').readFileSync('.mcp.json'))"`。

- [ ] **Step 3: `.claude/settings.local.json` 移除 `binance-trade`**
```json
{ "enabledMcpjsonServers": ["hummingbot-mcp"] }
```

- [ ] **Step 4: 验证 + 提交**
`git grep -n "binance-mcp-server\|binance-trade" -- . ':!docs/superpowers'`（此时应只剩 Task B 待改的文档/清单命中，运行处零命中）。
```bash
git add -A
git commit -m "refactor: retire bundled binance-trade MCP server (reads→scripts, writes→binance-cli; keep hummingbot-mcp)"
```

---

### Task B: 清单与文档同步（无死链）

**Files:** modify `.claude-plugin/plugin.json`、`CLAUDE.md`、`README.md`、`docs/architecture.md`、`docs/conventions.md`、`docs/development.md`、`docs/usage.md`（如命中）

**Interfaces:** Task A 已删源/注册；本任务清所有文本提及。

- [ ] **Step 1: `.claude-plugin/plugin.json`**
- description：删 "Binance market-data & order MCP server" 段。改为 —— 从 "two agents…" 前移除 `Binance market-data & order MCP server;` 短语，并在描述里补一句执行面措辞，例如 "…local BM25 vector retrieval over retrospectives. Strongly depends on the external `/binance` skill (binance-cli) for data and execution; Freqtrade/Hummingbot engines are called directly (REST/official MCP), no bundled MCP server." 让描述与真实架构一致。
- keywords：移除 `"mcp"` 项（若保留会导致 marketplace 分类误导；mcp 语义已由外部 hummingbot 承担，仍可留 `binance`/`futures`/`orchestrator`）。
校验 `node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/plugin.json'))"`。

- [ ] **Step 2: `CLAUDE.md`**
- Key paths 区 "MCP: `mcp/binance-mcp-server.mjs` + `.mcp.json`" → 改为 "MCP: `.mcp.json` — registers only the external `hummingbot-mcp` (uv)". 删 Key paths 里的 `mcp/binance-mcp-server.mjs` 条目（如有）。
- Common tasks "**Edit the MCP server** → `mcp/binance-mcp-server.mjs`; keep `confirm: true`…" → 改为指向真实现状（无自带 binance server）：删该条，或改成 "**Manage MCP registration** → `.mcp.json`（仅外部 hummingbot-mcp）；不要新增自带 Binance MCP server——读走 scripts、写走 binance-cli+CONFIRM。"
- 其余引 MCP server 为自带 Binance 的句子一并核对。

- [ ] **Step 3: `README.md`**
- 开头特性句 / "组件"树：`mcp/binance-mcp-server 行情/账户 MCP + 下单(confirm:true)` 行删除/改写；`README.md` 里 "MCP（行情/下单）"、"binance-mcp-server" 等出现处按真实架构改（读=scripts 工具箱、执行=/binance binance-cli、引擎=Freqtrade REST + hummingbot 官方 MCP）。部署流程 ①-⑥ 步骤表里的 MCP 提及同步。
- 语言边界/同步规则段若引 MCP 也核。

- [ ] **Step 4: `docs/architecture.md`**（能力层 ASCII box + 组件职责矩阵）
- box：`│ mcp/binance-mcp-server  行情/账户 MCP（confirm:true）│` → 删该行（或改为 `│ .mcp.json  外部 hummingbot-mcp（uv）│`）。
- 矩阵行 "mcp/binance-mcp-server.mjs | 行情/账户 MCP + 下单(confirm:true)" → 删或改为 hummingbot-mcp 外部注册行。

- [ ] **Step 5: `docs/conventions.md`**（§1 命名表）
- 行 `| MCP server key（.mcp.json） | kebab-case | binance-trade |` → 改成 `hummingbot-mcp` 作实例（或加注"外部 MCP；本项目不再自带 Binance MCP server"）。

- [ ] **Step 6: `docs/development.md`**（结构树 + 修改 MCP 小节）
- 树：删 `mcp/binance-mcp-server.mjs` 子树/标注；"## 修改 MCP server" 小节 → "注册外部 MCP（.mcp.json）：仅 hummingbot-mcp；不要新增自带 Binance MCP（见 conventions/architecture）。"
- 树里 `├── mcp/binance-mcp-server.mjs # 行情/账户 MCP（confirm:true）` 删除。

- [ ] **Step 7: 收敛 grep + 提交**
```bash
git grep -n "binance-mcp-server\|binance-trade" -- . ':!docs/superpowers'   # 期望 0
node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/plugin.json'))"
node --test tests/*.test.mjs    # 全绿（mcp.test.mjs 已删）
git add -A
git commit -m "docs: sync plugin manifest + docs after retiring bundled binance-trade MCP"
```

---

### Task C: release bump 0.5.0

**Files:** modify `.claude-plugin/plugin.json`

- [ ] **Step 1: bump 0.4.0 → 0.5.0**（version 字段）
- [ ] **Step 2: 提交 release**
```bash
git add .claude-plugin/plugin.json
git commit -m "release: bump plugin to 0.5.0 (retire bundled binance-trade MCP)"
```

---

## Self-Review
- **Coverage**：删除源/测试/注册（Task A）→ 清单/文档全同步（Task B，7 文件）→ bump（Task C）。grep 收敛 0 + 全量测试绿双验收。
- **Placeholder**：无 TBD；每步给精确改动或验证命令。
- **保留面核对**：hummingbot-mcp、HUMMINGBOT_*、hooks、CONFIRM、settings.local.json（仅删 binance-trade 项）在 Global Constraints 明确列出，Task A/B 不误删。
- **无死链**：Task B Step 7 的收敛 grep 是硬门禁；`docs/superpowers` 历史计划与本文档豁免。
- **成本**：若未来要 MCP 跨客户端，可从 git 历史找回 server 源（保留删除前 commit 即可回溯）。
