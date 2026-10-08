---
title: Hexo anzhiyu 主题配置与定制全记录
date: '2026-07-30 13:30:00'
categories:
  - 技术笔记
tags:
  - Hexo
  - anzhiyu
  - 博客搭建
description: 记录 Hexo anzhiyu 主题从零开始的配置、定制与踩坑全过程，包含 51.LA 统计、AI 摘要、相册、友链页等实战配置
pubDate: '2026-07-30 13:30:00'
---

## 前言

本站基于 **Hexo + anzhiyu 主题 (v1.7.1)** 搭建，托管于 GitHub Pages + Cloudflare Pages，国内通过 `weiguang.eu.org` 访问。

这篇文章梳理了从安装主题到上线过程中所有关键配置、代码修改与避坑指南，供后续维护或同好参考。

---

## 1. 环境与版本

| 组件 | 版本 |
|------|------|
| Hexo | 7.3.x |
| anzhiyu 主题 | 1.7.1 |
| Node.js | 20.x |
| 部署 | GitHub Actions → GitHub Pages + Cloudflare Pages |

> **主题更新策略**：`themes/anzhiyu` 为 `git submodule` 指向 `anzhiyu-c/hexo-theme-anzhiyu`，通过 `git submodule update --remote` 同步上游，自定义改动全部在博客仓库层面（`_config.anzhiyu.yml`、覆盖文件、Patch），避免升级冲突。

---

## 2. 核心配置文件结构

```
blog/
├── _config.yml                 # Hexo 主配置
├── _config.anzhiyu.yml         # 主题配置（主改动入口）
├── source/
│   ├── _data/
│   │   └── album.yml           # 相册数据
│   ├── link/index.md           # 友链页
│   ├── music/index.md          # 音乐页
│   ├── pixiv/index.md          # Pixiv 相册页
│   ├── copyright/index.md      # 版权协议页
│   └── _posts/...              # 文章
├── scaffolds/post.md           # 文章脚手架（含 ai: true）
└── themes/anzhiyu/             # 主题源码（submodule）
```

---

## 3. 关键功能配置详解

### 3.1 51.LA 统计（双 SDK：流量 + 性能监控）

**配置位置**：`_config.anzhiyu.yml → LA`

```yaml
LA:
  enable: true
  ck:                    # 站点 ID
  LingQueMonitorID:      # 雀灵性能监控 ID
```

**实现方式**：`themes/anzhiyu/source/js/anzhiyu/main.js` 中的 `statistics51aInit()` **动态注入**：

```js
loadScript("https://sdk.51.la/js-sdk-pro.min.js", "UTF-8", false, "LA_COLLECT")
  .then(() => {
    LA.init({ id: LA51.ck, ck: LA51.ck, autoTrack: true, hashMode: true });
  });
```

- `autoTrack: true` — 自动采集 PV/UV/停留时长等
- `hashMode: true` — 兼容 SPA（pjax）路由变化自动上报
- 雀灵监控同步初始化：`new LingQue.Monitor().init({id: LingQueMonitorID, sendSuspicious: true})`

**备选方案**：`inject.head` 静态注入（已注释在配置中），切换时需同步注释 `main.js` 调用。

---

### 3.2 文章顶部 AI 摘要（三模式切换）

**配置位置**：`_config.anzhiyu.yml → post_head_ai_description`

```yaml
post_head_ai_description:
  enable: true
  gptName: Yoki                    # 显示标签名
  mode: openai                     # tianli / local / openai
  switchBtn: false                 # 是否显示切换按钮
  btnLink: https://ifdian.net/a/yokipeek
  randomNum: 3
  basicWordCount: 1000
  key: xxxx                        # tianli 模式用
  Referer: https://xx.xx/          # tianli 模式用
  openai:
    apiUrl: https://api.agnes-ai.cn/v1/chat/completions
    model: agnes-2.0-flash
    apiKey: sk-xxx                 # ⚠️ 勿提交仓库
    systemPrompt: 你是一个文章摘要助手，请使用简洁的中文概括以下文章的核心内容，不超过200字
    maxTokens: 500
    temperature: 0.7
```

**核心逻辑**（`themes/anzhiyu/source/js/anzhiyu/ai_abstract.js`）：

| 模式 | 摘要来源 |
|------|----------|
| `local` | 文章 Front-matter `ai:` 字段 |
| `tianli` | 调用 TianliGPT API 生成 |
| `openai` | 调用 OpenAI 兼容 API 生成（含 24h localStorage 缓存，刷新图标可清除） |

**自动开启**：`scaffolds/post.md` 已预置 `ai: true`，新文章默认生成摘要。

---

### 3.3 相册系统（三类布局）

**数据源**：`source/_data/album.yml`

```yaml
- name: 风景
  description: 记录沿途风景
  type: 1                    # 类型 1：网格瀑布流
  photos:
    - url: https://img.xxx/1.jpg
      alt: 山顶日出
- name: 生活
  description: 日常碎片
  type: 2                    # 类型 2：画廊轮播（支持分组）
  photos:
    - group: 2024春
      photos:
        - url: https://img.xxx/2.jpg
          alt: 樱花
- name: Pixiv
  description: 插画收藏
  type: 2
  photos:
    - group: 原神
      photos:
        - url: https://img.xxx/3.jpg
          alt: 刻晴
```

**页面模板**：
- `themes/anzhiyu/layout/includes/page/album.pug` — 相册列表页
- `themes/anzhiyu/layout/includes/page/album_detail.pug` — 详情页（按 `type` 渲染不同布局）

