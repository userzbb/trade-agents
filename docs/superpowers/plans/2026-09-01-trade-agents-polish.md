# trade-agents 全面打磨 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **提交策略**：per spec §3.7，所有改动合并为**一次干净提交**（Task 10）。各 Task 内的 `git status` 检查是 checkpoint，不是提交点。

**Goal:** 对 `D:\claude-dev\agents`（trade-agents 插件）做全面打磨：agents 触发与路径、MCP server 健壮性、脚本回归测试、evals 扩展、镜像同步，交付一次干净提交。

**Architecture:** 测试用 `node:test`（零依赖）+ `MOCK_FAPI`/`__setCurlForTest` 注入，不发真实网络请求。MCP server 重构为可导出可测（`parseCliOutput`/`buildToolList`/`callTool` + 测试钩子 + `isMain` 守卫）。scripts 通过 `_lib.mjs` 的 mock 钩子在子进程端到端测试。agents 改动限 description/路径/文档。子 agent 复检分 4 维度。

**Tech Stack:** Node.js ≥26（内置 `node:sqlite`、`node:test`），零 npm 依赖，Git Bash（Windows）。

**Spec:** `docs/superpowers/specs/2026-09-01-trade-agents-polish-design.md`

---

## 文件结构

| 文件 | 职责 | 动作 |
|---|---|---|
| `skills/trade-assistant/scripts/_lib.mjs` | 共享 curl/fapi/sleep；加测试钩子 | Modify |
| `mcp/binance-mcp-server.mjs` | MCP server；加导出 + 测试钩子 + isMain 守卫 | Modify |
| `tests/scripts-lib.test.mjs` | `classify`/`fapi` 重试/错误码单测 | Create |
| `tests/mcp.test.mjs` | `parseCliOutput`/`buildToolList`/串行 ticker/CONFIRM 单测 | Create |
| `tests/solve.test.mjs` | solve.mjs 子进程端到端（MOCK_FAPI） | Create |
| `tests/ta.test.mjs` | ta.mjs 子进程端到端（MOCK_FAPI） | Create |
| `agents/binance-orchestrator.md` | 硬编码路径 → 运行时解析 | Modify |
| `agents/retrospective-writer.md` | 路径字面量 → `<skill-root>`（保持已有 description 改动） | Modify |
| `docs/agents.md` | 决策表措辞对齐（无硬编码，仅澄清） | Modify |
| `skills/trade-assistant/evals/evals.json` | 6 → 10 条 | Modify |
| 镜像 `D:\claude-dev\skills\trade-assistant\*` | 内容文件同步（SKILL.md/references/scripts/evals） | Sync |

---

## Task 1: `_lib.mjs` 测试钩子

**Files:**
- Modify: `skills/trade-assistant/scripts/_lib.mjs:1-18`

- [ ] **Step 1: 修改 `_lib.mjs` 头部（测试钩子 + mock）**

将文件头（`import` 到 `curlOnce` 定义，第 1-18 行）替换为：

```js
// 共享工具：代理请求 + 重试 + 限流保护
import { execFile, exec } from 'child_process';
import { readFileSync } from 'fs';

export const PROXY = process.env.BINANCE_PROXY || 'http://127.0.0.1:7897';
export const FAPI = 'https://fapi.binance.com';

// BINANCE_TEST_FAST=1 → sleep 归零（测试用；生产不设此变量）
export const sleep = (ms) => new Promise((r) => setTimeout(r, process.env.BINANCE_TEST_FAST ? 0 : ms));

// 测试钩子：覆盖 curlOnce（unit test 用）。fn 接收 url，返回 raw stdout 字符串，可 throw 模拟失败。
let curlOverride = null;
export function __setCurlForTest(fn) { curlOverride = fn; }

// MOCK_FAPI=<fixture.json>：fixture 是 { "<path>": "<raw curl 输出字符串>" }，子进程测试注入。
// key 用 path（不含 host，含 query，须与脚本实际请求完全一致）；命中返回字符串；缺失抛错（防测错端点）。
// 每个子进程只加载一个 fixture 文件。
let mockFixtures = null;
function mockFor(url) {
  if (!mockFixtures) mockFixtures = JSON.parse(readFileSync(process.env.MOCK_FAPI, 'utf8'));
  const path = url.replace(/^https?:\/\/[^/]+/, '');
  if (!Object.hasOwn(mockFixtures, path)) {
    throw new Error(`MOCK_FAPI: no fixture for ${path}; available: ${Object.keys(mockFixtures).join(', ')}`);
  }
  return mockFixtures[path];
}

function curlOnce(url) {
  if (curlOverride) return Promise.resolve().then(() => curlOverride(url)); // 同步 throw 转为 rejection
  if (process.env.MOCK_FAPI) return Promise.resolve(mockFor(url)); // 仅 mock 模式进入，fixture 缺失/为 null 一律抛错
  return new Promise((resolve, reject) => {
    execFile('curl', ['-sS', '-m', '30', '-x', PROXY, url], { maxBuffer: 64 * 1024 * 1024 }, (err, stdout) => (err ? reject(err) : resolve(stdout)));
  });
}
```

