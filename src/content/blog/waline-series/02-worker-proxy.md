---
title: Waline 评论图片上传系列（二）：Cloudflare Worker 代理上传——Token 移出前端与安全防护
date: '2026-08-09 17:00:00'
tags:
  - Waline
  - Cloudflare Workers
  - 安全
  - 教程
categories:
  - 技术分享
ai: true
description: 把图床 Token 从静态产物里彻底移除：Cloudflare Worker 代理上传（Origin 白名单 + KV 限流 + 渠道白名单 + 类型大小限制），前端弹窗让访客自选渠道，localStorage 记忆。
pubDate: '2026-08-09 17:00:00'
---

## 开头：F12 就能抄走你的图床 Token

上一版评论上传（见系列第一篇），Token 直接写在前端配置里。一次安全检查发现：`hexo generate` 的产物里，`Authorization: Bearer imgbed_xxx` 明晃晃地躺在 JS 中——**任何访客打开 DevTools 就能抄走**，然后拿你的图床当免费存储。

整改方案：加一层 **Cloudflare Worker 代理**。浏览器只碰代理域名，图床 Token 存 Worker Secret，前端零凭据；顺带把 Origin 白名单、IP 限流、渠道白名单、类型/大小限制全部做进代理层，图床从「裸奔」变「全副武装」。

## 目标声明 + 前置条件

本文带你完成：评论图片上传改为「浏览器 → Worker → 图床」三跳架构，Token 不再出现在任何静态产物中，且 Worker 具备来源校验、限流、白名单、类型大小检查；访客还能弹窗自选上传渠道。

**前置条件：**

- [x] 已有 Cloudflare 账号与图床（ImgBed/Telegraph/Discord 等渠道）
- [x] 已掌握 `npx wrangler` 部署（login/deploy/secret）
- [x] 已读完系列第一篇（理解 v1 缺陷）

**你将学会：**

1. Worker 代理的完整防护矩阵（来源/限流/白名单/类型大小）
2. `GET /channels` 动态下发渠道的设计
3. 前端弹窗自选渠道 + localStorage 记忆
4. Secret 管理：Token 只存在于 Worker 环境

---

## Step 1：Worker 骨架与 CORS/Origin 校验

> 目的：只有你的博客域名能调用上传接口。做完这步别人站点的请求会被 403。

**操作：** `workers/waline-image-upload/src/index.js` 主流程：

```js
// 读 Origin 生成 CORS 头
const origin = request.headers.get("Origin") || "";
const corsHeaders = createCorsHeaders(origin, env.ALLOWED_ORIGIN);
if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

// Origin 校验：白名单外 403
if (origin !== env.ALLOWED_ORIGIN) {
  return jsonError("来源不受允许", 403, corsHeaders);
}
```

```js
function createCorsHeaders(origin, allowedOrigin) {
  const headers = new Headers({
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Cache-Control': 'no-store', Vary: 'Origin',
  });
  if (origin === allowedOrigin) headers.set('Access-Control-Allow-Origin', allowedOrigin);
  return headers;
}
```

**预期输出：** 用 `curl.exe -H "Origin: https://evil.com"` 调用返回 403；博客域名调用正常。

> ⚠️ **报错排查**：`ALLOWED_ORIGIN` 必须在 `wrangler.toml` 的 `[vars]` 里配（`https://blog.weiguang.eu.org`）；空 Origin（服务端调用）会被 403，这是设计如此。

---

## Step 2：类型/大小白名单 + 文件名清洗

> 目的：只收图片，禁一切可执行/脚本文件。做完这步 SVG/EXE/超大文件全被拦。

**操作：**

```js
const ALLOWED_MEDIA_TYPES = new Set(['image/jpeg','image/png','image/webp','image/gif']);
const CHANNEL_MAX_UPLOAD_BYTES = {
  telegram: 20 * MEBIBYTE, cfr2: 100 * MEBIBYTE, s3: 100 * MEBIBYTE,
  discord: 25 * MEBIBYTE, huggingface: 20 * MEBIBYTE, webdav: 100 * MEBIBYTE,
};

// 流程中：Content-Length 超限提前 413 → 解析 formData → file 存在性校验
// → 类型白名单 415 → file.size===0 或超 maxUploadBytes 413
// → sanitizeFileName：扩展名按 MIME 映射、非法字符转 -、截断 80 字符、兜底 waline-image
```

