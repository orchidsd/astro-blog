# 迁移计划：Hexo (anzhiyu) → Astro（D:\astro\blog）

## Overview

将 hexo_blog（Hexo 8 + anzhiyu 1.7.1，29 篇 Markdown、GitHub+CF 双线部署）迁移到 `D:\astro\blog`（Astro 官方 blog starter）。经确认的决策：**从官方 starter 重来**（弃用 `D:\astro\Yoki-Astro-Cloudflare-Migration-v1.zip`）、**简洁自研风**（不复刻 anzhiyu 视觉）、**保留本地搜索**、**Workers 静态资产部署**、**保留原 URL `/yyyy/mm/dd/<slug>/` 结构**、**数据驱动页面保留入口渲染**（不隐藏）、**部署域名不用 `blog.weiguang.eu.org`（新域名待定）**、**旧 hexo 站（本博客）不动**。

## 现状盘点（已核实）

- 文章：`source/_posts` 共 **29 篇 md**，其中 4 个系列子目录（hexo-anzhiyu-series 11 / friend-circle-series 7 / music-player-series 4 / waline-series 3）+ 4 篇单文件。
- 文章质量：**纯 Markdown，无 anzhiyu 特供短码**（grep folding-tag/telescopic/`{%` 均为正文文字提及）、**无站内图片引用**、无站内绝对链接。
- frontmatter：`title/date/tags/categories/description/ai/top_img/cover/type`。需映射 `date→pubDate`，补充类别字段。
- URL 规则（已从产物确认）：`/2026/08/09/hexo-anzhiyu-series/00-series-index/` —— 即 `:year/:month/:day/` + 「相对 _posts 去掉 .md」路径。**系列文章 slug 带子目录段**。
- 独立页面：about/album/categories/cookies/copyright/dailyPhoto/essay/fcircle/link/music/pixiv/privacy/tags/wordScenery 共 14 个 `index.md`。
- 数据层：`_data/` 下 about/album/essay/link/creativity.yml、bangumis/cinemas.json。
- 站点元信息：title `Yokiの小站`、url `https://blog.weiguang.eu.org`、lang `zh-CN`。
- Astro starter 现状：Astro 7.3.7 + @astrojs/mdx + rss + sitemap，content 注册只有 `blog` 集合（title/description/pubDate/heroImage）。

## Architecture Decisions

- **内容集合**：`src/content/blog/**/*.md`，slug 由文件路径直接决定（保留子目录段），frontmatter 用 zod schema 保留 title/description/pubDate/updatedDate/categories/tags（可选数组）。
- **URL 路由**：`src/pages/[year]/[month]/[day]/[...slug].astro` —— rest 参数兼容系列子目录 slug，与线上 `/:year/:month/:day/...` 一致。
- **本地搜索**：构建期生成 `src/pages/search.json.ts`（或 /json 静态索引），前端用轻量 JS 过滤 title/description/tags。不引入 Pagefind（保持简洁、零额外依赖合并到构建管线）。
- **归属不迁移**：评论双系统（Twikoo/Waline）、友链探针 friend-probe、音乐播放器卡片播放、bangumi 定时更新、51.la 统计 —— 属于第二阶段/按需再接入，第一版不迁移（与「仅保留本地搜索」决策一致）。
- **数据驱动页面（不藏入口）**：album/link/essay/music/fcircle/pixiv/dailyPhoto/wordScenery 均从 `public/data/*.yml|json`（原样拷贝）读取并**渲染为静态页面**，入口保留在导航/首页；数据变更需重新构建部署。
- **部署**：wrangler static assets，`@cloudflare/workers-static-assets`（或用 wrangler.toml `assets` 指向 dist）。**目标域名非 `blog.weiguang.eu.org`，新域名待定，不占用/不改动旧 hexo 站。**
- **静态资源**：原 `source/img`（siteicon、simpleicons、头像等）整体拷入 `public/`，favicon/manifest/robots 一并迁移。

## Task List

