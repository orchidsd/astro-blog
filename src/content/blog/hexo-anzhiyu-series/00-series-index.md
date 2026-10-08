---
title: Hexo anzhiyu 主题深度定制系列 — 导航目录与全系列汇总
date: '2026-07-30 08:00:00'
tags:
  - Hexo
  - anzhiyu
  - 系列教程
categories:
  - 技术分享
ai: true
description: Hexo anzhiyu 主题深度定制全系列 10 篇文章导航目录，涵盖环境版本锁定、51.LA 统计、AI 摘要、相册系统、主题升级与补丁策略、杂项配置、CI/CD 部署、TOC 魔改、密钥安全、质量门禁与部署验证的完整知识体系。
pubDate: '2026-07-30 08:00:00'
---

## 系列简介

本系列从 **零基础搭建** 到 **生产级运维**，把 Hexo + anzhiyu 主题的核心定制全拆解。每篇聚焦一个功能域，**配置即生效、源码级拆解、避坑指南、升级零冲突**。

> **适用版本**：Hexo 7.x + anzhiyu v1.7.1+  
> **配套仓库**：`https://github.com/yourname/blog`（含完整配置、Scripts、Workflows、Patches）

---

## 📚 全系列目录

| 篇 | 标题 | 核心内容 | 阅读建议 |
|----|------|----------|----------|
| **①** | [环境版本锁定、目录结构设计与零冲突升级策略](https://blog.weiguang.eu.org/2026/07/30/hexo-anzhiyu-series/01-environment-structure/) | Node/pnpm/Hexo/主题版本锁、Submodule 管理、覆盖层设计、升级 SOP、Scripts 工具箱 | **必读第一篇**，奠定全系列工程化基石 |
| **②** | [51.LA 双 SDK 统计与 AI 摘要三模式全解析](https://blog.weiguang.eu.org/2026/07/30/hexo-anzhiyu-series/02-statistics-ai-abstract/) | 流量+性能监控动态注入、`autoTrack/hashMode`、AI 摘要 local/tianli/openai、24h 缓存、脚手架自动化 | 统计与 AI 是体感最强两大功能，**建议紧跟第一篇** |
| **③** | [相册系统全解析：Type 1/2/3 三种布局 + Pixiv 专辑实战](https://blog.weiguang.eu.org/2026/07/30/hexo-anzhiyu-series/03-album-system/) | `album.yml` 数据结构、瀑布流/画廊/时间轴三模式、模板分发、Pixiv 新增全步骤 | 相册是 anzhiyu 亮点，**独立阅读也无压力** |
| **④** | [主题升级与 Patch 归档策略：从 v1.0.0 到 v1.7.1 实战](https://blog.weiguang.eu.org/2026/07/31/hexo-anzhiyu-series/04-theme-upgrade-patch/) | 项目架构、升级全流程、自定义修改清单、Patch 生成/应用、Git 命令详解、编码注意事项 | 以后每次升级主题前**必读**，零冲突升级 |
| **⑤** | [友链页顶部区块、底部版权栏、音乐页/时钟/代码注入等杂项配置](https://blog.weiguang.eu.org/2026/07/30/hexo-anzhiyu-series/05-link-footer-misc/) | `linkPageTop`、`footerBar.cc`、`comments: false`、`clock: false`、`inject` 双模式、`greetingBox`、`accesskey`、`dynamicEffect` | 零散高频配置打包，**按需查阅即可** |
| **⑥** | [部署与 CI/CD 终极指南：GitHub Actions + Cloudflare Pages、Secrets 管理、Submodule 升级流程、自动生成配置](https://blog.weiguang.eu.org/2026/07/30/hexo-anzhiyu-series/06-deployment-cicd/) | 双轨部署、Secrets 注入、本地合并脚本、域名接入 Cloudflare、回滚 SOP、维护清单 | **上线前必读**，把前面所有配置落地成自动化流水线 |
| **⑦** | [侧边栏目录仿 anheyu 风格魔改实录](https://blog.weiguang.eu.org/2026/08/09/hexo-anzhiyu-series/07-toc-style/) | 标题计数胶囊、blur 半透明非活跃态、主题色 active 高亮指示条、6px 滚动条、puppeteer 对比验证、patch 重生成 | 想改目录外观**必读**，魔改→验证→归档闭环 |
| **⑧** | [API Key 安全注入与 Gitleaks 泄漏扫描修复实录](https://blog.weiguang.eu.org/2026/08/09/hexo-anzhiyu-series/08-api-key-security/) | `before_generate` filter priority 100 注入、`.gitleaks.toml` 豁免公共 key、GitHub Secret 传递、key 轮换与三层验证 | **安全必修**，所有密钥入库问题的标准解法 |
| **⑨** | [CI 质量门禁四道检查](https://blog.weiguang.eu.org/2026/08/09/hexo-anzhiyu-series/09-quality-ci/) | build/泄漏扫描/Lighthouse/死链检测四 job 并行、artifact 产物共享、自写死链检查器设计决策 | 想给博客加质量护栏**必读** |
| **⑩** | [部署三层验证 SOP](https://blog.weiguang.eu.org/2026/08/09/hexo-anzhiyu-series/10-deploy-verify/) | 源码→产物仓库→线上逐层验证、特征串 grep、Workers 轮询时序、部署锁冲突自救 | **每次上线后必读**，杜绝「push 成功但没上线」 |

---

## 🎯 学习路径推荐

```
新手/初次搭建
    │
    ▼
① 环境与结构  ──► 搭建骨架、跑通本地
    │
    ▼
② 统计与 AI   ──► 落地核心体感功能
    │
    ├─► ③ 相册系统 （按需，有相册需求再看）
    │
    ├─► ④ 主题升级 （每次升级前先看）
    │
    ├─► ⑤ 杂项配置 （按需，逐项勾选）
    │
    ▼
⑥ CI/CD 部署  ──► 一键上线、自动化运维
    │
    ▼
⑦~⑩ 进阶篇    ──► 目录魔改 / 密钥安全 / 质量门禁 / 上线验证
```

---

## 🛠️ 核心配置文件速查表

| 文件 | 角色 | 关键段落 |
|------|------|----------|
| `_config.anzhiyu.yml` | **主配置入口** | `LA`、`post_head_ai_description`、`linkPageTop`、`footerBar`、`menu.nav.clock`、`inject`、`greetingBox`、`dynamicEffect`、`CDN` |
| `_config.anzhiyu.template.yml` | 非敏感默认值模板 | 除 Key/ID 外的所有业务配置 |
| `_config.anzhiyu.local.yml` | 本地敏感值（.gitignore） | `LA.ck`、`LA.LingQueMonitorID`、`openai.apiKey` |
| `source/_data/album.yml` | 相册数据源 | 三类 Type 结构、Pixiv 分组 |
| `source/link/index.md` | 友链页入口 | `type: link` + `comments: true` |
| `source/copyright/index.md` | 版权协议页 | CC BY-NC-SA 4.0 文本 |
| `source/pixiv/index.md` | Pixiv 专辑入口 | `type: album_detail` + `album: Pixiv` |
| `source/music/index.md` | 音乐页 | `comments: false` |
| `scaffolds/post.md` | 新文脚手架 | `ai: true` |
| `source/css/custom.css` | 样式覆盖层 | 全局微调 |
| `source/js/custom.js` | 脚本覆盖层 | pjax 回调、外链 noopener |

---

## ⚡ 快速开始（5 分钟跑通）

```bash
# 1. 克隆带子模块
git clone --recurse-submodules --depth=1 https://github.com/yourname/blog.git
cd blog

# 2. 一键初始化（需 Node 20+、corepack）
./scripts/bootstrap.sh

# 3. 填入本地密钥
vim _config.anzhiyu.local.yml

# 4. 启动预览
pnpm run dev
# http://localhost:4000
```

---

## 🔐 敏感信息管理原则

| 环节 | 做法 |
|------|------|
| **本地开发** | `_config.anzhiyu.local.yml`（`.gitignore`）+ `pnpm run config:merge` |
| **CI 构建** | GitHub Secrets → `deploy.yml` heredoc 或合并脚本注入 |
| **生产部署** | Cloudflare Pages 环境变量 / Workers KV 存 Key |
| **轮换策略** | 季度轮换 AI Key、51.LA ID，更新 Secrets 后手动触发部署 |

---

## 🔄 主题升级 SOP（3 分钟）

```bash
# 1. 替换主题文件为最新版
rm -rf themes/anzhiyu
# 下载新版 zip 解压到 themes/anzhiyu/

# 2. 应用自定义 patch
git apply patches/anzhiyu-customizations.patch
# 如有冲突: git apply --reject patches/anzhiyu-customizations.patch

# 3. 生成新 patch 存档
git diff -- themes/anzhiyu/ > patches/anzhiyu-customizations.patch

# 4. 本地验证
pnpm run build

# 5. 提交
git add -A
git commit -m "chore: upgrade anzhiyu to vX.X.X"
git tag vX.X.X
git push origin main --tags

# 6. 部署
hexo cl && hexo ge && hexo d
```

> 详细步骤见 **[④ 主题升级与 Patch 归档策略](https://blog.weiguang.eu.org/2026/07/31/hexo-anzhiyu-series/04-theme-upgrade-patch/)**

---

## 📦 配套资源

| 资源 | 地址 |
|------|------|
| 完整配置仓库 | `https://github.com/yourname/blog` |
| anzhiyu 官方文档 | `https://anzhiyu-c.github.io/` |
| 51.LA JS SDK 文档 | `https://www.51.la/docs/js-sdk/` |
| TianliGPT API | `https://tianli.gpt.api/` |
| Creative Commons 选择器 | `https://creativecommons.org/choose/` |
| Cloudflare Pages 文档 | `https://developers.cloudflare.com/pages/` |

---

## 💡 系列设计初衷

> **「把配置过程文档化，就是把经验沉淀为资产。」**

- 每篇 **配置在前、源码在后、避坑在尾**，既可当教程读，也可当字典查
- 所有改动**不侵入主题源码**，升级主题只需移动 Submodule 指针
- 敏感信息**全链路隔离**，本地/CI/生产三套环境各管各的
- 覆盖层（`custom.css/js`、`source/_layout/`）**显式可追踪**，Patch 归档

---

## 📬 反馈与共建

- 发现错误/过时配置 → 提 Issue / PR
- 有新玩法/新坑 → 评论区分享
- 想加新功能 → 对照系列结构，定位对应篇章扩展

---

**收藏本文 = 拿到全系列导航地图。**  
祝你的 anzhiyu 博客：**好看、好用、好维护、好传播！** 🚀