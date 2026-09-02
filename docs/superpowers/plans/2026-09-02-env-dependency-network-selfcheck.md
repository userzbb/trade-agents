# Env · Dependency · Network 三层自检（envcheck.mjs v2）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `scripts/envcheck.mjs` 从「环境变量自检」扩展成**三层自检**：① 环境（Windows 用户环境 vs 当前进程的插件依赖变量）+ ② 依赖（node/uv/docker/binance-cli//binance skill 是否就绪）+ ③ 网络联通（代理→`fapi.binance.com` ping、Freqtrade/Hummingbot/NFI REST 是否通）——一次跑完，只读、快、中文输出、修复仍走 CONFIRM。

**Architecture:** `envcheck.mjs` 保持零依赖单文件。导出层与 CLI 层分离（现有 `analyzeEnv` 纯函数模式）延续：新增纯函数 `probeDeps({run})` 与 `probeNet({run, ms})`（依赖/网络探测函数经注入的 `run(cmd)→{ok,out,code}` 调用，CLI 里注入真实 curl/exec 实现，测试注入 fake）。CLI 默认跑 env+deps（本地、~瞬间）；`--net` 追加网络联通（curl 短超时，总耗时上限 ~15s）。退出码：env 必需缺失 → 2；`--net` 下 fapi 代理 ping 失败 → 2；其余 warn 不阻塞。SKILL 会话首个交易请求仍只跑本地层（不因网络变慢），网络层在「网络联通/为什么连不上/交易前」由 agent 按需 `--net`。

**Tech Stack:** Node（零依赖，仅 `node:child_process`/`node:fs`/`node:path`）；探测经 `execFileSync`/`execFile` 调 `curl`（Windows 10+ 自带）、`reg query`（读用户环境）；`node:test` 单测。

**Spec:** (inline) 由本会话用户决策 + 审计结果定义：
- 依赖项判断标准（引用 CLAUDE.md / SKILL.md Env Facts / README 依赖表）：Node **≥26**（脚本依赖 `node:sqlite`）；curl 系统自带；`/binance` skill 强依赖（`~/.claude/skills/binance`）；binance-cli npm v1.3.0；uv（Hummingbot MCP）；Docker Desktop（引擎）。这些多数**可选/分场景**——缺了只 warn，指明影响哪块，不阻塞（用户可能不用对应引擎）。
- 网络联通标准：直连币安被墙 → 必须走本地代理 `http://127.0.0.1:7897`；`curl -x <proxy> https://fapi.binance.com/fapi/v1/ping` 返回 `{"ping":"pong"}` 即通。引擎默认 REST：Freqtrade `http://127.0.0.1:8080/api/v1/ping`、Hummingbot API `http://127.0.0.1:8000/`、NFI `http://127.0.0.1:8989/api/v1/ping`。
- 语言边界：脚本注释英文、用户输出中文；脚本只读，`setx` 修复永远走 agent→CONFIRM→`setx`→完全重启 Claude Code（已写入 SKILL.md Environment Self-Check，本次不重造）。
- 平台：Windows 11 为主；跨平台非 win 时跳过注册表/网络层不崩。

## Global Constraints

- 零 npm 依赖；只用 `node:` 内置。
- 输出中文；注释英文。
- **只读**：任何探测不得写环境/文件/配置；`setx` 仅由 agent 在用户 CONFIRM 后执行（本计划不实现 setx 调用）。
- 每次 CLI 探测不得等待超过 ~15s（网络层总上限）；本地层必须 <1s。
- 新行为都配 `tests/envcheck.test.mjs` 用例；跑法 `node --test tests/envcheck.test.mjs`（Windows 用 glob，勿传目录）。
- 复用现文件结构与命名：`analyzeEnv`/`readUserEnv`/`__setUserEnvReaderForTest`、`MANAGED`、`PROBES()`、`rows/fixes/errCount/warnCount/summary` 形状不变（新增字段向后兼容）。
- 文档纪律（conventions §9 / development.md）：SKILL.md、docs/skill-guide.md、docs/usage.md、CLAUDE.md（如触）同步；版本已在 0.4.0（未 push），本计划产出并入 0.4.0。

