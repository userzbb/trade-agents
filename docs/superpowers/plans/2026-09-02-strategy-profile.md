# Strategy-Profile: 策略参数参考化 + 个人风险画像 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让交易策略的**核心风险参数**（权益/杠杆/仓位风格/风险容忍）从"写死规则"改为"参考默认 + `strategy-profile.json` 覆盖"——用户首次开项目时由 agent 对话采参存档，之后默认用档案，用户要改时 agent 给建议选项。**安全协议保持硬性，绝不因档案放宽。**

**Architecture:** 新增 `D:\trade\strategy-profile.json`（复用 `coin-classification.json` 先例），`_lib.mjs` 加 `readStrategyProfile()/strategyProfile()/writeStrategyProfile()/validateStrategyProfile()`。层优先级：**CLI 参数 > 档案 > 参考默认**——无档案时脚本行为与现在完全一致（336/0.25/20x/0.06），存量测试保持绿。`solve.mjs`/`pyramid.mjs` 的仓位计算默认值改读档案。新增 `scripts/profile.mjs view|set|clear` 作为唯一合规写入器（agent 调用）。

**Tech Stack:** Node 零依赖脚本；JSON 配置存数据层（`D:\trade\`）；markdown 文档。

**Spec:** 用户诉求（策略别写死、要对话制定）+ 本对话范围决策（核心画像字段 + agent 对话触发 + 安全硬）。

## Global Constraints

- 安全协议**硬性不可放宽**：CONFIRM 门、账户隔离、写拦截 hook、止损与开仓同时挂、禁 hedge/禁扛单、3 连损停 24h、01:00–07:00 不开仓、**8% 单日强制停（档案只能收紧 ≤0.08）**、25%/40% 回撤熔断。
- 档案只承载**核心风险画像**字段：equity/leverage/positionStyle(main/lottery/mainNormal/lotteryPerTrade)/risk(perTradeCap/dailyCB)。**不承载** tier 阈值/选币阈值/wick 系数/金字塔批次——那些留 references 当参考默认。
- 无档案 = 现状默认（336/0.25/20x/0.06），行为逐字节不变 → 存量测试绿。
- 层优先级：CLI arg > profile > reference-default。
- 语言：脚本注释英文、用户可见输出中文；零 npm 依赖。

---

## 文件结构

| 文件 | 职责 | 动作 |
|---|---|---|
| `skills/trade-assistant/scripts/_lib.mjs` | profile 读写/校验/合并辅助 | Modify |
| `skills/trade-assistant/scripts/solve.mjs` | equity/posfrac/leverage/redLine 读档案 | Modify |
| `skills/trade-assistant/scripts/pyramid.mjs` | equity/leverage/redLine 读档案（批次不动） | Modify |
| `skills/trade-assistant/scripts/profile.mjs` | view/set/clear 唯一写入器 | Create |
| `skills/trade-assistant/SKILL.md` | 单一真源补充 + Env Facts + 首次采参/变更流程 | Modify |
| `references/00-core-playbook.md` | 数字标"参考默认可被档案覆盖" | Modify |
| `references/03-risk-and-position.md` | 同上 | Modify |
| `docs/skill-guide.md` / `docs/usage.md` | 同步 | Modify |
| `tests/profile.test.mjs` | profile 单元测试 | Create |
| `.claude-plugin/plugin.json` | version → 0.3.0 | Modify |

---

## Task 1: `_lib.mjs` 加 profile 辅助

**Files:** Modify `scripts/_lib.mjs`（`upsertClassSnapshot` 后追加，勿动现有 snapshot 辅助）

**Interfaces:**
- Consumes: 现有 `DATA_ROOT`(99) / `readClassSnapshot`(102-106) 模式
- Produces: `PROFILE_FILE` / `STRATEGY_DEFAULTS` / `readStrategyProfile()` / `strategyProfile()` / `validateStrategyProfile()` / `writeStrategyProfile()`

- [ ] **Step 1: 加常量 + 读**

```js
export const PROFILE_FILE = `${DATA_ROOT}/strategy-profile.json`;

export const STRATEGY_DEFAULTS = Object.freeze({
  schema: 1,
  equity: 336,
  leverage: 20,
  positionStyle: Object.freeze({ mainPct: 0.80, lotteryPct: 0.20, mainNormalPct: 0.25, lotteryPerTradePct: 0.05 }),
  risk: Object.freeze({ perTradeCapPct: 0.06, dailyCircuitBreakerPct: 0.08 }),
});

