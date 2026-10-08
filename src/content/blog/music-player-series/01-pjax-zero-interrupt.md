---
title: anzhiyu 音乐播放器深度魔改系列（一）：切页零中断——pjax 下播放不暂停的架构与补丁
date: '2026-08-09 14:30:00'
tags:
  - Hexo
  - anzhiyu
  - 音乐播放器
  - 教程
categories:
  - 技术分享
ai: true
description: 翻页即断歌的终极解法：audio 常驻 body 隐藏容器 + patch APlayer 原型三件套（destroy/initAudio/setAudio）+ sessionStorage 状态恢复，实现 pjax 切页声音零中断。
pubDate: '2026-08-09 14:30:00'
---

## 开头：翻页断歌，是博客播放器的原罪

博客是 pjax 单页应用：点文章链接，只换 `body-wrap` 内容。音乐播放器装在 `body-wrap` 之外，本不该受影响——但主题的 pjax 逻辑会 `destroy()` 所有非 fixed 的 APlayer，而 APlayer 的 `destroy()` 会执行 `pause() + audio.src=""`。**结果：每点一次链接，歌就断了。**

更隐蔽的坑在后面：等你想修复时，会发现定制版 APlayer（`lrcType: 0`）的模板顶层类不是 `.aplayer` 而是 `.aplayer-body`，主题自带的实例判断全部失效——修一个 bug 撞出三个坑。本文给出最终方案：**audio 常驻 body 隐藏容器 + 原型三连 patch + 状态落盘恢复**。

## 目标声明 + 前置条件

本文带你完成：pjax 切页（含整页刷新）时，左下角播放器**歌曲不断、进度不丢、播放状态保持**，声音零中断。

**前置条件：**

- [x] anzhiyu v1.7.1+（定制版 APlayer，代码在 `themes/anzhiyu/source/js/utils.js`）
- [x] 懂 pjax 生命周期（`pjax:send` / `pjax:complete`）
- [x] 可本地起 `hexo s` 验证

**你将学会：**

1. 为什么「容器放对位置」还不够，必须 patch APlayer 原型
2. destroy / initAudio / setAudio 三个 patch 各自解决什么问题
3. sessionStorage 双保险恢复策略
4. 无 patch 能力时的降级方案（无缝接力）

---

## Step 1：audio 常驻 body 隐藏容器

> 目的：让 audio 元素脱离 pjax 重建范围，任何翻页都不碰它。做完这步翻页时声音不会因元素销毁而断。

**操作：** 在 `utils.js` 的 `initNavMusicPlayer()` 开头，把 audio 挂到 body 下的隐藏容器（而非播放器 UI 壳内）：

```js
// audio 常驻 body 隐藏容器：pjax 只重建 UI 壳，audio 永不脱离/暂停（与首页右上角播放器同架构）
let persistentHolder = document.getElementById("nav-music-persistent-container");
if (!persistentHolder) {
  persistentHolder = document.createElement("div");
  persistentHolder.id = "nav-music-persistent-container";
  persistentHolder.style.display = "none";
  document.body.appendChild(persistentHolder);
}
```

播放器 UI 壳（`#nav-music-aplayer`）在 pjax 时被替换，但 audio 元素挂在 body 下的隐藏容器中——pjax 只清 `body-wrap`，碰不到它。

**预期输出：** 控制台 `document.querySelector("#nav-music-persistent-container audio")` 存在且不随翻页消失；翻页瞬间声音不中断。

> ⚠️ **报错排查**：容器必须挂在 `document.body` 而非播放器容器内，否则 pjax 重建容器时 audio 一起被销毁。

---

## Step 2：needInit 判断——避免每次翻页重建

> 目的：pjax 回来后判断「已有实例就直接复用，别重建」。做完这步切页不再重新初始化播放器。

**操作：**

```js
// pjax 不替换 body-wrap 外的 nav-music-aplayer（容器在 body-wrap 之外），
// 定制版 APlayer 模板无 .aplayer 顶层类（为 aplayer-body），这里用 _aplayer 实例判断：
// 已有实例则无需重建 → 切页零中断（audio 常驻持续播放）
const needInit = !navMusicAplayer._aplayer && !navMusicAplayer.querySelector(".aplayer, .aplayer-body");
if (!needInit) return;
```

**预期输出：** 切页后播放器不闪烁重建，歌曲进度连续。

> ⚠️ **报错排查（本系列第一个大坑）**：原判断只查 `.aplayer`，而定制版模板顶层类是 `.aplayer-body`——导致 `needInit` **恒真**，每次 pjax 都重建播放器、audio 被替换、声音中断。两个类必须都判断。

---

## Step 3：patch APlayer 原型三件套

> 目的：让「新实例」复用常驻 audio，且销毁时不带走它。做完这步翻页时声音真正连续。

**操作：** 在构造新 APlayer 之前，patch 原型（仅当容器 id 为 `nav-music-aplayer` 时生效，不影响站内其它播放器）：

**a) destroy patch**——原版 destroy 会 `pause() + src=""`，patch 后只清 UI 壳：

```js
APlayer.prototype.destroy = function () {
  if (this.container && this.container.id === "nav-music-aplayer") {
    this.paused = true; this.timer && this.timer.destroy();
    this.container.innerHTML = "";
    this.events && this.events.trigger && this.events.trigger("destroy");
    return;
  }
  return origDestroy.call(this);
};
```

**b) initAudio patch**——新实例的 `this.audio` 直接指向常驻 audio，并把 audioEvents 监听重绑到常驻元素上，最后恢复音量：

```js
// 关键：新 APlayer 复用 persistent 容器里的常驻 audio（而非新建），
// 同曲时跳过 src 赋值，避免重载与 loadedmetadata→seek(0) 复位进度
```

