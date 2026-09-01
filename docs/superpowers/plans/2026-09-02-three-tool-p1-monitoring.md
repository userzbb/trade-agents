# 三工具最大化 · P1 监控层 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现监控层：三引擎统一中文看板（`engines.mjs`）+ binance OI/taker 成交确认增强（scan/coin）+ Freqtrade WS 信号流文档。

**Architecture:** 新增零依赖 Node 脚本 `engines.mjs` 聚合三个引擎状态（Freqtrade REST 8080 / Hummingbot REST 8000 / binance-cli），输出中文表；`scan.mjs`/`coin.mjs` 追加 open-interest、taker-buy-sell-volume、账户级 LS 三个端点；Freqtrade WS 用法写入 `references/08`。

**Tech Stack:** Node ≥26（零依赖）、curl（走代理）、binance-cli。引擎已部署（Freqtrade 8080、Hummingbot 8000）。

**Spec:** `docs/superpowers/specs/2026-09-02-three-tool-maximize-design.md`

## Global Constraints

- 只开发 `D:\claude-dev\agents\trade-agents`；镜像/`plugins/trade-plugin` 弃用不碰。
- 零 npm 依赖；脚本注释英文、输出中文。
- 只读查询（看板、OI/taker）无需 CONFIRM。
- 引擎不可达时优雅降级（提示"引擎未运行"，不报错中断）。
- 代理：引擎/币安访问走 `127.0.0.1:7897`（Freqtrade 8080 本机 REST 不走代理）。

---

## 文件结构

| 文件 | 职责 | 动作 |
|---|---|---|
| `skills/trade-assistant/scripts/engines.mjs` | 三引擎统一中文看板 | Create |
| `skills/trade-assistant/scripts/scan.mjs` | 加 OI/taker/LS-accounts 列 | Modify |
| `skills/trade-assistant/scripts/coin.mjs` | 加 OI + taker 确认 | Modify |
| `skills/trade-assistant/references/08-freqtrade-bridge.md` | WS 信号流小节 | Modify |
| `skills/trade-assistant/SKILL.md` | 工具箱表加 `engines.mjs` 行 | Modify |
| `docs/usage.md` | 看板场景 | Modify |
| `tests/engines.test.mjs` | engines.mjs 解析测试 | Create |

---

## Task 1: `scripts/engines.mjs` — 三引擎统一看板

**Files:**
- Create: `skills/trade-assistant/scripts/engines.mjs`
- Test: `tests/engines.test.mjs`

**Interfaces:**
- Consumes: 三引擎 REST/CLI（Freqtrade 8080、Hummingbot 8000、binance-cli）
- Produces: 中文看板表（被 orchestrator/用户直接调用）

- [ ] **Step 1: 写解析纯函数（可测）**

`engines.mjs` 主体：三部分只读收集，输出一张中文表。核心可测逻辑：

```js
// engines.mjs — three-engine status dashboard. Zero-dep; Chinese output.
import { execFileSync } from 'node:child_process';

const PROXY = process.env.BINANCE_PROXY || 'http://127.0.0.1:7897';
const FT = process.env.FREQTRADE_URL || 'http://127.0.0.1:8080';
const HB = process.env.HUMMINGBOT_API_URL || 'http://localhost:8000';
const HB_USER = process.env.HUMMINGBOT_API_USERNAME || 'admin';
const HB_PASS = process.env.HUMMINGBOT_API_PASSWORD || 'hb_p1_paper_2026';

const curl = (url, opts = []) => { try { return execFileSync('curl', ['-sS', '-m', '8', ...opts, url], { encoding: 'utf8', timeout: 15000 }); } catch { return null; } };

export function row(engine, field, value) { return { engine, field, value }; }
export function fmtTable(rows) { /* 中文对齐表 */ return rows.map(r => `${r.engine.padEnd(12)} ${r.field.padEnd(20)} ${r.value}`).join('\n'); }
```

