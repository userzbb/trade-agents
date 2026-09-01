// backtest.mjs — Hummingbot V2 backtesting bridge.
// Zero-dependency Node. English comments, Chinese output.
// Usage: node backtest.mjs <config.json> [--start 1735689600] [--end 1740787200]
//   <config.json> = a valid Hummingbot controller config (get template via
//   GET /controllers/{type}/{name}/config/template). Requires the connector to
//   have historical candle data for the timerange.
import { execFileSync } from 'node:child_process';

const opt = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const CFG = process.argv[2];
const START = +opt('start', Math.floor(Date.now() / 1000) - 60 * 86400);
const END = +opt('end', Math.floor(Date.now() / 1000));
const HB = process.env.HUMMINGBOT_API_URL || 'http://localhost:8000';
const HB_USER = process.env.HUMMINGBOT_API_USERNAME || 'admin';
const HB_PASS = process.env.HUMMINGBOT_API_PASSWORD || 'hb_p1_paper_2026';

// ---- pure parser (testable) ----
export function parseBacktestResult(str) {
  const d = JSON.parse(str);
  const r = d.results || d;
  return {
    netPnl: r.net_pnl_quote != null ? (+r.net_pnl_quote).toFixed(2) + ' USDT' : '—',
    netPnlPct: r.net_pnl_pct != null ? (+r.net_pnl_pct * 100).toFixed(2) + '%' : '—',
    maxDrawdown: r.max_drawdown_pct != null ? (+r.max_drawdown_pct * 100).toFixed(2) + '%' : '—',
    sharpe: r.sharpe_ratio != null ? (+r.sharpe_ratio).toFixed(2) : '—',
    volume: r.total_volume != null ? (+r.total_volume).toFixed(0) + ' USDT' : '—',
  };
}

function main() {
  if (!CFG) { console.error('用法: node backtest.mjs <controller-config.json> [--start <unix>] [--end <unix>]'); process.exit(1); }
  const config = JSON.parse(execFileSync('node', ['-e', `console.log(JSON.stringify(require(process.argv[1])))`, CFG], { encoding: 'utf8' }));
  const payload = JSON.stringify({ start_time: START, end_time: END, backtesting_resolution: '1m', trade_cost: 0.0006, config });
  const auth = Buffer.from(`${HB_USER}:${HB_PASS}`).toString('base64');
  const out = execFileSync('curl', ['-sS', '-m', '300', '-u', `${HB_USER}:${HB_PASS}`, '-H', 'Content-Type: application/json', '-d', payload, `${HB}/backtesting/run`], { encoding: 'utf8', timeout: 320000 });
  const r = parseBacktestResult(out);
  console.log('\n=== Hummingbot 回测结果（中文）===');
  console.log(`净盈亏   ${r.netPnl}（${r.netPnlPct}）`);
  console.log(`最大回撤 ${r.maxDrawdown}`);
  console.log(`Sharpe  ${r.sharpe}`);
  console.log(`成交额   ${r.volume}`);
  console.log('→ 回测只读，免 CONFIRM。部署该 controller 前先展示计划 + CONFIRM。');
}

if (process.argv[1] && !process.argv[1].endsWith('.test.mjs')) main();