**c) setAudio patch**——同 URL 时直接 return，跳过 src 赋值：

```js
// 复用后 src 相同不重载 → 播放零中断
```

> 完整实现见 `utils.js:865-920`。构造结束在 `finally` 里**立即还原原型**（`utils.js:934-937`），避免污染后续实例。

**预期输出：** 切页后 audio 仍是同一个元素（`persistentHolder.querySelector("audio") === navPlayer.audio`），声音无缝。

> ⚠️ **报错排查**：patch 忘还原会导致全局 APlayer 行为异常（站内其它播放器也被带偏）；`destroy` patch 必须保留事件触发，否则主题的销毁监听失效。

---

## Step 4：实例级 seek 覆写 + 进度恢复

> 目的：防 `loadedmetadata → seek(0)` 把进度复位，并恢复切页前的播放进度。做完这步进度不归零。

**操作：**

```js
if (canReuse && oldState) {
  const origSeekFn = navPlayer.seek.bind(navPlayer);
  navPlayer.seek = function (time) {
    if (time === 0 && this.audio && !this.audio.paused) return;  // 防 loadedmetadata→seek(0) 复位
    return origSeekFn(time);
  };
  if (oldState.time > 1) {
    if (navPlayer.audio.readyState >= 1) navPlayer.audio.currentTime = oldState.time;
    else navPlayer.audio.addEventListener("loadedmetadata", () => { navPlayer.audio.currentTime = oldState.time; }, { once: true });
  }
  if (oldState.playing && !navPlayer.audio.paused) { /* setUIPlaying + bar.set("played") */ }
  else if (oldState.playing) { navPlayer.play(); }
}
```

**预期输出：** 切页后歌曲从断点继续（而非从 0 重来）。

> ⚠️ **报错排查**：APlayer 的 `seek()` 有 `duration=NaN` 钳制会归零，所以直接操作 `audio.currentTime` 绕过，`readyState` 不够就等 `loadedmetadata`。

---

## Step 5：状态双保险——pjax:send + pagehide 落盘

> 目的：pjax 切页走内存恢复，**整页刷新**走 sessionStorage 恢复。做完这步刷新页面也能续播。

**操作：**

```js
if (!window._navMusicStateBound) {
  window._navMusicStateBound = true;
  document.addEventListener("pjax:send", () => { /* 内存捕获 url/time/playing */ });
  window.addEventListener("pagehide", () => {
    if (persistentAudio && persistentAudio.currentSrc) {
      try {
        sessionStorage.setItem("navMusicState", JSON.stringify({ url, time, playing }));
      } catch (e) {}
    }
  });
}
// 恢复：读即删（一次性）
const raw = sessionStorage.getItem("navMusicState");
if (raw) { savedState = JSON.parse(raw); sessionStorage.removeItem("navMusicState"); }
```

**预期输出：** 刷新页面后，播放器自动续播原歌曲、原进度、原播放状态。

> ⚠️ **报错排查**：sessionStorage 读取后必须 removeItem，否则每次刷新都重复恢复（或覆盖新选择）；`pagehide` 用 `beforeunload` 也行但 pagehide 兼容性更稳。

---

## Step 6（降级）：无 initAudio 时的无缝接力

> 目的：老版本 APlayer 没有 `initAudio` 函数时，退回「新 audio 后台预载 → 就绪接力」。做完这步兼容老版本。

**操作：** `utils.js:966-992` 已实现：新 audio `loadeddata` 后 `seek(oldState.time) → play()`，再停旧 audio 并清空 persistentAudio（`handOver` 防重复，2.5s 兜底超时强制接力）。

**预期输出：** 无法复用实例时，切页瞬间短暂静音但播放不从头开始（接力续播）。

---

## 检查点：验证整体效果

> 全部勾选通过 = 切页零中断达成。

- [x] 播放中连续翻 5 个页面，声音无中断
- [x] 切页后歌曲进度不归零（从断点继续）
- [x] 刷新页面（F5）后自动续播原曲
- [x] `persistentHolder.querySelector("audio")` 全程是同一元素
- [x] 站内其它 APlayer（音乐馆页）行为正常（patch 未污染）

---

## 常见问题（FAQ）

| 问题 | 原因 | 解决 |
|------|------|------|
| 切页还是断歌 | needInit 恒真 / 容器位置不对 | 补 `.aplayer-body` 判断；audio 挂 body 隐藏容器 |
| 进度每次都归零 | loadedmetadata→seek(0) 复位 | 实例级 seek 覆写拦截 0 值 |
| 刷新后不续播 | pagehide 没落盘 / 被误删 | 检查 `_navMusicStateBound` 防重复绑定与读后删除 |
| 音乐馆播放器被影响 | patch 污染全局 | 构造后 finally 还原原型 |
| 播放器闪烁重建 | 实例判断失效 | `_aplayer` + `.aplayer, .aplayer-body` 双判断 |

---

## 总结

切页零中断的本质是「**audio 归 body，UI 归 pjax**」：常驻容器保活 + 原型 patch 保链接 + 落盘保状态。核心要点：

1. **架构第一**：audio 挂 body 隐藏容器，pjax 天然不碰
2. **patch 要克制**：只对 `nav-music-aplayer` 容器生效，用完还原
3. **双保险**：pjax 内存态 + pagehide 落盘，覆盖刷新场景
4. **降级兜底**：老版本无 initAudio 时走预载接力

**延伸阅读：**

- [下一篇：歌词功能——URL 歌词、自绘滚动与竞态根治](https://blog.weiguang.eu.org/2026/08/09/music-player-series/02-lyrics/)
- [验证工具 tools/edge-verify/verify-music-continuity.js](https://github.com/orchidsd/hexo-blog/blob/main/tools/edge-verify/verify-music-continuity.js)
