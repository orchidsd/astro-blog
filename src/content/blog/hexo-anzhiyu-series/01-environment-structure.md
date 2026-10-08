---
title: Hexo anzhiyu 主题深度定制系列（一）：环境版本锁定、目录结构设计与零冲突升级策略
date: '2026-07-30 09:00:00'
tags:
  - Hexo
  - anzhiyu
  - 博客搭建
  - 主题定制
categories:
  - 技术分享
ai: true
description: 奠定全系列基石：Node/pnpm/Hexo/主题版本锁定、Git Submodule 管理主题源码、自定义覆盖层设计、以及「升级主题零冲突」的标准化流程。
pubDate: '2026-07-30 09:00:00'
---

## 前言

**「环境可复现、结构可维护、升级零冲突」** 是本系列所有后续实战的前提。这篇不谈花哨功能，只把地基打牢。

---

## 1. 环境版本锁定（告别「我机器上能跑」）

### 1.1 版本矩阵

| 组件 | 版本 | 锁定方式 | 升级策略 |
|------|------|----------|----------|
| **Node.js** | 20.18.0 (LTS) | `.nvmrc` + `volta` / `fnm` | 仅 LTS 切换，配合 CI 矩阵测试 |
| **pnpm** | 9.12.0 | `packageManager` 字段 + `corepack` | Minor 版本随时升，Major 看破坏性变更 |
| **Hexo** | 7.3.0 | `package.json` `dependencies.hexo: ^7.3.0` | 按需升，配套插件同步 |
| **anzhiyu 主题** | v1.7.1 | **Git Submodule 指向 tag** | 手动 `git submodule update --remote` + 变更日志审阅 |

### 1.2 关键文件

**`.nvmrc`**
```text
20.18.0
```

**`package.json` 关键片段**
```json
{
  "packageManager": "pnpm@9.12.0",
  "engines": { "node": ">=20.18.0" },
  "dependencies": {
    "hexo": "^7.3.0",
    "hexo-cli": "^4.3.0",
    "hexo-renderer-pug": "^3.0.0",
    "hexo-renderer-stylus": "^3.0.0",
    "hexo-generator-feed": "^3.0.0",
    "hexo-generator-sitemap": "^4.0.0",
    "hexo-generator-searchdb": "^2.0.0"
  },
  "devDependencies": {
    "pug": "^3.0.2",
    "stylus": "^0.63.0"
  },
  "scripts": {
    "clean": "hexo clean",
    "build": "hexo generate",
    "dev": "hexo server",
    "deploy": "hexo deploy",
    "lint": "markdownlint-cli2 \"source/_posts/**/*.md\"",
    "submodule:update": "git submodule update --remote --merge",
    "config:merge": "node scripts/merge-config.js"
  }
}
```

### 1.3 一键初始化新环境

```bash
# 新机器 / CI / 容器
corepack enable
corepack prepare pnpm@9.12.0 --activate
pnpm install --frozen-lockfile
git submodule update --init --recursive --depth=1
cp _config.anzhiyu.local.example.yml _config.anzhiyu.local.yml  # 填入密钥
pnpm run config:merge
pnpm run dev
```

> **核心原则**：`pnpm install --frozen-lockfile` 保证依赖树 100% 复现；`corepack` 让 pnpm 版本随仓库走，无需全局安装。

---

## 2. 仓库目录结构设计

```
blog/                              # 博客仓库根目录
├── .github/
│   └── workflows/
│       └── deploy.yml             # CI/CD 流水线
├── _config.yml                    # Hexo 主配置（极简）
├── _config.anzhiyu.yml            # 主题配置（主改动入口，90% 需求在这解决）
├── _config.anzhiyu.template.yml   # 非敏感基础配置模板
├── _config.anzhiyu.local.yml      # 本地敏感配置（.gitignore 忽略）
├── package.json
├── pnpm-lock.yaml
├── .nvmrc
├── .gitignore
├── .gitmodules
├── scripts/
│   ├── merge-config.js            # 本地配置合并脚本
│   └── bootstrap.sh               # 一键初始化脚本
├── scaffolds/
│   └── post.md                    # 文章脚手架（预置 ai: true 等）
├── source/
│   ├── _posts/                    # 文章源文件
│   ├── _data/
│   │   └── album.yml              # 相册数据源
│   ├── _posts/hexo-anzhiyu-series/  # 系列文专用目录
│   ├── link/index.md              # 友链页
│   ├── music/index.md             # 音乐页
│   ├── pixiv/index.md             # Pixiv 专辑页
│   ├── copyright/index.md         # 版权协议页
│   ├── css/custom.css             # 全局样式微调（覆盖层）
│   └── js/custom.js               # 全局脚本扩展（覆盖层）
└── themes/
    └── anzhiyu/                   # Git Submodule → anzhiyu-c/hexo-theme-anzhiyu@v1.7.1
```

