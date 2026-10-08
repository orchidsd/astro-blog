---
title: 朋友圈（FriendCircle）页面搭建
date: '2026-07-31 08:20:00'
tags:
  - Hexo
  - anzhiyu
  - FriendCircle
  - 系列教程
categories:
  - 技术分享
ai: true
description: 在 anzhiyu 主题上接入 hexo-circle-of-friends 朋友圈：bundle 引入、fcircle.pug 配置、FC_API_URL 注入、随机文章、以及管理面板入口的隐藏。
pubDate: '2026-07-31 08:20:00'
---

> **⚠️ 已清理（2026-08-05）**：本文所述本地 bundle `source/js/friends/index.js` 已删除。当前朋友圈前端为 lite 自写版 `friend-circle-default.custom.js`（内置失联统计），主题 `friends_vue.vue_js` 仍指向 CDN 版本。本文部分内容仅供历史参考。

## 一、朋友圈是什么

「朋友圈」（FriendCircle）是一个友链文章聚合页：把你所有友链的博客最新文章抓下来，像朋友圈一样按时间流展示。本项目采用 [hexo-circle-of-friends](https://github.com/hexo-circle-of-friends) 生态：

- **前端 bundle**：`@1.1.2`（Vue 单文件组件编译产物，挂在 `.fcircle_page` 下）
- **后端**：Rust 服务（本系列第 ③ 篇部署）
- **页面**：`fcircle.pug` 模板

## 二、配置文件（_config.anzhiyu.yml）

朋友圈相关的配置在 `_config.anzhiyu.yml`：

```yaml
friends_vue:
  enable: true
  vue_js: /js/friends/index.js        # 前端 bundle 路径
  apiurl: https://fc.weiguang.eu.org/ # 后端 API 地址（注意结尾斜杠）
  top_background: https://...          # 顶部横幅背景图
  top_tips: 欢迎来到朋友圈
```

> ⚠️ `apiurl` 必须以 `/` 结尾，前端会拼 `/all`、`/friend`、`/randompost` 等端点。

## 三、fcircle.pug 模板

页面模板：`themes/anzhiyu/layout/includes/page/fcircle.pug`

```pug
if theme.friends_vue.enable
  .fcircle_page
    .author-content.author-content-item.fcirclePage.single(style = `background: url(${theme.friends_vue.top_background}) left 28% / cover no-repeat !important;`)
      .card-content
        .author-content-item-tips=_p('flink.friend_links')
        span.author-content-item-title=_p('flink.latest_articles')
        .content-bottom
          .tips=theme.friends_vue.top_tips
        .banner-button-group
          a.banner-button(onclick='pjax.loadUrl("/about")')
            i.anzhiyufont.anzhiyu-icon-arrow-circle-right(style='font-size: 22px; margin-right: 0.25rem')
            span.banner-button-text=_p('flink.about_me')
    .title-h2-a
      .title-h2-a-left
        h2(style='padding-top:0;margin:.6rem 0 .6rem')=_p('flink.fishing')
        a.random-post-start(href='javascript:fetchRandomPost();')
          i.anzhiyufont.anzhiyu-icon-arrow-rotate-right
      .title-h2-a-right
        a.random-post-all(href='/link/')=_p('flink.all_links')
    #random-post
    #hexo-circle-of-friends-root

  if (theme.friends_vue.apiurl)
    script(defer data-pjax src=url_for(theme.asset.random_friends_post_js))
  script(defer data-pjax src=url_for(theme.friends_vue.vue_js))
  if theme.friends_vue.apiurl
    script(defer data-pjax).
      window.FC_API_URL = '!{theme.friends_vue.apiurl}';
    script(defer data-pjax src=url_for('js/friends/lost-contact-stat.js'))
```

### 关键点

1. **`#hexo-circle-of-friends-root`** 是 bundle 的挂载点
2. **`window.FC_API_URL`** 全局变量，bundle 和失联统计脚本都读它来拼 API 地址
3. **`data-pjax`**：保证 pjax 跳转后脚本重新执行
4. **`lost-contact-stat.js`** 是本系列的失联统计脚本（第 ⑤ 篇）

## 四、页面入口

`source/fcircle/index.md`：

```yaml
---
title: 朋友圈
date: 2026-07-01 08:00:00
type: fcircle
comments: true
---
```

## 五、随机文章功能

顶部"钓鱼"按钮调 `fetchRandomPost()`，依赖 `theme.asset.random_friends_post_js`（`random-friends-post.js`）。它读 `window.FC_API_URL + 'randompost'`，实现随机跳转到某个友链的文章。

需要主题配置该资源路径（在 `_config.anzhiyu.yml` 的 `asset` 段）：

```yaml
asset:
  random_friends_post_js: /js/random-friends-post.js
```

## 六、隐藏管理面板入口（后端不支持时）

前端 bundle `@1.1.2` 自带管理面板：页面 footer 有个「设置」按钮，点击弹「友链朋友圈管理面板」，**首次登录输入的密码会成为管理密码**。

但如果你用的后端 fork 是旧版（路由只有 `/all` `/friend` `/post` 等只读接口，**没有 `/login`**），管理面板永远登不进去。处理方式：隐藏入口。

### 1. 禁掉面板开关逻辑（bundle 内）

`source/js/friends/index.js` 是混淆产物，但可以精确替换：

```js
// 修改前
managePanelShowSwitch(){this.managePanelShow=!this.managePanelShow}
// 修改后（点击"设置"无任何反应）
managePanelShowSwitch(){}
```

### 2. 隐藏"设置"按钮（页面注入）

在 `fcircle.pug` 末尾追加：

```pug
script(defer data-pjax).
  (function () {
    function hideManageUi() {
      document.querySelectorAll('.cf-setting-btn').forEach(function (el) { el.style.display = 'none'; });
      document.querySelectorAll('.cf-manage-overlay').forEach(function (el) { el.remove(); });
    }
    hideManageUi();
    if (window.MutationObserver) {
      var mo = new MutationObserver(hideManageUi);
      mo.observe(document.documentElement, { childList: true, subtree: true });
    }
  })();
```

- `.cf-setting-btn` 是「设置」按钮的 class（确认过 bundle 渲染代码）
- `.cf-manage-overlay` 是管理面板遮罩，兜底移除
- `MutationObserver` 兜底：Vue 异步渲染时按钮晚出现也能命中

## 七、验证

```bash
npx hexo clean
npx hexo ge
npx hexo d
```

用浏览器打开 `/fcircle/`：

- ✅ 顶部横幅 + 标题
- ✅ 文章流：`Powered by FriendCircle / Design by Heo / FrontEnd by AnzhiYu`
- ✅ 底部统计：订阅 N / 活跃 N / 日志 N / 更新于...
- ✅ 没有"设置"按钮
- ✅ 后端 API 正常（`fc.weiguang.eu.org/friend` 可访问）

> 文章流为空？八成是后端没抓到友链文章，先去排查第 ③ 篇的后端数据。缺"失联 N"统计？看第 ⑤ 篇。
