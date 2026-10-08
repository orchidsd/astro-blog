---
title: Hexo anzhiyu 主题深度定制系列（二）：51.LA 双 SDK 统计与 AI 摘要三模式
date: '2026-07-30 10:30:00'
tags:
  - Hexo
  - anzhiyu
  - 统计分析
  - AI 摘要
categories:
  - 技术分享
ai: true
description: 详解 51.LA 流量统计+雀灵性能监控双 SDK 动态注入实现，以及文章顶部 AI 摘要的 local/tianli/openai 三模式切换、缓存机制与自动化配置。
pubDate: '2026-07-30 10:30:00'
---

## 前言

本篇聚焦两个「用户感知最强」的功能：**统计分析**与 **AI 摘要**。前者决定你能不能看懂流量，后者决定读者能不能 3 秒读懂文章。

---

## 1. 51.LA 双 SDK：流量统计 + 性能监控

### 1.1 为什么要双 SDK？

| SDK | 采集指标 | 典型场景 |
|-----|----------|----------|
| **js-sdk-pro** (流量) | PV/UV、来源、地域、设备、停留时长、热力图 | 运营看板、内容选题 |
| **perf/js-sdk-perf** (雀灵) | FCP/LCP/CLS/FID、JS 错误、资源加载耗时、慢接口 | 前端性能优化、异常告警 |

两者**独立初始化、互不干扰**，同一 `ck` 可复用。

### 1.2 配置入口（`_config.anzhiyu.yml`）

```yaml
LA:
  enable: true
  ck: 3QhmqTheuIeNJHd9                    # 站点 ID = ck
  LingQueMonitorID: 3QhhHg4cYX5by8v8      # 雀灵监控 ID（单独申请）
```

### 1.3 动态注入实现（`themes/anzhiyu/source/js/anzhiyu/main.js`）

```javascript
// 入口：pjax:complete / 首次加载 时调用
function statistics51aInit() {
  const LA51 = GLOBAL_CONFIG.LA51;
  if (!LA51 || !LA51.ck) return;

  // 通用脚本加载器（Promise 化、去重、charset、id、crossorigin）
  const loadScript = (url, charset = "UTF-8", crossorigin, id) => {
    return new Promise((resolve, reject) => {
      if (document.getElementById(id)) return resolve(); // 去重
      const script = document.createElement("script");
      script.src = url;
      script.async = true;
      if (id) script.setAttribute("id", id);
      if (charset) script.setAttribute("charset", charset);
      if (crossorigin) script.setAttribute("crossorigin", crossorigin);
      script.onerror = reject;
      script.onload = script.onreadystatechange = function () {
        const rs = this.readyState;
        if (rs && rs !== "loaded" && rs !== "complete") return;
        script.onload = script.onreadystatechange = null;
        resolve();
      };
      document.head.appendChild(script);
    });
  };

  // 1️⃣ 加载流量统计 SDK
  loadScript("https://sdk.51.la/js-sdk-pro.min.js", "UTF-8", false, "LA_COLLECT")
    .then(() => {
      LA.init({
        id: LA51.ck,
        ck: LA51.ck,
        autoTrack: true,    // 自动采集 PV/UV/点击/表单
        hashMode: true      // SPA/hash 路由自动上报
      });
    })
    .catch(() => {});

  // 2️⃣ 加载雀灵性能监控 SDK（可选）
  if (LA51.LingQueMonitorID) {
    loadScript("https://sdk.51.la/perf/js-sdk-perf.min.js", "UTF-8", "anonymous")
      .then(() => {
        new LingQue.Monitor().init({
          id: LA51.LingQueMonitorID,
          sendSuspicious: true  // 采集可疑错误
        });
      })
      .catch(() => {});
  }
}

// 挂载到全局，pjax 回调复用
window.statistics51aInit = statistics51aInit;
```

### 1.4 关键参数解析

| 参数 | 值 | 作用 |
|------|-----|------|
| `autoTrack: true` | 自动采集 | 无需埋点代码，自动上报页面浏览、链接点击、表单提交 |
| `hashMode: true` | SPA 兼容 | `pjax` 切换页面时 `location.hash` 变化自动触发 `pageview` |
| `sendSuspicious: true` | 可疑错误 | 捕获 `Script error.` 等跨域报错，辅助定位 |

