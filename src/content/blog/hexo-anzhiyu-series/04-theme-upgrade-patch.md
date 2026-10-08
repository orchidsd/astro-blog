---
title: 安知鱼主题升级与 Patch 归档策略
description: 详解 anzhiyu 主题的版本升级流程、patch-package 定制补丁的生成与归档策略，避免升级后定制丢失。
date: '2026-07-31 18:00:00'
tags:
  - 安知鱼
  - 主题
  - 升级
  - git
  - Hexo
  - anzhiyu
  - 系列教程
ai: true
pubDate: '2026-07-31 18:00:00'
---

## 一、项目架构

```
博客源码 (orchidsd/hexo-blog)
  ├── _config.anzhiyu.yml      ← 主题配置（51.LA、AI摘要、PWA等）
  ├── source/                   ← 文章、页面、自定义资源
  │   ├── _posts/               ← 博客文章
  │   ├── _data/                ← 友链、相册、关于我数据
  │   ├── css/custom.css        ← 背景模糊去除等样式覆盖
  │   ├── manifest.json         ← PWA Web 清单
  │   ├── img/siteicon/         ← PWA 图标
  │   └── copyright/, pixiv/    ← 自定义页面
  ├── themes/anzhiyu/           ← 安知鱼主题源码（直接下载，非子模块）
  ├── patches/                  ← 自定义补丁存档
  │   ├── anzhiyu-customizations.patch
  │   └── upgrade-theme.sh
  └── hexo-offline.config.cjs   ← Workbox PWA 缓存规则

         │ hexo d
         ▼
orchidsd/orchidsd.github.io (部署产物 /public)
         │
         ▼
Cloudflare Workers → weiguang.eu.org / blog.weiguang.eu.org
```

## 二、快速升级（交互式脚本）

Linux/macOS 可直接运行升级脚本：

```bash
bash patches/upgrade-theme.sh
```

脚本会：
1. 获取远程标签列表
2. 让你输入目标版本号（如 `1.8.0`）
3. 自动下载解压新版本到 `themes/anzhiyu/`
4. 自动应用 `patches/anzhiyu-customizations.patch`
5. 提示提交

Windows 环境请按 §三 手动操作。

## 三、手动升级全流程（v1.0.0 → v1.7.1）

### 3.1 准备工作
```bash
# 备份当前主题（保险）
cp -r themes/anzhiyu themes/anzhiyu.bak

# 下载最新版
curl -L https://github.com/anzhiyu-c/hexo-theme-anzhiyu/archive/refs/tags/1.7.1.zip -o anzhiyu-1.7.1.zip
# 解压到 themes/anzhiyu/
```

### 3.2 替换主题文件
```bash
# 删除旧版，放入新版
rm -rf themes/anzhiyu
unzip anzhiyu-1.7.1.zip -d /tmp/anzhiyu-extracted
mv /tmp/anzhiyu-extracted/hexo-theme-anzhiyu-1.7.1 themes/anzhiyu
```

此时 `themes/anzhiyu/` 是干净的官方 1.7.1，**所有自定义全部丢失**。

### 3.3 应用自定义 Patch
```bash
git apply patches/anzhiyu-customizations.patch
```

如果成功，自定义全部恢复。如果冲突：
```bash
git apply --reject patches/anzhiyu-customizations.patch
# 查看 .rej 文件手动合并
```

### 3.4 自定义修改清单（6个文件）
| 文件 | 修改内容 |
|------|----------|
| `layout/includes/anzhiyu/ai-info.pug` | 添加 `else if mode == "openai"` 标签 |
| `layout/includes/header/post-info.pug` | 移除 `!comments.lazyload` 守卫，始终渲染阅读量/评论数 |
| `layout/includes/third-party/comments/waline.pug` | 添加 reaction/emoji/locale/pageSize；移除 `lazyload` 对 pageview/comment 的禁用 |
| `scripts/events/merge_config.js` | 添加 openai 默认配置块 |
| `source/js/anzhiyu/ai_abstract.js` | 添加完整 OpenAI 模式（含缓存、刷新清缓存） |
| `source/js/main.js` | statistics51aInit 添加 LA51 配置守卫 |