export function readStrategyProfile() {
  try { return JSON.parse(readFileSync(PROFILE_FILE, 'utf8')); } catch { return null; }
}

// 合并参考默认 + 档案；dailyCircuitBreakerPct clamp ≤0.08（硬 8% 不可放宽）；绝不返回 null。
export function strategyProfile() {
  const f = readStrategyProfile();
  const d = STRATEGY_DEFAULTS;
  const prof = {
    schema: f?.schema ?? d.schema, equity: f?.equity ?? d.equity, leverage: f?.leverage ?? d.leverage,
    positionStyle: { ...d.positionStyle, ...(f?.positionStyle ?? {}) },
    risk: { ...d.risk, ...(f?.risk ?? {}) },
    _applied: !!(f && Object.keys(f).length > 0),
  };
  prof.risk.dailyCircuitBreakerPct = Math.min(prof.risk.dailyCircuitBreakerPct, 0.08); // 硬上限
  return prof;
}
```

- [ ] **Step 2: 加校验 + 写**（照抄 upsertClassSnapshot 容错/写盘风格）

```js
export function validateStrategyProfile(v) {
  const errs = [], warns = [];
  if (!Number.isFinite(v.equity) || v.equity <= 0) errs.push('权益必须为正数');
  if (!Number.isInteger(v.leverage) || v.leverage < 1 || v.leverage > 125) errs.push('杠杆须为 1–125 整数');
  for (const [k, val] of Object.entries(v.positionStyle)) if (!Number.isFinite(val) || val <= 0) errs.push(`仓位 ${k} 须为正数`);
  if (v.positionStyle.mainPct + v.positionStyle.lotteryPct < 0.9) warns.push('主+彩票分配合计 < 90%');
  if (v.risk.perTradeCapPct > 0.06) warns.push('单笔红线高于参考默认 6%，计划中必须标注');
  if (v.risk.dailyCircuitBreakerPct > 0.08) errs.push('单日熔断不可放宽超过硬性 8%');
  return { errs, warns };
}

