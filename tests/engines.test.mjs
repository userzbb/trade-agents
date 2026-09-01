import { test } from 'node:test';
import assert from 'node:assert/strict';
import { row, fmtTable } from '../skills/trade-assistant/scripts/engines.mjs';

test('engines: row 构造', () => {
  const r = row('Freqtrade', '状态', 'running');
  assert.deepEqual(r, { engine: 'Freqtrade', field: '状态', value: 'running' });
});

test('engines: fmtTable 输出中文对齐表', () => {
  const out = fmtTable([row('Freqtrade', '状态', '0 持仓'), row('Hummingbot', '账户', '0 持仓')]);
  assert.match(out, /Freqtrade/);
  assert.match(out, /Hummingbot/);
  assert.match(out, /0 持仓/);
  assert.match(out, /引擎\s+字段\s+值/);
});
