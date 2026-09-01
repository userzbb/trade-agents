// 金字塔加仓引擎：小仓位试探 → 确认后分批加仓 → 动态风控
// 用法: node pyramid.mjs <SYMBOL> <side> --equity <U> [--tier T1|T2|T3]
// 输出：分 3 批的进场计划（试探/加仓1/加仓2）、每批条件、总仓位、综合止损
import { fapi, fmt, classify } from './_lib.mjs';

const SYM = process.argv[2], SIDE = (process.argv[3] || '').toUpperCase();
const opt = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const equity = +opt('equity', 336);
const tier = opt('tier', 'auto');
if (!SYM || (SIDE !== 'LONG' && SIDE !== 'SHORT')) {
  console.error('用法: node pyramid.mjs <SYMBOL> <LONG|SHORT> --equity 336 [--tier T1|T2|T3]'); process.exit(1);
}

const [price, t24] = await Promise.all([
  fapi(`/fapi/v1/ticker/price?symbol=${SYM}`),
  fapi(`/fapi/v1/ticker/24hr?symbol=${SYM}`),
]);
const cur = +price.price;
const amp = ((+t24.highPrice - +t24.lowPrice) / +t24.lastPrice) * 100;
const volM = +t24.quoteVolume / 1e6;
const cls = tier === 'auto' ? classify(volM, amp) : { tier, modelDiscount: tier === 'T1' ? 1 : tier === 'T2' ? 0.85 : 0.65, posMult: tier === 'T1' ? 1 : tier === 'T2' ? 0.6 : 0.4 };

console.log(`=== ${SYM} 金字塔加仓计划（${SIDE}）===`);
console.log(`现价 ${fmt(cur)} | 账户 ${equity}U | 分级 ${cls.tier}（仓位系数 ×${cls.posMult}）`);

// ---- 金字塔仓位结构（保证金占总资金比例，分批进场）----
// 试探仓 2% → 确认仓 +6%（累计 8%）→ 趋势仓 +12%（累计 20%）
const base = {
  probe: 0.02,   // 第一批：试探（信号出现，未确认）
  add1: 0.06,    // 第二批：确认后加仓
  add2: 0.12,    // 第三批：趋势确立后加满
};
// T 分级调整最大仓位
const maxTotal = (0.20) * cls.posMult;  // T1=20%, T2=12%, T3=8%
// 按比例缩放各批
const scale = maxTotal / (base.probe + base.add1 + base.add2);
const batches = [
  { name: '试探仓', marginPct: base.probe * scale, trigger: '信号 S1-S6 首次出现（资金面+技术面初判）', stopFrom: 0.03 },
  { name: '加仓1', marginPct: base.add1 * scale, trigger: SIDE === 'LONG' ? '价格突破试探仓入场价 +1×ATR 且 MACD 同向/RSI 站上 50' : '跌破入场价 -1×ATR 且 MACD 死叉', stopFrom: 0.025 },
  { name: '加仓2', marginPct: base.add2 * scale, trigger: SIDE === 'LONG' ? '回踩不破前批高点 + 放量再创新高（趋势确立）' : '反弹不破前批低点 + 放量再创新低', stopFrom: 0.02 },
];

let cumMargin = 0, cumNotional = 0, wSum = 0, totalQty = 0;
console.log(`\n分批计划（${SIDE}，20x 逐仓）:`);
console.log('批次        保证金   名义     累计保证金  进场条件');
batches.forEach((b, i) => {
  const margin = equity * b.marginPct;
  const notional = margin * 20;
  const qty = notional / cur;
  cumMargin += margin; cumNotional += notional; totalQty += qty;
  // 加权平均成本（近似都按现价计，实际第二批价位更优/更差）
  wSum += qty;
  const dir = SIDE === 'LONG' ? '↑' : '↓';
  console.log(`${b.name.padEnd(6)}  ${margin.toFixed(1)}U    ${notional.toFixed(0)}U    ${cumMargin.toFixed(1)}U     ${dir} ${b.trigger}`);
});
const avgEntry = cumNotional / totalQty;
console.log(`\n合计: 保证金 ${cumMargin.toFixed(1)}U（占账户 ${(cumMargin / equity * 100).toFixed(1)}%）| 总名义 ${cumNotional.toFixed(0)}U | 约 ${Math.round(totalQty)} 张`);

// ---- 各批止损 → 综合风险 ----
// 每批止损距离随确认度收紧；试探仓最宽（给波动空间），加满后整体止损最近
const atrPct = amp / 100 * 0.15; // ATR 近似（日振幅的 15% 作为每批缓冲基准）
const probeStop = SIDE === 'LONG' ? cur * (1 - 0.04) : cur * (1 + 0.04);
const overallStop = SIDE === 'LONG' ? cur * (1 - (0.025)) : cur * (1 + 0.025);
const worstLoss = cumNotional * (SIDE === 'LONG' ? (avgEntry - overallStop) / avgEntry : (overallStop - avgEntry) / avgEntry);
console.log(`\n风控线:`);
console.log(`试探仓止损: ${fmt(probeStop)}（-4%，最宽，给试错空间）`);
console.log(`加满后综合止损（移动）: ${fmt(overallStop)}（-2.5%，紧）`);
console.log(`最大单笔风险（综合止损触发）: ${worstLoss.toFixed(1)}U = 账户 ${(worstLoss / equity * 100).toFixed(1)}% ${worstLoss / equity > 0.06 ? '⚠ 超 6% 红线，需缩批' : '✓ 在 6% 红线内'}`);
console.log(`爆仓距离参考: 20x 下约 ${(1/20*0.9*100).toFixed(0)}% 反向（分批建仓实际更强）`);

// ---- 盈利目标（移动止盈）----
const tp1 = SIDE === 'LONG' ? cur * 1.05 : cur * 0.95;
const tp2 = SIDE === 'LONG' ? cur * 1.10 : cur * 0.90;
const profitAtTp1 = cumNotional * 0.05, profitAtTp2 = cumNotional * 0.10;
console.log(`\n止盈（移动）: 目标1 ${fmt(tp1)}（+5% → ${profitAtTp1.toFixed(0)}U 平 1/3）| 目标2 ${fmt(tp2)}（+10% → ${profitAtTp2.toFixed(0)}U 平 1/3，余 1/3 移动止盈）`);

console.log(`\n=== 三层共振进场检查（每一批都要过）===`);
console.log('第1层 算法/技术面(ta.mjs): RSI 不逆势 + MACD 同向 + EMA 排列支持');
console.log('第2层 资金/博弈面(coin.mjs): 费率不拥挤 + 盘口墙方向 + 大户比率');
console.log('第3层 博弈心理: 不是追在全网热议(派发)、不在恐慌抛售末端接刀；试探仓=用小钱验证判断');
console.log('规则: 只有前一层确认才允许下一批；任何一层反向 → 不加仓，试探仓直接止损（亏 2% 试错成本）');
