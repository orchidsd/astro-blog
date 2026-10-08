---
title: Hexo anzhiyu 主题深度定制系列（九）：CI 质量门禁四道检查搭建实录
date: '2026-08-09 12:00:00'
tags:
  - Hexo
  - anzhiyu
  - CI/CD
  - 教程
categories:
  - 技术分享
ai: true
description: 一个 quality.yml 挂四道检查：构建、Gitleaks 泄漏扫描、Lighthouse 性能审计、内部链接死链检测，全部压进 push 流程，让「上线即翻车」成为过去式。
pubDate: '2026-08-09 12:00:00'
---

## 开头：push 成功 ≠ 上线成功

过去发布流程是：`git push` → 看 Actions 绿了 → 完事。直到某天线上出现一片 404（footer 协议链接指向不存在的页面）、某次配置里混进 API key、某篇博文性能分掉到 0.5——**构建绿 ≠ 质量好**，push 这个动作本身什么也保证不了。

本文记录如何用一个 `quality.yml` 挂起 **四道质量门禁**：构建通过、无密钥泄漏、性能达标、无死链，让 CI 替你做发布前体检。

## 目标声明 + 前置条件

本文带你完成：push 一次代码，GitHub Actions 自动跑 4 个 job，任一失败即标红，**构建产物还共享给后续 job 复用**（不重复构建）。

**前置条件：**

- [x] 仓库已配好 `deploy.yml`（构建部署流）
- [x] Node 22 + npm（CI 环境）
- [x] 有 `tools/` 目录放检查脚本

**你将学会：**

1. 多 job 并行 + artifact 传递的 CI 编排
2. Gitleaks 泄漏扫描接入
3. Lighthouse CI 静态站审计
4. 自写死链检查器 + 设计决策（为什么只查站内）

---

## Step 1：骨架：build job + artifact 共享

> 目的：先有一个能产出 public 产物的构建 job，其他 job 从它「下载」而不是各自重构建。做完这步 Actions 里出现「Build site」。

**操作：** 新建 `.github/workflows/quality.yml`，先写触发条件 + build job：

```yaml
name: Quality Checks

on:
  push:
    branches: [main]
    paths:
      - 'source/**'
      - 'themes/**'
      - 'scripts/**'
      - 'patches/**'
      - 'scaffolds/**'
      - '_config.yml'
      - '_config.anzhiyu.yml'
      - 'sitemap-template.xml'
      - 'package.json'
      - 'package-lock.json'
      - 'hexo-offline.config.cjs'
      - 'lighthouserc.json'
      - 'workers/**'
      - 'tools/**'
      - '.github/workflows/**'
  workflow_dispatch:

permissions:
  contents: read
  pull-requests: write

jobs:
  build:
    name: Build site
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Generate site
        run: npx hexo clean && npx hexo generate

      - name: Upload generated site
        uses: actions/upload-artifact@v4
        with:
          name: generated-site
          path: public
          retention-days: 7
```

**预期输出：** push 后 Quality Checks → Build site 绿色，Artifacts 里出现 `generated-site`（保留 7 天）。

> ⚠️ **报错排查**：触发路径 `paths` 一定不能漏掉 `tools/**`（检查脚本改了不触发的话，CI 还跑旧脚本）；`npm ci` 需要 `package-lock.json`，别用 `npm install`。

---

## Step 2：secrets job：Gitleaks 泄漏扫描

> 目的：任何 push 都扫描一次仓库明文凭据。做完这步 Scan for secrets 上线。

**操作：** build job 之后并列添加：

