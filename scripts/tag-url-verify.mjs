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
// hexo 生成的 tag URL（目录名）
function dirs(base, root, out) {
  for (const e of readdirSync(base)) {
    if (e.startsWith('.')) continue;
    const p = join(base, e);
    if (statSync(p).isDirectory()) dirs(p, root, out);
    else if (e === 'index.html') {
      let rel = p.slice(root.length).replace(/\\/g, '/');
      out.push('/' + rel.slice(1, -'index.html'.length));
    }
  }
  return out;
}
const hexoTagUrls = dirs('D:/hexo_blog/blog/public/tags', 'D:/hexo_blog/blog/public/tags', []);
console.log('原始 tag → hexo URL:');
for (const t of [...tags].sort()) {
  const h = hexoTagUrls.find((u) => u.endsWith('/' + encodeURI(t.replace(/[/ ]/g, '-')).replace(/%20/g, '-') + '/'));
  console.log(JSON.stringify({ tag: t, hexoUrl: h ?? 'NOT FOUND' }));
}