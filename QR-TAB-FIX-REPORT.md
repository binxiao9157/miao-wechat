# 二维码保存失败 + Tab 切换 Loading 修复报告

**Date**: 2026-04-12  
**Scope**: 2 files, +23 insertions / -35 deletions  
**Diff backup**: `qr-tab-fix.diff`

---

## 问题总览

| # | 问题 | 表现 | 根因 |
|---|------|------|------|
| 1 | 二维码无法保存 | 提示"保存失败，请尝试截屏保存" | html2canvas 对 motion.div 截图失败 + 跨域图片 allowTaint:false 报错 |
| 2 | Tab 切换 loading 圆圈 | 首次打开切换页面时出现旋转加载动画 | 6 个 tab 页用 lazy() 加载，首次切换触发 Suspense fallback |

---

## Step 1: 修复二维码保存失败

**文件:** `src/pages/AddFriendQR.tsx`  
**Diff:** `patches/fix-qr-save.diff.txt`

### 根因分析

html2canvas 进入 catch 抛出"保存失败"的原因链：

1. **motion.div 干扰截图** — QR 卡片容器是 `motion.div`，带 `initial={{ opacity: 0, y: 20 }}` 入场动画。html2canvas 对 motion 内部的 transform/opacity 处理不稳定，可能截到空白或报错
2. **跨域图片 + allowTaint:false** — 头像图片的 `toDataURL()` 转换失败后（CORS），html2canvas 用 `allowTaint: false` 渲染时遇到 tainted canvas 直接报错
3. **预渲染时机过早** — 500ms 延迟可能不足以等待 motion 动画完成，预渲染失败后 cachedImageRef 为 null，实时渲染时同样遇到上述问题

### 修复内容

| 改动 | 说明 |
|------|------|
| motion.div → div 拆分 | 外层 `motion.div` 负责入场动画，内层普通 `div` 挂载 ref 供截图 |
| allowTaint: true | 预渲染 + 实时渲染两处都改为 `true`，容忍跨域图片不报错 |
| 预渲染延迟 1500ms | 从 500ms 增加到 1500ms，确保动画完成 + DOM 稳定后再截图 |
| Blob URL 下载 | `<a download>` 从 data URL 改为 Blob URL，兼容更多浏览器 |

---

## Step 2: 消除 Tab 切换 Loading 圆圈

**文件:** `src/components/layout/MainLayout.tsx`  
**Diff:** `patches/fix-tab-loading.diff.txt`

### 根因分析

```
用户首次打开 App → 首屏加载 Home 页
  ↓
点击"日志" tab → DiaryPage 是 lazy()，chunk 还没下载
  ↓
React Suspense 捕获 → 全屏 spinner 出现
  ↓
chunk 下载完成 → spinner 消失，页面渲染
```

预加载逻辑（requestIdleCallback / setTimeout 2s）无法保证在用户点击前完成。

### 修复内容

| 改动 | 说明 |
|------|------|
| lazy → 同步 import | 6 个 tab 页（Home/Diary/TimeLetters/NotificationList/Points/Profile）改为同步 import |
| 删除预加载 useEffect | lazy 已移除，预加载逻辑不再需要 |
| 移除 Suspense 包裹 | tab 页面不再 suspend，Suspense 边界无用 |

**Trade-off:** 首屏 JS bundle 略增（6 个 tab 页合并到主包），但这些是核心高频页面，数量有限，换来的是零延迟 tab 切换体验。

---

## 文件变更清单

| 文件 | 改动 |
|------|------|
| `src/pages/AddFriendQR.tsx` | motion.div 拆分 + allowTaint + Blob URL + 延迟调整 |
| `src/components/layout/MainLayout.tsx` | lazy → 同步 import, 去 Suspense + 预加载 |

## 分步 Diff 文件

| 文件 | 说明 |
|------|------|
| `patches/fix-qr-save.diff.txt` | Step 1: 二维码保存修复 |
| `patches/fix-tab-loading.diff.txt` | Step 2: Tab loading 消除 |
| `qr-tab-fix.diff` | 完整 diff 备份 |

---

## 验证方式

1. **二维码保存:** 进入面对面添加页 → 点击保存按钮 → 应成功下载图片或弹出分享面板，不再提示"保存失败"
2. **Tab 切换:** 首次打开 App → 快速点击底部各 tab → 页面应立即切换，不再出现 loading 圆圈
