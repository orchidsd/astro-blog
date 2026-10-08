// One-shot migration: hexo source/_posts -> astro src/content/blog
// Frontmatter map: keep title/date/tags/categories/description/ai, drop hexo-only keys.
// slug = path relative to source/_posts without .md (preserves series subdirs).
import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const yaml = require('D:/hexo_blog/blog/node_modules/js-yaml/dist/js-yaml.cjs.js');

const SRC = 'D:/hexo_blog/blog/source/_posts';
const DST = 'D:/astro/blog/src/content/blog';

// hexo-only frontmatter keys to drop
const DROP = new Set(['top_img', 'cover', 'type', 'sticky', 'hide']);

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.md')) out.push(p);
  }
  return out;
}

function fmtDate(v) {
  if (v instanceof Date) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')} ${String(v.getHours()).padStart(2, '0')}:${String(v.getMinutes()).padStart(2, '0')}:${String(v.getSeconds()).padStart(2, '0')}`;
  }
  return typeof v === 'string' ? v : v?.toISOString?.() ?? String(v ?? '');
}

const files = walk(SRC);
let n = 0;
for (const f of files) {
  const raw = readFileSync(f, 'utf-8').replace(/^\uFEFF/, '');
  if (!raw.startsWith('---')) continue;
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) { console.error('NO FRONTMATTER', f); continue; }
  let fm;
  try { fm = yaml.load(m[1]); } catch (e) { console.error('YAML FAIL', f, e.message); continue; }
  const body = raw.slice(m[0].length);

  const rel = relative(SRC, f).replace(/\.md$/, '');
  const out = join(DST, rel + '.md');
  const fm2 = {};
  for (const [k, v] of Object.entries(fm)) {
    if (DROP.has(k) || v === '' || v === null || v === undefined) continue;
    fm2[k] = k === 'date' ? fmtDate(v) : v;
  }
  fm2.pubDate = fm2.date;
  for (const k of ['categories', 'tags']) if (!Array.isArray(fm2[k])) delete fm2[k];

  const front = yaml.dump(fm2, { lineWidth: 200 });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `---\n${front}---\n${body}`, 'utf-8');
  n++;
}
console.log(`migrated ${n} posts`);
for (const [k, v] of Object.entries({ SRC, DST })) console.log(k, v);