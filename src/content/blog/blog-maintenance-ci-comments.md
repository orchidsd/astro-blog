---
title: 博客工程维护复盘：CI 收敛与评论图片放大双 Bug 修复实录
date: '2026-08-12 08:00:00'
tags:
  - Hexo
  - CI/CD
  - Twikoo
  - Waline
  - 教程
categories:
  - 技术分享
ai: true
description: 一次集中维护：CI 技术栈与凭证统一（friend-check 并入 deploy.yml 单一构建链）、Lighthouse 门禁从 warn 收紧为 error、图片上传 Worker 下线 webdav 渠道，以及评论系统两个镜像 Bug——Waline 评论区图片点不动、Twikoo 评论图片放大两次的完整根因与修复。
pubDate: '2026-08-12 08:00:00'
---

## 开头：一次「都做一遍」的维护巡检

博客上线大半年，CI 和评论系统一直是「能跑就行」的状态。直到某天收到一份维护建议清单，逐条核对才发现问题比想象的多：

- 两个 workflow 技术栈分裂：`friend-check.yml` 用 Node 20 + `npm install --no-save js-yaml`，`deploy.yml` 用 Node 22 + `npm ci`，部署还分 PAT 和 SSH key 两套凭证
- Lighthouse 门禁四个断言全是 `warn`（黄灯），压不住任何问题
- 图片上传 Worker 挂着 6 个渠道，其中 webdav 早已无人使用
- 评论系统两个镜像 Bug：Waline 评论区图片**点不动**（没接 fancybox），Twikoo 评论图片**点一次放大两次**（服务端 lightbox 和主题 fancybox 叠加）

本文完整记录这轮收敛与修复：**CI 怎么从「三套班子」收敛成一条链，以及两个评论图片 Bug 为什么是镜像的、怎么修。**

## 目标声明 + 前置条件

本文带你完成：CI 统一为单一构建链（Node 22 + `npm ci` + SSH key）、Lighthouse 断言从 warn 收紧为 error、上传渠道下线 webdav、两个评论图片放大 Bug 修复并验证上线。

**前置条件：**

- [x] 已有 `deploy.yml`（Node 22 + `npm ci` + SSH deploy key）
- [x] 已有 `friend-check.yml`（定时巡检友链并自动 push 分类结果）
- [x] 已有 `quality.yml` + `lighthouserc.json`（四道质量门禁，详见本系列第⑨篇）
- [x] 双评论系统：Twikoo（envId） + Waline（serverURL）

**你将学会：**

1. 从 workflow 依赖关系里发现并删除冗余 deploy job
2. 把运行时依赖从「传递依赖侥幸可用」改成显式声明
3. 评论系统「服务端配置 × 前端行为」耦合的排查方法论

---

## Part 1：CI 收敛——三套班子合成一条链

### 1.1 问题盘点：friend-check 和 deploy 各干各的

`friend-check.yml` 原本是这样：

```yaml
- name: Setup Node
  uses: actions/setup-node@v4
  with:
    node-version: '20'          # ← deploy.yml 用 22，这里用 20

- name: Install js-yaml
  run: npm install --no-save js-yaml   # ← 为什么？见 1.2

# ...

- name: Deploy to GitHub Pages     # ← 重复的部署 job！
  env:
    PAT: ${{ secrets.PAT }}        # ← 第二套凭证
  run: |
    cd public
    git init && git branch -m main
    git add -A
    git commit -m "deploy: update friends (auto)"
    git push -f "https://x-access-token:${PAT}@github.com/orchidsd/orchidsd.github.io.git" main
```

三个问题一眼可见：

1. **Node 版本分裂**（20 vs 22），两处依赖安装方式分裂（`--no-save` vs `npm ci`）
2. **重复部署**：friend-check 的 check job 跑完会把 `link.yml` push 回源码仓库 main——而 `deploy.yml` 的触发路径恰好含 `source/**`！也就是说 **friend-check 一旦改了 link.yml，deploy.yml 本来就会自动触发构建部署**，deploy job 是完全冗余的第二次构建
3. **两套凭证**：PAT 和 SSH deploy key 并存，密钥管理面翻倍

### 1.2 挖出隐性依赖：js-yaml 不在 package.json

`friend-check/friend-check.js` 里有这么一行：

```js
const yaml = require('js-yaml');
```

