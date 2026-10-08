---
title: Waline 评论图片上传系列（一）：Waline + CloudFlare ImgBed 图床配置（整理版）
date: '2026-08-09 16:30:00'
tags:
  - Waline
  - 图床
  - 评论系统
  - 教程
categories:
  - 技术分享
ai: true
description: Waline 评论框图片上传对接 CloudFlare ImgBed 图床的完整配置：imageUploader 函数、waline.pug 传参、跨域排查——以及初版方案 Token 硬编码的致命缺陷与演进方向。
pubDate: '2026-08-09 16:30:00'
---

## 开头：评论框的「上传图片」按钮，点了没反应

Waline 评论框默认没有图片上传能力（`imageUploader` 为空），访客想发截图只能贴外链。本文把「对接 CloudFlare ImgBed 图床」的完整配置讲清楚——**同时把初版方案的安全缺陷也讲清楚**：因为初版是把图床 Token 直接写进前端配置的，任何人 F12 就能抄走。看完这篇你会明白为什么后来要上 Worker 代理（见系列第二篇）。

## 目标声明 + 前置条件

本文带你完成：评论框图片上传可用（选图 → 上传图床 → 插入 Markdown 图片语法），并理解初版方案的局限。

**前置条件：**

- [x] 已搭建 Waline（评论区正常显示）
- [x] 已部署 CloudFlare ImgBed 图床，拿到 API Token
- [x] 图床服务端配好 CORS（浏览器直连必须）

**你将学会：**

1. 图床 `/upload` API 协议
2. `waline.imageUploader` 函数式配置
3. `waline.pug` 如何把配置传进 Waline init
4. 初版方案的 Token 泄漏风险

---

## Step 1：了解图床 API 协议

> 目的：知道上传接口长什么样。做完这步能用 curl 手测上传成功。

**图床 API 要点：**

| 项 | 值 |
|----|----|
| 接口 | `POST /upload` |
| 认证 | `Authorization: Bearer YOUR_API_TOKEN` |
| 格式 | `multipart/form-data`（字段名与图床约定一致） |
| 响应 | `[{ "src": "/file/abc123_image.jpg" }]`，src 需拼接图床域名 |

```bash
curl.exe -X POST https://img.weiguang.eu.org/upload \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -F "file=@test.jpg"
```

**预期输出：** 返回 JSON 数组，`src` 字段是图片路径。

> ⚠️ **报错排查**：`src` 是相对路径，前端必须拼图床域名；字段名不一定是 `file`，以图床文档为准。

---

## Step 2：配置 `waline.imageUploader`

> 目的：让 Waline 的图片选择器走图床上传。做完这步评论框选图能上传。

**操作：** `_config.anzhiyu.yml` → `waline` 段：

```yaml
waline:
  serverURL: https://cm.weiguang.eu.org/
  imageUploader: >
    (file) => {
      const uploadUrl = 'https://img.weiguang.eu.org/upload';
      const formData = new FormData();
      formData.append('file', file);
      return fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer YOUR_API_TOKEN' },
        body: formData
      }).then(res => res.json()).then(data => {
        if (!data || !data[0] || !data[0].src) throw new Error('上传失败');
        return 'https://img.weiguang.eu.org' + data[0].src;
      });
    }
```

**预期输出：** 评论框点图片按钮 → 选图 → 上传 → 返回的 URL 插入正文。

> ⚠️ **报错排查**：返回的必须是**图片完整 URL**（Waline 直接插入正文）；`data[0].src` 路径校验要做，图床返回异常时要 throw 让 Waline 显示错误。

---

## Step 3：确认 `waline.pug` 传入 init

> 目的：确保 imageUploader 配置真正传给 Waline 实例。做完这步前端生效。

**操作：** `themes/anzhiyu/layout/includes/third-party/comments/waline.pug`：

```pug
- const { serverURL, option, pageview, meta_css, imageUploader, reaction, emoji, locale, pageSize } = theme.waline
// ...
script.
  (() => {
    new Waline({ /* ... */ imageUploader: !{imageUploader} /* ... */ });
  })()
```

**预期输出：** 页面 Network 面板能看到向图床 `/upload` 的请求（选图上传时）。

> ⚠️ **报错排查**：`!{imageUploader}` 是 pug 非转义插值，把 YAML 里的箭头函数原样输出成 JS——不要写成 `#{imageUploader}`（会转义成字符串）。

---

## Step 4：跨域问题排查

> 目的：上传报跨域错误时能快速定位。做完这步 CORS 通。

**排查清单：**

| 症状 | 原因 | 解决 |
|------|------|------|
| `Access-Control-Allow-Origin` 缺失 | 图床未开 CORS | 图床加 `Access-Control-Allow-Origin: *` |
| 预检（OPTIONS）失败 | 未处理 OPTIONS | 图床对 OPTIONS 返回 204 + 允许头 |
| `Authorization` 头被拦 | 预检允许头不含 Authorization | `Access-Control-Allow-Headers: Authorization, Content-Type` |

**预期输出：** 浏览器上传请求 2xx，无跨域报错。

> ⚠️ **报错排查**：浏览器直连图床，Token 会在请求头里明文传输——**公网可被中间人截获**，这是 v1 方案的固有风险。

---

## ⚠️ 初版方案的致命缺陷

初版（本站 v1 实装）把 Token 硬编码进 `_config.anzhiyu.yml`：

```js
headers: { 'Authorization': 'Bearer imgbed_CsZPoZtkbdEyEM1I9ikwWcmKCS9V6v9z' }
```

**问题清单：**

1. **静态产物泄漏**：`hexo generate` 后 Token 出现在 public 的 JS 里，任何人 F12 可见
2. **不可轮换**：Token 泄漏只能换新 Token，然后改仓库再部署
3. **无防护**：无来源校验、无限流，任何站点都可以调用你的图床（刷流量/存恶意文件）

**这就是为什么演进到 Worker 代理**（见系列第二篇）：Token 移入 Cloudflare Worker Secret，前端只碰代理域名。

---

## 检查点：验证整体效果

> 全部勾选通过 = v1 方案跑通（并理解其局限）。

- [x] 评论框选图上传成功，正文插入图片 URL
- [x] 浏览器无跨域报错
- [x] 已意识到 Token 泄漏风险并规划升级 Worker 代理

---

## 常见问题（FAQ）

| 问题 | 原因 | 解决 |
|------|------|------|
| 上传没反应 | imageUploader 没传进 Waline | 检查 waline.pug 的 `!{imageUploader}` |
| 跨域报错 | 图床 CORS 未配置 | 按 Step 4 排查清单逐项过 |
| 插入的是相对路径 | 没拼图床域名 | 返回 `图床域名 + data[0].src` |
| Token 泄漏了怎么办 | v1 方案固有缺陷 | 立即轮换 Token，升级 Worker 代理 |

---

## 总结

v1 方案打通了「评论框 → 图床」的链路，但把安全债留给了未来。核心要点：

1. **函数式配置**：`imageUploader` 是箭头函数，返回 Promise<图片URL>
2. **pug 非转义插值**：`!{imageUploader}` 才输出 JS
3. **CORS 三件套**：Allow-Origin / OPTIONS / Allow-Headers
4. **安全债必须还**：Token 硬编码 = 静态产物泄漏，下一篇上 Worker

**延伸阅读：**

- [下一篇：Cloudflare Worker 代理上传——Token 移出前端与安全防护](https://blog.weiguang.eu.org/2026/08/09/waline-series/02-worker-proxy/)
- [系列导航](https://blog.weiguang.eu.org/2026/08/09/waline-series/00-series-index/)
