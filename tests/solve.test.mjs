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
  // 288 根 15m K 线，收盘价小幅上行（确定性）
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
    assert.match(out, /仓位折扣 x1/);
    assert.match(out, /排名/);
    assert.match(out, /★ 推荐参数/);
    assert.match(out, /止损:/);
    assert.match(out, /止盈:/);
    assert.match(out, /期望值/);
    assert.match(out, /免责/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
