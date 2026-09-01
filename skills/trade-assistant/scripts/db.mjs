// SQLite 数据库（node:sqlite 零依赖）：盈亏/分类/每日净值的统一存储
// 所有表都是追加型时间序列，git 提交 db 文件即自动备份
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'fs';
import { DATA_ROOT } from './_lib.mjs';

export const DB_PATH = process.env.TRADE_DB || `${DATA_ROOT}/data/trade.db`;
mkdirSync(DB_PATH.replace(/\/[^/]+$/, ''), { recursive: true });
export const db = new DatabaseSync(DB_PATH);

db.exec(`
CREATE TABLE IF NOT EXISTS income (
  tranId INTEGER PRIMARY KEY,        -- 币安流水号（幂等键）
  symbol TEXT, incomeType TEXT,      -- REALIZED_PNL / COMMISSION / FUNDING_FEE / TRANSFER...
  income REAL, asset TEXT,
  time INTEGER, date TEXT
);
CREATE INDEX IF NOT EXISTS idx_income_time ON income(time);
CREATE INDEX IF NOT EXISTS idx_income_type ON income(incomeType);

CREATE TABLE IF NOT EXISTS classification (
  symbol TEXT, date TEXT, tier TEXT, score INTEGER,
  volM REAL, amp REAL,
  PRIMARY KEY (symbol, date)         -- 每币每日一条 → 分级变档历史
);

CREATE TABLE IF NOT EXISTS daily_pnl (
  date TEXT PRIMARY KEY,             -- 净值序列（报告与回撤计算用）
  realized REAL, commission REAL, funding REAL, net REAL
);
`);

export function upsertIncome(rows) {
  const stmt = db.prepare(
    'INSERT OR REPLACE INTO income (tranId, symbol, incomeType, income, asset, time, date) VALUES (?,?,?,?,?,?,?)'
  );
  for (const r of rows) {
    stmt.run(r.tranId, r.symbol, r.incomeType, r.income, r.asset, r.time, r.date);
  }
}

export function upsertClassification(symbol, date, tier, score, volM, amp) {
  db.prepare(
    'INSERT OR REPLACE INTO classification (symbol, date, tier, score, volM, amp) VALUES (?,?,?,?,?,?)'
  ).run(symbol, date, tier, score, volM, amp);
}

export function refreshDailyPnl() {
  db.exec(`
    INSERT OR REPLACE INTO daily_pnl (date, realized, commission, funding, net)
    SELECT date,
      COALESCE(SUM(CASE WHEN incomeType='REALIZED_PNL' THEN income END),0),
      COALESCE(SUM(CASE WHEN incomeType='COMMISSION' THEN income END),0),
      COALESCE(SUM(CASE WHEN incomeType='FUNDING_FEE' THEN income END),0),
      COALESCE(SUM(CASE WHEN incomeType IN ('REALIZED_PNL','COMMISSION','FUNDING_FEE') THEN income END),0)
    FROM income GROUP BY date
  `);
}
