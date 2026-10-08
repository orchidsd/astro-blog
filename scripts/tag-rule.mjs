import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const yaml = require('D:/hexo_blog/blog/node_modules/js-yaml/dist/js-yaml.cjs.js');

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.md')) out.push(p);
  }
  return out;
}
const tags = new Set();
for (const f of walk('D:/hexo_blog/blog/source/_posts')) {
  const raw = readFileSync(f, 'utf-8');
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) continue;
  const fm = yaml.load(m[1]);
  for (const t of fm.tags ?? []) tags.add(t);
}
const hexoDirs = new Set(readdirSync('D:/hexo_blog/blog/public/tags').filter((e) => e !== 'index.html'));
for (const t of [...tags].sort()) {
  // hexo slugify: 空格、斜杠 → '-'
  const slug = t.replace(/[\s/]/g, '-');
  console.log(JSON.stringify({ tag: t, slug, hexoDir: hexoDirs.has(slug) }));
}