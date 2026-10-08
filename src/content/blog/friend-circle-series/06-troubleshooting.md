---
title: 踩坑与问题排查实录
date: '2026-07-31 09:00:00'
tags:
  - Hexo
  - 排错
  - 系列教程
categories:
  - 技术分享
ai: true
description: 友链朋友圈自动化搭建中的真实踩坑记录：guoqi.dev 重定向丢路径、后端"缺关键字段 title"、CF 构建 522 与缺 wrangler.jsonc、管理面板登不进、PowerShell TLS 误报、Actions IP 被屏蔽。
pubDate: '2026-07-31 09:00:00'
---

## 坑 1：友链站 301 重定向丢路径，后端抓不到

**现象**：后端日志：

```
url: https://guoqi.dev/ 抓取缺少关键字段 title
```

`guoqi.dev` 在 `error=1`（失联），但浏览器访问很正常。

**根因**：`guoqi.dev` 的 CDN 做了整站 301：

```
https://guoqi.dev/atom.xml  → 301 →  https://blog.guoqi.dev/
```

**重定向把路径丢了**，后端拿到的是一整个 HTML 主页（而不是 feed），解析不出 title → 判失联。

**排查方法**（PowerShell）：

```powershell
Invoke-WebRequest -Uri "https://guoqi.dev/atom.xml" -MaximumRedirection 0 -ErrorAction SilentlyContinue
# 看 Location 是否丢路径
```

**修复**：把 `link.yml` 里该友链的地址直接改成跳转后的域名：

```yaml
# 改前
link: https://guoqi.dev/
# 改后
link: https://blog.guoqi.dev/
```

**规律**：`curl` 测一遍 301 的目标，用最终落地域名写进 link.yml，能少踩很多坑。

> 🔑 **关键认知**：`guoqi.dev` 并没有真失联——之前用 PowerShell 测试报 TLS 错误纯属 `.NET TLS 栈误报`（见坑 6）。真正的失联判定以后端 `error` 为准。

## 坑 2：后端抓不到友链（页面缺 cf- 属性）

**现象**：后端 `/friend` 只有几条，或 `friends_num` 少于 link.yml 的友链数。

**根因**：anzhiyu 主题默认 `flink.pug` 渲染的友链卡片**没有后端爬虫要定位的属性**：

- `.cf-friends-link`（友链卡片）
- `.cf-friends-avatar`（头像）
- `.cf-friends-name`（名字）

**修复**：见第 ① 篇——给卡片补 `cf-*` 属性，失联组也要补。

**验证**：后端重新爬取后 `/all` 的 `friends_num` 应等于 link.yml 总数。

## 坑 3：Cloudflare 构建失败 522

**现象**：CF Dashboard 构建记录：

```
npx wrangler deploy
Create wrangler.jsonc  (wrangler 走交互式创建流程)
GET /accounts/d64b1a.../workers/services/blog -> 522
Failed: error occurred while running deploy command
```

**根因**（两层）：
1. **部署产物仓库 main 分支没有 `wrangler.jsonc`** → wrangler 找不到配置，进入交互式创建
2. CF 平台偶发 522（另有 run 直接报 `an internal error occurred`）

**排查**：确认产物仓库根目录文件：

```bash
git ls-tree HEAD --name-only | grep wrangler   # 应该在产物仓库有
```

**处理**：
- 522 是平台问题 → Dashboard 手动 Retry 即可恢复
- 缺 `wrangler.jsonc` → 需要把 Worker 配置（`assets: { directory: "." }`）放进构建源分支，避免 wrangler 交互

**经验**：CF 的 Git 集成对**轮询** GitHub 判断"仓库更新了没"，不是 webhook 即时推送，所以有时有延迟。判断"是否触发"要看 Dashboard 的 **Deployments 列表**，而不是只看线上缓存。

## 坑 4：朋友圈管理面板"登不进去"

**现象**：朋友圈 footer 点「设置」→ 弹「友链朋友圈管理面板，首次登录输入的密码将成为你的管理密码」→ 输入任何密码都提示登录失败。

**真相**：**不是密码问题**。

