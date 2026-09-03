# envcheck 运行环境检测层 + README 平台 pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 envcheck 加**运行环境自检**第一层——先报清当前环境（OS/架构/Node 版本/shell 线索/用户环境可读性），再按环境切换后续检查口径（注册表对照仅 Windows、引擎默认目录仅 Windows 布局、mac/Linux 明确降级），并配套 README「平台支持」小 pass。

**Architecture:** envcheck.mjs 已有导出纯函数 `analyzeEnv/probeDeps/probeNet`。新增纯函数 `probeRuntime({ procEnv, platform, arch, nodeVer }) → { rows, summary }`（可测试、无副作用），CLI `main()` 第一行调它并打印环境摘要，据此给 `main()` 的探测注入降级：`platform==='win32'` 传真实 `PROBES()`（`E:\trade-bots\...`），否则传 `{}` 并打印「引擎默认目录仅 Windows 布局；mac/Linux 需你提供引擎路径」。`probeDeps`/`analyzeEnv` 返回结构不变；已有单测不受影响。版本 bump 与 OV（personal-strategy-overrides）合并一次到 0.6.0（本计划**不做**独立 bump——两计划同一批未 push，release 由 OV 计划的 Task 6 统一执行）。

**Tech Stack:** Node 零依赖（`node:os/process`）；`node:test`；SKILL/docs 编辑。

**Spec:** (inline) 本会话用户决策 + 现状：
- 文档命令已多端可移植（conventions §11）；但 envcheck 仍按 Windows 假设跑：`PROBES()` 硬编 `E:\trade-bots`（在 mac/Linux 是噪音）、注册表只在 Windows 有意义（现自动降级但未说明）。用户：「所有现在检测当前计算机的操作环境也是一个需要自检的」。
- 要检测/展示：`platform (win32|darwin|linux)` + `arch` + Node 主版本 + **shell 线索**（由 `procEnv`：`MSYSTEM` 有 → Git Bash/MSYS；`PSModulePath`/`COMSPEC` 有 → PowerShell/cmd；`SHELL` 以 /bash|/zsh 结尾 → bash/zsh）+ 用户环境可读性（win：注册表 `readUserEnv()` 是否可用；非 win：恒「不可用 → 只查进程 env」）。
- 切换口径：注册表对照 & 引擎默认目录探测 = Windows 专属；`curl` 别名（curl.exe）属用户端、envcheck 不涉及；数据层 `D:/trade` 默认在非 Windows 也接受（node 支持前斜杠盘符? 不——非 Windows 无 D: 概念 → 非 win 时 TRADE_HOME 若无则提示「默认 D:/trade 是 Windows 示例，请设 TRADE_HOME」）。
- README 平台 pass：依赖表 binance-cli 行分 OS；引擎部署段加引擎根注释（Windows `E:\trade-bots` / Git Bash `/e/trade-bots` / macOS·Linux `~/trade-bots`）；加一句平台支持声明「tested=Windows · designed=macOS/Linux」。

## Global Constraints

- 零 npm 依赖；注释英文、用户输出中文；envcheck 只读。
- 纯函数可测：`probeRuntime` 不碰真实 fs/env 之外参数注入；不破坏 `analyzeEnv/probeDeps/probeNet` 签名与既有单测（现 49 绿）。
- `main()` 行为：默认本地层仍 <1s；runtime 检测绝不阻塞（info 级）。
- 平台支持声明要诚实：Windows 实测；macOS/Linux = 设计支持未实测。
- references/ 00-10 与 SKILL 运行时逻辑不动；SKILL/docs 只加描述与触发词。
- 全量 `node --test tests/*.test.mjs` 绿；文档纪律（skill-guide/usage/development/README/architecture 同步提及）。
- release：不单独 bump；并入 OV 的 0.6.0。

## 文件结构

- Modify: `skills/trade-assistant/scripts/envcheck.mjs`（Task 1：`probeRuntime` + `main()` 集成 + 注入降级）
- Create: `tests/envcheck-runtime.test.mjs`（Task 1）
- Modify: `skills/trade-assistant/SKILL.md`（Task 2：Environment Self-Check 段第一行补运行环境检测）
- Modify: `docs/skill-guide.md`、`docs/usage.md`、`docs/development.md`、`README.md`（Task 3：envcheck 行补「运行环境(OS/shell)」；README 平台 pass）
- Create: 无

---

### Task 1: `probeRuntime` 纯函数 + CLI 集成 + 按环境降级探测

**Files:**
- Modify: `skills/trade-assistant/scripts/envcheck.mjs`
- Create: `tests/envcheck-runtime.test.mjs`

**Interfaces:**
- Consumes: `process`（platform/arch/versions）、`procEnv`、`readUserEnv()` 可用性（main 注入 `userEnvOk`）。
- Produces: 导出 `probeRuntime({ procEnv, platform, arch, nodeVer }) → { rows:[{level:'ok'|'info', text}], summary }`；`main()` 首行调用并打印；`main()` 据此决定探测注入：`platform==='win32' ? PROBES() : {}` 并打印降级说明。Task 2/3 文档引用这些。

- [ ] **Step 1: 写失败测试**（tests/envcheck-runtime.test.mjs）

```js
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
```

- [ ] **Step 2: 跑测试确认失败**（`node --test tests/envcheck-runtime.test.mjs` → probeRuntime not a function）
- [ ] **Step 3: 实现 `probeRuntime` + main 集成**

