// 共享工具：代理请求 + 重试 + 限流保护
import { execFile, exec } from 'child_process';

export const PROXY = process.env.BINANCE_PROXY || 'http://127.0.0.1:7897';
export const FAPI = 'https://fapi.binance.com';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function curlOnce(url) {
  return new Promise((resolve, reject) => {
    execFile(
      'curl',
      ['-sS', '-m', '30', '-x', PROXY, url],
      { maxBuffer: 64 * 1024 * 1024 },
      (err, stdout) => (err ? reject(err) : resolve(stdout))
    );
  });
}

/** 请求 fapi 端点，自动重试。返回解析后的 JSON。 */
export async function fapi(path, { retries = 4, base = FAPI } = {}) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const out = await curlOnce(base + path);
      const data = JSON.parse(out);
      if (data && typeof data.code === 'number' && data.code < 0) {
        throw new Error(`API错误 ${data.code}: ${data.msg || ''}`);
      }
      return data;
    } catch (e) {
      lastErr = e;
      await sleep(2500 + i * 2500); // 限流保护：递增退避
    }
  }
  throw lastErr;
}

/** 顺序请求多个路径，请求间自动 sleep 防限流 */
export async function fapiSeq(paths, gapMs = 2500) {
  const results = [];
  for (const p of paths) {
    results.push(await fapi(p));
    await sleep(gapMs);
  }
  return results;
}

export const fmt = (n, d = 5) => Number(n).toPrecision(d);
export const pct = (a, b) => ((a / b - 1) * 100).toFixed(1) + '%';

/**
 * 动态币种分级（纯数据驱动，无静态名单）
 * 资金分: 24h成交 ≥2亿U=2 / 0.5~2亿=1 / <0.5亿=0
 * 振幅分: 24h振幅 ≤25%=2 / 25~40%=1 / >40%=0
 * T1(4分)=模型全信·全额仓位 | T2(2-3分)=八五折·六折仓位 | T3(0-1分)=六五折·四折仓位
 */
export function classify(volM, amp) {
  const volScore = volM >= 200 ? 2 : volM >= 50 ? 1 : 0;
  const ampScore = amp <= 25 ? 2 : amp <= 40 ? 1 : 0;
  const score = volScore + ampScore;
  if (score >= 4) return { tier: 'T1', label: '高流动性低波动', modelDiscount: 1.0, posMult: 1.0, volScore, ampScore, score };
  if (score >= 2) return { tier: 'T2', label: '中等确定性', modelDiscount: 0.85, posMult: 0.6, volScore, ampScore, score };
  return { tier: 'T3', label: '高波动/低流动性', modelDiscount: 0.65, posMult: 0.4, volScore, ampScore, score };
}

/** 数据根目录：默认 D:\trade（本项目数据层），可用 TRADE_HOME 环境变量在任意机器上覆盖 */
export const DATA_ROOT = process.env.TRADE_HOME || 'D:/trade';
export const CLASS_FILE = `${DATA_ROOT}/coin-classification.json`;

export function readClassSnapshot() {
  try {
    return JSON.parse(readFileSync(CLASS_FILE, 'utf8'));
  } catch { return null; }
}

export function upsertClassSnapshot(symbol, cls, volM, amp) {
  let snap = readClassSnapshot() || { updatedAt: 0, coins: {} };
  snap.coins[symbol] = {
    tier: cls.tier, label: cls.label, score: cls.score,
    volM: Math.round(volM), amp: +amp.toFixed(1),
    updated: new Date().toISOString().slice(0, 16),
  };
  writeFileSync(CLASS_FILE, JSON.stringify(snap, null, 1));
}

/** 执行 binance-cli（带代理env与重试；防挂起用 timeout） */
export function cliBin(cmd, { retries = 3 } = {}) {
  const env = { ...process.env, HTTPS_PROXY: PROXY, HTTP_PROXY: PROXY };
  return new Promise((resolve, reject) => {
    let attempt = 0;
    const run = () => {
      exec(cmd, { env, timeout: 90000, maxBuffer: 16 * 1024 * 1024 }, (err, stdout) => {
        const out = (stdout || '').trim();
        if (!err && out && !/failed|recvWindow|Way too many/i.test(out)) {
          const start = out.search(/[[{]/);
          try { return resolve(JSON.parse(out.slice(start))); } catch { /* fallthrough */ }
        }
        if (++attempt < retries) return setTimeout(run, 6000);
        reject(new Error(out || err?.message || 'cli failed'));
      });
    };
    run();
  });
}

