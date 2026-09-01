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
