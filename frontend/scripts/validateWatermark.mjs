// V67 — Global Prompt Watermark System (GPWS) Validator
// Scans version prompt markdown files and ensures they end with the
// required footer lines. Exits with code 1 on violations.

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(process.cwd(), '..');

const REQUIRED_FOOTER = [
  'Author: Onazi Treasure',
  'Watermark: OJ',
  'Build Verified: Yes',
];

function isPromptFile(file) {
  const base = path.basename(file);
  return /^(V\d+[_\w-]*)\.md$/i.test(base);
}

function walk(dir, acc = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) walk(fp, acc);
    else if (e.isFile() && fp.toLowerCase().endsWith('.md') && isPromptFile(fp)) acc.push(fp);
  }
  return acc;
}

const candidates = [ROOT, path.join(ROOT, 'buildlogs')];
const files = candidates.flatMap((d) => walk(d));

if (files.length === 0) {
  // No prompt files found — pass
  process.exit(0);
}

let failures = 0;
for (const file of files) {
  const content = fs.readFileSync(file, 'utf-8');
  const lines = content.trimEnd().split(/\r?\n/);
  const tail = lines.slice(-REQUIRED_FOOTER.length);
  const ok = REQUIRED_FOOTER.every((req, i) => (tail[i] || '').trim() === req);
  if (!ok) {
    console.error(`[V67][GPWS] Missing or incorrect footer in: ${path.relative(ROOT, file)}`);
    failures++;
  }
}

const STRICT = process.env.GPWS_STRICT === '1' || process.env.CI === 'true';
if (failures > 0) {
  const msg = `\n[V67][GPWS] ${failures} file(s) failed footer validation.`;
  if (STRICT) {
    console.error(msg);
    process.exit(1);
  } else {
    console.warn(msg);
    console.warn('[V67][GPWS] Non-strict mode: continuing with warnings. Set GPWS_STRICT=1 to enforce.');
    process.exit(0);
  }
}

console.log('[V67][GPWS] Footer validation passed.');
process.exit(0);
