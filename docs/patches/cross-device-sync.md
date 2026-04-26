# Patch 17: 跨设备数据同步 — 日记/信件/积分

> 日期: 2026-04-26
> Patch 文件: `cross-device-sync-patch17.txt`

---

## 背景

Patch 15-16 解决了跨设备登录问题，但用户发现**日记记录、时光信件、积分信息**不会跨设备同步。原因是 P2 阶段仅为猫咪数据建立了服务端 CRUD + 双写，其他数据仅存 localStorage。

## 修改范围

| 文件 | 改动 |
|------|------|
| `server.ts` | 新增 9 个 API 端点（日记/信件/积分各 GET/POST/DELETE） |
| `src/services/storage.ts` | 新增 5 个双写函数 + 扩展 `syncFromServer` 合并四类数据 |

---

## Step A: 服务端 API（server.ts）

### 新增数据文件

| 文件 | 存储内容 |
|------|---------|
| `data/diaries.json` | 所有用户的日记条目 |
| `data/letters.json` | 所有用户的时光信件 |
| `data/points.json` | 所有用户的积分快照 |

### 新增端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/diaries/:userId` | 获取用户所有日记 |
| POST | `/api/diaries` | 创建/更新日记 `{userId, diary}` |
| DELETE | `/api/diaries/:userId/:diaryId` | 删除单条日记 |
| GET | `/api/letters/:userId` | 获取用户所有信件 |
| POST | `/api/letters` | 创建/更新信件 `{userId, letter}` |
| DELETE | `/api/letters/:userId/:letterId` | 删除单封信件 |
| GET | `/api/points/:userId` | 获取用户积分 |
| POST | `/api/points` | 覆盖保存积分 `{userId, data}` |

所有端点遵循与猫咪 API 相同的模式：JSON 文件存储 + 按 userId 隔离。

---

## Step B: 客户端双写 + 登录同步（storage.ts）

### 新增双写辅助函数

| 函数 | 触发时机 |
|------|---------|
| `syncDiaryToServer(userId, diary)` | `saveDiaries()` 时逐条上传，跳过 indexeddb: 开头的媒体 |
| `deleteDiaryFromServer(userId, id)` | `deleteDiary()` 时同步删除 |
| `syncLetterToServer(userId, letter)` | `saveTimeLetters()` 时逐条上传 |
| `deleteLetterFromServer(userId, id)` | `deleteTimeLetter()` 时同步删除 |
| `syncPointsToServer(userId, data)` | `savePoints()` 时整体覆盖上传 |

所有双写均为 fire-and-forget（`.catch(() => {})`），不阻塞 UI，离线时静默失败。

### 扩展 syncFromServer

登录时 `syncFromServer(username)` 现在按顺序拉取并合并四类数据：

1. **猫咪** — 按 `createdAt` 取较新的一方（原有逻辑不变）
2. **日记** — 按 `createdAt` 取较新的，合并后按时间倒序排列
3. **信件** — 按 `createdAt` 取较新的，合并后按时间倒序排列
4. **积分** — 取 `total` 较高的一方为准

合并策略：
- 同 ID 条目：比较时间戳/总分，保留较新/较高的
- 仅本地有：保留并上传到服务端
- 仅服务端有：拉取到本地

---

## 数据同步覆盖表（更新后）

| 数据类型 | 服务端 API | 双写 | 登录同步 | 状态 |
|---------|-----------|------|---------|------|
| 用户账号 | ✅ | ✅ | ✅ | ✅ 已同步 |
| 猫咪列表 | ✅ | ✅ | ✅ | ✅ 已同步 |
| **日记记录** | ✅ | ✅ | ✅ | ✅ **新增** |
| **时光信件** | ✅ | ✅ | ✅ | ✅ **新增** |
| **积分信息** | ✅ | ✅ | ✅ | ✅ **新增** |
| 好友列表 | ❌ | ❌ | ❌ | 🔴 仅本地 |
| 用户设置 | ❌ | ❌ | ❌ | 🔴 仅本地 |

> 好友和设置为低优先级数据，暂不同步。

---

## 验证步骤

1. **日记同步**: 设备 A 写日记 → 设备 B 登录 → 应看到同一条日记
2. **信件同步**: 设备 A 写信件 → 设备 B 登录 → 应看到同一封信件
3. **积分同步**: 设备 A 获得积分 → 设备 B 登录 → 积分总额一致
4. **删除同步**: 设备 A 删除日记 → 设备 B 重新登录 → 该条日记消失
5. **冲突合并**: 两设备离线各写日记 → 联网登录 → 两条日记均保留
6. **服务端数据文件**: SSH 登录服务器 → `cat ~/app/data/diaries.json` 确认数据已写入
