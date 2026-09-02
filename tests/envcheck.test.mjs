import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, delimiter as pathDelim } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ENVCHECK = join(ROOT, 'skills', 'trade-assistant', 'scripts', 'envcheck.mjs');
const { analyzeEnv, probeDeps, probeNet } = await import('../skills/trade-assistant/scripts/envcheck.mjs');

const W = 'E:\\trade-bots\\hummingbot\\mcp'; // 文档 canonical（仅当探测路径不存在时作为 setx 建议）
const all = (res) => res.rows.map((r) => r.text).join('\n');

// 用临时目录做探测路径，保证 existsSync 结果跨机器确定
const dir = mkdtempSync(join(tmpdir(), 'envcheck-test-'));
const probes = {
  freqtrade: join(dir, 'fq'),
  hummingbotMCP: join(dir, 'mcp'),
  nfi: join(dir, 'nfi'),
};
const probesNoMCP = { ...probes, hummingbotMCP: join(dir, 'no-such-mcp') };
mkdirSync(probes.hummingbotMCP, { recursive: true }); // 仅 mcp 存在
test.after(() => rmSync(dir, { recursive: true, force: true }));

test('envcheck: 全未设 → HUMMINGBOT_MCP_DIR err + setx(canon)；密码不打明文', () => {
  const res = analyzeEnv({ procEnv: {}, userEnv: {}, probes: probesNoMCP });
  assert.ok(res.errCount >= 1);
  assert.match(all(res), /HUMMINGBOT_MCP_DIR\s+未设/);
  assert.ok(res.fixes.some((f) => f.includes('setx HUMMINGBOT_MCP_DIR "E:\\trade-bots\\hummingbot\\mcp"')), all(res));
  assert.match(res.summary, /必需问题/);
  assert.ok(!all(res).includes('hb_p1_paper_2026')); // 默认凭据掩码
  assert.ok(!all(res).includes('hb_p1_ft_2026'));
});

test('envcheck: 未设但默认探测路径存在 → setx 指向探测到的路径', () => {
  const res = analyzeEnv({ procEnv: {}, userEnv: {}, probes });
  assert.ok(res.fixes.some((f) => f.includes(probes.hummingbotMCP)), all(res));
});

test('envcheck: MSYS /x/ 路径 → err（Windows 原生解析不了）+ setx 绝对路径', () => {
  const res = analyzeEnv({ procEnv: { HUMMINGBOT_MCP_DIR: '/e/trade-bots/hummingbot/mcp' }, userEnv: {}, probes: probesNoMCP });
  assert.ok(res.errCount >= 1);
  assert.match(all(res), /MSYS/);
  assert.ok(res.fixes.some((f) => f.includes('E:\\trade-bots\\hummingbot\\mcp')));
});

test('envcheck: 进程+注册表一致 → OK（0 err）', () => {
  const res = analyzeEnv({ procEnv: { HUMMINGBOT_MCP_DIR: W }, userEnv: { HUMMINGBOT_MCP_DIR: W }, probes: probesNoMCP });
  assert.equal(res.errCount, 0);
  assert.match(all(res), /进程\+注册表一致/);
});

test('envcheck F1: 进程+注册表都设但值不一致 → warn（非 err）提示不一致 + setx 固化建议', () => {
  const res = analyzeEnv({ procEnv: { HUMMINGBOT_MCP_DIR: 'E:/a/mcp' }, userEnv: { HUMMINGBOT_MCP_DIR: 'F:/b/mcp' }, probes: probesNoMCP });
  assert.equal(res.errCount, 0);
  assert.ok(res.warnCount >= 1, all(res));
  assert.match(all(res), /不一致/);
  assert.ok(!all(res).includes('进程+注册表一致'), all(res));
  assert.ok(res.fixes.some((f) => f.includes('setx HUMMINGBOT_MCP_DIR "F:/b/mcp"')), all(res));
});

