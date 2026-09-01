# trade-agents

**单插件即全部功能** —— Binance U 本位永续合约交易系统的唯一安装入口。skill（分析大脑）+ MCP（行情/下单）+ agents（自治子任务）+ BM25 向量检索全部内置，外部仅强依赖 `/binance` skill。

> 本项目前身是 `trade-plugin`（已退役），其 skill 与 MCP 已并入。`D:\claude-dev\skills\trade-assistant` 是独立分发镜像（`npx skills` 路径），内容以本插件为准。
> Skill 层内容为英文（效率优先）；**所有给用户的输出为中文**。

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

## 安装

**前置**：安装 `/binance` skill（数据/执行层强依赖）。

```bash
npx skills add binance/binance-skills-hub
```

**方式一（推荐）**：经 GitHub marketplace。

```bash
claude plugin marketplace add https://github.com/userzbb/trade-agents
claude plugin install trade-agents
```

**方式二**：本地临时启用。

```bash
claude --plugin-dir D:/claude-dev/agents
# 或会话内 /plugin → Add from folder → 选择 D:\claude-dev\agents
```

**配置数据层**（默认 `D:/trade`）。

```bash
export TRADE_HOME=D:/trade
export BINANCE_PROXY=http://127.0.0.1:7897
```

首次使用前：`binance-cli profile create` 配置 API 密钥（profile `my-main`）。

## 架构分层

| 层 | 位置 | 职责 |
|---|---|---|
| 交互 | `skills/trade-assistant` skill | 用户入口、CONFIRM 协议、文档编排、binance 决策 |
| 自治 | `agents/` 两个 agent | 复盘/周报/月报文档生成；binance 编排 |
| 能力 | `references/` + `scripts/` | 策略唯一真相源 + 分析工具箱 + vector.mjs |
| 数据/执行 | `/binance` 生态 + `D:\trade` | 行情/信号/情绪/链上；SQLite 与 md 归档 |

环境事实（代理 `127.0.0.1:7897`、`fapi.binance.com`、限流 sleep 2–4、时钟漂移重试、`binance-cli` v1.3.0 profile `my-main`）只写一份在 skill 的 SKILL.md，agents 引用不复制。

## 语言边界（硬规则）

- **英文**：SKILL.md 指令、references 策略、脚本注释、agent 提示词、README 结构。
- **中文**：一切用户可见输出 —— 复盘/周报/月报/计划文档正文、对话表格、摘要。

## 同步规则

skill 层唯一真相源在 `skills/trade-assistant/`。策略规则或 binance 决策表变更时：修改这里 → 镜像到 `D:\claude-dev\skills\trade-assistant` → 检查 agents 引用。三处保持对齐。
