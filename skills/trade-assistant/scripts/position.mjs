// 持仓速览：余额 + 持仓明细（含盈亏/强平距离）+ 挂单
// 用法: node position.mjs
import { exec } from 'child_process';
import { PROXY } from './_lib.mjs';

const env = { ...process.env, HTTPS_PROXY: PROXY, HTTP_PROXY: PROXY };

function cli(cmd, { retries = 4 } = {}) {
  return new Promise((resolve, reject) => {
    let attempt = 0;
    const run = () => {
      exec(cmd, { env, timeout: 45000, maxBuffer: 16 * 1024 * 1024 }, (err, stdout) => {
        const out = (stdout || '').trim();
        if (!err && out && !/failed|recvWindow|Way too many/i.test(out)) {
          const start = out.search(/[[{]/);
          try { return resolve(JSON.parse(out.slice(start))); } catch { /* fallthrough */ }
        }
        if (++attempt < retries) return setTimeout(run, 6000);
        reject(new Error(out || err?.message || 'cli failed'));
      });
    };
    run();
  });
}

// --- 余额与持仓 ---
const acct = await cli('binance-cli futures-usds account-information-v2');
console.log('=== 账户 ===');
console.log(`总余额: ${(+acct.totalWalletBalance).toFixed(2)} USDT | 可用: ${(+acct.availableBalance).toFixed(2)} | 未实现盈亏: ${(+acct.totalUnrealizedProfit).toFixed(2)}`);

const positions = (acct.positions || []).filter((p) => +p.positionAmt !== 0);
console.log(`\n=== 持仓 (${positions.length}) ===`);
if (!positions.length) console.log('无持仓');
for (const p of positions) {
  const pnl = (+p.markPrice - +p.entryPrice) * +p.positionAmt;
  const liqDist = p.liquidationPrice && +p.liquidationPrice > 0
    ? (((+p.liquidationPrice / +p.markPrice) - 1) * 100).toFixed(1) + '%'
    : '?';
  console.log(
    `${p.symbol} ${+p.positionAmt > 0 ? '多' : '空'} ${Math.abs(+p.positionAmt)}张 | 开仓 ${p.entryPrice} | 标记 ${p.markPrice}\n` +
    `  盈亏 ${pnl.toFixed(2)}U (${((+p.markPrice / +p.entryPrice - 1) * 100).toFixed(2)}%) | 强平 ${p.liquidationPrice} (距${liqDist}) | 杠杆 ${p.leverage}x ${p.marginType || ''}`
  );
}

// --- 挂单 ---
try {
  const orders = await cli('binance-cli futures-usds current-all-open-orders');
  console.log(`\n=== 挂单 (${orders.length}) ===`);
  if (!orders.length) console.log('无挂单 ⚠ 若有持仓则处于无保护状态');
  orders.forEach((o) =>
    console.log(`${o.symbol} ${o.side} ${o.type} 价${o.price} 量${o.origQty}${o.stopPrice ? ' 触发' + o.stopPrice : ''} ${o.reduceOnly ? '[reduceOnly]' : ''}`)
  );
} catch (e) {
  console.log('\n挂单查询失败:', e.message);
}