test('envcheck F1: 进程+注册表值仅大小写/分隔符不同 → 归一化后算一致（ok、0 warn 归因）', () => {
  const res = analyzeEnv({ procEnv: { HUMMINGBOT_MCP_DIR: 'E:\\trade-bots\\hummingbot\\mcp' }, userEnv: { HUMMINGBOT_MCP_DIR: 'e:/trade-bots/hummingbot/mcp' }, probes: probesNoMCP });
  assert.equal(res.errCount, 0);
  assert.match(all(res), /进程\+注册表一致/);
});

test('envcheck: 值指向别处且探测路径存在 → warn', () => {
  const res = analyzeEnv({ procEnv: { HUMMINGBOT_MCP_DIR: 'C:\\elsewhere\\mcp' }, userEnv: { HUMMINGBOT_MCP_DIR: 'C:\\elsewhere\\mcp' }, probes });
  assert.equal(res.errCount, 0);
  assert.ok(res.warnCount >= 1);
  assert.match(all(res), /不同/);
});

test('envcheck: 仅注册表(本会话没继承) → info、0 err', () => {
  const res = analyzeEnv({ procEnv: {}, userEnv: { HUMMINGBOT_MCP_DIR: W }, probes: probesNoMCP });
  assert.equal(res.errCount, 0);
  assert.match(all(res), /注册表已设但本会话没继承/);
});

test('envcheck: 仅进程(检视到注册表没有) → warn 建议 setx 固化', () => {
  const res = analyzeEnv({ procEnv: { HUMMINGBOT_MCP_DIR: W }, userEnv: {}, probes: probesNoMCP });
  assert.equal(res.errCount, 0);
  assert.ok(res.warnCount >= 1);
  assert.match(all(res), /仅当前进程有/);
  assert.ok(res.fixes.some((f) => f.includes(W)));
});

test('envcheck: userEnv 不可检视(null)时进程值不算 warn', () => {
  const res = analyzeEnv({ procEnv: { HUMMINGBOT_MCP_DIR: W }, userEnv: null, probes: probesNoMCP });
  assert.equal(res.errCount, 0);
  assert.ok(!all(res).includes('仅当前进程有'));
});

test('envcheck: 可选变量设了显示值；掩码默认不泄露', () => {
  const res = analyzeEnv({ procEnv: { HUMMINGBOT_MCP_DIR: W, TRADE_HOME: 'D:/trade' }, userEnv: { HUMMINGBOT_MCP_DIR: W }, probes: probesNoMCP });
  assert.equal(res.errCount, 0);
  assert.match(all(res), /TRADE_HOME = D:\/trade/);
  assert.ok(!all(res).includes('hb_p1_'));
});

test('envcheck CLI: 进程提供 HUMMINGBOT_MCP_DIR → exit 0 + 中文摘要', () => {
  const out = execFileSync('node', [ENVCHECK], {
    encoding: 'utf8',
    env: { ...process.env, HUMMINGBOT_MCP_DIR: W },
  });
  assert.match(out, /环境自检/);
  assert.match(out, /HUMMINGBOT_MCP_DIR/);
});

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
  mkdirSync(probesNoMCP.hummingbotMCP, { recursive: true }); // R2: dir must exist before write
  writeFileSync(join(probesNoMCP.hummingbotMCP, 'main.py'), '');
  const res = analyzeEnv({ procEnv: {}, userEnv: { HUMMINGBOT_MCP_DIR: probesNoMCP.hummingbotMCP }, probes: probesNoMCP });
  assert.ok(!all(res).includes('没找到 main.py'), all(res));
});