```yaml
  secrets:
    name: Scan for secrets
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 1

      - name: Run Gitleaks
        uses: gitleaks/gitleaks-action@v2
        with:
          config-path: .gitleaks.toml
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

> 需要一份 `.gitleaks.toml` 豁免公共 key 的细节，见本系列第⑧篇《API Key 安全注入与 Gitleaks 泄漏扫描修复实录》。

**预期输出：** Scan for secrets 通过；仓库里若混入 key 立即红。

> ⚠️ **报错排查**：默认配置会扫全历史（`fetch-depth: 1` 只查最新）；公共 key（如 IndexNow 公钥、主题自带 key）必须进 allowlist，否则天天误报。

---

## Step 3：lighthouse job：性能/无障碍/SEO 审计

> 目的：静态产物直接跑 Lighthouse，四类指标设阈值，不合格标黄/标红。做完这步 Lighthouse audit 上线。

**操作：** 新建 `lighthouserc.json`：

```json
{
  "ci": {
    "collect": {
      "staticDistDir": "./public",
      "numberOfRuns": 1
    },
    "assert": {
      "assertions": {
        "categories:performance": ["warn", { "minScore": 0.7 }],
        "categories:accessibility": ["warn", { "minScore": 0.9 }],
        "categories:best-practices": ["warn", { "minScore": 0.9 }],
        "categories:seo": ["warn", { "minScore": 0.9 }]
      }
    },
    "upload": {
      "target": "temporary-public-storage"
    }
  }
}
```

job 里下载 build 产物再审计（`needs: build`）：

```yaml
  lighthouse:
    name: Lighthouse audit
    needs: build
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Download generated site
        uses: actions/download-artifact@v4
        with:
          name: generated-site
          path: public

      - name: Run Lighthouse CI
        uses: treosh/lighthouse-ci-action@v12
        with:
          configPath: './lighthouserc.json'
          uploadArtifacts: true
```

**预期输出：** Lighthouse audit 报告可在线查看（temporary-public-storage 会给出 URL），性能 ≥0.7、其余 ≥0.9 达标。

> ⚠️ **报错排查**：Lighthouse 走 `staticDistDir` 时静态站默认路由 `/?path=/`，如果首页依赖 JS 渲染可能分低，先确认基线；阈值用 `warn`（黄）还是 `error`（红）按需调，首次接入建议 warn 观察一周。

---

## Step 4：broken-links job：自写死链检查器

> 目的：站内链接（href/src）全部指向真实存在的产物文件，缺失即红。做完这步 Check internal links 上线。

**操作：** 新建 `tools/check-internal-links.js`（核心思路）：

```js
// 内部链接检查：扫描 public 目录下所有 .html 中的站内链接（href/src），
// 确认目标文件存在于构建产物中，缺失即报错退出（供 CI 使用）。
//
// 设计决策：
// - 只查站内链接（/ 开头绝对路径、相对路径），外部 URL / CDN 不查，
//   规避外链 403/限流导致的假阳性。
// - 支持 hexo 的 /path/（目录 index.html）与 /path（.html 或目录）两种形态。
// - 中文/编码链接先 decodeURIComponent 再匹配文件。

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "public");
const HTML_EXT = ".html";

function walk(dir, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, out);
    else if (ent.name.endsWith(HTML_EXT)) out.push(full);
  }
  return out;
}

function resolveTarget(baseFile, rawUrl) {
  const clean = rawUrl.split("#")[0].split("?")[0];
  if (!clean) return null;
  let decoded;
  try { decoded = decodeURIComponent(clean); } catch { decoded = clean; }
  if (decoded.startsWith("/")) return path.join(ROOT, decoded);
  return path.join(path.dirname(baseFile), decoded);
}

function existsAs(target) {
  if (fs.existsSync(target)) return true;
  if (fs.existsSync(target + HTML_EXT)) return true;
  if (fs.existsSync(path.join(target, "index" + HTML_EXT))) return true;
  return false;
}

function stripScripts(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
}

const LINK_RE = /(?<![\w-])(?:href|src)\s*=\s*["']([^"']+)["']/g;

const files = walk(ROOT, []);
const failures = [];
let total = 0;

