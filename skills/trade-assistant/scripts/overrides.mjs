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
  console.log(t === null ? '状态：未创建（对话让 agent seed 即可）' : `状态：已存在（${t.length} 字符）`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) main();
