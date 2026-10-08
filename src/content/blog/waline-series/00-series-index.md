---
title: Waline 评论图片上传系列 — 导航目录
date: '2026-08-09 16:00:00'
tags:
  - Waline
  - 图床
  - 评论系统
  - 系列教程
categories:
  - 技术分享
ai: true
description: Waline 评论图片上传全系列：从浏览器直连图床的初版方案，到 Cloudflare Worker 代理 + 访客自选渠道的最终架构，覆盖安全、限流、前端交互的完整演进。
pubDate: '2026-08-09 16:00:00'
---

## 系列简介

本系列记录本站 Waline 评论图片上传功能的完整演进：**初版**（浏览器直连 CloudFlare ImgBed 图床，Token 硬编码）→ **v2**（Cloudflare Worker 代理，Token 转存 Secret）→ **v3**（访客自选上传渠道 + 前端弹窗交互）。

> **适用版本**：Waline + anzhiyu 主题 + Cloudflare Worker（`workers/waline-image-upload/`）  
> **线上架构**：`upload.weiguang.eu.org`（Worker）→ `img.weiguang.eu.org`（图床）

## 全系列目录

| 篇 | 标题 | 核心内容 |
|----|------|----------|
| **①** | [Waline 评论图片上传 + CloudFlare ImgBed 图床（整理版）](https://blog.weiguang.eu.org/2026/08/09/waline-series/01-imgbed-upload/) | `waline.imageUploader` 配置、图床 API 对接、`waline.pug` 传入 init、跨域排查——**含初版方案的致命安全缺陷** |
| **②** | [Cloudflare Worker 代理上传：Token 移出前端与安全防护](https://blog.weiguang.eu.org/2026/08/09/waline-series/02-worker-proxy/) | Origin 白名单、KV 限流、渠道白名单、类型/大小限制、`GET /channels` 动态下发、前端弹窗自选渠道 |

---

## 架构演进

```
v1（旧文）浏览器 ──直接 fetch──► 图床 /upload（Token 硬编码在前端，泄漏风险）
        │
        ▼ 安全整改（3ddd0ec）
v2 浏览器 ──► upload.weiguang.eu.org Worker ──► 图床（Token 在 Worker Secret）
        │
        ▼ 交互升级（4fd8de1）
v3 浏览器 ──GET /channels──► Worker 下发渠道白名单
        │         │
        └─弹窗自选渠道（localStorage 记忆）──► /upload?uploadChannel=xxx
```

## 关键源码速查表

| 文件 | 角色 |
|------|------|
| `workers/waline-image-upload/src/index.js` | Worker 代理：CORS/Origin 校验、限流、渠道分发、上游转发 |
| `workers/waline-image-upload/wrangler.toml` | 变量与 KV 绑定配置 |
| `source/js/waline-image-uploader.js` | 前端上传器：渠道弹窗、localStorage 记忆、兜底 |
| `_config.anzhiyu.yml` → `waline.imageUploader` | 兜底实现 + 全局函数优先 |

---

**收藏本文 = 拿到评论图床演进地图。** 🖼️
