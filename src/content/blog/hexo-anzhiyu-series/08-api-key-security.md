---
title: Hexo anzhiyu 主题深度定制系列（八）：API Key 安全注入与 Gitleaks 泄漏扫描修复实录
date: '2026-08-09 11:00:00'
tags:
  - Hexo
  - anzhiyu
  - 安全
  - 教程
categories:
  - 技术分享
ai: true
description: AI 摘要 apiKey 曾明文入库被 Gitleaks 检出：如何用 before_generate filter 从环境变量注入、.gitleaks.toml 豁免公共 key、GitHub Secrets 传递，以及 key 轮换与验证的完整实战。
pubDate: '2026-08-09 11:00:00'
---

## 开头：CI 一夜之间全红

某天 push 完代码，GitHub Actions 的 Quality Checks 开始全红。点开日志：**Gitleaks（Scan for secrets）失败**，4 个 finding——其中一个赫然是真实可用的 AI 摘要 API Key `sk-bGhPtk5...`，明文躺在 `_config.anzhiyu.yml` 里，任何人 clone 仓库就能白嫖。

CI 帮我们抓到了「配置进仓库」这个长期隐患。本文记录完整的修复链路：**key 移出仓库 → 环境变量注入 → Gitleaks 白名单豁免 → GitHub Secret 传递 → 线上验证**，以后任何新 key 都可以照此办理。

## 目标声明 + 前置条件

本文带你完成：让仓库里**不再出现任何真实凭据**，Gitleaks 扫描 100% 通过，且 AI 摘要功能在本地/CI/线上三处都正常工作。

**前置条件：**

- [x] Hexo + anzhiyu 主题，开了 `post_head_ai_description`（openai 模式）
- [x] GitHub Actions 有 deploy + quality 两个工作流
- [x] 能登录 GitHub 网页设置 Secrets（轮换 key 需要）

**你将学会：**

1. Gitleaks 为什么能扫出 key、扫出了哪些
2. `before_generate` filter + priority 机制的正确用法
3. `.gitleaks.toml` 怎么「豁免该豁免的」公共 key
4. 完整验证链路：本地 → CI → 线上

---

## Step 1：摸清泄漏面

> 目的：知道到底哪些东西泄了、泄在哪。做完这步列出完整清单。

**操作：** 查看 Gitleaks 日志（Actions → Quality Checks → Scan for secrets → 展开发现列表），对照仓库定位：

```bash
# 本地也能扫：npx gitleaks detect --source . -v   （或 gitleaks-action 同款配置）
```

本次实际发现的 4 处：

| # | 位置 | 内容 | 处置 |
|---|------|------|------|
| 1 | `_config.anzhiyu.yml:1251` | AI 摘要 `openai.apiKey: sk-bGhPtk5...` | **真实 key，移出仓库 + 轮换** |
| 2 | `_config.anzhiyu.yml:1237` 注释 | 备用 key `sk-133p4g6...` | **同批次轮换，删除注释** |
| 3 | `_config.yml` | IndexNow `apikey` | 协议公钥，豁免 |
| 4 | 主题 `clock.pug`/`clock.min.js` | 和风天气 widget key、IP 定位 fallback key | 主题自带公共 key，豁免 |

> ⚠️ **报错排查**：Gitleaks 只查「仓库里的明文」，查不到「已轮换但历史 commit 里残留」的 key——泄漏过的 key 必须**轮换**，不是删了就完事。

---

## Step 2：key 移出仓库，改为环境变量注入

> 目的：源码里不出现 key，构建时从环境变量注入。做完这步 `git grep sk-` 应该一无所获。

**操作：** 新建 `scripts/inject-ai-key.js`，用 `before_generate` filter 注入：

```js
// 从环境变量注入 AI 摘要 API key，避免密钥入库
// 本地：$env:AI_ABSTRACT_API_KEY="sk-xxx" 后 npx hexo ge
// CI：GitHub Actions secret 注入（见 .github/workflows/*.yml）
// 用 before_generate filter + 高 priority：确保在 merge_config.js（priority 默认 10）合并之后执行
hexo.extend.filter.register("before_generate", () => {
  const key = process.env.AI_ABSTRACT_API_KEY;
  if (!key) return;
  const cfg = hexo.theme.config && hexo.theme.config.post_head_ai_description;
  if (!cfg || !cfg.openai) {
    hexo.log.warn("[inject-ai-key] 未找到 post_head_ai_description.openai 配置，跳过注入");
    return;
  }
  cfg.openai.apiKey = key;
  hexo.log.info("ai_abstract apiKey 已从环境变量注入");
}, 100);
```

然后删掉 `_config.anzhiyu.yml` 里的 `apiKey` 明文（置空），并把脚本放进 `scripts/**`（deploy/quality 的 CI 触发路径已含）。

**预期输出：** `npx hexo ge` 时日志出现 `ai_abstract apiKey 已从环境变量注入`（仅当设置了环境变量时）；`git grep -i "sk-" _config* scripts themes` 无结果。

> ⚠️ **报错排查**：**不要用 `generateBefore` 事件**——实测它在主题 `merge_config.js` 的 Object.assign 合并之前触发，注入会被覆盖；`before_generate` filter 默认 priority 10 也不够，必须用 `priority: 100` 保证最后执行。主题与项目 scripts 并行加载、顺序不定，这是本坑的根源。

---

## Step 3：Gitleaks 豁免「公共 key」

> 目的：让 Gitleaks 只报真泄漏，不报「协议要求公开」的值。做完这步 Gitleaks 白名单生效。

**操作：** 新建 `.gitleaks.toml`，把公共/非敏感 key 列入 allowlist：

