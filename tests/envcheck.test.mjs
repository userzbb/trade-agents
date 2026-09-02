import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ENVCHECK = join(ROOT, 'skills', 'trade-assistant', 'scripts', 'envcheck.mjs');
const { analyzeEnv } = await import('../skills/trade-assistant/scripts/envcheck.mjs');

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
