// 周报/月报生成器：从 SQLite 聚合历史交易，输出分析 md 并归档
// 用法: node summary.mjs weekly|monthly [--date YYYY-MM-DD]（默认今天；weekly 自动定位到本周日）
import { db, refreshDailyPnl } from './db.mjs';
import { classify, DATA_ROOT } from './_lib.mjs';
import { writeFileSync, mkdirSync } from 'fs';

refreshDailyPnl();
const type = process.argv[2] || 'weekly';
const dateArg = (() => { const i = process.argv.indexOf('--date'); return i > 0 ? process.argv[i + 1] : null; })();
const now = dateArg ? new Date(dateArg) : new Date();

// 计算周期（北京时间近似：UTC+8）
const BJ = (d) => new Date(d.getTime() + 8 * 3600000);
const dayStr = (d) => BJ(d).toISOString().slice(0, 10);

let start, end, label, fileName, prevLabel;
if (type === 'monthly') {
  const y = BJ(now).getUTCFullYear(), m = BJ(now).getUTCMonth();
  const isReport = BJ(now).getUTCDate() === 1; // 1号生成上月大总结
  const pm = isReport ? m - 1 : m;
  const py = pm < 0 ? y - 1 : y, pm2 = pm < 0 ? 11 : pm;
  start = new Date(Date.UTC(py, pm2, 1) - 8 * 3600000);
  end = new Date(Date.UTC(py, pm2 + 1, 1) - 8 * 3600000);
  label = `${py}-${String(pm2 + 1).padStart(2, '0')} 月度大总结`;
  fileName = `月报_${py}-${String(pm2 + 1).padStart(2, '0')}.md`;
} else {
  // 本周日归档：取本周一 00:00 至"今天/周日"
  const dow = BJ(now).getUTCDay(); // 0=周日
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(now); monday.setUTCDate(now.getUTCDate() + mondayOffset);
  monday.setUTCHours(0, 0, 0, 0);
  start = new Date(monday.getTime() - 8 * 3600000);
  end = now;
  label = `周报 ${dayStr(start)} ~ ${dayStr(end)}`;
  fileName = `周报_${dayStr(start).replaceAll('-', '')}_${dayStr(end).replaceAll('-', '')}.md`;
}
const since = start.getTime(), until = end.getTime();

// --- 聚合 ---
const daily = db.prepare('SELECT date, net, realized FROM daily_pnl WHERE date >= ? AND date < ? ORDER BY date')
  .all(dayStr(start), dayStr(end));
const bySym = db.prepare(`
  SELECT symbol, SUM(CASE WHEN incomeType='REALIZED_PNL' THEN income END) realized,
    SUM(CASE WHEN incomeType='COMMISSION' THEN income END) fees,
    SUM(CASE WHEN incomeType='FUNDING_FEE' THEN income END) funding, COUNT(*) n
  FROM income WHERE time >= ? AND time < ? AND symbol IS NOT NULL GROUP BY symbol ORDER BY realized DESC
`).all(since, until);
const totals = db.prepare(`
  SELECT SUM(CASE WHEN incomeType='REALIZED_PNL' THEN income END) realized,
    SUM(CASE WHEN incomeType='COMMISSION' THEN income END) fees,
    SUM(CASE WHEN incomeType='FUNDING_FEE' THEN income END) funding
  FROM income WHERE time >= ? AND time < ? AND symbol IS NOT NULL
`).get(since, until);
const bigLoss = db.prepare(`
  SELECT symbol, income, time FROM income
  WHERE incomeType='REALIZED_PNL' AND income < -6 AND time >= ? AND time < ? ORDER BY income ASC LIMIT 8
`).all(since, until);

let cum = 0, peak = 0, maxDD = 0, best = null, worst = null;
for (const r of daily) {
  cum += r.net; peak = Math.max(peak, cum); maxDD = Math.max(maxDD, peak - cum);
  if (!best || r.net > best.net) best = r;
  if (!worst || r.net < worst.net) worst = r;
}
const posDays = daily.filter((r) => r.net > 0).length;
const net = (totals.realized || 0) + (totals.fees || 0) + (totals.funding || 0);

