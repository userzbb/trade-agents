# Skill 层指南（trade-assistant）

> 分析大脑。本文件详细说明 skill 的双支柱、文档生命周期、策略知识库、脚本工具箱、CONFIRM 协议与硬规则。

## 双支柱定位

| 支柱 | 内容 | 触发方式 |
|---|---|---|
| **A. 文档生成** | 计划 / 复盘 / 周报 / 月报 四类 md 文档 | 用户触发（"复盘/周报/月报"） |
| **B. binance 编排** | 按需求决定调用哪个 binance 生态 skill/CLI 并汇总 | 任何涉及币安数据/信号/执行的请求 |

分析脚本（scan/coin/ta/prob/solve/pyramid）为**降级工具箱** —— 在主工作流内按需调用，不是 skill 的独立入口。

## 文档生命周期（什么生成文件、什么只在对话）

| 阶段 | 形态 | 命名/位置 | 归档 |
|---|---|---|---|
| 交易计划 | 对话表格；用户要求留档才存 | `D:\trade\plans\计划_YYYYMMDD_币种.md` | — |
| 执行中 | 不生成文件；收盘后 `sync.mjs` 入 SQLite | `D:\trade\data\trade.db` | — |
| 全部平仓后 | **复盘 md（必须）**：按 `references/07` 模板 | `D:\trade\retrospectives\复盘_起始-结束_币种.md` | git commit |
| 周度 | **每周日**或用户说"周报" | `D:\trade\retrospectives\周报_YYYYMMDD_YYYYMMDD.md` | git commit |
| 月度 | **每月 1 号**或用户说"月报" | `D:\trade\retrospectives\月报_YYYY-MM.md` | git commit |
| 策略变更 | 直接编辑 references/ 对应文档 | references/ | git commit |

- **复盘触发**：用户说"复盘/平仓了/这一单结束了"，或检测到持仓清零且有已实现盈亏未生成复盘时主动提示。
- **复盘必备要素**：执行 vs 计划偏离分析、盈亏归因（信号质量/执行纪律/运气三部分占比）、信号类型（S1-S6）+ 币种分级（T1-T3）标注、至少一条可执行改进项。
- **周报/月报定位**：决策文档，产出"决策输入"区块（手续费占比、T3 币种盈亏、盈利天占比、回撤），喂给下期 `plan.mjs` 目标校验。月报必须回答三个问题：①哪个信号类型贡献了主要利润/亏损？②纪律执行率？③下月仓位阶梯上移还是下调？

## 策略知识库（references/，唯一真相源）

| 文件 | 内容 | 何时读 |
|---|---|---|
| `00-core-playbook.md` | 铁律、双引擎资金结构、三种进场模板、目标体系、博弈卡片 | 每次会话开始；规则冲突以它为准 |
| `01-selection-and-signals.md` | 每日选币池标准、S1-S6 信号定义、反信号、大盘基调 | 早盘重排、判断信号类型 |
| `02-long-short-playbooks.md` | 做多/做空全套参数（不对称）、持仓管理、空单三死 | 任何多/空执行前 |
| `03-risk-and-position.md` | solve.mjs 原则、T1/T2/T3 折扣、凯利、仓位阶梯、回撤熔断 | 计算仓位、判断账户状态 |
| `04-market-maker-playbook.md` | BTR 六幕剧本、庄家币上经济学适用性、博弈实战卡 | 处理新币/meme/高振幅币；"庄家/插针" |
| `05-technical-analysis.md` | 指标体系、综合评分、三道确认位置、T3 失效边界、周期选择 | 解读 ta.mjs；技术面确认时机 |
| `06-pyramid-and-psychology.md` | 金字塔三批结构、加仓否决条件、三层共振、博弈心理 | 建仓结构、加仓决策、心理自检 |
| `07-trade-log-and-review-template.md` | 交易日志模板 + 复盘报告模板（**中文输出正文**） | 记录每笔；全部平仓后生成复盘 |

## 脚本工具箱（scripts/ 零依赖 Node 脚本）

