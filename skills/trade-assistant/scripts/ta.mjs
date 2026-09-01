// 技术指标引擎（纯 Node 零依赖）：RSI / MACD / EMA / ATR / 布林带 / 背离 / K线形态
// 用法: node ta.mjs <SYMBOL> [--interval 1h] [--limit 200]
import { fapi, sleep, fmt } from './_lib.mjs';

const SYM = process.argv[2];
if (!SYM) { console.error('用法: node ta.mjs <SYMBOL> [--interval 1h] [--limit 200]'); process.exit(1); }
const opt = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const interval = opt('interval', '1h');
const limit = +opt('limit', 200);

// ---------- 指标计算（输入 closes/highs/lows 数组）----------
function ema(arr, n) {
  const k = 2 / (n + 1), out = [arr[0]];
  for (let i = 1; i < arr.length; i++) out.push(arr[i] * k + out[i - 1] * (1 - k));
  return out;
}
function sma(arr, n) {
  const out = new Array(n - 1).fill(null);
  for (let i = n - 1; i < arr.length; i++) out.push(arr.slice(i - n + 1, i + 1).reduce((a, b) => a + b, 0) / n);
  return out;
}
function rsi(closes, n = 14) {
  const out = new Array(n).fill(null);
  let gain = 0, loss = 0;
  for (let i = 1; i <= n; i++) {
    const ch = closes[i] - closes[i - 1];
    if (ch > 0) gain += ch; else loss -= ch;
  }
  let avgG = gain / n, avgL = loss / n;
  out[n] = 100 - 100 / (1 + (avgL === 0 ? 100 : avgG / avgL));
  for (let i = n + 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    avgG = (avgG * (n - 1) + Math.max(ch, 0)) / n;
    avgL = (avgL * (n - 1) + Math.max(-ch, 0)) / n;
    out.push(avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL));
  }
  return out;
}
function macd(closes, fast = 12, slow = 26, sig = 9) {
  const ef = ema(closes, fast), es = ema(closes, slow);
  const dif = closes.map((_, i) => ef[i] - es[i]);
  const dea = ema(dif.slice(slow - 1), sig);
  const hist = dif.map((d, i) => (i >= slow - 1 ? (d - dea[i - (slow - 1)]) * 2 : null));
  return { dif, dea: new Array(slow - 1).fill(null).concat(dea), hist };
}
function atr(highs, lows, closes, n = 14) {
  const tr = closes.map((c, i) => i === 0 ? highs[i] - lows[i] :
    Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
  return sma(tr, n);
}
function boll(closes, n = 20, mult = 2) {
  const mid = sma(closes, n), up = [], dn = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < n - 1) { up.push(null); dn.push(null); continue; }
    const m = mid[i], sd = Math.sqrt(closes.slice(i - n + 1, i + 1).reduce((a, c) => a + (c - m) ** 2, 0) / n);
    up.push(m + mult * sd); dn.push(m - mult * sd);
  }
  return { mid, up, dn };
}

// 背离检测：最近两个价格极值与 RSI 极值是否反向
function divergence(closes, ind, lookback = 40) {
  const n = closes.length, res = [];
  const seg = Math.min(lookback, n);
  // 底背离：价格创新低，指标不创新低（看涨）
  const lows = [], highs = [];
  for (let i = n - seg; i < n; i++) {
    if (ind[i] == null) continue;
    if (i > n - seg + 2 && i < n - 2) {
      if (closes[i] < closes[i - 1] && closes[i] < closes[i + 1]) lows.push({ i, p: closes[i], v: ind[i] });
      if (closes[i] > closes[i - 1] && closes[i] > closes[i + 1]) highs.push({ i, p: closes[i], v: ind[i] });
    }
  }
  const bottom = lows.slice(-2);
  if (bottom.length === 2 && bottom[1].p < bottom[0].p && bottom[1].v > bottom[0].v)
    res.push(`底背离（价格新低 ${fmt(bottom[1].p)} 但 RSI 抬高 ${bottom[0].v.toFixed(0)}→${bottom[1].v.toFixed(0)}，看涨信号）`);
  const top = highs.slice(-2);
  if (top.length === 2 && top[1].p > top[0].p && top[1].v < top[0].v)
    res.push(`顶背离（价格新高 ${fmt(top[1].p)} 但 RSI 走低 ${top[0].v.toFixed(0)}→${top[1].v.toFixed(0)}，看跌信号）`);
  return res;
}

