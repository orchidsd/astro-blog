---
title: 友链朋友圈自动化全攻略 — 系列导航与总体架构
date: '2026-07-31 08:00:00'
tags:
  - Hexo
  - anzhiyu
  - FriendCircle
  - 系列教程
categories:
  - 技术分享
ai: true
description: 友链朋友圈自动化全攻略系列 7 篇文章导航目录，涵盖总体架构、友链页与 link.yml、朋友圈搭建、后端部署、自动检测与自动部署、失联统计显示、踩坑排查的完整知识体系。
pubDate: '2026-07-31 08:00:00'
---

## 系列简介

本系列完整复盘一套 **「友链 + 朋友圈」自治运维体系**：从友链页搭建、朋友圈接入，到后端每 3 小时自动抓取文章、每日自动检测友链存活状态、自动归类失联友链、自动构建部署上线。**全流程零人工干预**。

> **适用版本**：Hexo 7.x + anzhiyu v1.7.1+ + hexo-circle-of-friends fork
> **配套仓库**：
> - `hexo-blog`（源码：link.yml、主题 Patch、friend-check 脚本、GitHub Actions）
> - `orchidsd.github.io`（部署产物，由 `hexo d` / Actions 推送）
> - `hexo-circle-of-friends`（fork，Vercel 后端 + 定时爬虫）

---

## 🏗️ 总体架构（先看这张图）

```
┌──────────────────────────────────────────────────────────────┐
│                     weiguang.eu.org                          │
│               Cloudflare Workers（Git 集成自动构建）          │
│         orchidsd.github.io 仓库 main 分支 → 静态资产          │
├──────────────────────────────────────────────────────────────┤
│  /link/  友链页（多分组 + 失联组）                            │
│  /fcircle/ 朋友圈（文章流 + 失联统计）                        │
└──────────────────────────────────────────────────────────────┘
                        ▲ 浏览器直接访问
┌──────────────────────┴──────────────────────────────────────┐
│                    hexo-blog（源码仓库）                      │
│  source/_data/link.yml  友链数据源                            │
│  friend-check/friend-check.js  存活检测脚本                    │
│  .github/workflows/friend-check.yml  每日自动检测+部署         │
│  themes/anzhiyu/  主题 Patch（flink.pug / fcircle.pug）       │
└──────────────────────────────────────────────────────────────┘
        │ hexo d / Actions 构建                                │
        ▼
┌──────────────────────────────────────────────────────────────┐
│              orchidsd.github.io（部署产物）                   │
│  public/ 静态文件（link / fcircle / js 等）                   │
└──────────────────────────────────────────────────────────────┘
        │ CF Git 集成轮询 → 自动构建                            │
        ▼
        weiguang.eu.org（线上）
┌──────────────────────────────────────────────────────────────┐
│            hexo-circle-of-friends（fork 后端）                │
│  Vercel 托管 · GitHub Actions 每 3 小时全量重爬               │
│  data.db（SQLite）→ API：/all /friend /randompost ...         │
│  关键字段：error（能否抓取到文章）                            │
└──────────────────────────────────────────────────────────────┘
        │ 朋友圈页 fetch                                       │
        ▼
    fc.weiguang.eu.org（Vercel API）
```

**三套系统的分工**：

| 系统 | 角色 | 更新频率 |
|------|------|----------|
| `hexo-blog` | 一切配置与数据的源头 | 人工/自动检测 |
| `orchidsd.github.io` | 静态产物，供 CF 读取 | `hexo d` / Actions 推送 |
| CF Worker | 线上 CDN + 构建 | Git 集成自动 |
| Vercel 后端 | 抓取友链文章 + 失联判定 | 每 3 小时 |

---

## 📚 全系列目录

