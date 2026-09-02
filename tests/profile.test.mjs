import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PROFILE_CLI = join(ROOT, 'skills', 'trade-assistant', 'scripts', 'profile.mjs');
const SOLVE = join(ROOT, 'skills', 'trade-assistant', 'scripts', 'solve.mjs');

// _lib 在模块加载时读 TRADE_HOME → 必须先设 env 再动态 import
const dir = mkdtempSync(join(tmpdir(), 'profile-test-'));
process.env.TRADE_HOME = join(dir, 'trade');
mkdirSync(process.env.TRADE_HOME, { recursive: true });
const lib = await import('../skills/trade-assistant/scripts/_lib.mjs');
const PROF_FILE = join(process.env.TRADE_HOME, 'strategy-profile.json');

test.after(() => rmSync(dir, { recursive: true, force: true }));

function cli(args, env = {}) {
  return execFileSync('node', [PROFILE_CLI, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
}

test('profile: 无档案 → 默认值 + _applied=false', () => {
  assert.equal(lib.readStrategyProfile(), null);
  const p = lib.strategyProfile();
  assert.equal(p.equity, 336);
  assert.equal(p.leverage, 20);
  assert.equal(p.positionStyle.mainNormalPct, 0.25);
  assert.equal(p.risk.perTradeCapPct, 0.06);
  assert.equal(p.risk.dailyCircuitBreakerPct, 0.08);
  assert.equal(p._applied, false);
});

test('profile: write → round-trip 读回（缺省回退）', () => {
  lib.writeStrategyProfile({ equity: 500 });
  const p = lib.strategyProfile();
  assert.equal(p.equity, 500);          // 覆盖
  assert.equal(p.leverage, 20);         // 未给 → 默认
  assert.equal(p._applied, true);
  const raw = lib.readStrategyProfile();
  assert.equal(raw.schema, 1);
  assert.ok(raw.updatedAt);
});

test('profile: 部分档案逐字段回退', () => {
  lib.writeStrategyProfile({ equity: 600, risk: { perTradeCapPct: 0.05 } });
  const p = lib.strategyProfile();
  assert.equal(p.equity, 600);
  assert.equal(p.risk.perTradeCapPct, 0.05);
  assert.equal(p.risk.dailyCircuitBreakerPct, 0.08);  // 未给 → 默认
  assert.equal(p.leverage, 20);
});

test('profile: validate 拒绝放宽硬 8% 日熔断', () => {
  const { errs } = lib.validateStrategyProfile({
    equity: 500, leverage: 20,
    positionStyle: { mainPct: 0.8, lotteryPct: 0.2, mainNormalPct: 0.25, lotteryPerTradePct: 0.05 },
    risk: { perTradeCapPct: 0.06, dailyCircuitBreakerPct: 0.10 },
  });
  assert.ok(errs.some((e) => e.includes('8%')), `errs 应含 8% 硬停: ${errs}`);
});

test('profile: strategyProfile 把存盘 0.10 日熔断 clamp 到 0.08', () => {
  lib.writeStrategyProfile({ risk: { dailyCircuitBreakerPct: 0.10 } });
  const p = lib.strategyProfile();
  assert.equal(p.risk.dailyCircuitBreakerPct, 0.08);
});

test('profile: perTradeCap 0.03 能流过', () => {
  lib.writeStrategyProfile({ risk: { perTradeCapPct: 0.03 } });
  const p = lib.strategyProfile();
  assert.equal(p.risk.perTradeCapPct, 0.03);
});

test('profile CLI: set 保存 + view 反映；>6% 警告；clear 恢复', () => {
  // 全新临时 TRADE_HOME
  const d2 = mkdtempSync(join(tmpdir(), 'profile-cli-'));
  try {
    const th = join(d2, 'trade');
    const env = { TRADE_HOME: th };
    const v0 = cli(['view'], env);
    assert.match(v0, /未配置策略档案/);

    cli(['set', '--equity', '500', '--per-trade-cap-pct', '0.05'], env);
    const v1 = cli(['view'], env);
    assert.match(v1, /500 U/);
    assert.match(v1, /5%/);
    assert.match(v1, /单笔上限 25 U/); // 500×0.05

    // 放宽到 6% 以上 → 警告但仍写
    const v2 = cli(['set', '--per-trade-cap-pct', '0.07'], env);
    assert.match(v2, /警告/);

    // 日熔断 >8% → 错误 exit 1
    assert.throws(() => cli(['set', '--daily-cb-pct', '0.10'], env), /8%/);

    cli(['clear'], env);
    const v3 = cli(['view'], env);
    assert.match(v3, /未配置策略档案/);
  } finally {
    rmSync(d2, { recursive: true, force: true });
  }
});

test('solve with profile: 无 --equity 读档案 500U / 5% 红线（MOCK，零网络）', () => {
  // 用 solve.test.mjs 同款 fixture
  const kl = Array.from({ length: 288 }, (_, i) => {
    const c = 60000 * (1 + 0.0004 * i);
    return [i, (c * 0.999).toFixed(1), (c * 1.001).toFixed(1), (c * 0.998).toFixed(1), c.toFixed(1), '10', i, 0, 0, 0, 0, 0];
  });
  const fixture = {
    '/fapi/v1/ticker/price?symbol=BTCUSDT': JSON.stringify({ symbol: 'BTCUSDT', price: '60000.0' }),
    '/fapi/v1/ticker/24hr?symbol=BTCUSDT': JSON.stringify({ highPrice: '61000', lowPrice: '58000', lastPrice: '60000', quoteVolume: '5000000000' }),
    '/fapi/v1/klines?symbol=BTCUSDT&interval=15m&limit=288': JSON.stringify(kl),
  };
  const d3 = mkdtempSync(join(tmpdir(), 'solve-prof-'));
  try {
    const th = join(d3, 'trade');
    mkdirSync(th, { recursive: true });
    writeFileSync(join(th, 'fixture.json'), JSON.stringify(fixture));
    writeFileSync(join(th, 'strategy-profile.json'), JSON.stringify({
      schema: 1, equity: 500, leverage: 20,
      positionStyle: { mainNormalPct: 0.25 }, risk: { perTradeCapPct: 0.05 },
    }));
    const out = execFileSync('node', [SOLVE, 'BTCUSDT', '--qty', '10', '--entry', '60000', '--hours', '8'], {
      encoding: 'utf8',
      env: { ...process.env, MOCK_FAPI: join(th, 'fixture.json'), TRADE_HOME: th, BINANCE_TEST_FAST: '1' },
    });
    assert.match(out, /策略档案已应用/);
    assert.match(out, /500U/);
    assert.match(out, /5%/);
    assert.match(out, /币种分类: T1/);
  } finally {
    rmSync(d3, { recursive: true, force: true });
  }
});
