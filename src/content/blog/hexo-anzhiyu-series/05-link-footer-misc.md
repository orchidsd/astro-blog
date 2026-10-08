---
title: Hexo anzhiyu 主题深度定制系列（五）：友链页顶部区块、底部版权栏、音乐页/时钟/代码注入等杂项配置
date: '2026-07-30 14:00:00'
tags:
  - Hexo
  - anzhiyu
  - 友链
  - 底部栏
  - 杂项配置
categories:
  - 技术分享
ai: true
description: 一文搞定 anzhiyu 友链页 linkPageTop 欢迎区块、footerBar.cc 版权协议链接、音乐页关闭评论、导航栏时钟关闭、inject 代码注入双模式等零散但高频的配置项。
pubDate: '2026-07-30 14:00:00'
---

## 前言

本篇收纳那些「单独拎出来不够一篇，但每个站都会改」的配置项，按功能模块逐个拆解，配置即生效，无需改源码。

---

## 1. 友链页顶部欢迎区块（`linkPageTop`）

### 1.1 效果

开启后 `/link/` 页面顶部会渲染一整屏 Hero 区块：
- 左侧大标题 + 副标题
- 右侧「申请友链」按钮 → 跳转评论区（需配合 Twikoo/Waline）
- 底部自定义格式占位文本（引导访客按格式留言申请）

### 1.2 配置（`_config.anzhiyu.yml`）

```yaml
linkPageTop:
  enable: true
  title: 与数百名博主无限进步
  # 评论区留言模板（支持 \n 换行）
  addFriendPlaceholder: |
    昵称（请勿包含博客等字样）：
    网站地址（要求博客地址，请勿提交个人主页）：
    头像图片url（请提供尽可能清晰的图片，我会上传到我自己的图床）：
    描述：
    站点截图（可选）：
```

### 1.3 前置条件

`source/link/index.md` 必须指定 `type: link`：

```markdown
---
title: 友情链接
type: link
date: 2026-04-15
comments: true    # 必须开启评论，否则「申请友链」按钮无处落脚
---
```

### 1.4 模板源码（`themes/anzhiyu/layout/includes/page/link.pug` 片段）

```pug
if theme.linkPageTop.enable
  .link-page-top
    .link-page-top-text
      h1= theme.linkPageTop.title
      p= theme.description
    .link-page-top-btn
      a(href="#comments" class="btn") 申请友链
    .link-page-top-placeholder
      textarea.readonly(value=theme.linkPageTop.addFriendPlaceholder)
```

---

## 2. 底部栏版权协议链接（`footerBar.cc`）

### 2.1 效果

页脚最右侧（或左侧，视布局）出现 **CC 协议图标 + 链接**，点击跳转 `/copyright/` 页面。

### 2.2 配置

```yaml
footerBar:
  enable: true
  authorLink: /
  cc:
    enable: true
    link: /copyright
```

### 2.3 配套页面（`source/copyright/index.md`）

```markdown
---
title: 版权协议
type: about
date: 2026-07-30
comments: false
background: "#f8f9fe"
---

本博客采用 **知识共享署名-非商业性使用-相同方式共享 4.0 国际许可协议（CC BY-NC-SA 4.0）** 进行许可。

### 你可以

- **共享** — 在任何媒介以任何形式复制、发行本作品
- **演绎** — 修改、转换或以本作品为基础进行创作

### 须遵守

- **署名** — 必须给出适当的署名，提供指向本许可协议的链接
- **非商业性使用** — 不得将本作品用于商业目的
- **相同方式共享** — 基于本作品创作的衍生作品，必须使用相同协议

完整协议见 [Creative Commons](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh)。
```

### 2.3 模板渲染（`themes/anzhiyu/layout/includes/footer.pug` 片段）

```pug
if theme.footerBar.cc.enable
  a.footer-bar-link.cc(href=url_for(theme.footerBar.cc.link) title=_p('footer.cc_license'))
    i.fa-solid.fa-copyright
    span= ' CC BY-NC-SA 4.0'
```

---

## 3. 音乐页关闭评论

### 3.1 一行配置

`source/music/index.md`：

```markdown
---
title: 音乐
type: music
comments: false    # ← 关闭评论
---
```