```toml
# Gitleaks 配置：豁免非敏感/公开 key
# 这些值本就在主题或公开协议中，非真实凭据：
# - hexo_indexnow.apikey：IndexNow 协议公钥（需公开供搜索引擎验证）
# - clock.pug / clock.min.js：主题自带的和风天气 widget 与 IP 定位公共 key
[allowlist]
  description = "主题自带公共 key 与 IndexNow 公钥"
  [[allowlist.regular-expressions]]
    regex = '''1bd2e218b9604f3b9745214de362cd50'''
    description = "IndexNow 公钥（协议要求公开）"
  [[allowlist.regular-expressions]]
    regex = '''df245676fb434a0691ead1c63341cd94'''
    description = "和风天气 widget 主题自带公共 key"
  [[allowlist.regular-expressions]]
    regex = '''Kq1pRjB3WyDja7rhKcWV9f5QU8'''
    description = "IP 定位主题自带 fallback key"
```

quality.yml 指向这份配置：

```yaml
- name: Run Gitleaks
  uses: gitleaks/gitleaks-action@v2
  with:
    config-path: .gitleaks.toml
```

**预期输出：** Actions 里 Scan for secrets 显示这些 finding 不再出现。

> ⚠️ **报错排查**：豁免正则按「字面值」精确匹配，`regex = '''value'''` 三引号语法是 TOML literal string，不要用普通引号。

---

## Step 4：GitHub Secret 传递 + 本地注入

> 目的：CI 构建时把 key 注入环境变量。做完这步线上 AI 摘要恢复正常。

**操作：**

1. GitHub 仓库 → Settings → Secrets and variables → Actions，新增 Secret `AI_ABSTRACT_API_KEY`（填入**轮换后的新 key**）。
2. `deploy.yml` 的构建步骤注入：

```yaml
- name: Clean & Generate
  env:
    AI_ABSTRACT_API_KEY: ${{ secrets.AI_ABSTRACT_API_KEY }}
  run: npx hexo clean && npx hexo generate
```

3. 本地开发注入方式（不落盘到仓库）：

```powershell
$env:AI_ABSTRACT_API_KEY="sk-xxx"; npx hexo ge
```

**预期输出：** Actions Deploy 日志出现 `ai_abstract apiKey 已从环境变量注入`；线上文章页 AI 摘要正常生成。

> ⚠️ **报错排查**：Secret 设完不用重建，push 一次或 workflow_dispatch 重跑即可；注入脚本要在 `scripts/**` 路径内才会触发 CI（已含）。

---

## Step 5：轮换旧 key + 全链路验证

> 目的：让泄漏过的 key 彻底作废，并确认新 key 在三层环境都生效。做完这步安全闭环。

**操作：**

1. 到 AI 服务商后台**作废旧 key**（`sk-bGhPtk5...`、`sk-133p4g6...`），生成新 key 填入 Secret。
2. 本地：`$env:AI_ABSTRACT_API_KEY="新key"; npx hexo ge`，检查生成的 `public` 里 HTML 是否带新 key。
3. 线上验证（本环境 GitHub API 常被墙，用 curl.exe）：

```powershell
curl.exe -sL https://blog.weiguang.eu.org/posts/xxx/ | Select-String "sk-waMQ"   # 应命中新 key
curl.exe -sL https://blog.weiguang.eu.org/posts/xxx/ | Select-String "sk-bGhPtk5"  # 应无结果（旧 key 消失）
```

**预期输出：** 线上 HTML 只含新 key、无旧 key；Quality Checks 全绿（Build / Scan for secrets / Check internal links / Lighthouse 4 项）。

---

## 检查点：验证整体效果

> 全部勾选通过 = 安全修复完成。

- [x] `git grep -iE "sk-[A-Za-z0-9]{20}"` 全仓库无真实 key
- [x] Gitleaks 只报 0 个 finding（公共 key 已豁免）
- [x] 本地构建日志出现「apiKey 已从环境变量注入」
- [x] GitHub Secret `AI_ABSTRACT_API_KEY` 已设置
- [x] 线上 HTML 新 key 在、旧 key 无
- [x] 旧 key 已在服务商后台轮换作废

---

## 常见问题（FAQ）

| 问题 | 原因 | 解决 |
|------|------|------|
| 注入没生效 | `generateBefore` 事件早于配置合并 / priority 不够 | 用 `before_generate` filter + `priority: 100` |
| 泄漏的 key 删了还报 | 历史 commit 里仍有明文 | 必须轮换 key，而不是只删配置 |
| 豁免了公共 key 但还报 | 正则没匹配上 | 用 literal string `'''值'''` 精确匹配 |
| 本地注入和 CI 不一致 | 环境变量没传 | deploy.yml `env:` 段显式传 Secret |

---

## 总结

本文走完了「CI 抓泄漏 → 移出仓库 → 环境变量注入 → 白名单豁免 → Secret 传递 → 轮换验证」的完整闭环。核心要点：

1. **真实凭据永不入库**：构建时注入，`inject-ai-key.js` 只是 15 行的 filter
2. **事件时机是坑**：`before_generate` + `priority: 100` 才能盖过主题配置合并
3. **豁免要克制**：只豁免「协议要求公开」的 key，真实 key 一律轮换
4. **验证三层走**：本地日志 → CI 日志 → 线上 HTML 三层确认

**延伸阅读：**

- [上一篇：侧边栏目录仿 anheyu 风格魔改实录](https://blog.weiguang.eu.org/2026/08/09/hexo-anzhiyu-series/07-toc-style/)
- [下一篇：CI 质量门禁四道检查](https://blog.weiguang.eu.org/2026/08/09/hexo-anzhiyu-series/09-quality-ci/)
- [Gitleaks 官方文档](https://gitleaks.io/)
