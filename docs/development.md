# 开发文档

> 面向本插件的开发者/维护者：结构、如何扩展、如何测试、git 工作流。

## 项目结构（完整树）

```
trade-agents/
├── .claude-plugin/
│   └── plugin.json          # 插件清单（name/version/description/keywords）
├── .mcp.json                # MCP 注册（${CLAUDE_PLUGIN_ROOT} 指向本插件根）
├── marketplace.json         # 发布用 marketplace 清单（source: "."）
├── README.md                # 入口 README（链接到 docs/）
├── CLAUDE.md                # 给 AI 看的开发文档（AI 进仓库自动加载）
├── docs/                    # 说明文档
│   ├── architecture.md      # 架构设计
│   ├── skill-guide.md       # skill 层详解
│   ├── agents.md            # agents 指南
│   ├── vector-search.md     # 向量检索指南
│   ├── usage.md             # 使用场景速查
│   ├── development.md       # 本文件：开发文档
│   └── conventions.md       # 规范
├── agents/                  # agent 定义（auto-discover）
│   ├── retrospective-writer.md
│   └── binance-orchestrator.md
├── mcp/
│   └── binance-mcp-server.mjs  # 行情/账户 MCP（confirm:true）
└── skills/
    └── trade-assistant/     # ★ skill 层（唯一真相源）
        ├── SKILL.md         # 英文指令 + 双支柱 + CONFIRM
        ├── references/      # 策略知识库（8 英文文件）
        ├── scripts/         # 14 个零依赖脚本
        └── evals/           # skill 测试用例
```

## 如何扩展

### 新增/修改策略知识
1. 编辑 `skills/trade-assistant/references/<NN>-*.md`（英文）。
2. 修改 SKILL.md 的 references 指引表（若改了文件名/序号）。
3. 同步镜像（见下）。
4. 涉及用户输出模板（复盘/周报/月报正文）→ 保持中文。

### 新增脚本
1. 放到 `skills/trade-assistant/scripts/`，零依赖（只用 `node:` 内置模块 + 既有 `_lib.mjs`）。
2. 注释用英文；面向用户的输出用中文。
3. 在 SKILL.md 的脚本工具箱表 + docs/skill-guide.md + docs/usage.md 补一行。
4. `node --check <file>` 过语法；跑一次真实用例验证。

### 新增 agent
1. 在 `agents/` 下建 `<kebab-name>.md`，frontmatter 含 name/description/model/color/tools。
2. 描述里给 2–4 个触发场景 + 正文 "When to invoke" 区块。
3. 系统提示词英文 + 顶部"所有输出中文"硬规则。
4. 校验：`bash <plugin-dev>/.../validate-agent.sh agents/<name>.md`。
5. 在 docs/agents.md 与 README 组件树补充。

### 修改 MCP server
- 编辑 `mcp/binance-mcp-server.mjs`，`.mcp.json` 无需改（路径不变）。
- 写工具必须保持 `confirm: true` 强制。

## 测试

```bash
# JS 语法
for f in skills/trade-assistant/scripts/*.mjs mcp/*.mjs; do node --check "$f"; done

# agent 校验
bash <plugin-dev>/skills/agent-development/scripts/validate-agent.sh agents/retrospective-writer.md

# 插件清单
node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/plugin.json'))"

# 向量检索（真实数据）
node skills/trade-assistant/scripts/vector.mjs index
node skills/trade-assistant/scripts/vector.mjs query "止损 插针" --top 5

# 周报生成（回归）
node skills/trade-assistant/scripts/summary.mjs weekly --date YYYY-MM-DD   # 跑完删临时文件

# 镜像一致性
diff -rq skills/trade-assistant ../skills/trade-assistant --exclude=.git --exclude=README.md --exclude=LICENSE --exclude=.gitignore
```

## Git 工作流

```bash
git add -A && git commit -m "<type>: <desc>"   # 例如 docs:/feat:/fix:/refactor:
git push origin main
```

建议提交前缀：`feat`（新能力）、`fix`（修复）、`docs`（文档）、`refactor`、`sync`（镜像同步）。

## 数据层（不在本仓库内）

- `D:\trade` 是独立 git 仓库（数据层）：`data/trade.db`、`retrospectives/`、`plans/`、`coin-classification.json`、`vector-index.json`（gitignore）。
- 复盘/周报/月报归档在 `D:\trade\retrospectives\`，由 agent 或 `summary.mjs` 生成并 git commit。
