// 单币体检：现价/24h/费率/大户多空比/15m量价/盘口墙/近期区间
// 用法: node coin.mjs ARBUSDT [--m 48]
import { fapi, sleep, fmt, pct } from './_lib.mjs';

const SYM = process.argv[2];
if (!SYM) { console.error('用法: node coin.mjs <SYMBOL> 例如 ARBUSDT'); process.exit(1); }

// --- 现价 + 24h ---
const [price, t24] = await Promise.all([
  fapi(`/fapi/v1/ticker/price?symbol=${SYM}`),
  fapi(`/fapi/v1/ticker/24hr?symbol=${SYM}`),
]);
const cur = +price.price;
console.log(`=== ${SYM} 体检 ===`);
console.log(`现价: ${fmt(cur)} | 24h: ${+t24.priceChangePercent > 0 ? '+' : ''}${t24.priceChangePercent}% 振幅${((+t24.highPrice - +t24.lowPrice) / cur * 100).toFixed(0)}% 额${(+t24.quoteVolume / 1e6).toFixed(0)}M`);
console.log(`24h 高/低: ${fmt(t24.highPrice)} / ${fmt(t24.lowPrice)}`);

await sleep(2500);

// --- 资金费率 ---
try {
  const fr = await fapi(`/fapi/v1/fundingRate?symbol=${SYM}&limit=3`);
  console.log('\n资金费率:');
  fr.forEach((f) => console.log(`  ${new Date(+f.fundingTime).toISOString().slice(5, 16)} ${(f.fundingRate * 100).toFixed(4)}%`));
  const last = +fr[fr.length - 1].fundingRate;
  if (last < -0.001) console.log('  → 空头拥挤付费中（做多信号 S1 的燃料条件）');
  else if (last > 0.0015) console.log('  → 多头过热（做多危险，S5 做空条件）');
} catch (e) { console.log('费率获取失败:', e.message); }

await sleep(2500);

// --- 大户持仓多空比 ---
try {
  const lr = await fapi(`/futures/data/topLongShortPositionRatio?symbol=${SYM}&period=1h&limit=3`);
  console.log('\n大户持仓多空比:');
  lr.forEach((x) => console.log(`  ${x.longShortRatio} (多${(x.longAccount * 100).toFixed(0)}%)`));
} catch (e) { console.log('大户比率获取失败（部分新币无数据）'); }

await sleep(2500);

// --- 15m K线量价 ---
const kl = await fapi(`/fapi/v1/klines?symbol=${SYM}&interval=15m&limit=48`);
const vols = kl.map((k) => +k[5]);
const avgV = vols.slice(0, -1).reduce((a, b) => a + b, 0) / (vols.length - 1);
console.log('\n近12根15m（★量/均量>1.5 放量, <0.5 缩量）:');
kl.slice(-12).forEach((k) => {
  const o = +k[1], c = +k[4], v = +k[5];
  const r = v / avgV;
  console.log(
    `  ${new Date(+k[0]).toISOString().slice(11, 16)} ${o > c ? '▼' : '▲'}${Math.abs((c - o) / o * 100).toFixed(1)}% 收${fmt(c)} 量${(v / 1e6).toFixed(1)}M${r > 1.5 ? ' ★放量' : r < 0.5 ? ' (缩量)' : ''}`
  );
});
const hi12 = Math.max(...kl.slice(-12).map((k) => +k[2]));
const lo12 = Math.min(...kl.slice(-12).map((k) => +k[3]));
console.log(`3小时区间: ${fmt(lo12)} - ${fmt(hi12)} (现价${pct(cur, lo12)}高于区间低, ${pct(hi12, cur)}低于区间高)`);

await sleep(2500);

// --- 盘口墙 ---
try {
  const d = await fapi(`/fapi/v1/depth?symbol=${SYM}&limit=10`);
  const bs = d.bids.reduce((a, b) => a + +b[1], 0);
  const as = d.asks.reduce((a, b) => a + +b[1], 0);
  const bU = bs * +d.bids[0][0], aU = as * +d.asks[0][0];
  console.log('\n盘口(前10档):');
  console.log(`  买盘 ${bU.toFixed(0)}U | 卖盘 ${aU.toFixed(0)}U | 比值 ${(bs / as).toFixed(2)}`);
  console.log(`  买1: ${d.bids[0][0]} x ${Math.round(+d.bids[0][1])}`);
  console.log(`  卖1: ${d.asks[0][0]} x ${Math.round(+d.asks[0][1])}`);
  const bigBid = d.bids.reduce((m, b) => (+b[1] > +m[1] ? b : m));
  const bigAsk = d.asks.reduce((m, a) => (+a[1] > +m[1] ? a : m));
  if (+bigBid[1] > 5000) console.log(`  ⚠ 买墙: ${bigBid[0]} x ${Math.round(+bigBid[1])} (≈${(+bigBid[1] * +bigBid[0]).toFixed(0)}U)`);
  if (+bigAsk[1] > 5000) console.log(`  ⚠ 卖墙: ${bigAsk[0]} x ${Math.round(+bigAsk[1])} (≈${(+bigAsk[1] * +bigAsk[0]).toFixed(0)}U)`);
} catch (e) { console.log('盘口获取失败:', e.message); }