### 1.5 备选方案：静态注入（`inject.head`）

```yaml
inject:
  head:
    # 取消注释以下 4 行，同时注释 main.js 调用，即可切换为静态注入
    # - <script charset="UTF-8" id="LA_COLLECT" src="https://sdk.51.la/js-sdk-pro.min.js"></script>
    # - <script>LA.init({id:"3QhmqTheuIeNJHd9",ck:"3QhmqTheuIeNJHd9",autoTrack:true,hashMode:true})</script>
    # - <script src="https://sdk.51.la/perf/js-sdk-perf.min.js" crossorigin="anonymous"></script>
    # - <script>new LingQue.Monitor().init({id:"3QhhHg4cYX5by8v8",sendSuspicious:true})</script>
```

> **切换原则**：动态注入 = 按需加载、不阻塞首屏、pjax 友好；静态注入 = 更早采集首屏 PV、适合无 pjax 站点。**二选一，别同时开启。**

### 1.6 敏感信息管理（CI/CD 注入）

```yaml
# .github/workflows/deploy.yml
- name: Generate config
  run: |
    cat > _config.anzhiyu.yml <<EOF
    LA:
      enable: true
      ck: ${{ secrets.LA_CK }}
      LingQueMonitorID: ${{ secrets.LA_LINGQUE_ID }}
    ...
    EOF
```

**本地开发** 用 `_config.anzhiyu.local.yml`（`.gitignore`），CI 合并生成最终配置。

---

## 2. 文章顶部 AI 摘要：三模式切换

### 2.1 效果演示

文章标题下方出现一行：
> 🤖 **Yoki**：这是一篇关于 Hexo anzhiyu 主题配置的技术笔记，涵盖 51.LA 统计...

点击 🔄 刷新图标可清除缓存重新生成。

### 2.2 配置全景（`_config.anzhiyu.yml`）

```yaml
post_head_ai_description:
  enable: true
  gptName: Yoki                    # 显示标签名
  mode: openai                     # local / tianli / openai
  switchBtn: false                 # 是否显示模式切换按钮
  btnLink: https://ifdian.net/a/yokipeek  # 失败时「去赞助」链接
  randomNum: 3                     # local 模式随机摘要数
  basicWordCount: 1000             # 发送给 API 的最小字数
  key: xxxx                        # tianli 模式 API Key
  Referer: https://xx.xx/          # tianli 模式 Referer
  openai:
    apiUrl: https://api.agnes-ai.cn/v1/chat/completions
    model: agnes-2.0-flash
    apiKey: sk-xxx                 # ⚠️ 勿提交仓库
    systemPrompt: 你是一个文章摘要助手，请使用简洁的中文概括以下文章的核心内容，不超过200字
    maxTokens: 500
    temperature: 0.7
```

### 2.3 三种模式对比

| 模式 | 数据来源 | 优点 | 缺点 | 适用场景 |
|------|----------|------|------|----------|
| **local** | Front-matter `ai:` 字段 | 零成本、零延迟、可控 | 需手写/预先生成 | 文章少、追求极致可控 |
| **tianli** | TianliGPT API | 免费、中文优化 | 限频、稳定性依赖第三方 | 个人博客、不想折腾 Key |
| **openai** | OpenAI 兼容 API | 模型可选、质量高、支持长文 | 需 Key、有成本 | 追求质量、有预算、自建代理 |

### 2.4 核心逻辑（`themes/anzhiyu/source/js/anzhiyu/ai_abstract.js`）

