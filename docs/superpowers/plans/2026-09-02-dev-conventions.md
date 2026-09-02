# trade-agents 开发规范补强 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐 trade-agents 的开发规范，让以后重构/开发有规可依——① 架构图必须留 JSON spec 源（PR#1 丢 spec 导致无法更新的根因）② agent 开发走 plugin-dev skill + validate-agent.sh ③ 发布/版本纪律集中化；同时清理 conventions.md 的 stale（镜像同步已废弃）。

**Architecture:** 纯文档改动。以 `docs/conventions.md` 为规范主体：清理 §7 废弃镜像同步、§6 补发布/版本纪律、新增 §9（架构图规范）与 §10（agent 开发规范）。`CLAUDE.md` Common tasks 加 agent 开发规范入口，使 AI 进仓库即见。

**Tech Stack:** Markdown（conventions.md / CLAUDE.md）。无脚本、无运行时改动。

**Spec:** 用户诉求（2026-09-02）：JSON spec 规范化 + 项目开发规范 + agent 开发遵循规范（用 plugin-dev 等 claude code dev skills）。范围经确认：落点 conventions.md + CLAUDE.md；覆盖架构图 spec / agent 用 skill / 通用流程 / 发布版本纪律。

## Global Constraints

- 只改 `docs/conventions.md` + `CLAUDE.md`；不动 skill/references/scripts/plugin.json。
- 语言：规范正文英文（与 conventions 现有风格一致，示例可中文）；用户可读文档中文。
- **本计划不含** archify HTML 几何调优（那是独立任务，见任务末尾"后续"）。
- 不 bump 版本：纯开发规范文档，非插件运行时用户功能（plugin.json 不改）。
- conventions §7 中"镜像同步"内容已废弃（CLAUDE.md 已声明 mirror deprecated）→ 本计划清理该 stale。

---

## 文件结构

| 文件 | 改动 |
|---|---|
| `docs/conventions.md` | §6 加发布纪律；§7 清 stale 镜像；新增 §9 架构图规范；新增 §10 agent 开发规范 |
| `CLAUDE.md` | Common tasks 加 agent 开发规范入口 |

---

## Task 1: conventions.md — 清理 stale + §6 补发布纪律

**Files:** Modify `docs/conventions.md`

- [ ] **Step 1: §7 清理镜像同步（已废弃）**

现行 §7（防漂移规范）第 2 条与第 5 条提到"必须同步镜像 `D:\claude-dev\skills\trade-assistant`"。该镜像已废弃（CLAUDE.md: "The old mirror is deprecated — do not sync or maintain it"）。改为：

```markdown
## 7. 防漂移规范（唯一真相源）

1. **skill 唯一真相源 = `skills/trade-assistant/`**（本插件内）。
2. agents **不复制** skill 的环境事实/决策表大段，引用 SKILL.md。
3. 策略规则或 binance 决策表变更传播链：真相源 → agents 引用（SKILL.md references guide）。
4. 已废弃：旧的独立分发镜像 `D:\claude-dev\skills\trade-assistant` 不同步、不维护、不引用。
```

- [ ] **Step 2: §6 Git 提交规范补发布纪律**

§6 表格后加：

```markdown
**发布纪律（CLAUDE.md Common tasks 同规则）**：
- 任何**用户可见功能改动**（skill/references/agents/MCP 行为变化）在 push 前必须 bump `.claude-plugin/plugin.json` 的 `version`（semver）——否则 marketplace 用户 `claude plugin update` 见 "already at latest" 拉不到新内容。
- 新增 `release` 提交类型：`release: bump plugin to X.Y.Z (<feature>)`。
- 发布流：`feat/fix/docs` 提交 → `release` bump 提交 → push → `claude plugin marketplace update <name>` 验证。
```

## Task 2: conventions.md — 新增 §9 架构图规范

**Files:** Modify `docs/conventions.md`（§8 安全规范后追加）

- [ ] **Step 1: 追加 §9**