### Phase 1: 内容迁移（脚本化，一次成型）
- [ ] Task 1: 写迁移脚本 `scripts/migrate-posts.mjs`，读 hexo `source/_posts/**/*.md`，把 frontmatter 映射（title/description 保留，date→pubDate，categories/tags/ai 保留），文件写入 `src/content/blog/<相对路径>.md`，slug 代码与路径解耦（路由按 yr/mon/day + path 段取 slug）。
- [ ] Task 2: 迁移独立页面中**静态内容型**（about/privacy/copyright/cookies/categories/tags）为 `src/content/pages/` 或独立路由；**数据驱动型**（album/essay/link/music/fcircle/pixiv/dailyPhoto/wordScenery）拷贝 `_data/*` 到 `public/data/` 并**渲染为静态页、保留入口**。
- [ ] Task 3: 拷贝静态资源 `source/img`→`public/img`、favicon/manifest/robots/sitemap/atom 等。

### Checkpoint: 内容就位
- [ ] `npx astro check` 通过；`astro build` 成功；`src/content/blog` 恰 29 篇文章。

### Phase 2: 路由与页面
- [ ] Task 4: `[year]/[month]/[day]/[...slug].astro` 文章详情页（渲染 md，含标题/日期/分类/标签/上一篇下一篇），验证所有 29 篇 URL 与线上逐条一致。
- [ ] Task 5: `index.astro` 首页（帖子列表/摘要）、`archives.astro`（按年/月分组时间线）。
- [ ] Task 6: `categories/`、`tags/` 索引 + `[category]/[tag]` 详情页。
- [ ] Task 7: Layout 基座（Header/Footer/BaseHead/global.css 简洁风，浅色深色切换 + 中文排版）。

### Checkpoint: 核心链路
- [ ] 首页/归档/分类/标签/文章页五类页面 200；URL 抽样 10 条与线上一致。

### Phase 3: 搜索 + RSS + 404
- [ ] Task 8: 本地搜索：构建期生成搜索索引 JSON + `search` 页面，纯前端过滤。
- [ ] Task 9: RSS（@astrojs/rss）/ sitemap 已验证；新增 `404.astro`；robots/atom 对齐。

### Checkpoint: 功能闭环
- [ ] 搜索可搜到标题/标签；RSS 生成；404 正常；`astro build` 无告警。

### Phase 4: 部署（Workers Static Assets）
- [ ] Task 10: wrangler 配置（`wrangler.toml` assets=dist + 现有 `.wrangler` 习惯），`npm run build && wrangler deploy`，本地 preview 验证。
- [ ] Task 11: 部署到**新域名（非 blog.weiguang.eu.org）**；旧 hexo 站保持不动、可随时回切验证对照。

### Checkpoint: 上线
- [ ] 线上新站点全部页面 200；抽样 URL 与 hexo 线上一致（无 404）；旧 hexo 站点保持可切换。

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| 系列文章 slug 带子目录路径 | 中 | 路由用 `[...slug]` rest 捕获多段 |
| frontmatter 含 `type/about` 等非 blog 字段 | 低 | zod schema 全 optional，构建时忽略未知键 |
| 正文有 anzhiyu 语法痕迹（折叠/tabs） | 低 | 已 grep：均为正文文字描述，非真实短码；迁移时再全量确认 |
| 原 URL 含 `atom.xml` 等副产物 | 低 | 新站生成 `/atom.xml` 兼容订阅链接 |
| 图片引用若存在 /img 相对路径会错 | 中 | 迁移后全量 grep 产物确认无 `src="/img` 错误；资产放 public/ 保路径一致 |
| 评论/友链等被放弃功能的外链依赖 | 高 | 明确第一版不含，计划中标注为第二阶段 backlog，避免扩容蔓延 |

## Open Questions（已决策）
- ~~数据驱动型页面第一版是否保留为静态占位页或直接隐藏入口？~~ → **保留入口、渲染为静态页**
- ~~部署目标域名确认用 blog.weiguang.eu.org？~~ → **不用，新域名待定**
- ~~旧 hexo 站下线时间/保留切换备份？~~ → **旧站不动**