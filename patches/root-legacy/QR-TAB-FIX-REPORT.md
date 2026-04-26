# 二维码保存失败 + Tab 切换 Loading 修复报告

**Date**: 2026-04-12  
**Scope**: 2 files, +23 insertions / -35 deletions  
**Diff backup**: `qr-tab-fix.diff`

---

## 问题总览

| # | 问题 | 表现 | 根因 | 最终方案 |
|---|------|------|------|----------|
| 1 | 二维码无法保存 | 提示"保存失败，请尝试截屏保存" | html2canvas 对 motion.div + 跨域图片 + 复杂 DOM 截图不稳定 | 移除 html2canvas，纯 Canvas 2D 手绘名片图 |
| 2 | Tab 切换 loading 圆圈 | 首次打开切换页面时出现旋转加载动画 | lazy() 加载 + 共享 Suspense fallback | 保留 lazy + 微任务预加载 + 独立 Suspense(null) |

---

## Step 1: 修复二维码保存失败

**文件:** `src/pages/AddFriendQR.tsx`  
**Diff:** `patches/fix-qr-save.diff.txt`

### 根因分析

html2canvas 多次尝试均失败的原因链：

1. **motion.div 干扰截图** — QR 卡片容器被 motion.div 包裹，html2canvas 对 transform/opacity 动画元素截图不稳定
2. **跨域图片** — 头像图片跨域导致 canvas tainted，无论 allowTaint 设置如何都可能失败
3. **html2canvas 本身不稳定** — 对复杂 DOM 结构（圆角、渐变、嵌套裁剪）的兼容性差

### 修复内容（最终方案：移除 html2canvas，纯 Canvas 2D 绘制）

| 改动 | 说明 |
|------|------|
| 移除 html2canvas 依赖 | 完全不依赖第三方截图库，消除所有 html2canvas 相关问题 |
| 纯 Canvas 2D 绘制名片 | `renderCardToCanvas()` 手动绘制背景、头像、文字、QR码等全部元素 |
| QR 码直接从 DOM 拷贝 | `qrCardRef.current?.querySelector('canvas')` 获取 QRCodeCanvas 渲染的 canvas 元素 |
| 头像加载容错 | `loadImage()` 跨域失败返回 null，`drawCircleAvatar()` 自动绘制 emoji 占位符 |
| 3 倍缩放高清输出 | 320×480 → 960×1440 像素，保证保存图片清晰度 |
| 三级下载降级 | Web Share API → `<a download>` Blob URL → 长按保存预览 |

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
| 保留 lazy() | 维持 code-splitting，首屏只下载当前 tab 代码，不牺牲初始加载速度 |
| 预加载提前到微任务 | `requestIdleCallback/setTimeout(2s)` → `Promise.resolve().then()`，首帧渲染后立即触发 |
| 独立 Suspense(fallback=null) | 共享全屏 spinner → 每个 tab 独立 Suspense，chunk 未就绪时保持空白而非全屏动画 |

**策略:** 保留 code-splitting 优势 + 立即预加载确保 chunk 快速就绪 + 独立 Suspense 消除全屏 spinner 视觉干扰。

---

## 文件变更清单

| 文件 | 改动 |
|------|------|
| `src/pages/AddFriendQR.tsx` | 移除 html2canvas，纯 Canvas 2D 绘制名片 + 三级下载降级 |
| `src/components/layout/MainLayout.tsx` | 保留 lazy + 微任务预加载 + 独立 Suspense(fallback=null) |

## 分步 Diff 文件

| 文件 | 说明 |
|------|------|
| `patches/fix-qr-save.diff.txt` | Step 1: 二维码保存修复（html2canvas 阶段，已废弃） |
| `patches/fix-qr-save-canvas.diff.txt` | Step 1 最终版: 纯 Canvas 2D 绘制（移除 html2canvas） |
| `patches/fix-tab-loading.diff.txt` | Step 2: Tab loading 消除 |
| `qr-tab-fix.diff` | 完整 diff 备份 |

---

## 验证方式

1. **二维码保存:** 进入面对面添加页 → 点击保存按钮 → 应成功下载图片或弹出分享面板，不再提示"保存失败"
2. **Tab 切换:** 首次打开 App → 快速点击底部各 tab → 页面应立即切换，不再出现 loading 圆圈
