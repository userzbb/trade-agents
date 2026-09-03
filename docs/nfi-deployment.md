# NFI（NostalgiaForInfinity）部署

> **NFI 是 trade-agents 的可选·推荐现成策略引擎** —— 高星（3.4k★）、日更维护、CI 回测门槛（winrate≥85%/maxDD≤15%）、支持币安 U 本位合约做空。独立于现有 Freqtrade/Hummingbot 引擎部署（官方 docker-compose 形态）。**零自研策略代码**：NFI 是现成策略，agent 只负责按用户意图装配 config 并执行。

### 官方文档链接

- **NFI 仓库**：https://github.com/iterativv/NostalgiaForInfinity
- **NFI 官方文档（部署/模式/回测）**：https://iterativv.github.io/NostalgiaForInfinity/ （含 `installation-and-setup.md`、`trading-modes/`、`backtesting.md`）
- **Freqtrade 官方文档**：https://www.freqtrade.io/ （config 语法/回测/REST）
- **Freqtrade REST API**：https://www.freqtrade.io/en/stable/rest-api/
- **币安 API 文档**：https://developers.binance.com/ （创建 API key / 权限说明）

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

## 密钥配置（Binance API key）

> Freqtrade 引擎连币安需要一对 **Binance API key**。支持两种密钥类型（二选一，按币安创建时的选择）：

| 类型 | 形式 | 本机存放约定 |
|---|---|---|
| **Ed25519（推荐，币安较新格式）** | API key（64 字符）+ **私钥 PEM**（`-----BEGIN PRIVATE KEY-----…`） | 本机 `D:\zizim\Documents\binance_key\1\`：`Public_key.txt` + `Private_key.txt` |
| **HMAC（传统格式）** | API key + **secret 字符串**（无需 PEM） | 本机 `D:\zizim\Documents\binance_key\hummingbot-hmac-key\` |

**配到 NFI 的两处**：
1. **`.env`**（trade 模式走 env）：`FREQTRADE__EXCHANGE__KEY` / `FREQTRADE__EXCHANGE__SECRET`。PEM 私钥多行须写成**单行 JSON 转义**（`\n`），否则 docker `.env` 会拆行报错。
2. **`user_data/config-private.json`**（config 合并模式，下载/回测更稳）：从 `configs/exampleconfig_secret.json` 拷来，填 `exchange.key`（API key）+ `exchange.secret`（PEM 原样，JSON 支持多行）。

**权限与安全**：
- **dry-run 阶段**：只需行情读取；key 可暂时复用（无真实下单风险）。
- **实盘前**：到币安为 NFI 建**独立子账户**，仅授予所需权限（读 + 合约交易，**不开提现**）——遵守 trade-agents 账户隔离铁律（NFI/Freqtrade/Hummingbot/binance-cli 各独立子账户）。
- 密钥**勿写入 md/代码/git**；本机已存的 key 文件是唯一真相源。
- 币安 API key 创建/权限管理官方说明：https://developers.binance.com/docs/binance-spot-api-docs/web-socket-streams 与账户页 API 管理（见上文官方链接）。

## 部署流程（官方）

> **部署流程默认 Windows 11 PowerShell**（`cd E:\...`、`Copy-Item`、`curl.exe`）。唯一例外是下方「回测」段要跑**官方 `.sh` 脚本**——那一段须 Git Bash（已标注），PowerShell 用户装 [Git for Windows](https://git-scm.com/) 后用 Git Bash 执行那一段即可。

```powershell
# ① clone（独立目录，勿与现有 freqtrade 混放）
cd E:\trade-bots
git clone https://github.com/iterativv/NostalgiaForInfinity.git nfi
cd nfi

