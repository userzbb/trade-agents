// 收益计划制定器：以历史真实盈亏为基准，校验用户目标可行性，生成多套数学上诚实的方案
// 用法: node plan.mjs --target 2000 --days 30 --equity 336
//   --target: 目标终值(U) 或倍数(如 2 即翻倍)
//   --days: 计划周期天数（默认30）
//   --equity: 当前账户净值（默认从 daily_pnl 最新累计 + 初始推算，建议手动传）
import { db } from './db.mjs';

const opt = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const targetArg = opt('target');
const horizon = +opt('days', 30);
let equity = opt('equity') ? +opt('equity') : null;

// --- 历史日收益序列（交易所流水真源）---
const daily = db.prepare('SELECT date, net, realized, commission, funding FROM daily_pnl ORDER BY date').all();
if (daily.length < 5) {
  console.log(`⚠ 历史数据不足（仅 ${daily.length} 天，需 ≥5 天）。`);
  console.log('  先跑 sync.mjs --days 30 积累数据；在此之前无法给出有统计效力的计划，');
  console.log('  任何"日化收益"参数都只是理论推演，不具备校准效力。');
  process.exit(0);
}

// 净值基准：若未指定 equity，用 (最新累计净盈亏的相反数 + 最新可用估算) 不可靠 → 要求显式传入
if (!equity) {
  console.log('⚠ 请传 --equity 当前账户净值（U），否则收益百分比无基准。');
  process.exit(0);
}

// 日收益率 = 当日净盈亏 / 当日起始净值（用前一日累计近似；首日用当前净值）
const rets = [];
{
  let base = equity - daily.reduce((a, r) => a + r.net, 0); // 期初净值估计
  for (const r of daily) {
    if (base > 0) rets.push(r.net / base);
    base += r.net;
  }
}
const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1));
const posRate = rets.filter((r) => r > 0).length / rets.length;
const bestD = Math.max(...rets), worstD = Math.min(...rets);

// --- 目标解析与可行性判定 ---
const target = targetArg.includes('x') || +targetArg < 10 ? equity * +targetArg : +targetArg;
const reqTotal = target / equity - 1;
const reqDaily = Math.pow(target / equity, 1 / horizon) - 1;

console.log(`=== 收益计划可行性分析 ===`);
console.log(`当前净值: ${equity}U | 目标: ${target}U (${(reqTotal * 100).toFixed(0)}%) | 周期: ${horizon} 天`);
console.log(`需要日均: ${(reqDaily * 100).toFixed(2)}%/天 复利\n`);

console.log(`--- 你的历史真实数据（${daily.length} 天，交易所流水）---`);
console.log(`日均收益: ${(mean * 100).toFixed(2)}% | 日波动 σ: ${(sd * 100).toFixed(2)}% | 盈利日占比: ${(posRate * 100).toFixed(0)}%`);
console.log(`最好一天: ${(bestD * 100).toFixed(1)}% | 最差一天: ${(worstD * 100).toFixed(1)}%\n`);

// --- 目标判定：需要日均 vs 历史日均 的比值 + bootstrap 概率 ---
function bootstrapProb(scale) {
  // 假设未来日收益 = 历史日收益 × scale（scale 由仓位/频率调整近似）
  let hit = 0, dd20 = 0, loseMonth = 0;
  const N = 20000;
  for (let n = 0; n < N; n++) {
    let eq = equity;
    let hitFlag = false, dd = 0, peak = equity;
    for (let d = 0; d < horizon; d++) {
      const r = rets[(Math.random() * rets.length) | 0] * scale;
      eq *= 1 + r;
      peak = Math.max(peak, eq);
      dd = Math.max(dd, (peak - eq) / peak);
      if (!hitFlag && eq >= target) hitFlag = true;
    }
    if (hitFlag) hit++;
    if (dd > 0.2) dd20++;
    if (eq < equity) loseMonth++;
  }
  return { pHit: hit / N, pDD: dd20 / N, pLose: loseMonth / N };
}

const ratio = reqDaily / mean;
let verdict, scale;
if (mean <= 0) {
  verdict = '❌ 历史日均收益为负——先解决策略问题，再谈目标。任何正收益计划都建立在你先恢复正期望之上。';
  scale = 0.7;
} else if (ratio <= 0.8) {
  verdict = '✅ 目标低于你已证明过的日均能力，大概率可达成（仍要防回撤）。';
  scale = 1.0;
} else if (ratio <= 1.5) {
  verdict = '⚠ 目标略高于历史日均，需行情配合 + 满执行，属"努力可及"。';
  scale = 1.15;
} else if (ratio <= 3) {
  verdict = '⚠️ 目标是历史日均的 1.5~3 倍——只有连续出现最好级别行情才可能，属"赌行情"。';
  scale = 1.5;
} else {
  verdict = '❌ 目标是历史日均的 3 倍以上——按你的真实数据，这在小样本里接近不可能，不是努力问题，是数学问题。';
  scale = 2.5;
}
console.log(`判定: ${verdict}`);
console.log(`(需要日均 ${(reqDaily * 100).toFixed(2)}% ÷ 历史日均 ${(mean * 100).toFixed(2)}% = ${ratio.toFixed(1)} 倍)\n`);

// --- 三套方案 ---
const plans = [
  { name: 'A 稳健', s: 0.7, desc: '降仓降频：仓位降至历史水平的 70%，只打 T1/T2 币种、S2/S6 信号，单日亏 5% 收工' },
  { name: 'B 延续', s: 1.0, desc: '照旧执行：维持当前仓位体系（25%/阶梯），严格按 00-06 文档纪律' },
  { name: 'C 激进', s: 1.5, desc: '加重进攻：仓位上浮 50%（连赚期 30%+），代价是回撤同比例放大，仅适合连赚期' },
];
console.log(`--- 三套方案（bootstrap ${'20000'} 路径，未来 ${horizon} 天）---`);
for (const p of plans) {
  const r = bootstrapProb(p.s);
  const expEnd = equity * Math.pow(1 + mean * p.s, horizon);
  console.log(`\n【${p.name}】scale=${p.s}`);
  console.log(`  打法: ${p.desc}`);
  console.log(`  达成目标(${target}U)概率: ${(r.pHit * 100).toFixed(0)}%`);
  console.log(`  期末期望净值: ${expEnd.toFixed(0)}U (${((expEnd / equity - 1) * 100).toFixed(0)}%)`);
  console.log(`  月内亏损概率: ${(r.pLose * 100).toFixed(0)}% | 遭遇 >20% 回撤概率: ${(r.pDD * 100).toFixed(0)}%`);
}

console.log(`
--- 数学诚实声明 ---
1. 所有概率基于你 ${daily.length} 天的真实流水 bootstrap，样本越少结论越粗。
2. bootstrap 假设"未来分布≈历史分布"：市场结构变化（如趋势月转横盘月）会使结论失效。
3. scale（激进倍数）≈ 仓位倍数，但真实的"加重"还会抬高单笔风险，实际比模型更危险。
4. 目标判定只用历史数据——它无法预知黑天鹅（你的最小止损/熔断规则才是那道防线）。`);
