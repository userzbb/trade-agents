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
test('写工具无 confirm → 全部抛错（place_order/set_stop_loss/cancel_order）', async () => {
  mcp.__setCliExecForTest(() => { throw new Error('不应触达 CLI'); }); // fail-fast：守卫失效会立即暴露
  try {
    await assert.rejects(
      mcp.callTool('place_order', { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '1' }),
      /confirm=true/
    );
    await assert.rejects(
      mcp.callTool('set_stop_loss', { symbol: 'BTCUSDT', triggerPrice: '60000', quantity: '1' }),
      /confirm=true/
    );
    await assert.rejects(
      mcp.callTool('cancel_order', { symbol: 'BTCUSDT', orderId: '123' }),
      /confirm=true/
    );
  } finally {
    mcp.__setCliExecForTest(null);
  }
});
test('place_order 带 confirm → 组装 argv 并成功', async () => {
  mcp.__setCliExecForTest((file, args, opts, cb) => {
    if (process.platform === 'win32') {
      assert.equal(file, 'cmd.exe');
      assert.deepEqual(args, ['/c', 'binance-cli.cmd', 'futures-usds', 'new-order', '--symbol', 'BTCUSDT', '--side', 'BUY', '--type', 'MARKET', '--quantity', '1']);
    } else {
      assert.equal(file, 'binance-cli');
      assert.deepEqual(args, ['futures-usds', 'new-order', '--symbol', 'BTCUSDT', '--side', 'BUY', '--type', 'MARKET', '--quantity', '1']);
    }
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
