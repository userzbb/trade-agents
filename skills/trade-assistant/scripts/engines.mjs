// engines.mjs — three-engine status dashboard (Freqtrade / Hummingbot / binance-cli).
// Zero-dependency Node. English comments, Chinese output.
// Usage: node engines.mjs
// Reads: FREQTRADE_URL (default http://127.0.0.1:8080), HUMMINGBOT_API_URL (default http://localhost:8000),
//        HUMMINGBOT_API_USERNAME/PASSWORD (default admin / hb_p1_paper_2026).
import { execFileSync } from 'node:child_process';

const PROXY = process.env.BINANCE_PROXY || 'http://127.0.0.1:7897';
const FT = process.env.FREQTRADE_URL || 'http://127.0.0.1:8080';
const HB = process.env.HUMMINGBOT_API_URL || 'http://localhost:8000';
const HB_USER = process.env.HUMMINGBOT_API_USERNAME || 'admin';
const HB_PASS = process.env.HUMMINGBOT_API_PASSWORD || 'hb_p1_paper_2026';
const FT_USER = process.env.FREQTRADE_USERNAME || 'freqtrader';
const FT_PASS = process.env.FREQTRADE_PASSWORD || 'hb_p1_ft_2026';
const CLI_NAME = process.platform === 'win32' ? 'binance-cli.cmd' : 'binance-cli';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function curl(url, opts = []) {
  try {
    return execFileSync('curl', ['-sS', '-m', '8', ...opts, url], { encoding: 'utf8', timeout: 15000 });
  } catch { return null; }
}
function jparse(s) { if (!s) return null; try { return JSON.parse(s); } catch { return null; } }

export function row(engine, field, value) { return { engine, field, value }; }
export function fmtTable(rows) {
  const head = `引擎          字段                  值`;
  const lines = rows.map((r) => `${r.engine.padEnd(14)} ${r.field.padEnd(20)} ${r.value}`);
  return [head, lines.join('\n')].join('\n');
}

// ---- collectors (each returns rows; never throws) ----
function collectFreqtrade(rows) {
  const auth = ['-u', `${FT_USER}:${FT_PASS}`, '--noproxy', '*'];
  const status = jparse(curl(`${FT}/api/v1/status`, auth));
  const profit = jparse(curl(`${FT}/api/v1/profit_all`, auth));
  const openTrades = Array.isArray(status) ? status.length : null;
  rows.push(row('Freqtrade', '状态', openTrades != null ? `${openTrades} 持仓` : '引擎未运行'));
  const p = profit?.all;
  if (p != null) {
    rows.push(row('Freqtrade', '已平盈亏', `${(+p.profit_closed_coin || 0).toFixed(2)} USDT`));
    rows.push(row('Freqtrade', '胜率', p.wins != null && p.losses != null ? `${(p.wins / Math.max(1, p.wins + p.losses) * 100).toFixed(0)}%` : '—'));
  } else {
    rows.push(row('Freqtrade', '已平盈亏', '—'));
  }
}

function collectHummingbot(rows) {
  const hbAuth = ['-H', `Authorization: Basic ${Buffer.from(`${HB_USER}:${HB_PASS}`).toString('base64')}`];
  const pf = jparse(curl(`${HB}/portfolio/state`, [...hbAuth, '-H', 'Content-Type: application/json', '-d', '{}']));
  const bots = jparse(curl(`${HB}/bots/status`, hbAuth));
  // pf 非 null = 引擎在跑（{} 是空组合法响应）；null = 调用失败/未运行
  const nPos = pf != null
    ? (Array.isArray(pf.positions) ? pf.positions.length : (pf.positions ? Object.keys(pf.positions).length : 0))
    : null;
  rows.push(row('Hummingbot', '账户', nPos != null ? `${nPos} 持仓` : '引擎未运行'));
  const nBot = Array.isArray(bots) ? bots.length : (bots?.status ? 1 : 0);
  rows.push(row('Hummingbot', 'bot', nBot ? `${nBot} 个运行中` : '—'));
}

function collectBinance(rows) {
  try {
    // Windows 上 binance-cli 是 .cmd shim，需经 cmd.exe /c 执行（execFileSync 直接跑 .cmd 会 EINVAL）
    const args = process.platform === 'win32' ? ['/c', CLI_NAME, 'futures-usds', 'account-information-v2'] : [CLI_NAME, 'futures-usds', 'account-information-v2'];
    const out = execFileSync(process.platform === 'win32' ? 'cmd.exe' : CLI_NAME, args, {
      encoding: 'utf8', timeout: 20000, env: { ...process.env, HTTPS_PROXY: PROXY, HTTP_PROXY: PROXY },
    });
    const s = out.search(/[[{]/);
    const a = jparse(s >= 0 ? out.slice(s) : out);
    if (a) {
      const pos = (a.positions || []).filter((x) => +x.positionAmt !== 0);
      rows.push(row('/binance', '持仓', `${pos.length} 个`));
      rows.push(row('/binance', '可用', `${(+a.availableBalance || 0).toFixed(2)} USDT`));
    } else rows.push(row('/binance', '状态', '—'));
  } catch { rows.push(row('/binance', '状态', '引擎未运行')); }
}

async function main() {
  const rows = [];
  collectFreqtrade(rows);
  await sleep(2000);
  collectHummingbot(rows);
  await sleep(2000);
  collectBinance(rows);
  console.log(fmtTable(rows));
}

if (process.argv[1] && !process.argv[1].endsWith('engines.test.mjs')) main();