### 2.1 设计理由

| 目录/文件 | 定位 | 变更频率 | 谁改 |
|-----------|------|----------|------|
| `_config.yml` | Hexo 核心 | 低 | 初始化一次 |
| `_config.anzhiyu.yml` | **主题业务配置** | **高** | **日常维护主战场** |
| `_config.anzhiyu.template.yml` | 非敏感默认值 | 中 | 升级主题时同步 |
| `_config.anzhiyu.local.yml` | **敏感值**（Key、ID） | 中 | 本地/CI 注入 |
| `source/css/custom.css` | 样式覆盖层 | 低 | 微调 UI |
| `source/js/custom.js` | 脚本覆盖层 | 低 | 埋点、第三方 SDK |
| `themes/anzhiyu/` | **主题源码（只读）** | 仅升级时 | **严禁直接改** |
| `scaffolds/post.md` | 新文模板 | 低 | 定型后不动 |

> **黄金法则**：**能在 `_config.anzhiyu.yml` 解决的绝不碰源码；必须改源码时，优先在 `source/css|js/custom.*` 覆盖；实在要改模板，记录 Patch 方便升级合并。**

---

## 3. Git Submodule 管理主题源码

### 3.1 初始化添加

```bash
cd blog
git submodule add -b v1.7.1 --depth=1 https://github.com/anzhiyu-c/hexo-theme-anzhiyu.git themes/anzhiyu
git commit -m "chore: add anzhiyu theme as submodule v1.7.1"
```

### 3.2 `.gitmodules` 自动生成

```ini
[submodule "themes/anzhiyu"]
	path = themes/anzhiyu
	url = https://github.com/anzhiyu-c/hexo-theme-anzhiyu.git
	branch = v1.7.1
```

> `--depth=1` 浅克隆，节省空间和时间；指定 `branch = v1.7.1` 锁定版本。

### 3.3 克隆时自动拉取子模块

```bash
# 完整克隆
git clone --recurse-submodules --depth=1 https://github.com/yourname/blog.git

# 或已克隆后补拉
git submodule update --init --recursive --depth=1
```

### 3.4 CI 中必须开启 Submodule

```yaml
# .github/workflows/deploy.yml
- uses: actions/checkout@v4
  with:
    submodules: recursive
    submodule-depth: 1
```

---

## 4. 自定义覆盖层：零侵入修改主题

### 4.1 样式覆盖（`source/css/custom.css`）

```css
/* 示例：调整文章内容行高、代码块圆角、相册间距 */
#post-content :where(p, li) { line-height: 1.85; }
.highlight, .code-block { border-radius: 8px !important; }
.album-type1 { column-gap: 16px; }

/* 深色模式微调 */
[data-theme=dark] #post-content { color: #e4e4e4; }
```

**生效原理**：Hexo 渲染时 `source/css/custom.css` 会被主题 `inject.head` 最后引入，优先级最高。

### 4.2 脚本覆盖（`source/js/custom.js`）

```javascript
// 示例：pjax 完成后重新初始化 51.LA、AI 摘要、相册 Swiper
document.addEventListener('pjax:complete', () => {
  window.statistics51aInit?.();
  window.AIAbstract?.init?.();
  document.querySelectorAll('.gallery-swiper').forEach(el => {
    if (!el.swiper) new Swiper(el.querySelector('.swiper-container'), { /* opts */ });
  });
});

// 批量给外链加 rel="noopener noreferrer"
document.querySelectorAll('a[href^="http"]:not([href*="' + location.host + '"])')
  .forEach(a => a.rel = 'noopener noreferrer');
```

### 4.3 模板覆盖（仅当配置不够用时）

Hexo 主题查找顺序：`source/_layout/` > `themes/anzhiyu/layout/`。

```bash
# 需要覆盖 album_detail.pug 时
mkdir -p source/_layout/includes/page
cp themes/anzhiyu/layout/includes/page/album_detail.pug source/_layout/includes/page/
# 修改 source/_layout/.../album_detail.pug
```

> **记录 Patch**：`git diff themes/anzhiyu/layout/includes/page/album_detail.pug source/_layout/includes/page/album_detail.pug > patches/album_detail.patch`，升级时 `git apply patches/album_detail.patch`。

---

## 5. 零冲突升级主题标准流程（SOP）

### 5.1 升级前准备

```bash
cd themes/anzhiyu
git fetch origin --tags
git log --oneline -20  # 看最新 tag
```

