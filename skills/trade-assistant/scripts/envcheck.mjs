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
        // Both process.env and HKCU user env hold the var — compare the two
        // VALUES, not just presence. This is exactly the process-vs-next-launch
        // drift this check exists to surface (stale setx, or a shell export
        // overriding a newer registry value).
        const norm = (x) => String(x).replace(/\\/g, '/').toLowerCase();
        if (norm(procEnv[m.key]) !== norm(userEnv[m.key])) {
          warnCount += 1;
          rows.push({ level: 'warn', text: `HUMMINGBOT_MCP_DIR 进程 ${procEnv[m.key]} 与注册表 ${userEnv[m.key]} 不一致 → 本会话用进程值，重启后将以注册表值为准。建议 setx HUMMINGBOT_MCP_DIR "${userEnv[m.key]}" 固化` });
          fixes.push(`setx HUMMINGBOT_MCP_DIR "${userEnv[m.key]}"`);
        } else {
          rows.push({ level: 'ok', text: `HUMMINGBOT_MCP_DIR = ${v}（进程+注册表一致）` });
        }
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

// Runtime-environment detection: platform/arch/node, shell hints from the
// process env, and whether the Windows user-env (registry) is inspectable.
// Informs the rest of the checks (registry & canonical engine dirs are
// Windows-only; mac/Linux degrade gracefully). Always info/ok — never blocks.
export function probeRuntime({ procEnv = {}, platform = process.platform, arch = process.arch, nodeVer = Number(process.versions?.node?.split('.')[0]) } = {}) {
  const rows = [];
  let shell = '未知';
  if (procEnv.MSYSTEM) shell = 'Git Bash / MSYS';
  else if (procEnv.PSModulePath || procEnv.COMSPEC?.toLowerCase().includes('cmd.exe')) shell = 'PowerShell / cmd';
  else if (/[/\\](bash|zsh)$/i.test(procEnv.SHELL || '')) shell = procEnv.SHELL.split(/[/\\]/).pop();
  const isWin = platform === 'win32';
  const userEnvNote = isWin ? '用户环境(注册表)可读 → 会对照进程 vs 注册表' : '无注册表 → 只看当前进程 env（mac/Linux）';
  rows.push({ level: 'ok', text: `运行环境：${platform} (${arch}) · Node ${nodeVer} · shell: ${shell} · ${userEnvNote}` });
  if (shell === '未知') rows.push({ level: 'info', text: 'shell：进程 env 无 MSYSTEM / PSModulePath / COMSPEC / SHELL 线索 → 无法推断具体 shell（Git Bash / PowerShell 运行时会自动识别）。' });
  if (!isWin) rows.push({ level: 'info', text: '非 Windows：引擎默认目录探测跳过（无 E:\\trade-bots 概念）；数据层请在 TRADE_HOME 指定，默认 D:/trade 仅为 Windows 示例。' });
  const platformName = isWin ? 'Windows' : { darwin: 'macOS', linux: 'Linux' }[platform] || platform;
  const summary = isWin ? `运行于 Windows · ${shell}` : `运行于 ${platformName} · ${shell} · 只看进程 env`;
  return { rows, summary };
}

