---
title: anzhiyu 音乐播放器深度魔改系列（二）：歌词功能——URL 歌词、自绘滚动与竞态根治
date: '2026-08-09 15:00:00'
tags:
  - Hexo
  - anzhiyu
  - 音乐播放器
  - 教程
categories:
  - 技术分享
ai: true
description: 播放器歌词一直「暂无歌词」？APlayer lrcType 3 异步 fetch 天生不同步？本文用 window.__parseLrc 统一解析 + timeupdate 自绘滚动 + 音乐馆竞态对比根治，让歌词逐行精准跟唱。
pubDate: '2026-08-09 15:00:00'
---

## 开头：歌词不是「没有」，是「没对上」

左下角播放器从 APlayer 官方示例抄的歌词配置，跑起来**永远是「暂无歌词」**——明明歌单里每首歌都有 `lrc` 字段。后来换成 `lrcType: 3`（异步 fetch 歌词），歌词出来了，但**永远慢半拍**：歌已经唱到副歌，高亮还停在第一句。

根因：APlayer 的异步歌词加载与 `timeupdate` 播放进度不同步，且它只比对「播放列表索引」不比对「歌词内容」——切歌后旧歌单晚到的歌词 XHR 还能覆盖新歌词。本文给出三件套解法：**统一解析器 + 自绘滚动 + 竞态对比根治**。

## 目标声明 + 前置条件

本文带你完成：左下角播放器与音乐馆页歌词逐行精准同步、切歌不串歌词、深浅色模式可读，并把「暂无歌词」彻底消灭。

**前置条件：**

- [x] 已完成本系列第一篇（音频保活架构）
- [x] 歌单数据含 `lrc` / `lyric` 字段（URL 或内嵌）
- [x] 可本地起 `hexo s` 验证

**你将学会：**

1. 统一歌词解析器 `window.__parseLrc`（多时间戳、毫秒、排序）
2. 为什么自绘比 APlayer lrcType 可靠
3. 音乐馆歌词竞态的「期望 vs 实际」对比根治法
4. 深浅色下歌词可读性细节

---

## Step 1：统一歌词解析器

> 目的：一套解析逻辑全站复用（左下播放器 + 首页 + 音乐馆），消除三处重复实现。做完这步解析结果可用。

**操作：** 在 `utils.js` 顶部定义全局解析器：

```js
window.__parseLrc = function (text) {
  const lines = [], times = [];
  if (!text) return { lines, times };
  const regex = /\[(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?\]/g;
  text.split(/\r?\n/).forEach(rawLine => { /* 提取时间戳与文本，支持 [mm:ss][mm:ss.xxx] 多标签 */ });
  lines.sort((a, b) => a.time - b.time);
  times.sort((a, b) => a - b);
  return { lines, times };
};
```

**预期输出：** `window.__parseLrc("[00:12.500]第一句\n[00:15]第二句")` 返回按时间排序的行数组与时间数组。

> ⚠️ **报错排查**：歌词文件可能用 `\r\n`（Windows）或 `\r`，`split(/\r?\n/)` 必须兼容；同一行多个 `[mm:ss]` 标签（间奏复用行）要分别展开。

---

## Step 2：自绘歌词 + timeupdate 同步

> 目的：放弃 APlayer lrcType，自己渲染歌词 DOM，用 `timeupdate` 事件逐行滚动。做完这步歌词精确跟唱。

**操作：** 创建歌词容器并实现同步逻辑（`utils.js:994-1099`）：

```js
const lrcEl = document.createElement("div");
lrcEl.className = "nav-music-lrc";
lrcEl.innerHTML = '<div class="nav-music-lrc-inner"></div>';
navMusicEl.appendChild(lrcEl);

// timeupdate 同步：倒序遍历 times 找当前行，滚动到第 3 行（行高 28px）
navPlayer.audio.addEventListener("timeupdate", function () {
  updateNavLrc(navPlayer.audio.currentTime);
});
// 滚动计算：translateY(${56 - idx * 28}px)，56 = 让当前行落在第 3 行
```

**预期输出：** 播放时歌词逐行高亮滚动，与歌声同步；无歌词显示「暂无歌词」占位。

> ⚠️ **报错排查**：行高与偏移是配套的（`28px` 行高、`translateY` 基准 `56`=第 3 行），改行距必须同步改偏移（本系列曾把当前行从第 2 行调到第 3 行）；`timeupdate` 事件频率够用，不要用 `requestAnimationFrame` 轮询。

---

## Step 3：URL 歌词 fetch + 缓存去重

> 目的：歌词可能是外链 URL，需要异步拉取；同曲不重复请求。做完这步 URL 歌词可用且不刷接口。

**操作：** `utils.js:1065-1099`：

```js
const loadNavLrc = () => {
  const track = navPlayer.list.audios[navPlayer.list.index];
  const url = track && (track.lrc || track.lyric);
  if (!url) { lrcEl._times = []; renderNavLrc({ lines: [] }); return; }
  if (lrcEl._url === url) { updateNavLrc(navPlayer.audio.currentTime); return; }  // 同曲不重复 fetch
  lrcEl._url = url;
  fetch(url).then(r => (r.ok ? r.text() : Promise.reject(new Error(r.status))))
    .then(text => { parseNavLrc(text); renderNavLrc(); updateNavLrc(navPlayer.audio.currentTime); })
    .catch(() => { lrcEl._times = []; renderNavLrc({ lines: [] }); });
};
navPlayer.on("listswitch", loadNavLrc);
navPlayer.on("play", loadNavLrc);
loadNavLrc();
```