```markdown
## 9. 架构图规范（archify 图必须留 spec 源）

> 教训：`docs/trade-agents-architecture.html` 由 archify 生成，早期提交只留 HTML、丢 JSON spec，导致后续无法更新（须整图重建）。本规范防止复发。

- **架构图 = JSON spec 源 + 生成的 HTML，两者都提交**。
  - spec 源放 `docs/<name>.json`（如 `docs/architecture-v0.3.json`），是**可编辑真相源**。
  - HTML 是 archify 渲染产物（`node bin/archify.mjs deliver <type> <spec>.json <out>.html`），仅当 spec 变更时重新生成，**不手改 HTML**。
- spec 头部记 `meta.repository = { url, revision }` 记录生成时仓库版本。
- 用 archify 的 `validate`（`--quality showcase`）验收；几何诊断（标签重叠/边穿越）按诊断修复 spec，不通过 hard-edit HTML 掩盖。
- 架构变更（新增组件/引擎/数据层/安全机制）时：先更新 spec JSON → validate → deliver → 提交（spec + HTML 同 commit，消息含架构变更摘要）。
- 生成命令记录在 spec 的 `meta` 或文档注释，便于复现。
```

## Task 3: conventions.md — 新增 §10 agent 开发规范

**Files:** Modify `docs/conventions.md`（§9 后追加）

- [ ] **Step 1: 追加 §10**

```markdown
## 10. Agent 开发规范

> 所有 agent 开发必须遵循 Claude Code 的 plugin-dev 规范（本机已装 `plugin-dev` 插件）。

- **新增/修改 agent**：使用 `plugin-dev:agent-development` skill 的规范（frontmatter 必填 name/description/model/color/tools；`When to invoke` 区块；触发场景 2–4 个）。
- **校验**：改完跑 `bash <plugin-dev>/skills/agent-development/scripts/validate-agent.sh agents/<name>.md`。
- **安全门**：agent 若持 Bash，正文顶部须有 "Absolute Gate"（资金操作/引擎状态变更只路由回 CONFIRM，绝不执行）——见 `agents/binance-orchestrator.md` 范例。
- **触发描述**：description 单行标量（勿块标量）；触发词保留中文；2–4 个触发场景 prose。
- **引用不复制**：agent 不复制 SKILL.md 环境事实/决策表大段，引用 SKILL.md / references。
- **开发 agent（本项目扩展开发）**：遵循 `docs/development.md` 的扩展步骤 + 本 conventions.md。
```

## Task 4: CLAUDE.md — Common tasks 加规范入口

**Files:** Modify `CLAUDE.md`

- [ ] **Step 1: Common tasks 加 agent 开发行**

在现有 "Add an agent" 行后补规范引用：

```markdown
- **Add an agent** → follow `plugin-dev:agent-development` skill conventions + `docs/conventions.md` §10; frontmatter (`name`/`description`/`model: inherit`/`color`/`tools`) + a `When to invoke` section; validate with `validate-agent.sh`; update `docs/agents.md`.
```

并把现有 "Release a user-facing change" 行保留（已含 bump 纪律，与 conventions §6 一致）。

## Task 5: 验证 + 提交

**Files:** 全部

- [ ] **Step 1: 一致性验证**

```bash
cd /d/claude-dev/agents/trade-agents
# conventions.md 无 stale 镜像残留
grep -n "镜像同步\|mirror.*sync\|同步镜像" docs/conventions.md || echo "§7 stale 已清"
# 新规范段落存在
grep -c "## 9. 架构图规范\|## 10. Agent 开发规范" docs/conventions.md
grep -c "plugin-dev:agent-development" CLAUDE.md
```

Expected: 无镜像残留输出；新段落各出现；CLAUDE.md 含 agent 规范引用。

- [ ] **Step 2: 提交**

```bash
cd /d/claude-dev/agents/trade-agents
git add docs/conventions.md CLAUDE.md
git commit -m "docs: dev conventions — architecture-spec source rule (PR#1 lesson), agent-dev skill flow, release/version discipline; drop stale mirror sync"
```

---

## 后续（不在本计划）
- `docs/architecture-v0.3.json` 已建为架构图 spec 源（v0.3.0 架构）。其 HTML 几何调优（24 标签重叠 + 13 约束错）是独立 archify 任务，待本规范落地后按其 §9 流程处理并 deliver。
- 用户提到的"插件开发用 claude code dev"即 `plugin-dev` 插件——Task 3/4 已把该入口写入规范。

---

## 自审记录
- **Spec 覆盖**：架构图 spec 规范 → Task 2；agent 开发用 skill 规范 → Task 3+4；发布/版本纪律 → Task 1；通用流程/清理 stale → Task 1。落点 conventions+CLAUDE 符合用户确认。
- **占位符**：无。各步含完整规范文本。
- **范围**：纯文档，不 bump（规范非运行时功能）；不含 archify HTML 几何（显式标注后续）。
- **一致性**：CLAUDE.md 现有 bump 纪律与 conventions §6 新内容一致；镜像废弃声明两处统一。