// K线形态（基于最近 1-3 根）
function patterns(o, h, l, c) {
  const n = c.length, p = [];
  const body = (i) => Math.abs(c[i] - o[i]);
  const range = (i) => Math.max(h[i] - l[i], 1e-12);
  const last = n - 1, prev = n - 2;
  // 锤头/吊颈：下影线≥2倍实体，上影线很短
  const lower = Math.min(o[last], c[last]) - l[last], upper = h[last] - Math.max(o[last], c[last]);
  if (lower > body(last) * 2 && upper < body(last) * 0.5)
    p.push(c[last] > o[last] ? '锤头线（看涨反转）' : '吊颈线（见顶警示）');
  // 吞没形态
  if (c[prev] < o[prev] && c[last] > o[last] && c[last] > o[prev] && o[last] < c[prev] && body(last) > body(prev))
    p.push('看涨吞没（底部反转信号）');
  if (c[prev] > o[prev] && c[last] < o[last] && c[last] < o[prev] && o[last] > c[prev] && body(last) > body(prev))
    p.push('看跌吞没（顶部反转信号）');
  // 长下影针（单针探底）：下影线占全幅 60%+
  if (lower / range(last) > 0.6) p.push('长下影插针（下方承接强）');
  return p;
}

// ---------- 拉数据并计算 ----------
const kl = await fapi(`/fapi/v1/klines?symbol=${SYM}&interval=${interval}&limit=${limit}`);
const O = kl.map((k) => +k[1]), H = kl.map((k) => +k[2]), L = kl.map((k) => +k[3]), C = kl.map((k) => +k[4]);
const cur = C[C.length - 1];

const rsiArr = rsi(C, 14);
const { hist } = macd(C);
const atrArr = atr(H, L, C, 14);
const bb = boll(C, 20, 2);
const ema50 = ema(C, 50), ema200 = ema(C, 200);

const rsiNow = rsiArr[rsiArr.length - 1];
const histNow = hist[hist.length - 1], histPrev = hist[hist.length - 2];
const atrNow = atrArr[atrArr.length - 1];
const bbPos = (cur - bb.dn[bb.dn.length - 1]) / Math.max(bb.up[bb.up.length - 1] - bb.dn[bb.dn.length - 1], 1e-12);

console.log(`=== ${SYM} 技术分析（${interval}，${limit}根）===`);
console.log(`现价 ${fmt(cur)} | ATR(14) ${atrNow != null ? (atrNow / cur * 100).toFixed(2) + '%/根' : '—'}`);

// 动量
console.log('\n[动量]');
console.log(`RSI(14): ${rsiNow.toFixed(1)} ${rsiNow <= 30 ? '→ 超卖区（≤30）' : rsiNow >= 70 ? '→ 超买区（≥70）' : rsiNow >= 50 ? '→ 偏强' : '→ 偏弱'}`);
console.log(`MACD 柱: ${histNow.toPrecision(4)} ${histNow > histPrev ? '（红柱放大/动能增强）' : '（柱缩短/动能衰减）'} ${histNow > 0 && histPrev <= 0 ? '★ 金叉' : histNow < 0 && histPrev >= 0 ? '★ 死叉' : ''}`);

// 趋势
console.log('\n[趋势]');
console.log(`EMA50 ${fmt(ema50[ema50.length - 1])} / EMA200 ${fmt(ema200[ema200.length - 1])}：${cur > ema50[ema50.length - 1] && cur > ema200[ema200.length - 1] ? '多头排列（价在双均线上方）' : cur < ema50[ema50.length - 1] && cur < ema200[ema200.length - 1] ? '空头排列' : '均线缠绕（震荡）'}`);
console.log(`布林带位置: ${(bbPos * 100).toFixed(0)}%（0%=下轨，100%=上轨）${bbPos > 0.95 ? ' 触及上轨（超买）' : bbPos < 0.05 ? ' 触及下轨（超卖）' : ''}`);

// 背离
const div = divergence(C, rsiArr, 40);
if (div.length) { console.log('\n[背离]'); div.forEach((d) => console.log('★ ' + d)); }

// 形态
const pat = patterns(O, H, L, C);
if (pat.length) { console.log('\n[K线形态]'); pat.forEach((x) => console.log('• ' + x)); }

// 综合研判
console.log('\n[综合研判]');
const score = (rsiNow > 50 ? 1 : -1) + (histNow > 0 ? 1 : -1) + (cur > ema50[ema50.length - 1] ? 1 : -1) + (div.some((d) => d.includes('底')) ? 1 : 0) - (div.some((d) => d.includes('顶')) ? 1 : 0);
const bias = score >= 2 ? '偏多（动能+趋势共振）' : score <= -2 ? '偏空' : '中性/震荡（信号冲突，观望或用 S6 区间打法）';
console.log(`信号评分 ${score} → ${bias}`);
console.log('⚠ 技术指标是概率参考，庄家币(T3)上形态可被操纵；最终进场仍以 references 信号 S1-S6 + solve.mjs 为准。');
