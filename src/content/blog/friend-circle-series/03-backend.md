---
title: 后端部署：hexo-circle-of-friends（Vercel + fork）
date: '2026-07-31 08:30:00'
tags:
  - Hexo
  - Rust
  - FriendCircle
  - 系列教程
categories:
  - 技术分享
ai: true
description: 部署 hexo-circle-of-friends 后端：fork 仓库、GitHub Actions 每 3 小时全量爬取友链文章、data.db 数据库、API 端点详解、error 字段的判定语义。
pubDate: '2026-07-31 08:30:00'
---

## 一、后端在整个体系里的角色

```
友链页(/link/) ──► 后端爬虫抓取每篇友链的 RSS/Atom
                    │
                    ▼
              data.db（SQLite）
                    │
                    ▼
        API：/all /friend /post /randompost ...
                    │
        ┌───────────┴────────────┐
        ▼                         ▼
   朋友圈页(文章流)            失联检测(friend-check)
```

**核心职责**：
1. 定期抓取每个友链的最新文章
2. 提供只读 API 供前端消费
3. 判定友链是否「失联」（抓不到文章）——这是整套自动化的判定源

## 二、fork 仓库

上游：`https://github.com/hexo-circle-of-friends/hexo-circle-of-friends`

```bash
# 1. GitHub 上 fork 到自己的账号（本文以 orchidsd 为例）
# 2. 克隆到本地
git clone https://github.com/orchidsd/hexo-circle-of-friends.git
cd hexo-circle-of-friends
```

项目结构（关键部分）：

```
├── api/            # Rust API 层（axum）
├── core/           # 核心逻辑（爬虫、DB、设置）
├── data/           # 数据目录
├── api_dependence/ # API 依赖
└── .github/workflows/
    └── CI.yml      # 定时爬取 + 提交 data.db
```

## 三、定时爬取（CI.yml）

后端靠 GitHub Actions **定时全量重爬**：

```yaml
name: CI

on:
  schedule:
    - cron: '0 0,6,12,18,21 * * *'   # 每天 0/6/12/18/21 点
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # ... 构建后端二进制 ...
      # ... 运行爬虫，抓取友链页所有友链的 RSS ...
      # ... 更新 data.db ...
      - name: Commit data.db
        run: |
          git add data/data.db
          git commit -m "update data"
          git push
```

**每次 push `data.db` → Vercel 自动重新部署 → API 数据更新。**

> ⚠️ 爬虫抓取的是**友链页在线渲染出的 HTML**（`.cf-friends-link` 等 class）。所以友链页模板缺属性 → 后端抓不到友链（第 ① 篇修复的就是这个）。

## 四、数据链路：从友链页到 API

1. Actions 里运行后端二进制，**访问你的友链页 URL**
2. 用 CSS 选择器（`.cf-friends-link`、`.cf-friends-avatar`、`.cf-friends-name`）提取友链：名字、头像、链接
3. 依次请求每个友链的 `atom.xml` / `rss.xml`（找不到 feed 就解析主页 HTML 取 `<title>`）
4. 抓到文章 → 写入 `data.db`；**抓不到关键字段（title）→ 该友链 error=1**

### error 字段的判定语义（重要）

| 情况 | error |
|------|-------|
| 能抓取到 RSS 文章 | `0` |
| 网站活着但 feed 结构异常/拿不到 title | `1` |
| 网站完全不可达 | `1` |

> 所以 `error=1` 表示 **"朋友圈拿不到你的文章"**，不只是"域名挂了"。

## 五、部署到 Vercel

fork 自带 Vercel 配置（`vercel.json`）：

```json
{
  "buildCommand": "cargo build --release",
  "outputDirectory": "",
  "rewrites": [...]
}
```

在 Vercel 控制台：

1. **Add New Project** → 选择 fork 的仓库
2. Framework Preset：Other
3. 构建命令：`cargo build --release`（或仓库自带脚本）
4. 输出目录：根目录（API 是 Rust 服务，由 `vercel.json` 的 rewrites 把 `/*` 指向二进制）
5. Deploy

部署后域名形如 `https://<project>.vercel.app`。

## 六、API 端点一览

| 端点 | 说明 | 关键字段 |
|------|------|----------|
| `/all` | 聚合数据 | `article_data`、`statistical_data` |
| `/all` 的 `statistical_data` | 统计 | `friends_num`、`active_num`、**`error_num`**、`article_num`、`last_updated_time` |
| `/friend` | 友链数组 | 每项含 `name` / `link` / `avatar` / **`error`** / `createdAt` |
| `/post` | 文章列表 | 标题、链接、时间 |
| `/randompost` | 随机一篇文章 | 用于"钓鱼" |
| `/randomfriend` | 随机一个友链 | - |
| `/summary` | 摘要 | - |
| `/version` | 版本 | - |
| `/docs` | Swagger UI | - |

所有接口返回 JSON，且带 `Access-Control-Allow-Origin: *`（前端跨域直接可读）。

## 七、验证后端是否工作

```bash
# 统计
curl https://fc.weiguang.eu.org/all
# 期望: {"friends_num":11,"active_num":11,"error_num":0,"article_num":11,"last_updated_time":"..."}

# 友链数组（含 error 字段）
curl https://fc.weiguang.eu.org/friend
# 期望: [{"name":"...","link":"...","avatar":"...","error":false,...}]
```

**排错口诀**：
- `friends_num` 少 → 友链页模板缺 `.cf-*` 属性（回第 ① 篇）
- `error_num` 多 → 对应友链抓不到文章，打开友链页逐个验证（真实失联 / feed 异常 / 重定向丢路径，见第 ⑥ 篇）
- API 超时 → Vercel 部署失败，查 Vercel 日志

## 八、数据更新频率

- 爬虫：每 3 小时一次（cron `0 0,6,12,18,21`）
- 也可以手动：仓库 Actions → CI → **Run workflow** 立即触发一次
- Vercel 在 `data.db` 提交后自动重新部署，约 1 分钟内生效

> 下一篇：有了后端 error 判定，如何实现友链的每日自动检测与自动部署。
