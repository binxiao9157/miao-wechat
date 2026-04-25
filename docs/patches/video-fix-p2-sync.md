# P2 方案：跨设备猫咪数据同步 — Patch 汇总

> 日期：2026-04-25
> 共 3 个 Patch（编号 4-6，承接 Patch 1-3），按依赖顺序排列

---

## 背景

Patch 1 已将视频文件持久化到服务器 `uploads/videos/`，但猫咪元数据（CatInfo：名字、视频 URL 映射等）仍然只存在浏览器 localStorage 中。用户换设备、换浏览器、清除缓存后，数据全部丢失。

**本方案解决**：在服务端存储猫咪元数据，登录时自动同步恢复。

## 技术选型

使用 **JSON 文件数据库**（`data/users.json` + `data/cats.json`），零依赖安装：
- 当前项目无数据库依赖，JSON 文件足以支撑小规模用户量
- 服务器部署无需编译 native 模块（对比 SQLite）
- 后续可平滑迁移到真实数据库

---

## 应用方式

```bash
# 在项目根目录按顺序执行
git apply docs/patches/video-fix-patch4.patch
git apply docs/patches/video-fix-patch5.patch
git apply docs/patches/video-fix-patch6.patch
```

---

## Patch 4：服务端用户注册/登录 + 猫咪 CRUD 接口

**文件**：`video-fix-patch4.patch` / `video-fix-patch4.txt`

**修改文件**：
- `server.ts` — 新增 JSON 文件数据库 + 6 个 API 接口
- `.gitignore` — 新增 `data/` 和 `uploads/` 排除

**新增接口**：

| 方法 | 路径 | 功能 |
|------|------|------|
| `POST` | `/api/auth/register` | 注册用户，写入 `data/users.json` |
| `POST` | `/api/auth/login` | 验证用户名密码，返回用户信息 |
| `GET` | `/api/cats/:userId` | 获取指定用户的猫咪列表 |
| `POST` | `/api/cats` | 保存/更新猫咪（upsert），接收 `{ userId, cat }` |
| `DELETE` | `/api/cats/:userId/:catId` | 删除指定猫咪 |
| `DELETE` | `/api/cats/:userId` | 删除用户所有猫咪 |

**数据存储**：
- `data/users.json` — 用户列表 `[{ username, password, nickname, avatar }]`
- `data/cats.json` — 猫咪列表 `[{ userId, id, name, videoPaths, ... }]`
- 启动时自动创建 `data/` 目录

**注意**：`placeholderImage` 和 `anchorFrame`（base64 大字段）不同步到服务端，节省存储。

---

## Patch 5：前端双写 — localStorage + 服务端同步

**文件**：`video-fix-patch5.patch` / `video-fix-patch5.txt`

**修改文件**：
- `src/services/storage.ts` — 新增同步辅助函数 + 修改 3 个方法

**工作原理**：

每次本地操作后，异步同步到服务端（不阻塞 UI）：

```
saveCatInfo(cat)    → localStorage 写入 → POST /api/cats
deleteCatById(id)   → localStorage 删除 → DELETE /api/cats/:userId/:catId
deleteCat()         → localStorage 清空 → DELETE /api/cats/:userId
```

**新增辅助函数**（模块顶层）：

| 函数 | 功能 |
|------|------|
| `getCurrentUsername()` | 从 localStorage 读取当前登录用户名 |
| `syncCatToServer(userId, cat)` | POST 单只猫咪到服务端 |
| `deleteCatFromServer(userId, catId)` | DELETE 单只猫咪 |
| `deleteAllCatsFromServer(userId)` | DELETE 用户所有猫咪 |

**新增存储方法**：

| 方法 | 功能 |
|------|------|
| `syncFromServer(username)` | 从服务端拉取猫咪列表，与本地合并 |

**合并策略**（`syncFromServer`）：
- 服务端有、本地无 → 插入本地
- 本地有、服务端无 → 上传到服务端
- 都有 → 以 `createdAt` 较新的为准

---

## Patch 6：登录时从服务端恢复猫咪数据

**文件**：`video-fix-patch6.patch` / `video-fix-patch6.txt`

**修改文件**：
- `src/context/AuthContext.tsx` — `login()` 和 `register()` 调用服务端 API

**工作原理**：

```
用户登录
  ↓
1. 本地验证（原有逻辑，不变）
  ↓
2. 异步调用 POST /api/auth/login（服务端验证）
  ↓
3. 异步调用 storage.syncFromServer(username)
  ↓
4. 合并服务端猫咪数据到本地 → 刷新 UI
```

注册同理：
- 异步调用 `POST /api/auth/register` 将用户信息写入服务端
- 新账号无猫咪，无需同步

**关键设计**：所有服务端调用均为异步（`.catch(() => {})`），不阻塞登录流程。离线时退化为纯本地模式。

---

## 数据流全景

```
浏览器 A（生成猫咪）                    服务器                          浏览器 B（恢复）
┌──────────────┐                 ┌──────────────────┐             ┌──────────────┐
│ 生成猫咪      │                 │ data/cats.json   │             │ 登录同账号    │
│ saveCatInfo() │──异步 POST──→  │  [{userId, cat}] │  ←──GET──── │ syncFromServer│
│ localStorage  │                 │                  │             │ → 合并到本地   │
│  u_tom_cats   │                 │ uploads/videos/  │             │ localStorage  │
│              │                 │  cat123/idle.mp4 │  ←─<video>─ │  u_tom_cats   │
└──────────────┘                 └──────────────────┘             └──────────────┘
```

---

## 验证方式

1. **浏览器 A**：注册账号 → 生成猫咪 → 确认视频可播放
2. **浏览器 B**（或无痕模式）：用同一账号登录
3. **验证**：猫咪列表已恢复，视频可播放（因 Patch 1 已持久化到 `/uploads/`）
4. **离线验证**：断网后登录，应退化为纯本地模式，不报错

## 服务器部署注意

- `data/` 和 `uploads/` 目录需在 `deploy.sh` 中保留（已加入 `.gitignore`）
- 建议定期备份 `data/` 目录
- 当用户量增长到数千级别时，考虑迁移到 SQLite 或 PostgreSQL

---

## 修复覆盖更新（含 Patch 1-6）

| 风险 | Patch | 状态 |
|------|-------|------|
| 视频 URL 过期 | Patch 1 | 已解决 |
| pruneStorage 删猫 | Patch 2 | 已解决 |
| 播放失败误引导删除 | Patch 3 | 已缓解 |
| 浏览器清除数据 | **Patch 4-6** | **已解决** — 服务端保留数据副本 |
| 跨设备不同步 | **Patch 4-6** | **已解决** — 登录时自动恢复 |