## 现状基线（executor 须知，勿重读可先信）

`skills/trade-assistant/scripts/envcheck.mjs` v1 结构：
- 导出 `analyzeEnv({procEnv,userEnv,probes})` → `{rows:[{level:'ok'|'info'|'warn'|'err',text}], errCount, warnCount, fixes, summary}`。
- 导出 `readUserEnv()`（win 下 `reg query HKCU\Environment` → map；非 win/失败 → null）；`__setUserEnvReaderForTest(fn)`。
- 模块内 `MANAGED`（9 项，含 `HUMMINGBOT_MCP_DIR`(severity 'required-if-used') / 8 个 optional）、`PROBES()`（freqtrade/hummingbotMCP/nfi 目录）、`main()` CLI、退出码 0/2。
- v1 已做：必需缺失→setx(canon 或探测目录)；MSYS `/x/` 路径(仅对 HUMMINGBOT_MCP_DIR)→err；非 Windows 绝对路径→warn；进程 vs 注册表差异→warn/info；密码掩码；`/e/...` 教学。

`tests/envcheck.test.mjs` v1：10 个用例，import `analyzeEnv`，helper `probes`/`probesNoMCP`（tmp dir），`all(res)=rows.text join`。

相关文档：
- `skills/trade-assistant/SKILL.md`：`## Environment Self-Check (once per session…)` 段（行 ~83-93 前已插入）、`## Environment Facts` item1 第 87 行 `export HTTPS_PROXY=…`、工具箱表 `envcheck.mjs` 行、Known issue 第 145 行 fallback。
- `agents/binance-orchestrator.md:63`：`Proxy: export HTTPS_PROXY=… before any binance-cli call`（跨 Bash 调用 export 不保证持久 → 应内联）。
- `docs/skill-guide.md` 工具箱表 `envcheck.mjs` 行；`docs/usage.md` 场景行 + 命令行。

## 文件结构

- Modify: `skills/trade-assistant/scripts/envcheck.mjs`（任务 1/2/3/4 全在此文件，按任务渐进）
- Modify: `tests/envcheck.test.mjs`（每任务加用例）
- Modify: `skills/trade-assistant/SKILL.md`（任务 5：三层触发 + Env Facts item1 / Known issue 内联 export + 工具箱行 --net）
- Modify: `agents/binance-orchestrator.md`（任务 5：line 63 内联 export）
- Modify: `docs/skill-guide.md`、`docs/usage.md`（任务 5：envcheck 行加 --net/依赖/网络触发）
- Create: 无新文件（保持单文件自检脚本）

---

### Task 1: env 层泛化 MSYS/路径检查 + `HUMMINGBOT_MCP_DIR` 指向校验

**Files:**
- Modify: `skills/trade-assistant/scripts/envcheck.mjs`（MANAGED 加 `onlyIfSet` 与 `path` 字段；抽 `applyPathIssues(m, v, src)`）
- Test: `tests/envcheck.test.mjs`

**Interfaces:**
- Consumes: `MANAGED`、`analyzeEnv({procEnv,userEnv,probes})`、`probes.hummingbotMCP`（目录）。
- Produces: `analyzeEnv` 返回同形状；MANAGED 每项可选新字段 `onlyIfSet?:boolean`、`path?:boolean`。新增对**所有 set 且值为 `/x/...`** 的变量的 MSYS 检查（`HUMMINGBOT_MCP_DIR` err、其他 warn 并给转换建议）；对 `path:true` 且 set 的变量做「非 Windows 绝对路径→warn」；`HUMMINGBOT_MCP_DIR` 指向目录缺 `main.py`→warn。

- [ ] **Step 1: 写失败测试（MSYS 泛化 + main.py 校验）**

在 `tests/envcheck.test.mjs` 追加：

