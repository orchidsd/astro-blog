---
title: Hexo anzhiyu 主题深度定制系列（七）：侧边栏目录仿 anheyu 风格魔改实录
date: '2026-08-09 10:00:00'
tags:
  - Hexo
  - anzhiyu
  - 主题定制
  - 教程
categories:
  - 技术分享
ai: true
description: 用 pug 模板 + stylus 样式 + patch 归档三步，把 anzhiyu 侧边栏目录改造成 blog.anheyu.com 风格：标题计数胶囊、blur 半透明非活跃态、主题色高亮指示条，并用 puppeteer 逐项对比验证。
pubDate: '2026-08-09 10:00:00'
---

## 开头：一个「照着抄却抄不赢」的问题

博客的侧边栏目录（TOC）一直是默认样式：只有当前项高亮，其他项平平无奇。看到 blog.anheyu.com 的目录——标题旁边带个**标题计数胶囊**，非当前项**模糊半透明**，鼠标滑过才聚焦，当前项**主题色高亮 + 左侧指示条**——一眼就想要。

但直接照抄它的 CSS 是行不通的：那是 Next.js 重写的站点，DOM 结构完全不同，选择器一个都对不上。本文记录如何用主题原生 `card_post_toc.pug` + `sidebar.styl` 复刻这套效果，并跑通「魔改 → 验证 → patch 归档」的完整闭环。

## 目标声明 + 前置条件

本文带你完成：把 anzhiyu 侧边栏目录改造成 anheyu 风格（计数胶囊 + blur 非活跃态 + 主题色 active 高亮 + 细滚动条），并且**升级主题时不会丢**。

**前置条件：**

- [x] Hexo + anzhiyu 主题（v1.7.1 实测通过）
- [x] 已掌握 patch 归档流程（本系列第④篇）
- [x] 本地可跑 `npx hexo s` 预览

**你将学会：**

1. 用 pug 在模板里算标题数量
2. stylus 里用主题变量实现 blur/高亮联动
3. puppeteer-core 对比参考站样式逐项核对
4. 魔改后重新生成 patch 防升级丢失

---

## Step 1：pug 模板加计数胶囊

> 目的：目录标题右侧显示文章标题总数。做完这一步刷新页面，标题栏右侧会出现一个数字胶囊。

**操作：** 改 `themes/anzhiyu/layout/includes/widget/card_post_toc.pug`。原模板只渲染标题文字，加三行：

```pug
- let tocSource = page.encrypt == true ? page.origin : page.content
- let tocCount = (tocSource.match(/<h[1-6][^>]*/g) || []).length

#card-toc.card-widget
  .item-headline
    i.anzhiyufont.anzhiyu-icon-bars
    span= _p('aside.card_toc')
    span.toc-percentage= tocCount
```

**预期输出：** 目录标题「文章目录」右侧出现圆角胶囊数字（如 `12`），数值 = 本文 h1-h6 标题总数。

> ⚠️ **报错排查**：加密文章（`page.encrypt`）内容不在 `page.content` 里，必须取 `page.origin` 计算，否则数字恒为 0。

---

## Step 2：styl 实现 anheyu 三态效果

> 目的：非活跃项 blur(1px)+opacity 0.6，hover 恢复清晰，active 项主题色高亮 + 左侧 4px 指示条 + 6px 细滚动条。做完这步目录视觉已完全换样。

**操作：** 改 `themes/anzhiyu/source/css/_layout/sidebar.styl`，替换原 toc 段：

```styl
/* 文章toc — 仿 blog.anheyu.com 风格 */
#aside-content #card-toc .toc-content::-webkit-scrollbar { width: 6px; height: 6px; }
#aside-content #card-toc .toc-content::-webkit-scrollbar-track { background: transparent; }
#aside-content #card-toc .toc-content::-webkit-scrollbar-thumb { background: var(--anzhiyu-gray-op); border-radius: 3px; }

#aside-content #card-toc .toc-percentage {
  display: block; float: none; margin: 0 0 0 auto;
  padding: 2px 8px; border-radius: 9999px;
  background: var(--anzhiyu-gray-op);
  color: var(--anzhiyu-secondtext);
  font-size: 12px; font-weight: 500; font-style: normal; line-height: 1.5;
}

#aside-content #card-toc .toc-content .toc-link {
  position: relative; display: flex; align-items: center;
  line-height: 1.5; padding: 8px 8px 8px 16px;
  border-left: 0 solid transparent; border-radius: 8px;
  color: var(--anzhiyu-secondtext); font-size: 14.4px;
  cursor: pointer;
  transition: color .2s ease-out, background-color .2s ease-out, font-size .2s ease-out, filter .2s ease-out, opacity .2s ease-out;
}
#aside-content #card-toc .toc-content .toc-link:hover {
  color: var(--anzhiyu-main); background-color: var(--anzhiyu-main-op);
}
#aside-content #card-toc .toc-content .toc-link:not(.active) {
  opacity: 0.6; filter: blur(1px);
}
#aside-content #card-toc:hover .toc-content .toc-link:not(.active) {
  filter: blur(0); opacity: 1;
}
#aside-content #card-toc .toc-content .toc-item.active .toc-link {
  opacity: 1; border-radius: 8px;
  color: var(--anzhiyu-main); background-color: var(--anzhiyu-main-op);
  font-weight: 600; font-size: 17.6px; filter: blur(0);
}
#aside-content #card-toc .toc-content .toc-item.active .toc-link::before {
  content: ""; position: absolute; left: 6px; top: 50%;
  transform: translateY(-50%);
  width: 4px; height: 60%; border-radius: 4px;
  background: var(--anzhiyu-main);
}
```

