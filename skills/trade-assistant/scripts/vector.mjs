// vector.mjs — local BM25 retrieval over trade reviews + strategy references.
// Zero-dependency Node (>=18). Chinese via character bigrams; ASCII via word tokens.
//
// Sources (auto-detected):
//   kind=review     : ${TRADE_HOME}/retrospectives/**/*.md   (default TRADE_HOME = D:/trade)
//   kind=reference  : <this script's dir>/../references/*.md
//
// CLI:
//   node vector.mjs index [--out <index.json>]
//   node vector.mjs query "<text>" [--top N] [--filter review|reference]
//
// Cache: ${TRADE_HOME}/vector-index.json (override with VECTOR_INDEX_PATH).
// Rebuilds automatically when any source file's mtime/size changed.
// User-facing output is in Chinese.

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, dirname, basename, extname, sep } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TRADE_HOME = process.env.TRADE_HOME || 'D:/trade';
const DEFAULT_OUT = process.env.VECTOR_INDEX_PATH || join(TRADE_HOME, 'vector-index.json');

const K1 = 1.5, B = 0.75;
const VERSION = 1;

// ---------- file discovery ----------

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (extname(p).toLowerCase() === '.md') out.push(p);
  }
  return out;
}

function sources() {
  const docs = [];
  for (const p of walk(join(TRADE_HOME, 'retrospectives'))) {
    docs.push({ path: p, kind: 'review', name: basename(p, '.md') });
  }
  const refDir = join(HERE, '..', 'references');
  for (const p of walk(refDir)) {
    docs.push({ path: p, kind: 'reference', name: basename(p, '.md') });
  }
  return docs;
}

// ---------- tokenization ----------

// Strip YAML frontmatter and fenced code blocks (code rarely carries query semantics).
function clean(text) {
  let t = text.replace(/^---[\s\S]*?---\n?/, '');
  t = t.replace(/```[\s\S]*?```/g, ' ');
  return t;
}

const CJK = /[\u4e00-\u9fff\u3400-\u4dbf]/;
const ASCII = /[a-zA-Z0-9]/;

// CJK runs -> character bigrams; ASCII runs -> lowercase word tokens.
function tokenize(text) {
  const tokens = [];
  let cjkBuf = '', asciiBuf = '';
  const flushCjk = () => {
    if (!cjkBuf) return;
    if (cjkBuf.length === 1) tokens.push(cjkBuf);
    else for (let i = 0; i < cjkBuf.length - 1; i++) tokens.push(cjkBuf.slice(i, i + 2));
    cjkBuf = '';
  };
  const flushAscii = () => {
    if (asciiBuf) { tokens.push(asciiBuf.toLowerCase()); asciiBuf = ''; }
  };
  for (const ch of clean(text)) {
    if (CJK.test(ch)) { flushAscii(); cjkBuf += ch; }
    else if (ASCII.test(ch)) { flushCjk(); asciiBuf += ch; }
    else { flushCjk(); flushAscii(); }
  }
  flushCjk(); flushAscii();
  return tokens;
}

// ---------- index ----------

function buildIndex(docs) {
  const outDocs = [];
  const inverted = {};
  let totalLen = 0;
  docs.forEach((d, docId) => {
    const raw = readFileSync(d.path, 'utf8');
    const tokens = tokenize(raw);
    const freq = {};
    for (const tk of tokens) freq[tk] = (freq[tk] || 0) + 1;
    const postings = Object.entries(freq).map(([term, tf]) => {
      (inverted[term] = inverted[term] || []).push([docId, tf]);
      return [term, tf];
    });
    totalLen += tokens.length;
    outDocs.push({ ...d, docId, mtime: statSync(d.path).mtimeMs, size: statSync(d.path).size, length: tokens.length, freq });
  });
  return { version: VERSION, docs: outDocs, inverted, avgdl: outDocs.length ? totalLen / outDocs.length : 0, n: outDocs.length };
}

function idf(N, n) { return Math.log(1 + (N - n + 0.5) / (n + 0.5)); }

