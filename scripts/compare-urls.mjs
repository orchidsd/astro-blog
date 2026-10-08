import { readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

function list(base, root = base, out = []) {
  for (const e of readdirSync(base)) {
    if (e.startsWith('.')) continue;
    if (['assets', 'fonts', 'img'].includes(e) && base === root) continue;
    const p = join(base, e);
    let rel = p.slice(root.length).replace(/\\/g, '/');
    if (statSync(p).isDirectory()) {
      list(p, root, out);
    } else if (e === 'index.html') {
      out.push(rel.slice(1, 'index.html'.length + 1) ? rel.slice(1, -'index.html'.length) : '/');
    }
  }
  return out;
}

const astro = list('D:/astro/blog/dist').map((u) => (u.startsWith('/') ? u : '/' + u)).sort();
const hexo = list('D:/hexo_blog/blog/public').map((u) => (u.startsWith('/') ? u : '/' + u)).sort();

const onlyAstro = astro.filter((u) => !hexo.includes(u));
const onlyHexo = hexo.filter((u) => !astro.includes(u));

console.log('astro count:', astro.length);
console.log('hexo count:', hexo.length);
console.log('only in astro:', onlyAstro.length);
console.log(onlyAstro.join('\n') || '(none)');
console.log('---only in hexo:', onlyHexo.length);
console.log(onlyHexo.slice(0, 40).join('\n') || '(none)');