> 同理适用于 `about`、`album`、`pixiv` 等任意页面，前置变量 `comments: false` 即可屏蔽评论区。

---

## 4. 导航栏时钟/天气组件关闭

### 4.1 配置

```yaml
menu:
  nav:
    clock: false    # ← 关闭时钟/天气
```

### 4.2 原理

- `themes/anzhiyu/layout/includes/nav.pug` 读取 `theme.menu.nav.clock`
- 为 `false` 时不渲染 `<div id="clock">`，也不加载 `clock.pug` 对应的 JS/CSS
- 原主题自带的 `clock.pug`（天气 API、qweather/weatherwidget 切换）可保留不动，仅不引入

### 4.3 彻底清理（可选）

若确定永不再用，可删除：
- `themes/anzhiyu/layout/includes/nav/clock.pug`
- `themes/anzhiyu/source/js/anzhiyu/clock.js`
- `themes/anzhiyu/source/css/_layout/clock.styl`

升级主题时不再产生冲突。

---

## 5. 代码注入双模式（`inject`）

### 5.1 两种注入方式对比

| 方式 | 位置 | 优点 | 缺点 |
|------|------|------|------|
| **`inject.head/bottom`** | `</head>` 前 / `</body>` 前 | 配置文件改完即生效、无需改模板、支持多行 HTML | 静态注入，无法根据运行时变量动态决定 |
| **JS 动态注入** | 任意时机（如 `pjax:complete`） | 可判断条件、延迟加载、失败重试 | 需改 `main.js`、维护成本稍高 |

### 5.2 51.LA 静态注入（备选方案）

```yaml
inject:
  head:
    # 取消注释即切换为静态注入，同时需注释 main.js 中 statistics51aInit()
    # - <script charset="UTF-8" id="LA_COLLECT" src="https://sdk.51.la/js-sdk-pro.min.js"></script>
    # - <script>LA.init({id:"3QhmqTheuIeNJHd9",ck:"3QhmqTheuIeNJHd9",autoTrack:true,hashMode:true})</script>
    # - <script src="https://sdk.51.la/perf/js-sdk-perf.min.js" crossorigin="anonymous"></script>
    # - <script>new LingQue.Monitor().init({id:"3QhhHg4cYX5by8v8",sendSuspicious:true})</script>
```

**切换清单**：
1. `inject.head` 取消注释上述 4 行
2. `themes/anzhiyu/source/js/anzhiyu/main.js` 注释 `statistics51aInit()` 调用
3. `hexo clean && hexo g` 验证 Network 面板只加载一次 SDK

### 5.3 自定义 CSS/JS 注入示例

```yaml
inject:
  head:
    # 自定义 CSS（延迟加载，不阻塞渲染）
    - <link rel="stylesheet" href="/css/custom.css" media="defer" onload="this.media='all'">
  bottom:
    # 自定义 JS
    - <script src="/js/custom.js"></script>
```

**文件位置**：
- `source/css/custom.css`
- `source/js/custom.js`

> 这两个文件**不在主题目录**，升级主题完全不受影响。

---

## 6. 欢迎语时间段配置（`greetingBox`）

### 6.1 效果

首页左下角/右下角浮动卡片，根据当前时间显示不同问候语。

### 6.2 配置

```yaml
greetingBox:
  enable: true
  default: 晚上好👋
  list:
    - greeting: 晚安😴
      startTime: 0
      endTime: 5
    - greeting: 早上好鸭👋, 祝你一天好心情！
      startTime: 6
      endTime: 9
    - greeting: 上午好👋, 状态很好，鼓励一下～
      startTime: 10
      endTime: 10
    - greeting: 11点多啦, 在坚持一下就吃饭啦～
      startTime: 11
      endTime: 11
    - greeting: 午安👋, 宝贝
      startTime: 12
      endTime: 14
    - greeting: 🌈充实的一天辛苦啦！
      startTime: 14
      endTime: 18
    - greeting: 19点喽, 奖励一顿丰盛的大餐吧🍔。
      startTime: 19
      endTime: 19
    - greeting: 晚上好👋, 在属于自己的时间好好放松😌~
      startTime: 20
      endTime: 24
```

### 6.3 注意

