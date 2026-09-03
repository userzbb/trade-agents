# Personal Strategy Overrides（个人策略覆盖层）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 加一层**用户个人策略覆盖**：`${TRADE_HOME}/strategy-overrides.md`（默认 `D:\trade`，每台机器用户数据层），agent 每次分析/制定交易计划时读取，与 `references/` 冲突时**覆盖层优先**；`references/` 保持建议基线、**不因个人化而改**。被覆盖生效时，交易计划必须显式标注「应用覆盖：X（覆盖 references/0Y「Z」）」——与风险画像的「策略档案已应用」同款透明度。

**Architecture:** 分两层承载：① 一个随插件分发的**中文模板** `skills/trade-assistant/templates/strategy-overrides.md`（分节：总纲/选币与信号 S1-S6/博弈论与庄家剧本/仓位与进场/禁区/市况与更新记录），agent 用零依赖脚本 `scripts/overrides.mjs seed` 幂等复制到用户数据层（只在缺失时写一次）；② SKILL.md 指令层规定读取时机、优先级、对话维护与**计划标注**规则。references 只作建议基线（SKILL.md 把「策略参数只在 references」的旧 Non-goal 表述，改为「references=建议；个人化走 strategy-overrides.md」）。改覆盖 = 对话里用户明确选择 → agent 编辑该 md → `git -C $TRADE_HOME commit`（同 profile/复盘先例：非 (A)/(B)，无 typed CONFIRM，但**绝不静默改**）。市场随市况变 → 随时更新该文件。

**Tech Stack:** Node 零依赖脚本（`node:fs/path/url`）；中文模板 md；`node:test` 单测；SKILL/agents/docs 编辑。

**Spec:** (inline) 本会话用户决策：
- v1 = **个人策略覆盖 md**（不做脚本数值旋钮、不扩展 profile schema v2）；references 完全不改（用户原话：「不要动reference 因为每个用户都有自己的策略 市场也是随时变化的」「它仅仅只是一个建议」）。
- 交易计划（solve/pyramid/回测/route 决策的**计划正文**）**必须标注**任何影响该计划的覆盖项。
- 风险画像（strategy-profile.json）继续走 profile.mjs，不动；本特性只加**策略/知识层**的覆盖。
- 语言：模板内容与计划标注 = 中文；SKILL 指令/脚本注释 = 英文。

## Global Constraints

