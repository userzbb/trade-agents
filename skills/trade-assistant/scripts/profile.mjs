// profile.mjs — view/set/clear the per-user strategy risk profile (strategy-profile.json).
// Sole compliant writer to strategy-profile.json. The trade-assistant agent calls this during
// first-time setup and whenever the user changes risk style. NOT a user-facing toolbox star;
// the agent is its only caller. NOT a fund/engine write (no CONFIRM needed), but the SKILL.md
// flow requires the user to pick an option before a change.
//
// Usage:
//   node profile.mjs view                         — print the EFFECTIVE profile (defaults if unset)
//   node profile.mjs set --equity 500 --per-trade-cap-pct 0.05   — validate + persist partial update
//   node profile.mjs clear                        — delete the profile file, back to reference defaults
//
// Flags (fractions, e.g. 0.05 = 5%): --equity <U> --leverage <N> --main-pct <F> --lottery-pct <F>
//   --main-normal-pct <F> --lottery-per-trade-pct <F> --per-trade-cap-pct <F> --daily-cb-pct <F>
// Zero npm deps. English comments. All user-facing output is Chinese.
import { existsSync, rmSync } from 'node:fs';
import {
  strategyProfile,
  writeStrategyProfile,
  validateStrategyProfile,
  PROFILE_FILE,
} from './_lib.mjs';

const opt = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };

// pct field -> human percent string (0.25 -> "25%").
const fmtPct = (x) => `${(x * 100).toFixed(0)}%`;
// equity is a currency amount -> round to whole USDT.
const fmtEquity = (x) => `${Math.round(x)} U`;

// Render the EFFECTIVE profile. `_applied` is false when no profile file exists yet.
function show() {
  const p = strategyProfile();
  if (!p._applied) console.log('未配置策略档案，使用参考默认：');
  console.log(`权益: ${fmtEquity(p.equity)}`);
  console.log(`杠杆: ${Math.round(p.leverage)} x`);
  console.log(`主引擎常态仓位: ${fmtPct(p.positionStyle.mainNormalPct)}`);
  console.log(`主/彩票分配: ${fmtPct(p.positionStyle.mainPct)}/${fmtPct(p.positionStyle.lotteryPct)}`);
  console.log(`单笔最大亏损红线: ${fmtPct(p.risk.perTradeCapPct)}（单笔上限 ${fmtEquity(p.equity * p.risk.perTradeCapPct)}）`);
  console.log(`单日熔断: ${fmtPct(p.risk.dailyCircuitBreakerPct)}（硬上限 8%）`);
  console.log(`档案路径: ${PROFILE_FILE}`);
}

// CLI flag (kebab) -> setter on the candidate object (kept as a fraction in JSON).
const FLAG_SETTERS = [
  ['equity', (p, v) => { p.equity = +v; }],
  ['leverage', (p, v) => { p.leverage = +v; }],
  ['main-pct', (p, v) => { p.positionStyle.mainPct = +v; }],
  ['lottery-pct', (p, v) => { p.positionStyle.lotteryPct = +v; }],
  ['main-normal-pct', (p, v) => { p.positionStyle.mainNormalPct = +v; }],
  ['lottery-per-trade-pct', (p, v) => { p.positionStyle.lotteryPerTradePct = +v; }],
  ['per-trade-cap-pct', (p, v) => { p.risk.perTradeCapPct = +v; }],
  ['daily-cb-pct', (p, v) => { p.risk.dailyCircuitBreakerPct = +v; }],
];

function runSet() {
  const given = FLAG_SETTERS.filter(([name]) => process.argv.includes('--' + name));
  if (given.length === 0) {
    console.error('set 需要至少一个旗标参数（如 --equity 500 --per-trade-cap-pct 0.05）');
    usageExit();
  }
  // Candidate = current effective profile (file over defaults) with ONLY the given flags applied.
  const base = strategyProfile();
  const cand = {
    schema: base.schema,
    equity: base.equity,
    leverage: base.leverage,
    positionStyle: { ...base.positionStyle },
    risk: { ...base.risk },
  };
  for (const [name, apply] of given) apply(cand, opt(name, undefined));

  // Errors reject the write; warnings print and we continue.
  const { errs, warns } = validateStrategyProfile(cand);
  if (errs.length) {
    for (const e of errs) console.error(`错误: ${e}`);
    process.exit(1);
  }
  for (const w of warns) console.log(`警告: ${w}`);

  writeStrategyProfile(cand);
  console.log(`已保存 → ${PROFILE_FILE}`);
  show();
}

function runClear() {
  if (!existsSync(PROFILE_FILE)) {
    console.log('无策略档案可删除');
    return;
  }
  rmSync(PROFILE_FILE);
  console.log('已删除策略档案，恢复参考默认');
}

function usageExit() {
  console.error('用法: node profile.mjs <view|set|clear>');
  console.error('  view  — 查看生效档案（未配置则显示参考默认）');
  console.error('  set   — 写入/更新档案，如: node profile.mjs set --equity 500 --per-trade-cap-pct 0.05');
  console.error('          可用: --equity <U> --leverage <N> --main-pct <F> --lottery-pct <F> --main-normal-pct <F>');
  console.error('                --lottery-per-trade-pct <F> --per-trade-cap-pct <F> --daily-cb-pct <F>（小数，0.05 = 5%）');
  console.error('  clear — 删除档案，恢复参考默认');
  process.exit(1);
}

// Subcommand = first non-flag arg after `node profile.mjs`.
const sub = process.argv.slice(2).find((a) => !a.startsWith('--'));

if (sub === 'view') {
  show();
} else if (sub === 'set') {
  runSet();
} else if (sub === 'clear') {
  runClear();
} else {
  usageExit();
}
