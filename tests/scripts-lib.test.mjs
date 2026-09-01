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
// 边界阈值（volM∈{50,200}，amp∈{25,40}）与中间分（3、1），防 off-by-one
test('classify: 边界阈值 200/25→T1, 50/25→T2, 50/40→T2, 100/60→T3', () => {
  assert.equal(classify(200, 25).tier, 'T1'); // 2+2=4
  assert.equal(classify(50, 25).tier, 'T2');  // 1+2=3
  assert.equal(classify(50, 40).tier, 'T2');  // 1+1=2
  assert.equal(classify(100, 60).tier, 'T3'); // 1+0=1
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

// ---- fapi 重试耗尽：吞错回归保护 ----
test('fapi: 重试耗尽后抛出最后一次错误', async () => {
  process.env.BINANCE_TEST_FAST = '1';
  let calls = 0;
  __setCurlForTest(() => {
    calls++;
    throw new Error('always down');
  });
  try {
    await assert.rejects(fapi('/test', { retries: 3 }), /always down/);
    assert.equal(calls, 3);
  } finally {
    __setCurlForTest(null);
    delete process.env.BINANCE_TEST_FAST;
  }
});
