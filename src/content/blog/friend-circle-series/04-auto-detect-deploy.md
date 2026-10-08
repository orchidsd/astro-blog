---
title: 友链自动检测与自动部署（GitHub Actions）
date: '2026-07-31 08:40:00'
tags:
  - Hexo
  - GitHub Actions
  - 自动化
  - 系列教程
categories:
  - 技术分享
ai: true
description: 用 GitHub Actions 实现友链每日自动检测：读后端 /friend 的 error 字段自动归类失联友链、自动构建、自动推送到部署产物仓库、Cloudflare 自动上线，并复盘过程中踩过的三个坑。
pubDate: '2026-07-31 08:40:00'
---

## 一、目标

每天自动做这件事：

```
1. 读后端 /friend 的 error 字段（后端每 3 小时更新）
2. 把 error=true 的友链移入 link.yml 的失联组
3. 把 error=false 的友链移回正常组
4. 有变化 → 自动构建 hexo → 推送到 orchidsd.github.io
5. Cloudflare Git 集成检测到推送 → 自动部署上线
```

全流程无人值守。友链失效/恢复，**页面 24 小时内自动反映**。

## 二、检测脚本 friend-check.js

位置：`friend-check/friend-check.js`（放这里而不是 `scripts/`，因为 Hexo 会加载 `scripts/` 下所有 js）

### 为什么用"后端 error"而不是自己探测

第一版是脚本直接发 HTTP 请求探测友链。结果踩坑：**GitHub Actions 的数据中心 IP 被部分国内友链站屏蔽**（如 `akilar.top`），导致正常友链被误判失联。而**后端跑在 Vercel 环境，能访问所有友链**，且它的 `error` 语义（能否抓到文章）和朋友圈显示一致。所以最终方案：**读后端 error 字段，本地只做"搬运"**。