- `startTime`/`endTime` 为 **小时整数**，区间 `[startTime, endTime)`
- 必须 **覆盖 0-24 全天**，否则会有空白时段显示 `default`
- 该功能在 `themes/anzhiyu/layout/includes/greeting.pug` 渲染，JS 端每分钟轮询一次

---

## 7. 无障碍优化（`accesskey`）

### 7.1 配置

```yaml
accesskey:
  enable: true
```

### 7.2 效果

首页按下 `Shift + ?` 弹出快捷键帮助面板，包含：
- `s` → 搜索
- `t` → 回顶部
- `b` → 回底部
- `c` → 目录
- `n` → 下一篇
- `p` → 上一篇

### 7.3 源码（`themes/anzhiyu/source/js/anzhiyu/accesskey.js`）

```javascript
const KEY_MAP = {
  s: () => document.querySelector('#search-input')?.focus(),
  t: () => scrollTo(0, 0),
  b: () => scrollTo(0, document.body.scrollHeight),
  c: () => document.querySelector('#aside-content .card-toc')?.click(),
  n: () => document.querySelector('.pagination .next')?.click(),
  p: () => document.querySelector('.pagination .prev')?.click()
};

document.addEventListener('keydown', e => {
  if (e.shiftKey && e.key === '?') showHelpModal();
  if (!e.ctrlKey && !e.metaKey && !e.altKey && KEY_MAP[e.key]) {
    e.preventDefault();
    KEY_MAP[e.key]();
  }
});
```

---

## 8. 动效开关（`dynamicEffect`）

```yaml
dynamicEffect:
  postTopWave: true        # 文章顶部波浪动画
  postTopRollZoomInfo: false  # 文章顶部滚动缩放信息卡
  pageCommentsRollZoom: false # 非文章页评论滚动缩放（仅 Twikoo 生效）
```

- `postTopWave`：`themes/anzhiyu/layout/includes/post/top_img.pug` 控制，CSS `keyframes wave`
- `postTopRollZoomInfo`：`post_top_roll_zoom_info.styl` + `main.js` 监听 scroll
- `pageCommentsRollZoom`：仅在 `page.comments` 存在且评论系统为 Twikoo 时生效

---

## 9. CDN 配置（`CDN` 字段，非必要勿动）

```yaml
CDN:
  internal_provider: local      # 主题内部 js/css：local/elemecdn/jsdelivr/unpkg/cdnjs/onmicrosoft/cbd/anheyu/custom
  third_party_provider: cbd     # 第三方库
  version: true                 # URL 带版本号
  # custom_format: https://npm.elemecdn.com/${name}@latest/${file}
  option: {}
```

- `local` = 本地 `source/lib`，离线可用、升级主题需手动同步
- `cbd` = `cdn.cbd.int`，国内访问极快，推荐
- `option` 可单独覆盖某个库的 provider，如 `option: { aplayer_js: 'unpkg' }`

---

## 10. 小结清单

| 配置项 | 文件 | 关键开关 | 备注 |
|--------|------|----------|------|
| 友链页顶部 | `_config.anzhiyu.yml` | `linkPageTop.enable` | 需 `source/link/index.md` 有 `type: link` + `comments: true` |
| 底部版权 | `_config.anzhiyu.yml` | `footerBar.cc.enable` | 需配套 `source/copyright/index.md` |
| 音乐页评论 | `source/music/index.md` | `comments: false` | 通用前置变量 |
| 导航时钟 | `_config.anzhiyu.yml` | `menu.nav.clock: false` | 彻底关闭可删模板文件 |
| 代码注入 | `_config.anzhiyu.yml` | `inject.head/bottom` | 静态注入备选动态注入 |
| 欢迎语 | `_config.anzhiyu.yml` | `greetingBox.enable` | 必须覆盖 0-24h |
| 无障碍 | `_config.anzhiyu.yml` | `accesskey.enable` | `Shift+?` 触发 |
| 动效 | `_config.anzhiyu.yml` | `dynamicEffect.*` | 按需开启 |

---

## 11. 下一篇预告

**《部署与 CI/CD 终极指南：GitHub Actions + Cloudflare Pages、Secrets 管理、Submodule 升级流程、自动生成配置》**

敬请期待！