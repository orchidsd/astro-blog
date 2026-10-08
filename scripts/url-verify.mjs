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

// hexo public 站的 post URL 集
function listHtml(base, root = base, out = []) {
  for (const e of readdirSync(base)) {
    if (e.startsWith('.')) continue;
    const p = join(base, e);
    if (statSync(p).isDirectory()) listHtml(p, root, out);
    else if (e === 'index.html') {
      let rel = p.slice(root.length).replace(/\\/g, '/');
      out.push('/' + rel.slice(1, -'index.html'.length));
    }
  }
  return out;
}
const hexo = listHtml('D:/hexo_blog/blog/public');

// 29 篇文章 frontmatter
for (const f of walk('D:/hexo_blog/blog/source/_posts')) {
  const raw = readFileSync(f, 'utf-8');
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) continue;
  const fm = yaml.load(m[1]);
  const title = fm.title ?? '(no title)';
  // hexo URL 由 filename 决定（:year/:month/:day/:title/），title 即相对 path 去掉 _posts/.md
  const rel = f.split('_posts')[1].replace(/\\/g, '/').replace(/\.md$/, '');
  const hasHexoUrl = hexo.filter((u) => u.includes(rel));
  console.log(JSON.stringify({ file: rel, title, hexoUrl: hasHexoUrl.length ? hasHexoUrl[0] : 'NOT-FOUND' }));
}