| 脚本 | 用途 | 用法 | 何时用 |
|---|---|---|---|
| `scan.mjs` | 全市场扫描：基调、涨跌幅榜、成交额榜、上涨占比 | `node scan.mjs` | 每日早盘重排；"盘面/行情" |
| `coin.mjs <SYM>` | 单币体检：现价/24h/费率/大户多空比/15m量价/盘口墙/区间 | `node coin.mjs ARBUSDT` | 进场前检查清单；问某个币 |
| `ta.mjs <SYM> [--interval 1h]` | 技术分析：RSI/MACD/EMA/布林/ATR/背离/形态 + 综合评分 | `node ta.mjs ARBUSDT --interval 1h` | 进场时机确认；"技术面/指标" |
| `prob.mjs <SYM> <entry> <qty> <targetU\|target=价格> [--stop 价] [--liq 价]` | 蒙特卡洛概率：14h/24h/48h 触达目标/止损/强平概率 | `node prob.mjs ARBUSDT 0.113 1000 target=0.118 --stop 0.111` | "胜率/概率/多久到 X" |
| `solve.mjs <SYM> [--entry] [--qty] [--equity] [--posfrac]` | 止损/止盈求解器：网格扫描 + 首触蒙特卡洛，按期望值排序；自动分级折扣 + 插针缓冲；超 6% 红线给缩仓建议 | `node solve.mjs ARBUSDT --entry 0.113 --qty 1000 --equity 600` | **每次制定交易计划必跑** |
| `pyramid.mjs <SYM> <LONG\|SHORT> --equity <U>` | 金字塔建仓引擎：试探2%→加仓6%→趋势12%，每批触发条件 + 综合止损 + 红线检查 | `node pyramid.mjs ARBUSDT LONG --equity 600` | 新仓建仓；"怎么建仓/分批" |
| `position.mjs` | 持仓 + 挂单 + 盈亏速览（含强平距离） | `node position.mjs` | "现在呢/看持仓"；会话开始 |
| `sync.mjs --days N` | 从交易所拉资金流水入 SQLite（真源） | `node sync.mjs --days 7` | **每天收盘必跑**；报告/复盘前 |
| `report.mjs [--days 30]` | 盈利分析：分币种/分级/大额亏损/净值回撤 | `node report.mjs --days 30` | "这周/这月表现如何" |
| `plan.mjs --target X --days N --equity Y` | 收益目标数学校验 + 三套方案（A稳健/B延续/C激进） | `node plan.mjs --target 600 --days 30 --equity 336` | "目标/多久能赚 X"；每月定计划 |
| `summary.mjs weekly\|monthly` | 周报/月报生成器（自动 md + 归档） | `node summary.mjs weekly` | 每周日/每月1号；"周报/月报" |
| `vector.mjs index\|query` | BM25 检索相似复盘/策略知识 | `node vector.mjs query "复盘 ARB" --filter review` | 复盘时找相似案例（详见 docs/vector-search.md） |
| `db.mjs` | SQLite 封装（node:sqlite） | 被其他脚本 import | — |
| `_lib.mjs` | 共享：代理请求/重试/限流 + 动态分级 classify() | 被其他脚本 import | — |
| `engines.mjs` | 三引擎统一看板（Freqtrade/Hummingbot/binance 持仓+盈亏） | `node engines.mjs` | "看三引擎状态/统一看板"；会话开始 |
| `envcheck.mjs` | 环境自检：当前进程 env vs Windows 用户环境(注册表) + 依赖就绪；缺 `HUMMINGBOT_MCP_DIR` 或 MSYS `/x/` 路径 → 给 setx 方案 | `node envcheck.mjs`（默认 env+依赖，本地）；`node envcheck.mjs --net`（追加网络联通：代理→fapi + Freqtrade/Hummingbot/NFI REST） | 每次会话首个交易请求自动跑一次（本地）；"网络联通/为什么连不上/交易前" 或代理/引擎问题 → `--net`；"环境自检/修环境变量" |
| `profile.mjs view\|set\|clear` | 个人风险画像读写（strategy-profile.json） | `node profile.mjs set --equity 600` | 首次采参/风险风格变更 |

所有脚本自动处理代理/重试/限流。在 `scripts/` 目录运行。

## CONFIRM 审核协议（最高优先级）

任何下单/平仓/撤单/改杠杆/划转操作，必须先输出**完整交易计划**交用户审核。计划必须一次成型、整体提交，禁止分步试探。

**计划必含**：
1. 所有订单（开仓 + 止损 + 止盈）及完整参数（symbol/side/type/价格/数量/reduce-only）
2. 执行顺序、保证金占用、最大亏损金额、预期收益
3. **风险说明**（强制）：最大亏损、强平距离、插针/滑点风险、该信号历史失败模式
4. **胜率测算**（强制）：`prob.mjs` 蒙特卡洛模拟 + 经济学逻辑（供需/资金流/费率激励）与博弈论定性判断（S1-S6、庄家剧本阶段、多空拥挤度）交叉验证；结论冲突时如实说明，取保守区间
5. **两种执行方式**：
   - **模式 A（手动）**：只输出计划，用户自己在 App/网页下单，skill 不执行任何交易操作
   - **模式 B（代执行）**：用户审阅后输入 `CONFIRM`，skill 按已批准顺序执行，不新增任何未审批订单

查询类操作（余额/持仓/行情/概率）不需要确认。

## 硬规则（来自 references/00，执行时优先级最高）