- 零 npm 依赖；仅 `node:` 内置。新增脚本注释英文、用户输出中文。
- 写入仅限 `overrides.mjs seed`（幂等：文件已存在则不覆盖）与「用户明确选择后 agent 编辑 + git commit」两条合规路径；绝不静默创建/改写。
- **references/** 00-10 **不做任何内容改动**（本特性只新增模板 + 指令层 + 数据文件）。SKILL.md/agents/docs 可改（控制层与文档）。
- 与风险画像平行：`strategy-overrides.md` 是知识层覆盖；`strategy-profile.json` 是数值风险画像；两者独立、可同时生效，计划里分别标注。
- 测试跑法 `node --test tests/*.test.mjs`（Windows glob）；全量保持绿（当前 45）。
- 发布：完成 bump `.claude-plugin/plugin.json` 0.5.0 → **0.6.0**（用户可见特性，release commit）。文档纪律：SKILL.md / docs/skill-guide.md / docs/usage.md / docs/architecture.md（数据层行）/ docs/development.md（文档维护纪律表）/ CLAUDE.md（Common tasks / Key paths 数据层）同步。

## 文件结构

- Create: `skills/trade-assistant/templates/strategy-overrides.md`（Task 1）
- Create: `skills/trade-assistant/scripts/overrides.mjs`（Task 2）
- Create: `tests/overrides.test.mjs`（Task 2）
- Modify: `skills/trade-assistant/SKILL.md`（Task 3：Personal Strategy Overrides 段 + Strategy-parameter 模型措辞 + 工具箱行 + 计划标注规则）
- Modify: `agents/binance-orchestrator.md`（Task 4：consult overrides）
- Modify: `docs/skill-guide.md`、`docs/usage.md`、`docs/architecture.md`、`docs/development.md`、`CLAUDE.md`、`README.md`（Task 5，同步提及）
- Modify: `.claude-plugin/plugin.json`（Task 6，bump）

---

### Task 1: 模板 `strategy-overrides.md`（中文，分节可填）

**Files:**
- Create: `skills/trade-assistant/templates/strategy-overrides.md`

**Interfaces:** 被 `overrides.mjs seed` 读取复制（Task 2）。分节标题是 Task 3 SKILL 标注规则的引用锚点（section 名）。

- [ ] **Step 1: 写模板文件**（中文内容，占位符 = 覆盖项写法）

```markdown
# 我的策略覆盖（Personal Strategy Overrides）

> 规则：**本文件优先于 `references/` 建议**（references 只是基线/建议）。Agent 每次分析、制定交易计划、出执行方案前都读本文件；与 references 冲突时，按本文件执行，并在计划里标注「应用覆盖」。
> 改法：直接说你想改什么（如「S3 加一条成交额≥2亿的过滤」），agent 会改本文件并 git commit。**不要**去改插件里的 references。
> 每条覆盖给：覆盖了哪个 references 建议 + 你的新规则 + 何时该它生效（默认始终）。

## 1. 我的总纲（全局偏好）
- 参考：references/00-core-playbook.md（建议）
- 我的覆盖：
  - （例）我偏向趋势单，拒绝 1 小时内 3 次插针的币。
  -

## 2. 选币与信号（S1-S6）
- 参考：references/01-selection-and-signals.md（建议）
- 我的覆盖：
  - （例）只做 S1/S2，S3 起降级处理。
  -

## 3. 博弈论与庄家剧本（只做我熟悉的阶段）
- 参考：references/04-market-maker-playbook.md（建议）
- 我的覆盖：
  - （例）BTR 第 4 幕（派发）坚决不做多。
  -

## 4. 仓位与进场
- 参考：references/02/03/06（建议；数值红线仍以 strategy-profile.json 为准）
- 我的覆盖：
  - （例）进场只用限价单挂在下影线，追价不做。
  -

## 5. 我的禁区（不做什么）
- 参考：references/00 Hard Rules / 06 心理（建议）
- 我的覆盖：
  - （例）凌晨 2-4 点出现的高波动山寨币一律不碰。
  -

## 6. 市况与更新记录
- 每次按市况/复盘改策略后，在此记一行：`YYYY-MM-DD 更新：…`（git 历史也留痕）
- 最近更新：
  -
```

- [ ] **Step 2: 验证模板存在且非空**

```bash
test -s skills/trade-assistant/templates/strategy-overrides.md && echo OK
```

- [ ] **Step 3: 提交**

```bash
git add skills/trade-assistant/templates/strategy-overrides.md
git commit -m "feat(overrides): bundled personal-strategy-overrides Chinese template"
```

---

### Task 2: `overrides.mjs seed|view` + 单测

**Files:**
- Create: `skills/trade-assistant/scripts/overrides.mjs`
- Test: `tests/overrides.test.mjs`

**Interfaces:**
- Consumes: `process.env.TRADE_HOME`（默认 `D:/trade`）；模板文件路径（本脚本 `../templates/strategy-overrides.md`）。
- Produces: 导出 `overridesPath()`、`readOverrides()`、`seedOverrides()`（返回 `{seeded:boolean, file}`）；CLI `seed` / `view` /（无参）状态。Task 3/5 文档引用这些。

- [ ] **Step 1: 写失败测试**

```js
// tests/overrides.test.mjs
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/overrides.test.mjs` → FAIL（无 overrides.mjs）。

- [ ] **Step 3: 实现 `overrides.mjs`**

```js
// overrides.mjs — manage the per-user personal-strategy overrides file.
// English comments; ALL user-facing output is Chinese. Zero deps. Read-only
// EXCEPT `seed`, which writes ${TRADE_HOME}/strategy-overrides.md once from the
// bundled template (idempotent — never overwrites an existing file, so a user's
// edits survive). Edits happen in dialogue (agent edits + git commit on the
// user's explicit choice), never silently by this script.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_ROOT = process.env.TRADE_HOME || 'D:/trade';
const FILE = join(DATA_ROOT, 'strategy-overrides.md');
const TEMPLATE = join(fileURLToPath(new URL('..', import.meta.url)), 'templates', 'strategy-overrides.md');

export function overridesPath() { return FILE; }

/** Read the user's overrides; null when not yet seeded. */
export function readOverrides() {
  try { return readFileSync(FILE, 'utf8'); } catch { return null; }
}

/** Idempotent seed from the bundled template. Returns { seeded, file }. */
export function seedOverrides() {
  if (existsSync(FILE)) return { seeded: false, file: FILE };
  mkdirSync(DATA_ROOT, { recursive: true });
  writeFileSync(FILE, readFileSync(TEMPLATE, 'utf8'));
  return { seeded: true, file: FILE };
}

