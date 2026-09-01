// 止损/止盈参数求解器：网格扫描 + 蒙特卡洛首触模拟，输出期望值最优组合
// 区分主流币（模型可信）与山寨/庄家币（模型打折 + 仓位折扣）
// 用法: node solve.mjs <SYMBOL> [--entry 价] [--qty 张数] [--equity 336] [--posfrac 0.25] [--type auto|main|alt] [--hours 24]
import { fapi, sleep, fmt, classify, readClassSnapshot, upsertClassSnapshot } from './_lib.mjs';

const SYM = process.argv[2];
if (!SYM) { console.error('用法: node solve.mjs <SYMBOL> [--entry 价] [--qty 张数] [--equity 336] [--posfrac 0.25] [--type auto|main|alt] [--hours 24]'); process.exit(1); }
const opt = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };

const equity = +opt('equity', 336);
const posfrac = +opt('posfrac', 0.25);
const hours = +opt('hours', 24);
const typeArg = opt('type', 'auto');

// --- 拉数据 ---
const [price, t24] = await Promise.all([
  fapi(`/fapi/v1/ticker/price?symbol=${SYM}`),
  fapi(`/fapi/v1/ticker/24hr?symbol=${SYM}`),
]);
await sleep(2000);
const kl = await fapi(`/fapi/v1/klines?symbol=${SYM}&interval=15m&limit=288`);

const S0 = +price.price;
const entry = opt('entry') ? +opt('entry') : S0;
const amp = ((+t24.highPrice - +t24.lowPrice) / +t24.lastPrice) * 100;
const volM = +t24.quoteVolume / 1e6;

// --- 币种分类（纯数据驱动：资金量 × 振幅 动态评分；优先用快照，用后刷新该币条目）---
let coinType, modelDiscount, posMult, note;
const snap = readClassSnapshot();
const cached = snap && snap.coins && snap.coins[SYM];
if (typeArg !== 'auto') {
  coinType = typeArg;
  modelDiscount = typeArg === 'main' ? 1 : typeArg === 'alt' ? 0.85 : 0.65;
  posMult = typeArg === 'main' ? 1 : typeArg === 'alt' ? 0.6 : 0.4;
  note = '手动指定';
} else if (cached && Date.now() - new Date(snap.updatedAt).getTime() < 24 * 3600 * 1000 && cached.tier) {
  // 24h 内的快照优先（每日 scan.mjs 全市场刷新），但仍用实时数据重算，快照仅作趋势参考
  const cls = classify(volM, amp);
  coinType = cls.tier; modelDiscount = cls.modelDiscount; posMult = cls.posMult;
  note = `实时评分 ${cls.score} 分（快照上次评级 ${cached.tier}${cached.tier !== cls.tier ? '，已变档!' : '，未变档'}）：${cls.label} | 资金分${cls.volScore}+振幅分${cls.ampScore}`;
} else {
  const cls = classify(volM, amp);
  coinType = cls.tier; modelDiscount = cls.modelDiscount; posMult = cls.posMult;
  note = `实时评分 ${cls.score} 分：${cls.label} | 资金分${cls.volScore}+振幅分${cls.ampScore}`;
}
{ // 更新该币在快照中的条目（动态调档）
  const cls = classify(volM, amp);
  upsertClassSnapshot(SYM, cls, volM, amp);
}

// --- 保证金与数量 ---
let qty = opt('qty') ? +opt('qty') : Math.floor((equity * posfrac * posMult * 20) / entry);
const margin = (qty * entry) / 20;
const minStopDist = Math.max(amp * 0.08, 1.5); // 插针缓冲：至少能扛住日振幅的 8%

// --- 蒙特卡洛首触模拟（先碰止损=亏，先碰目标=赚，都没碰=平局）---
const closes = kl.map((k) => +k[4]);
const rets = [];
for (let i = 1; i < closes.length; i++) rets.push(closes[i] / closes[i - 1] - 1);
const steps = Math.round(hours * 4);
const N = steps > 150 ? 30000 : 60000;

function simulate(stopDistPct, targetDistPct) {
  const stopP = entry * (1 - stopDistPct / 100);
  const targetP = entry * (1 + targetDistPct / 100);
  let win = 0, lose = 0;
  for (let n = 0; n < N; n++) {
    let p = S0;
    let hit = 0;
    for (let s = 0; s < steps; s++) {
      p *= 1 + rets[(Math.random() * rets.length) | 0];
      if (p <= stopP) { hit = -1; break; }
      if (p >= targetP) { hit = 1; break; }
    }
    if (hit === 1) win++; else if (hit === -1) lose++;
  }
  return { pWin: win / N, pLose: lose / N };
}