1. 单笔亏损 ≤ 总资金 6%，止损单与开仓**同时**挂（STOP_MARKET reduce-only）
2. 单日亏损 ≥ 总资金 8% → 强制收工
3. 凌晨 1:00–7:00 不开新仓（可查询、可分析）
4. 同一时间只持单侧仓位；浮亏加仓摊平是禁区
5. 账户状态决定仓位（见 `03-risk-and-position.md` 阶梯）
6. 用户决定持有/扛单时：尊重决定，停止劝告，改为监控 + 关键位提醒（跌破熔断位时主动提示）

## 环境事实（每次会话都生效，勿重新发现）

1. **网络**：直连币安 API 被墙，必须走本地代理 `http://127.0.0.1:7897`（curl 用 `-x`，binance-cli 用 `HTTPS_PROXY/HTTP_PROXY` 环境变量）
2. **域名**：现货 `api.binance.com`，合约 `fapi.binance.com`（fapi1/fapi2 会 302 重定向，不要用）
3. **限流**：快速连续请求会触发 IP ban（"Way too many requests"）；请求间 `sleep 2-4`；被 ban 等 30-60 秒；能一个 curl 拉全量就不要循环
4. **时钟漂移**：本机时钟比服务器慢约 2 秒，签名请求间歇报 "Timestamp outside recvWindow"；失败后 sleep 5-8 秒重试（2-4 次内成功）；提醒用户同步 Windows 时间
5. **binance-cli**：Windows 只有 npm 版 1.3.0（官方安装脚本不支持 Windows）；profile 名 `my-main`（prod）；"Request failed after 3 retries" = 代理抖动，重试
6. **临时文件**：分析 JSON 写 `%USERPROFILE%` 下（C:\tmp 在 node 里不可写），用完删除

## 与 /binance 生态的依赖关系（强依赖）

- 脚本底层执行 binance-cli，鉴权规则以 `/binance` skill 的 `auth.md` 为准。
- 工具箱仅覆盖合约核心端点；**其余币安能力**（钱包划转/现货/保证金/理财/质押/子账户/官方信号等）必须经 `/binance` skill 查端点用法。
- 能力 → 提供方决策表：

| 需求 | 提供方 |
|---|---|
| 原始行情/费率/多空比/持仓量/盘口 | `/binance`（binance-cli） |
| 账户/持仓/流水 | `/binance`（binance-cli） |
| 下单/平仓/撤单/改杠杆/划转 | **走本 skill CONFIRM 协议**（不直接执行） |
| 信息面（社交热度/情绪/聪明钱流入/交易员盈亏） | `crypto-market-rank` |
| 信号/回测/可买性 | `binance-trading-signal` |
| 博弈面行为（吸筹/派发/round-trip） | `binance-wallet-tracker` |
| 链上 token/地址/审计 | `query-token-info` / `query-address-info` / `query-token-audit` |
| 技术指标（RSI/MACD/EMA/布林/ATR/背离） | 本 skill 工具箱 `ta.mjs` |
| 全市场扫描/单币体检/概率/求解/金字塔 | 本 skill 工具箱 |

- 若检测到 `/binance` 未安装：提示用户 `npx skills add binance/binance-skills-hub`，并说明缺失影响。

## 核心工作流

### 文档生成（Pillar A，主职）
1. **复盘**：拉该仓位订单/流水 → 读 `references/07` → `vector.mjs` 检索相似复盘 → 生成中文复盘 md → 归档 git。可委派 `retrospective-writer` agent。
2. **周报/月报**：`summary.mjs weekly|monthly` → 审阅 → 月报用 `plan.mjs` 校验目标 → 归档。
3. **交易计划**：对话表格；用户要求才存 `D:\trade\plans\`。

### 分析（用工具箱）
1. **每日早盘重排**：`scan.mjs` → 按 `references/01` 筛池 → 逐候选 `coin.mjs`（限流 sleep 3）→ 输出基调 + 做多 ≤3 + 做空 ≤3 + 信号类型标注。
2. **交易执行**：读 `references/02` 手册 → `coin.mjs` 资金面（第一道）→ `ta.mjs` 技术面（第二道）→ 博弈心理检查（`references/06`）→ `pyramid.mjs` 分批结构 → `solve.mjs` 止损止盈 → 完整计划表 + 模式A/B → 等 `CONFIRM` → 执行 → 更新日志。
3. **状态检查**：`position.mjs` → 逐持仓 `coin.mjs` 结构 → 持仓表 + 关键位距离 + 结构判断；触发 8% 熔断时主动提示。
4. **概率咨询**：`prob.mjs`（用真实持仓参数）→ 注明"模型对主流有效、庄家币失效" → 结合 `references/04` 剧本阶段定性判断。

## 输出语言

用户使用中文交流，所有用户可见输出用中文。表格优先于长段落。数字必须来自 API 实测，禁止凭记忆报价。
