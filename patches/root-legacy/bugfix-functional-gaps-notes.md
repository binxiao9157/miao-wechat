# Miao V1.0 功能缺失修复

> 日期: 2026-04-12
> 目标: 修复代码功能分析中发现的 17 项问题

---

## 修改文件清单

| # | 文件 | 修复类别 |
|---|------|---------|
| 1 | `src/pages/GenerationProgress.tsx` | 高优 - 路由拼写错误 |
| 2 | `src/pages/CatPlayer.tsx` | 高优 - 视频路径兜底 |
| 3 | `src/pages/Home.tsx` | 高优 - 移除外部 CDN 兜底视频 + 清理废弃 ref |
| 4 | `src/services/storage.ts` | 高优 - structuredClone 兼容性 |
| 5 | `src/components/FloatingDebugPanel.tsx` | 高优 - 生产环境防护 |
| 6 | `src/pages/SwitchCompanion.tsx` | 中优 - 添加删除猫咪功能 |
| 7 | `src/pages/TimeLetters.tsx` | 中优 - 实时倒计时 |
| 8 | `src/pages/ScanFriend.tsx` | 中优 - 摄像头权限引导 + 日志 |
| 9 | `src/lib/videoUtils.ts` | 低优 - 帧提取空白帧防护 |

---

## 分步修改详情

### Step 1: 高优修复 — 路由错误 + 视频播放兜底

#### 1a. GenerationProgress 路由拼写错误
- **文件:** `src/pages/GenerationProgress.tsx` (L49)
- **问题:** 重试导航到 `/create-cat`（不存在），用户卡在 404
- **修复:** `/create-cat` → `/create-companion`

#### 1b. CatPlayer 视频路径兜底
- **文件:** `src/pages/CatPlayer.tsx` (L239)
- **问题:** 默认播放 `videoPaths.petting`，新动作体系下猫咪可能只有 `idle`
- **修复:** 兜底链改为 `idle → petting → videoPath → remoteVideoUrl`

#### 1c. Home.tsx 移除外部 CDN 兜底视频
- **文件:** `src/pages/Home.tsx` (L8-10, L536)
- **问题:** 所有视频路径失败后 fallback 到 mixkit.co 外部视频，离线不可用
- **修复:** 移除外部 URL，fallback 为空字符串触发已有的 `loadError` UI

---

### Step 2: 高优修复 — structuredClone 兼容性 + Debug 面板安全

#### 2a. structuredClone polyfill
- **文件:** `src/services/storage.ts` (L151-169)
- **问题:** `structuredClone()` 在 iOS Safari < 15.4 等旧浏览器不可用，直接崩溃
- **修复:** 新增 `safeClone()` 辅助函数，优先 `structuredClone`，fallback 到 `JSON.parse(JSON.stringify())`

#### 2b. FloatingDebugPanel 生产环境防护
- **文件:** `src/components/FloatingDebugPanel.tsx` (L17)
- **问题:** 仅检查 `import.meta.env.DEV`，构建配置错误时 debug 面板会泄露到生产
- **修复:** 双重检查 `import.meta.env.DEV && import.meta.env.MODE === 'development'`

---

### Step 3: 中优修复 — actionRefs 清理

#### 3a. isUnlocking 进度 UI
- **状态:** 已确认 Home.tsx L670-681 已实现 `isUnlocking` UI（"更多动作加载中..."），无需修改

#### 3b. 清理未使用的 clickVideoRef
- **文件:** `src/pages/Home.tsx` (L36, L342)
- **问题:** `clickVideoRef` 在新动作体系中不再映射到任何动作，成为废弃代码
- **修复:** 移除 `clickVideoRef` 的声明和 `handleRetryPlay` 中的调用

---

### Step 4: 中优修复 — 猫咪管理 + 级联删除

#### 4a. 通知页路由
- **状态:** 已确认 `/notifications`（NotificationList 通知列表）和 `/notification-settings`（Notifications 通知设置）是两个不同功能页面，路由设计正确

#### 4b. SwitchCompanion 添加删除猫咪功能
- **文件:** `src/pages/SwitchCompanion.tsx`
- **问题:** 只能切换和新增猫咪，无法删除单只猫咪
- **修复:**
  - 新增 `deletingCat` state 和 `handleDeleteCat` / `confirmDelete` 方法
  - 猫咪卡片左上角添加红色删除按钮（仅在有多只猫咪时显示）
  - 新增确认弹窗（"确定要和 XXX 说再见吗？"）
  - 删除后自动切换到剩余猫咪，若全部删除则跳转 `/empty-cat`

#### 4c. deleteCatById 级联清理
- **状态:** 已确认 base64 数据（anchorFrame、placeholderImage）嵌入 CatInfo 对象内，删除猫咪时随列表一起移除，无需额外清理

---

### Step 5: 中优修复 — TimeLetters 倒计时 + ScanFriend

#### 5a. TimeLetters 添加实时倒计时
- **文件:** `src/pages/TimeLetters.tsx`
- **问题:** 倒计时只显示"还有 N 天"，不会实时更新，用户需手动刷新页面
- **修复:**
  - 新增 `formatCountdown()` 函数，精确显示"X 天 X 小时"或"X 小时 X 分钟"
  - 新增 `setInterval` 每分钟触发一次重渲染
  - 仅在有未解锁信件时启动定时器，已全部解锁时不浪费资源

#### 5b. ScanFriend 摄像头权限引导 + 日志
- **文件:** `src/pages/ScanFriend.tsx`
- **问题:** 摄像头权限被拒时仅显示"无法启动相机"，无引导；scanner cleanup 错误静默吞掉
- **修复:**
  - 区分 `NotAllowedError`（权限被拒）和其他错误，权限被拒时显示系统设置引导
  - scanner cleanup 的 catch 块添加 `console.warn` 日志

---

### Step 6: 低优修复 — 小问题收尾

#### 6a. AddFriendQR html2canvas 错误恢复
- **状态:** 已确认 L127-129 已有 try-catch 和错误提示（"保存失败，请尝试截屏保存"），无需修改

#### 6b. ScanFriend 摄像头权限引导
- 已在 Step 5b 中一并修复

#### 6c. videoUtils 帧提取空白帧防护
- **文件:** `src/lib/videoUtils.ts` (L50-54)
- **问题:** `video.duration` 可能为 0 或 Infinity，seek 到无效位置产生空白帧
- **修复:** 增加 `duration > 0 && duration !== Infinity` 判断，seek 到 `duration - 0.01` 避免超出范围

---

## 修改统计

```
9 files changed, 120 insertions(+), 24 deletions(-)
```

## 备份文件

- `bugfix-functional-gaps.diff` — 标准 diff 文件
- `bugfix-functional-gaps.diff.txt` — diff 的 txt 备份
- `bugfix-functional-gaps-notes.md` — 本文件（修复说明）
- `bugfix-functional-gaps-notes.txt` — 说明的 txt 备份