# ② 配置 .env（从官方模板复制）
Copy-Item live-account-example.env .env
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
curl.exe -s http://127.0.0.1:8989/api/v1/ping   # {"status":"pong"}（端口看 .env 的 API_SERVER__LISTEN_PORT）
```

## 回测（现成数据 + 官方 tools）

> NFI 历史数据从官方数据仓库下载（非 freqtrade download-data）。只读，免 CONFIRM。
> ⚠️ 本段要跑官方 `.sh` 脚本 → **须 Git Bash**（PowerShell 里没有 `export`/`.sh`）；用 Git Bash 打开后执行：`cd /e/trade-bots/nfi`。

```bash
# Git Bash（MSYS）命令（本块要跑官方 .sh，须 Git Bash）
cd /e/trade-bots/nfi
# 下载回测所需历史数据（官方脚本，走 NostalgiaForInfinityData 仓库）
# 脚本路径 tools/download-necessary-exchange-market-data-for-backtests.sh
# （若数据量大/慢，可改为 freqtrade download-data 按需拉指定币+5m）

# 官方测试脚本约定（交易所模式二选一，只保留一行；本部署用 futures）
export TRADING_MODE=futures   # binance 或 futures —— 勿两行连写（后一行会覆盖前一行）
export TIMERANGE=20250101-20250601   # 回测区间
./tests/backtests/backtesting-analysis-hunting.sh   # 官方回测+分析脚本
```

## 实测验证记录（2026-09-02）

**部署链路已验证**：clone → 官方镜像构建 → config 组装（recommended → futures+exampleconfig+pairlist+config-private）→ 多周期数据下载（5m/15m/1h/4h/1d，BTC）→ X7 策略加载 + backtesting 跑通无错。`.env` 状态：`nfi-dryrun` / DRY_RUN=true / key 已配 / API 8989。

**关键 config 事实（实测发现，官方文档不直说）**：
- X7 需要**多周期数据**：主 5m + informative `15m/1h/4h/1d` + BTC 4h（`info_timeframes = ["15m","1h","4h","1d"]`）。只下 5m 会报 `KeyError: 'RSI_3_15m'`。
- 回测须带完整 config 片段串（`trading_mode-futures.json` + `exampleconfig.json` + pairlist + `--exchange binanceusdm` 从 config 提供，backtesting 子命令不支持 `--exchange`）。`exampleconfig.json` 的 pricing 用 `price_side:"other"` 对合约报 "Ticker pricing not available" → 需覆盖为 `same`。
- `download-data` 读 config.json 时 `../configs` 相对路径需挂载 `./configs:/freqtrade/configs`；纯参数模式 pair 需 futures 格式。

**单币回测 0 单（如实记录，非故障）**：BTC 单币 2025 Q1 回测 0 笔交易。原因：X7 是**全市场选币**策略（`top_coins_mode_coins` 强势币列表 + 40-80 pairs 设计），单币局部数据不是其设计用例。**不要**为验证出单而下载 GB 级全 pairs 数据——官方 CI 已证明 X7 可出单（winrate≥85%/maxDD≤15% 门槛）。X7 作为 trade-agents 的**可选规则池/交叉验证源**，启用时机由 LLM 研判决定。

**注意**：密钥当前为临时复用主账号 key（账户隔离铁律的例外，dry-run 无资金风险）；上实盘前须建**独立子账户只读 key** 替换（见下节）。

## CONFIRM 边界

- **回测 / 查询 / 只读**：免 CONFIRM（分析用）。
- **启动 / 切换策略 / 上实盘**：策略级操作，需 CONFIRM（完整计划表 + 模式 A/B）。

## 与 trade-agents 的接口

- agent（binance-orchestrator / trade-assistant）分析币种或趋势方向时，可经 `FREQTRADE__API_SERVER` REST 读 NFI 状态 / 跑回测交叉验证，中文汇报。
- 独立部署 → 不占用现有 Freqtrade 引擎（8080），两者并存。
- 参考：`references/12-nfi-bridge.md`（策略用法与判定）、`references/08-freqtrade-bridge.md`（Freqtrade REST 通用约定）。