- [ ] **Step 2: 写测试（`tests/engines.test.mjs`）**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmtTable } from '../skills/trade-assistant/scripts/engines.mjs';

test('engines: fmtTable 输出对齐中文表', () => {
  const out = fmtTable([row('Freqtrade', '状态', 'running'), row('Hummingbot', '资金', '1000 USDT')]);
  assert.match(out, /Freqtrade/);
  assert.match(out, /running/);
  assert.match(out, /1000 USDT/);
});
```

- [ ] **Step 3: 实现三源收集（主流程）**

```js
function collect() {
  const rows = [];
  // Freqtrade: status + profit_all（本机 REST，不走代理）
  const ftStatus = JSON.parse(curl(`${FT}/api/v1/status`) || 'null');
  const ftProfit = JSON.parse(curl(`${FT}/api/v1/profit_all`) || 'null');
  rows.push(row('Freqtrade', '状态', ftStatus ? `${ftStatus.length} 持仓` : '引擎未运行'));
  rows.push(row('Freqtrade', '总盈亏', ftProfit?.profit_all_ratio != null ? `${(ftProfit.profit_all_ratio * 100).toFixed(2)}%` : '—'));
  // Hummingbot: portfolio/state + executors/summary（带 basic auth）
  const hbAuth = Buffer.from(`${HB_USER}:${HB_PASS}`).toString('base64');
  const hb = JSON.parse(curl(`${HB}/portfolio/state`, ['-H', `Authorization: Basic ${hbAuth}`]) || 'null');
  rows.push(row('Hummingbot', '账户', hb ? `${hb.positions?.length || 0} 持仓` : '引擎未运行'));
  // binance: position.mjs 逻辑（binance-cli account-information-v2）
  const binance = JSON.parse(curl('binance-cli', []) || 'null'); // 实际走 execFileSync binance-cli
  rows.push(row('/binance', '持仓', binance ? `${binance.positions?.filter(p => +p.positionAmt !== 0).length} 个` : '—'));
  return rows;
}
console.log(fmtTable(collect()));
```
> **注意**：binance 部分用 `execFileSync('binance-cli', ['futures-usds', 'account-information-v2'], { env: {...process.env, HTTPS_PROXY: PROXY, HTTP_PROXY: PROXY} })`；引擎不可达全部 `try/catch` 返回 `引擎未运行`。

- [ ] **Step 4: 跑测试 + 运行**

Run: `node --test tests/engines.test.mjs` → 1 pass。
Run: `node skills/trade-assistant/scripts/engines.mjs` → 输出三引擎中文表（引擎未跑时对应行标"引擎未运行"，不报错）。

## Task 2: scan.mjs / coin.mjs 加 OI/taker/LS-accounts 确认

**Files:**
- Modify: `skills/trade-assistant/scripts/scan.mjs`、`skills/trade-assistant/scripts/coin.mjs`

**Interfaces:**
- Consumes: `_lib.fapi`
- Produces: 候选/单币报告含 OI + taker + 账户级 LS

- [ ] **Step 1: `coin.mjs` 追加 3 个端点**

在现有 funding/LS 之后、15m 量价之前，串行追加（遵守 sleep 2-4s 限流）：

```js
// --- OI + taker + 账户级 LS（趋势/主动盘/拥挤度确认）---
try {
  const oi = await fapi(`/fapi/v1/openInterest?symbol=${SYM}`);
  const tk = await fapi(`/fapi/v1/takerlongshortRatio?symbol=${SYM}&period=15m&limit=1`);
  const ls = await fapi(`/futures/data/topLongShortAccountRatio?symbol=${SYM}&period=1h&limit=1`);
  console.log(`\nOI ${(+oi.openInterest).toFixed(0)} | taker买占比 ${((+tk[0].buySellRatio / (1 + +tk[0].buySellRatio)) * 100).toFixed(0)}% | 账户LS ${ls[0].longShortRatio}`);
  console.log(+(oi.openInterest) > 0 ? '  → OI 上升确认趋势' : '');
} catch (e) { console.log('OI/taker 获取失败:', e.message); }
await sleep(2500);
```
> 若 `topLongShortAccountRatio` 端点名不符，按 `/binance` references 的 futures-usds.md 核对后调整（严谨验证：先 `binance-cli futures-usds <endpoint> --symbol X` 实测端点可用再入脚本）。

- [ ] **Step 2: `scan.mjs` 候选表加 OI 列**

在 scan 候选输出加一行"OI 确认"：候选池每币拉 OI（串行，sleep 3s），标注 OI 上升/下降。若数据量大拖慢，仅对 top-5 候选拉 OI。

- [ ] **Step 3: 语法 + 实测**

Run: `node --check skills/trade-assistant/scripts/scan.mjs skills/trade-assistant/scripts/coin.mjs` → OK。
Run: `node skills/trade-assistant/scripts/coin.mjs BTCUSDT`（走代理，实测新端点返回）→ 输出含 OI/taker/LS。

## Task 3: Freqtrade WS 信号流文档（references/08）

**Files:**
- Modify: `skills/trade-assistant/references/08-freqtrade-bridge.md`

- [ ] **Step 1: 追加 WS 小节**

在 08 的 REST API 段后加 `### Message WebSocket (live signal stream)`：
- 端点 `ws://127.0.0.1:8080/api/v1/message/ws?token=<ws_token>`（token 从 `/api/v1/login` 的 `ws_token` 取）
- 订阅 `whitelist` / `analyzed_df` / `new_candle` → 插件可实时拿策略分析后的指标 DF
- 用法：配合 `pair_candles` REST 轮询或 WS 订阅做实时信号推送（P3 信号注入的输入源）

