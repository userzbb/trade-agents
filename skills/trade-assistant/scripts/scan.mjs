// 全市场扫描：主流币状态 + 涨跌幅榜 + 成交额榜 + 市场宽度
// 用法: node scan.mjs [--vol 30000000]
import { fapi, sleep, fmt, classify, readClassSnapshot, upsertClassSnapshot, DATA_ROOT } from './_lib.mjs';
import { writeFileSync } from 'fs';
import { upsertClassification } from './db.mjs';
import { CLASS_FILE } from './_lib.mjs';

const MIN_VOL = Number((process.argv.find((a) => a.startsWith('--vol')) || '').split('=')[1]) || 30000000;

const MAJORS = new Set([
  'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT',
  'LTCUSDT', 'BCHUSDT', 'TRXUSDT', 'DOTUSDT', 'LINKUSDT', 'AVAXUSDT', 'HYPEUSDT',
  'ZECUSDT', 'SUIUSDT', '1000PEPEUSDT', 'USDCUSDT',
]);

const [info, tickers] = await Promise.all([fapi('/fapi/v1/exchangeInfo'), fapi('/fapi/v1/ticker/24hr')]);

const perp = new Set(
  info.symbols.filter((s) => s.status === 'TRADING' && s.quoteAsset === 'USDT' && s.contractType === 'PERPETUAL').map((s) => s.symbol)
);

const rows = tickers
  .filter((t) => perp.has(t.symbol) && +t.lastPrice > 0)
  .map((t) => ({
    s: t.symbol,
    pct: +t.priceChangePercent,
    vol: Math.round(+t.quoteVolume),
    amp: ((+t.highPrice - +t.lowPrice) / +t.lastPrice) * 100,
  }))
  .filter((t) => t.vol > MIN_VOL);

const alts = rows.filter((t) => !MAJORS.has(t.s));
const majors = rows.filter((t) => MAJORS.has(t.s));
const upCount = rows.filter((t) => t.pct > 0).length;

console.log('=== 大盘基调 ===');
console.log(`上涨合约占比: ${upCount}/${rows.length} (${((upCount / rows.length) * 100).toFixed(0)}%)`);
['BTCUSDT', 'ETHUSDT', 'SOLUSDT'].forEach((s) => {
  const m = majors.find((t) => t.s === s);
  if (m) console.log(`  ${s}: ${m.pct > 0 ? '+' : ''}${m.pct}% 振幅${m.amp.toFixed(0)}%`);
});
console.log(
  upCount / rows.length < 0.3
    ? '→ 基调: risk-off（主打空，看 01 文件做空池）'
    : upCount / rows.length > 0.55
      ? '→ 基调: risk-on（主打多，看 01 文件做多池）'
      : '→ 基调: 中性/横盘（观望或 S6 区间伏击）'
);

const byPct = [...alts].sort((a, b) => b.pct - a.pct);
console.log('\n=== 山寨涨幅榜(额> ' + (MIN_VOL / 1e6).toFixed(0) + 'M U) [做多池候选] ===');
byPct.slice(0, 10).forEach((t) =>
  console.log(`${t.s.padEnd(16)} ${(t.pct + '%').padStart(7)} 振幅${t.amp.toFixed(0)}% 额${(t.vol / 1e6).toFixed(0)}M`)
);

console.log('\n=== 山寨跌幅榜 [补跌链做空候选] ===');
byPct.slice(-8).reverse().forEach((t) =>
  console.log(`${t.s.padEnd(16)} ${(t.pct + '%').padStart(7)} 振幅${t.amp.toFixed(0)}% 额${(t.vol / 1e6).toFixed(0)}M`)
);

const byVol = [...alts].sort((a, b) => b.vol - a.vol);
console.log('\n=== 山寨成交额榜 [资金热度] ===');
byVol.slice(0, 10).forEach((t) =>
  console.log(`${t.s.padEnd(16)} ${(t.pct + '%').padStart(7)} 振幅${t.amp.toFixed(0)}% 额${(t.vol / 1e6).toFixed(0)}M`)
);

console.log('\n下一步: 对候选逐个跑 coin.mjs 查费率/盘口（每次间隔3秒防限流）');

// --- 生成/刷新全市场币种分类快照（动态调档：每日扫描自动更新）---
const snap = { updatedAt: new Date().toISOString(), coins: {} };
for (const t of rows) {
  const cls = classify(t.vol / 1e6, t.amp);
  snap.coins[t.s] = {
    tier: cls.tier, label: cls.label, score: cls.score,
    volM: Math.round(t.vol / 1e6), amp: +t.amp.toFixed(1),
    pct24h: t.pct, updated: snap.updatedAt.slice(0, 16),
  };
}
writeFileSync(CLASS_FILE, JSON.stringify(snap, null, 1));
const today = snap.updatedAt.slice(0, 10);
for (const [sym, c] of Object.entries(snap.coins)) {
  upsertClassification(sym, today, c.tier, c.score, c.volM, c.amp);
}
const tiers = { T1: 0, T2: 0, T3: 0 };
Object.values(snap.coins).forEach((c) => tiers[c.tier]++);
console.log(`\n=== 币种分类快照已刷新 → D:\\trade\\coin-classification.json + SQLite ===`);
console.log(`T1(高流动性低波动): ${tiers.T1} 个 | T2(中等): ${tiers.T2} 个 | T3(高波动/低流动性): ${tiers.T3} 个`);
console.log(`\n💡 对候选做深查（OI/taker/账户LS 确认趋势与主动盘）：node coin.mjs <SYMBOL>`);