```js
test('Task1: 其他路径变量设 MSYS /x/ → warn（非 err）并给转换建议', () => {
  const res = analyzeEnv({ procEnv: { HUMMINGBOT_MCP_DIR: W, TRADE_HOME: '/d/trade' }, userEnv: { HUMMINGBOT_MCP_DIR: W }, probes: probesNoMCP });
  assert.equal(res.errCount, 0);            // MSYS 在可选变量上只 warn
  assert.ok(res.warnCount >= 1, all(res));
  assert.match(all(res), /TRADE_HOME.*MSYS/);
  assert.match(all(res), /setx TRADE_HOME "D:\\trade"/); // 转换建议
});

test('Task1: HUMMINGBOT_MCP_DIR 指向目录无 main.py → warn', () => {
  const res = analyzeEnv({ procEnv: {}, userEnv: { HUMMINGBOT_MCP_DIR: probesNoMCP.hummingbotMCP }, probes: probesNoMCP });
  assert.equal(res.errCount, 0);
  assert.match(all(res), /没找到 main\.py/);
});

test('Task1: HUMMINGBOT_MCP_DIR 指向含 main.py 目录 → 无该 warn', () => {
  writeFileSync(join(probesNoMCP.hummingbotMCP, 'main.py'), '');
  const res = analyzeEnv({ procEnv: {}, userEnv: { HUMMINGBOT_MCP_DIR: probesNoMCP.hummingbotMCP }, probes: probesNoMCP });
  assert.ok(!all(res).includes('没找到 main.py'), all(res));
});
```

