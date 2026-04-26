# 猫咪视频丢失修复 — Patch 汇总

> 日期：2026-04-25
> 共 3 个 Patch，按优先级排序，每个独立可用

---

## 应用方式

```bash
# 在项目根目录执行
git apply docs/patches/video-fix-patch1.patch
git apply docs/patches/video-fix-patch2.patch
git apply docs/patches/video-fix-patch3.patch
```

如果 `git apply` 失败（上下文已变化），可用 `--3way` 参数尝试三方合并：

```bash
git apply --3way docs/patches/video-fix-patch1.patch
```

---

## Patch 1（P0）：视频 URL 持久化

**文件**：`video-fix-patch1.patch` / `video-fix-patch1.txt`

**修改文件**：
- `server.ts` — 新增 `POST /api/persist-video` 接口 + `/uploads` 静态文件托管
- `src/services/fileManager.ts` — `downloadVideos()` 和 `updateCatVideos()` 调用持久化接口

**解决问题**：火山引擎生成的视频 URL 为临时签名 URL，过期后 404，导致视频不可播放。

**工作原理**：
1. 视频生成完成后，前端调用 `/api/persist-video` 接口
2. 服务端通过 axios 下载视频到 `uploads/videos/{catId}/{action}_{timestamp}.mp4`
3. 返回永久 URL `/uploads/videos/...`，存入 CatInfo
4. `/uploads` 目录通过 express.static 托管，设置 30 天缓存

**详细改动**：

| 文件 | 改动 |
|------|------|
| `server.ts:1` | 新增 `import fs from "fs"` |
| `server.ts:457-493` | 新增 `POST /api/persist-video` 路由 + `/uploads` 静态托管 |
| `fileManager.ts:3-16` | 新增 `persistVideoUrl()` 辅助函数 |
| `fileManager.ts:63-69` | `downloadVideos()` 改为并发持久化所有视频 URL |
| `fileManager.ts:109-116` | `updateCatVideos()` 同样持久化新视频 URL |

**服务器部署注意**：
- 确保服务器有足够磁盘空间（每个视频约 5-20MB）
- `uploads/` 目录需要在 `deploy.sh` 中保留，不被 git pull 覆盖
- 建议将 `uploads/` 加入 `.gitignore`

---

## Patch 2（P0）：pruneStorage 安全改造

**文件**：`video-fix-patch2.patch` / `video-fix-patch2.txt`

**修改文件**：
- `src/services/storage.ts` — 重写 `pruneStorage()` 方法

**解决问题**：localStorage 满时 `pruneStorage()` 直接删除猫咪（只保留 5 只），导致数据丢失。

**工作原理**：
- **旧逻辑**：超过 5 只猫 → `slice` 截断列表，直接丢弃多余猫咪
- **新逻辑**：超过 5 只猫 → 保留最近 5 只 + 当前活跃猫咪的完整数据，对其余猫咪只清理 `placeholderImage` 和 `anchorFrame`（base64 大字段，~100-200KB/只），保留元数据和视频 URL

日记同理：
- **旧逻辑**：超过 10 条 → 截断为 10 条
- **新逻辑**：超过 200 条 → 对旧日记清理 `media`/`mediaData` 字段，保留文字内容

**详细改动**：

| 文件 | 改动 |
|------|------|
| `storage.ts:262-320` | 完全重写 `pruneStorage()` 方法 |

---

## Patch 3（P1）：视频播放容错增强

**文件**：`video-fix-patch3.patch` / `video-fix-patch3.txt`

**修改文件**：
- `src/pages/Home.tsx` — 增强 `handleVideoError()` + 优化错误 UI

**解决问题**：
1. 视频 URL 直接失败时立即显示错误，没有尝试代理重试
2. 错误 UI 中"重新领养"按钮过于突出，容易引导用户误删猫咪数据

**工作原理**：

`handleVideoError()` 增强：
1. 视频加载失败时，先检查当前 URL 类型
2. 如果是外部 URL 且未使用代理 → 自动切换到 `/api/proxy-video?url=...` 重试
3. 如果已经是代理 URL 或本地 URL 仍然失败 → 才显示错误 UI

错误 UI 优化：
- 标题从"视频加载失败"改为"视频暂时无法播放"（降低焦虑感）
- 提示文案增加"猫咪数据不会丢失"（安抚用户）
- "重试播放"按钮保持主要样式
- "重新领养"降级为底部小字链接样式（`text-xs text-white/30 underline`）

**详细改动**：

| 文件 | 改动 |
|------|------|
| `Home.tsx:365-385` | `handleVideoError()` 新增代理 URL 自动重试逻辑 |
| `Home.tsx:593-617` | 错误 UI 文案和按钮样式调整 |

---

## 修复覆盖总结

| 风险 | Patch | 覆盖情况 |
|------|-------|---------|
| 视频 URL 过期 | Patch 1 | 彻底解决 — 视频下载到服务器，永久可访问 |
| pruneStorage 删猫 | Patch 2 | 彻底解决 — 不再删除猫咪，只清理大字段 |
| 播放失败误引导删除 | Patch 3 | 大幅缓解 — 自动代理重试 + 弱化删除按钮 |
| 浏览器清除数据 | 未覆盖 | 需 P2 方案（服务端数据库） |
| 跨设备不同步 | 未覆盖 | 需 P2 方案（服务端数据库） |
