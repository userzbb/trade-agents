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
import { join } from 'node:path';

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
// `onlyIfSet` = when unset, print nothing (path overrides have no default).
// `path` = value is a filesystem path → warn if not a Windows absolute path.
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
  { key: 'TRADE_DB', severity: 'optional', def: '', mask: false, onlyIfSet: true, path: true, consumer: 'db.mjs SQLite 路径覆盖（默认 ${TRADE_HOME}/data/trade.db）' },
  { key: 'VECTOR_INDEX_PATH', severity: 'optional', def: '', mask: false, onlyIfSet: true, path: true, consumer: 'vector.mjs 索引缓存覆盖（默认 ${TRADE_HOME}/vector-index.json）' },
];

// Git-Bash MSYS drive path (/x/rest) → Windows path (X:\rest), or null if v is
// not an MSYS drive path. Windows-native processes cannot resolve /x/... paths.
export function msysFix(v) {
  const m = v.trim().match(/^\/\s*([a-zA-Z])\/(.*)$/);
  if (!m) return null;
  return `${m[1].toUpperCase()}:\\${m[2]}`;
}

// Unified path check over one set value. Applies to every var whose value is an
// MSYS drive path (blocking err for HUMMINGBOT_MCP_DIR — v1 semantics; warn with
// a setx conversion for every other var) and, for vars marked path:true, a warn
// when the value is not a Windows absolute path. Returns {handled, level?, text?,
// fix?}; handled=false means no path issue and the caller proceeds as normal.
function applyPathIssues(m, v, src) {
  if (/^\/[a-zA-Z]\//.test(v)) {
    if (m.key === 'HUMMINGBOT_MCP_DIR') {
      return {
        handled: true, level: 'err',
        text: `HUMMINGBOT_MCP_DIR = ${v}（${src}）—— 这是 Git Bash MSYS 路径(/x/...)，Windows 原生进程(uv)解析不了；改用绝对路径 setx HUMMINGBOT_MCP_DIR "${m.canon}"。`,
        fix: `setx HUMMINGBOT_MCP_DIR "${m.canon}"`,
      };
    }
    const win = msysFix(v);
    return {
      handled: true, level: 'warn',
      text: `${m.key} = ${v}（${src}）—— MSYS 路径(/${v[1]}/)，Windows 原生进程解析不了；改 ${win}。建议 setx ${m.key} "${win}"`,
      fix: `setx ${m.key} "${win}"`,
    };
  }
  if (m.path === true && !/^[A-Za-z]:[\\/]/.test(v)) {
    return {
      handled: true, level: 'warn',
      text: `${m.key} = ${v}（${src}）—— 非 Windows 绝对路径(盘符:\\ 开头)，Windows 原生进程可能解析不了。`,
    };
  }
  return { handled: false };
}

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
      const issue = applyPathIssues(m, v, src(m));
      if (issue.handled) {
        errCount += 1;
        rows.push({ level: 'err', text: issue.text });
        fixes.push(issue.fix);
        continue;
      }
      if (!/^[A-Za-z]:[\\/]/.test(v)) {
        warnCount += 1;
        rows.push({ level: 'warn', text: `HUMMINGBOT_MCP_DIR = ${v}（${src(m)}）—— 非 Windows 绝对路径(盘符:\\ 开头)，请核对。` });
      } else {
        if (existsSync(probes.hummingbotMCP) && v.replace(/\\/g, '/').toLowerCase() !== probes.hummingbotMCP.replace(/\\/g, '/').toLowerCase()) {
          warnCount += 1;
          rows.push({ level: 'warn', text: `HUMMINGBOT_MCP_DIR = ${v}（${src(m)}）—— 与默认部署 ${probes.hummingbotMCP} 不同（引擎可装别处，确认即可）。` });
        }
        // Directory-pointer check: HUMMINGBOT_MCP_DIR must be the hummingbot/mcp
        // repo root (uv --directory <dir> runs main.py). A missing main.py means
        // the var points somewhere else (e.g. the hummingbot install root).
        const mainPy = join(v, 'main.py');
        if (!existsSync(mainPy)) {
          warnCount += 1;
          rows.push({ level: 'warn', text: `HUMMINGBOT_MCP_DIR = ${v} —— 该目录下没找到 main.py，请确认指向 hummingbot/mcp 仓库根（uv --directory 跑 main.py 会失败）。` });
        }
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
    if (m.onlyIfSet && !inProc && !inUser) continue; // no default-noise for path overrides
    if (!inProc && !inUser) {
      rows.push({ level: 'info', text: `${m.key}  未设 → 用默认 ${m.mask ? '(已内置默认凭据)' : m.def}` });
    } else if (m.mask) {
      rows.push({ level: 'ok', text: `${m.key}  (已设，${src(m)})` });
    } else {
      const v = String(inProc ? procEnv[m.key] : userEnv[m.key]);
      const issue = applyPathIssues(m, v, src(m));
      if (issue.handled) {
        if (issue.level === 'err') errCount += 1; else warnCount += 1;
        rows.push({ level: issue.level, text: issue.text });
        if (issue.fix) fixes.push(issue.fix);
        continue;
      }
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

// Dependency readiness — read-only, local, <1s. warn-only (per-role optional).
export function probeDeps({ run, nodeMajor = Number(process.versions.node?.split('.')[0]), platform = process.platform } = {}) {
  const rows = [];
  let warns = 0;
  const real = (cmd, args, o = {}) => {
    try { return { ok: true, out: execFileSync(cmd, args, { encoding: 'utf8', timeout: 5000, windowsHide: true, ...o }).trim() }; }
    catch (e) { return { ok: false, out: (e.stdout || '').toString().trim() || e.message, code: e.status }; }
  };
  const R = run || real;
  // Node version (hard floor: scripts use node:sqlite)
  if (nodeMajor < 26) { rows.push({ level: 'warn', text: `Node ${nodeMajor}（需 ≥26，node:sqlite）→ 请升级 Node。` }); warns += 1; }
  else rows.push({ level: 'ok', text: `Node ${nodeMajor}（≥26 ✓）` });
  // binance-cli (npm v1.3.0 Windows)
  const cli = R('binance-cli', ['--version'], {});
  if (cli.ok) rows.push({ level: 'ok', text: `binance-cli ${cli.out}` });
  else { rows.push({ level: 'warn', text: `binance-cli 未装/未找到 → 手动数据/执行不可用（npm i -g @binance/binance-cli）。` }); warns += 1; }
  // uv (Hummingbot MCP runtime)
  const uv = R('uv', ['--version'], {});
  if (uv.ok) rows.push({ level: 'info', text: `uv ${uv.out}（hummingbot-mcp）` });
  else { rows.push({ level: 'warn', text: `uv 未装 → hummingbot-mcp 不可用（若不用 Hummingbot 可忽略）。` }); warns += 1; }
  // docker (engine runtime)
  const dc = R('docker', ['version', '--format', '{{.Server.Version}}'], {});
  if (dc.ok) rows.push({ level: 'info', text: `Docker Desktop ${dc.out}（引擎容器）` });
  else { rows.push({ level: 'warn', text: `docker 不可达 → Freqtrade/Hummingbot/NFI 引擎容器起不来（若不用引擎可忽略）。` }); warns += 1; }
  // /binance skill (strong dependency, user-level)
  if (platform === 'win32') {
    const p = join(process.env.USERPROFILE || '', '.claude', 'skills', 'binance');
    if (existsSync(p)) rows.push({ level: 'info', text: `/binance skill 在 ${p}` });
    else { rows.push({ level: 'warn', text: `/binance skill 未找到（~/.claude/skills/binance）→ 强依赖缺失，npx skills add binance/binance-skills-hub。` }); warns += 1; }
  }
  return { rows, warns };
}

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
