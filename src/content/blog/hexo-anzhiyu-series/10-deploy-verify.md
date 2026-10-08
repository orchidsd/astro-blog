---
title: Hexo anzhiyu 主题深度定制系列（十）：部署三层验证 SOP
date: '2026-08-09 13:00:00'
tags:
  - Hexo
  - anzhiyu
  - CI/CD
  - 教程
categories:
  - 技术分享
ai: true
description: push 成功不代表上线成功：源码仓库、部署产物仓库、线上 CDN 三层逐层验证的标准化流程，配合 curl/git 命令与 Cloudflare Workers 轮询特性，杜绝「看着绿了其实没上」。
pubDate: '2026-08-09 13:00:00'
---

## 开头：那个「push 成功」的错觉

曾有一段时期，每次发完文章 `git push` 显示 `main -> main` 就关终端。后来有人在评论区说「文章没更新」——本地确实构建过了，CI 也绿了，**为什么线上还是旧的？**

排查发现：本仓库是「源码仓库 → GitHub Actions 构建 → 推送部署产物仓库 → Cloudflare Workers 轮询 → 线上域名」四段链路，任何一段卡住都会造成「push 成功但线上没变」。本文把这套链路的**逐层验证法**沉淀为 SOP：以后每次上线，三层各验一遍。

## 目标声明 + 前置条件

本文带你完成：每次 push 后 5 分钟内，确认「源码已推 → CI 已构建 → 产物仓库已更新 → 线上已生效」四件事全部为真，并用 grep 特征串逐层核对。

**前置条件：**

- [x] 本仓库架构：`hexo-blog`（源码）→ Actions → `orchidsd.github.io`（产物）→ Cloudflare Workers → `blog.weiguang.eu.org`
- [x] 已掌握 `curl.exe`、`git clone --depth 1`
- [x] 能登录 GitHub 网页看 Actions（API 可能被墙，优先用 git/curl）

**你将学会：**

1. 三层验证：源码 → 产物仓库 → 线上
2. 用「特征串」替代肉眼比对
3. Cloudflare Workers 轮询 vs webhook 的时序差异
4. 部署锁冲突等常见故障自救

---

## Step 1：验证源码已推送（第一层）

> 目的：确认本次提交真的到了远端。做完这步远端 HEAD == 本地 HEAD。

**操作：**

```bash
git push origin main
git log --oneline -1 origin/main    # 远端 HEAD
git log --oneline -1                 # 本地 HEAD，两者应一致
```

**预期输出：** push 输出 `main -> main`；两个 HEAD 哈希相同。

> ⚠️ **报错排查**：push 报 `rejected (fetch first)` 说明远端有别人（或 PagesCMS）的新提交——先 `git fetch origin main` 再 `git pull --rebase origin main` 重推，**禁止 force-push**。

---

## Step 2：验证 CI 已构建并推送产物仓库（第二层）

> 目的：确认 Actions 的 Deploy 工作流真的跑了、真的把 `public/` 推到了产物仓库。做完这步产物仓库出现新 commit。

**操作：** 浅克隆产物仓库到临时目录，grep 本次改动的「特征串」：

```powershell
# 临时目录克隆（产物仓库只留最新）
git clone --depth 1 https://github.com/orchidsd/orchidsd.github.io.git C:\Users\ADMINI~1\AppData\Local\Temp\opencode\prod-check
cd C:\Users\ADMINI~1\AppData\Local\Temp\opencode\prod-check
git log --oneline -1                      # 产物仓库 HEAD commit 时间应晚于源码 push 时间
# grep 本次改动特征串：例如本次加了 folding-tag / 改了 TOC 样式
Select-String -Path link\index.html -Pattern "telescopic-site-card-group" -Quiet
```

**预期输出：** 产物仓库 HEAD 时间 > 源码 push 时间；特征串在产物 HTML 里命中；旧特征（若本次是删除/修改）应消失。

> ⚠️ **报错排查**：产物仓库没更新 = CI 挂了，去源码仓库 Actions 看 Deploy Site 日志（常见：`npm ci` 依赖问题、主题 styl 语法错误）。产物仓库 `.deploy_git` 有 index.lock 时本地部署会失败，删锁重试（仅本地部署场景）。

---

## Step 3：验证线上生效（第三层）

> 目的：确认 Cloudflare Workers 已同步产物仓库、域名可访问、特征生效。做完这步线上 == 产物。

**操作：**

```powershell
# 注意：必须 -L 跟随重定向（weiguang.eu.org 是 301 到 blog.weiguang.eu.org）
curl.exe -sL https://blog.weiguang.eu.org/posts/xxx/ | Select-String "特征串" -Quiet
curl.exe -sL https://blog.weiguang.eu.org/ | Select-String "旧特征"   # 应无结果
```

**预期输出：** 新特征命中、旧特征消失。

> ⚠️ **报错排查**：产物仓库已更新但线上还是旧 —— Cloudflare Workers 的 Git 集成是**轮询不是 webhook**，改完要**等数十秒到数分钟**再抓取，别急着下结论。

---

## 检查点：验证整体效果

> 全部勾选通过 = 本次发布完成。

- [x] 远端 HEAD == 本地 HEAD
- [x] 产物仓库 HEAD 晚于源码 push，特征串命中
- [x] 线上新特征命中、旧特征消失
- [x] 若本次删了页面/文件：产物里对应页面不存在（无 404 残留）

---

## 常见问题（FAQ）

| 问题 | 原因 | 解决 |
|------|------|------|
| push 被拒 | 远端有新提交 | fetch + rebase 再推，禁 force |
| 产物仓库没更新 | CI 失败 | 看 Actions 日志（npm ci / styl 语法） |
| 产物更新了线上没变 | Workers 轮询延迟 | 等数十秒再 curl，不是 bug |
| 本地部署锁冲突 | `.deploy_git/.git/index.lock` 残留 | 删除后重试 `hexo d` |
| API 被墙看不到 Actions | 网络环境 | 用 git clone 产物仓库代替 API 验证 |

---

## 总结

「push 成功」只是起点，四段链路里最容易被忽略的是产物仓库层。核心要点：

1. **三层都验**：源码、产物仓库、线上缺一不可
2. **特征串代替肉眼**：每次改动记一个特征，grep 可复现
3. **轮询要等**：Cloudflare Workers 是轮询同步，延迟正常
4. **删文件先查引用**：删 `source/` 任何文件前，全量查 `_config*.yml`、主题模板、`_data/*.yml` 的 path_name/link 引用，否则线上 404

**延伸阅读：**

- [上一篇：CI 质量门禁四道检查](https://blog.weiguang.eu.org/2026/08/09/hexo-anzhiyu-series/09-quality-ci/)
- [系列导航](https://blog.weiguang.eu.org/2026/07/30/hexo-anzhiyu-series/00-series-index/)
- [Cloudflare Workers 文档](https://developers.cloudflare.com/workers/)
