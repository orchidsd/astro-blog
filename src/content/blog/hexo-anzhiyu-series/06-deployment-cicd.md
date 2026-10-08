---
title: Hexo anzhiyu 主题深度定制系列（六）：部署与 CI/CD 终极指南
date: '2026-07-30 14:00:00'
tags:
  - Hexo
  - anzhiyu
  - CI/CD
  - GitHub Actions
  - Cloudflare Pages
categories:
  - 技术分享
ai: true
description: 从零搭建生产级部署流水线：GitHub Actions + Cloudflare Pages 双轨部署、Secrets 安全注入敏感配置、Git Submodule 主题升级流程、配置文件自动化生成、常见坑与排错清单。
pubDate: '2026-07-30 14:00:00'
---

## 前言

博客写得再好，部署不稳定、密钥泄露、升级主题炸配置，全白搭。本文把**「从推送到上线」**的全链路标准化，形成可复制、可审计、可回滚的工程化流程。

---

## 1. 架构总览

```
┌─────────────┐     push/main      ┌──────────────────┐
│  本地/IDE   │ ─────────────────► │  GitHub Repo     │
│  (开发)     │                    │  (源码 + Submodule)│
└─────────────┘                    └────────┬─────────┘
                                             │
                    ┌────────────────────────┼────────────────────────┐
                    ▼                        ▼                        ▼
           ┌───────────────┐         ┌───────────────┐         ┌───────────────┐
           │ GitHub Pages  │         │ Cloudflare    │         │  Docker/      │
           │ (免费、原生)  │         │ Pages (边缘、  │         │  自建服务器   │
           │               │         │  自定义域名、  │         │  (可选)       │
           │               │         │  WAF、Analytics)│         │               │
           └───────────────┘         └───────────────┘         └───────────────┘
```

**本项目采用双轨**：GitHub Pages 作主线，Cloudflare Pages 做加速 + WAF + 自定义域名 `blog.weiguang.eu.org`。

---

## 2. 仓库结构与 Submodule 管理

### 2.1 目录结构

```
blog/
├── .github/workflows/deploy.yml
├── _config.yml
├── _config.anzhiyu.yml          # 主配置（含占位符）
├── _config.anzhiyu.local.yml    # 本地密钥（.gitignore）
├── package.json
├── scaffolds/post.md
├── source/
│   ├── _posts/...
│   ├── _data/album.yml
│   └── css/custom.css
├── themes/
│   └── anzhiyu/                 # Git Submodule → anzhiyu-c/hexo-theme-anzhiyu@v1.7.1
└── scripts/                     # 自定义 Hexo 扩展（可选）
```

### 2.2 初始化 Submodule

```bash
cd blog
git submodule add -b v1.7.1 --depth=1 \
  https://github.com/anzhiyu-c/hexo-theme-anzhiyu.git themes/anzhiyu
git commit -m "chore: add anzhiyu theme submodule v1.7.1"
```

### 2.3 升级主题标准流程

```bash
# 1. 进入 submodule
cd themes/anzhiyu
git fetch --tags
git checkout v1.8.0   # 或最新 tag

# 2. 回根目录，提交指针更新
cd ../..
git add themes/anzhiyu
git commit -m "chore: upgrade anzhiyu to v1.8.0"

# 3. 对比 merge_config.js 新增默认值，同步到 _config.anzhiyu.yml
#    推荐用 `git diff themes/anzhiyu@<old>..@<new> -- scripts/events/merge_config.js`

# 4. 本地验证
hexo clean && hexo g && hexo s

# 5. 推送触发 CI
git push
```

> **黄金法则**：**从不直接修改 `themes/anzhiyu/` 下文件**，所有定制在博客仓库层（覆盖文件、脚本注入、配置合并）。

---

## 3. GitHub Actions 工作流（`.github/workflows/deploy.yml`）