**预期输出：** 上传 `.svg` 返回 415（**禁 SVG 防可执行 SVG 同源利用**）；100MB+ 文件 413；中文名/特殊字符文件名被清洗成安全名。

> ⚠️ **报错排查**：大小校验**两层**——先看 `Content-Length`（请求体预检）再看 `file.size`（实际文件），只有后者会漏超大分块；文件名清洗必须基于 MIME 映射扩展名而非用户原始文件名（`shell.jpg` → `.png` 等伪装会被纠正）。

---

## Step 3：KV 限流（8 次/分/IP）

> 目的：防止脚本刷图床。做完这步单 IP 超额返回 429。

**操作：** `wrangler.toml` 绑定 KV：

```toml
[[kv_namespaces]]
  binding = "UPLOAD_RATE_LIMIT"
  id = "d801271bbd9f4f789afdfd5b151f1ae9"
```

```js
// 窗口对齐到分钟；IP 取 CF-Connecting-IP
const key = `upload:${clientIp}:${windowStart}`;
const currentCount = Number(await env.UPLOAD_RATE_LIMIT.get(key)) || 0;
if (currentCount >= maxRequests) {
  return jsonError('上传过于频繁，请稍后再试', 429, corsHeaders, { 'Retry-After': ... });
}
await env.UPLOAD_RATE_LIMIT.put(key, String(currentCount + 1), { expirationTtl: windowSeconds + 60 });
```

**预期输出：** 1 分钟内同 IP 第 9 次上传返回 429 + `Retry-After` 头。

> ⚠️ **报错排查**：KV 计数非强一致（最终一致），极限并发下可能漏几次——README 建议叠加 Cloudflare WAF Rate Limiting 双保险；`expirationTtl` 要比窗口多留 60s，防窗口边界清零。

---

## Step 4：上游代理转发（Token 在 Secret）

> 目的：浏览器零凭据，图床 Token 只存在于 Worker 环境变量。做完这步静态产物里搜不到任何 Token。

**操作：**

```js
// 上游 fetch：headers 仅 Authorization: Bearer ${env.IMG_HOST_TOKEN}
// Token 来自 wrangler secret put IMG_HOST_TOKEN，不进代码、不进静态产物
const upstream = await fetch(createUpstreamUrl(env, uploadOptions), {
  method: "POST",
  headers: { Authorization: `Bearer ${env.IMG_HOST_TOKEN}` },
  body: upstreamFormData,
});
if (!upstream.ok) return jsonError("图床服务暂时不可用", 502, corsHeaders);
// 透传上游响应，Cache-Control: no-store
```

部署三步：

```bash
npx wrangler login
npx wrangler deploy                  # 自动创建绑定 KV
npx wrangler secret put IMG_HOST_TOKEN   # 输入图床 Token（不落盘代码）
npx wrangler deploy
```

**预期输出：** `git grep -r "imgbed_" .` 全仓库零结果；上传链路正常。

> ⚠️ **报错排查**：Secret 与 `[vars]` 的差别——Secret 适合**密文**（Token），vars 适合**非敏感配置**（白名单/限额），别把 Token 写进 wrangler.toml（会被提交）；`wrangler.toml` 在 `.gitignore` 里的 `.wrangler` 本地缓存不影响。

---

## Step 5：`GET /channels` 动态下发渠道

> 目的：前端不硬编码渠道，从 Worker 实时获取白名单与限额。做完这步换渠道不用改前端。

**操作：**

```js
// GET /channels：遍历 ALLOWED_UPLOAD_CHANNELS，每项输出 {name, maxUploadBytes}
// 并计算 default（DEFAULT_UPLOAD_CHANNEL 在白名单内则用它，否则取第一个）
// 返回 { channels, default }
```

`wrangler.toml` 里渠道配置：

```toml
DEFAULT_UPLOAD_CHANNEL = "discord"
ALLOWED_UPLOAD_CHANNELS = "telegram,cfr2,s3,discord,huggingface,webdav"
```

渠道大小上限（服务端二次校验，`maxUploadBytes = Math.min(MAX_UPLOAD_BYTES, channelLimit)`——全局上限只能压低不能突破渠道上限）：

| 渠道 | 单文件上限 |
|------|-----------|
| telegram | 20 MiB |
| discord | 10~25 MiB |
| huggingface | 20 MiB |
| cfr2 / s3 / webdav | 100 MiB |

**预期输出：** `curl.exe https://upload.weiguang.eu.org/channels` 返回渠道列表 + 各渠道限额 + default。