**预期输出：** 切歌/播放触发加载；同曲（切回来）不重复请求，直接按当前进度刷新；fetch 失败兜底空歌词。

> ⚠️ **报错排查**：`_url` 缓存字段必须存在（首次设 `_url` 后同 URL 直接复用），否则每切一次歌就重复请求一次；失败时也要清 `_times`，否则残留上一首歌的时间轴会错位高亮。

---

## Step 4：音乐馆歌词竞态根治

> 目的：切歌单时旧歌单晚到的歌词 XHR 不再覆盖新歌词。做完这步音乐馆歌词不串台。

**操作：** `utils.js:1558-1589`——对比「期望歌词」与「实际 DOM 歌词」，不一致则清缓存强制重载：

```js
// 歌词竞态修复：旧歌单的异步歌词 XHR 晚到仍会覆盖新歌词（APlayer 只比对索引不比对歌曲），
// 切换后对比实际歌词与当前歌曲歌词，不一致则清缓存强制重载
const fixLyricsRace = () => {
  /* fetch 当前曲 lrcUrl，解析出期望歌词序列 */
  const want = (playerNow.lrc.parse ? playerNow.lrc.parse(text) : []).map(i => i[1]).join("|");
  const have = Array.from(contents.querySelectorAll("p")).map(p => p.textContent).join("|");
  if (want && have !== want) {
    playerNow.lrc.parsed = [];
    playerNow.lrc.container.innerHTML = "";
    playerNow.lrc.switch(idx);   // 强制重载
  }
};
setTimeout(fixLyricsRace, 1000);   // 1s 后检查（给旧 XHR 时间）
setTimeout(fixLyricsRace, 2500);   // 2.5s 再兜底一次
```

**预期输出：** 音乐馆快速切换歌单后，歌词始终是当前歌曲的；旧 XHR 晚到也不覆盖。

> ⚠️ **报错排查**：对比串用 `join("|")` 拼整页歌词，避免逐行比对性能问题；两次延时检查覆盖不同竞态窗口，别只留一次。

---

## Step 5：歌词样式与可读性

> 目的：大字歌词居中 + 渐隐遮罩 + 深浅色可读。做完这步视觉达标。

**操作要点**（`music.styl` + `fix/aplayer.css`）：

- 音乐馆大字歌词 + mask 渐隐：`.aplayer-lrc` height 800%、`mask-image` 渐变、当前行高亮
- 当前行对齐第 3 行：`#anMusic-page .aplayer.aplayer-withlrc .aplayer-lrc-contents { margin-top: 80px; }`
- 左下角歌词块宽度自适应歌词长度（最长 420px）
- 播放中金黄底 → 歌词当前行深色字 `#18171d`；浅色模式白底 → 深色文字（`[data-theme="light"]` 特例覆盖）

**预期输出：** 两种主题模式下歌词都清晰可读，不出现「黄底黄字」「白底白字」。

> ⚠️ **报错排查**：金黄底（`--anzhiyu-main`）上的文字必须深色 `#18171d`，默认白字对比度极差（本系列实测过 `aplayer.css` 默认规则白字 + 金黄底不可读）；浅色模式要单独覆盖金黄规则。

---

## 检查点：验证整体效果

> 全部勾选通过 = 歌词功能达标。

- [x] 有 URL 歌词的歌逐行跟唱、无错位
- [x] 无歌词的歌显示「暂无歌词」而非乱码/空
- [x] 快速切歌单 10 次，歌词始终是当前歌曲
- [x] 深浅色两模式歌词均可读
- [x] 音乐馆歌词当前行在第 3 行（margin-top 80px，可用 `tools/edge-verify/verify-music-lrc.js` 断言）

---

## 常见问题（FAQ）

| 问题 | 原因 | 解决 |
|------|------|------|
| 一直显示暂无歌词 | 歌单没有 `lrc`/`lyric` 字段 | 歌单数据补 URL 歌词字段 |
| 歌词慢半拍 | 用 APlayer lrcType 3 | 自绘 + timeupdate |
| 切歌后歌词串台 | 旧 XHR 晚到覆盖 | 期望 vs 实际对比 + 清缓存重载 |
| 黄底黄字看不清 | 金黄底默认白字 | 金黄底强制深字 `#18171d` |
| 歌词滚动行不对齐 | 行距与偏移不配套 | 行高与 translateY 基准同步改 |

---

## 总结

歌词问题的根因是「**APlayer 异步歌词机制不可靠**」，解法是绕开它自绘。核心要点：

1. **解析统一**：`window.__parseLrc` 全站共用，支持多标签/毫秒/排序
2. **同步自绘**：timeupdate 事件驱动，精准跟唱
3. **竞态对比**：用「期望 vs 实际」内容对比根治串台
4. **可读性优先**：深浅色两套覆盖，金黄底必深字

**延伸阅读：**

- [上一篇：切页零中断——pjax 下播放不暂停的架构与补丁](https://blog.weiguang.eu.org/2026/08/09/music-player-series/01-pjax-zero-interrupt/)
- [下一篇：控制条与布局——展开折叠、音量条与控制台态](https://blog.weiguang.eu.org/2026/08/09/music-player-series/03-controls-layout/)