```yaml
name: Deploy to GitHub Pages & Cloudflare Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      # 1️⃣ Checkout + Submodule
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          submodules: recursive
          fetch-depth: 0

      # 2️⃣ Setup Node + pnpm（corepack）
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Enable corepack
        run: corepack enable

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      # 3️⃣ 生成最终配置（Secrets 注入）
      - name: Generate final config
        id: gen-config
        run: |
          cat > _config.anzhiyu.yml <<'EOF'
          # 基础配置（从模板读取或直接内联）
          # 这里演示用 heredoc，实际建议用 node/脚本渲染模板
          LA:
            enable: true
            ck: "${{ secrets.LA_CK }}"
            LingQueMonitorID: "${{ secrets.LA_LINGQUE_ID }}"
          post_head_ai_description:
            enable: true
            gptName: Yoki
            mode: openai
            openai:
              apiUrl: "https://api.agnes-ai.cn/v1/chat/completions"
              model: agnes-2.0-flash
              apiKey: "${{ secrets.OPENAI_API_KEY }}"
              systemPrompt: "你是一个文章摘要助手，请使用简洁的中文概括以下文章的核心内容，不超过200字"
              maxTokens: 500
              temperature: 0.7
          # ... 其他非敏感配置直接从模板 cp
          EOF
          # 合并非敏感模板
          cat _config.anzhiyu.template.yml >> _config.anzhiyu.yml

      # 4️⃣ Build
      - name: Build Hexo
        run: pnpm run build   # = hexo clean && hexo generate

      # 5️⃣ Upload artifact
      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: ./public

  deploy-github:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4

  deploy-cloudflare:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'  # 仅主分支同步 CF
    steps:
      - name: Download artifact
        uses: actions/download-artifact@v4
        with:
          name: github-pages
          path: ./public

      - name: Deploy to Cloudflare Pages
        uses: cloudflare/pages-action@v1
        with:
          apiToken: ${{ secrets.CF_API_TOKEN }}
          accountId: ${{ secrets.CF_ACCOUNT_ID }}
          projectName: weiguang-blog
          directory: ./public
          gitHubToken: ${{ secrets.GITHUB_TOKEN }}
```

### 3.1 关键点解析

| 步骤 | 关键配置 | 说明 |
|------|----------|------|
| `actions/checkout@v4` | `submodules: recursive` | **必须**，否则 `themes/anzhiyu` 为空目录 |
| `corepack enable` | Node 20+ 自带 | 锁定 `pnpm` 版本，避免 `packageManager` 不匹配 |
| `Generate final config` | Secrets → `_config.anzhiyu.yml` | **敏感值绝不进仓库**，CI 时动态拼装 |
| `upload-pages-artifact` | `path: ./public` | 标准化产物，供 `deploy-pages` + CF 复用 |
| `cloudflare/pages-action` | `directory: ./public` | 同一产物双端部署，零二次构建 |

---

## 4. Secrets 管理策略

### 4.1 GitHub Repository Settings → Secrets and variables → Actions

| Secret 名 | 用途 | 来源 |
|-----------|------|------|
| `LA_CK` | 51.LA 站点 ID | 51.LA 后台 |
| `LA_LINGQUE_ID` | 雀灵监控 ID | 51.LA 雀灵 |
| `OPENAI_API_KEY` | AI 摘要 API Key | Agnes/OneAPI 控制台 |
| `CF_API_TOKEN` | Cloudflare Pages 部署权限 | CF Dashboard → API Tokens → Edit Cloudflare Pages |
| `CF_ACCOUNT_ID` | CF 账号 ID | CF Dashboard 右侧栏 |

### 4.2 本地开发同步（`_config.anzhiyu.local.yml`）

```yaml
# .gitignore 已忽略
LA:
  ck: "3QhmqTheuIeNJHd9"
  LingQueMonitorID: "3QhhHg4cYX5by8v8"
post_head_ai_description:
  openai:
    apiKey: "sk-xxx"
```