### 5.2 执行升级

```bash
cd blog
# 1. 切换到新版本 tag（如 v1.8.0）
cd themes/anzhiyu
git checkout v1.8.0

# 2. 对比 merge_config.js 新增默认配置
cd ../..
git diff themes/anzhiyu/scripts/events/merge_config.js  # 关注新增字段

# 3. 同步新增默认值到 _config.anzhiyu.template.yml
#    （手动或脚本对比，补全缺失 key）

# 4. 提交子模块指针更新
cd ..
git add themes/anzhiyu
git commit -m "chore: upgrade anzhiyu to v1.8.0"

# 5. 本地验证
pnpm run config:merge && pnpm run build && pnpm run dev
```

### 5.3 升级后必检清单

| 检查项 | 命令/操作 |
|--------|-----------|
| 新增配置项已补全 | 对比 `merge_config.js` 与 `_config.anzhiyu.yml` |
| 自定义覆盖层仍生效 | `custom.css`、`custom.js` 样式/脚本无报错 |
| 模板 Patch 可用 | `git apply --check patches/*.patch` |
| 51.LA / AI 摘要 / 相册功能正常 | 本地访问对应页面 |
| CI 构建通过 | 推送触发 Actions 绿灯 |

### 5.4 回滚方案

```bash
# 子模块回滚到上一版本
cd themes/anzhiyu
git checkout v1.7.1
cd ..
git add themes/anzhiyu
git commit -m "revert: rollback anzhiyu to v1.7.1"
git push
```

> **全程零改主题源码**，升级只是移动子模块指针 + 同步默认配置，**冲突概率趋近 0**。

---

## 6. 常用脚本工具箱（`scripts/` 目录）

### 6.1 `merge-config.js`（已在 1.3 展示）

合并 `_config.anzhiyu.template.yml` + `_config.anzhiyu.local.yml` → `_config.anzhiyu.yml`。

### 6.2 `bootstrap.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail
echo "🚀 Bootstrapping Hexo anzhiyu blog..."
corepack enable && corepack prepare pnpm@9.12.0 --activate
pnpm install --frozen-lockfile
git submodule update --init --recursive --depth=1
[ -f _config.anzhiyu.local.yml ] || cp _config.anzhiyu.local.example.yml _config.anzhiyu.local.yml
echo "⚠️  Edit _config.anzhiyu.local.yml with your secrets!"
pnpm run config:merge
pnpm run build
echo "✅ Done! Run 'pnpm run dev' to start."
```

### 6.3 `new-post.sh`（可选，自动化封面+AI摘要）

```bash
#!/usr/bin/env bash
# 用法：./scripts/new-post.sh "文章标题" [分类]
TITLE="$1"
CAT="${2:-技术笔记}"
DATE=$(date '+%Y-%m-%d %H:%M:%S')
SLUG=$(echo "$TITLE" | iconv -t ascii//TRANSLIT | sed -E 's/[^a-zA-Z0-9]+/-/g' | sed -E 's/^-|-$//g' | tr '[:upper:]' '[:lower:]')
FILE="source/_posts/${SLUG}.md"

cat > "$FILE" <<EOF
---
title: $TITLE
date: $DATE
tags:
categories:
  - $CAT
cover: /images/cover/${SLUG}.webp
ai: true
description:
---
EOF
echo "✅ Created $FILE"
${EDITOR:-code} "$FILE"
```

---

## 7. 小结：这套骨架的核心价值

| 痛点 | 方案 | 收益 |
|------|------|------|
| 环境不一致 | `.nvmrc` + `packageManager` + `corepack` + `frozen-lockfile` | **全员/CI 100% 复现** |
| 主题升级冲突 | **Submodule 只读** + **配置/覆盖层分离** | **升级 = 移动指针 + 同步默认值** |
| 敏感信息泄露 | `local.yml` + CI Secrets + 合并脚本 | **Key 永不进仓库** |
| 自定义难维护 | `custom.css/js` + `source/_layout/` 覆盖层 | **改动可追踪、可回滚** |
| 新人上手慢 | `bootstrap.sh` 一键拉起 | **5 分钟跑通开发环境** |

---

## 8. 下一篇预告

**《51.LA 双 SDK 统计与 AI 摘要三模式全解析》**

- `js-sdk-pro` + `perf/js-sdk-perf` 动态注入实现
- `autoTrack` / `hashMode` / `sendSuspicious` 参数深度解析
- AI 摘要 `local` / `tianli` / `openai` 三模式代码级拆解
- 24h localStorage 缓存 + 刷新清缓存机制
- 脚手架 `ai: true` 自动化

敬请期待！