但 `package.json` 的 dependencies 里**根本没有 js-yaml**。CI 里 `npm install --no-save js-yaml` 就是给这个洞打的补丁——本地能跑是因为 node_modules 里恰好有（被某个主题依赖传递安装），换台机器就崩。这是典型的**传递依赖侥幸可用**：运行时直接 require 的包必须进正式依赖。

修复：

```json
"dependencies": {
  "...": "...",
  "js-yaml": "^4.1.0"
}
```

然后 `npm install --package-lock-only` 同步 lockfile（`npm ci` 要求 lock 与 package.json 一致，否则 CI 直接失败）。

### 1.3 收敛后的 friend-check.yml

```yaml
name: Friend Check & Deploy

on:
  schedule:
    - cron: '0 4 * * *'
  workflow_dispatch:

permissions:
  contents: write

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '22'     # ← 与 deploy.yml 对齐
          cache: 'npm'

      - name: Install dependencies
        run: npm ci              # ← 替代 --no-save hack

      - name: Run friend check
        id: check
        run: |
          node friend-check/friend-check.js
          if [ -n "$(git status --porcelain source/_data/link.yml friend-check/state.json)" ]; then
            echo "changed=true" >> "$GITHUB_OUTPUT"
          else
            echo "changed=false" >> "$GITHUB_OUTPUT"
          fi

      - name: Commit and push classified friends
        if: steps.check.outputs.changed == 'true'
        run: |
          git config user.name "friend-check[bot]"
          git config user.email "friend-check[bot]@users.noreply.github.com"
          git add source/_data/link.yml friend-check/state.json
          git commit -m "chore: auto-classify friends by availability"
          git push
```

**整个 deploy job 删除**。部署职责全部归 `deploy.yml`：friend-check push 分类结果 → deploy.yml 侦测到 `source/**` 变化 → SSH key 构建上线。一条链、一个凭证、一次构建。

> **排查方法**：发现「两个 workflow 都在部署」时，先看每个 job 的**输出是否又会触发另一个 workflow 的触发条件**（push 回 main + paths 匹配）。命中即冗余，删。

**预期输出：** friend-check 只保留 check job；每次 push 到 main 只触发一次 Deploy Site。

---

## Part 2：Lighthouse 门禁收紧——warn 不是门禁

`lighthouserc.json` 原本四个断言全是 `warn`：

```json
"categories:performance": ["warn", { "minScore": 0.7 }],
"categories:accessibility": ["warn", { "minScore": 0.9 }],
"categories:best-practices": ["warn", { "minScore": 0.9 }],
"categories:seo": ["warn", { "minScore": 0.9 }]
```

`warn` 的语义是「超标只标黄，不阻断」——换句话说，**没有任何 CI 失败是因为性能/无障碍/SEO 不达标**。门禁的意义是拦住不合格的变更，warn 拦不住。

基线已经跑了一周（第⑨篇的建议：首次接入用 warn 观察），四类指标稳定达标，直接收紧：

```json
"categories:performance": ["error", { "minScore": 0.7 }],
"categories:accessibility": ["error", { "minScore": 0.9 }],
"categories:best-practices": ["error", { "minScore": 0.9 }],
"categories:seo": ["error", { "minScore": 0.9 }]
```

> **预期输出：** 任一指标跌破阈值 → Quality Checks 红灯阻断，Lighthouse 报告 URL 可查明细。

---

## Part 3：Worker 渠道清理——下线 webdav

图片上传 Worker（`workers/waline-image-upload/`）支持 6 个上传渠道，其中 webdav 早已没有实际用途。用户确认后清理三处：

1. **`wrangler.toml`**：`ALLOWED_UPLOAD_CHANNELS` 从 6 个渠道去掉 `webdav`
2. **`src/index.js`**：`CHANNEL_MAX_UPLOAD_BYTES` 删除 webdav 的限额条目
3. **前端 `source/js/waline-image-uploader.js`**：`CHANNEL_LABELS` 删除 webdav 显示名

前端的设计恰好让清理很干净：**渠道列表是运行时从 `GET /channels` 动态拉取的**（后端以 `ALLOWED_UPLOAD_CHANNELS` 为唯一事实源），前端只维护「渠道名 → 显示名」的映射，不硬编码渠道集合。所以删掉映射和配置后，访客端弹窗自然只剩 5 个渠道，不需要改选择逻辑。

```bash
npx wrangler deploy
```

**预期输出：**