```javascript
class AIAbstract {
  constructor() {
    this.config = GLOBAL_CONFIG.aiAbstract;
    this.cacheKey = 'ai_abstract_cache';
    this.cacheTTL = 24 * 60 * 60 * 1000; // 24h
  }

  async init() {
    if (!this.config.enable) return;
    const article = document.querySelector('article');
    if (!article) return;

    const content = this.extractText(article);
    if (content.length < this.config.basicWordCount) return;

    const cache = this.getCache(content);
    if (cache) return this.render(cache);

    // 无缓存 → 调用对应模式 API
    let summary;
    switch (this.config.mode) {
      case 'local':
        summary = this.getLocalSummary();
        break;
      case 'tianli':
        summary = await this.callTianli(content);
        break;
      case 'openai':
        summary = await this.callOpenAI(content);
        break;
    }

    if (summary) {
      this.setCache(content, summary);
      this.render(summary);
    }
  }

  // OpenAI 兼容调用（含自动补全 /chat/completions）
  async callOpenAI(text) {
    const { apiUrl, model, apiKey, systemPrompt, maxTokens, temperature } = this.config.openai;
    const url = apiUrl.endsWith('/chat/completions') ? apiUrl : apiUrl.replace(/\/+$/, '') + '/chat/completions';

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text.slice(0, 8000) }
        ],
        max_tokens: maxTokens,
        temperature
      })
    });

    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim();
  }

  // 24h localStorage 缓存
  getCache(text) {
    const hash = this.hashText(text);
    const item = JSON.parse(localStorage.getItem(this.cacheKey) || '{}');
    if (item[hash] && Date.now() - item[hash].time < this.cacheTTL) {
      return item[hash].summary;
    }
    return null;
  }

  setCache(text, summary) {
    const hash = this.hashText(text);
    const item = JSON.parse(localStorage.getItem(this.cacheKey) || '{}');
    item[hash] = { summary, time: Date.now() };
    localStorage.setItem(this.cacheKey, JSON.stringify(item));
  }

  // 刷新按钮 → 清除缓存重试
  bindRefresh() {
    document.querySelector('.ai-abstract-refresh')?.addEventListener('click', () => {
      const hash = this.hashText(this.extractText(document.querySelector('article')));
      const item = JSON.parse(localStorage.getItem(this.cacheKey) || '{}');
      delete item[hash];
      localStorage.setItem(this.cacheKey, JSON.stringify(item));
      location.reload();
    });
  }
}
```

### 2.5 缓存机制详解

| 维度 | 说明 |
|------|------|
| **键** | `ai_abstract_cache` (localStorage) |
| **子键** | 文章文本 SHA-256 前 16 位 |
| **值** | `{ summary: "...", time: 1722345678901 }` |
| **TTL** | 24 小时（`cacheTTL`） |
| **失效** | 手动点击 🔄 / 文章内容变更 / 手动清 localStorage |

> **为什么不缓存到服务端？** 纯静态站点无后端，localStorage 零成本、零配置、用户端自动隔离。

### 2.6 自动开启新文章摘要（`scaffolds/post.md`）

```markdown
---
title: {{ title }}
date: {{ date }}
tags:
categories:
cover:
ai: true          # ← 关键：新文章默认开启 AI 摘要
description:
---
```

`hexo new post "标题"` 生成的文章自带 `ai: true`，配合 `mode: openai` 即**零手工**生成摘要。

### 2.7 常见问题

| 现象 | 排查 |
|------|------|
| 摘要不显示 | 文章字数 < `basicWordCount` (默认 1000) / `ai: false` / 控制台报错 |
| 报 `401 Unauthorized` | `apiKey` 失效 / 代理拦截 / `Authorization` 头未发送 |
| 刷新按钮无反应 | `bindRefresh` 未绑定 / pjax 后未重新初始化 → `pjax:complete` 里调用 `AIAbstract.init()` |
| 中英文混排截断 | `maxTokens` 偏小 / `temperature` 过高 → 调大 `maxTokens`、降低 `temperature` |

---

## 3. 迁移清单：从 tianli 切到 openai

1. 申请/自建 OpenAI 兼容代理（如 One API、New API、Agnes）
2. `_config.anzhiyu.yml` 修改 `mode: openai` + 填入 `openai.*` 全块
3. `apiUrl` **必须**以 `/chat/completions` 结尾（代码会自动补全，但显式写全更稳）
4. `systemPrompt` 根据模型特性微调（如 `agnes-2.0-flash` 适合短摘要）
5. 本地 `hexo clean && hexo s` 验证 → 推送触发 CI 部署

---

## 4. 小结

| 功能 | 关键点 |
|------|--------|
| **51.LA 双 SDK** | 动态注入 + `autoTrack/hashMode` + 雀灵性能监控 + CI 注入密钥 |
| **AI 摘要三模式** | local/tianli/openai 运行时切换 + 24h localStorage 缓存 + 刷新清缓存 |
| **自动化** | 脚手架预置 `ai: true`，新文零配置生成摘要 |

---

## 5. 下一篇预告

**《友链页顶部区块 + 底部版权栏 + 音乐页/时钟/代码注入等杂项配置》**

敬请期待！