---
title: Hexo anzhiyu 主题深度定制系列（五）：相册系统全解析 —— Type 1/2/3 三种布局 + Pixiv 专辑实战
date: '2026-07-30 13:00:00'
tags:
  - Hexo
  - anzhiyu
  - 相册
  - 画廊
categories:
  - 技术分享
ai: true
description: 深度拆解 anzhiyu 相册系统的数据结构、三种渲染模式（瀑布流/画廊/时间轴）、模板引擎实现、以及新增 Pixiv 专辑的完整步骤。
pubDate: '2026-07-30 13:00:00'
---

## 前言

anzhiyu 的相册功能不是简单的「图片列表」，而是一套 **数据驱动 + 多布局 + 详情页** 的完整体系。本文从 `album.yml` 数据源出发，追踪到 `album.pug` / `album_detail.pug` 模板，再到前端交互，最后演示如何新增一个 Pixiv 专辑。

---

## 1. 数据源：`source/_data/album.yml`

```yaml
# 相册列表页数据源，每一项 = 一个相册入口
- name: 风景           # 相册标题（列表卡片显示）
  description: 记录沿途风景      # 描述文案
  type: 1               # 布局类型：1=瀑布流网格，2=画廊轮播，3=时间轴
  photos:               # 图片数组（type=1 时直接渲染；type=2/3 支持分组）
    - url: https://img.xxx/1.jpg
      alt: 山顶日出
    - url: https://img.xxx/2.jpg
      alt: 湖面倒影

- name: 生活
  description: 日常碎片
  type: 2               # 画廊模式
  photos:
    - group: 2024春     # 分组名（画廊顶部 Tab 切换）
      photos:
        - url: https://img.xxx/3.jpg
          alt: 樱花
        - url: https://img.xxx/4.jpg
          alt: 踏青

- name: Pixiv
  description: 插画收藏
  type: 2
  photos:
    - group: 原神
      photos:
        - url: https://img.xxx/5.jpg
          alt: 刻晴
    - group: 赛马娘
      photos:
        - url: https://img.xxx/6.jpg
          alt: 特别周
```

### 1.1 字段完整对照表

| 字段 | 必填 | 类型 | 说明 |
|------|------|------|------|
| `name` | ✅ | string | 相册名，列表卡片标题 |
| `description` | | string | 列表卡片副标题 |
| `type` | ✅ | 1/2/3 | **1=瀑布流**、**2=画廊（分组轮播）**、**3=时间轴** |
| `photos` | ✅ | array | 图片数据，结构随 `type` 变化 |
| `cover` | | string | 列表卡片封面图（缺失则取 `photos[0].url`） |

### 1.2 `photos` 结构随 `type` 变化

| `type` | `photos` 结构 | 备注 |
|--------|---------------|------|
| **1** | `[{url, alt}]` | 扁平数组，直接渲染网格 |
| **2** | `[{group, photos:[{url,alt}]}]` | 分组，每组一个 Swiper 实例 |
| **3** | `[{date, photos:[{url,alt}]}]` | 按日期分组，时间轴样式 |

---

## 2. 列表页模板：`themes/anzhiyu/layout/includes/page/album.pug`

```pug
// album.pug 简化版
.album-page
each album in site.data.album
  .album-card(data-type=album.type)
    .album-cover
      img(src=album.cover || album.photos[0]?.photos[0]?.url || album.photos[0]?.url data-src=...)
      .album-mask
        i.fa-solid.fa-images
    .album-info
      h2= album.name
      p= album.description
      span.album-count= getAlbumCount(album)
    // 点击跳转详情页
    a.album-link(href=url_for('/album/' + album.name) target=_blank)
```

**关键点**：
- `data-type` 传给详情页，决定渲染哪套布局
- `getAlbumCount(album)` 统计总图片数（含分组内）
- 封面兜底逻辑：`cover` → `photos[0].photos[0].url` (type2) → `photos[0].url` (type1)

---

## 3. 详情页模板：`themes/anzhiyu/layout/includes/page/album_detail.pug`

### 3.1 入口判断