| 篇 | 标题 | 核心内容 | 阅读建议 |
|----|------|----------|----------|
| **①** | [友链页搭建与 link.yml 深度解析](https://blog.weiguang.eu.org/2026/07/31/friend-circle-series/01-link-page/) | `link.yml` 分组结构、`lost_contact` 失联组、`flink.pug` 抓取修复、三种卡片样式、与官方友链页差异 | **必读**，友链是一切的数据源 |
| **②** | [朋友圈（FriendCircle）页面搭建](https://blog.weiguang.eu.org/2026/07/31/friend-circle-series/02-fcircle-page/) | bundle 引入、`fcircle.pug`、`FC_API_URL`、随机文章、隐藏管理面板入口 | 想让页面有"朋友圈"先看这篇 |
| **③** | [后端部署：hexo-circle-of-friends（Vercel + fork）](https://blog.weiguang.eu.org/2026/07/31/friend-circle-series/03-backend/) | fork、定时爬虫、`data.db`、API 端点、`error` 字段语义 | 理解"谁在检测失联"必读 |
| **④** | [友链自动检测与自动部署（GitHub Actions）](https://blog.weiguang.eu.org/2026/07/31/friend-circle-series/04-auto-detect-deploy/) | `friend-check` workflow、后端 error 驱动的检测脚本、3 个坑、PAT Secret | 全自动化的核心，**强烈推荐** |
| **⑤** | [朋友圈失联统计显示（前端注入）](https://blog.weiguang.eu.org/2026/07/31/friend-circle-series/05-lost-contact-stat/) | `lost-contact-stat.js`、`/all` 的 `error_num`、样式注入、随状态自动显隐 | 让"失联"在朋友圈页可见 |
| **⑥** | [踩坑与问题排查实录](https://blog.weiguang.eu.org/2026/07/31/friend-circle-series/06-troubleshooting/) | guoqi 重定向、CF 522、管理面板登录、Actions IP 屏蔽、TLS 误报 | 遇到问题先翻这篇 |

---

## 🎯 学习路径推荐

```
想搭友链页
    │
    ▼
① link.yml 与友链页 ──► 数据源 + 页面
    │
    ├─► ② 朋友圈页面（按需）
    │
    ├─► ③ 后端部署 ──► ④ 自动检测部署（自动化闭环）
    │                        │
    │                        ▼
    │                   ⑤ 失联统计显示
    │
    ▼
⑥ 踩坑排查（随时查阅）
```

---

## 🛠️ 核心文件速查表

| 文件 | 角色 |
|------|------|
| `source/_data/link.yml` | 友链数据源（正常组 + `lost_contact: true` 失联组） |
| `source/link/index.md` | 友链页入口（`type: link`） |
| `source/fcircle/index.md` | 朋友圈页入口（`type: fcircle`） |
| `themes/anzhiyu/layout/includes/page/flink.pug` | 友链页模板（失联块抓取属性） |
| `themes/anzhiyu/layout/includes/page/fcircle.pug` | 朋友圈模板（API 注入 + 失联统计脚本） |
| `source/js/friends/friend-circle-default.custom.js` | 朋友圈前端（lite 自写版，内置失联统计） |
| `friend-check/friend-check.js` | 存活检测脚本（读后端 error） |
| `.github/workflows/friend-check.yml` | 每日自动检测 + 自动部署 |
| `.github/workflows/CI.yml`（fork 仓库） | 后端每 3 小时爬取 |

---

## 🔑 核心机制一句话

> **「友链是否失联，由后端说了算。」**
>
> 后端（Vercel）每 3 小时尝试抓取每个友链的 RSS 文章，抓不到就置 `error=1`。
> 前端朋友圈读 `/all` 的 `error_num` 显示"失联 N"；
> GitHub Actions 每日读 `/friend` 的 `error` 字段，自动把失联友链移入 `link.yml` 的失联组，再自动构建部署。

这套设计把 **「检测」** 和 **「展示」** 完全解耦：检测交给能访问所有友链站点的后端环境，展示层只是消费它的结论。

---

## 💡 系列设计初衷

> **「把一次完整的问题排查，沉淀成可复用的自动化体系。」**

- 每篇 **配置在前、原理在中、避坑在尾**，既可当教程读，也可当字典查
- 所有改动基于 anzhiyu 主题覆盖层，升级主题只需重打 Patch
- 自动化链路全部跑通并用真实故障验证过（失效→归位→自动部署）
- 篇幅务实，每篇都有可直接照抄的配置

---

## 📬 反馈与共建

- 发现错误/过时配置 → 评论留言
- 有新玩法/新坑 → 评论区分享
- 想扩展 → 对照系列结构定位对应篇章

---

**收藏本文 = 拿到全系列导航地图。**  
祝你的友链永不"失联"、朋友圈常"活跃"！🚀