### 3.5 更新 Patch 存档

> **注意**：Windows 上 `git diff -- themes/anzhiyu/ > patch` 会输出 UTF-16LE（含 BOM），git 无法识别。必须用以下方法之一：

**方法 A（Git Bash / WSL）：**
```bash
git diff -- themes/anzhiyu/ > patches/anzhiyu-customizations.patch
```

**方法 B（PowerShell，推荐）：**
```powershell
.\patches\generate-patch.ps1
```

脚本会自动拉取干净版 → 建临时仓库 → 生成 UTF-8 无 BOM 的 patch。

## 四、Git 提交与 Tag

```bash
git add -A
git commit -m "chore: upgrade anzhiyu theme to v1.7.1, add custom patches"
git tag v1.1.0
git push origin main --tags
```

## 五、未来升级步骤

快速方式（Linux/macOS）：
```bash
bash patches/upgrade-theme.sh
```

手动方式（跨平台）：
```bash
# 1. 备份当前修改
git add -A && git commit -m "backup before upgrade"

# 2. 下载新版替换
rm -rf themes/anzhiyu
# 下载解压新版到 themes/anzhiyu/

# 3. 应用 patch
git apply patches/anzhiyu-customizations.patch

# 4. 如冲突，手动合并 .rej 文件
git apply --reject patches/anzhiyu-customizations.patch

# 5. 提交
git add -A
git commit -m "chore: upgrade anzhiyu to vX.X.X"
git tag vX.X.X
git push origin main --tags

# 6. 构建部署
hexo cl && hexo ge && hexo d
```

> 新增自定义时：修改主题文件 → 运行 `.\patches\generate-patch.ps1` 重新生成 patch 存档。

## 七、涉及 Git 命令详解

| 命令 | 作用 |
|------|------|
| `git apply file.patch` | 应用 patch |
| `git apply --reject file.patch` | 模糊应用，冲突部分生成 .rej |
| `git diff --cached` | 查看已暂存的变更 |
| `git diff --stat` | 查看修改文件统计 |
| `git add -A` | 暂存所有变更 |
| `git commit -m "msg"` | 提交 |
| `git tag v1.1.0` | 打标签 |
| `git push origin main --tags` | 推送分支和所有标签 |

## 八、关键注意事项

1. **Patch 编码**：Windows PowerShell 的 `>` 默认输出 UTF-16LE（含 BOM），git 无法识别。用 `patches/generate-patch.ps1` 可自动处理。
2. **Patch 基准**：patch 必须基于**干净官方版**生成，而非对比旧版。`generate-patch.ps1` 自动拉取干净版处理。
3. **新增自定义**：改完主题文件后运行 `.\patches\generate-patch.ps1` 重新生成 patch。

## 九、本次升级变更统计

```
72 files changed, 8012 insertions(+), 559 deletions(-)
```

其中自定义 patch 6 个文件，+118/-13 行：

| 文件 | 变更统计 |
|------|---------|
| `ai-info.pug` | +2 行（openai 标签） |
| `post-info.pug` | +4/-4（移除 lazyload 守卫） |
| `waline.pug` | +10/-6（reaction/emoji/去守卫） |
| `merge_config.js` | +8 行（openai 默认配置） |
| `ai_abstract.js` | +105/-2（OpenAI 模式） |
| `main.js` | +2 行（LA51 守卫） |

## 十、相关文件

| 文件 | 作用 |
|------|------|
| `patches/anzhiyu-customizations.patch` | 自定义补丁（未来升级用） |
| `patches/upgrade-theme.sh` | 交互式升级脚本（Linux/macOS） |
| `patches/generate-patch.ps1` | 重新生成 patch（Windows） |
