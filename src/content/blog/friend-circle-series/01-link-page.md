---
title: 友链页搭建与 link.yml 深度解析
date: '2026-07-31 08:10:00'
tags:
  - Hexo
  - anzhiyu
  - 友链
  - 系列教程
categories:
  - 技术分享
ai: true
description: 从 link.yml 数据结构到 flink.pug 模板修复，详解 anzhiyu 主题友链页的多分组、失联组（lost_contact）机制，以及与官方友链页的差异对比。
pubDate: '2026-07-31 08:10:00'
---

## 一、友链页在 anzhiyu 主题里是怎么工作的

友链页的入口是 `source/link/index.md`：

```yaml
---
title: 友链
date: 2026-07-01 08:00:00
type: link
comments: true
---
```

- `type: link` 告诉主题渲染 `flink.pug` 模板
- 数据来自 `source/_data/link.yml`（Hexo 的 `site.data.link` 变量）
- 模板：`themes/anzhiyu/layout/includes/page/flink.pug`

## 二、link.yml 数据结构

`link.yml` 是一个**分组列表**，每个分组是一个 map：

```yaml
- class_name: 友谊长存
  class_desc: 那些人，那些事
  flink_style: anzhiyu
  hundredSuffix: ''
  link_list:
    - name: 清羽飞扬
      link: https://blog.liushen.fun/
      avatar: https://blog.liushen.fun/info/avatar.ico
      descr: 柳影曳曳，清酒孤灯

- class_name: 失联友链
  class_desc: 已失联的友链
  lost_contact: true
  flink_style: anzhiyu
  hundredSuffix: ''
  link_list: []
```

### 分组字段说明

| 字段 | 作用 |
|------|------|
| `class_name` | 分组标题，页面显示 `class_name(数量)` |
| `class_desc` | 分组描述，显示在标题下方 |
| `flink_style` | 卡片样式：`anzhiyu` / `telescopic` / `flexcard` |
| `lost_contact: true` | **失联组标记**，整组卡片加失联样式 |
| `hundredSuffix` | 头像 URL 后缀（通常留空） |
| `link_list` | 友链数组：`name` / `link` / `avatar` / `descr` |

### 条目的可选字段

```yaml
- name: 博主
  link: https://example.com/
  avatar: https://example.com/avatar.png
  descr: 简介
  color: '#f2b94b'   # 标签背景色
  tag: 荐           # 标签文字
  recommend: true    # 显示"荐"标签
```

### 多个分组怎么排

官方（anheyu）的友链页就是典型的多分组结构：

```yaml
- class_name: 推荐博客      # 有 recommend: true 的优质友链
- class_name: 小伙伴        # 主力分组，数量最多
- class_name: 友谊长存       # 老友/深度友链
- class_name: 失联友链       # lost_contact: true
```

> 💡 **分组的顺序就是页面的显示顺序**。想调整展示顺序直接移动顶层列表项即可。

## 三、失联组机制（和官方一致）

官方友链页的「失联友链💔」分组，用的就是 `lost_contact: true`：

```yaml
- class_name: 失联友链💔
  class_desc: 近期无法访问
  lost_contact: true
  flink_style: anzhiyu
  link_list:
    - name: MoyuqL
      link: https://blog.moyuql.top
```

在 `flink.pug` 中，失联组会渲染特殊 class：

```pug
div(class=i.lost_contact ? 'anzhiyu-flink-list cf-friends-lost-contact' : 'anzhiyu-flink-list')
```

`cf-friends-lost-contact` 可以配合 CSS 做灰度/降透明度处理。

> 🔑 本系列的核心自动化就是：**检测脚本每天读写这个失联组**（详见第 ④ 篇）。

## 四、flink.pug 的三个关键修复（让后端能抓到友链）

anzhiyu 主题的 `flink.pug` 默认渲染的友链卡片**缺少后端爬虫需要的属性**，导致 hexo-circle-of-friends 后端抓取不到完整友链。修复如下：

### 修复 1：给卡片补上 `cf-*` 属性

