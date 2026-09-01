// 从币安拉取资金流水（真源）→ 入库 SQLite
// 用法: node sync.mjs [--days 7]   （拉最近 N 天流水，默认 7）
import { cliBin, sleep, DATA_ROOT } from './_lib.mjs';
import { upsertIncome, refreshDailyPnl } from './db.mjs';

const opt = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? +process.argv[i + 1] : d; };
const days = opt('days', 7);

let total = 0;
// 分天拉取（单次 limit 上限 1000，按天分片更稳）
for (let d = days - 1; d >= 0; d--) {
  const start = Date.now() - d * 86400000;
  const end = start + 86400000;
  try {
    const rows = await cliBin(
      `binance-cli futures-usds get-income-history --start-time ${start} --end-time ${end} --limit 1000`
    );
    const mapped = (rows || []).map((r) => ({
      tranId: r.tranId, symbol: r.symbol, incomeType: r.incomeType,
      income: +r.income, asset: r.asset, time: +r.time,
      date: new Date(+r.time).toISOString().slice(0, 10),
    }));
    if (mapped.length) upsertIncome(mapped);
    total += mapped.length;
    console.log(`${new Date(start).toISOString().slice(0, 10)}: ${mapped.length} 条流水`);
  } catch (e) {
    console.log(`${new Date(start).toISOString().slice(0, 10)}: 拉取失败（${String(e.message).slice(0, 60)}），跳过`);
  }
  await sleep(3000); // 限流保护
}

refreshDailyPnl();
console.log(`\n共入库 ${total} 条流水，daily_pnl 已刷新 → ${DATA_ROOT}/data/trade.db`);
