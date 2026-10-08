# Migration TODO — Hexo → Astro

## Phase 1: 内容迁移
- [ ] Task 1: scripts/migrate-posts.mjs 迁移 29 篇文章到 src/content/blog/（frontmatter 映射）
- [ ] Task 2: 独立页面迁移（静态内容型 → pages；数据驱动型 → public/data + 渲染静态页，保留入口）
- [ ] Task 3: 静态资源拷贝（source/img → public/img、favicon/manifest/robots/atom/sitemap）

### Checkpoint 1
- [ ] astro check + build 通过；src/content/blog 恰 29 篇

## Phase 2: 路由与页面
- [ ] Task 4: 文章详情 [year]/[month]/[day]/[...slug].astro，29 条 URL 与线上逐条核对
- [ ] Task 5: 首页 + 归档（年月时间线）
- [ ] Task 6: 分类/标签索引 + 详情页
- [ ] Task 7: Layout 基座（Header/Footer/BaseHead/global.css 简洁风 + 中文排版 + 深色）

### Checkpoint 2
- [ ] 5 类页面 200；抽查 10 条 URL 与线上一致

## Phase 3: 搜索 / RSS / 404
- [ ] Task 8: 本地搜索（构建期 JSON 索引 + search 页 + 前端过滤）
- [ ] Task 9: RSS / sitemap / 404 / robots / atom 对齐

### Checkpoint 3
- [ ] 搜索可用；RSS 生成；build 无告警

## Phase 4: 部署 Workers
- [ ] Task 10: wrangler.toml（assets=dist）+ deploy 脚本
- [ ] Task 11: 部署到新域名（非 blog.weiguang.eu.org），旧 hexo 站不动

### Checkpoint 4
- [ ] 线上全部页面 200；URL 与 hexo 一致；旧站可回切

## Backlog（第二阶段）
- [ ] Twikoo/Waline 评论
- [ ] 友链页 + friend-probe
- [ ] 音乐播放器
- [ ] bangumi 追番 + 定时 CI
- [ ] 相册/随笔/fcircle 数据驱动页
- [ ] 51.la 统计