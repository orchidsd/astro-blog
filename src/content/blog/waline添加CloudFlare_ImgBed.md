---
title: Waline评论框图片上传添加CloudFlare ImgBed图床支持
description: 手把手教你将 CloudFlare ImgBed 上传 API 集成到 Waline 评论系统，实现评论图片直接上传图床，告别外链失效。
ai: true
swiper_index: 1
top_group_index: 1
top: 4
date: '2026-04-12 00:54:03'
tags:
  - 教程
  - Hexo
  - anzhiyu
  - 博客搭建
categories:
  - 学习
pubDate: '2026-04-12 00:54:03'
---

---

# 使用 CloudFlare ImgBed 集成 Waline 评论系统图片上传功能

本文档将指导你如何将 CloudFlare ImgBed 的上传 API 集成到 Waline 评论系统中，实现评论中图片上传的功能。

---

## 前置条件

1. 已搭建并配置好 Hexo 博客和 Waline 评论系统。
2. 已获取 CloudFlare ImgBed 的 API Token。
3. 确保 CloudFlare ImgBed 的服务端已正确配置 CORS（跨域资源共享）。

---

## 图床 API 简介

- **上传 API**：`/upload`
- **方法**：`POST`
- **认证方式**：`Authorization: Bearer YOUR_API_TOKEN`
- **内容类型**：`multipart/form-data`
- **响应格式**：

  ```json
  [
    {
      "src": "/file/abc123_image.jpg"
    }
  ]
  ```

  其中 `src` 是图片的路径，需要拼接图床域名生成完整的图片 URL。

---

## 配置步骤

### 1. 修改 _config.anzhiyu.yml

在 Hexo 的主题配置文件 _config.anzhiyu.yml 中，添加或修改 `waline` 配置，确保 `imageUploader` 函数正确实现。

```yaml
waline:
  serverURL: https://cm.weiguang.eu.org/ # Waline 服务地址
  imageUploader: >
    (file) => {
      const formData = new FormData();
      formData.append('file', file); // 将上传的文件附加到表单数据中

      // 上传 API 地址
      const uploadUrl = 'https://your-cloudflare-imgbed-url/upload';

      return fetch(uploadUrl, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer YOUR_API_TOKEN', // 替换为你的 API Token
        },
        body: formData,
      })
        .then((response) => response.json()) // 解析返回的 JSON 数据
        .then((data) => {
          if (data && data[0] && data[0].src) {
            // 拼接完整的图片 URL
            return `https://your-cloudflare-imgbed-url${data[0].src}`;
          } else {
            throw new Error('上传失败：未返回图片链接');
          }
        })
        .catch((error) => {
          console.error('图片上传失败:', error);
          throw error;
        });
    }
```

#### 参数说明

- **`Authorization`**：在请求头中添加 `Bearer YOUR_API_TOKEN`，替换为你的实际 API Token。
- **`uploadUrl`**：替换为你的图床上传 API 地址，例如 `https://your-cloudflare-imgbed-url/upload`。
- **`file`**：Waline 会将上传的文件传递给 `imageUploader` 函数。
- **返回值**：根据文档，`data[0].src` 是图片的路径，需要拼接图床的域名生成完整的图片 URL。

---

### 2. 确保 Waline 配置正确

在 waline.pug 文件中，确保 `imageUploader` 被正确传递到 Waline 的初始化配置中。

以下是 Waline 的初始化代码：

```jade
- const { serverURL, option, pageview, meta_css, imageUploader, reaction, emoji, locale, pageSize } = theme.waline

script.
  (() => {
    let initFn = window.walineFn || null;

    const initWaline = (Fn) => {
      const waline = Fn(Object.assign({
        el: '#waline-wrap',
        serverURL: '!{serverURL}',
        pageview: !{lazyload ? false : pageview},
        dark: 'html[data-theme="dark"]',
        path: window.location.pathname,
        comment: !{lazyload ? false : count},
        imageUploader: !{imageUploader}, // 确保 imageUploader 被正确传递
        reaction: !{JSON.stringify(reaction)},
        emoji: !{JSON.stringify(emoji)},
        locale: !{JSON.stringify(locale)},
        pageSize: !{pageSize},
      }, !{JSON.stringify(option)}));

      const destroyWaline = () => {
        waline.destroy();
      };

      anzhiyu.addGlobalFn('pjax', destroyWaline, 'destroyWaline');
    };

    const loadWaline = async () => {
      if (initFn) initWaline(initFn);
      else {
        await getCSS('!{url_for(theme.asset.waline_css)}');
        if (!{meta_css}) await getCSS('!{url_for(theme.asset.waline_meta_css)}');
        const { init } = await import('!{url_for(theme.asset.waline_js)}');
        initFn = init || Waline.init;
        initWaline(initFn);
        window.walineFn = initFn;
      }
    };

    if ('!{use[0]}' === 'Waline' || !!{lazyload}) {
      if (!{lazyload}) anzhiyu.loadComment(document.getElementById('waline-wrap'), loadWaline);
      else setTimeout(loadWaline, 0);
    } else {
      window.loadOtherComment = loadWaline;
    }
  })();
```

---

### 3. 测试功能

1. 保存配置后，重新启动 Hexo 服务：

   ```bash
   hexo clean && hexo g && hexo s
   ```

2. 打开博客页面，尝试在评论中上传图片。
3. 检查图片是否成功上传到图床，并返回正确的图片链接。

---

### 4. 常见问题排查

#### 1. 图片上传失败

- 检查浏览器开发者工具的网络请求，确认请求是否成功。
- 检查返回的 JSON 数据，确保 `src` 字段存在。
- 确保 `Authorization` 和其他参数配置正确。

#### 2. 跨域问题

如果浏览器提示跨域错误，请确保图床服务的服务器端已正确配置 CORS：

```http
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: POST, GET, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

---

## 总结

通过以上步骤，你已经成功将 CloudFlare ImgBed 的上传 API 集成到 Waline 评论系统中，实现了评论中图片上传的功能。现在，你的博客评论系统可以支持图片上传，并将图片存储到 CloudFlare ImgBed 中。

---