test('Task2: probeDeps 依赖探测（fake run）', () => {
  const calls = [];
  // run(cmd, args, opts) — cmd is the executable (CLI real = execFileSync(cmd, args)).
  // Key the fake on cmd, NOT args[0]: probeDeps calls args like ['--version']/['version',...].
  const run = (cmd, args, opts) => {
    calls.push(cmd);
    const bin = cmd;
    if (bin.includes('uv')) return { ok: true, out: 'uv 0.5.0' };
    if (bin.includes('docker')) return { ok: false, out: 'error during connect', code: 1 };
    if (bin.includes('binance-cli')) return { ok: true, out: 'v1.3.0' };
    throw new Error('no such cmd');
  };
  const res = probeDeps({ run, nodeMajor: 26, platform: 'win32' });
  assert.deepEqual(calls, ['binance-cli', 'uv', 'docker']); // probe order
  assert.equal(typeof res.warns, 'number');
  assert.ok(res.warns >= 1, `docker 失败必产生 warn，实际 warns=${res.warns}`);
  const txt = res.rows.map((r) => r.text).join('\n');
  assert.match(txt, /Node 26/);          // ok
  assert.match(txt, /uv/);
  assert.match(txt, /docker/);           // warn 行（引擎运行时）
  assert.match(txt, /binance-cli/);
});

test('Task2: probeDeps 全缺 + Node 旧 → 全 warn、确定性（非 win 无 /binance 行）', () => {
  const run = (cmd) => ({ ok: false, out: 'not found', code: 127 }); // all commands fail, never throws
  const res = probeDeps({ run, nodeMajor: 24, platform: 'linux' });
  assert.equal(res.rows.length, 4); // node + binance-cli + uv + docker（linux 跳过 /binance 分支）
  assert.equal(res.warns, 4);
  assert.ok(res.rows.every((r) => r.level === 'warn'), res.rows.map((r) => r.text).join('\n'));
  assert.match(res.rows.map((r) => r.text).join('\n'), /Node 24（需 ≥26/);
});

// Task3: probeNet — injected runner contract is R(url, viaProxy) (see brief Step 3:
// `const R = run || real; const ping = (label, url, viaProxy) => R(url, viaProxy);`).
test('Task3: probeNet — fapi 经代理通 + Freqtrade up + Hummingbot down', () => {
  const netRun = (url, viaProxy) => {
    if (url.includes('fapi.binance.com') && viaProxy) return { ok: true, code: 200 };
    if (url.includes('fapi.binance.com')) return { ok: false, code: 0 };   // 直连不通（被墙）
    if (url.includes('127.0.0.1:8080')) return { ok: true, code: 200 };
    if (url.includes('127.0.0.1:8000')) return { ok: false, code: 0 };
    return { ok: false, code: 0 };
  };
  const res = probeNet({ run: netRun, ms: 3000 });
  const txt = res.rows.map((r) => r.text).join('\n');
  assert.equal(res.errs, 0);
  assert.match(txt, /币安 fapi.*代理.*OK/);
  assert.match(txt, /Freqtrade.*8080.*通/);
  assert.match(txt, /Hummingbot.*8000.*不通/);
  assert.match(txt, /NFI.*8989/);
});

test('Task3: probeNet — 代理 ping 失败 → err', () => {
  const bad = (url, viaProxy) => ({ ok: false, code: 0 });
  const res = probeNet({ run: bad, ms: 500 });
  assert.ok(res.errs >= 1);
  assert.match(res.rows.map((r) => r.text).join('\n'), /代理.*不通|fapi.*不通/);
});

// Task4: main() CLI wiring. Determinism via env hooks (controller R3): the
// brief's parent-process override cannot reach an execFileSync-spawned child,
// so ENVCHECK_FAKE_NET (err/ok) drives probeNet when --net is passed.
test('Task4 CLI: --net + fapi 不通(ENVCHECK_FAKE_NET=err) → exit 2 + 网络错误汇总', () => {
  let code = 0;
  let out = '';
  try {
    out = execFileSync('node', [ENVCHECK, '--net'], {
      encoding: 'utf8',
      env: { ...process.env, HUMMINGBOT_MCP_DIR: W, ENVCHECK_FAKE_NET: 'err' },
    });
  } catch (e) { code = e.status; out = e.stdout || ''; }
  assert.equal(code, 2);
  assert.match(out, /\[网络\]/);
  assert.match(out, /网络错误/);
});

