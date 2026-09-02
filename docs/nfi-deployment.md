# NFI（NostalgiaForInfinity）部署

> **NFI 是 trade-agents 的可选·推荐现成策略引擎** —— 高星（3.4k★）、日更维护、CI 回测门槛（winrate≥85%/maxDD≤15%）、支持币安 U 本位合约做空。独立于现有 Freqtrade/Hummingbot 引擎部署（官方 docker-compose 形态）。**零自研策略代码**：NFI 是现成策略，agent 只负责按用户意图装配 config 并执行。

## 角色

- **策略来源**：trade-assistant 分析后如需"现成趋势策略回测/参考"（选币、趋势判断交叉验证、全市场扫描），agent 用 NFI 的官方 docker-compose 跑 backtesting / dry-run。
- **不是市场情报工具**：funding/LS/盘口分析仍走 binance 生态与 trade-assistant 工具箱。
- **账户隔离**：NFI 用独立币安子账户 key（与 Freqtrade/Hummingbot/binance-cli 不共享）。

## 依赖要求

| 项 | 要求 |
|---|---|
| 官方仓库 | `iterativv/NostalgiaForInfinity`（GitHub） |
| 运行形态 | **独立 clone + 官方 docker-compose**（自带 `docker/Dockerfile.custom` 构建 TA-Lib 等） |
| 镜像 | `freqtradeorg/freqtrade:stable` |
| 配置 | 环境变量 `.env`（`FREQTRADE__*` 前缀映射 freqtrade config） |
| 策略 | 默认 `NostalgiaForInfinityX7`（主策略文件，多模式：Normal/Pump/Quick/Rebuy/Rapid/Grind/Scalp，长空皆可） |
| Timeframe | **固定 5m**（勿覆盖） |
| API | 默认端口 **8989**（现有 Freqtrade 引擎是 8080，互不冲突） |
| 代理 | 容器内走 `host.docker.internal:7897`（与现有引擎同） |
| 建议 | 6–12 持仓、40–80 pairs、Volume pairlist；黑名单 `*BULL/*BEAR/*UP/*DOWN` 杠杆代币 |

## 部署流程（官方）

```bash
# ① clone（独立目录，勿与现有 freqtrade 混放）
cd /e/trade-bots
git clone https://github.com/iterativv/NostalgiaForInfinity.git nfi
cd nfi

# ② 配置 .env（从官方模板复制）
cp live-account-example.env .env
# 编辑 .env 关键项：
#   FREQTRADE__EXCHANGE__KEY / SECRET    → 独立币安子账户 key（勿共享）
#   FREQTRADE__EXCHANGE__NAME=binance
#   FREQTRADE__TRADING_MODE=futures / FREQTRADE__MARGIN_MODE=isolated
#   FREQTRADE__DRY_RUN=true              → 先 dry-run
#   FREQTRADE__API_SERVER__USERNAME/PASSWORD/JWT_SECRET_KEY  → 设强凭据
#   代理：在 compose 或容器 env 设 HTTPS_PROXY=http://host.docker.internal:7897

# ③ 构建 + 启动（官方 compose 默认 dry-run）
docker compose up -d --build
docker compose logs -f freqtrade   # 看启动日志

# ④ 验证
curl -s http://127.0.0.1:8989/api/v1/ping   # {"status":"pong"}（端口看 .env 的 API_SERVER__LISTEN_PORT）
```

## 回测（现成数据 + 官方 tools）

> NFI 历史数据从官方数据仓库下载（非 freqtrade download-data）。只读，免 CONFIRM。

```bash
cd /e/trade-bots/nfi
# 下载回测所需历史数据（官方脚本，走 NostalgiaForInfinityData 仓库）
# 脚本路径 tools/download-necessary-exchange-market-data-for-backtests.sh
# （若数据量大/慢，可改为 freqtrade download-data 按需拉指定币+5m）

# 官方测试脚本约定：
export TRADING_MODE=binance   # 交易所
export TRADING_MODE=futures   # spot/futures
export TIMERANGE=20250101-20250601   # 回测区间
./tests/backtests/backtesting-analysis-hunting.sh   # 官方回测+分析脚本
```

## CONFIRM 边界

- **回测 / 查询 / 只读**：免 CONFIRM（分析用）。
- **启动 / 切换策略 / 上实盘**：策略级操作，需 CONFIRM（完整计划表 + 模式 A/B）。

## 与 trade-agents 的接口

- agent（binance-orchestrator / trade-assistant）分析币种或趋势方向时，可经 `FREQTRADE__API_SERVER` REST 读 NFI 状态 / 跑回测交叉验证，中文汇报。
- 独立部署 → 不占用现有 Freqtrade 引擎（8080），两者并存。
- 参考：`references/12-nfi-bridge.md`（策略用法与判定）、`references/08-freqtrade-bridge.md`（Freqtrade REST 通用约定）。