**新增 Pixiv 相册**：
1. `source/pixiv/index.md` → `type: album_detail`
2. `album.yml` 追加对应 `name: Pixiv, type: 2` 条目

---

### 3.4 友链页顶部区块（`linkPageTop`）

```yaml
linkPageTop:
  enable: true
  title: 与数百名博主无限进步
  addFriendPlaceholder: |
    昵称（请勿包含博客等字样）：
    网站地址（要求博客地址，请勿提交个人主页）：
    头像图片url（请提供尽可能清晰的图片，我会上传到我自己的图床）：
    描述：
    站点截图（可选）：
```

页面 `source/link/index.md` 需指定 `type: link`，启用后顶部展示欢迎文案 + 评论区供访客提交申请。

---

### 3.5 底部栏版权协议（`footerBar.cc`）

```yaml
footerBar:
  enable: true
  authorLink: /
  cc:
    enable: true
    link: /copyright
```

**配套页面**：`source/copyright/index.md`（CC BY-NC-SA 4.0 协议文本）

---

### 3.6 音乐页关闭评论

```yaml
# source/music/index.md
comments: false
```

---

### 3.7 导航栏时钟/天气关闭

```yaml
# _config.anzhiyu.yml → menu.nav
clock: false
```

原 `clock.pug` 已恢复主题默认，不再加载天气插件。

---

### 3.8 代码注入（`inject`）

```yaml
inject:
  head:
    # 静态注入 51.LA（备用，启用时需注释 main.js 的 statistics51aInit()）
    # - <script charset="UTF-8" id="LA_COLLECT" src="https://sdk.51.la/js-sdk-pro.min.js"></script>
    # - <script>LA.init({id:"3Qhmqxxxxxxx",ck:"3Qhmqxxxxxxx",autoTrack:true,hashMode:true})</script>
    # 自定义 CSS
    # - <link rel="stylesheet" href="/css/custom.css" media="defer" onload="this.media='all'">
  bottom:
    # 自定义 JS
    # - <script src="/js/xxx"></script>
```

---

## 4. 常用自定义文件（覆盖主题源码）

| 文件 | 用途 |
|------|------|
| `source/css/custom.css` | 全局样式微调 |
| `source/js/custom.js` | 全局脚本扩展 |
| `themes/anzhiyu/layout/includes/head/config.pug` | 注入 `GLOBAL_CONFIG` 变量（含 `linkPageTop` 等） |
| `themes/anzhiyu/scripts/events/merge_config.js` | 配置合并默认值（含 `openai` 默认块） |

> **原则**：能在 `_config.anzhiyu.yml` 解决的绝不改源码；必须改源码时，优先在博客仓库用 `hexo.extend.filter` 覆盖，或记录 Patch 方便升级合并。

---

## 5. 部署与 CI/CD

`.github/workflows/deploy.yml` 关键步骤：

```yaml
- name: Checkout submodule
  run: git submodule update --init --recursive

- name: Install deps
  run: npm ci

- name: Build
  run: npx hexo generate

- name: Deploy to GitHub Pages
  uses: peaceiris/actions-gh-pages@v3
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
    publish_dir: ./public
```

Cloudflare Pages 另接同一仓库 `public` 目录，自定义域名 `weiguang.eu.org`，开启 **Always Use HTTPS** + **Brotli** 压缩。

---

## 6. 避坑指南 & 维护清单

### ⚠️ 敏感信息管理
- **API Key / 统计 ID 绝不直接写进仓库**  
  → 用 GitHub Actions Secrets 注入 `_config.anzhiyu.yml`，或本地维护 `_config.anzhiyu.local.yml`（`.gitignore` 排除），CI 合并生成最终配置。

### 🔄 主题升级流程
```bash
cd themes/anzhiyu
git fetch origin
git checkout v1.8.x   # 或最新 tag
cd ../..
git add themes/anzhiyu
git commit -m "chore: upgrade anzhiyu to v1.8.x"
```
升级后跑一次 `hexo clean && hexo g`，检查自定义覆盖是否生效。

### 📝 新文章 Checklist
- [ ] `hexo new post "标题"` 自动带 `ai: true`
- [ ] 封面图放 `source/images/cover/xxx.jpg`，Front-matter `cover: /images/cover/xxx.jpg`
- [ ] 相册图片走图床（`img.weiguang.eu.org`），`album.yml` 只存 URL

### 🧹 定期清理
- `hexo clean` + `public/` 重新生成
- 检查 `npm audit` 依赖漏洞
- 51.LA / 雀灵 后台核对 PV 无异常

---

## 7. 后续想折腾的（TODO）

- [ ] 评论区迁移 Twikoo → Waline（支持邮件通知 + 表情包）
- [ ] 文章阅读进度条 + 目录自动折叠
- [ ] 搜索接入 Algolia DocSearch（全站中文分词）
- [ ] 图片懒加载 WebP 自动转换（Cloudflare Images / PicGo 插件）
- [ ] PWA 离线缓存 + Service Worker 更新提示

---

## 8. 参考链接

- [anzhiyu 官方文档](https://anzhiyu-c.github.io/)
- [51.LA JS SDK 文档](https://www.51.la/docs/js-sdk/)
- [TianliGPT API](https://tianli.gpt.api/)
- [Creative Commons 协议选择器](https://creativecommons.org/choose/)

---

> 记录配置过程本身就是一种文档化思维 —— **下次重装/迁移/升级时，感谢过去的自己留下了这份清单。**