后端（`hexo-circle-of-friends`）通过 `.cf-friends-link`、`.cf-friends-avatar`、`.cf-friends-name` 这几个 class 定位友链卡片。失联组里的卡片也要补全：

```pug
if i.lost_contact
  a.cf-friends-link(href=url_for(item.link) cf-href=url_for(item.link) title=item.name target="_blank")
    img.cf-friends-avatar.no-lightbox(data-lazy-src=url_for(item.avatar) cf-src=url_for(item.avatar) ...)
    .flink-item-info
      .flink-item-name.cf-friends-name.cf-friends-name-lost-contact= item.name
else
  a.cf-friends-link(href=url_for(item.link) cf-href=url_for(item.link) title=item.name target="_blank")
    img.cf-friends-avatar.no-lightbox(data-lazy-src=url_for(item.avatar) cf-src=url_for(item.avatar) ...)
    .flink-item-info
      .flink-item-name.cf-friends-name= item.name
```

**没有这些属性的后果**：后端 `run 17` 日志报 `url: https://xxx/ 抓取缺少关键字段 title` —— 页面结构缺字段导致 RSS 解析失败、友链进不了后端数据库。

### 修复 2：开启 lazy-load 时头像也能被抓

开启主题懒加载后，头像图是 `data-lazy-src`（不渲染成 `src`），后端读不到。补一份 `cf-src` 属性并保留 `src` 兜底：

```pug
img.cf-friends-avatar.no-lightbox(
  data-lazy-src=url_for(item.avatar)
  cf-src=url_for(item.avatar)
  onerror=`this.onerror=null;this.src='` + url_for(theme.error_img.flink) + `'`
  alt=item.name)
```

### 修复 3：空分组不渲染

避免空分组（比如失联组暂时没人）显示一个空标题：

```pug
each i in site.data.link
  if i.class_name && i.link_list && i.link_list.length > 0
    h2!= i.class_name + "(" + i.link_list.length + ")"
  if i.class_name && i.link_list && i.link_list.length > 0 && i.class_desc
    .flink-desc!=i.class_desc
```

> 三个修复都在 `flink.pug` 的覆盖层完成，升级主题后用 `git apply` 重新打补丁即可（Patch 归档方法见 hexo-anzhiyu 系列 ④）。

## 五、三种卡片样式

### anzhiyu（默认，推荐）

```yaml
- class_name: 友谊长存
  flink_style: anzhiyu
```

经典布局：头像 + 名字 + 描述，适合多数情况。

### telescopic（站点截图卡片）

```yaml
- class_name: 精选
  flink_style: telescopic
```

需要 `siteshot` 字段（截图 URL），或走 thum.io 自动截图。

### flexcard（封面大卡片）

```yaml
- class_name: 推荐
  flink_style: flexcard
```

大封面 + 信息卡片，适合少量精选友链。

## 六、和官方友链页的差异

| 对比项 | 官方 hexo.anheyu.com/link/ | 本博客 |
|---|---|---|
| 分组 | 推荐博客 / 小伙伴 / 友谊长存 / 失联友链 | 友谊长存 + 失联友链 |
| 失联组 | `lost_contact: true` | 同机制（自动维护） |
| 友链申请格式说明 | 页面下方有 Markdown/JSON/pug/HTML 模板 | 未加 |
| 免责声明 | 有 | 未加 |
| 出现问题的友链 | 手动 YAML 列表（带注释） | 用自动失联组替代 |

**结论**：核心机制（多分组 + 失联组）完全一样，官方只是额外挂了 3 个内容模块。想要这些模块，直接在 `source/link/index.md` 的正文里写 markdown 即可（`flink.pug` 末尾的 `!= page.content` 会渲染页面正文）。

## 七、常用操作速查

```bash
# 新增友链：在正常组的 link_list 里加一条
# 手动失联：把条目移到 lost_contact: true 的分组
# 调整顺序：移动顶层分组项 / 组内条目
# 推荐分组：条目加 recommend: true，分组用 telescopic/flexcard
```

> 本系列推荐**不要手动维护失联组**——交给第 ④ 篇的自动检测，每 3 小时后端判定、每日自动归类。
