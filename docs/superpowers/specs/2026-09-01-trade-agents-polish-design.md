# trade-agents 全面打磨 — 设计文档

> 日期：2026-09-01 · 状态：已获批
> 目标：用子 agent skills 对 `D:\claude-dev` 下的 MCP agents 与 skills 做一次全面打磨（agents + MCP server + 脚本测试 + evals + 镜像同步），完成后提交。
> 路径：方案 A（测试先行 + 分维度子 agent 复检）。

## 1. 背景与现状

唯一真相源是 `D:\claude-dev\agents`（trade-agents 插件，单插件全功能）。`skills/trade-assistant` 是独立分发镜像，`plugins/trade-plugin` 已退役（只读，不操作）。

探索确认的问题：

| # | 位置 | 问题 |
|---|---|---|
| 1 | `agents/*.md` | description 已改为 block scalar + `<example>` 块（未提交）；`binance-orchestrator.md:67` 硬编码 `C:\Users\zizim\.agents\skills\...` 绝对路径 |
| 2 | `mcp/binance-mcp-server.mjs` | `cli()` 用 `stdout.search(/[[{]/)` 截 JSON 较脆弱；`tools/list` 的 `required` 只标前 2 个参数（与真实必填无关）；`get_ticker` 用 `Promise.all` 并行打两个端点 |
| 3 | `skills/trade-assistant/scripts/` | 14 个零依赖脚本只有 `node --check`，无功能回归测试 |
| 4 | `evals/evals.json` | 6 条行为用例，覆盖面可扩展 |
| 5 | 镜像 | 源 `Two pillars (A)` vs 镜像 `Two pillars:` 漂移；镜像含分发专属文件（`.git/.gitignore/CLAUDE.md/LICENSE/README.md`）应保留 |

## 2. 铁律约束（不可违反）

1. **语言边界**：skill 层内容（SKILL.md、references、脚本注释、agent prompts、本文件所在文档）用中文文档约定；**所有用户可见输出为中文**。`<example>` 块内 user/assistant/commentary 保持英文（匹配触发格式惯例）。
2. **单一真相源**：源在 `skills/trade-assistant/`，改动后必须同步镜像并 `diff -rq` 验证零漂移。
3. **CONFIRM 协议**：任何下单/撤单/止损/杠杆/划转必须计划 + 模式 A/B + CONFIRM。本任务不涉及写操作。
4. **零依赖**：所有测试用 `node:test`，不引入 npm 包。
5. **不碰边界**：不操作 `D:\trade` 数据层、镜像的 git 历史、binance-cli 本身、退役的 `plugins/trade-plugin`。
6. **测试不发真实网络请求**：全部 mock。

## 3. 分节设计

### 3.1 Agents 层

**3.1.1 提交未完成改动**
- `agents/binance-orchestrator.md`（4 个 `<example>`）、`agents/retrospective-writer.md`（3 个 `<example>`）的 description block scalar + example 改动，用 plugin-dev 的 `validate-agent.sh` 校验后并入提交。
- 校验标准：name 3-50 字符小写连字符、description 含 "Use this agent when" + `<example>` 块、model=inherit、color 合法、tools 数组、系统提示含 second-person 与 responsibilities/output 结构。

**3.1.2 硬编码路径修复（binance-orchestrator.md）**
- 决策表 `crypto-market-rank` 行：删除字面路径，改为「skill 名引用 + env 覆盖 + 运行时解析」：
  1. 优先 `CRYPTO_MARKET_RANK_CLI` env；
  2. 否则 agent 自行 Read `crypto-market-rank` skill 的 SKILL.md 定位实际 CLI；
  3. 不写死任何绝对路径。
- 新增「路径解析」小节：脚本路径统一写 `<skill-root>/scripts/xxx.mjs`，`skill-root` = `TRADE_PLUGIN_ROOT` env（兜底 `D:/claude-dev/agents`）。消除第 54/71/72 行字面量。
- 同步在 `docs/agents.md` 反映 agent 职责变化（如适用）。

### 3.2 MCP server（mcp/binance-mcp-server.mjs）

**3.2.1 cli() JSON 解析健壮化**
- 顺序：`JSON.parse(out.trim())` 整段解析 → 失败用「首个 `[`/`{` 截取」兜底 → 再失败抛错。
- 保留 `/failed|recvWindow|Way too many/i` 错误探测与 3 次重试。

**3.2.2 tools/list 的 required 真实必填**
- 每个工具显式声明 required：
  - `get_klines`/`get_ticker`/`get_funding_rate`/`get_orderbook`/`get_long_short_ratio`：`['symbol']`
  - `get_positions`/`get_balance`/`get_open_orders`：`[]`
  - `place_order`：`['symbol','side','type','quantity']`
  - `set_stop_loss`：`['symbol','triggerPrice','quantity']`
  - `cancel_order`：`['symbol','orderId']`