保留 `_lib.mjs` 第 20 行起的 `fapi`/`fapiSeq`/`fmt`/`pct`/`classify`/`DATA_ROOT` 等不变（`fapi` 内的 `await sleep(2500 + i * 2500)` 由 `BINANCE_TEST_FAST` 归零，无需改）。

- [ ] **Step 2: 语法检查**

Run: `node --check skills/trade-assistant/scripts/_lib.mjs`
Expected: 无输出（exit 0）。

## Task 2: `tests/scripts-lib.test.mjs`

**Files:**
- Create: `tests/scripts-lib.test.mjs`

- [ ] **Step 1: 写单测**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, fapi, __setCurlForTest } from '../skills/trade-assistant/scripts/_lib.mjs';

// ---- classify（纯函数）----
test('classify: T1 高流动性低波动 (资金≥2亿 + 振幅≤25%)', () => {
  const c = classify(5000, 10); // volScore=2, ampScore=2 → 4分
  assert.equal(c.tier, 'T1');
  assert.equal(c.modelDiscount, 1);
  assert.equal(c.posMult, 1);
});
test('classify: T2 中等 (资金0.5~2亿 + 振幅25~40%)', () => {
  const c = classify(100, 30); // 1 + 1 = 2分
  assert.equal(c.tier, 'T2');
  assert.equal(c.modelDiscount, 0.85);
  assert.equal(c.posMult, 0.6);
});
test('classify: T3 高波动/低流动性 (资金<0.5亿 + 振幅>40%)', () => {
  const c = classify(10, 60); // 0 + 0 = 0分
  assert.equal(c.tier, 'T3');
  assert.equal(c.modelDiscount, 0.65);
  assert.equal(c.posMult, 0.4);
});

// ---- fapi 重试（transient failure 后成功）----
test('fapi: 前 2 次失败，第 3 次成功', async () => {
  process.env.BINANCE_TEST_FAST = '1';
  let calls = 0;
  __setCurlForTest(() => {
    calls++;
    if (calls < 3) throw new Error('network blip');
    return '{"ok":true}';
  });
  try {
    const data = await fapi('/test', { retries: 5 });
    assert.deepEqual(data, { ok: true });
    assert.equal(calls, 3);
  } finally {
    __setCurlForTest(null);
    delete process.env.BINANCE_TEST_FAST;
  }
});

// ---- fapi 错误码响应识别 ----
test('fapi: 识别 API 错误码并抛错', async () => {
  process.env.BINANCE_TEST_FAST = '1';
  __setCurlForTest(() => '{"code":-1121,"msg":"Invalid symbol"}');
  try {
    await assert.rejects(fapi('/test', { retries: 2 }), /API错误 -1121/);
  } finally {
    __setCurlForTest(null);
    delete process.env.BINANCE_TEST_FAST;
  }
});
```

- [ ] **Step 2: 跑测试**

Run: `node --test tests/scripts-lib.test.mjs`
Expected: 5 个 test 全部 PASS（`classify` ×3、`fapi` retry、`fapi` 错误码）。

## Task 3: MCP server 重构（可测 + 健壮化）

**Files:**
- Modify: `mcp/binance-mcp-server.mjs`

- [ ] **Step 1: 顶部 import + 测试钩子 + curl/cli/parseCliOutput**

将第 1-10 行替换为：

```js
#!/usr/bin/env node
// Binance 合约 MCP server（stdio，零第三方依赖）
// 工具：行情查询（只读）+ 账户查询（只读）+ 下单执行（需 confirm 显式确认）
// 数据源：fapi.binance.com 公开行情（curl+代理） + binance-cli（签名操作）
import { execFile } from 'child_process';
import { fileURLToPath } from 'url';
import { resolve } from 'path';

const PROXY = process.env.BINANCE_PROXY || 'http://127.0.0.1:7897';
const FAPI = 'https://fapi.binance.com';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CLI_NAME = process.platform === 'win32' ? 'binance-cli.cmd' : 'binance-cli';

