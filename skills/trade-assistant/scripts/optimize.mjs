// optimize.mjs — Freqtrade Hyperopt bridge: optimize stop/TP/ROI/trailing for a strategy.
// Zero-dependency Node. English comments, Chinese output.
// Usage: node optimize.mjs [--strategy RsiMomentum] [--epochs 20]
// Requires: freqtrade container running (docker), data downloaded for the strategy's pair.
import { execFileSync } from 'node:child_process';

const opt = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const STRAT = opt('strategy', 'RsiMomentum');
const EPOCHS = +opt('epochs', 20);
const CONFIG = '/freqtrade/user_data/config.json';

// ---- pure parser (testable): parse the hyperopt-dumped params JSON ----
export function parseHyperoptJson(str) {
  const d = JSON.parse(str);
  const p = d.params || {};
  const roi = Object.entries(p.roi || {}).sort((a, b) => +a[0] - +b[0])
    .map(([k, v]) => `${k}min→${(+v * 100).toFixed(1)}%`);
  return {
    stoploss: p.stoploss?.stoploss != null ? (+p.stoploss.stoploss * 100).toFixed(1) + '%' : '—',
    roi: roi.length ? roi.join(', ') : '—',
    trailing: p.trailing?.trailing_stop
      ? `开 ${(+p.trailing.trailing_stop_positive * 100).toFixed(2)}% / 激活偏移 ${(+p.trailing.trailing_stop_positive_offset * 100).toFixed(1)}%`
      : '关',
  };
}

function dockerRun() {
  return execFileSync('docker', ['exec', 'freqtrade', 'freqtrade', 'hyperopt', '--config', CONFIG, '--strategy', STRAT, '--hyperopt-loss', 'SharpeHyperOptLoss', '--spaces', 'stoploss', 'roi', 'trailing', '--epochs', String(EPOCHS)], { encoding: 'utf8', timeout: 600000 });
}

function main() {
  console.log(`正在对策略 ${STRAT} 跑 Hyperopt（${EPOCHS} epochs，止损/止盈/ROI/跟踪）…`);
  dockerRun();
  const json = execFileSync('docker', ['exec', 'freqtrade', 'sh', '-c', `cat /freqtrade/user_data/strategies/${STRAT}.json`], { encoding: 'utf8' });
  const best = parseHyperoptJson(json);
  console.log('\n=== Hyperopt 优化结果（中文）===');
  console.log(`止损    ${best.stoploss}`);
  console.log(`止盈ROI ${best.roi}`);
  console.log(`跟踪    ${best.trailing}`);
  console.log('→ 把以上参数填入策略（stoploss / minimal_roi / trailing_*）后再回测/实盘验证。只读分析，免 CONFIRM。');
}

if (process.argv[1] && !process.argv[1].endsWith('.test.mjs')) main();
