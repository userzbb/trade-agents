// envcheck.mjs — read-only environment self-check for the trade-agents plugin.
// English comments; ALL user-facing output is Chinese (Iron Rule #1). Zero deps.
//
// Compares, for each env var the plugin consumes, what THIS session sees
// (process.env) vs what the NEXT Claude Code launch will inherit (Windows
// user env in HKCU\Environment). This matters because `.mcp.json` expands
// ${HUMMINGBOT_MCP_DIR} from Claude Code's OWN process env at MCP launch —
// a var exported only in one shell is invisible to a Claude Code started
// elsewhere, and even a freshly `setx`-ed var needs a full restart to apply.
//
// READ-ONLY: this script never writes env. Fixing goes through the agent →
// show a setx plan → user types CONFIRM → run `setx` → restart Claude Code.
//
// Exit code: 0 = no blocking issue; 2 = at least one required-if-used var is
// missing or unusable (e.g. HUMMINGBOT_MCP_DIR unset / an MSYS `/x/...` path).

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

// Canonical deployment dirs (informational probes only — engines can live
// anywhere; a miss never blocks, it only shapes the setx suggestion).
const PROBES = () => ({
  freqtrade: 'E:\\trade-bots\\freqtrade',
  hummingbotMCP: 'E:\\trade-bots\\hummingbot\\mcp',
  nfi: 'E:\\trade-bots\\nfi',
});

// Vars the plugin consumes. `def` = fallback when unset; `canon` = suggested
// Windows value for the required one. `mask` = never echo the value (default
// credentials already in docs should not be re-shown each session).
const MANAGED = [
  {
    key: 'HUMMINGBOT_MCP_DIR', severity: 'required-if-used', def: '', canon: 'E:\\trade-bots\\hummingbot\\mcp', mask: false,
    consumer: '.mcp.json 的 hummingbot-mcp `--directory ${HUMMINGBOT_MCP_DIR}`（无默认）',
  },
  { key: 'TRADE_HOME', severity: 'optional', def: 'D:/trade', mask: false, consumer: '数据层 DATA_ROOT' },
  { key: 'BINANCE_PROXY', severity: 'optional', def: 'http://127.0.0.1:7897', mask: false, consumer: '_lib 代理 + binance-cli' },
  { key: 'HUMMINGBOT_API_URL', severity: 'optional', def: 'http://localhost:8000', mask: false, consumer: 'engines.mjs + .mcp.json' },
  { key: 'HUMMINGBOT_API_USERNAME', severity: 'optional', def: 'admin', mask: false, consumer: 'engines.mjs + .mcp.json' },
  { key: 'HUMMINGBOT_API_PASSWORD', severity: 'optional', def: 'hb_p1_paper_2026', mask: true, consumer: 'engines.mjs + .mcp.json' },
  { key: 'FREQTRADE_URL', severity: 'optional', def: 'http://127.0.0.1:8080', mask: false, consumer: 'engines.mjs REST' },
  { key: 'FREQTRADE_USERNAME', severity: 'optional', def: 'freqtrader', mask: false, consumer: 'engines.mjs REST' },
  { key: 'FREQTRADE_PASSWORD', severity: 'optional', def: 'hb_p1_ft_2026', mask: true, consumer: 'engines.mjs REST' },
];