**本地脚本合并**（`scripts/merge-config.js`）：

```javascript
const fs = require('fs');
const yaml = require('js-yaml');

const base = yaml.load(fs.readFileSync('_config.anzhiyu.template.yml'));
const local = fs.existsSync('_config.anzhiyu.local.yml')
  ? yaml.load(fs.readFileSync('_config.anzhiyu.local.yml'))
  : {};

function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (source[key] instanceof Object && !Array.isArray(source[key])) {
      target[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

const final = deepMerge(base, local);
fs.writeFileSync('_config.anzhiyu.yml', yaml.dump(final));
console.log('✅ _config.anzhiyu.yml generated');
```

`package.json` 脚本：
```json
{
  "scripts": {
    "config": "node scripts/merge-config.js",
    "dev": "npm run config && hexo s",
    "build": "npm run config && hexo clean && hexo g"
  }
}
```

> 本地 `npm run dev` 自动合并；CI 用上述 heredoc 方式或同脚本跑一遍。

---

## 5. 自定义域名 + Cloudflare 加速

### 5.1 DNS 设置（Cloudflare 托管域名）

| 类型 | 名称 | 内容 | 代理状态 |
|------|------|------|----------|
| CNAME | @ | `weiguang-blog.pages.dev` | 🟠 Proxied |
| CNAME | www | `weiguang-blog.pages.dev` | 🟠 Proxied |

### 5.2 Cloudflare Pages 绑定

1. Pages 项目 → Custom domains → Add `blog.weiguang.eu.org` + `www.weiguang.eu.org`
2. SSL/TLS → Full (strict)
3. Rules → Cache Everything + Edge TTL 1 年（静态资源）
4. WAF → Managed Ruleset → OWASP Top 10 开启

### 5.3 GitHub Pages 同步（可选）

- Settings → Pages → Custom domain 填 `blog.weiguang.eu.org`
- Enforce HTTPS ✅
- **注意**：GitHub Pages 只能做源站，国内访问走 CF 边缘更快。

---

## 6. 常见坑与排错清单

| 现象 | 排查步骤 | 解决 |
|------|----------|------|
| `themes/anzhiyu` 为空 | CI 日志 `Checkout` 步骤是否有 `Submodules: 1` | 加 `submodules: recursive` |
| 部署后 404 / 样式丢失 | `public/` 目录结构、`_config.yml` `url/root` | `url: https://blog.weiguang.eu.org` `root: /` |
| AI 摘要不显示 / 报 401 | CI 日志 `Generate final config` 产物 `_config.anzhiyu.yml` 是否含 `apiKey` | Secrets 名拼写、权限、Key 有效期 |
| 51.LA 无数据 | Network 面板 `js-sdk-pro.min.js` 是否 200、`LA.init` 参数 | `hashMode: true` 配合 pjax、`autoTrack: true` |
| Cloudflare Pages 部署失败 | `CF_API_TOKEN` 权限、`CF_ACCOUNT_ID` 正确性 | Token 需 `Account.Cloudflare Pages.Edit` 权限 |
| pjax 后统计/摘要失效 | `pjax:complete` 回调里重新初始化 | `window.statistics51aInit?.()` / `AIAbstract.init?.()` |

---

## 7. 回滚与灰度发布

### 7.1 GitHub Pages 回滚

```bash
# 回退到上一次成功部署的 commit
git revert <bad-commit>
git push
# 或直接在 Actions 页面 Re-run 旧的成功 workflow
```

### 7.2 Cloudflare Pages 回滚

Dashboard → Deployments → 点击旧版本 → **Promote to production**（秒级生效）。

### 7.3 灰度（可选）

- Cloudflare Workers + `cookie` 分流 10% 流量到 `preview.weiguang.eu.org`
- 或 GitHub Pages `gh-pages` 分支 + `preview` 子域名

---

## 8. 维护清单（每月/每次升级）

