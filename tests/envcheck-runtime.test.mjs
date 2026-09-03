import { test } from 'node:test';
import assert from 'node:assert/strict';
const { probeRuntime } = await import('../skills/trade-assistant/scripts/envcheck.mjs');

const all = (r) => r.rows.map((x) => x.text).join('\n');

test('probeRuntime: win32+PowerShell 环境 → 摘要含 win32/PowerShell/用户环境', () => {
  const r = probeRuntime({
    platform: 'win32', arch: 'x64', nodeVer: 26,
    procEnv: { PSModulePath: 'C:\\Program Files\\PowerShell\\Modules', USERPROFILE: 'C:\\Users\\t' },
  });
  assert.match(all(r), /win32/);
  assert.match(all(r), /x64/);
  assert.match(all(r), /PowerShell/);
  assert.match(r.summary, /Windows/);
});

test('probeRuntime: win32 + Git Bash(MSYSTEM) → shell 判为 Git Bash/MSYS', () => {
  const r = probeRuntime({ platform: 'win32', arch: 'x64', nodeVer: 26, procEnv: { MSYSTEM: 'MINGW64', SHELL: '/usr/bin/bash' } });
  assert.match(all(r), /Git Bash|MSYS/);
});

test('probeRuntime: macOS + SHELL zsh → 摘要含 darwin / zsh / 用户环境不可用(注册表)', () => {
  const r = probeRuntime({ platform: 'darwin', arch: 'arm64', nodeVer: 26, procEnv: { SHELL: '/bin/zsh' } });
  assert.match(all(r), /darwin/);
  assert.match(all(r), /zsh/);
  assert.match(all(r), /只看进程 env|无注册表/);
});

test('probeRuntime: linux + 无 SHELL 线索 → shell 未知仍 ok', () => {
  const r = probeRuntime({ platform: 'linux', arch: 'x64', nodeVer: 26, procEnv: {} });
  assert.match(r.summary, /Linux/);
  assert.ok(r.rows.length >= 3);
});