// --- 网格扫描 ---
const stops = [minStopDist, minStopDist * 1.3, minStopDist * 1.7, minStopDist * 2.2];
const targets = [3, 5, 7, 9, 12, 15];
const results = [];
for (const sd of stops) {
  for (const td of targets) {
    const { pWin, pLose } = simulate(sd, td);
    const effWin = pWin * modelDiscount; // 模型折扣后的保守胜率
    const gain = (entry * td / 100) * qty;
    const loss = (entry * sd / 100) * qty;
    const expectancy = effWin * gain - pLose * loss;
    results.push({ sd, td, pWin, effWin, pLose, gain, loss, expectancy });
  }
}
results.sort((a, b) => b.expectancy - a.expectancy);

// --- 输出 ---
console.log(`=== ${SYM} 止损/止盈求解器（${hours}h 蒙特卡洛首触, ${N} 路径）===`);
console.log(`现价 ${fmt(S0)} | 入场假设 ${fmt(entry)} | 24h振幅 ${amp.toFixed(0)}% | 成交 ${volM.toFixed(0)}M`);
console.log(`币种分类: ${coinType} — ${note}`);
console.log(`仓位折扣 x${posMult} → 实际仓位 ${(posfrac * posMult * 100).toFixed(0)}% (${margin.toFixed(1)}U 保证金, ${qty} 张, 名义 ${(qty * entry).toFixed(0)}U)`);
console.log(`最小止损距离 ${minStopDist.toFixed(1)}%（插针缓冲 = 日振幅×8%）\n`);

console.log('排名  止损%   止盈%   模型胜率  折后胜率  止损概率  盈利U   亏损U   期望U');
results.slice(0, 6).forEach((r, i) => {
  console.log(
    `${String(i + 1).padStart(3)}   ${r.sd.toFixed(1).padStart(5)}  ${r.td.toFixed(1).padStart(5)}   ${(r.pWin * 100).toFixed(1).padStart(6)}%  ${(r.effWin * 100).toFixed(1).padStart(6)}%  ${(r.pLose * 100).toFixed(1).padStart(6)}%  ${r.gain.toFixed(1).padStart(5)}  ${(-r.loss).toFixed(1).padStart(6)}  ${r.expectancy.toFixed(1).padStart(6)}`
  );
});

const best = results[0];

// --- 概率止损位：给定触达概率上限，反推最紧止损距离 ---
// 用途：高胜率持仓可以把止损放宽到"几乎不可能被碰到"的位置，而不是固定百分比
const pstopThreshold = opt('pstop') ? +opt('pstop') : undefined;
if (pstopThreshold) {
  // 用当前价 S0（而非 entry）衡量：持仓者关心的是"从这里再跌到哪的概率"
  let tight = null;
  for (let dPct = 0.5; dPct <= 30; dPct += 0.25) {
    const stopP = S0 * (1 - dPct / 100);
    let touch = 0;
    for (let n = 0; n < 60000; n++) {
      let p = S0;
      for (let s = 0; s < steps; s++) {
        p *= 1 + rets[(Math.random() * rets.length) | 0];
        if (p <= stopP) { touch++; break; }
      }
    }
    if (touch / 60000 <= pstopThreshold) { tight = dPct; break; }
  }
  if (tight !== null) {
    console.log(`\n★ 概率止损位（${hours}h 内触达概率 ≤ ${(pstopThreshold * 100).toFixed(0)}%）:`);
    console.log(`  止损挂 ${fmt(S0 * (1 - tight / 100))}（现价下方 ${tight.toFixed(2)}%）`);
    console.log('  这是"被碰到"概率极低的位置——适合高确定性持仓，把止损放在针够不着的地方。');
  } else {
    console.log(`\n⚠ 30% 跌幅内找不到触达概率 ≤ ${(pstopThreshold * 100).toFixed(0)}% 的位置——该币波动太大，概率止损不适用，用资金止损（6%红线）。`);
  }
}

console.log('\n★ 推荐参数（期望值最高）:');
console.log(`  止损: ${fmt(entry * (1 - best.sd / 100))} (-${best.sd.toFixed(1)}%)`);
console.log(`  止盈: ${fmt(entry * (1 + best.td / 100))} (+${best.td.toFixed(1)}%)`);
console.log(`  折后胜率 ${(best.effWin * 100).toFixed(0)}% | 单笔最大亏损 ${best.loss.toFixed(1)}U (${(best.loss / equity * 100).toFixed(1)}% 账户)`);
console.log(`  期望值 ${best.expectancy.toFixed(1)}U/单`);
if (best.loss / equity > 0.06) {
  const maxQty = Math.floor((equity * 0.06) / (entry * best.sd / 100));
  console.log(`  ⚠ 该组合单笔亏损超总资金6%红线`);
  console.log(`  ✓ 符合红线的建议数量: ${maxQty} 张 (原 ${qty} 张, 仓位降至 ${(maxQty / qty * 100).toFixed(0)}%)`);
  console.log(`    缩仓后: 最大亏损 ${((entry * best.sd / 100) * maxQty).toFixed(1)}U | 止盈收益 ${((entry * best.td / 100) * maxQty).toFixed(1)}U`);
}
console.log('\n⚠ 免责: 庄家币上模型失效，概率仅供交叉验证，最终以 05 文档博弈论判断为准。');