| 频率 | 动作 | 命令/操作 |
|------|------|-----------|
| **每周** | 依赖更新 | `pnpm update -i` → `pnpm audit fix` |
| **每月** | 主题升级 | 见 §2.3 标准流程 |
| **每月** | 检查 51.LA / 雀灵 后台无报警 | 登录看板 |
| **每季度** | 旋转 API Keys（AI、51.LA） | 重新生成 → 更新 Secrets → 触发部署 |
| **每次发文** | 验证 AI 摘要生成、相册图片加载 | 本地 `hexo s` + 线上打开 |

---

## 9. 一键初始化新环境脚本（`scripts/bootstrap.sh`）

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "🚀 Bootstrapping Hexo anzhiyu blog..."

# 1. Corepack + pnpm
corepack enable
corepack prepare pnpm@9.12.0 --activate

# 2. Install deps
pnpm install --frozen-lockfile

# 3. Submodule
git submodule update --init --recursive --depth=1

# 4. Local config (copy template if missing)
[ -f _config.anzhiyu.local.yml ] || cp _config.anzhiyu.local.example.yml _config.anzhiyu.local.yml
echo "⚠️  Please edit _config.anzhiyu.local.yml with your secrets"

# 5. Generate final config
node scripts/merge-config.js

# 6. Verify build
pnpm run build

echo "✅ All set! Run 'pnpm run dev' to start local server."
```

新成员/新机器：`git clone --recursive ... && ./scripts/bootstrap.sh` 即可跑通。

---

## 10. 完整文件清单（本系列涉及）

```
blog/
├── .github/workflows/deploy.yml
├── _config.yml
├── _config.anzhiyu.yml
├── _config.anzhiyu.template.yml   # 非敏感基础配置
├── _config.anzhiyu.local.yml      # 本地敏感配置（.gitignore）
├── scripts/
│   ├── merge-config.js            # 本地合并
│   └── bootstrap.sh               # 一键初始化
├── scaffolds/post.md
├── source/
│   ├── _posts/...
│   ├── _data/album.yml
│   ├── link/index.md
│   ├── music/index.md
│   ├── pixiv/index.md
│   ├── copyright/index.md
│   ├── css/custom.css
│   └── js/custom.js
└── themes/anzhiyu/                # Submodule
```

---

## 11. 系列总结

| 篇 | 核心主题 | 关键产出 |
|----|----------|----------|
| ① | 环境版本、目录结构、升级策略 | `bootstrap.sh`、Submodule 流程 |
| ② | 51.LA 双 SDK + AI 摘要三模式 | `statistics51aInit()`、`AIAbstract` 类、24h 缓存 |
| ③ | 相册系统 Type 1/2/3 + Pixiv 实战 | `album.yml` 数据结构、三个 mixin、入口页 |
| ④ | 友链/版权/音乐/时钟/注入/欢迎语/无障碍/动效 | `linkPageTop`、`footerBar.cc`、`inject`、`greetingBox` |
| ⑤ | **部署流水线、Secrets、Submodule 升级、回滚** | `deploy.yml`、Secrets 表、回滚 SOP |

---

## 12. 后续进阶方向（TODO）

- [ ] **Waline 评论迁移**（邮件通知 + 表情包 + 反垃圾）
- [ ] **Algolia DocSearch** 全站中文分词搜索
- [ ] **图片自动 WebP + Cloudflare Images** 零成本图床
- [ ] **PWA + Service Worker** 离线阅读 + 更新提示
- [ ] **多语言 i18n**（中英日）切换
- [ ] **自动化发布脚本**：`npm run new:post "标题"` → 自动封面图、AI 摘要、推送到 GitHub

---

> **全系列源码同步更新在**：`https://github.com/yourname/blog`  
> 欢迎 Star、Fork、提 Issue 交流！

---

**至此，Hexo anzhiyu 深度定制六部曲完结撒花 🎉**  
愿你的博客既好看、又好用、还好维护！