// 测试钩子：覆盖 execFile（cli() 用）与 curl 实现
let cliExecImpl = null;
let curlImpl = null;
export function __setCliExecForTest(fn) { cliExecImpl = fn; }
export function __setCurlForTest(fn) { curlImpl = fn; }
```

- [ ] **Step 2: curl() 使用 curlImpl**

将 `curl` 函数（第 30-42 行）替换为：

```js
function curl(url, { retries = 3 } = {}) {
  return new Promise((resolve, reject) => {
    let attempt = 0;
    const once = () => (curlImpl
      ? Promise.resolve(curlImpl(url))
      : new Promise((res, rej) => execFile('curl', ['-sS', '-m', '30', '-x', PROXY, url], { maxBuffer: 32 * 1024 * 1024 }, (err, stdout) => {
          if (!err && stdout) res(stdout); else rej(err);
        })));
    const run = () => once().then(resolve).catch(() => {
      if (++attempt < retries) setTimeout(run, 3000);
      else reject(new Error('curl 失败'));
    });
    run();
  });
}
```

- [ ] **Step 3: 新增 `parseCliOutput` + 改造 `cli()` 使用钩子**

将 `cli` 函数（第 45-62 行）替换为：

```js
// 解析 binance-cli 输出：优先整段 JSON.parse；失败从首个 [ 或 { 截取兜底；仍失败抛错。
export function parseCliOutput(out) {
  const text = (out || '').trim();
  if (!text) throw new Error('CLI 输出为空');
  try { return JSON.parse(text); } catch { /* fallthrough */ }
  const s = text.search(/[[{]/);
  if (s >= 0) {
    try { return JSON.parse(text.slice(s)); } catch { /* fallthrough */ }
  }
  throw new Error('无法解析 CLI 输出: ' + text.slice(0, 120));
}

// 用 execFile(参数数组) 执行 binance-cli——不使用 shell，从根上杜绝命令注入
function cli(args, { retries = 3 } = {}) {
  const env = { ...process.env, HTTPS_PROXY: PROXY, HTTP_PROXY: PROXY };
  const exec = cliExecImpl || execFile;
  return new Promise((resolve, reject) => {
    let attempt = 0;
    const run = () => {
      exec(CLI_NAME, args, { env, timeout: 90000, maxBuffer: 16 * 1024 * 1024 }, (err, stdout) => {
        const out = (stdout || '').trim();
        if (!err && out && !/failed|recvWindow|Way too many/i.test(out)) {
          try { return resolve(parseCliOutput(out)); } catch { /* fallthrough */ }
        }
        if (++attempt < retries) return setTimeout(run, 6000);
        reject(new Error(out || err?.message || 'cli 失败'));
      });
    };
    run();
  });
}
```

- [ ] **Step 4: tools 表加 `required`（真实必填）**

将 `tools` 常量（第 67-82 行）替换为：

```js
const tools = {
  // 行情（只读）
  get_klines: { desc: 'K线/蜡烛图（15m/1h/4h/1d 等）', params: ['symbol', 'interval', 'limit'], required: ['symbol'] },
  get_ticker: { desc: '最新价 + 24h 涨跌幅/振幅/成交额', params: ['symbol'], required: ['symbol'] },
  get_funding_rate: { desc: '资金费率历史', params: ['symbol', 'limit'], required: ['symbol'] },
  get_orderbook: { desc: '盘口深度（买/卖墙）', params: ['symbol', 'limit'], required: ['symbol'] },
  get_long_short_ratio: { desc: '大户持仓多空比', params: ['symbol', 'period'], required: ['symbol'] },
  // 账户（只读）
  get_positions: { desc: '当前持仓（含盈亏/强平距离）', params: [], required: [] },
  get_balance: { desc: '合约账户余额', params: [], required: [] },
  get_open_orders: { desc: '当前挂单', params: [], required: [] },
  // 下单（写操作，必须 confirm=true）
  place_order: { desc: '开仓/平仓（需 confirm=true 确认）', params: ['symbol', 'side', 'type', 'quantity', 'price', 'reduceOnly', 'confirm'], required: ['symbol', 'side', 'type', 'quantity'] },
  set_stop_loss: { desc: '挂止损（需 confirm=true 确认）', params: ['symbol', 'triggerPrice', 'quantity', 'confirm'], required: ['symbol', 'triggerPrice', 'quantity'] },
  cancel_order: { desc: '撤单（需 confirm=true 确认）', params: ['symbol', 'orderId', 'confirm'], required: ['symbol', 'orderId'] },
};

export function buildToolList() {
  return Object.entries(tools).map(([name, t]) => ({
    name,
    description: t.desc + '。写操作工具必须传 confirm:true，且受交易工程 CONFIRM 协议约束。',
    inputSchema: {
      type: 'object',
      properties: Object.fromEntries(t.params.map((p) => [p, { type: p === 'confirm' ? 'boolean' : 'string' }])),
      required: t.required || [],
    },
  }));
}
```

- [ ] **Step 5: get_ticker 串行化**

将 `get_ticker` case（第 91-98 行）替换为：

```js
    case 'get_ticker': {
      const sym = assertSafe(args.symbol, 'symbol');
      const p = await fapi(`/fapi/v1/ticker/price?symbol=${enc(sym)}`);
      const t = await fapi(`/fapi/v1/ticker/24hr?symbol=${enc(sym)}`);
      return { price: +p.price, pct24h: +t.priceChangePercent, amp24h: ((+t.highPrice - +t.lowPrice) / +p.price) * 100, vol24h: Math.round(+t.quoteVolume), high: +t.highPrice, low: +t.lowPrice };
    }
```

- [ ] **Step 6: tools/list 用 buildToolList + 导出 callTool + isMain 守卫**

将 MCP stdio 段（第 163-198 行）中：

```js
      } else if (msg.method === 'tools/list') {
        send({ jsonrpc: '2.0', id: msg.id, result: { tools: Object.entries(tools).map(([name, t]) => ({
          name, description: t.desc + '。写操作工具必须传 confirm:true，且受交易工程 CONFIRM 协议约束。', inputSchema: { type: 'object', properties: Object.fromEntries(t.params.map((p) => [p, { type: p === 'confirm' ? 'boolean' : 'string' }])), required: t.params.slice(0, Math.min(2, t.params.length)) },
        })) } });
```

替换为：

```js
      } else if (msg.method === 'tools/list') {
        send({ jsonrpc: '2.0', id: msg.id, result: { tools: buildToolList() } });
```

将 `callTool` 定义处改名：现有 `async function callTool(name, args) {`（第 84 行）改为：

```js
async function _callToolImpl(name, args) {
```

（`tools/call` 分支与内部逻辑不变。）随后在文件末尾追加 `callTool` 导出别名 + `isMain` 守卫：

```js
// 导出别名供测试用（ESM 函数声明提升，isMain 分支内的引用不受文本顺序影响）
export async function callTool(name, args) { return _callToolImpl(name, args); }

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  // ---------- MCP stdio 协议 ----------
  const send = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', async (chunk) => {
    // ... 原有 data 处理逻辑原样保留（含 tools/list 改调用 buildToolList()）
  });
}
```

> 注意：原文件 `tools/call` 分支里 `callTool(name, args)` 的引用保持不变——`export async function callTool` 是提升的函数声明，data handler 运行时已定义。若仍报未定义，把该引用改为 `_callToolImpl(name, args)`。

- [ ] **Step 7: 语法检查 + 运行验证（MCP 单独跑一次 initialize 握手）**

Run: `node --check mcp/binance-mcp-server.mjs`
Expected: 无输出（exit 0）。

Run: `echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | node mcp/binance-mcp-server.mjs`
Expected: 一行 JSON-RPC 响应，`serverInfo.name === "binance-mcp"`，进程退出。

## Task 4: `tests/mcp.test.mjs`

**Files:**
- Create: `tests/mcp.test.mjs`

- [ ] **Step 1: 写单测**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as mcp from '../mcp/binance-mcp-server.mjs';

// ---- parseCliOutput：三种输出形态 ----
test('parseCliOutput: 纯 JSON', () => {
  assert.deepEqual(mcp.parseCliOutput('{"a":1}\n'), { a: 1 });
});
test('parseCliOutput: 前导文本 + JSON 对象', () => {
  assert.deepEqual(mcp.parseCliOutput('some banner {"a":1}'), { a: 1 });
});
test('parseCliOutput: 前导文本 + JSON 数组', () => {
  assert.deepEqual(mcp.parseCliOutput('ok\n[1,2,3]'), [1, 2, 3]);
});
test('parseCliOutput: 含 { 的错误文本非 JSON → 抛错', () => {
  assert.throws(() => mcp.parseCliOutput('ERROR: {oops}'), /无法解析/);
});
test('parseCliOutput: 空输出 → 抛错', () => {
  assert.throws(() => mcp.parseCliOutput('   '), /为空/);
});

// ---- buildToolList：required 真实必填 ----
test('buildToolList: required 反映真实必填', () => {
  const byName = Object.fromEntries(mcp.buildToolList().map((t) => [t.name, t]));
  assert.deepEqual(byName.get_klines.inputSchema.required, ['symbol']);
  assert.deepEqual(byName.place_order.inputSchema.required, ['symbol', 'side', 'type', 'quantity']);
  assert.deepEqual(byName.set_stop_loss.inputSchema.required, ['symbol', 'triggerPrice', 'quantity']);
  assert.deepEqual(byName.cancel_order.inputSchema.required, ['symbol', 'orderId']);
  assert.deepEqual(byName.get_balance.inputSchema.required, []);
  assert.equal(byName.place_order.inputSchema.properties.confirm.type, 'boolean');
});

// ---- get_ticker 串行 + 结果形状 ----
test('get_ticker: 串行请求 price → 24hr', async () => {
  const calls = [];
  mcp.__setCurlForTest((url) => {
    calls.push(url);
    if (url.includes('/ticker/price?')) return JSON.stringify({ symbol: 'BTCUSDT', price: '60000.0' });
    return JSON.stringify({ priceChangePercent: '2.5', highPrice: '61000', lowPrice: '58000', quoteVolume: '5000000000' });
  });
  try {
    const r = await mcp.callTool('get_ticker', { symbol: 'BTCUSDT' });
    assert.equal(calls.length, 2);
    assert.ok(calls[0].includes('/ticker/price?'));
    assert.ok(calls[1].includes('/ticker/24hr?'));
    assert.equal(r.price, 60000);
    assert.equal(r.pct24h, 2.5);
  } finally {
    mcp.__setCurlForTest(null);
  }
});

// ---- CONFIRM 协议 ----
test('place_order 无 confirm → 抛错', async () => {
  await assert.rejects(
    mcp.callTool('place_order', { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '1' }),
    /confirm=true/
  );
});
test('place_order 带 confirm → 组装 argv 并成功', async () => {
  mcp.__setCliExecForTest((file, args, opts, cb) => {
    assert.equal(file, process.platform === 'win32' ? 'binance-cli.cmd' : 'binance-cli');
    assert.equal(args[0], 'futures-usds');
    cb(null, JSON.stringify({ orderId: 123, clientOrderId: 'x', status: 'NEW' }));
  });
  try {
    const r = await mcp.callTool('place_order', { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '1', confirm: true });
    assert.equal(r.status, 'OK');
    assert.equal(r.orderId, 123);
  } finally {
    mcp.__setCliExecForTest(null);
  }
});

// ---- get_klines 行映射 ----
test('get_klines: 行映射', async () => {
  mcp.__setCurlForTest(() => JSON.stringify([[0, '1', '2', '0.5', '1.5', '10', 0, 0, 0, 0, 0, 0]]));
  try {
    const r = await mcp.callTool('get_klines', { symbol: 'BTCUSDT', interval: '15m', limit: 1 });
    assert.deepEqual(r, [{ t: '00:00', o: 1, h: 2, l: 0.5, c: 1.5, v: 10 }]);
  } finally {
    mcp.__setCurlForTest(null);
  }
});
```

- [ ] **Step 2: 跑测试**

Run: `node --test tests/mcp.test.mjs`
Expected: 10 个 test 全部 PASS。

## Task 5: solve.mjs 端到端测试

**Files:**
- Create: `tests/solve.test.mjs`

- [ ] **Step 1: 写子进程测试**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SOLVE = join(ROOT, 'skills', 'trade-assistant', 'scripts', 'solve.mjs');

function makeFixture() {
  // 288 根 15m K 线，收盘价小幅上行（确定性，不依赖 Math.random 之外的分支）
  const kl = Array.from({ length: 288 }, (_, i) => {
    const c = 60000 * (1 + 0.0004 * i);
    return [i, (c * 0.999).toFixed(1), (c * 1.001).toFixed(1), (c * 0.998).toFixed(1), c.toFixed(1), '10', i, 0, 0, 0, 0, 0];
  });
  return {
    '/fapi/v1/ticker/price?symbol=BTCUSDT': JSON.stringify({ symbol: 'BTCUSDT', price: '60000.0' }),
    '/fapi/v1/ticker/24hr?symbol=BTCUSDT': JSON.stringify({ highPrice: '61000', lowPrice: '58000', lastPrice: '60000', quoteVolume: '5000000000' }),
    '/fapi/v1/klines?symbol=BTCUSDT&interval=15m&limit=288': JSON.stringify(kl),
  };
}

test('solve.mjs 端到端（MOCK_FAPI，零网络）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'solve-test-'));
  try {
    const fixture = join(dir, 'fixture.json');
    writeFileSync(fixture, JSON.stringify(makeFixture()));
    const env = {
      ...process.env,
      MOCK_FAPI: fixture,
      TRADE_HOME: join(dir, 'trade'),
      BINANCE_TEST_FAST: '1',
    };
    const out = execFileSync(process.execPath, [SOLVE, 'BTCUSDT', '--entry', '60000', '--qty', '10', '--equity', '336', '--hours', '8'], { env, encoding: 'utf8', timeout: 60000 });
    assert.match(out, /=== BTCUSDT 止损\/止盈求解器/);
    assert.match(out, /币种分类: T1/);        // fixture 资金 5000M + 振幅 5% → T1
    assert.match(out, /仓位折扣 x1\.0/);
    assert.match(out, /排名\s+止损%|排名/);
    assert.match(out, /★ 推荐参数/);
    assert.match(out, /止损:/);
    assert.match(out, /止盈:/);
    assert.match(out, /期望值/);
    assert.match(out, /免责/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: 跑测试**

Run: `node --test tests/solve.test.mjs`
Expected: 1 个 test PASS（运行约 1-3s）。

## Task 6: ta.mjs 端到端测试

**Files:**
- Create: `tests/ta.test.mjs`

- [ ] **Step 1: 写子进程测试**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TA = join(ROOT, 'skills', 'trade-assistant', 'scripts', 'ta.mjs');

function makeFixture() {
  const kl = Array.from({ length: 200 }, (_, i) => {
    const c = 60000 * (1 + 0.0005 * i);
    return [i, (c * 0.999).toFixed(1), (c * 1.001).toFixed(1), (c * 0.998).toFixed(1), c.toFixed(1), '10', i, 0, 0, 0, 0, 0];
  });
  return { '/fapi/v1/klines?symbol=BTCUSDT&interval=1h&limit=200': JSON.stringify(kl) };
}

test('ta.mjs 端到端（MOCK_FAPI，零网络）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ta-test-'));
  try {
    const fixture = join(dir, 'fixture.json');
    writeFileSync(fixture, JSON.stringify(makeFixture()));
    const env = { ...process.env, MOCK_FAPI: fixture, TRADE_HOME: join(dir, 'trade'), BINANCE_TEST_FAST: '1' };
    const out = execFileSync(process.execPath, [TA, 'BTCUSDT', '--interval', '1h', '--limit', '200'], { env, encoding: 'utf8', timeout: 30000 });
    assert.match(out, /=== BTCUSDT 技术分析（1h，200根）===/);
    assert.match(out, /\[动量\]/);
    assert.match(out, /RSI\(14\):/);
    assert.match(out, /\[趋势\]/);
    assert.match(out, /EMA50/);
    assert.match(out, /\[综合研判\]/);
    assert.match(out, /信号评分/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: 跑测试**

Run: `node --test tests/ta.test.mjs`
Expected: 1 个 test PASS。

## Task 7: 全量测试 + 语法检查（checkpoint，不提交）

**Files:** 无改动

- [ ] **Step 1: 跑全部单测**

Run: `cd /d/claude-dev/agents && node --test tests/*.test.mjs`（注意：Node v26/Windows 下 `node --test tests/` 目录参数会被解析为模块路径而失败，须用 glob 或显式文件列表）
Expected: 全部 PASS（19 个：scripts-lib 7 + mcp 10 + solve 1 + ta 1）。

- [ ] **Step 2: 全部脚本语法检查**

Run: `for f in skills/trade-assistant/scripts/*.mjs mcp/binance-mcp-server.mjs; do node --check "$f" || echo "FAIL $f"; done`
Expected: 无 "FAIL" 输出。

## Task 8: agents 打磨（description 校验 + 硬编码路径修复）

**Files:**
- Modify: `agents/binance-orchestrator.md`
- Modify: `agents/retrospective-writer.md`
- Modify: `docs/agents.md`

- [ ] **Step 1: 校验两个 agent frontmatter（含已有未提交 description/example 改动）**

Run: `bash "C:/Users/zizim/.claude/plugins/cache/claude-plugins-official/plugin-dev/ed404106fcd8/skills/agent-development/scripts/validate-agent.sh" agents/binance-orchestrator.md && bash "C:/Users/zizim/.claude/plugins/cache/claude-plugins-official/plugin-dev/ed404106fcd8/skills/agent-development/scripts/validate-agent.sh" agents/retrospective-writer.md`
Expected: 除 "description too short（1 characters）" 外全部 ✅/⚠️。该警告是验证器不解析 multi-line block scalar 的**假警告**（description 实际 >900 字符，10-5000 区间内），记录即可，不改格式。

- [ ] **Step 2: binance-orchestrator.md — 新增「Path Resolution」小节 + 消除硬编码路径**

将 `## Environment Facts` 小节中：

```
Read `D:\claude-dev\agents\skills\trade-assistant\SKILL.md` → "Environment Facts" for the authoritative block.
```

改为：

```
Read `<skill-root>/skills/trade-assistant/SKILL.md` → "Environment Facts" for the authoritative block.
```

在该小节之后、`## Provider Decision Table` 之前插入：

```
## Path Resolution (no hardcoded absolute paths)

- `<skill-root>` = `${TRADE_PLUGIN_ROOT}` if set, else `D:/claude-dev/agents`.
- Plugin skill root = `<skill-root>/skills/trade-assistant`; toolbox scripts = `<skill-root>/skills/trade-assistant/scripts/*.mjs`.
- External skills (crypto-market-rank, binance-wallet-tracker, binance-trading-signal, query-token-*) are user-level skills at **no stable path**. Resolve each at runtime: prefer a matching env var if the plugin defines one (e.g. `CRYPTO_MARKET_RANK_CLI`); otherwise Read that skill's SKILL.md to locate its CLI; if the skill is not installed, say so and skip the provider — never invent a path.
```

将决策表三行：

```
| 信息面 — social hype / sentiment / smart-money inflow / top-trader PnL ranks | `crypto-market-rank` | `node C:\Users\zizim\.agents\skills\crypto-market-rank\scripts\cli.mjs <subcmd> '<json>'` |
...
| Technical indicators (RSI/MACD/EMA/BOLL/ATR/divergence/patterns) | trade-assistant toolbox | `node D:\claude-dev\agents\skills\trade-assistant\scripts\ta.mjs <SYM> [--interval 1h]` |
| Market scan / coin checkup / probability / stop-TP solver / pyramid | trade-assistant toolbox | `node D:\claude-dev\agents\skills\trade-assistant\scripts\scan.mjs` / `coin.mjs` / `prob.mjs` / `solve.mjs` / `pyramid.mjs` |
```

改为：

```
| 信息面 — social hype / sentiment / smart-money inflow / top-trader PnL ranks | `crypto-market-rank` | resolve its CLI per Path Resolution, then `node <market-rank-cli> <subcmd> '<json>'` |
...
| Technical indicators (RSI/MACD/EMA/BOLL/ATR/divergence/patterns) | trade-assistant toolbox | `node <skill-root>/skills/trade-assistant/scripts/ta.mjs <SYM> [--interval 1h]` |
| Market scan / coin checkup / probability / stop-TP solver / pyramid | trade-assistant toolbox | `node <skill-root>/skills/trade-assistant/scripts/scan.mjs` / `coin.mjs` / `prob.mjs` / `solve.mjs` / `pyramid.mjs` |
```

将决策表后第 74 行的旧注记：

```
`TRADE_PLUGIN_ROOT` (default `D:/claude-dev/agents`) and `TRADE_HOME` (default `D:/trade`) are overridable via env — prefer them over the literal paths above when set.
```

改为：

```
`TRADE_PLUGIN_ROOT` / `TRADE_HOME` / `CRYPTO_MARKET_RANK_CLI` are overridable via env — Path Resolution always prefers them.
```

- [ ] **Step 3: retrospective-writer.md — 路径字面量 → `<skill-root>`**

将：

```
- Skill root = `D:\claude-dev\agents\skills\trade-assistant` (override via `TRADE_PLUGIN_ROOT`).
```

改为：

```
- Skill root = `<skill-root>/skills/trade-assistant` (`<skill-root>` = `${TRADE_PLUGIN_ROOT}` or `D:/claude-dev/agents`).
```

> **注意**：`<skill-root>` 已重定义为插件根。该文件内其余 `node <skill-root>/scripts/xxx.mjs` 引用（summary/sync/vector/plan 等，约 6 处）必须同步改为 `node <skill-root>/skills/trade-assistant/scripts/xxx.mjs`，否则解析到错误路径（Task 8 质量审查发现，已修复）。

- [ ] **Step 4: docs/agents.md — 决策表措辞对齐**

将第 100 行：

```
| 信息面排名/热度/聪明钱流入/地址PnL榜 | `crypto-market-rank` | `node <skill>/scripts/cli.mjs <subcmd> '<json>'` |
```

改为：

```
| 信息面排名/热度/聪明钱流入/地址PnL榜 | `crypto-market-rank` | 按运行时解析其 CLI（见 agent 的 Path Resolution），`node <market-rank-cli> <subcmd> '<json>'` |
```

并在「环境要点」小节加一条：

```
- 路径一律运行时解析（`TRADE_PLUGIN_ROOT`/`CRYPTO_MARKET_RANK_CLI` env 或读对应 skill），不写死绝对路径。
```

- [ ] **Step 5: 校验无残留硬编码**

Run: `grep -n "C:\\\\Users\\\\zizim\\\\.agents\|D:\\\\claude-dev\\\\agents\\\\skills" agents/*.md docs/agents.md`
Expected: 无匹配（exit 1）。

## Task 9: evals 扩展 6 → 10

**Files:**
- Modify: `skills/trade-assistant/evals/evals.json`

- [ ] **Step 1: 在 evals 数组末尾追加 4 条**

在 `{"id": 6, ...}` 条目之后、`]` 之前追加：

```json
    ,
    {
      "id": 7,
      "prompt": "ARB 的技术面怎么样",
      "expected_output": "运行 ta.mjs ARB（默认 1h，需注明所用周期），输出中文技术分析：动量(RSI/MACD柱)、趋势(EMA50/200、布林带位置)、背离、K线形态、综合研判评分；明确 TA 是第二道确认而非进场依据",
      "files": []
    },
    {
      "id": 8,
      "prompt": "帮我看看金字塔加仓这个币",
      "expected_output": "运行 pyramid.mjs 输出加仓计划（分层入场/止损/资金分配），按 06 文件规则；展示完整计划 + 模式A/B 供用户选择，未获 CONFIRM 前不下单",
      "files": []
    },
    {
      "id": 9,
      "prompt": "写一下这个月的月报",
      "expected_output": "运行 summary.mjs monthly 生成月报 md（win rate/回撤/分级归因），再跑 plan.mjs --target <目标U> --days <N> --equity <当前净值> 校验下期目标；给中文摘要并 git 归档到 D:/trade/retrospectives",
      "files": []
    },
    {
      "id": 10,
      "prompt": "看看 ARB 是吸筹还是派发",
      "expected_output": "走 /binance 生态编排：binance-wallet-tracker 查 ARB 的吸筹/派发/round-trip/首动行为；中文表格汇总并标注来源；纯查询无需 CONFIRM",
      "files": []
    }
```

- [ ] **Step 2: 校验 JSON**

Run: `node -e "const e=require('./skills/trade-assistant/evals/evals.json'); console.log(e.evals.length)"`
Expected: `10`（无报错）。

## Task 10: 镜像同步 + diff 验证

**Files:**
- Sync: `D:\claude-dev\skills\trade-assistant\`（内容文件）

- [ ] **Step 1: 同步内容文件到镜像**

Run:

```bash
cd /d/claude-dev/agents
cp skills/trade-assistant/SKILL.md /d/claude-dev/skills/trade-assistant/SKILL.md
cp skills/trade-assistant/references/*.md /d/claude-dev/skills/trade-assistant/references/
cp skills/trade-assistant/scripts/*.mjs /d/claude-dev/skills/trade-assistant/scripts/
cp skills/trade-assistant/evals/evals.json /d/claude-dev/skills/trade-assistant/evals/
```

Expected: 无报错。

- [ ] **Step 2: diff 验证（只允许分发专属文件差异）**

Run: `diff -rq skills/trade-assistant /d/claude-dev/skills/trade-assistant`
Expected: 唯一差异是 `Only in /d/claude-dev/skills/trade-assistant: .git|.gitignore|CLAUDE.md|LICENSE|README.md`；**不得有** `Files ... differ` 行。

> 镜像的 git 仓库不做任何操作（spec §5 边界）。

## Task 11: 子 agent 复检（4 维度，逐一修复）

**Files:** 视 findings 而定（不新增文件）

- [ ] **Step 1: plugin-validator 复检插件结构**

Dispatch `plugin-dev:plugin-validator`（Agent 工具），prompt：校验 `D:\claude-dev\agents` 插件结构/manifest/agents/skills 是否符合 plugin 规范。修复其返回的结构性问题。

- [ ] **Step 2: code-reviewer 复检 MCP + scripts diff**

Dispatch `pr-review-toolkit:code-reviewer`（Agent 工具），prompt：评审 `mcp/binance-mcp-server.mjs`、`skills/trade-assistant/scripts/_lib.mjs`、`tests/` 的改动（对照 spec §3.2/3.3），找正确性 bug 与可简化点。修复返回的确认性 findings。

- [ ] **Step 3: code-simplifier 简化改动**

Dispatch `code-simplifier`（Agent 工具），prompt：对本次 MCP/lib/tests 改动做简化（保留全部功能，保持零依赖）。采纳合理的简化。

- [ ] **Step 4: skill-reviewer 复检 SKILL.md / evals / references**

Dispatch `plugin-dev:skill-reviewer`（Agent 工具），prompt：评审 `skills/trade-assistant/SKILL.md`、`evals/evals.json`（10 条）、references 结构一致性。修复返回的结构/描述问题。

- [ ] **Step 5: 复检后回归**

Run: `cd /d/claude-dev/agents && node --test tests/*.test.mjs`
Expected: 全部 PASS。

## Task 12: 最终验证 + 一次干净提交

**Files:** 全部

- [ ] **Step 1: 全量验证**

Run:
```bash
cd /d/claude-dev/agents
node --test tests/*.test.mjs
for f in skills/trade-assistant/scripts/*.mjs mcp/binance-mcp-server.mjs; do node --check "$f" || echo "FAIL $f"; done
diff -rq skills/trade-assistant /d/claude-dev/skills/trade-assistant
node -e "console.log(require('./skills/trade-assistant/evals/evals.json').evals.length)"
```
Expected: 19 个 test 全 PASS、无 FAIL、diff 仅分发专属差异、`10`。

- [ ] **Step 2: git 提交（一次干净提交）**

Run:
```bash
cd /d/claude-dev/agents
git add -A
git status
git commit -m "polish: agents trigger/description + path resolution, MCP robustness, script regression tests, evals 6->10, mirror sync"
git log --oneline -3
```
Expected: 一个实现 commit；`git status` 干净。提交内容含：agents 两个 description/example 改动（原未提交）、binance-orchestrator 路径修复、retrospective-writer 路径、docs/agents.md、MCP server 重构、`tests/`、`_lib.mjs`、evals.json（已同步镜像）。

---

## 自审记录

- **Spec 覆盖**：§3.1→Task 8；§3.2→Task 3-4；§3.3→Task 1-2/5-6/7；§3.4→Task 9；§3.5→Task 10；§3.6→Task 11；§3.7→Task 12；§3.8→已提前完成并提交（README 依赖小节）；检索维持 BM25 已确认。
- **占位符**：无 TBD/TODO；每步含完整代码与命令。
- **类型一致**：`__setCurlForTest`/`__setCliExecForTest`/`MOCK_FAPI`/`BINANCE_TEST_FAST` 在 Task 1-6 间一致；`buildToolList`/`parseCliOutput`/`_callToolImpl` 在 Task 3-4 间一致。
- **已知验证器假警告**：validate-agent.sh 不解析 multi-line block scalar，报 "description too short"，Task 8 记录为预期。