- `confirm` 不进 schema required（服务端仍强制 `args.confirm !== true` 即抛错）。

**3.2.3 get_ticker 串行化**
- 去掉 `Promise.all`，两个 fapi 端点 `await` 串行，遵守「never fire parallel Binance calls」。

### 3.3 scripts 测试层

- 新增插件根 `tests/`（**开发期工件，不随镜像同步**），纯 `node:test`。
- 位置理由：MCP server 测试需引用插件根 `mcp/binance-mcp-server.mjs`，scripts 测试引用 `skills/trade-assistant/scripts/_lib.mjs`，放插件根一处容纳，避免进入分发镜像。
- 最小 mock 钩子：`_lib.mjs` 增加测试注入点（如 `MOCK_FAPI=1` 时返回 fixture），不改生产路径默认行为。
- 首批测试用例：
  - `solve.mjs` 网格求解输出结构（币种分类、期望值最优止损止盈、折后胜率、单笔最大亏损、6% 红线检查）
  - `ta.mjs` 指标计算（RSI/MACD 等，用固定 K 线 fixture）
  - `_lib.fapi` retry 逻辑（mock curl 抛错 → 重试 → 成功）
  - MCP `cli()` 三种输出形态（纯 JSON / 带前导文本 / 错误文本含 `{` 非 JSON）
- 运行方式（插件根执行）：`node --test tests/`。

### 3.4 evals 扩展

- `evals/evals.json` 6 → 10 条，新增：
  1. 技术面查询（"XX 的技术面怎么样" → ta.mjs + 中文汇总 + 标注时间框架）
  2. 金字塔加仓（pyramid.mjs）
  3. 月报（summary.mjs monthly + plan.mjs 校验目标）
  4. 委托边界（"看看 XX 是吸筹还是派发" → binance-wallet-tracker）
- 保持 `prompt + expected_output` 结构；新增条目补齐 `id` 连续编号。

### 3.5 镜像同步

- 统一源/镜像 SKILL.md 第 3 行差异（以源为准，同步到镜像）。
- 镜像分发专属文件（`.git/.gitignore/CLAUDE.md/LICENSE/README.md`）保留。
- 内容文件 `diff -rq` 零漂移。镜像的 git 历史不操作。

### 3.6 子 agent 复检编排（按序，Agent 工具，非 Workflow）

1. `plugin-dev:plugin-validator` — 插件结构/manifest 校验
2. `pr-review-toolkit:code-reviewer` — 评审 MCP server + scripts 的 diff（给文件清单）
3. `code-simplifier` — 简化改动（保留全部功能）
4. `plugin-dev:skill-reviewer` — SKILL.md / evals / references 质量

每步 findings 回来 → 修复 → 进入下一步。子 agent 只读 + 建议，写操作由主会话执行（尊重 CONFIRM/授权边界）。

### 3.8 README 依赖与环境要求说明（用户直接要求）

- 主仓库 `README.md` 新增「依赖与环境要求」小节：Node ≥26（`node:sqlite`）、curl（系统自带）、/binance skill、binance-cli npm v1.3.0（仅 Windows npm 版）、Binance API 密钥（profile `my-main`）、本地代理 `:7897`、`TRADE_HOME` 数据层，逐项给安装/配置命令。
- 明确说明 **向量检索零外部依赖**（非外部向量数据库，本地 BM25，无 API key / 无模型）。
- 补充可选依赖（orchestrator 增强 skill）说明。
- 检索方案维持 BM25 现状（用户已确认，不做语义向量/分块升级）。

### 3.7 收尾提交

1. 全部测试 + `node --check` 全绿
2. 同步镜像 + `diff -rq` 验证零漂移
3. agents repo 一次 git commit（含：agents 改动、MCP 修复、tests/、evals、SKILL.md/镜像、docs 更新）

## 4. 错误处理与测试策略

- 错误处理：沿用现有 try/catch 模式；测试失败即停（先修再继续）。
- 测试三层：
  1. `node:test` 单测（MCP 解析、schema、串行、scripts 纯逻辑）
  2. `evals.json` 行为用例（LLM 评估）
  3. 子 agent 复检（plugin-validator / code-reviewer / code-simplifier / skill-reviewer）

## 5. 验收标准

- [ ] `validate-agent.sh` 对两个 agent 无 error
- [ ] MCP server 单测全绿，覆盖 cli() 解析 / required / 串行
- [ ] scripts 单测全绿
- [ ] evals 10 条，结构完整
- [ ] 源/镜像 `diff -rq` 仅剩分发专属文件差异
- [ ] `node --check` 全部脚本通过
- [ ] 主 README 含完整「依赖与环境要求」小节（含向量检索零依赖说明）
- [ ] agents repo 一次干净提交
