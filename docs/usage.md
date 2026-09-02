# 使用场景速查

> 用户说什么 → 触发什么 → 得到什么。所有输出均为中文。

## 常见场景

| 你说 | 触发 | 得到 |
|---|---|---|
| 现在呢 / 看持仓 | skill → `position.mjs` | 持仓表（盈亏/强平距离）+ 挂单状态 |
| 看看今天盘面有什么机会 | skill → `scan.mjs` | 大盘基调 + 多空候选池 + S1-S6 信号标注 |
| 查一下 X 的行情/资金费率/多空比 | binance-orchestrator → binance-cli | 中文表格（来源标注） |
| X 有没有信号 / 能不能买 | binance-orchestrator → trading-signal | 信号 feed / 可买性判断 |
| 最近什么火 / 聪明钱在买什么 | binance-orchestrator → crypto-market-rank | 热度/聪明钱流入榜 |
| 看看 X 是吸筹还是派发 | binance-orchestrator → wallet-tracker | 行为模式判断 |
| X 的技术面 / 指标 | binance-orchestrator → `ta.mjs` | 技术指标 + 综合评分 |
| 我想开多/空 X，定止损止盈 | skill → `coin.mjs` + `ta.mjs` + `solve.mjs` + `pyramid.mjs` | 完整计划表 + 模式A/B |
| 帮我挂止损/止盈/改单 | skill（CONFIRM） | 改单计划 + 模式A/B |
| 复盘 / 平仓了 / 这一单结束了 | retrospective-writer | 中文复盘 md → 归档 git |
| 周报 / 这周怎么样 | retrospective-writer → `summary.mjs weekly` | 中文周报 md → 归档 |
| 月报 / 本月总结 | retrospective-writer → `summary.mjs monthly` + `plan.mjs` | 中文月报 md + 目标校验 |
| 找之前类似的复盘/行情 | retrospective-writer → `vector.mjs` | 相似复盘列表（中文） |
| 目标 / 多久能赚 X | skill → `plan.mjs` | 三套方案（A稳健/B延续/C激进） |
| 胜率多少 / 概率 | skill → `prob.mjs` | 蒙特卡洛概率表 |
| 回测这个策略 / 验证参数 | orchestrator → Freqtrade REST | 回测结果（胜率/收益/回撤）中文汇报；只读免 CONFIRM |
| 部署/启停网格或做市 bot | orchestrator → `hummingbot-mcp` | bot 生命周期 + 中文状态汇报；部署需 CONFIRM |
| 查 Hummingbot bot 状态/盈亏 | orchestrator → `hummingbot-mcp` | bot 状态/模拟 PnL 中文表格 |
| 看下三个引擎的状态 | skill → `engines.mjs` | 统一中文看板（Freqtrade/Hummingbot/binance 持仓+盈亏） |
| 环境自检 / 修环境变量 / 为什么 hummingbot 连不上 | skill → `envcheck.mjs`（默认 env+依赖，本地；会话首个交易请求自动跑一次） | 环境变量/依赖状态表（当前进程 vs Windows 用户环境）；缺的必需变量 → setx 方案待你 CONFIRM |
| 网络联通 / 为什么连不上 / 交易前 / 代理或引擎问题 | skill → `envcheck.mjs --net` | 本地 env+依赖 + 网络联通结果（代理→fapi + Freqtrade/Hummingbot/NFI REST）；fapi 经代理不通 → 退出码 2，先查代理 7897 是否在跑 |
| 对候选币深查 OI/主动盘 | skill → `coin.mjs <SYM>` | 持仓量 OI + taker 买占比 + 账户LS 确认趋势 |

## 常用命令速查（scripts/ 目录下）

```bash
node scan.mjs                          # 全市场扫描
node coin.mjs ARBUSDT                  # 单币体检
node ta.mjs ARBUSDT --interval 1h      # 技术分析
node prob.mjs ARBUSDT 0.113 1000 target=0.118 --stop 0.111   # 概率
node solve.mjs ARBUSDT --entry 0.113 --qty 1000 --equity 600 # 止损止盈求解（每单必跑；equity 默认取策略档案）
node pyramid.mjs ARBUSDT LONG --equity 600                   # 金字塔建仓（equity/杠杆/红线默认取策略档案）
node profile.mjs set --equity 600 --per-trade-cap-pct 0.05   # 设置个人风险画像（首次采参/变更）
node envcheck.mjs                    # 环境自检（默认 env+依赖，本地：当前进程 vs Windows 用户环境；缺的必需变量给 setx 建议）
node envcheck.mjs --net              # 追加网络联通自检（代理→fapi + 三引擎 REST）
node position.mjs                      # 持仓速览
node sync.mjs --days 7                 # 流水入库（每天收盘）
node summary.mjs weekly                # 周报
node summary.mjs monthly               # 月报
node plan.mjs --target 600 --days 30 --equity 336            # 目标校验
node vector.mjs query "复盘 ARB" --filter review             # 相似复盘检索
```

## 前置条件

- `/binance` skill 已装：`npx skills add binance/binance-skills-hub`
- 代理在跑：`127.0.0.1:7897`（Clash 等）
- binance-cli profile：`my-main`（`binance-cli profile create` 配置）
- 数据层：`D:\trade`（`TRADE_HOME` 可覆盖）
- **Freqtrade**（可选）：Docker dry-run，REST `127.0.0.1:8080`（见 `references/08`）
- **Hummingbot**（可选）：Docker API `127.0.0.1:8000` + MCP（`HUMMINGBOT_MCP_DIR` 指向 `E:\trade-bots\hummingbot\mcp`，见 `references/09`）

## 重要提醒

- **所有下单类操作**都会先展示完整计划，需要你选**模式 A（手动）**或输入 **`CONFIRM`**（模式 B 代执行）。查询类无需确认。
- 凌晨 1:00–7:00 不开新仓。
- 技术面/概率结果是历史模拟参考，庄家币（T3）上模型失效。