// 分级归因（取每个币在周期内最近一次分级）
const tierMap = {};
for (const r of bySym) {
  const [c] = db.prepare('SELECT tier FROM classification WHERE symbol=? AND date < ? ORDER BY date DESC LIMIT 1')
    .all(r.symbol, dayStr(end));
  const t = c ? c.tier : '未知';
  tierMap[t] = (tierMap[t] || 0) + (r.realized || 0) - (r.fees || 0);
}

// --- 生成 md ---
const L = [];
L.push(`# ${label}`);
L.push('');
L.push(`> 生成时间: ${new Date().toISOString().slice(0, 16)} | 数据源: 交易所流水 (SQLite)`);
L.push('');
L.push('## 一、核心指标');
L.push('');
L.push(`| 指标 | 数值 |`);
L.push(`|---|---|`);
L.push(`| 净盈亏 | **${net >= 0 ? '+' : ''}${net.toFixed(2)}U** |`);
L.push(`| 已实现盈亏 / 手续费 / 资金费 | ${(totals.realized || 0).toFixed(2)} / ${(totals.fees || 0).toFixed(2)} / ${(totals.funding || 0).toFixed(2)} |`);
L.push(`| 交易天数 / 盈利天 | ${daily.length} / ${posDays} (${daily.length ? ((posDays / daily.length) * 100).toFixed(0) : 0}%) |`);
L.push(`| 最好/最差一天 | ${best ? `${best.date} +${best.net.toFixed(2)}U` : '-'} / ${worst ? `${worst.date} ${worst.net.toFixed(2)}U` : '-'} |`);
L.push(`| 最大回撤(峰谷) | ${maxDD.toFixed(2)}U |`);
L.push('');
L.push('## 二、分币种');
L.push('');
L.push(`| 币种 | 净盈亏 | 已实现 | 手续费 | 流水数 |`);
L.push(`|---|---|---|---|---|`);
bySym.forEach((r) => {
  const n = (r.realized || 0) - (r.fees || 0);
  L.push(`| ${r.symbol} | ${n >= 0 ? '+' : ''}${n.toFixed(2)} | ${(r.realized || 0).toFixed(2)} | ${(r.fees || 0).toFixed(2)} | ${r.n} |`);
});
L.push('');
L.push('## 三、按币种分级归因');
L.push('');
L.push(`| 分级 | 净盈亏 | 说明 |`);
L.push(`|---|---|---|`);
const tierNote = { T1: '高流动性低波动（模型可信，可满仓）', T2: '中等（模型八五折，仓位六折）', T3: '高波动/低流动性（庄家币特征）' };
Object.entries(tierMap).forEach(([t, v]) => L.push(`| ${t} | ${v >= 0 ? '+' : ''}${v.toFixed(2)}U | ${tierNote[t] || ''} |`));
L.push('');
if (bigLoss.length) {
  L.push('## 四、大额亏损单（>6U，红线复盘）');
  L.push('');
  bigLoss.forEach((r) => L.push(`- ${new Date(+r.time).toISOString().slice(5, 16)} ${r.symbol} **${r.income.toFixed(2)}U**`));
  L.push('');
}
L.push('## 五、决策输入（供下期计划）');
L.push('');
L.push(`- T3 币种净盈亏 ${tierMap['T3'] !== undefined ? tierMap['T3'].toFixed(2) + 'U' : '无交易'}${tierMap['T3'] < 0 ? ' → 若持续为负，收紧彩票仓（05 文档）' : ''}`);
L.push(`- 手续费占比: ${(Math.abs(totals.fees || 0) / Math.max(1, Math.abs(totals.realized || 1)) * 100).toFixed(1)}%（超过 15% 说明交易频率过高或止损太近）`);
L.push(`- 盈利天占比 ${(daily.length ? ((posDays / daily.length) * 100).toFixed(0) : 0)}%，回撤 ${maxDD.toFixed(1)}U → 用 plan.mjs --target 重新校验下期目标`);
L.push('');
L.push('> 下期计划校验命令: `node plan.mjs --target <目标U> --days <N> --equity <当前净值>`');

mkdirSync(`${DATA_ROOT}/retrospectives`, { recursive: true });
const out = `${DATA_ROOT}/retrospectives/${fileName}`;
writeFileSync(out, L.join('\n'), 'utf8');
console.log(L.join('\n'));
console.log(`\n已生成 → ${out}`);
