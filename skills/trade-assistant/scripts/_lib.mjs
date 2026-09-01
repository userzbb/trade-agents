// 共享工具：代理请求 + 重试 + 限流保护
import { execFile, exec } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const PROXY = process.env.BINANCE_PROXY || 'http://127.0.0.1:7897';
export const FAPI = 'https://fapi.binance.com';

// BINANCE_TEST_FAST=1 → sleep 归零（测试用；生产不设此变量）
export const sleep = (ms) => new Promise((r) => setTimeout(r, process.env.BINANCE_TEST_FAST ? 0 : ms));

// 测试钩子：覆盖 curlOnce（unit test 用）。fn 接收 url，返回 raw stdout 字符串，可 throw 模拟失败。
let curlOverride = null;
export function __setCurlForTest(fn) { curlOverride = fn; }

// MOCK_FAPI=<fixture.json>：fixture 是 { "<path>": "<raw curl 输出字符串>" }，子进程测试注入。
// key 用 path（不含 host，含 query，须与脚本实际请求完全一致）；命中返回字符串；缺失抛错（防测错端点）。
// 每个子进程只加载一个 fixture 文件。
let mockFixtures = null;
function mockFor(url) {
  if (!mockFixtures) mockFixtures = JSON.parse(readFileSync(process.env.MOCK_FAPI, 'utf8'));
  const path = url.replace(/^https?:\/\/[^/]+/, '');
  if (!Object.hasOwn(mockFixtures, path)) {
    throw new Error(`MOCK_FAPI: no fixture for ${path}; available: ${Object.keys(mockFixtures).join(', ')}`);
  }
  return mockFixtures[path];
}

function curlOnce(url) {
  if (curlOverride) return Promise.resolve().then(() => curlOverride(url)); // 同步 throw 转为 rejection
  if (process.env.MOCK_FAPI) return Promise.resolve(mockFor(url)); // 仅 mock 模式进入，fixture 缺失/为 null 一律抛错
  return new Promise((resolve, reject) => {
    execFile('curl', ['-sS', '-m', '30', '-x', PROXY, url], { maxBuffer: 64 * 1024 * 1024 }, (err, stdout) => (err ? reject(err) : resolve(stdout)));
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

// 档位评分：≥upper 得 2 分，≥lower 得 1 分，否则 0 分（向上阈值，值越大分越高）
function scoreAbove(value, lower, upper) {
  if (value >= upper) return 2;
  if (value >= lower) return 1;
  return 0;
}

// 档位评分：≤lower 得 2 分，≤upper 得 1 分，否则 0 分（向下阈值，值越小分越高）
function scoreBelow(value, lower, upper) {
  if (value <= lower) return 2;
  if (value <= upper) return 1;
  return 0;
}

/**
 * 动态币种分级（纯数据驱动，无静态名单）
 * 资金分: 24h成交 ≥2亿U=2 / 0.5~2亿=1 / <0.5亿=0
 * 振幅分: 24h振幅 ≤25%=2 / 25~40%=1 / >40%=0
 * T1(4分)=模型全信·全额仓位 | T2(2-3分)=八五折·六折仓位 | T3(0-1分)=六五折·四折仓位
 */
export function classify(volM, amp) {
  const volScore = scoreAbove(volM, 50, 200);
  const ampScore = scoreBelow(amp, 25, 40);
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
  mkdirSync(dirname(CLASS_FILE), { recursive: true });
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