// Dependency readiness — read-only, local, <1s. warn-only (per-role optional).
export function probeDeps({ run, nodeMajor = Number(process.versions.node?.split('.')[0]), platform = process.platform } = {}) {
  const rows = [];
  let warns = 0;
  const real = (cmd, args, o = {}) => {
    const attempt = (c, shell) => {
      try {
        const opts = { encoding: 'utf8', timeout: 5000, windowsHide: true, ...o };
        // win32 `.cmd` shims must run through cmd.exe (shell), not CreateProcess.
        // Pass the whole command line (no args array) to avoid Node DEP0190.
        const out = shell
          ? execFileSync(`${c} ${args.join(' ')}`, { ...opts, shell: true }).trim()
          : execFileSync(c, args, opts).trim();
        return { ok: true, out };
      } catch (e) {
        return { ok: false, out: (e.stdout || '').toString().trim() || e.message, code: e.status, errno: e.errno || e.code };
      }
    };
    let r = attempt(cmd, false);
    // npm -g / pip on Windows ship `foo.cmd` shims (binance-cli.cmd, uv.cmd);
    // execFileSync can't spawn an extensionless `foo` or a bare `.cmd`
    // (ENOENT/EINVAL via CreateProcess), which would false-report "未装". Retry
    // the `.cmd` through the shell so cmd.exe resolves it via PATHEXT.
    if (!r.ok && platform === 'win32' && !/\.[A-Za-z0-9]+$/.test(cmd)) r = attempt(`${cmd}.cmd`, true);
    return r;
  };
  const R = run || real;
  // Trim a leading tool-name word from CLI version output (`uv 0.5.0`) so the
  // row label doesn't render "uv uv 0.5.0".
  const ver = (out, tool) => String(out || '').trim().replace(new RegExp(`^${tool}\\s+`, 'i'), '');
  // Node version (hard floor: scripts use node:sqlite)
  if (nodeMajor < 26) { rows.push({ level: 'warn', text: `Node ${nodeMajor}（需 ≥26，node:sqlite）→ 请升级 Node。` }); warns += 1; }
  else rows.push({ level: 'ok', text: `Node ${nodeMajor}（≥26 ✓）` });
  // binance-cli (npm v1.3.0 Windows)
  const cli = R('binance-cli', ['--version'], {});
  if (cli.ok) rows.push({ level: 'ok', text: `binance-cli ${ver(cli.out, 'binance-cli')}` });
  else { rows.push({ level: 'warn', text: `binance-cli 未装/未找到 → 手动数据/执行不可用（npm i -g @binance/binance-cli）。` }); warns += 1; }
  // uv (Hummingbot MCP runtime)
  const uv = R('uv', ['--version'], {});
  if (uv.ok) rows.push({ level: 'info', text: `uv ${ver(uv.out, 'uv')}（hummingbot-mcp）` });
  else { rows.push({ level: 'warn', text: `uv 未装 → hummingbot-mcp 不可用（若不用 Hummingbot 可忽略）。` }); warns += 1; }
  // docker (engine runtime)
  const dc = R('docker', ['version', '--format', '{{.Server.Version}}'], {});
  if (dc.ok) rows.push({ level: 'info', text: `Docker Desktop ${ver(dc.out, 'docker')}（引擎容器）` });
  else { rows.push({ level: 'warn', text: `docker 不可达 → Freqtrade/Hummingbot/NFI 引擎容器起不来（若不用引擎可忽略）。` }); warns += 1; }
  // /binance skill (strong dependency, user-level)
  if (platform === 'win32') {
    const p = join(process.env.USERPROFILE || '', '.claude', 'skills', 'binance');
    if (existsSync(p)) rows.push({ level: 'info', text: `/binance skill 在 ${p}` });
    else { rows.push({ level: 'warn', text: `/binance skill 未找到（~/.claude/skills/binance）→ 强依赖缺失，npx skills add binance/binance-skills-hub。` }); warns += 1; }
  }
  return { rows, warns };
}

// Network reachability — read-only. fapi must go THROUGH the local proxy
// (direct is blocked in CN). Engine ports warn-only (optional engines).
export function probeNet({ run, proxy = 'http://127.0.0.1:7897', ms = 6000, platform = process.platform } = {}) {
  const rows = []; let errs = 0, warns = 0;
  const nullDev = platform === 'win32' ? 'NUL' : '/dev/null';
  const real = (url, viaProxy) => {
    const args = ['-sS', '-m', String(Math.ceil(ms / 1000)), '-o', nullDev, '-w', '%{http_code}'];
    if (viaProxy) args.push('-x', proxy);
    args.push(url);
    try {
      const out = String(execFileSync('curl', args, { encoding: 'utf8', timeout: ms, windowsHide: true })).trim();
      const code = Number(out) || 0;
      return { ok: code >= 200 && code < 500, code };   // 401/403 = up (auth)
    } catch (e) { return { ok: false, code: 0 }; }
  };
  const R = run || real;
  const ping = (label, url, viaProxy) => R(url, viaProxy);

  const fapiVia = ping('fapi-via-proxy', 'https://fapi.binance.com/fapi/v1/ping', true);
  const fapiDirect = ping('fapi-direct', 'https://fapi.binance.com/fapi/v1/ping', false);
  if (fapiVia.ok) rows.push({ level: 'ok', text: `币安 fapi（经代理 ${proxy}）OK` });
  else {
    errs += 1;
    rows.push({ level: 'err', text: `币安 fapi 经代理 ${proxy} 不通 → 行情/交易不可用。检查 Clash 是否在 7897、代理是否连上。${fapiDirect.ok ? '（直连反而通 → 当前脚本强制走代理，可 BINANCE_PROXY 指到可用代理）' : '（直连也不通 → 被墙或断网）'}` });
  }
  if (!fapiVia.ok && fapiDirect.ok) { warns += 1; rows.push({ level: 'warn', text: '直连 fapi 通、代理不通：网络层 OK 但代理配置错，脚本会失败。' }); }

  // engines (default REST ports; warn-only)
  const engines = [
    ['Freqtrade', 'http://127.0.0.1:8080/api/v1/ping'],
    ['Hummingbot API', 'http://127.0.0.1:8000/'],
    ['NFI', 'http://127.0.0.1:8989/api/v1/ping'],
  ];
  for (const [name, url] of engines) {
    const r = ping(name, url, false);
    if (r.ok) rows.push({ level: 'ok', text: `${name} ${url} 通` });
    else { warns += 1; rows.push({ level: 'warn', text: `${name} ${url} 不通（未启动或未部署；要用它先启动引擎）` }); }
  }
  return { rows, errs, warns };
}