for (const file of files) {
  const html = stripScripts(fs.readFileSync(file, "utf8"));
  let m;
  LINK_RE.lastIndex = 0;
  while ((m = LINK_RE.exec(html)) !== null) {
    const url = m[1];
    if (
      /^(https?:|mailto:|javascript:|data:|tel:|ftp:)/i.test(url) ||
      url.startsWith("//") || url.startsWith("#") ||
      url === "undefined" ||
      /\.(md|mdx|yml|yaml|json|txt|pdf|docx?)$/i.test(url)
    ) continue;
    const target = resolveTarget(file, url);
    if (!target) continue;
    total++;
    if (!existsAs(target)) {
      failures.push(`  ${path.relative(ROOT, file)} -> "${url}" (${path.relative(ROOT, target)} 不存在)`);
    }
  }
}

if (failures.length > 0) {
  console.error(`[check-internal-links] 发现 ${failures.length} 个失效内部链接（共检查 ${total} 个）：`);
  for (const f of failures) console.error(f);
  process.exit(1);
}
console.log(`[check-internal-links] OK：${files.length} 个 HTML，${total} 个内部链接全部可达`);
```

job：

```yaml
  broken-links:
    name: Check internal links
    needs: build
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Download generated site
        uses: actions/download-artifact@v4
        with:
          name: generated-site
          path: public

      - name: Run internal link checker
        run: node tools/check-internal-links.js
```

**预期输出：** 输出 `OK：N 个 HTML，M 个内部链接全部可达`；若某次改动引入死链，报错列出「哪个文件 → 哪个链接 → 缺哪个目标」。

> ⚠️ **报错排查**（都是实战踩过的坑）：
> - `onerror="src='undefined'"` 这类 JS 占位会误报，先过滤 `undefined`
> - `data-href` / `data-src` 等属性误匹配，正则用 `(?<![\w-])` 负向断言只匹配真正的 `href=`/`src=`
> - 主题 JS 里 `fetch("/api/xxx")` 这类运行时路径不在产物里，务必先 `stripScripts` 去掉 `<script>` 块
> - `.md` 链接（GitHub 风格文档）不在产物里，统一跳过
> - 老版本还有过 `href` 命中的是元素属性名而非 URL，配合 decodeURIComponent 处理中文链接

---

## 检查点：验证整体效果

> 全部勾选通过 = 质量门禁就位。

- [x] push 一次，Quality Checks 4 个 job 全部出现且跑完
- [x] Build site 产物 `generated-site` 被 lighthouse / broken-links 复用（日志可见 download-artifact）
- [x] 故意在 footer 加一个不存在链接 → Check internal links 标红并报出精确位置
- [x] Lighthouse 报告 URL 可访问，指标达标
- [x] Gitleaks 全绿（豁免配置已生效）

---

## 常见问题（FAQ）

| 问题 | 原因 | 解决 |
|------|------|------|
| 改了 tools/ 不触发 CI | paths 漏了 `tools/**` | 补进触发路径 |
| 死链检查天天误报 | 正则把 JS/外链当站内链接 | stripScripts + 负向断言 + 外链白名单 |
| Lighthouse 一直红 | 阈值太严 / 基线未建 | 先 `warn` 观察一周再收严 |
| job 并行各自构建 | 没配 needs/download-artifact | 用 build 产物共享，别重复 `hexo generate` |

---

## 总结

本文把「push 即体检」落地成 4 个并行 job：构建 → 泄漏扫描 → 性能审计 → 死链检测。核心要点：

1. **产物共享**：build job 产出 artifact，其余 job `needs: build` 下载，不重复构建
2. **四条门禁互补**：Gitleaks 管安全、Lighthouse 管体验、死链管完整性、build 管可编译
3. **触发路径收窄**：只跑相关目录，省 Actions 额度
4. **检查器自研可控**：死链检查 90 行搞定，设计决策都写在注释里

**延伸阅读：**

- [上一篇：API Key 安全注入与 Gitleaks 泄漏扫描修复实录](https://blog.weiguang.eu.org/2026/08/09/hexo-anzhiyu-series/08-api-key-security/)
- [下一篇：部署三层验证 SOP](https://blog.weiguang.eu.org/2026/08/09/hexo-anzhiyu-series/10-deploy-verify/)
- [Lighthouse CI 文档](https://github.com/GoogleChrome/lighthouse-ci)