```js
'use strict';
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const LINK_FILE = path.join(__dirname, '..', 'source', '_data', 'link.yml');
const FRIEND_API = process.env.FRIEND_API || 'https://fc.weiguang.eu.org/friend';

function norm(url) { return String(url || '').replace(/\/+$/, ''); }

async function fetchFriendErrors() {
  const res = await fetch(FRIEND_API, {
    headers: { 'User-Agent': 'friend-check/1.0' },
    timeout: 15000,
  });
  if (!res.ok) throw new Error(`friend API -> HTTP ${res.status}`);
  const list = await res.json();
  if (!Array.isArray(list)) throw new Error('friend API returned a non-array payload');
  const map = new Map();
  for (const f of list) if (f && f.link) map.set(norm(f.link), Boolean(f.error));
  return map;
}

async function main() {
  const data = yaml.load(fs.readFileSync(LINK_FILE, 'utf8'));
  if (!Array.isArray(data)) { console.error('ERROR: link.yml is not a list'); process.exit(1); }

  let errMap;
  try {
    errMap = await fetchFriendErrors();
  } catch (e) {
    console.error(`WARN: cannot reach friend API (${e.message}); leaving link.yml untouched`);
    return;   // 后端不可达时绝不乱动 link.yml
  }

  const normalGroups = data.filter((g) => !g.lost_contact && Array.isArray(g.link_list));
  const lostGroup = data.find((g) => g.lost_contact) || null;

  const entries = [];
  for (const g of normalGroups) for (const it of g.link_list) entries.push({ it, from: 'normal' });
  if (lostGroup) for (const it of lostGroup.link_list) entries.push({ it, from: 'lost' });

  if (entries.length === 0) { console.log('No friends to check.'); return; }

  const classified = entries.map((e) => {
    const key = norm(e.it.link);
    const known = errMap.has(key);
    return { ...e, error: known ? errMap.get(key) : false, known };
  });

  const normalList = classified.filter((c) => !c.error).map((c) => c.it);
  const lostList = classified.filter((c) => c.error).map((c) => c.it);

  // 写回 link.yml：正常组放第一组，失联组单独
  if (normalGroups.length === 0) {
    data.unshift({ class_name: '友谊长存', class_desc: '那些人，那些事',
      flink_style: 'anzhiyu', hundredSuffix: '', link_list: normalList });
  } else {
    for (const g of normalGroups) g.link_list = [];
    normalGroups[0].link_list = normalList;
  }
  if (!lostGroup) {
    data.push({ class_name: '失联友链', class_desc: '已失联的友链',
      lost_contact: true, flink_style: 'anzhiyu', hundredSuffix: '', link_list: lostList });
  } else {
    lostGroup.link_list = lostList;
  }

  fs.writeFileSync(LINK_FILE, yaml.dump(data, { lineWidth: 200, noRefs: true }));

  const unknown = classified.filter((c) => !c.known).map((c) => c.it.name);
  console.log(`classified: ${entries.length}, normal: ${normalList.length}, lost: ${lostList.length}`);
  for (const c of classified)
    console.log(`  [${c.error ? 'lost' : 'ok'}]${c.known ? '' : ' (untracked)'} ${c.it.name} ${c.it.link}`);
  if (unknown.length) console.log(`WARN: not yet tracked by backend (kept in normal group): ${unknown.join(', ')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

**设计要点**：
- 链接先 `norm()`（去尾部斜杠）再匹配，避免 `https://a.com/` 和 `https://a.com` 对不上
- 后端不认识的友链（`!known`）保守留在正常组，等后端下次抓取
- 后端 API 不可达时直接退出不改文件，绝不误删数据

## 三、Workflow：friend-check.yml

位置：`.github/workflows/friend-check.yml`

```yaml
name: Friend Check & Deploy

on:
  schedule:
    - cron: '0 4 * * *'        # 每天 UTC 04:00（北京时间 12:00）
  workflow_dispatch:            # 手动触发

permissions:
  contents: write

jobs:
  check:
    runs-on: ubuntu-latest
    outputs:
      changed: ${{ steps.check.outputs.changed }}   # ⚠️ 必须声明，否则下游读不到
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - name: Install js-yaml
        run: npm install --no-save js-yaml
      - name: Run friend check
        id: check
        run: |
          node friend-check/friend-check.js
          if [ -n "$(git status --porcelain source/_data/link.yml)" ]; then
            echo "changed=true" >> "$GITHUB_OUTPUT"
          else
            echo "changed=false" >> "$GITHUB_OUTPUT"
          fi
      - name: Commit and push classified friends
        if: steps.check.outputs.changed == 'true'
        run: |
          git config user.name "friend-check[bot]"
          git config user.email "friend-check[bot]@users.noreply.github.com"
          git add source/_data/link.yml
          git commit -m "chore: auto-classify friends by availability"
          git push

  deploy:
    needs: check
    runs-on: ubuntu-latest
    if: needs.check.outputs.changed == 'true'       # 只有真的变化才部署
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - name: Install dependencies
        run: npm ci
      - name: Build site
        run: npx hexo generate
      - name: Deploy to GitHub Pages
        env:
          PAT: ${{ secrets.PAT }}
        run: |
          if [ -z "$PAT" ]; then
            echo "::warning::PAT secret not configured, skipping deploy"
            exit 0
          fi
          cd public
          git init
          git branch -m main                       # ⚠️ 见坑 2
          git config user.name "friend-check[bot]"
          git config user.email "friend-check[bot]@users.noreply.github.com"
          git add -A
          git commit -m "deploy: update friends (auto)"
          git push -f "https://x-access-token:${PAT}@github.com/orchidsd/orchidsd.github.io.git" main
```

## 四、三个真实的坑（已修复）

### 坑 1：job 没暴露 outputs，deploy 永远被跳过

```yaml
outputs:
  changed: ${{ steps.check.outputs.changed }}
```

GitHub Actions 里 **job 级别的 `outputs` 必须显式声明**，否则 `needs.check.outputs.changed` 一直是空，`deploy` job 的 `if` 永远不成立。

**症状**：check 明明检测到变化并提交了，但 deploy job 显示 `skipped`。

### 坑 2：git init 默认分支是 master，push main 失败

Actions runner 上 `git init` 创建的仓库默认分支是 `master`，而 push 指定 `main`：

```
error: src refspec main does not match any
```

**修复**：`git init` 后加 `git branch -m main`。

### 坑 3：用 HTTP 探测被站点屏蔽（GitHub Actions IP）

第一版脚本直接请求友链域名，`akilar.top` 这类对数据中心 IP 有防护的站点全部"假失联"。**改成读后端 error 字段后彻底解决**（后端 Vercel 环境访问无限制）。

## 五、PAT Secret 配置

`deploy` job 用 PAT（Personal Access Token）把 public/ 推到部署产物仓库：

1. GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens**
2. 勾选 `orchidsd.github.io` 仓库的 **Contents: Read and write**
3. 博客仓库 → Settings → Secrets and variables → Actions → New repository secret
4. Name：`PAT`，Value：粘贴 token

## 六、验证全链路

```bash
# 手动触发一次
gh workflow run -R orchidsd/hexo-blog friend-check.yml

# 观察 run
gh run list -R orchidsd/hexo-blog --workflow friend-check.yml
```

**期望输出**：
- `check` job：`classified: 11, normal: 11, lost: 0`
- 无变化时 `deploy` skipped；有变化时 `deploy` success
- 线上 `/link/` 24 小时内反映新分组

## 七、真实故障演练记录

这套流程在实战中跑通过完整闭环：

| 场景 | 结果 |
|------|------|
| Akilar 真实失联（后端判定） | ✅ 自动移入失联组 |
| 模拟 kmar.top 失效 | ✅ 自动移入失联组 |
| kmar.top 恢复 | ✅ 自动移回正常组 |
| Akilar 恢复（后端 error=0） | ✅ 自动归位 |
| deploy 推送 orchidsd.github.io | ✅ `deploy: update friends (auto)` |
| CF 自动上线 | ✅ 部署历史可见 |

> 下一篇：朋友圈页面的"失联 N"统计是怎么显示出来的。
