# Miao 猫咪视频丢失问题 — 代码层面深度分析

> 日期：2026-04-25
> 基于当前 React 19 + Vite 6 + TypeScript 工程分析

---

## 一、视频数据流架构

```
火山引擎 Ark API
    ↓  生成视频，返回临时 URL
fileManager.downloadVideos()
    ↓  URL 直接透传，不做下载
CatInfo.videoPaths (localStorage)
    ↓  key: u_{username}_cat_list
Home.tsx <video src={远程URL}>
    ↓  浏览器直接请求远程 URL 播放
```

**核心问题：视频从未下载到本地，CatInfo 仅保存火山引擎返回的远程 URL。**

---

## 二、关键源码文件

| 文件 | 行数 | 职责 |
|------|------|------|
| `src/services/storage.ts` | 851 | localStorage 封装，用户前缀隔离，pruneStorage 容量管理 |
| `src/services/fileManager.ts` | 138 | 视频 URL 保存 + CatInfo 入库 |
| `src/services/mediaStorage.ts` | 70 | IndexedDB 媒体存储（日记媒体，非视频） |
| `src/pages/Home.tsx` | 709 | 视频播放、错误处理、重新领养流程 |
| `src/context/AuthContext.tsx` | 112 | 认证状态管理，挂载时清除登录态 |

---

## 三、已识别的 7 个丢失风险点

### 风险 1：远程视频 URL 过期（最高风险）

**文件**：`src/services/fileManager.ts:52-54`

```typescript
for (const [action, url] of Object.entries(videoUrls)) {
  finalPaths[action] = url;  // 直接存远程 URL，不做本地缓存
}
```

火山引擎生成的视频 URL 通常带有时效性签名（如 `X-Expires`），过期后返回 404。用户隔天打开 App，视频全部不可用。

- **影响范围**：所有用户、所有猫咪视频
- **触发概率**：100%（只要 URL 过期时间到达）
- **表现**：视频黑屏或加载失败，用户被迫重新领养

---

### 风险 2：`pruneStorage()` 自动删除猫咪（高风险）

**文件**：`src/services/storage.ts:262-307`

```typescript
// 当 localStorage 写入触发 QuotaExceededError 时执行
const MAX_CATS = 5;
if (cats.length > MAX_CATS) {
  cats = cats.slice(-MAX_CATS);  // 丢弃最早创建的猫咪
}
```

每只猫的 `placeholderImage`（base64, ~200px）和 `anchorFrame`（base64, ~600px）合计约 50-200KB。5 只猫 + 200 条日记 + 积分历史 + 时光信件等数据，容易触碰 localStorage 5MB 上限。

- **触发场景**：用户写日记、换头像、加好友等任何 `storage.set` 操作
- **表现**：最早创建的猫咪悄无声息地被删除

---

### 风险 3：AuthContext 每次挂载清除登录态

**文件**：`src/context/AuthContext.tsx:33`

```typescript
storage.clearCurrentUser();  // 每次 App 启动都执行
```

`clearCurrentUser()` 清除 `current_user` 和 `auth_token`。猫咪数据使用 `u_{username}_` 前缀存储，不直接受影响。但强制重新登录意味着：

- 用户忘记密码或用户名 → 永远无法访问猫咪数据
- 频繁的重新登录体验差，用户可能误判数据已丢失

---

### 风险 4：`deleteCat()` 无保护地删除全部猫咪

**文件**：`src/services/storage.ts:715-718`

```typescript
deleteCat(): void {
  this.set(USER_DATA_KEYS.CAT_LIST, []);   // 清空整个列表！
  this.set(USER_DATA_KEYS.ACTIVE_CAT, '');
}
```

该方法删除**所有**猫咪，没有确认保护、没有软删除。一旦调用，数据不可恢复。

与之对比，`deleteCatById()` 只删除单只猫咪，相对安全：

```typescript
deleteCatById(catId: string): void {
  const list = this.getCatList();
  const updated = list.filter(c => c.id !== catId);
  this.set(USER_DATA_KEYS.CAT_LIST, updated);
  // ...
}
```

---

### 风险 5：浏览器/WebView 清除数据

localStorage 和 IndexedDB 都属于浏览器存储，以下操作导致全部丢失：

| 场景 | 影响 |
|------|------|
| 用户清除浏览器缓存/数据 | 所有数据丢失 |
| iOS Safari 存储压力下自动清理（7 天未访问） | WebView 数据被回收 |
| 更换设备或浏览器 | 数据无法迁移 |
| 无痕/隐私模式关闭 | 所有数据消失 |