（文件顶部补 `import { writeFileSync } from 'node:fs';`，`W` 沿用 v1 常量。）

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/envcheck.test.mjs`
Expected: 新增 3 用例 FAIL（现 `analyzeEnv` 无此逻辑；`/d/trade` 当前走 HUMMINGBOT 专属分支不命中、无 main.py 检查、写文件后也无检查）。

- [ ] **Step 3: 实现泛化路径检查**

在 `envcheck.mjs` 加辅助（放 `analyzeEnv` 外、`MANAGED` 后）：

```js
// MSYS drive-path (/x/...) in a var value → returns Windows suggestion or null.
export function msysFix(v) {
  const m = v.trim().match(/^\/\s*([a-zA-Z])\/(.*)$/);
  if (!m) return null;
  return `${m[1].toUpperCase()}:\\${m[2]}`;
}
```

`MANAGED` 增两字段与两项：

```js
// (在既存 9 项之后追加两项；onlyIfSet=true → 未设不打印，减少噪音)
{ key: 'TRADE_DB', severity: 'optional', def: '', mask: false, onlyIfSet: true, path: true, consumer: 'db.mjs SQLite 路径覆盖（默认 ${TRADE_HOME}/data/trade.db）' },
{ key: 'VECTOR_INDEX_PATH', severity: 'optional', def: '', mask: false, onlyIfSet: true, path: true, consumer: 'vector.mjs 索引缓存覆盖（默认 ${TRADE_HOME}/vector-index.json）' },
```

`analyzeEnv` 内 optional 分支改成：`onlyIfSet && !inProc && !inUser → continue`（跳过）；并在“optional vars — defaulted”分支与 `HUMMINGBOT_MCP_DIR` 的“已设”路径里各插入统一检查：

```js
const msysV = msysFix(v);                       // v = 用户实际设的值
if (/^\/[a-zA-Z]\//.test(v)) {
  const isReq = m.key === 'HUMMINGBOT_MCP_DIR';
  if (isReq) { /* 保留现有 err 分支语义，由既有代码先处理 */ }
  else {
    warnCount += 1;
    rows.push({ level: 'warn', text: `${m.key} = ${v}（${src}）—— MSYS 路径(/${v[1]}/)，Windows 原生进程解析不了；改 ${msysV}。建议 setx ${m.key} "${msysV}"` });
    fixes.push(`setx ${m.key} "${msysV}"`);
  }
  continue;
}
```

> 实现提示：把 v1 里 `HUMMINGBOT_MCP_DIR` 独占的 MSYS/绝对路径块抽出成 `applyPathIssues(m, v, src)`（返回 `{handled, level?, text?}`），使 `HUMMINGBOT_MCP_DIR`(err) 与 `path:true` optional(warn) 共用；可选路径变量的绝对路径检查仅当 `m.path===true` 且值已设时执行。别删 v1 的 err 语义与测试期望（v1 10 用例须保持绿）。

`HUMMINGBOT_MCP_DIR` 已设且为 Windows 绝对路径时，追加 main.py 指向校验：

```js
const mainPy = join(v, 'main.py');             // import { join } from 'node:path'
if (!existsSync(mainPy)) {
  warnCount += 1;
  rows.push({ level: 'warn', text: `HUMMINGBOT_MCP_DIR = ${v} —— 该目录下没找到 main.py，请确认指向 hummingbot/mcp 仓库根（uv --directory 跑 main.py 会失败）。` });
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test tests/envcheck.test.mjs`
Expected: v1 10 用例仍绿 + 新 3 用例绿。

- [ ] **Step 5: 提交**

```bash
git add skills/trade-assistant/scripts/envcheck.mjs tests/envcheck.test.mjs
git commit -m "feat(envcheck): generalize MSYS/abs-path checks to all path vars + main.py probe"
```

---

### Task 2: 依赖自检（纯函数 + CLI 常开）

**Files:**
- Modify: `skills/trade-assistant/scripts/envcheck.mjs`
- Test: `tests/envcheck.test.mjs`

**Interfaces:**
- Consumes: 无（新纯函数）。
- Produces: 导出 `probeDeps({ run, nodeMajor = Number(process.versions.node.split('.')[0]), platform = process.platform }) → { rows, warns }`；`run(cmd, args, opts)` 注入（CLI 用 `execFileSync`，测试用 fake）。CLI `main()` 默认调用 `probeDeps`，行插到 env 行之后、探测行之前。

- [ ] **Step 1: 写失败测试**

```js
test('Task2: probeDeps 依赖探测（fake run）', () => {
  const calls = [];
  const run = (cmd, args, opts) => {
    calls.push(cmd);
    const bin = String(args[0]);
    if (bin.includes('uv')) return { ok: true, out: 'uv 0.5.0' };
    if (bin.includes('docker')) return { ok: false, out: 'error during connect', code: 1 };
    if (bin.includes('binance-cli')) return { ok: true, out: 'v1.3.0' };
    throw new Error('no such cmd');
  };
  const res = probeDeps({ run, nodeMajor: 26, platform: 'win32' });
  const txt = res.rows.map((r) => r.text).join('\n');
  assert.match(txt, /Node 26/);          // ok
  assert.match(txt, /uv/);
  assert.match(txt, /docker/);           // warn 行（引擎运行时）
  assert.match(txt, /binance-cli/);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/envcheck.test.mjs` → 新用例 FAIL（无 `probeDeps`）。

- [ ] **Step 3: 实现 `probeDeps`**

```js
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

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
```

- [ ] **Step 4: 跑测试确认通过**（同上命令，新旧全绿）
- [ ] **Step 5: 提交**（`feat(envcheck): dependency self-check probeDeps (node/binance-cli/uv/docker/binance-skill)`，文件同上）

---

### Task 3: 网络联通自检（`--net`，纯函数 + 注入 run）

**Files:**
- Modify: `skills/trade-assistant/scripts/envcheck.mjs`
- Test: `tests/envcheck.test.mjs`

**Interfaces:**
- Consumes: `PROBES()`（引擎目录——仅决定是否给出引擎说明），无其他。
- Produces: 导出 `probeNet({ run, proxy = 'http://127.0.0.1:7897', ms = 6000 }) → { rows, errs, warns }`。CLI 收到 `--net` 才调用。探测方式一律 `run('curl', ['-sS','-m','6','-o','NUL','-w','%{http_code}', ...])`（win 下 `NUL`；非 win `/dev/null`，由 run 注入归一，CLI 内部按 platform 选）。成功=http 码 200（或 401/403 = 服务在、需认证：仍算「通」）。fapi 经代理失败 → err（进退出码 2）。

- [ ] **Step 1: 写失败测试**

```js
const netRun = (cmd, args) => {
  const url = args[args.length - 1];
  if (url.includes('fapi.binance.com') && args.includes('-x')) return { ok: true, code: 200 };
  if (url.includes('fapi.binance.com')) return { ok: false, code: 0 };   // 直连不通（被墙）
  if (url.includes('127.0.0.1:8080')) return { ok: true, code: 200 };
  if (url.includes('127.0.0.1:8000')) return { ok: false, code: 0 };
  return { ok: false, code: 0 };
};

test('Task3: probeNet — fapi 经代理通 + Freqtrade up + Hummingbot down', () => {
  const res = probeNet({ run: netRun, ms: 3000 });
  const txt = res.rows.map((r) => r.text).join('\n');
  assert.equal(res.errs, 0);
  assert.match(txt, /币安 fapi.*代理.*OK/);
  assert.match(txt, /Freqtrade 8080.*通/);
  assert.match(txt, /Hummingbot 8000.*不通/);
  assert.match(txt, /NFI 8989/);
});

test('Task3: probeNet — 代理 ping 失败 → err', () => {
  const bad = (cmd, args) => ({ ok: false, code: 0 });
  const res = probeNet({ run: bad, ms: 500 });
  assert.ok(res.errs >= 1);
  assert.match(res.rows.map((r) => r.text).join('\n'), /代理.*不通|fapi.*不通/);
});
```

- [ ] **Step 2: 跑测试确认失败**（无 `probeNet` → FAIL）
- [ ] **Step 3: 实现 `probeNet`**

```js
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
```

- [ ] **Step 4: 跑测试确认通过**
- [ ] **Step 5: 提交**（`feat(envcheck): network self-check probeNet --net (fapi via proxy + engine REST)`）

---

### Task 4: CLI 接线（`--net`/`--deps` 语义 + 汇总 + 退出码）

**Files:**
- Modify: `skills/trade-assistant/scripts/envcheck.mjs`（`main()`）
- Test: `tests/envcheck.test.mjs`

**Interfaces:**
- Consumes: `analyzeEnv`、`probeDeps`、`probeNet`、`readUserEnv`。
- Produces: CLI 输出 = env 行 → deps 行 →（`--net` 时）net 行 → 汇总 → fixes。退出码：env err>0 → 2；`--net` 且 net err>0 → 2；否则 0（warn 不阻塞）。新增 flag 解析：`--net`、`--deps`(默认 true，加 `--no-deps` 可关，可选实现)。

- [ ] **Step 1: 写 CLI 失败测试**

```js
test('Task4 CLI: --net 且 fapi 代理不通 → exit 2', () => {
  const old = globalThis.__fakeNet; // 占位：见 Step3，用 __setNetRunnerForTest 注入
  // 通过注入 fake probeNet 需要导出层：用 __setProbeNetForTest(fn)
  setProbeNetForTest(() => ({ rows: [{ level: 'err', text: '币安 fapi 不通' }], errs: 1, warns: 0 }));
  let code = 0;
  try { execFileSync('node', [ENVCHECK, '--net'], { encoding: 'utf8', env: { ...process.env, HUMMINGBOT_MCP_DIR: W } }); }
  catch (e) { code = e.status; }
  assert.equal(code, 2);
});
```

（测试文件需 `import { __setProbeNetForTest, __setUserEnvReaderForTest }`；实现见下。）

- [ ] **Step 2: 跑测试确认失败**（无 `--net` 分支 → exit 0，断言 FAIL）
- [ ] **Step 3: 实现 CLI**

```js
// 测试注入（probeNet/probeDeps 运行器）
let netRunner = null; let depsRunner = null;
export function __setProbeNetForTest(fn) { netRunner = fn; }
export function __setProbeDepsForTest(fn) { depsRunner = fn; }

function main() {
  const args = process.argv.slice(2);
  const wantNet = args.includes('--net');
  const userEnv = userEnvReader();
  const envRes = analyzeEnv({ procEnv: process.env, userEnv, probes: PROBES() });
  const depRes = depsRunner ? depsRunner() : probeDeps({});
  const rows = [
    ...envRes.rows,
    ...depRes.rows.map((r) => ({ ...r, text: `[依赖] ${r.text}` })),
  ];
  let errCount = envRes.errCount;
  const netRes = wantNet ? (netRunner ? netRunner() : probeNet({})) : null;
  if (netRes) { rows.push(...netRes.rows.map((r) => ({ ...r, text: `[网络] ${r.text}` }))); if (netRes.errs) errCount += netRes.errs; }
  // 汇总行
  const parts = [];
  if (envRes.errCount) parts.push(`${envRes.errCount} 个 env 必需问题`);
  if (depRes.warns) parts.push(`${depRes.warns} 个依赖警告`);
  if (netRes && (netRes.errs || netRes.warns)) parts.push(`${netRes.errs} 网络错误/${netRes.warns} 网络警告`);
  const summary = parts.length ? `自检：${parts.join(' · ')}。` : '自检通过（env+依赖 OK）。';
  // 打印 + fixes（沿用 v1）
  const tag = { ok: '[OK]', info: '[·]', warn: '[!]', err: '[✗]' };
  for (const r of rows) console.log(`${tag[r.level]} ${r.text}`);
  console.log('');
  console.log(summary);
  if (envRes.fixes.length) {
    console.log('修复（需你 CONFIRM 后 agent 才执行 setx；改后完全重启 Claude Code 生效）:');
    for (const f of envRes.fixes) console.log(`  ${f}`);
  }
  process.exit(errCount ? 2 : 0);
}
```

> 提示：测试文件里 `import { __setProbeNetForTest } from ...` 后必须 `test.after` 复位（设回走真实/不影响其他用例）；`setProbeNetForTest` 变量名以实际导出为准（上面命名 `__setProbeNetForTest`）。

- [ ] **Step 4: 跑测试确认通过**；再手动跑真机确认不慢：`node skills/trade-assistant/scripts/envcheck.mjs --net`（本机应 fapi 经代理 OK、三引擎按实际起没起）
- [ ] **Step 5: 提交**（`feat(envcheck): CLI --net wiring + combined summary/exit code`）

---

### Task 5: SKILL / agents / docs 接线（三层触发 + 内联 export 修复）

**Files:**
- Modify: `skills/trade-assistant/SKILL.md`
- Modify: `agents/binance-orchestrator.md:63`
- Modify: `docs/skill-guide.md`、`docs/usage.md`
- Test: 无（纯文档；语法/一致性靠 grep）

**Interfaces:**
- Consumes: 本计划各任务的 CLI 语义（`envcheck.mjs` 默认 env+deps、`--net` 加网络）。
- Produces: 用户/agent 可执行触发词（网络联通/依赖自检/环境自检）。

- [ ] **Step 1: SKILL.md Environment Self-Check 段改写为三层触发**

把现有 `## Environment Self-Check` 段开头改成：

```markdown
Run `node scripts/envcheck.mjs` **once per session** on the first trade-related
request (local only: env vars + dependency readiness — instant). When the user
asks **网络联通/为什么连不上/交易前** or reports a network/proxy/engine
problem, run `node scripts/envcheck.mjs --net` (adds fapi-via-proxy + engine
REST reachability; ~≤15s). Keep steps 2-4 (table → setx plan → user CONFIRM →
restart Claude Code). A dependency/network failure is warn-only unless it is
the required env var or `--net` fapi-proxy failure (exit 2).
```

- [ ] **Step 2: Env Facts + Known issue 的 export 改内联（同类 bug 修复）**

`## Environment Facts` item 1 第 87 行由：

```markdown
   - binance-cli: `export HTTPS_PROXY=http://127.0.0.1:7897 HTTP_PROXY=http://127.0.0.1:7897`
```

改为（跨 Bash 调用 export 不保证保留，须同一次调用内联）：

```markdown
   - binance-cli (same Bash call, env prefix — a bare `export` may not survive across calls):
     `HTTPS_PROXY=http://127.0.0.1:7897 HTTP_PROXY=http://127.0.0.1:7897 binance-cli <cmd>`
```

Known issue 第 145 行 fallback 同理改内联前缀形式。

- [ ] **Step 3: 工具箱表 + agents 文档**

SKILL 工具箱 `envcheck.mjs` 行（现 `| envcheck.mjs | env self-check: ... |`）补 `--net`：用途列加「默认 env+依赖；`--net` 追加网络联通（代理→fapi、三引擎 REST）」；何时用列补「网络联通/为什么连不上」。

`agents/binance-orchestrator.md:63` 由 `Proxy: export HTTPS_PROXY=… before any binance-cli call.` 改为：

```markdown
- Proxy (inline with the call — `export` in a prior separate Bash call is NOT guaranteed to persist):
  `HTTPS_PROXY=http://127.0.0.1:7897 HTTP_PROXY=http://127.0.0.1:7897 binance-cli <cmd>`
```

- [ ] **Step 4: docs/skill-guide.md + docs/usage.md 同步**

- skill-guide 工具箱 `envcheck.mjs` 行：用途补「`--net` 网络联通（代理→fapi、引擎 REST）」；何时用补「网络联通/为什么连不上/交易前」。
- usage.md 场景表 `envcheck` 行：「网络联通/为什么连不上」触发 → skill → `envcheck.mjs --net`；命令速查补一行 `node envcheck.mjs --net   # 追加网络联通自检（代理→fapi + 三引擎 REST）`。
- 一致性 grep：`grep -rn "envcheck" skills/trade-assistant/SKILL.md docs/skill-guide.md docs/usage.md agents/` 三处触发词一致。

- [ ] **Step 5: 全量测试 + 提交**

Run: `node --test tests/*.test.mjs` → 全绿（应 ≥42+本计划新增，约 48）。
```bash
git add skills/trade-assistant/SKILL.md agents/binance-orchestrator.md docs/skill-guide.md docs/usage.md
git commit -m "docs: envcheck 三层触发接线（网络联通 --net）+ 修复 agents/SKILL 里跨调用 export"
```

---

## Self-Review

- **Spec coverage**：① env 层 —— Task1（MSYS 泛化、main.py 指向、绝对路径校验，env var 表补 TRADE_DB/VECTOR_INDEX_PATH）；② 依赖 —— Task2 probeDeps（node≥26/curl/binance-cli/uv/docker//binance skill，除 node 地板外 warn-only）；③ 网络 —— Task3 probeNet（代理→fapi err、引擎 REST warn、直连 vs 代理诊断）；④ 触发/安全 —— Task4 CLI `--net`、退出码；Task5 SKILL 三层触发词 + 修复 SKILL/orchestrator 跨调用 export（审计残留 B 类）；只读 + setx 走 CONFIRM 约束全文保持。网络直连被墙/代理 7897 的 Env Facts 语义落到 Task3。
- **Placeholder scan**：无 TBD/TODO；每步含可跑代码或精确改动文本。
- **Type/命名一致性**：`probeDeps`/`probeNet` 均 `{rows, errs?, warns?}`（env 用 errCount/warnCount，注意 CLI 拼接时只映射 text，字段名各函数自洽）；注入名 `__setProbeNetForTest`/`__setProbeDepsForTest`/`__setUserEnvReaderForTest`；`msysFix` 导出且唯一；`onlyIfSet`/`path` 新 MANAGED 字段只影响新增分支。v1 导出与 10 用例不破坏。
- **已知边界**：hummingbot-mcp 真正读的 env 名（HUMMINGBOT_USERNAME/PASSWORD 由 .mcp.json 映射）不在自检范围——envcheck 只查用户要设的 `HUMMINGBOT_API_*`（文档一致）。引擎探测用默认端口、不因目录探测跳过——如实反映「REST 通不通」。