> ⚠️ **报错排查**：`uploadChannel` 不在白名单返回 400「不支持该上传渠道」；命名渠道（`channelName`）要走 `ALLOWED_CHANNEL_NAMES` 二次白名单，别漏。

---

## Step 6：前端弹窗自选渠道

> 目的：访客上传时弹窗选渠道（可记忆），脚本未加载时兜底默认渠道。做完这步交互闭环。

**操作：** `source/js/waline-image-uploader.js`（IIFE）：

```js
const API_BASE = 'https://upload.weiguang.eu.org';
const STORAGE_KEY = 'waline-upload-channel';

// fetchChannels()：模块级缓存 cachedChannels，GET /channels 失败返回 null（前端不硬编码渠道）
// createModal(channels, defaultChannel)：全屏遮罩 + role="dialog" 面板
//   - localStorage 记忆存在且在白名单内 → 初始选中，否则用 default
//   - 单项显示渠道名 + 「单文件上限 X MiB」，主题色高亮
//   - Esc 键取消（keydown）/ 点击遮罩取消（e.target === overlay）
// upload(file, channel)：POST /upload?uploadChannel=channel，校验 data?.[0]?.src
// walineUploader(file)：/channels 失败或空列表 → 兜底 localStorage 记忆 || 'discord' 直接上传
window.WalineImageUploader = walineUploader;   // 暴露全局
```

`_config.anzhiyu.yml` 的 `waline.imageUploader` 改为「全局函数优先 + 兜底」：

```yaml
imageUploader: >
  (file) => {
    if (window.WalineImageUploader) return window.WalineImageUploader(file);
    // 兜底：脚本未加载时直接 fetch upload.weiguang.eu.org/upload?uploadChannel=discord
  }
```

注入：`inject.bottom` 加 `<script src="/js/waline-image-uploader.js"></script>`。

**预期输出：** 访客点上传 → 弹窗选渠道（记忆上次选择）→ 上传成功；禁 JS 环境走兜底 discord 渠道。

> ⚠️ **报错排查**：弹窗遮罩 `z-index` 要足够高（`2147483000`）压过评论区；localStorage 记忆必须在白名单校验**之后**再采纳（渠道下线了还记忆会死循环 400）；上传错误要 throw `data?.error` 给 Waline 显示。

---

## 检查点：验证整体效果

> 全部勾选通过 = Worker 代理上线。

- [x] `git grep "imgbed_\|Bearer sk-"` 全仓库零凭据
- [x] 非本站 Origin 调用 403
- [x] SVG/超大文件被 415/413 拦截
- [x] 同 IP 1 分钟第 9 次上传 429
- [x] `/channels` 返回渠道白名单
- [x] 访客上传弹窗可选渠道，刷新后记忆上次选择
- [x] 评论图片上传端到端可用

---

## 常见问题（FAQ）

| 问题 | 原因 | 解决 |
|------|------|------|
| 别人能调我的上传接口吗 | Origin 白名单没配/失效 | 确认 ALLOWED_ORIGIN 正确且非空 |
| Token 在哪 | 静态产物搜不到 | Token 只在 Worker Secret，`wrangler secret put` |
| 上传大图失败 | 渠道限额 | 看 /channels 返回的 maxUploadBytes，选 100MiB 渠道 |
| 429 太频繁 | 限流触发 | KV 计数过期前等窗口；或调整 RATE_LIMIT_MAX_REQUESTS |
| 前端弹窗不出现 | uploader.js 没注入 | 确认 inject.bottom 注入 + 路径正确 |

---

## 总结

Worker 代理把「图床裸奔」升级为「全防护上传网关」。核心要点：

1. **零凭据前端**：Token 只在 Worker Secret，静态产物无泄漏面
2. **防护矩阵**：Origin 白名单（来源）+ KV 限流（频率）+ 渠道白名单（去向）+ 类型大小（内容）
3. **动态下发**：`/channels` 让前端跟着白名单走，配置热更新
4. **双保险**：KV 限流 + WAF Rate Limiting；前端弹窗 + 兜底默认渠道

**延伸阅读：**

- [上一篇：Waline + CloudFlare ImgBed 图床配置（整理版）](https://blog.weiguang.eu.org/2026/08/09/waline-series/01-imgbed-upload/)
- [系列导航](https://blog.weiguang.eu.org/2026/08/09/waline-series/00-series-index/)
- [Worker 源码 workers/waline-image-upload/](https://github.com/orchidsd/hexo-blog/tree/main/workers/waline-image-upload)
