import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBacktestResult } from '../skills/trade-assistant/scripts/backtest.mjs';

const sample = {
  results: {
    net_pnl_quote: 125.5,
    net_pnl_pct: 0.025,
    max_drawdown_usd: 80,
    max_drawdown_pct: 0.08,
    sharpe_ratio: 1.2,
    total_volume: 50000,
  },
};

test('backtest: parseBacktestResult 解析净盈亏/回撤/Sharpe', () => {
  const r = parseBacktestResult(JSON.stringify(sample));
  assert.match(r.netPnl, /125\.50 USDT/);
  assert.match(r.netPnlPct, /2\.50%/);
  assert.match(r.maxDrawdown, /8\.00%/);
  assert.equal(r.sharpe, '1.20');
  assert.match(r.volume, /50000 USDT/);
});