// Pure analysis over injected inputs → testable without registry/network.
// procEnv: object (process.env of the running session).
// userEnv: object or null (Windows user env map; null = cannot inspect).
// returns { rows:[{level:'ok'|'info'|'warn'|'err', text}], errCount, warnCount, fixes, summary }
export function analyzeEnv({ procEnv = {}, userEnv = null, probes = PROBES() } = {}) {
  const rows = [];
  const fixes = [];
  let errCount = 0;
  let warnCount = 0;
  const has = (env, k) => env && env[k] !== undefined && String(env[k]).trim() !== '';
  const src = (m) => [has(procEnv, m.key) && '进程', userEnv !== null && has(userEnv, m.key) && '注册表'].filter(Boolean).join('+') || '未设';

  for (const m of MANAGED) {
    const inProc = has(procEnv, m.key);
    const inUser = userEnv !== null && has(userEnv, m.key);

    if (m.key === 'HUMMINGBOT_MCP_DIR') {
      if (!inProc && !inUser) {
        errCount += 1;
        rows.push({ level: 'err', text: `HUMMINGBOT_MCP_DIR  未设 → hummingbot-mcp MCP 无法启动（${m.consumer}）。` });
        const cand = existsSync(probes.hummingbotMCP) ? probes.hummingbotMCP : m.canon;
        fixes.push(`setx HUMMINGBOT_MCP_DIR "${cand}"`);
        continue;
      }
      const v = String(inProc ? procEnv[m.key] : userEnv[m.key]);
      if (/^\/[a-zA-Z]\//.test(v)) {
        errCount += 1;
        rows.push({ level: 'err', text: `HUMMINGBOT_MCP_DIR = ${v}（${src(m)}）—— 这是 Git Bash MSYS 路径(/x/...)，Windows 原生进程(uv)解析不了；改用绝对路径 setx HUMMINGBOT_MCP_DIR "${m.canon}"。` });
        fixes.push(`setx HUMMINGBOT_MCP_DIR "${m.canon}"`);
        continue;
      }
      if (!/^[A-Za-z]:[\\/]/.test(v)) {
        warnCount += 1;
        rows.push({ level: 'warn', text: `HUMMINGBOT_MCP_DIR = ${v}（${src(m)}）—— 非 Windows 绝对路径(盘符:\\ 开头)，请核对。` });
      } else if (existsSync(probes.hummingbotMCP) && v.replace(/\\/g, '/').toLowerCase() !== probes.hummingbotMCP.replace(/\\/g, '/').toLowerCase()) {
        warnCount += 1;
        rows.push({ level: 'warn', text: `HUMMINGBOT_MCP_DIR = ${v}（${src(m)}）—— 与默认部署 ${probes.hummingbotMCP} 不同（引擎可装别处，确认即可）。` });
      }
      if (inProc && userEnv !== null && !inUser) {
        warnCount += 1;
        rows.push({ level: 'warn', text: `HUMMINGBOT_MCP_DIR  仅当前进程有（某处 export 的临时值），Windows 用户环境没有 → 换方式启动 Claude Code 后可能丢。建议固化：setx HUMMINGBOT_MCP_DIR "${v}"` });
        fixes.push(`setx HUMMINGBOT_MCP_DIR "${v}"`);
      } else if (!inProc && inUser) {
        rows.push({ level: 'info', text: `HUMMINGBOT_MCP_DIR  注册表已设但本会话没继承 → 完全重启 Claude Code 后才对本会话生效。` });
      } else if (inProc && inUser) {
        rows.push({ level: 'ok', text: `HUMMINGBOT_MCP_DIR = ${v}（进程+注册表一致）` });
      } else {
        rows.push({ level: 'ok', text: `HUMMINGBOT_MCP_DIR = ${v}（${src(m)}）` });
      }
      continue;
    }

    // optional vars — defaulted, presence is informational
    if (!inProc && !inUser) {
      rows.push({ level: 'info', text: `${m.key}  未设 → 用默认 ${m.mask ? '(已内置默认凭据)' : m.def}` });
    } else if (m.mask) {
      rows.push({ level: 'ok', text: `${m.key}  (已设，${src(m)})` });
    } else {
      const v = String(inProc ? procEnv[m.key] : userEnv[m.key]);
      rows.push({ level: 'ok', text: `${m.key} = ${v}（${src(m)}）` });
      if (inProc && userEnv !== null && !inUser) rows.push({ level: 'info', text: `${m.key}  仅当前进程有；未写入 Windows 用户环境（需固化用 setx）。` });
    }
  }

  for (const [label, p] of Object.entries(probes)) {
    rows.push({ level: 'info', text: `探测 ${p} → ${existsSync(p) ? '存在' : '不存在'}` });
  }

  const summary = errCount
    ? `环境自检：${errCount} 个必需问题${warnCount ? ` + ${warnCount} 个警告` : ''}。`
    : warnCount ? `环境自检通过（${warnCount} 个警告）。` : '环境自检通过。';
  return { rows, errCount, warnCount, fixes, summary };
}

// Windows user-env map from HKCU\Environment; null if not inspectable.
export function readUserEnv() {
  if (process.platform !== 'win32') return null;
  try {
    const out = execFileSync('reg', ['query', 'HKCU\\Environment'], { encoding: 'utf8', timeout: 5000, windowsHide: true });
    const map = {};
    for (const line of out.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s+REG_[A-Z_]+\s+(.*?)\s*$/);
      if (m) map[m[1]] = m[2].trim();
    }
    return map;
  } catch {
    return null;
  }
}

// Test hook (mirrors __setCurlForTest style).
let userEnvReader = readUserEnv;
export function __setUserEnvReaderForTest(fn) { userEnvReader = fn; }

function main() {
  const userEnv = userEnvReader();
  const res = analyzeEnv({ procEnv: process.env, userEnv, probes: PROBES() });
  const tag = { ok: '[OK]', info: '[·]', warn: '[!]', err: '[✗]' };
  for (const r of res.rows) console.log(`${tag[r.level]} ${r.text}`);
  console.log('');
  console.log(res.summary);
  if (res.fixes.length) {
    console.log('修复（需你 CONFIRM 后 agent 才执行 setx；改后完全重启 Claude Code 生效）:');
    for (const f of res.fixes) console.log(`  ${f}`);
  } else if (userEnv === null && process.platform === 'win32') {
    console.log('注：读不到 Windows 用户环境(注册表)，只能看当前进程 env；固化请用 setx。');
  }
  process.exit(res.errCount ? 2 : 0);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) main();