在 envcheck.mjs 追加：

```js
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
  if (!isWin) rows.push({ level: 'info', text: '非 Windows：引擎默认目录探测跳过（无 E:\\trade-bots 概念）；数据层请在 TRADE_HOME 指定，默认 D:/trade 仅为 Windows 示例。' });
  const summary = isWin ? `运行于 Windows · ${shell}` : `运行于 ${platform} · ${shell} · 只看进程 env`;
  return { rows, summary };
}
```

`main()` 集成（放在 userEnv 读取后、analyzeEnv 前）：

```js
const runtime = probeRuntime({ procEnv: process.env });
const envRes = analyzeEnv({ procEnv: process.env, userEnv, probes: runtimePlatformWin ? PROBES() : {} });
```

实现提示：在 main 顶部把 `const isWin = process.platform === 'win32'` 提出，运行时行前缀 `[·]` 或 `[OK]` 打印在 env 行之前；`probeRuntime` 的 summary 并入尾部汇总（`运行于 Windows · PowerShell` 等）。非 win 时 `analyzeEnv` 的 `probes` 传 `{}`（避免 `E:\trade-bots` 噪音），并已在 runtime 行说明。

- [ ] **Step 4: 跑测试确认通过**（新增 4 个 + 既有 envcheck 全绿；全量 `node --test tests/*.test.mjs`）
- [ ] **Step 5: 真机只读冒烟**：`node skills/trade-assistant/scripts/envcheck.mjs` → 第一行显示运行环境（win32 · Node 26 · shell 依本机）且不报错；`envcheck.mjs` 无新写路径。
- [ ] **Step 6: 提交**

```bash
git add skills/trade-assistant/scripts/envcheck.mjs tests/envcheck-runtime.test.mjs
git commit -m "feat(envcheck): runtime-environment detection layer (OS/arch/node/shell; win registry vs mac-linux degrade)"
```

---

### Task 2: SKILL「Environment Self-Check」补运行环境检测

**Files:**
- Modify: `skills/trade-assistant/SKILL.md`

**Interfaces:** 引用 Task 1 行为（首行运行环境摘要）。

- [ ] **Step 1:** 在 SKILL 的 Environment Self-Check 段开头补一句英文：

```markdown
The check starts by reporting the runtime environment (OS/arch/Node, shell
hints, whether the Windows user-env registry is readable). Registry-vs-process
comparison and the canonical engine-dir probes are Windows-only; on macOS/Linux
envcheck degrades to process-env only and reports so — the environment line
makes the applicable scope obvious.
```

- [ ] **Step 2: 提交**（`git add skills/trade-assistant/SKILL.md`；`git commit -m "docs: envcheck runtime-environment detection note in Environment Self-Check"`）

---

### Task 3: README 平台 pass + envcheck 文档行补「运行环境」

**Files:**
- Modify: `README.md`、`docs/skill-guide.md`、`docs/usage.md`、`docs/development.md`

- [ ] **Step 1: README 平台 pass**
- 依赖表 `binance-cli` 行 → 安装方式分 OS：「Windows：`npm i -g @binance/binance-cli`（npm v1.3.0）；macOS/Linux：走 `/binance` skill 官方安装器（README 备注）」
- 引擎部署三段（Freqtrade/Hummingbot/NFI）段首各加一行注释：`# 引擎根：Windows E:\trade-bots（本示例）· Git Bash /e/trade-bots · macOS/Linux ~/trade-bots`（在既有 powershell 示例块上方）
- 「依赖与环境要求」标题下或部署流程开头加一句平台声明：`> 平台支持：Windows 11 实测；macOS/Linux 架构上支持（Node+Docker+TRADE_HOME），未逐一实测。`

- [ ] **Step 2: 三处 envcheck 行补运行环境**
- skill-guide 工具箱 `envcheck.mjs` 行用途列前缀补「**运行环境检测**（OS/arch/shell）+ …」
- usage.md 场景/速查 `envcheck` 行补「会先报运行环境（OS/shell/注册表可读性）」
- development.md 测试节 envcheck 行注释补「（先报运行环境 OS/shell）」

- [ ] **Step 3: 一致性 grep + 全量测试 + 提交**

```bash
grep -rn "运行环境" docs/skill-guide.md docs/usage.md docs/development.md | wc -l   # ≥3
node --test tests/*.test.mjs
git add README.md docs/skill-guide.md docs/usage.md docs/development.md
git commit -m "docs: platform support pass (per-OS binance-cli/engine-root notes) + envcheck runtime-env wording"
```

---

## Self-Review

- **Coverage**：运行环境检测（Task1：probeRuntime + 注入降级 + 测试）→ SKILL 说明（Task2）→ README 平台 pass + 文档行（Task3）。版本 bump 明确由 OV 计划 Task6 统一 0.6.0（Global Constraints 写明，不重复 bump）。
- **Placeholder**：测试/实现/插入文本均为实际内容。
- **一致性**：`probeRuntime` 签名与返回 `{rows, summary}`；shell 推断顺序 MSYSTEM > PowerShell/cmd > SHELL 后缀；`probes` 注入降级 `win32?PROBES():{}` 与 runtime 说明一致；SKILL/docs 措辞与行为一致。
- **诚实性**：平台声明 Windows 实测、mac/Linux 设计支持未实测；非 win 只降级不假装探测。
- **安全**：runtime 层 info/ok，永不 err/block；不触碰 references 与硬安全协议。
