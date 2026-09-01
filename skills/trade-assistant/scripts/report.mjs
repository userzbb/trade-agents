// 盈利数据分析报告：从 SQLite 聚合，不依赖手记日志（交易所流水为真源）
// 用法: node report.mjs [--days 30]
import { db, refreshDailyPnl } from './db.mjs';
import { classify } from './_lib.mjs';

refreshDailyPnl();
const days = (() => { const i = process.argv.indexOf('--days'); return i > 0 ? +process.argv[i + 1] : 30; })();
const since = Date.now() - days * 86400000;

// --- 总览 ---
const [tot] = db.prepare(`
  SELECT
    COALESCE(SUM(CASE WHEN incomeType='REALIZED_PNL' THEN income END),0) AS realized,
    COALESCE(SUM(CASE WHEN incomeType='COMMISSION' THEN income END),0) AS fees,
    COALESCE(SUM(CASE WHEN incomeType='FUNDING_FEE' THEN income END),0) AS funding
  FROM income WHERE time >= ?
`).get(since);
const net = tot.realized + tot.fees + tot.funding;
console.log(`=== 盈利分析（最近 ${days} 天，来源: 交易所流水）===`);
console.log(`已实现盈亏: ${tot.realized.toFixed(2)}U | 手续费: ${tot.fees.toFixed(2)}U | 资金费: ${tot.funding.toFixed(2)}U`);
console.log(`净盈亏: ${net.toFixed(2)}U`);

// --- 每日净值与回撤 ---
const daily = db.prepare(`SELECT date, net FROM daily_pnl WHERE date >= ? ORDER BY date`).all(
  new Date(since).toISOString().slice(0, 10)
);
if (daily.length) {
  let cum = 0, peak = 0, maxDD = 0;
  console.log('\n每日净值 (净盈亏 / 累计):');
  for (const r of daily) {
    cum += r.net;
    peak = Math.max(peak, cum);
    maxDD = Math.max(maxDD, peak - cum);
    console.log(`  ${r.date}  ${r.net >= 0 ? '+' : ''}${r.net.toFixed(2).padStart(8)}  累计 ${cum.toFixed(2)}`);
  }
  const posDays = daily.filter((r) => r.net > 0).length;
  console.log(`\n盈利天数: ${posDays}/${daily.length} (${((posDays / daily.length) * 100).toFixed(0)}%) | 最大回撤: ${maxDD.toFixed(2)}U (峰谷法)`);
}

// --- 分币种 ---
const bySym = db.prepare(`
  SELECT symbol,
    SUM(CASE WHEN incomeType='REALIZED_PNL' THEN income END) AS realized,
    SUM(CASE WHEN incomeType='COMMISSION' THEN income END) AS fees,
    COUNT(*) AS n
  FROM income WHERE time >= ? AND symbol IS NOT NULL
  GROUP BY symbol ORDER BY realized DESC
`).all(since);
if (bySym.length) {
  console.log(`\n分币种 (净=已实现-手续费):`);
  bySym.forEach((r) => {
    const netS = (r.realized || 0) - (r.fees || 0);
    console.log(`  ${r.symbol.padEnd(16)} 净${netS >= 0 ? '+' : ''}${netS.toFixed(2).padStart(8)}U  (流水${r.n}条)`);
  });
}

// --- 分信号类型的代理指标：按币种当前分级 ---
const tierMap = {};
for (const r of bySym) {
  const [c] = db.prepare(`SELECT volM, amp FROM classification WHERE symbol=? ORDER BY date DESC LIMIT 1`).all(r.symbol);
  const tier = c ? classify(c.volM, c.amp).tier : '未知';
  tierMap[tier] = tierMap[tier] || { realized: 0, fees: 0 };
  tierMap[tier].realized += r.realized || 0;
  tierMap[tier].fees += r.fees || 0;
}
if (Object.keys(tierMap).length) {
  console.log(`\n分币种等级 (T1=高流动低波动 / T2=中等 / T3=高波动低流动性):`);
  Object.entries(tierMap).forEach(([t, v]) => {
    console.log(`  ${t}: 净${(v.realized - v.fees).toFixed(2)}U`);
  });
  console.log('  → 若 T3 长期为负，说明庄家币在吃你的利润（04 文档：彩票仓收紧）');
}

// --- 大额亏损单预警 ---
const bigLoss = db.prepare(`
  SELECT symbol, income, time FROM income
  WHERE incomeType='REALIZED_PNL' AND income < -6 AND time >= ?
  ORDER BY income ASC LIMIT 5
`).all(since);
if (bigLoss.length) {
  console.log(`\n⚠ 单笔已实现亏损 >6U（接近 6% 红线区间，需复盘）:`);
  bigLoss.forEach((r) =>
    console.log(`  ${new Date(+r.time).toISOString().slice(0, 16)} ${r.symbol} ${r.income.toFixed(2)}U`)
  );
}
