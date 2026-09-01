#!/usr/bin/env node
// Binance 合约 MCP server（stdio，零第三方依赖）
// 工具：行情查询（只读）+ 账户查询（只读）+ 下单执行（需 confirm 显式确认）
// 数据源：fapi.binance.com 公开行情（curl+代理） + binance-cli（签名操作）
import { execFile } from 'child_process';

const PROXY = process.env.BINANCE_PROXY || 'http://127.0.0.1:7897';
const FAPI = 'https://fapi.binance.com';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CLI_NAME = process.platform === 'win32' ? 'binance-cli.cmd' : 'binance-cli';

// ---------- 输入校验（防 shell 注入，LLM 可控参数必须过这道门） ----------
// 币安符号：大写字母/数字/下划线/中文（如 牛来USDT），禁止任何 shell 元字符
const SYM_RE = /^[A-Za-z0-9_一-鿿]+$/;
const SHELL_META = /[;&|$`"'\\\n\r]/;
function assertSafe(value, label, re = SYM_RE) {
  if (typeof value !== 'string' || !re.test(value) || SHELL_META.test(value)) {
    throw new Error(`非法 ${label}: 包含不允许的字符`);
  }
  return value;
}
function assertNum(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`非法 ${label}: 必须为正数`);
  return n;
}
const enc = (s) => encodeURIComponent(String(s));

// ---------- 底层调用 ----------
function curl(url, { retries = 3 } = {}) {
  return new Promise((resolve, reject) => {
    let attempt = 0;
    const run = () => {
      execFile('curl', ['-sS', '-m', '30', '-x', PROXY, url], { maxBuffer: 32 * 1024 * 1024 }, (err, stdout) => {
        if (!err && stdout) return resolve(stdout);
        if (++attempt < retries) return setTimeout(run, 3000);
        reject(new Error('curl 失败: ' + (err?.message || '空响应')));
      });
    };
    run();
  });
}

// 用 execFile(参数数组) 执行 binance-cli——不使用 shell，从根上杜绝命令注入
function cli(args, { retries = 3 } = {}) {
  const env = { ...process.env, HTTPS_PROXY: PROXY, HTTP_PROXY: PROXY };
  return new Promise((resolve, reject) => {
    let attempt = 0;
    const run = () => {
      execFile(CLI_NAME, args, { env, timeout: 90000, maxBuffer: 16 * 1024 * 1024 }, (err, stdout) => {
        const out = (stdout || '').trim();
        if (!err && out && !/failed|recvWindow|Way too many/i.test(out)) {
          const s = out.search(/[[{]/);
          try { return resolve(JSON.parse(out.slice(s))); } catch { /* fallthrough */ }
        }
        if (++attempt < retries) return setTimeout(run, 6000);
        reject(new Error(out || err?.message || 'cli 失败'));
      });
    };
    run();
  });
}

const fapi = async (path) => JSON.parse(await curl(FAPI + path));

// ---------- 工具实现 ----------
const tools = {
  // 行情（只读）
  get_klines: { desc: 'K线/蜡烛图（15m/1h/4h/1d 等）', params: ['symbol', 'interval', 'limit'] },
  get_ticker: { desc: '最新价 + 24h 涨跌幅/振幅/成交额', params: ['symbol'] },
  get_funding_rate: { desc: '资金费率历史', params: ['symbol', 'limit'] },
  get_orderbook: { desc: '盘口深度（买/卖墙）', params: ['symbol', 'limit'] },
  get_long_short_ratio: { desc: '大户持仓多空比', params: ['symbol', 'period'] },
  // 账户（只读）
  get_positions: { desc: '当前持仓（含盈亏/强平距离）', params: [] },
  get_balance: { desc: '合约账户余额', params: [] },
  get_open_orders: { desc: '当前挂单', params: [] },
  // 下单（写操作，必须 confirm=true）
  place_order: { desc: '开仓/平仓（需 confirm=true 确认）', params: ['symbol', 'side', 'type', 'quantity', 'price', 'reduceOnly', 'confirm'] },
  set_stop_loss: { desc: '挂止损（需 confirm=true 确认）', params: ['symbol', 'triggerPrice', 'quantity', 'confirm'] },
  cancel_order: { desc: '撤单（需 confirm=true 确认）', params: ['symbol', 'orderId', 'confirm'] },
};

async function callTool(name, args) {
  switch (name) {
    case 'get_klines': {
      const sym = assertSafe(args.symbol, 'symbol');
      const d = await fapi(`/fapi/v1/klines?symbol=${enc(sym)}&interval=${enc(args.interval || '15m')}&limit=${Number(args.limit) || 48}`);
      return d.map((k) => ({ t: new Date(+k[0]).toISOString().slice(11, 16), o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] }));
    }
    case 'get_ticker': {
      const sym = assertSafe(args.symbol, 'symbol');
      const [p, t] = await Promise.all([
        fapi(`/fapi/v1/ticker/price?symbol=${enc(sym)}`),
        fapi(`/fapi/v1/ticker/24hr?symbol=${enc(sym)}`),
      ]);
      return { price: +p.price, pct24h: +t.priceChangePercent, amp24h: ((+t.highPrice - +t.lowPrice) / +p.price) * 100, vol24h: Math.round(+t.quoteVolume), high: +t.highPrice, low: +t.lowPrice };
    }
    case 'get_funding_rate': {
      const sym = assertSafe(args.symbol, 'symbol');
      const d = await fapi(`/fapi/v1/fundingRate?symbol=${enc(sym)}&limit=${Number(args.limit) || 3}`);
      return d.map((f) => ({ time: new Date(+f.fundingTime).toISOString().slice(5, 16), rate: +f.fundingRate, mark: +f.markPrice }));
    }
    case 'get_orderbook': {
      const sym = assertSafe(args.symbol, 'symbol');
      const d = await fapi(`/fapi/v1/depth?symbol=${enc(sym)}&limit=${Number(args.limit) || 10}`);
      const bs = d.bids.reduce((a, b) => a + +b[1], 0), as = d.asks.reduce((a, b) => a + +b[1], 0);
      return { bidTotal: bs, askTotal: as, ratio: +(bs / as).toFixed(2), bids: d.bids.slice(0, 5), asks: d.asks.slice(0, 5) };
    }
    case 'get_long_short_ratio': {
      const sym = assertSafe(args.symbol, 'symbol');
      const d = await fapi(`/futures/data/topLongShortPositionRatio?symbol=${enc(sym)}&period=${enc(args.period || '1h')}&limit=3`);
      return d.map((x) => ({ ratio: x.longShortRatio, longPct: (x.longAccount * 100).toFixed(0) + '%' }));
    }
    case 'get_positions': {
      const a = await cli(['futures-usds', 'account-information-v2']);
      return (a.positions || []).filter((p) => +p.positionAmt !== 0).map((p) => ({
        symbol: p.symbol, side: +p.positionAmt > 0 ? 'LONG' : 'SHORT', amount: +p.positionAmt,
        entry: +p.entryPrice, mark: +p.markPrice, liq: p.liquidationPrice,
        pnl: +((+p.markPrice - +p.entryPrice) * +p.positionAmt).toFixed(2),
      }));
    }
    case 'get_balance': {
      const a = await cli(['futures-usds', 'account-information-v2']);
      return { balance: +a.totalWalletBalance, available: +a.availableBalance, unrealizedPnl: +a.totalUnrealizedProfit };
    }
    case 'get_open_orders': {
      const o = await cli(['futures-usds', 'current-all-open-orders']);
      return o.map((x) => ({ symbol: x.symbol, side: x.side, type: x.type, price: x.price, qty: x.origQty, stop: x.stopPrice, reduceOnly: x.reduceOnly }));
    }
    case 'place_order': {
      if (args.confirm !== true) throw new Error('下单必须 confirm=true 显式确认（受 CONFIRM 协议约束）');
      const sym = assertSafe(args.symbol, 'symbol');
      const side = assertSafe(args.side, 'side', /^(BUY|SELL)$/);
      const type = assertSafe(args.type, 'type', /^(MARKET|LIMIT|STOP|STOP_MARKET|TAKE_PROFIT|TAKE_PROFIT_MARKET|TRAILING_STOP_MARKET)$/);
      const qty = String(assertNum(args.quantity, 'quantity'));
      const argv = ['futures-usds', 'new-order', '--symbol', sym, '--side', side, '--type', type, '--quantity', qty];
      if (args.price !== undefined) argv.push('--price', String(assertNum(args.price, 'price')));
      if (args.reduceOnly) argv.push('--reduce-only', 'true');
      const r = await cli(argv);
      return { status: 'OK', orderId: r.orderId, clientOrderId: r.clientOrderId, avgPrice: r.avgPrice || r.price, executedQty: r.executedQty, statusText: r.status };
    }
    case 'set_stop_loss': {
      if (args.confirm !== true) throw new Error('挂止损必须 confirm=true 显式确认');
      const sym = assertSafe(args.symbol, 'symbol');
      const trigger = String(assertNum(args.triggerPrice, 'triggerPrice'));
      const qty = String(assertNum(args.quantity, 'quantity'));
      const r = await cli(['futures-usds', 'new-algo-order', '--algo-type', 'CONDITIONAL', '--symbol', sym, '--side', 'SELL', '--type', 'STOP_MARKET', '--trigger-price', trigger, '--quantity', qty, '--reduce-only', 'true', '--new-order-resp-type', 'RESULT']);
      return { status: 'OK', stopPlaced: true, triggerPrice: trigger };
    }
    case 'cancel_order': {
      if (args.confirm !== true) throw new Error('撤单必须 confirm=true 显式确认');
      const sym = assertSafe(args.symbol, 'symbol');
      const orderId = String(assertNum(args.orderId, 'orderId'));
      const r = await cli(['futures-usds', 'cancel-order', '--symbol', sym, '--order-id', orderId]);
      return { status: 'OK', canceled: r.orderId };
    }
    default:
      throw new Error(`未知工具: ${name}`);
  }
}

// ---------- MCP stdio 协议 ----------
const send = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');
let buf = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', async (chunk) => {
  buf += chunk;
  const lines = buf.split('\n');
  buf = lines.pop(); // 保留未完整的一行
  for (const line of lines) {
    if (!line.trim()) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    try {
      if (msg.method === 'initialize') {
        send({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'binance-mcp', version: '0.1.0' } } });
      } else if (msg.method === 'notifications/initialized' || msg.method === 'notifications/cancelled') {
        // 无需回复
      } else if (msg.method === 'tools/list') {
        send({ jsonrpc: '2.0', id: msg.id, result: { tools: Object.entries(tools).map(([name, t]) => ({
          name, description: t.desc + '。写操作工具必须传 confirm:true，且受交易工程 CONFIRM 协议约束。', inputSchema: { type: 'object', properties: Object.fromEntries(t.params.map((p) => [p, { type: p === 'confirm' ? 'boolean' : 'string' }])), required: t.params.slice(0, Math.min(2, t.params.length)) },
        })) } });
      } else if (msg.method === 'tools/call') {
        const { name, arguments: args = {} } = msg.params;
        try {
          const result = await callTool(name, args);
          send({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: JSON.stringify(result, null, 1) }] } });
        } catch (e) {
          send({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: `❌ ${e.message}` }], isError: true } });
        }
      }
    } catch (e) {
      send({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: '❌ 服务器错误: ' + e.message }], isError: true } });
    }
  }
});