test('Task4 CLI: --net 失败且 env 干净 → 摘要用“问题”口径、不再写“通过”（exit 仍 2）', () => {
  let code = 0;
  let out = '';
  try {
    out = execFileSync('node', [ENVCHECK, '--net'], {
      encoding: 'utf8',
      env: { ...process.env, HUMMINGBOT_MCP_DIR: W, ENVCHECK_FAKE_NET: 'err' },
    });
  } catch (e) { code = e.status; out = e.stdout || ''; }
  assert.equal(code, 2);
  const summaryLine = out.split('\n').find((l) => l.startsWith('环境自检'));
  assert.ok(summaryLine, out);
  assert.ok(!summaryLine.includes('通过'), summaryLine);
  assert.match(summaryLine, /个问题/);
});

test('Task4 CLI: 无 --net → 不碰网络(假 net err 被忽略) → exit 0 且无 [网络] 行', () => {
  const out = execFileSync('node', [ENVCHECK], {
    encoding: 'utf8',
    env: { ...process.env, HUMMINGBOT_MCP_DIR: W, ENVCHECK_FAKE_NET: 'err' },
  });
  assert.ok(!out.includes('[网络]'));
  assert.match(out, /环境自检/);
  assert.match(out, /\[依赖\]/); // deps 默认开启
});

test('Task4 CLI: --net + fapi OK(ENVCHECK_FAKE_NET=ok) → exit 0 + 网络 OK 行', () => {
  const out = execFileSync('node', [ENVCHECK, '--net'], {
    encoding: 'utf8',
    env: { ...process.env, HUMMINGBOT_MCP_DIR: W, ENVCHECK_FAKE_NET: 'ok' },
  });
  assert.match(out, /\[网络\]/);
  assert.match(out, /币安 fapi.*OK/);
});

test('Task4: probeDeps 真 runner 在 win32 经 shell 跑 .cmd shim（不误报未装）', () => {
  // 控制器 carry-forward：win32 上 npm -g 只产出 binance-cli.cmd / uv.cmd
  // shim，execFileSync 直跑无扩展名会 ENOENT → 误报“未装”。real runner 应
  // 回退：先试 `bin`，失败且 win32 无扩展名时再用 shell 跑 `bin.cmd`。
  // 这里把 PATH 限制到本地假 bin 目录 + System32，确定性地模拟该场景。
  if (process.platform !== 'win32') return; // .cmd shim 问题仅 Windows 有
  const fakeDir = mkdtempSync(join(tmpdir(), 'envcheck-cmd-'));
  const oldPath = process.env.PATH;
  try {
    writeFileSync(join(fakeDir, 'binance-cli.cmd'), '@echo off\r\necho v1.3.0\r\n');
    writeFileSync(join(fakeDir, 'uv.cmd'), '@echo off\r\necho uv 0.5.0\r\n');
    writeFileSync(join(fakeDir, 'docker.cmd'), '@echo off\r\necho 28.0.0\r\n');
    const sys32 = process.env.windir ? `${process.env.windir}\\System32` : 'C:\\Windows\\System32';
    process.env.PATH = fakeDir + pathDelim + sys32; // 真实 binance-cli/uv/docker 不可达
    const res = probeDeps({ nodeMajor: 26, platform: 'win32' });
    const txt = res.rows.map((r) => r.text).join('\n');
    assert.match(txt, /binance-cli v1\.3\.0/, txt); // 经 .cmd shim 命中，不是“未装”
    assert.match(txt, /uv 0\.5\.0/, txt);
    assert.match(txt, /Docker Desktop 28\.0\.0/, txt);
    assert.ok(!/binance-cli 未装/.test(txt), txt);
    assert.ok(!/uv 未装/.test(txt), txt);
  } finally {
    process.env.PATH = oldPath;
    rmSync(fakeDir, { recursive: true, force: true });
  }
});
