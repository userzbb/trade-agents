# 01 Selection & Signals (选币与信号)

> Content in English; user-facing output in Chinese. Re-rank within 30 min of waking, once/day. No mid-day coin switches.

## 1. Daily Pool Re-rank (once per day)

**Data sources** (`binance-cli` / `fapi.binance.com`):
- `ticker/24hr` — market-wide 24h change, volume, amplitude
- `get-funding-rate-history` — candidate funding rates
- `top-trader-long-short-ratio-positions` — top-trader position ratio

**Long pool criteria (ALL must hold):**

| Criterion | Threshold |
|---|---|
| 24h volume | > 50M USDT |
| 24h change | > +10% (money is present) |
| 24h amplitude | 20–50% (>50% = grinder → reduce or skip) |
| Funding rate | ≤ +0.05%/8h (overheated → no long) |
| Type | Mainstream alts first (ARB/OP/CRV class); new coins → lottery pool only |

**Short pool criteria (ANY one):**

| Signal | Definition |
|---|---|
| Overheated funding | funding > +0.15%/8h AND price stagnant |
| Distribution breakdown | pumped coin, high-level sideways ≥4h, breaks range lower edge |
| Catch-down chain | BTC/ETH turning down + top-8 gainers pulling back together → short the laggard/leader |
| Funding gate | before shorting, confirm funding ≥ -0.1% (negative funding = crowded shorts → don't) |

**Market tone (decides which side today):**
- BTC/ETH 24h down + long-contract share <30% → **risk-off, short-heavy**
- BTC/ETH steady + ≥3 altcoins with volume hotspots → **risk-on, long-heavy**
- Market sideways, amplitude shrinking → **wait; being flat is fine**

## 2. Core Signal Library

### S1 — Negative funding + momentum (long, strongest of the day)
```
Funding < -0.1%/8h (shorts paying, crowded)
+ 15m volume breakout above prior high
→ LONG. Shorts are fuel; squeeze probability is high.
Case: 2026-08-31 SKR funding -0.57%, +4.5%/candle after breakout, +36U
```

### S2 — Healthy pullback (long)
```
15m/1h lows making higher lows
+ pullback to prior platform on shrinking volume (vol < 0.5× average)
+ prior low holds
→ LONG. Case: 2026-08-31 HEMI 0.0147–0.0150 five test-pumps held
```

### S3 — Catch-down chain short (highest win rate)
```
Market turns down + strong coin prints a volume bearish candle breaking 15m prior low
→ SHORT. Capital leaves steadily, not crashing — suited to placing a stop.
Case: 2026-08-31 MAGMA/PROM/ZKC all-day fading channel
```

### S4 — Distribution breakdown (short, lottery-grade)
```
Pumped coin (+40%+) high-volume stagnant at top
+ bid wall eaten, ask wall thickening
+ breaks range lower edge
→ SHORT. The final act of the MM's script.
```

### S6 — Range-edge ambush (the only legal entry on sideways days)
```
Range-quality check (ALL must hold):
- each edge tested ≥3 times
- range alive ≥8h
- shrinking volume at tests (seller/buyer exhaustion)
- no ongoing market risk-off
Execution:
- LONG: limit below support 0.3–0.8% (catch the wick)
- SHORT: limit above resistance 0.3–0.8%
- Stop: 1.5–2% outside the structure (room for the wick)
- TP: the other edge (+3~6%)
- Position: 15–20% (below trend-trade size)
Logic: the MM always wicks when washing out — while sweeping others' stops, it cheaply sells you inventory.
Risk: real breakdown → the limit order catches a knife → hard stop; do not retrade that range the same day.
```

### Anti-signals (ANY one = drop the coin)
- Amplitude >50% with no clear trend (grinder)
- Already bounced >15% off the day's low (chasing risk)
- 24h volume < 30M USDT (slippage will kill the stop)
- Top-trader LS ratio >2.5 AND funding negative (both sides crowded, direction unpredictable)

### Tool mapping (which engine executes which signal — see ref 00 Three-Tool Decision Framework)
| Signal | Nature | Route |
|---|---|---|
| S1 negative-funding momentum | trend/momentum | **Freqtrade** (backtest/validate, run unattended) or manual |
| S2 healthy pullback | trend | **Freqtrade** or manual |
| S3 catch-down chain short | trend/breakdown | **Freqtrade** (directional) or manual |
| S4 distribution breakdown | trend/breakdown | **Freqtrade** (directional) or manual |
| S6 range-edge ambush | mean-reversion / range | **Hummingbot** (grid) — the range IS a grid; or manual limit |
| MM coins (BTR type) | market-maker games | **Hummingbot** (MM/grid controllers) or manual w/ game-theory (ref 04) |

## 3. Daily Data Scripts

```bash
# Market-wide 24h scan (gainer/volume leaderboards)
curl -s "https://fapi.binance.com/fapi/v1/ticker/24hr" | node -e "...sort by change/volume"

# Candidate funding rate
binance-cli futures-usds get-funding-rate-history --symbol <SYM> --limit 3

# Top-trader long/short ratio
binance-cli futures-usds top-trader-long-short-ratio-positions --symbol <SYM> --period 1h --limit 3

# Orderbook walls (must-check before entry/exit)
curl -s "https://fapi.binance.com/fapi/v1/depth?symbol=<SYM>&limit=10"
# Bid wall total > 20kU and rising = strong absorption; ask wall surge = distribution
```

## 4. Re-rank Discipline

- Re-rank the pool **once per day** (morning); do not chase new hotspots intraday (that is a 手痒 trade).
- Candidate list always ≤3 long + 3 short; more = choice paralysis.
- Coins already in a position are not moved by pool updates unless their stop triggers.