---

### 风险 6：视频播放错误处理引导重新领养

**文件**：`src/pages/Home.tsx` — `handleVideoError()`

视频加载失败时显示错误 UI，提供"重新领养"按钮。用户点击后删除当前猫咪并跳转领养流程。

```
视频 URL 过期 → 播放失败 → 用户点击"重新领养" → 猫咪被删除
```

这形成了一个**恶性循环**：URL 过期本身不删数据，但错误处理引导用户主动删除。

---

### 风险 7：localStorage 无跨设备同步

纯客户端存储，手机端生成的猫咪在电脑端不可见，反之亦然。用户换设备后以为数据丢失。

---

## 四、服务器部署风险评估

**结论：风险完全一致，甚至更高。**

服务器部署的是同一套前端代码，数据存储在用户浏览器的 localStorage 中，不在服务器端。

| 风险 | 本地开发 | 服务器部署 |
|------|---------|-----------|
| URL 过期 | 同等 | 同等 |
| pruneStorage 删猫 | 同等 | 同等（多用户并发写入更频繁） |
| 浏览器清数据 | 中等 | **更高**（用户可能用不同浏览器/设备访问） |
| 无持久化后端 | 同等 | 同等 |
| 跨设备不同步 | 不适用 | **更高**（多端访问场景更多） |

---

## 五、解决方案

### 方案 1：视频 URL 持久化（紧急 P0）

将火山引擎生成的临时视频 URL 下载到自己的服务器/对象存储，返回永久可访问的 URL。

**工作量**：2-3 小时

#### 修改 `server.ts` — 新增视频持久化接口

```typescript
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

// 视频持久化接口
app.post('/api/persist-video', async (req, res) => {
  const { videoUrl, catId, action } = req.body;

  // 从火山引擎下载视频
  const response = await fetch(videoUrl);
  const buffer = await response.buffer();

  // 保存到服务器本地
  const dir = path.join(__dirname, 'uploads', 'videos', catId);
  fs.mkdirSync(dir, { recursive: true });

  const filename = `${action}_${Date.now()}.mp4`;
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, buffer);

  // 返回永久 URL
  const permanentUrl = `/uploads/videos/${catId}/${filename}`;
  res.json({ url: permanentUrl });
});

// 静态托管视频目录
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
```

#### 修改 `src/services/fileManager.ts` — 视频入库前先持久化

```typescript
public static async downloadVideos(
  videoUrls: { [key: string]: string },
  groupId: string,
  catName: string,
  avatarUrl: string,
  metadata?: { ... }
): Promise<{ [key: string]: string }> {
  const finalPaths: { [key: string]: string } = {};

  // 将临时 URL 持久化到自有服务器
  for (const [action, url] of Object.entries(videoUrls)) {
    try {
      const resp = await fetch('/api/persist-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl: url, catId: groupId, action })
      });
      const data = await resp.json();
      finalPaths[action] = data.url;  // 使用永久 URL
    } catch {
      finalPaths[action] = url;  // 降级：使用原始 URL
    }
  }

  // ... 后续 CatInfo 入库逻辑不变
}
```

---

### 方案 2：服务端数据库（根本解决 P2）

将猫咪数据从 localStorage 迁移到服务端数据库，彻底解决客户端存储的所有局限性。

**工作量**：1-2 天

#### 新增 `server.ts` — 猫咪 CRUD 接口

```typescript
import Database from 'better-sqlite3';

const db = new Database('miao.db');

// 初始化表结构
db.exec(`
  CREATE TABLE IF NOT EXISTS cats (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    breed TEXT,
    color TEXT,
    avatar TEXT,
    source TEXT,
    created_at INTEGER,
    video_paths TEXT,
    placeholder_image TEXT,
    anchor_frame TEXT
  )
