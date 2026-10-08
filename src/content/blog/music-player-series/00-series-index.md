---
title: anzhiyu 音乐播放器深度魔改系列 — 导航目录
date: '2026-08-09 14:00:00'
tags:
  - Hexo
  - anzhiyu
  - 音乐播放器
  - 系列教程
categories:
  - 技术分享
ai: true
description: anzhiyu 音乐播放器深度魔改全系列 3 篇文章导航，涵盖切页零中断播放、歌词功能、控制条与布局三大主题，附源码位置与验证工具。
pubDate: '2026-08-09 14:00:00'
---

## 系列简介

本系列把 anzhiyu 主题左下角音乐播放器（APlayer 定制版）的深度魔改过程全拆解。**每篇一个主题**：切页零中断、歌词、控制条与布局，附源码位置（`themes/anzhiyu/source/js/utils.js` 等）与实测数据。

> **适用版本**：Hexo 7.x + anzhiyu v1.7.1+（定制版 APlayer，`lrcType: 0`）  
> **配套工具**：`tools/edge-verify/`（puppeteer-core 驱动本机 Edge 自动化验证）

## 全系列目录

| 篇 | 标题 | 核心内容 |
|----|------|----------|
| **①** | [切页零中断：pjax 下播放不暂停的架构与补丁](https://blog.weiguang.eu.org/2026/08/09/music-player-series/01-pjax-zero-interrupt/) | audio 常驻 body 隐藏容器、needInit 判断、destroy/initAudio/setAudio 三连 patch、sessionStorage 恢复、无缝接力降级 |
| **②** | [歌词功能：URL 歌词、自绘滚动与竞态根治](https://blog.weiguang.eu.org/2026/08/09/music-player-series/02-lyrics/) | `window.__parseLrc` 统一解析、timeupdate 自绘同步、音乐馆歌词竞态修复、深浅色可读性 |
| **③** | [控制条与布局：展开折叠、音量条与控制台态](https://blog.weiguang.eu.org/2026/08/09/music-player-series/03-controls-layout/) | 折叠/展开双态卡片、空闲自动收起、自绘常驻音量条、控制台大圆盘布局、`aplayer-withlrc` 类坑 |

---

## 学习路径

```
① 切页零中断   ──► 播放器骨架与保活架构（必读第一）
    │
    ▼
② 歌词功能     ──► 自绘歌词 + 竞态处理
    │
    ▼
③ 控制条布局   ──► 双态 UI + 控制台
```

## 关键源码速查表

| 文件 | 角色 |
|------|------|
| `themes/anzhiyu/source/js/utils.js` | 播放器主逻辑（initNavMusicPlayer 733-1197、歌词竞态 1558-1589、歌单切换 1494-1556） |
| `themes/anzhiyu/source/js/main.js` | musicToggle、getNavMusicPlayer、初始化入口 1958 |
| `themes/anzhiyu/source/css/_extra/fix/aplayer.css` | 左下角播放器全部定制样式 |
| `themes/anzhiyu/source/css/_extra/console/console.css` | 控制台态大圆盘布局 |
| `themes/anzhiyu/source/css/_page/music.styl` | 音乐馆页样式 |
| `tools/edge-verify/` | Edge 自动化验证脚本（连续播放、切页、布局断言） |

## 实战教训（先记三个）

1. **定制版 APlayer 无 `.aplayer` 顶层类**（是 `.aplayer-body`），所有选择器/实例判断都要覆盖两者
2. **`lrcType: 0` 实例不会自动加 `aplayer-withlrc` 类**，console.css 大量规则从不匹配——JS 手动补类
3. **APlayer 原生 lrcType 3 异步 fetch 歌词与播放不同步**——自绘 timeupdate 才是正解

---

**收藏本文 = 拿到播放器魔改地图。** 🎵