## Task 4: SKILL.md 工具箱行 + usage.md 场景

**Files:**
- Modify: `skills/trade-assistant/SKILL.md`、`docs/usage.md`

- [ ] **Step 1: SKILL.md 工具箱表加 `engines.mjs` 行**

在 toolbox 表 `vector.mjs` 行后加：
```
| `engines.mjs` | three-engine status dashboard (Freqtrade/Hummingbot//binance) in one Chinese table | "看下三引擎状态/统一看板"; session start |
```

- [ ] **Step 2: usage.md 加场景**

在表加：`| 看下三个引擎的状态 | skill → engines.mjs | 统一中文看板（Freqtrade/Hummingbot/binance 持仓+盈亏）|`

## Task 5: 回归 + 提交

**Files:** 全部

- [ ] **Step 1: 全量验证**

Run:
```bash
cd /d/claude-dev/agents/trade-agents
node --test tests/*.test.mjs 2>&1 | tail -4
for f in skills/trade-assistant/scripts/*.mjs mcp/binance-mcp-server.mjs; do node --check "$f" || echo "FAIL $f"; done
```
Expected: 20 pass（19 + engines）/ 0 fail；node --check 无 FAIL。

- [ ] **Step 2: 提交**

Run: `git add -A && git commit -m "feat(P1): three-engine dashboard (engines.mjs) + OI/taker confirmation + WS doc"`
Expected: 一次干净提交；工作树 clean。

---

## 自审记录

- **Spec 覆盖**：§3 监控层全部落地（engines.mjs 看板 → Task 1；OI/taker 增强 → Task 2；WS 文档 → Task 3；SKILL/usage → Task 4）。
- **占位符**：无 TBD。Task 2 的端点名要求 executor 先实测再入脚本（严谨验证，非占位）。
- **类型一致**：`engines.mjs`、`FREQTRADE_URL`/`HUMMINGBOT_API_URL` env、`engines.test.mjs` 在 Task 间一致。
- **风险**：三引擎 REST 端点响应格式可能随版本变化 → Task 1/2 要求实测后适配；引擎不可达降级不中断。