前端 bundle `@1.1.2` 带管理面板，它调用：

```js
POST {api}/login   // body: { password: "xxx" }
```

但你的后端 fork（workspace 版本 6.0.6）**路由里根本没有 `/login`**：

```rust
Router::new()
    .route("/all", get(...))
    .route("/friend", get(...))
    .route("/post", get(...))
    .route("/randompost", get(...))
    .route("/randomfriend", get(...))
    .route("/summary", get(...))
    .route("/version", get(...))
    .route("/docs", get(...))
    .route("/swagger.json", get(...))
```

→ 请求打到 404 → 前端"登录失败"。

**处理**：后端版本不支持管理面板，且管理能力（维护友链/数据库）对个人博客意义不大，**隐藏入口**即可（见第 ② 篇：`managePanelShowSwitch` 改 no-op + 隐藏 `.cf-setting-btn`）。

## 坑 5：GitHub Actions 数据中心 IP 被友链站屏蔽

**现象**：检测脚本本地跑全 OK，但在 Actions 里 `akilar.top` 被判定失联。

**排查**：在 Actions runner 环境访问与本地访问结果不同：

```
本地 Windows（家里/公司 IP）→ 200 OK
GitHub Actions runner（数据中心 IP）→ 连接失败
后端 Vercel 环境 → 200 OK
```

**根因**：`akilar.top` 对数据中心 IP 有防护。

**修复**：把检测逻辑从"本地 HTTP 探测"改为**读后端 `/friend` 的 error 字段**（后端环境能访问所有站）。详见第 ④ 篇。

**通用教训**：**"能不能访问"取决于探测者的网络环境**。探测源选错，自动化就会误报。选一个能访问全网的探测源（如 Vercel/无头浏览器云服务），让所有消费者（页面、CI）只读它的结论。

## 坑 6：PowerShell 报 TLS 错误是误报

**现象**：`Invoke-WebRequest https://guoqi.dev/` 报 TLS 握手失败，以为站点挂了。

**真相**：Windows PowerShell 5.1 的 `.NET` 默认只开 TLS 1.0/1.1，很多现代站强制 TLS 1.2+：

```powershell
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
```

**判断"站到底活没活"的优先级**：
1. 浏览器访问（最真实）
2. 后端 `error` 字段（权威，Vercel 环境）
3. curl / Node https（独立于 .NET 栈）
4. PowerShell 自带命令（最后，易误报）

## 坑 7：deploy 永远 skipped（job outputs 未暴露）

**现象**：workflow 里 `deploy` job 一直 `skipped`，明明 `check` 检测到变化并提交了。

**根因**：GitHub Actions 中 job 级 `outputs` 需要显式声明：

```yaml
jobs:
  check:
    outputs:
      changed: ${{ steps.check.outputs.changed }}
```

否则 `needs.check.outputs.changed` 恒为空 → `if` 永不成立。

**修复**：在 `check` job 顶层加 `outputs:` 映射。（详见第 ④ 篇）

## 坑 8：git init 默认 master 分支，push main 失败

**现象**：

```
error: src refspec main does not match any
```

**根因**：Actions runner 的 `git init` 默认分支是 `master`，而后面 `git push ... main`。

**修复**：`git init` 后紧跟 `git branch -m main`。

## 排查工具箱汇总

```bash
# 1. 后端数据是否正常
curl https://fc.weiguang.eu.org/all
curl https://fc.weiguang.eu.org/friend

# 2. 友链页是否被后端抓全（friends_num 对比）
# 3. 友链站重定向是否丢路径
curl -sI https://example.com/atom.xml | findstr /i location

# 4. Actions run 状态
gh run list -R orchidsd/hexo-blog --workflow friend-check.yml
gh run view --job <job_id> --log

# 5. 线上是否最新（看 CF Dashboard Deployments，而非缓存）
# 6. 生产构建是否 OK
npx hexo clean && npx hexo ge
```

> 碰到"失联/抓不到/登不进"，按这个顺序查：**后端 error → 友链页模板属性 → 重定向 → 探测环境**。绝大多数问题都在这四层里。