```json
// GET https://upload.weiguang.eu.org/channels
{"channels":[
  {"name":"telegram","maxUploadBytes":20971520},
  {"name":"cfr2","maxUploadBytes":104857600},
  {"name":"s3","maxUploadBytes":104857600},
  {"name":"discord","maxUploadBytes":10485760},
  {"name":"huggingface","maxUploadBytes":20971520}
],"default":"discord"}
```

> ⚠️ 记得带 `Origin: https://blog.weiguang.eu.org` 请求头，否则 Worker 的 CORS 校验会拒绝（403「来源不受允许」是预期行为，不是故障）。

---

## Part 4：评论图片放大双 Bug——一对镜像

这是本次最有意思的部分：**两个 Bug 症状完全相反，根因却同源**——主题的 fancybox 只挂在「文章正文」上，评论区是第三方异步渲染的独立世界。

### 4.1 Bug A：Waline 评论区图片点不动（没接 fancybox）

**症状：** 文章正文图片点击可放大（主题 fancybox 生效），Waline 评论区里的图片点击没有任何反应。

**根因：** 主题的图片放大逻辑只绑定 `#article-container img`（正文容器），而 Waline 评论渲染在 `#waline-wrap`，是懒加载 + 异步渲染的独立容器，评论图片天然拿不到 `data-fancybox`。

**修复（`waline.pug`）：** 加一个 `bindWalineLightbox()`，用 MutationObserver 监听评论区的异步渲染，把 `.wl-content` 里的图片（排除表情 `wl-emoji`、排除已被包进链接的）逐个挂上 fancybox：

```js
const bindWalineLightbox = () => {
  const wrap = document.getElementById('waline-wrap')
  if (!wrap || typeof anzhiyu === 'undefined' || !anzhiyu.loadLightbox) return
  const apply = () => {
    wrap.querySelectorAll('.wl-content img:not(.wl-emoji)').forEach(img => {
      if (img.parentNode.tagName !== 'A') anzhiyu.loadLightbox([img])
    })
  }
  apply()
  new MutationObserver(apply).observe(wrap, { childList: true, subtree: true })
}
```

初始化 Waline 后调用一次 `bindWalineLightbox()` 即可，后续评论翻页/提交新评论由 MutationObserver 兜底。

> ⚠️ **坑**：不要写 `window.anzhiyu` 判断——anzhiyu 主题的 `anzhiyu` 对象是**顶层 const，不挂在 window 上**，`window.anzhiyu` 恒为 `undefined`，守卫会永远早退导致修复失效。用 `typeof anzhiyu === 'undefined'` 才是对的。

### 4.2 Bug B：Twikoo 评论图片放大两次（服务端 lightbox × 主题 fancybox 叠加）

**症状：** Twikoo 评论区点击图片，放大一层后底下还叠着一层暗色遮罩，关一层还有一层。

**根因排查链路（重点）：**

1. 确认主题行为：`onCommentLoaded` 回调里给 `.tk-content img` 挂 fancybox——主题侧逻辑没毛病
2. 那多出来的一层是什么？打开 DevTools 看 DOM：存在一个 z-index 999 的 `.tk-lightbox` 容器
3. **查 Twikoo 服务端配置**：`serverConfig.LIGHTBOX === 'true'`——Twikoo 1.6.44 起**内置了 lightbox**（`popupLightbox`），服务端开关一旦打开，评论图片自带放大
4. 结论：**服务端 lightbox 放大了一次，主题 fancybox 又放大一次**，两个弹层叠加

**修复（`twikoo.pug`）：** 运行时探测服务端配置，内置 lightbox 开启时不再挂 fancybox，否则主题兜底：

```js
onCommentLoaded: () => {
  const v = document.getElementById('twikoo')?.__vue__
  const twikooLightbox = !!(v && v.$twikoo && v.$twikoo.serverConfig && v.$twikoo.serverConfig.LIGHTBOX === 'true')
  if (!twikooLightbox) anzhiyu.loadLightbox(document.querySelectorAll('#twikoo .tk-content img:not(.tk-owo-emotion)'))
}
```

> ⚠️ **坑**：初始化容器写的是 `#twikoo-wrap`，但 Twikoo 挂载后会把外层替换成 `#twikoo`（Vue mount replace），所以探测要用 `#twikoo`。空对象访问链要写满守卫（`?.` + `&&`），`__vue__` 拿不到时优雅跳过。

