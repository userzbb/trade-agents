# 规范（Conventions）

> 本项目所有文件必须遵守的约定。违反可能造成触发失败、解析错误或仓库漂移。

## 1. 命名规范（kebab-case）

Claude Code 生态统一 **kebab-case**：全小写 + 连字符，字母数字开头结尾，3–50 字符，**禁止**下划线/大写/空格。

| 对象 | 规则 | 本项目实例 |
|---|---|---|
| 插件名（plugin.json name） | kebab-case | `trade-agents` |
| Skill 名（SKILL.md name） | kebab-case | `trade-assistant` |
| Agent 名（agents/*.md name） | kebab-case, 3–50 字符 | `retrospective-writer`, `binance-orchestrator` |
| MCP server key（.mcp.json） | kebab-case | `binance-trade` |
| reference 文件名 | `<NN>-<kebab-slug>.md`，NN 从 00 起 | `03-risk-and-position.md` |
| 脚本名 | kebab-case + `.mjs` | `binance-mcp-server.mjs` |
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
| `sync` | 镜像同步 |

## 7. 防漂移规范（唯一真相源）

1. **skill 唯一真相源 = `skills/trade-assistant/`**（本插件内）。
2. 改完 skill 后**必须**同步镜像 `D:\claude-dev\skills\trade-assistant`（`diff -rq` 验证）。
3. agents **不复制** skill 的环境事实/决策表大段，引用 SKILL.md。
4. 策略规则或 binance 决策表变更传播链：真相源 → 镜像 → agents 引用。
5. 不在镜像里直接改（那是产物，不是源）。

## 8. 安全规范

- 不硬编码 API 密钥/私钥；用 `binance-cli profile create` 管理（profile `my-main`）。
- 密钥走环境变量（`BINANCE_API_KEY/SECRET` 或 profile），不落库不落 md。
- 写操作一律走 CONFIRM 协议，工具层强制 `confirm:true`。
- 不把敏感信息写进复盘/周报 md。
