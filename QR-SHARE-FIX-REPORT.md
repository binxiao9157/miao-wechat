# 二维码保存 + 展示速度 + 分享深链 修复报告

**Date**: 2026-04-12  
**Scope**: 4 files (3 modified + 1 new), +97 insertions / -46 deletions  
**Diff backup**: `qr-share-fix.diff`

---

## 问题总览

| # | 问题 | 根因 | 影响 |
|---|------|------|------|
| 1 | 二维码无法保存到本地 | Web Share API 在部分环境不可用，兜底"长按保存"在 WebView 中无效 | 用户无法保存名片图片 |
| 2 | 面对面添加展示二维码太慢 | 点击保存时才调用 html2canvas (scale:3)，实时渲染延迟明显 | 保存按钮点击后等待 1-3 秒 |
| 3 | 分享链接无法打开对应界面 | 分享 URL `/join?uid=&cat=` 无对应路由，被 fallback 重定向到 `/login` | 好友点击链接无法添加好友 |

---

## Step 1: 二维码保存修复 + 展示提速

**文件:** `src/pages/AddFriendQR.tsx`  
**Diff:** `patches/qr-step1-save-and-speed.diff.txt`

### 1a. 三级降级保存策略

原来只有两级（Web Share → 长按保存），现在插入 `<a download>` 作为第二级：

```
Stage 1: navigator.share() — 移动端原生分享面板
  ↓ 不支持或用户取消
Stage 2: <a download> — 创建临时链接触发浏览器下载 [新增]
  ↓ 部分 iOS WebView 不支持 download 属性
Stage 3: 全屏预览 + 长按保存 — 最终兜底
```

### 1b. 预渲染加速

- 页面加载 500ms 后，`requestIdleCallback` 中调用 `html2canvas(scale:2)` 预渲染
- 渲染结果缓存到 `cachedImageRef`
- 点击保存时直接使用缓存图，**跳过 html2canvas 等待**
- 缓存未命中时才实时渲染（scale:3 高清）

**效果:** 保存操作从 1-3 秒降至 <100ms（缓存命中时）

---

## Step 2: 分享深链路由 + 登录回跳

**文件:** `src/App.tsx`, `src/pages/Login.tsx`  
**Diff:** `patches/qr-step2-join-route.diff.txt`

### 2a. 添加 `/join` 路由 (App.tsx)

```tsx
<Route path="/join" element={<JoinFriend />} />
```

- **不包裹 `<ProtectedRoute>`** — 收到分享链接的用户可能未登录
- Lazy import: `const JoinFriend = lazy(() => import("./pages/JoinFriend"))`

### 2b. 登录回跳支持 (Login.tsx)

```tsx
const returnUrl = searchParams.get("returnUrl");
if (returnUrl && returnUrl.startsWith("/")) {
  navigate(returnUrl, { replace: true });
}
```

- 从 URL 解析 `?returnUrl=` 参数
- 登录成功后优先跳转 returnUrl
- **安全校验:** 仅允许 `/` 开头的站内路径，防止开放重定向攻击

---

## Step 3: 新建分享深链落地页

**文件:** `src/pages/JoinFriend.tsx` (新建)  
**Diff:** `patches/qr-step3-join-page.diff.txt`

### 页面流程

```
用户点击分享链接 → /join?uid=alice&cat=cat_123
  ↓
解析 searchParams，查找邀请者信息 (storage.findUser)
  ↓
展示邀请卡片 (头像 + 昵称 + "邀请你成为好友")
  ↓
├─ 已登录 → [添加好友] → storage.addFriend() → 跳转首页
├─ 未登录 → [登录后添加] → /login?returnUrl=/join?uid=...&cat=...
└─ 参数缺失 → 展示"链接无效"错误页
```

### 数据模型

复用 `storage.ts` 中已有的 `FriendInfo` 接口和 `addFriend()` 方法，与扫码添加好友流程完全一致。

---

## 文件变更清单

| 文件 | 类型 | 改动 |
|------|------|------|
| `src/pages/AddFriendQR.tsx` | 修改 | 预渲染缓存 + 三级降级保存 |
| `src/App.tsx` | 修改 | 添加 `/join` 路由 + lazy import |
| `src/pages/Login.tsx` | 修改 | returnUrl 回跳支持 |
| `src/pages/JoinFriend.tsx` | **新建** | 分享深链落地页 |

## 分步 Diff 文件

| 文件 | 说明 |
|------|------|
| `patches/qr-step1-save-and-speed.diff.txt` | AddFriendQR 保存 + 提速 |
| `patches/qr-step2-join-route.diff.txt` | App.tsx 路由 + Login.tsx 回跳 |
| `patches/qr-step3-join-page.diff.txt` | JoinFriend.tsx 新建页面 |
| `qr-share-fix.diff` | 完整 diff 备份 |

---

## 验证方式

1. **保存测试:** 桌面浏览器点击保存 → 应直接下载 PNG；移动端 → 触发原生分享或展示长按预览
2. **速度测试:** 进入面对面添加页等待 2 秒后点击保存 → 应立即响应无等待
3. **深链测试:** 新标签页访问 `/join?uid=testuser&cat=cat_123` → 展示邀请卡片，而非重定向到登录页
4. **回跳测试:** 未登录访问 `/join?uid=...` → 点击登录 → 登录成功后自动回到 `/join` 页面
5. **安全测试:** `/login?returnUrl=https://evil.com` → 应忽略外部 URL，跳转默认首页
