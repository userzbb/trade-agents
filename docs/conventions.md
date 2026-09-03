# 规范（Conventions）

> 本项目所有文件必须遵守的约定。违反可能造成触发失败、解析错误或仓库漂移。

## 1. 命名规范（kebab-case）

Claude Code 生态统一 **kebab-case**：全小写 + 连字符，字母数字开头结尾，3–50 字符，**禁止**下划线/大写/空格。

| 对象 | 规则 | 本项目实例 |
|---|---|---|
| 插件名（plugin.json name） | kebab-case | `trade-agents` |
| Skill 名（SKILL.md name） | kebab-case | `trade-assistant` |
| Agent 名（agents/*.md name） | kebab-case, 3–50 字符 | `retrospective-writer`, `binance-orchestrator` |
| MCP server key（.mcp.json，外部 MCP） | kebab-case | `hummingbot-mcp`（本项目不自带 Binance MCP server） |
| reference 文件名 | `<NN>-<kebab-slug>.md`，NN 从 00 起 | `03-risk-and-position.md` |
| 脚本名 | kebab-case + `.mjs` | `envcheck.mjs` |
| marketplace 名 | 简短语义化 | `trade-marketplace` |
| Git 仓库名 | 小写 + 连字符 | `trade-agents` |

**反例**：`TradeAgents`、`trade_agents`、`agents`（太泛）、`trade assistant`。

## 2. 语言边界（硬规则）

- **英文**：SKILL.md 指令、references 策略内容、脚本注释、agent 提示词、CLAUDE.md、README 结构。
- **中文**：一切用户可见输出 —— 复盘/周报/月报/计划文档正文、对话表格、摘要、错误提示。
- description frontmatter 的**触发词保留中文**（触发匹配依赖中文短语），其余正文英文。
- `summary.mjs` 等生成 md 的脚本，正文输出保持中文。

## 3. 文件结构规范

```
skills/trade-assistant/
├── SKILL.md          # 英文指令；顶部放语言规则；references 指引表
├── references/       # 00-07 英文文件；用户输出模板保持中文
├── scripts/          # 零依赖 Node；注释英文；用户输出中文
└── evals/evals.json  # 单层结构（勿再嵌套 evals/evals/）
agents/*.md           # frontmatter + When to invoke
docs/*.md             # 用户可读，中文
```

## 4. YAML frontmatter 规范

**Skill / Agent 必填**：`name`、`description`、`model`、`color`（agent 还需 `tools`）。

- `description`：**用单行标量**（不要 `|` 块标量 —— 简单的校验脚本会误读成 1 字符）。长度 10–5000 字符（最佳 200–1000）。
- 单行描述里**避免**：冒号+空格（`x: y` 会断解析）、反斜杠路径（用 `/`）。
- agent 描述给 2–4 个触发场景 + 正文 `When to invoke` 区块（2–4 条 prose 列表）。
- `model` 用 `inherit`；`color` 按类型区分（blue/cyan=分析、green=成功、yellow=校验、red=安全、magenta=创造）。
- `tools` 最小权限：读多写少。

## 5. 脚本规范

- 只用 Node 内置模块（`node:fs/path/child_process/sqlite`…）+ 既有 `_lib.mjs`，**不引入 npm 依赖**。
- 自动处理代理/重试/限流（复用 `_lib.mjs` 的 `fapi`/`cliBin`）。
- 注释英文；面向用户的输出中文。
- 新增脚本后同步更新三处：SKILL.md 工具箱表、docs/skill-guide.md、docs/usage.md。

## 6. Git 提交规范

```
<type>: <描述>
```

| type | 用途 |
|---|---|
| `feat` | 新能力 |
| `fix` | 修复 |
| `docs` | 文档 |
| `refactor` | 重构 |
| `release` | 发布（bump plugin.json version） |

**发布纪律（CLAUDE.md Common tasks 同规则）**：
- 任何**用户可见功能改动**（skill/references/agents/MCP 行为变化）在 push 前必须 bump `.claude-plugin/plugin.json` 的 `version`（semver）——否则 marketplace 用户 `claude plugin update` 见 "already at latest" 拉不到新内容。
- 发布流：`feat/fix/docs` 提交 → `release` bump 提交 → push → `claude plugin marketplace update <name>` 验证。

## 7. 防漂移规范（唯一真相源）

1. **skill 唯一真相源 = `skills/trade-assistant/`**（本插件内）。
2. agents **不复制** skill 的环境事实/决策表大段，引用 SKILL.md。
3. 策略规则或 binance 决策表变更传播链：真相源 → agents 引用（SKILL.md references guide）。
4. 已废弃：旧的独立分发镜像 `D:\claude-dev\skills\trade-assistant` 不同步、不维护、不引用（CLAUDE.md 已声明 deprecated）。

## 8. 安全规范

- 不硬编码 API 密钥/私钥；用 `binance-cli profile create` 管理（profile `my-main`）。
- 密钥走环境变量（`BINANCE_API_KEY/SECRET` 或 profile），不落库不落 md。
- 写操作一律走 CONFIRM 协议（binance-cli 手动执行 + hook 拦截；无自带 MCP 工具层）。
- 不把敏感信息写进复盘/周报 md。

## 9. 架构文档规范（md 为真相源，不用可视化架构图）

> 决策（2026-09-02）：可视化架构图（archify HTML）维护成本高、token 密集、与 md 重复，**已废弃**。`docs/trade-agents-architecture.html` 与 `docs/architecture-v0.3.json` 已从仓库删除（git 历史可回溯）。教训保留：凡"生成产物 + 源"并存，必须留可编辑源；但架构图直接以 md 承载，不再引入生成链。

- **架构文档真相源 = `docs/architecture.md`（markdown）**：分层 ASCII 视图 + 组件职责矩阵 + 关键数据流 + 依赖模型。更新成本低、diff 可读、token 高效，日常开发直接改它。
- 架构变更（新增/改组件、引擎、数据层、安全机制、个人画像等）时：**同步更新 `docs/architecture.md`**；涉及开发约定则更新本 `docs/conventions.md`。两者都要维护，不允许只改代码不更文档。
- **不使用** archify / 生成 HTML 架构图；不维护架构 spec JSON。确有向外部读者展示的临时需要时，用 `docs/architecture.md` 内的 ASCII 分层图即可。
- **不主动维护/重做可视化架构图**：仅当用户**当前对话明确要求**"更新架构图"时才碰（届时用 architecture.md 的 ASCII 或一次性产物），否则绝不主动。
- 所有 md 文档需随代码演进维护；文档是项目一等公民（README/docs/*.md/skill references），不是发布后一次性的说明。文档务必写清楚（路径/命令/边界/依据），不要含糊或留过期数字。

## 10. Agent 开发规范

> 所有 agent 开发必须遵循 Claude Code 的 plugin-dev 规范（本机已装 `plugin-dev` 插件）。

- **新增/修改 agent**：使用 `plugin-dev:agent-development` skill 的规范（frontmatter 必填 name/description/model/color/tools；`When to invoke` 区块；触发场景 2–4 个）。
- **校验**：改完跑 `bash <plugin-dev>/skills/agent-development/scripts/validate-agent.sh agents/<name>.md`。
- **安全门**：agent 若持 Bash，正文顶部须有 "Absolute Gate"（资金操作/引擎状态变更只路由回 CONFIRM，绝不执行）——见 `agents/binance-orchestrator.md` 范例。
- **触发描述**：description 单行标量（勿块标量）；触发词保留中文；2–4 个触发场景 prose。
- **引用不复制**：agent 不复制 SKILL.md 环境事实/决策表大段，引用 SKILL.md / references。
- **开发 agent（本项目扩展开发）**：遵循 `docs/development.md` 的扩展步骤 + 本 conventions.md。

## 11. 文档命令可移植性（不锁死单一 shell / OS）

- 命令写成**可移植**：核心命令（`node …`、`docker compose …`、`uv …`、`git …`）跨平台一致，不贴 shell 专属语法。
- 因 shell/OS 而异的地方（环境变量持久化、绝对路径拼写、`curl` 别名）给**按环境对照**，不锁死单一 shell。三类：
  - **Windows PowerShell/cmd**：`setx`（持久）/ `$env:X="值"`（会话）、路径 `E:\...`（`E:/...` 亦可）、`curl.exe`。
  - **Git Bash / MSYS**：`export X=值`、路径 `/e/...`（映射 `E:\`）、`MSYS_NO_PATHCONV=1`（防容器路径改写）。
  - **macOS / Linux (bash/zsh)**：`export X=值`（持久进 `.zshrc`/`.bashrc` 或 launchctl/systemd）、路径 `~/...`、`curl`。
- **agent 运行时块（SKILL.md / references / agents）保持 bash/MSYS 写法**：Claude Code 的 Bash 工具即 Git Bash，尤其 `docker exec` 容器路径与官方 `.sh` 必须 bash——不要为了「用户复制习惯」把 agent 指令改成 PowerShell。
- 例外只标注不硬转：NFI 官方 `.sh` 属 bash/macOS-Linux 天然用例 → 标注「须 Git Bash 或 macOS/Linux」。