function main() {
  const [cmd] = process.argv.slice(2);
  if (cmd === 'seed') {
    const r = seedOverrides();
    console.log(r.seeded ? `已创建个人策略覆盖文件：${r.file}` : `已存在（不覆盖，保留你的编辑）：${r.file}`);
    return;
  }
  if (cmd === 'view') {
    const t = readOverrides();
    console.log(t === null ? `未创建（先运行 overrides.mjs seed，或用对话让 agent 建）：${FILE}` : t);
    return;
  }
  const t = readOverrides();
  console.log(`个人策略覆盖文件：${FILE}`);
  console.log(t === null ? '状态：未创建（对话让 agent seed 即可）' : `状态：已存在（${FILE.length} 字符）`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) main();
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test tests/overrides.test.mjs` → GREEN。全量 `node --test tests/*.test.mjs` 绿。

- [ ] **Step 5: 手动跑一次真机**

```bash
node skills/trade-assistant/scripts/overrides.mjs view    # 应显示 D:\trade 下状态
node skills/trade-assistant/scripts/overrides.mjs seed    # 若 D:\trade 无此文件则创建
```

> 注：这会在你的真实 `D:\trade` 建文件——请只在确认要开始个性化时 seed；或先看 `view`。executor 在此步只跑 `view`（只读），`seed` 到临时 TRADE_HOME 已在测试覆盖。

- [ ] **Step 6: 提交**

```bash
git add skills/trade-assistant/scripts/overrides.mjs tests/overrides.test.mjs
git commit -m "feat(overrides): overrides.mjs seed|view for personal strategy overrides file"
```

---

### Task 3: SKILL.md — Personal Strategy Overrides 段 + 标注规则

**Files:**
- Modify: `skills/trade-assistant/SKILL.md`

**Interfaces:** 引用 Task 2 的 `overrides.mjs seed|view`、`${TRADE_HOME}/strategy-overrides.md`；Task 4/5 引用本节语义。

- [ ] **Step 1: 改 Strategy-parameter 模型段落**（把「策略参数只在 references」改为 references=建议基线 + 覆盖层）

现段（首段 "Strategy-parameter model."…）末尾或紧邻补：

```markdown
**References are a SUGGESTION baseline, not a per-user mandate.** Personalizing
strategy (signal filters, game-theory script stages, what NOT to trade, any
prose rule) lives in the user's own `${TRADE_HOME}/strategy-overrides.md`
(`D:\trade\strategy-overrides.md`), NOT in `references/`. Precedence:
**user override > reference**. References stay shared and unchanged.
```

- [ ] **Step 2: 新增章节「Personal Strategy Overrides」**（放 Strategy Profile 段之后）

```markdown
## Personal Strategy Overrides (your strategy layer; references stay untouched)

The user's own strategy rules (selection/S1-S6 filters, game-theory script
stages, entries, what-NOT-to-trade, market-state notes) live in
`${TRADE_HOME}/strategy-overrides.md` (default `D:\trade`), layered OVER the
`references/` suggestion baseline. Precedence: **override > reference**;
references are never edited for personalization.

Rules:
1. **Read it before every analysis/plan/execution-route decision** (Core
   Workflow A step 0 and any solve/pyramid/backtest plan). If absent, you may
   seed it with `node scripts/overrides.mjs seed` (idempotent, writes once) —
   only when the user wants personalization; do not create it unprompted.
2. **Edit flow = dialogue.** User states a change ("S3 加成交额≥2亿过滤", "BTR
   第4幕不做多") → agent edits the md under that explicit user choice → `git -C
   ${TRADE_HOME} add strategy-overrides.md` + `commit -m "策略覆盖更新: …"`.
   Not an (A)/(B) action → no typed CONFIRM, but NEVER change it silently or
   invent rules; show what you will write.
3. **Plan annotation (mandatory).** Any 交易计划/回测计划/执行方案 whose inputs
   an override affects MUST state in the Chinese plan body:
   `应用覆盖: "<rule>"（覆盖 references/0X「…」建议）`. If the numeric risk
   profile (strategy-profile.json) is also applied, note both, e.g.
   `策略档案已应用 · 应用覆盖: "只做 S1/S2"（覆盖 references/01 建议）`.
4. `overrides.mjs view` shows the file; `seed` creates it from the bundled
   template. Inspect the file before overriding the same section twice.
```

- [ ] **Step 3: 工具箱表加行 + 工具箱总数表述不变**

工具箱表（含 `profile.mjs` 行后）加：

```markdown
| `overrides.mjs seed\|view` | personal-strategy overrides file seed/view (`${TRADE_HOME}/strategy-overrides.md`, precedence over references) | first-time personalization; "改一下我的策略/规则" |
```

- [ ] **Step 4: Core Workflow A 加 step 0 读取覆盖**

在 `### A. Analysis` 第 1 步前插：

```markdown
0. **Read personal overrides** (`node scripts/overrides.mjs view` if a file may
   exist; read the md) and apply precedence. Affected plan → annotate per the
   Personal Strategy Overrides section.
```

- [ ] **Step 5: 一致性 grep + 提交**

```bash
grep -n "strategy-overrides\|overrides.mjs" skills/trade-assistant/SKILL.md   # ≥ 你的新段落与行
node --test tests/*.test.mjs    # 仍绿
git add skills/trade-assistant/SKILL.md
git commit -m "feat(overrides): SKILL Personal Strategy Overrides section + mandatory plan annotation"
```

---

### Task 4: binance-orchestrator 读取覆盖

**Files:**
- Modify: `agents/binance-orchestrator.md`

**Interfaces:** 引用 SKILL.md（不复制规则，只引用）+ `overrides.mjs view`。

- [ ] **Step 1: 在执行流程区加一条（靠近 "6 步执行流程" 或决策前）**

```markdown
- **读取个人策略覆盖**（若 `${TRADE_HOME}/strategy-overrides.md` 存在）：按 SKILL.md
  「Personal Strategy Overrides」——覆盖优先于 references；影响决策/计划时在中文汇报里标注「应用覆盖: …」。
  查询「运行策略/覆盖是啥」用 `node scripts/overrides.mjs view`。
```

- [ ] **Step 2: grep 验证 + 提交**

```bash
grep -n "strategy-overrides" agents/binance-orchestrator.md
git add agents/binance-orchestrator.md
git commit -m "feat(overrides): orchestrator consults personal strategy overrides"
```

---

### Task 5: 文档同步（skill-guide / usage / architecture / development / CLAUDE / README）

**Files:**
- Modify: `docs/skill-guide.md`、`docs/usage.md`、`docs/architecture.md`、`docs/development.md`、`CLAUDE.md`、`README.md`

**Interfaces:** 无新接口；纯同步提及。

- [ ] **Step 1: skill-guide.md** — 工具箱表补 `overrides.mjs seed|view` 行（用途/用法/何时用，中文）；文档生命周期「策略变更」行加注「个人化 → 改 `strategy-overrides.md`，勿改 references」。
- [ ] **Step 2: usage.md** — 场景表加「我想改一下策略/规则（S1-S6/博弈/禁区）」→ skill → `overrides.mjs seed` + 对话编辑 + 标注；命令速查加 `node overrides.mjs view|seed`。
- [ ] **Step 3: architecture.md** — 数据层 ASCII/依赖模型里 `D:\trade` 行补 `strategy-overrides.md`（个人策略覆盖）；能力层 references 行注「建议基线」。
- [ ] **Step 4: development.md** — 数据层节列 `strategy-overrides.md`；「新增脚本」不适用（无新脚本约定变化）；文档维护纪律表已在。
- [ ] **Step 5: CLAUDE.md** — Key paths 数据层行补 `strategy-overrides.md`；Common tasks 加一条「Change personal strategy → edit `${TRADE_HOME}/strategy-overrides.md` (dialogue, precedence over references); do NOT edit references for personalization」。
- [ ] **Step 6: README.md** — 若数据层/特性提及，补一句「个人策略覆盖：`D:\trade\strategy-overrides.md`（对话维护，优先于策略知识库）」。

- [ ] **Step 7: 一致性 grep + 提交**

```bash
grep -rn "strategy-overrides" skills/trade-assistant/SKILL.md agents/ docs/ CLAUDE.md README.md | wc -l   # ≥6 处，各处语义一致（覆盖优先于 references、对话维护、勿改 references）
node --test tests/*.test.mjs
git add docs/skill-guide.md docs/usage.md docs/architecture.md docs/development.md CLAUDE.md README.md
git commit -m "docs: personal strategy overrides layer sync (skill-guide/usage/architecture/development/CLAUDE/README)"
```

---

### Task 6: bump 0.6.0（release）

**Files:**
- Modify: `.claude-plugin/plugin.json`

- [ ] **Step 1: version 0.5.0 → 0.6.0**
- [ ] **Step 2: 校验 + 提交**

```bash
node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/plugin.json'))"
git add .claude-plugin/plugin.json
git commit -m "release: bump plugin to 0.6.0 (personal strategy overrides layer)"
```

---

## Self-Review

- **Coverage**：① 模板（Task1）② 读写/seed 工具 + 测试（Task2）③ SKILL 优先级/对话编辑/标注 + Core Workflow step0（Task3）④ orchestrator（Task4）⑤ 文档纪律全同步（Task5）⑥ bump（Task6）。references 00-10 全程零改动——符合「建议基线不改」。
- **Placeholder scan**：模板/代码/测试/插入文本均为实际内容；无 TBD。
- **一致性**：`strategy-overrides.md`、`overrides.mjs`、`overridesPath/readOverrides/seedOverrides` 跨任务名统一；标注文案「应用覆盖: …（覆盖 references/0X…）」Task3/4 一致；seed 幂等语义（已存在不覆盖）Task2 测试锁定、SKILL 也写「不覆盖保留编辑」。
- **边界**：数值风险画像仍走 profile.mjs（不动）；硬安全协议（8% 熔断等）仍不可被覆盖——SKILL 标注规则只在「策略/知识层」生效，不得借 overrides 放宽安全红线（模板第 4 节已注明数值红线以 strategy-profile.json 为准）。