`);

// 保存/更新猫咪
app.post('/api/cats', (req, res) => {
  const { userId, cat } = req.body;
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO cats
    (id, user_id, name, breed, color, avatar, source, created_at,
     video_paths, placeholder_image, anchor_frame)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    cat.id, userId, cat.name, cat.breed, cat.color,
    cat.avatar, cat.source, cat.createdAt,
    JSON.stringify(cat.videoPaths),
    cat.placeholderImage, cat.anchorFrame
  );
  res.json({ success: true });
});

// 获取用户猫咪列表
app.get('/api/cats/:userId', (req, res) => {
  const cats = db.prepare('SELECT * FROM cats WHERE user_id = ?')
    .all(req.params.userId);
  res.json(cats.map(c => ({
    ...c,
    videoPaths: JSON.parse(c.video_paths || '{}')
  })));
});

// 删除单只猫咪（软删除可选）
app.delete('/api/cats/:catId', (req, res) => {
  db.prepare('DELETE FROM cats WHERE id = ?').run(req.params.catId);
  res.json({ success: true });
});
```

#### 修改 `src/services/storage.ts` — 双写策略

```typescript
saveCatInfo(cat: CatInfo): void {
  // 本地写入（保持离线可用）
  const list = this.getCatList();
  const idx = list.findIndex(c => c.id === cat.id);
  if (idx >= 0) list[idx] = cat;
  else list.push(cat);
  this.set(USER_DATA_KEYS.CAT_LIST, list);
  this.setActiveCatId(cat.id);

  // 异步同步到服务端
  const userId = this.get<string>(STORAGE_KEYS.CURRENT_USER);
  if (userId) {
    fetch('/api/cats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, cat })
    }).catch(() => { /* 离线时静默失败 */ });
  }
}
```

---

### 方案 3：`pruneStorage` 安全改造（快速修复 P0）

**工作量**：30 分钟

#### 修改 `src/services/storage.ts` — 释放空间而非删除猫咪

```typescript
pruneStorage(): void {
  const cats = this.getCatList();

  if (cats.length > MAX_CATS) {
    // 不再删除猫咪，改为清理大字段释放空间
    const oldCats = cats.slice(0, -MAX_CATS);
    for (const cat of oldCats) {
      delete cat.placeholderImage;  // 释放 ~100KB/只
      delete cat.anchorFrame;       // 释放 ~50KB/只
    }
    this.set(USER_DATA_KEYS.CAT_LIST, [
      ...oldCats,           // 保留元数据和视频 URL
      ...cats.slice(-MAX_CATS)  // 最近 5 只完整保留
    ]);
  }

  // 日记同理：只清理 media 字段，保留文字内容
  const diaries = this.getDiaryList();
  if (diaries.length > MAX_DIARIES) {
    const oldDiaries = diaries.slice(0, -MAX_DIARIES);
    for (const d of oldDiaries) {
      delete d.media;
    }
    this.set(USER_DATA_KEYS.DIARY_LIST, [
      ...oldDiaries,
      ...diaries.slice(-MAX_DIARIES)
    ]);
  }
}
```

---

### 方案 4：视频播放容错增强（P1）

**工作量**：1 小时

#### 修改 `src/pages/Home.tsx` — URL 失效时自动恢复

```typescript
const handleVideoError = async () => {
  if (!activeCat) return;

  // 第一步：尝试从服务端恢复视频 URL
  try {
    const resp = await fetch(`/api/cats/${activeCat.id}/videos`);
    if (resp.ok) {
      const data = await resp.json();
      if (data.videoPaths && Object.keys(data.videoPaths).length > 0) {
        await FileManager.updateCatVideos(activeCat.id, data.videoPaths);
        // 恢复成功，重新加载视频
        setVideoKey(prev => prev + 1);
        return;
      }
    }
  } catch {
    // 服务端不可用
  }

  // 第二步：服务端也没有，显示友好错误（不直接引导删除）
  setVideoError(true);
  setVideoErrorMessage('视频暂时无法播放，请检查网络后重试');
};
```

---

## 六、实施优先级总览

| 优先级 | 方案 | 工作量 | 解决的风险 | 覆盖率 |
|--------|------|--------|-----------|--------|
| **P0** | 方案 1：视频 URL 持久化 | 2-3 小时 | 风险 1（URL 过期） | ~50% |
| **P0** | 方案 3：pruneStorage 安全改造 | 30 分钟 | 风险 2（自动删猫） | ~20% |
| **P1** | 方案 4：播放容错增强 | 1 小时 | 风险 6（误引导删除） | ~15% |
| **P2** | 方案 2：服务端数据库 | 1-2 天 | 风险 3/4/5/7（全部） | 100% |

**建议先实施 P0 的两个快速修复，覆盖 70% 以上的视频丢失场景。**

方案 2（服务端数据库）作为中期目标，从根本上消除 localStorage 的所有限制，实现跨设备同步和数据永久持久化。