export function writeStrategyProfile(profile) {
  const prev = readStrategyProfile() ?? {};
  const merged = {
    ...prev, ...profile, schema: 1, updatedAt: new Date().toISOString(),
    positionStyle: { ...STRATEGY_DEFAULTS.positionStyle, ...(prev.positionStyle ?? {}), ...(profile.positionStyle ?? {}) },
    risk: { ...STRATEGY_DEFAULTS.risk, ...(prev.risk ?? {}), ...(profile.risk ?? {}) },
  };
  delete merged._applied;
  mkdirSync(dirname(PROFILE_FILE), { recursive: true });
  writeFileSync(PROFILE_FILE, JSON.stringify(merged, null, 1));
}
```

- [ ] **Step 3: 语法 + 提交**

Run: `node --check skills/trade-assistant/scripts/_lib.mjs` → OK。`git add ...` + `commit -m "feat: strategy-profile helpers in _lib (read/validate/write, defaults+clamp)"`

## Task 2: `solve.mjs` 读档案

**Files:** Modify `scripts/solve.mjs`

- [ ] **Step 1: import + 读取**

```js
import { ..., strategyProfile } from './_lib.mjs';
// 原 10-11 行
const prof = strategyProfile();
const equity = +opt('equity', prof.equity);
const posfrac = +opt('posfrac', prof.positionStyle.mainNormalPct);
const leverage = prof.leverage;
const redLinePct = prof.risk.perTradeCapPct;
```

- [ ] **Step 2: 替换硬编码 20 与 0.06**

- L53 `... * posMult * leverage) / entry)`（原 ×20）
- L54 `const margin = (qty * entry) / leverage;`
- L145 `if (best.loss / equity > redLinePct) {`
- L146 `const maxQty = Math.floor((equity * redLinePct) / (entry * best.sd / 100));`
- L147 消息用 `(redLinePct*100).toFixed(0)`，档案覆盖且 ≠6% 时加 `（策略档案覆盖，非参考默认 6%）`
- L136 兜底文案同步

- [ ] **Step 3: 档案应用注记（仅档案存在时打印，无档案不打印 → 测试绿）**

```js
if (prof._applied) {
  console.log(`策略档案已应用: 权益 ${equity}U | 杠杆 ${leverage}x | 常态仓位 ${(posfrac*100).toFixed(0)}% | 单笔红线 ${(redLinePct*100).toFixed(0)}%（strategy-profile.json）`);
}
```

## Task 3: `pyramid.mjs` 读档案（批次不动）

**Files:** Modify `scripts/pyramid.mjs`

- [ ] **Step 1:** import `strategyProfile`；`const prof = strategyProfile(); const equity = +opt('equity', prof.equity); const leverage = prof.leverage; const redLinePct = prof.risk.perTradeCapPct;`
- [ ] **Step 2:** L44 杠杆显示用 `leverage`；L48 `notional = margin * leverage`；L68/69 红线用 `redLinePct` + `(1/leverage*0.9*100)`；L69 消息 `${leverage}x 下约`
- [ ] **Step 3:** 档案注记（`prof._applied` 时打印，中文）——**不动** `base={probe:0.02,add1:0.06,add2:0.12}`(L28-32) 与 `maxTotal=0.20*posMult`(L34)（批次属参考默认，超范围）

## Task 4: 新建 `scripts/profile.mjs`

**Files:** Create `scripts/profile.mjs`

- [ ] **Step 1: 子命令 view|set|clear**

```js
// profile.mjs — per-user risk image view/edit (strategy-profile.json). Zero-dep; user output Chinese.
// view: 打印生效画像或"未配置，使用参考默认…"（含 equity×perTradeCap 单笔 U 上限）
// set: 解析 --equity/--leverage/--main-pct/--lottery-pct/--main-normal-pct/--lottery-per-trade-pct/--per-trade-cap-pct/--daily-cb-pct → validate → write → 打印生效
// clear: 删除文件 → "已删除，恢复参考默认"
// 由 agent 调用（首次采参/变更）；非资金写操作，不走 CONFIRM，但 SKILL.md 要求变更前用户选选项。
```

- [ ] **Step 2: 语法 + 手动验证**（`node --check` + temp TRADE_HOME 试 set/view/clear）

## Task 5: `SKILL.md` 文档

**Files:** Modify `skills/trade-assistant/SKILL.md`

- [ ] **Step 1: 单一真源补充**（L8 段后）：references 是规则集 + 持参考默认值，数值默认被 `strategy-profile.json` 覆盖；安全协议清单 HARD 不可档案驱动。
- [ ] **Step 2: Env Facts 加 item**：`strategy-profile.json` 位置/作用/管理方式；硬 8% 日停与 25/40% 回撤不可放宽。
- [ ] **Step 3: 新增 "## Strategy Profile" 段**（Toolbox 前）：字段表；**首次采参**（将跑 solve/pyramid/计划且无档案时，agent 先问中文问题集：净值/杠杆/主仓%/主彩分配/单笔红线/日熔断，各带默认 → set → 重跑；纯只读行情不阻塞）；**变更**（view → 给 2-3 组保守/当前/激进选项含单笔 U 上限效果 → 用户选 → set）；**输出反映**（solve/pyramid 打印"策略档案已应用"；per-trade cap ≠6% 时计划标注）。
- [ ] **Step 4: Toolbox 表加 profile.mjs 行** + solve/pyramid 行标注"(默认取策略档案)"；references Guide 的 00/03 行标"数值默认被档案覆盖"。

## Task 6: references/00 + 03 标"参考默认"

**Files:** Modify `references/00-core-playbook.md`、`references/03-risk-and-position.md`

- [ ] **Step 1 (00)**：头注后加 Reference-defaults 说明；Iron #1(8%) 标 HARD；#2(≤6%) 数值标参考默认（有效值取档案）；§1 的 80/20/20x/25%/5% 标"参考默认，可档案覆盖"；§4 336 标参考起始；§5 加"(参考默认)"。
- [ ] **Step 2 (03)**：§0 item4 重命名为"Per-trade red line（参考默认 6%，有效值取档案）"；加一句 solve/pyramid 读档案；§2 Normal 数值标参考默认；§3 注 U 值由权益×%推导、336/600/1500 为例路径；§4 25/40% 标 **HARD**。
- [ ] **不动** 06（金字塔批次超范围，留参考默认）。

## Task 7: docs + release

**Files:** Modify `docs/skill-guide.md`、`docs/usage.md`、`.claude-plugin/plugin.json`

- [ ] **Step 1:** skill-guide 脚本计数 14→15 + profile 行 + 00/03 覆盖注 + 硬规则补充行；usage 工具箱加 profile 行。
- [ ] **Step 2:** plugin.json version → `0.3.0`（发布纪律）。

## Task 8: 测试

**Files:** Create `tests/profile.test.mjs`

- [ ] **Step 1:** 写单元测试（动态 import 设 temp TRADE_HOME）：
  - 无文件 → `readStrategyProfile()` null、`strategyProfile()` = 默认且 `_applied===false`
  - `writeStrategyProfile({equity:500})` → round-trip 读回 500 + 其余默认
  - 部分档案逐字段回退
  - `validate({risk:{dailyCB:0.10}})` 返回含"8%"/硬停 错误
  - `strategyProfile()` 把存盘 0.10 dailyCB clamp 到 0.08
  - 存盘 perTradeCap 0.03 能流过
- [ ] **Step 2:** solve-with-profile e2e：temp TRADE_HOME 写档案 `{equity:500,leverage:20,positionStyle:{mainNormalPct:0.25},risk:{perTradeCapPct:0.06}}`，solve 不带 --equity → assert `/策略档案已应用/` + `/500U/` + 仍 `/币种分类: T1/`。

## Task 9: 验证 + 提交

**Files:** 全部

- [ ] **Step 1: 全量验证**

Run:
```bash
cd /d/claude-dev/agents/trade-agents
for f in skills/trade-assistant/scripts/*.mjs mcp/*.mjs hooks/*.mjs; do node --check "$f" || echo "FAIL $f"; done
node --test tests/*.test.mjs 2>&1 | tail -4
```
Expected: mjs 全 OK；存量测试 + 新 profile 测试全绿（无档案 = 现状默认 → solve/scripts-lib 等不破）。

- [ ] **Step 2: 无档案行为回归**（临时 TRADE_HOME）

Run: `TRADE_HOME=<temp-empty> node solve.mjs BTCUSDT --qty 10 --entry 60000 --hours 8`
Expected: 无"策略档案已应用"行；6% 红线逻辑同现状。

- [ ] **Step 3: 档案驱动 e2e**（隔离 TRADE_HOME 或临时）

Run: `node profile.mjs set --equity 500 --per-trade-cap-pct 0.05 --main-normal-pct 0.30` → `view` → `solve`（不带 --equity）→ 见"策略档案已应用…500U…30%…5%"。
Safety 检查: `profile.mjs set --daily-cb-pct 0.10` → 应报错 exit 1（硬 8% 不可放宽）。
Cleanup: `profile.mjs clear`。

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "feat: strategy-profile.json overrides reference defaults in solve/pyramid (equity/leverage/pos-style/risk-tolerance); safety stays hard"
git commit --allow-empty -m "release: plugin 0.3.0"  # 或合并到上一条（bump 已含）
```
Expected: 一次干净提交；`git diff --stat` 恰含所列文件；0.06/336/0.25/20 仅出现在 STRATEGY_DEFAULTS。

---

## 自审记录

- **Spec 覆盖**：核心画像字段（Task 1 默认结构）→ 全 Task；agent 触发首次采参（Task 5 Step 3）→ SKILL；安全硬（clamp + Task 5 声明）→ 全；无档案=现状（Task 1 `_applied` + 测试）→ Task 8/9。
- **占位符**：无。各步含真实代码/命令。
- **类型一致**：`strategyProfile()/_applied/validateStrategyProfile/writeStrategyProfile/PROFILE_FILE` 跨 Task 一致；档案 JSON 键名 solve/pyramid/SKILL 三处统一。
- **范围**：不碰 tier 阈值（classify 不动 → scripts-lib.test 不破）、不碰金字塔批次、不碰选币阈值/wick。安全协议未软化。
- **风险**：`_lib.mjs` 模块级读 `DATA_ROOT`（TRADE_HOME 需在 import 前设）→ 测试用动态 import；`solve.test.mjs` 用 temp 空 TRADE_HOME + 显式 --equity → 不破。