// Env-driven net seam for deterministic CLI tests (repo convention: env hooks
// like MOCK_FAPI — a parent-process function override can't reach an
// execFileSync-spawned child). Only consulted when --net is passed.
function fakeNetRes(how) {
  const proxy = process.env.BINANCE_PROXY || 'http://127.0.0.1:7897';
  if (how === 'err') {
    return {
      rows: [{ level: 'err', text: `币安 fapi 经代理 ${proxy} 不通（ENVCHECK_FAKE_NET=err 模拟）→ 行情/交易不可用。` }],
      errs: 1,
      warns: 0,
    };
  }
  return {
    rows: [{ level: 'ok', text: `币安 fapi（经代理 ${proxy}）OK（ENVCHECK_FAKE_NET=ok 模拟）` }],
    errs: 0,
    warns: 0,
  };
}

function main() {
  const args = process.argv.slice(2);
  const wantNet = args.includes('--net');
  const wantDeps = !args.includes('--no-deps');
  // Runtime first: OS/arch/node + shell hints + registry-inspectability. This
  // line never blocks — it only informs the rows below. Non-win machines have
  // no E:\trade-bots concept, so probes are emptied (runtime row already notes
  // the mac/Linux degrade); win32 keeps the canonical-dir probes.
  const runtime = probeRuntime({ procEnv: process.env });
  const runtimeIsWin = process.platform === 'win32';
  const userEnv = userEnvReader();
  const envRes = analyzeEnv({ procEnv: process.env, userEnv, probes: runtimeIsWin ? PROBES() : {} });
  const tag = { ok: '[OK]', info: '[·]', warn: '[!]', err: '[✗]' };

  const rows = [...runtime.rows, ...envRes.rows];
  let depRes = null;
  if (wantDeps) {
    depRes = probeDeps({});
    rows.push(...depRes.rows.map((r) => ({ ...r, text: `[依赖] ${r.text}` })));
  }

  let netRes = null;
  if (wantNet) {
    const fake = process.env.ENVCHECK_FAKE_NET;
    netRes = fake === 'err' || fake === 'ok' ? fakeNetRes(fake) : probeNet({});
    rows.push(...netRes.rows.map((r) => ({ ...r, text: `[网络] ${r.text}` })));
  }

  let errCount = envRes.errCount;
  if (netRes && netRes.errs) errCount += netRes.errs;

  // Combined summary: decide the 通过/问题 stem on the FINAL combined error
  // state (env errs + net errs), not env alone — a clean env whose --net probe
  // fails (combined errCount>0, env clean) must NOT print 通过.
  const extra = [];
  if (depRes && depRes.warns) extra.push(`${depRes.warns} 个依赖警告`);
  if (netRes && (netRes.errs || netRes.warns)) extra.push(`${netRes.errs} 个网络错误/${netRes.warns} 个网络警告`);
  const suffix = extra.length ? ` · ${extra.join(' · ')}` : '';
  let summary;
  if (errCount > 0 && envRes.errCount === 0) {
    summary = `环境自检：${errCount} 个问题${suffix}。`;
  } else {
    summary = extra.length ? `${envRes.summary.replace(/。$/, '')}${suffix}。` : envRes.summary;
  }

  for (const r of rows) console.log(`${tag[r.level]} ${r.text}`);
  console.log('');
  console.log(`${summary} · ${runtime.summary}`);
  if (envRes.fixes.length) {
    console.log('修复（需你 CONFIRM 后 agent 才执行 setx；改后完全重启 Claude Code 生效）:');
    for (const f of envRes.fixes) console.log(`  ${f}`);
  } else if (userEnv === null && process.platform === 'win32') {
    console.log('注：读不到 Windows 用户环境(注册表)，只能看当前进程 env；固化请用 setx。');
  }
  process.exit(errCount ? 2 : 0);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) main();