**预期输出：**

| 状态 | 效果 |
|------|------|
| 非活跃项 | 模糊 1px + 半透明 0.6，hover 恢复清晰 |
| 活跃项 | 主题色文字 + `main-op` 浅底 + 600 字重 + 放大到 17.6px |
| 活跃项指示条 | 左侧 4px 主题色竖条 |
| 滚动条 | 6px 细滚动条，灰色圆角 thumb |

> ⚠️ **报错排查**：如果 active 样式不生效，检查是不是还在用旧的 `.toc-link.active` 选择器——anzhiyu 渲染的是 `.toc-item.active .toc-link` 结构，两者都要覆盖。

---

## Step 3：puppeteer 对比参考站逐项验证

> 目的：眼睛看可能有偏差，用 puppeteer-core 驱动浏览器读取两边 computed style 逐项比对。做完这步可以确认「真的是同一个效果」。

**操作：** 项目已装 `puppeteer-core`（`npm i -D puppeteer-core --no-save`，直接驱动本机 Edge）：

```js
const puppeteer = require("puppeteer-core");
(async () => {
  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless: "new",
  });
  const page = await browser.newPage();
  await page.goto("http://localhost:4000/posts/xxxx/", { waitUntil: "networkidle0" });
  const s = await page.evaluate(() => {
    const el = document.querySelector("#card-toc .toc-item.active .toc-link");
    const cs = getComputedStyle(el);
    return { color: cs.color, fontSize: cs.fontSize, fontWeight: cs.fontWeight, filter: cs.filter };
  });
  console.log(JSON.stringify(s, null, 2));
  await browser.close();
})();
```

**预期输出：** 本地站与参考站（blog.anheyu.com）两边的 `color / fontSize / fontWeight / filter / opacity` 数值一致（主题色不同除外）。

> ⚠️ **报错排查**：headless 模式若启动失败，换 `headless: false` 带窗口跑；参考站是 Next.js，等待 `networkidle0` 时注意它可能有长轮询，加超时兜底。

---

## Step 4：重新生成 patch 防升级丢失

> 目的：把两个文件的改动归档进 `patches/anzhiyu-customizations.patch`，升级主题后 `patch-package` 自动恢复。做完这步改动才算真正落地。

**操作：**

1. 把新改的文件补进 `patches/generate-patch.ps1` 的 `$files` 列表：
   ```powershell
   $files = @(
     ...
     "layout/includes/widget/card_post_toc.pug",
     ...
     "source/css/_layout/sidebar.styl",
     ...
   )
   ```
2. 重新生成 patch 并提交：
   ```powershell
   .\patches\generate-patch.ps1     # 生成 patches/anzhiyu-customizations.patch
   npx hexo clean && npx hexo ge    # 确认构建无错
   git add -A && git commit -m "feat(主题): 侧边栏目录改仿 anheyu 风格"
   git push
   ```

**预期输出：** patch 文件里出现 `card_post_toc.pug` 与 `sidebar.styl` 的 diff；CI Deploy 流程跑通，线上目录样式生效。

---

## 检查点：验证整体效果

> 全部勾选通过 = 魔改完成。

- [x] 目录标题右侧显示标题计数胶囊（数字 = 文章 h1-h6 数）
- [x] 非活跃项 blur 1px + 0.6 透明度，hover 恢复
- [x] 活跃项主题色高亮 + 左侧 4px 指示条
- [x] 滚动条 6px 细条
- [x] `patches/anzhiyu-customizations.patch` 含本次改动
- [x] 本地构建 0 错误、线上验证生效

---

## 常见问题（FAQ）

| 问题 | 原因 | 解决 |
|------|------|------|
| 加密文章计数为 0 | `page.content` 不含加密内容 | 用 `page.origin` 计算 |
| active 样式不生效 | 选择器写错层级 | 用 `.toc-item.active .toc-link` |
| 升级主题后样式没了 | 没重新生成 patch | 改完必跑 `generate-patch.ps1` |
| 参考站 CSS 抄不了 | DOM 结构不同 | 按本文思路用主题类名重写，而非复制选择器 |

---

## 总结

本文完成了目录卡片的完整魔改闭环：pug 计数 → styl 三态样式 → puppeteer 对照验证 → patch 归档。核心要点：

1. **计算交给 pug**：模板期算出标题数，零 JS 依赖
2. **样式用主题变量**：`--anzhiyu-main` 系列变量保证深浅色模式自适应
3. **验证用工具**：眼睛不可靠，computed style 才是唯一标准
4. **归档必做**：不重新生成 patch，下次升级全丢

**延伸阅读：**

- [上一篇：主题升级与 Patch 归档策略](https://blog.weiguang.eu.org/2026/07/31/hexo-anzhiyu-series/04-theme-upgrade-patch/)
- [下一篇：API Key 安全注入与 Gitleaks 修复实录](https://blog.weiguang.eu.org/2026/08/09/hexo-anzhiyu-series/08-api-key-security/)
- [参考站 blog.anheyu.com](https://blog.anheyu.com)
