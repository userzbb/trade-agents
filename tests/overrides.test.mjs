import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OVERRIDES = join(ROOT, 'skills', 'trade-assistant', 'scripts', 'overrides.mjs');
const TEMPLATE = join(ROOT, 'skills', 'trade-assistant', 'templates', 'strategy-overrides.md');
const dir = mkdtempSync(join(tmpdir(), 'overrides-test-'));
const TRADE_HOME = join(dir, 'trade');
mkdirSync(TRADE_HOME, { recursive: true });
test.after(() => rmSync(dir, { recursive: true, force: true }));

function cli(args) {
  return execFileSync('node', [OVERRIDES, ...args], { encoding: 'utf8', env: { ...process.env, TRADE_HOME } });
}

test('seed: 首次创建（含模板内容）', () => {
  const out = cli(['seed']);
  assert.match(out, /已创建/);
  const f = readFileSync(join(TRADE_HOME, 'strategy-overrides.md'), 'utf8');
  assert.ok(f.includes('我的策略覆盖'));
  assert.ok(f.includes('博弈论与庄家剧本'));
});

test('seed: 幂等（已存在则不覆盖）', () => {
  cli(['seed']);
  const first = readFileSync(join(TRADE_HOME, 'strategy-overrides.md'), 'utf8');
  // 用户可能已改 → seed 第二次不得清空
  cli(['seed']);
  const second = readFileSync(join(TRADE_HOME, 'strategy-overrides.md'), 'utf8');
  assert.equal(first, second);
  assert.match(cli(['seed']), /已存在/);
});

test('view: 未 seed 时提示 + seed 后打印内容', () => {
  const d2 = mkdtempSync(join(tmpdir(), 'overrides-empty-'));
  try {
    const th = join(d2, 'trade'); // 不 mkdir，目录不存在也能跑
    const v0 = execFileSync('node', [OVERRIDES, 'view'], { encoding: 'utf8', env: { ...process.env, TRADE_HOME: th } });
    assert.match(v0, /未创建/);
  } finally { rmSync(d2, { recursive: true, force: true }); }
  const v1 = cli(['view']);
  assert.ok(v1.includes('我的策略覆盖'));
});

test('模板存在（SKILL seed 依赖它）', () => {
  assert.ok(readFileSync(TEMPLATE, 'utf8').trim().length > 0);
});
