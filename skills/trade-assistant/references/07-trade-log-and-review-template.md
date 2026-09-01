# 07 Trade Log & Review Template (交易日志与复盘模板)

> Content in English; **the document bodies below are user-facing output and MUST stay Chinese.**
> Relationship: the trade log (07 §1) records every trade's process (flows into SQLite); the review (07 §2) is the **full per-trade review report**.
> Every trade must be logged; after 100 trades switch to Kelly sizing (ref 03); at month-end compute real win rate / payoff.

## 1. Per-Trade Log — Record Template (copy and fill in Chinese)

```
### #编号 | 日期时间
- 标的/方向：
- 信号类型：S1 / S2 / S3 / S4 / S5 / 彩票
- 进场价 / 数量 / 杠杆 / 仓位%：
- 止损价（挂了吗？）：
- 止盈计划：
- 进场理由（一句话）：
- 情绪状态（1-5，5=冷静）：
---
- 出场价 / 时间：
- 结果：盈亏 ___U（___%）
- 执行评价：按计划 / 偏离计划（偏离点：___）
- 复盘一句话：
```

**Stats block (update every 10 trades):** 总笔数 / 胜率 / 平均盈利·亏损每笔 / 盈亏比 / 最大单笔亏损 / 最大回撤 / 按计划执行率.

**Kelly sizing (after 100 trades):** `f = 胜率 − (1−胜率)/盈亏比` → practice position = f/4.

## 2. Historical Pre-Filled Entries (2026-08-31 ~ 09-01)

- **#1 | 08-30~08-31** 牛来USDT 多（5 笔快进快出）｜日内波段无体系｜合计约 +35U｜复盘：节奏感好，但全市价单无止损——运气好
- **#2 | 08-31** ZKC 多 8608 张 @ 0.05808｜主观"庄家拉盘"｜−7 → −25 → 保本离场｜复盘：无信号支撑 + 全程无止损 + 两次拒绝挂止损。**教训样板单**
- **#3 | 08-31** SKR 多 29620 张 @ 0.02704｜S1 负费率 −0.57% + 放量突破｜+36.7U｜复盘：体系内标准盈利单；但首笔同标的曾裸奔，止损纪律仍需固化
- **#4 | 08-31~09-01** HEMI 多 52393 张 @ 0.01528｜S2 变形（回踩未到位）｜−5 → −34 → 离场｜复盘：进场点不达标（箱体上沿追多）+ 拒绝止损 + "庄家 68% 做多"被误用作扛单理由。**第二个教训样板单**
- **#5 | 09-01** ARB 多 11331 张 @ 0.11375（20x 逐仓）｜S2 健康回踩｜持有中（浮亏最深 −28U 后反弹）｜待复盘：止盈挂 0.1182；观察 0.1110 支撑

## 3. Monthly Review Checklist (every 1st)

1. Compute last month's win rate / payoff → update Kelly size.
2. Find the 3 biggest losses → common cause?
3. Find the 3 biggest winners → good signal or good luck?
4. If discipline execution rate <80% → reduce position size next month (position is poison when execution is weak).
5. Update pool criteria (which signal class worked that month).

## 4. Review Report Structure — generate 复盘 md strictly per this template (Chinese body)

Generate `复盘_起始日期-结束日期_币种.md` after a position FULLY closes, into `D:\trade\retrospectives\`, then `git commit`.

```markdown
# 复盘 ARB 20260901-0902 +36.7U

## 基本信息
- 标的/方向: ARBUSDT 多 / 空
- 时间区间: 2026-09-01 09:00 → 2026-09-02 03:00（持有 Xh）
- 开仓价 → 平仓价: 0.11375 → 0.1199
- 仓位/杠杆: 11331 张 @ 20x（占总资金 X%）
- 信号类型: S1 / S2 / S3 / S4 / S5 / S6 / 彩票
- 币种分级: T1 / T2 / T3（求解器输出）
- 结果: +36.7U（+X% 账户）

## 执行 vs 计划
| 项目 | 计划 | 实际 | 偏离 |
|---|---|---|---|
| 进场 | solve.mjs 输出的回踩位 | ? | ? |
| 止损 | ? | ? | 挂了吗？触发了吗？ |
| 止盈 | ? | ? | ? |

## 盈亏归因（量化）
- 信号质量贡献: X% — 该信号（S2 健康回踩）的历史胜率参考
- 执行纪律贡献: X% — 按计划执行 / 偏离点
- 运气成分: X% — 无止损被插针放过 / 单边行情助攻

## 关键决策复盘
- 进场理由是否成立？进场那一刻的盘口/费率/结构是否符合信号定义？
- 持仓期间决策链：浮亏 XU 时做了选择（扛/平/改止损），依据是什么？
- 如果重来一次，什么会不一样？

## 改进项（下期必做）
1. 具体、可执行的一条
2. ...
```

**Mandatory elements (never omit, whatever the coin):**
1. **Execution-vs-plan deviation analysis** — any deviation (manual price change, temporary stop removal) must be written down.
2. **P&L attribution** — split into signal quality / execution discipline / luck with rough percentages.
3. **Signal type + tier labels** — S1–S6 + T1–T3, consistent with solver output.
4. **Improvement item** — at least one, specific to "what to check before next entry".

**Triggers:** user says 复盘/平仓了/这一单结束了; or the agent detects position fully closed with unrealized P&L and no review yet → proactively prompt.

**Archive:** `git add + commit` (message: `复盘 ARB 20260901-0902 +36.7U`).