```pug
- const album = site.data.album.find(a => a.name === page.albumName)
- if (!album) { h1 相册不存在; return }

.album-detail
  h1.page-title= album.name
  p.page-description= album.description

  // 根据 type 分发
  if album.type === 1
    include ./album_type1.pug
  else if album.type === 2
    include ./album_type2.pug
  else if album.type === 3
    include ./album_type3.pug
```

### 3.2 Type 1：瀑布流网格 (`album_type1.pug`)

```pug
.waterfall#waterfall
  each photo in album.photos
    .waterfall-item
      a.fancybox(href=photo.url data-fancybox="album" data-caption=photo.alt)
        img.lazyload(data-src=photo.url alt=photo.alt)
        .waterfall-mask
          i.fa-solid.fa-expand
```

- **CSS Columns** 实现瀑布流：`column-count: 3; column-gap: 12px;`
- `fancybox` 绑定同一 `data-fancybox="album"`，点击可左右翻阅全相册
- 懒加载 `data-src` + `IntersectionObserver`

### 3.3 Type 2：画廊轮播 (`album_type2.pug`)

```pug
.gallery-album
  // 分组 Tab
  .gallery-tabs
    each group, idx in album.photos
      button.gallery-tab(class=idx===0?'active':'')= group.group

  // 每组一个 Swiper
  .gallery-swipers
    each group, idx in album.photos
      .gallery-swiper(class=idx===0?'active':'')
        .swiper-container
          .swiper-wrapper
            each photo in group.photos
              .swiper-slide
                a.fancybox(href=photo.url data-fancybox="gallery_"+group.group data-caption=photo.alt)
                  img.lazyload(data-src=photo.url alt=photo.alt)
          .swiper-pagination
          .swiper-button-prev
          .swiper-button-next
```

**前端初始化**（`main.js` 片段）：

```javascript
document.querySelectorAll('.gallery-swiper').forEach((el, i) => {
  new Swiper(el.querySelector('.swiper-container'), {
    loop: true,
    pagination: { el: el.querySelector('.swiper-pagination'), clickable: true },
    navigation: { nextEl: el.querySelector('.swiper-button-next'), prevEl: el.querySelector('.swiper-button-prev') },
    lazy: true
  });
});
```

- **Tab 切换** = 显示/隐藏对应 `.gallery-swiper`
- 每组独立 `data-fancybox="gallery_原神"`，组内可翻阅，组间隔离

### 3.4 Type 3：时间轴 (`album_type3.pug`)

```pug
.timeline-album
  each group in album.photos
    .timeline-item
      .timeline-date= group.date
      .timeline-photos
        each photo in group.photos
          a.fancybox(href=photo.url data-fancybox="timeline" data-caption=photo.alt)
            img.lazyload(data-src=photo.url alt=photo.alt)
```

- 适合「旅行日记」「成长记录」等按时间叙事的相册

---

## 4. 页面入口：`source/album/index.md`

```markdown
---
title: 相册
type: album          # 关键：使用 album 布局
date: 2026-04-15
comments: false
---
```

Hexo 会把 `site.data.album` 注入页面，`album.pug` 自动渲染列表。

---

## 5. 实战：新增 Pixiv 专辑

### 5.1 数据追加（`source/_data/album.yml`）

```yaml
- name: Pixiv
  description: 精选插画收藏
  type: 2
  cover: https://img.weiguang.eu.org/cover/pixiv.webp
  photos:
    - group: 原神
      photos:
        - url: https://img.weiguang.eu.org/pixiv/keqing.jpg
          alt: 刻晴·霓裾翩跹
        - url: https://img.weiguang.eu.org/pixiv/nahida.jpg
          alt: 纳西妲·花神诞祭
    - group: 赛马娘
      photos:
        - url: https://img.weiguang.eu.org/pixiv/special_week.jpg
          alt: 特别周
```

### 5.2 可选：独立详情页（`source/pixiv/index.md`）

```markdown
---
title: Pixiv 插画精选
type: album_detail    # 直接渲染详情页布局
album: Pixiv          # 对应 album.yml 的 name
date: 2026-07-30
comments: false
---
```

> **区别**：`type: album` = 列表页；`type: album_detail` + `album: 名称` = 直达某相册详情页。

