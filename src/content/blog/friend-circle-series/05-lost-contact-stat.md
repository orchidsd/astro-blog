---
title: 朋友圈失联统计显示（前端注入）
date: '2026-07-31 08:50:00'
tags:
  - Hexo
  - anzhiyu
  - FriendCircle
  - 系列教程
categories:
  - 技术分享
ai: true
description: 在朋友圈 footer 注入"失联 N"统计：脚本读后端 /all 的 error_num，动态插入 fc-lost-contact 标签，随后端状态自动显示与隐藏，无需每次构建。
pubDate: '2026-07-31 08:50:00'
---

> **⚠️ 已清理（2026-08-05）**：本文所述 `source/js/friends/lost-contact-stat.js` 已删除。当前失联统计已由 `friend-circle-default.custom.js`（lite 自写版）内置实现，本文仅供历史参考。

## 一、需求

朋友圈 footer 已经有这些统计：

```
订阅 11
活跃 11
日志 11
更新于：2026-07-31 20:47:27
```

现在要加一个：**失联 N**（后端判定抓不到文章的友链数量），并且**随后端状态自动显隐**——后端 error 归 0 时自动消失，出现失联友链时自动显示。

## 二、思路

前端 bundle 是 Vue 混淆产物，改它维护成本高。更优雅的方式：**页面注入一段独立的轻量脚本**，它做三件事：

1. 轮询等待 bundle 渲染出统计 footer（`.cf-data-active`）
2. 请求后端 `/all`，读 `statistical_data.error_num`
3. `error_num > 0` 时在 footer 追加"失联 N"标签

优点：
- 不侵入 bundle，升级 bundle 不受影响
- 数据实时来自后端，不需要每次友链变化都重新构建博客
- 逻辑简单，可读可维护

## 三、脚本 lost-contact-stat.js

位置：`source/js/friends/lost-contact-stat.js`

```js
(function () {
  var api = window.FC_API_URL || 'https://fc.weiguang.eu.org/';
  var shown = false;

  function inject(count) {
    if (shown) return;
    var target = document.querySelector('.cf-data-active');
    if (!target || !target.parentElement) return;
    shown = true;
    var el = document.createElement('div');
    el.className = 'cf-data-active fc-lost-contact';
    el.style.cssText =
      'color: var(--anzhiyu-secondtext) !important;opacity: .8;filter: grayscale(1);';
    el.innerHTML = '<span class="cf-label">失联</span><span class="cf-message">' + count + '</span>';
    target.parentElement.appendChild(el);
  }

  function poll() {
    var target = document.querySelector('.cf-data-active');
    if (!target) {
      if (!window.__fcLostContactTimer) {
        window.__fcLostContactTimer = setTimeout(poll, 500);
      }
      return;
    }
    fetch(api + 'all', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var n = d && d.statistical_data && d.statistical_data.error_num;
        if (typeof n === 'number' && n > 0) inject(n);
      })
      .catch(function () {});
  }

  poll();
})();
```

### 关键点

| 部分 | 说明 |
|------|------|
| `window.FC_API_URL` | 在 `fcircle.pug` 注入的全局变量，避免硬编码域名 |
| `cache: 'no-store'` | 后端是动态 API，禁止缓存，保证统计实时 |
| `.cf-data-active` | bundle 渲染统计 footer 的 class，找它作为插入锚点 |
| `shown` 防抖 | 只注入一次 |
| 轮询等待 | Vue 异步渲染，footer 可能晚出现，500ms 重试直到出现 |
| `error_num === 0` | 什么都不做（不显示），后端恢复后"失联"自动消失 |

> 注入的样式：`filter: grayscale(1)` 让失联标签呈灰色，视觉上与正常统计区分。

## 四、在 fcircle.pug 中挂载

```pug
script(defer data-pjax).
  window.FC_API_URL = '!{theme.friends_vue.apiurl}';
script(defer data-pjax src=url_for('js/friends/lost-contact-stat.js'))
```

- `data-pjax`：pjax 切页后脚本重新执行
- 顺序：先设 `FC_API_URL`，再加载统计脚本

## 五、后端返回的统计结构

`GET {api}/all`：

```json
{
  "article_data": [...],
  "statistical_data": {
    "friends_num": 11,
    "active_num": 11,
    "error_num": 0,
    "article_num": 11,
    "last_updated_time": "2026-07-31 21:48:30"
  }
}
```

- `active_num`：活跃友链数（`error_num = friends_num - active_num`）
- `error_num > 0` 才显示失联统计

## 六、验证

```bash
npx hexo clean && npx hexo ge && npx hexo d
```

**有失联友链时**（后端 `error_num > 0`）：

```
订阅 11  活跃 10  日志 11  更新于：...  失联 1
```

**全部正常时**（`error_num = 0`）：

```
订阅 11  活跃 11  日志 11  更新于：...
```

无"失联"显示——**这就是正确的行为**，说明没有失联友链。

### headless 验证（可选）

```bash
# 用无头浏览器 dump 渲染后的 DOM，检查 fc-lost-contact 是否存在
msedge --headless=new --disable-gpu --dump-dom https://你的域名/fcircle/
```

## 七、为什么不用构建时注入

也可以在 `hexo ge` 时根据 link.yml 失联组数量静态写入。但**失联状态由后端每 3 小时更新**，静态方案要每次友链变化都重新构建部署。运行时读 API 的方案：

- ✅ 秒级反映后端最新状态
- ✅ 后端恢复后"失联"自动消失，无需部署
- ✅ 与朋友圈文章流数据同源，不会出现"页面说没失联、流里却没文章"的矛盾

> 下一篇：整个搭建过程中踩过的坑与排查思路。
