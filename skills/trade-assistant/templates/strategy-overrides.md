# 我的策略覆盖（Personal Strategy Overrides）

> 规则：**本文件优先于 `references/` 建议**（references 只是基线/建议）。Agent 每次分析、制定交易计划、出执行方案前都读本文件；与 references 冲突时，按本文件执行，并在计划里标注「应用覆盖」。
> 改法：直接说你想改什么（如「S3 加一条成交额≥2亿的过滤」），agent 会改本文件并 git commit。**不要**去改插件里的 references。
> 每条覆盖给：覆盖了哪个 references 建议 + 你的新规则 + 何时该它生效（默认始终）。
> 硬安全协议 — CONFIRM 门、账户隔离、禁对冲/禁摊平、单笔红线、8% 单日熔断（只可收紧）、25%/40% 回撤熔断 — 不可由本文件放松。

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