### 5.3 导航菜单挂载（`_config.anzhiyu.yml`）

```yaml
menu:
  首页: /
  相册: /album/
  Pixiv: /pixiv/      # 新增
  友链: /link/
  关于: /about/
```

---

## 6. 图片托管与性能建议

| 方案 | 适用场景 | 成本 |
|------|----------|------|
| **自建图床** + Cloudflare R2 / Backblaze B2 + CDN | 全量控制、大流量 | 低（按量付费） |
| **GitHub + jsDelivr** | 小站、图片 < 50MB/仓库 | 免费 |
| **PicGo + 阿里云 OSS / 腾讯云 COS** | 国内访问快、备案域名 | 低 |
| **Cloudflare Images** | 自动 WebP/AVIF、变体、统计 | $5/10万张/月 |

**推荐工作流**：
```
本地选图 → PicGo 一键上传 → 返回 CDN URL → 粘贴 album.yml
```

**性能清单**：
- [ ] 所有图片 **WebP/AVIF** 输出（Cloudflare Images / imgproxy 自动转码）
- [ ] `loading=lazy` + `decoding=async`（模板已内置）
- [ ] 列表页封面 **低质量占位图 (LQIP)** → `blur-up` 动画
- [ ] 详情页 `fancybox` 预加载相邻 1 张
- [ ] 相册总大小 > 50MB 考虑 **分页/虚拟列表**

---

## 7. 扩展玩法

### 7.1 相册加密（私密相册）

```yaml
# album.yml
- name: 私密
  encrypted: true
  password_hash: "$2a$10$..."  # bcrypt hash
  photos: ...
```

前端 `album_detail.pug` 判断 `encrypted` → 弹窗输入密码 → `bcrypt.compare` → 通过后渲染。

### 7.2 EXIF 信息展示

```pug
// album_type1.pug
if photo.exif
  .photo-exif
    span= photo.exif.CameraModel
    span= photo.exif.FNumber + "  " + photo.exif.ExposureTime + "s  ISO" + photo.exif.ISOSpeedRatings
```

上传脚本用 `exifr` 读取写入 `album.yml`。

### 7.3 相册统计卡片

```pug
// album.pug 列表卡片底部
.album-stats
  span= album.photos.reduce((sum, g) => sum + (g.photos?.length || 1), 0) + " 张"
  span= album.photos.reduce((sum, g) => sum + (g.photos?.reduce((s,p)=>s+(p.size||0),0) || 0), 0) / 1024 / 1024 + " MB"
```

---

## 8. 常见坑 & 调试

| 现象 | 原因 | 解决 |
|------|------|------|
| 详情页 404 | `album.yml` 的 `name` 与页面 `album:` 不一致 | 严格对应，含大小写、空格 |
| 画廊 Tab 切换无反应 | Swiper 实例未销毁重建 / `display:none` 下初始化宽度为 0 | Tab 切换时 `swiper.update()` 或 `lazy: true` |
| 瀑布流高度塌陷 | `img` 无 `width/height` 导致 columns 计算错误 | 图片加上 `style="aspect-ratio: 4/3"` 或 CSS `aspect-ratio` |
| `fancybox` 不能翻阅全相册 | `data-fancybox` 值不一致 | 同一相册所有图片 `data-fancybox="album_相册名"` 统一 |

---

## 9. 小结

| 布局 | 适用场景 | 核心技术 |
|------|----------|----------|
| **Type 1 瀑布流** | 风景、壁纸、大量同权重图片 | CSS Columns + Fancybox |
| **Type 2 画廊** | 分类明确、需分组轮播（如 Pixiv、cosplay） | Swiper + Tab + Fancybox 分组 |
| **Type 3 时间轴** | 旅行、成长记录、按时间叙事 | 垂直时间轴 + Fancybox |

**数据驱动** = 只改 `album.yml`，零代码新增相册；  
**模板分发** = `album_detail.pug` 统一入口，`include` 子模板，维护成本极低。

---

## 10. 下一篇预告

**《友链页顶部区块 + 底部版权栏 + 音乐页/时钟/代码注入等杂项配置》**

敬请期待！