function scoreDoc(idx, doc, queryTokens) {
  let s = 0;
  for (const q of queryTokens) {
    const postings = idx.inverted[q];
    if (!postings) continue;
    const hit = postings.find(([d]) => d === doc.docId);
    if (!hit) continue;
    const tf = hit[1], n = postings.length;
    const w = idf(idx.n, n) * ((tf * (K1 + 1)) / (tf + K1 * (1 - B + B * (doc.length / idx.avgdl))));
    s += w;
  }
  return s;
}

// Build a ~200-char snippet around the first strong hit.
function snippet(text, qTokens) {
  const tokens = tokenize(text);
  if (!tokens.length) return text.slice(0, 200);
  let best = 0, bestScore = 0;
  for (let i = 0; i < tokens.length; i++) {
    let s = 0;
    for (const q of qTokens) if (tokens[i] === q) s++;
    if (s > bestScore) { bestScore = s; best = i; }
  }
  if (bestScore === 0) { const k = text.indexOf('\n'); return text.slice(0, k > 0 ? k : 200); }
  // Rebuild approximate char offset: token positions in the token stream are not char offsets,
  // so fall back to a leading paragraph (deterministic and good enough).
  const par = text.split(/\n{2,}/).find((p) => p.trim()) || text;
  return par.slice(0, 200);
}

// ---------- CLI ----------

function loadOrBuild() {
  const docs = sources();
  if (existsSync(DEFAULT_OUT)) {
    try {
      const cached = JSON.parse(readFileSync(DEFAULT_OUT, 'utf8'));
      const same = cached.version === VERSION && cached.docs.length === docs.length &&
        cached.docs.every((c, i) => c.path === docs[i].path && c.mtime === statSync(docs[i].path).mtimeMs && c.size === statSync(docs[i].path).size);
      if (same) return cached;
    } catch { /* rebuild */ }
  }
  const idx = buildIndex(docs);
  writeFileSync(DEFAULT_OUT, JSON.stringify(idx));
  console.log(`索引已构建 → ${DEFAULT_OUT}（${idx.n} 篇文档）`);
  return idx;
}

const cmd = process.argv[2];
const args = process.argv.slice(3);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };

if (cmd === 'index') {
  const idx = buildIndex(sources());
  const out = opt('--out', DEFAULT_OUT);
  writeFileSync(out, JSON.stringify(idx));
  console.log(`索引已构建 → ${out}（${idx.n} 篇文档：${idx.docs.filter((d) => d.kind === 'review').length} 复盘 / ${idx.docs.filter((d) => d.kind === 'reference').length} 策略）`);
} else if (cmd === 'query') {
  const q = args.find((a) => !a.startsWith('--'));
  if (!q) { console.error('用法: node vector.mjs query "<文本>" [--top N] [--filter review|reference]'); process.exit(1); }
  const top = Number(opt('--top', '5'));
  const filter = opt('--filter', '');
  const idx = loadOrBuild();
  const qt = tokenize(q);
  let results = idx.docs
    .map((d) => ({ d, s: scoreDoc(idx, d, qt) }))
    .filter((r) => r.s > 0 && (!filter || r.d.kind === filter))
    .sort((a, b) => b.s - a.s)
    .slice(0, top);
  const label = { review: '复盘', reference: '策略' };
  if (!results.length) {
    console.log(`未找到相关文档${filter ? `（${label[filter] || filter}）` : ''}。${idx.n === 0 ? '索引为空，先跑 node vector.mjs index' : '试试换关键词。'}`);
  } else {
    console.log(`| 序号 | 类型 | 文件 | 相关度 |`);
    console.log(`|---|---|---|---|`);
    results.forEach((r, i) => {
      const raw = readFileSync(r.d.path, 'utf8');
      console.log(`| ${i + 1} | ${label[r.d.kind] || r.d.kind} | ${r.d.path.split(sep).slice(-3).join('/')} | ${r.s.toFixed(3)} |`);
      console.log(`|   |   | ${snippet(raw, qt).replace(/\|/g, '\\|').replace(/\n/g, ' ')} | |`);
    });
    const nR = results.filter((r) => r.d.kind === 'review').length;
    const nS = results.length - nR;
    console.log(`找到 ${nR} 篇相似复盘，${nS} 条策略知识${filter ? `（筛选：${label[filter] || filter}）` : ''}`);
  }
} else {
  console.error('用法: node vector.mjs index | query "<文本>" [--top N] [--filter review|reference]');
  process.exit(1);
}