### 4.3 方法论沉淀：改评论服务端配置前，先想前端行为

两个 Bug 是**同一个教训的两面**：

| | Bug A（Waline） | Bug B（Twikoo） |
|---|---|---|
| 症状 | 评论图片**没有**放大 | 评论图片**放大两次** |
| 根因 | 主题 fancybox 只绑正文容器，没覆盖评论区 | 服务端内置 lightbox + 主题 fancybox **叠加** |
| 解法 | MutationObserver 给评论区补挂 fancybox | 探测服务端配置，开启则主题让位 |

**沉淀成一条铁律：评论/第三方组件的「服务端配置」和「主题前端行为」是耦合的，改任何一边之前必须先在浏览器实测另一边。** 服务端开个 LIGHTBOX 开关、升级一次组件版本，都可能和主题的 onCommentLoaded 钩子撞车。别把「双弹层」当新 Bug 排查半天——先看服务端配置再动代码。

---

## 检查点：验证整体效果

> 全部勾选通过 = 本轮维护收敛完成。

- [x] `npm ci` 后 `node friend-check/friend-check.js` 正常跑通（js-yaml 从正式依赖加载）
- [x] push 到 main 只触发一次 Deploy Site（friend-check 不再重复构建）
- [x] `curl -H "Origin: https://blog.weiguang.eu.org" https://upload.weiguang.eu.org/channels` 返回 5 渠道、无 webdav
- [x] 部署产物 `public/js/waline-image-uploader.js` 与线上文件均无 webdav 字样
- [x] Waline 评论区初始评论、异步追加评论图片均能点击放大，无 JS 报错
- [x] Twikoo 服务端 `LIGHTBOX=true` 时评论图片单层放大，主题不再叠加 fancybox
- [x] 三层验证走完：源码 push 对齐 → 产物仓库 HEAD 更新 → `curl -sL` 线上特征确认

---

## 常见问题（FAQ）

| 问题 | 原因 | 解决 |
|------|------|------|
| `npm ci` 报 lock 与 package.json 不一致 | 加了依赖没同步 lockfile | `npm install --package-lock-only` 后一起提交 |
| friend-check 改了 link.yml 却没触发部署 | 依赖 deploy.yml 的 paths 未含 `source/**` | 确认 deploy.yml 触发路径覆盖数据目录 |
| `window.anzhiyu` 判断永远为 undefined | anzhiyu 是顶层 const 不挂 window | 改用 `typeof anzhiyu === 'undefined'` |
| 评论图片放大后底下还有一层遮罩 | 服务端 lightbox 与主题 fancybox 叠加 | 运行时探测 `serverConfig.LIGHTBOX`，开启则主题让位 |
| 访问 `/channels` 返回「来源不受允许」 | 没带 Origin 头，CORS 校验拦截 | 加 `Origin: https://blog.weiguang.eu.org` 请求头 |

---

## 总结

一次集中维护做了四件事，每件都对应一类常见工程债：

1. **CI 收敛**：识别出「push 回 main 会触发 deploy.yml」这一隐性依赖，删掉冗余 deploy job，技术栈（Node 22 + `npm ci`）与凭证（SSH key）统一到一条链
2. **依赖显式化**：friend-check 直接用 js-yaml 却只靠传递依赖，补进 `package.json` 并同步 lockfile
3. **门禁生效**：Lighthouse 从 warn（不阻断）收紧为 error（真拦截），基线稳定后收严
4. **评论双 Bug**：Waline 图片没放大 = 主题 fancybox 没覆盖评论区，补 MutationObserver；Twikoo 放大两次 = 服务端 lightbox 与主题 fancybox 叠加，运行时探测让位

最值钱的不是代码，是那条方法论：**改服务端配置前先想前端行为，双弹层先查配置再动代码。**

**延伸阅读：**

- [CI 质量门禁四道检查搭建实录](https://blog.weiguang.eu.org/2026/08/09/hexo-anzhiyu-series/09-quality-ci/)（Lighthouse 门禁的搭建背景）
- [部署三层验证 SOP](https://blog.weiguang.eu.org/2026/08/09/hexo-anzhiyu-series/10-deploy-verify/)（本轮所有改动上线验证的依据）
- [Waline 评论图片上传系列](https://blog.weiguang.eu.org/2026/08/09/waline-series/00-series-index/)（Worker 渠道与上传链路的完整背景）
