#!/usr/bin/env node
// PreToolUse hook — block fund/engine write commands until user explicitly confirms.
// Zero-dep Node. Reads one JSON line from stdin (the PreToolUse payload), writes JSON to stdout.
//
// Policy: a Bash command that would perform a (A) fund operation or (B) engine/strategy
// state change is DENIED unless the user already approved it. Approval is signalled by an
// inline marker in the command:  `#CONFIRMED-BY-USER`  (appended by the main session AFTER
// the user typed CONFIRM for that exact plan). Everything else matching a write pattern is
// denied with a Chinese systemMessage telling the model to stop and wait for CONFIRM.
//
// This is the mechanical backstop to CLAUDE.md Iron Rule #0 / SKILL.md ABSOLUTE GATE.
// Read-only commands (analysis/backtest/status/queries) always pass.

import fs from 'node:fs';

let input = {};
try {
  const raw = fs.readFileSync(0, 'utf8');
  input = raw ? JSON.parse(raw) : {};
} catch {
  process.exit(0); // never hard-block on a parse error
}

const toolName = String(input.tool_name ?? '');
const toolInput = input.tool_input ?? {};
// For Bash the command lives in tool_input.command. (MCP tools are not gated here — they
// carry their own confirm contract; see references 09.)
const command = String(toolInput.command ?? '');

// Only gate Bash here. Other tools (Edit/Write/MCP) pass through.
if (toolName !== 'Bash' || !command) {
  process.exit(0);
}

// ---- Read-only / analysis patterns that NEVER trip the gate ----------------
const SAFE = new RegExp(
  [
    'position-risk', 'account-information', 'openOrders', 'current-all-open-orders',
    'get-income-history', 'klines', 'ticker/24hr', 'fundingRate', 'funding-rate',
    'topLongShort', 'openInterest', 'takerlongshort', 'depth', 'ping',
    'backtesting', 'hyperopt', 'download-data', 'show-config', 'list-strategies',
    'list-pairs', 'list-markets', 'list-timeframes', 'list-exchanges', 'new-config',
    'create-userdir', 'balance', 'status', 'profit', 'trades', 'whitelist',
    'lookahead-analysis', 'recursive-analysis',
    // trade-assistant toolbox read-only scripts
    'scan\\.mjs', 'coin\\.mjs', 'ta\\.mjs', 'prob\\.mjs', 'solve\\.mjs', 'pyramid\\.mjs',
    'position\\.mjs', 'engines\\.mjs', 'sync\\.mjs', 'report\\.mjs', 'vector\\.mjs',
    'summary\\.mjs', 'plan\\.mjs', 'backtest\\.mjs', 'optimize\\.mjs',
    // generic non-mutating shells
    '--help', '--version', 'node --check', 'git status', 'git log', 'ls ', 'cat ', 'pwd', 'echo ',
  ].join('|'),
  'i',
);
if (SAFE.test(command)) {
  process.exit(0); // read-only — allow without confirmation
}

// User-approved override: marker appended after the user typed CONFIRM for this exact plan.
if (command.includes('#CONFIRMED-BY-USER')) {
  process.exit(0);
}

// ---- Write patterns: (A) fund ops + (B) engine/strategy state changes ---------
const DANGEROUS = new RegExp(
  [
    // (A) Binance fund operations via binance-cli
    'binance-cli[^\\n]*\\b(new-order|batch-orders|place-multiple-orders|cancel-order|new-algo-order|set-leverage|change-margin-type|margin-type|set-position-mode|transfer)\\b',
    // fapi REST write endpoints
    'fapi\\.binance\\.com[^\\n]*/(order|batchOrders|leverage|marginType|positionSide|userDataStream)',
    // (B) Freqtrade engine state via docker exec or REST
    'docker[^\\n]*freqtrade[^\\n]*\\b(forceenter|forcesell|forceexit|forcebuy|start|stop|trade)\\b',
    '/api/v1/(forceenter|forcesell|forceexit|forcebuy|start|stop)\\b',
    // (B) Hummingbot bot / executor writes
    '/bots/(start|stop|import|create|delete)\\b',
    '/executors/(create|close|cancel|stop|start)\\b',
    'hummingbot[^\\n]*\\b(create_bot|start_bot|stop_bot|deploy|import_controller)\\b',
    // NFI (optional) live switch
    'docker[^\\n]*nfi[^\\n]*\\b(trade|start|stop|force)\\b',
  ].join('|'),
  'i',
);

if (DANGEROUS.test(command)) {
  const out = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: 'Matches blocked trading/bot-state pattern (CLAUDE.md Iron Rule #0)',
      systemMessage:
        '【安全拦截】该 Bash 命令会执行资金操作或改变引擎/策略状态，已禁止自动执行。' +
        '流程：先输出完整交易计划（entry/stop/TP/仓位/最大亏损/胜率），等用户选择模式 A/B 并输入 CONFIRM 后，' +
        '才能在被批准的命令末尾追加 #CONFIRMED-BY-USER 再执行。任何未获用户明确确认的此类命令一律不得运行。',
    },
  };
  process.stdout.write(JSON.stringify(out));
  process.exit(2); // exit code 2 = blocked by hook
}

process.exit(0); // not matched — let normal permission flow decide
