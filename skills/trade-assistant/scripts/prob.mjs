// 蒙特卡洛概率：用真实15m收益分布模拟，计算触达目标/止损/强平的概率
// 用法: node prob.mjs <SYMBOL> <entry> <qty> <targetU 或 target=价格> [--stop 价] [--liq 价] [--hours 14,24,48]
// 示例: node prob.mjs ARBUSDT 0.11375 11331 50 --stop 0.1110 --liq 0.0846
import { fapi } from './_lib.mjs';

const [SYM, entryStr, qtyStr, targetArg] = process.argv.slice(2);
const opt = (name) => {
  const i = process.argv.indexOf('--' + name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
if (!SYM || !entryStr || !qtyStr || !targetArg) {
  console.error('用法: node prob.mjs <SYMBOL> <entry> <qty> <targetU|target=价> [--stop 价] [--liq 价]');
  process.exit(1);
}

const entry = +entryStr, qty = +qtyStr;
const target = targetArg.startsWith('target=') ? +targetArg.slice(7) : entry + +targetArg / qty;
const stop = opt('stop') ? +opt('stop') : undefined;
const liq = opt('liq') ? +opt('liq') : undefined;
const hours = (opt('hours') || '14,24,48').split(',').map(Number);

const kl = await fapi(`/fapi/v1/klines?symbol=${SYM}&interval=15m&limit=288`); // 72小时
const closes = kl.map((k) => +k[4]);
const rets = [];
for (let i = 1; i < closes.length; i++) rets.push(closes[i] / closes[i - 1] - 1);
const S0 = closes[closes.length - 1];

console.log(`=== ${SYM} 蒙特卡洛（真实15m收益分布 bootstrap）===`);
console.log(`现价 ${S0.toPrecision(5)} | 开仓 ${entry} | 目标 ${target.toPrecision(5)} (需涨${((target / S0 - 1) * 100).toFixed(1)}%)`);
if (stop) console.log(`止损 ${stop} (需跌${((stop / S0 - 1) * 100).toFixed(1)}%)${S0 <= stop ? '  ⚠ 现价已在止损位下方（该止损实际已触发/应已离场）' : ''}`);
if (liq) console.log(`强平 ${liq} (需跌${((liq / S0 - 1) * 100).toFixed(1)}%)`);

function mc(steps, N, p) {
  let hi = 0, lo = 0, loStop = 0, loLiq = 0;
  for (let n = 0; n < N; n++) {
    let price = S0, maxP = S0, minP = S0;
    for (let s = 0; s < steps; s++) {
      price *= 1 + rets[(Math.random() * rets.length) | 0];
      if (price > maxP) maxP = price;
      if (price < minP) minP = price;
    }
    if (maxP >= p) hi++;
    if (minP <= p) lo++;
    if (stop && minP <= stop) loStop++;
    if (liq && minP <= liq) loLiq++;
  }
  return { hi: (hi / N) * 100, lo: (lo / N) * 100, loStop: (loStop / N) * 100, loLiq: (loLiq / N) * 100 };
}

console.log('\n时长   触达目标   触达止损' + (liq ? '   触达强平' : ''));
for (const h of hours) {
  const steps = Math.round(h * 4);
  const N = steps > 150 ? 40000 : 100000;
  const r = mc(steps, N, target);
  let line = `${String(h).padStart(3)}h   ${(r.hi).toFixed(1).padStart(6)}%`;
  if (stop) line += `   ${(r.loStop).toFixed(2).padStart(7)}%`;
  if (liq) line += `   ${(r.loLiq).toFixed(2).padStart(7)}%`;
  console.log(line);
}

console.log('\n⚠ 免责: 模型基于历史波动，假设区间震荡延续。庄家控盘币(见05文档)上失效，主流币参考价值高。');
