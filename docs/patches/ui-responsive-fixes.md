# UI 屏幕适配修复 — Patch 汇总

> 日期：2026-04-25
> 共 4 个 Patch（编号 7-10，承接 Patch 1-6），按严重度排列

---

## 背景

iPhone 17、iPhone 14 Pro Max、iPhone SE 等不同机型屏幕尺寸差异导致多个页面出现以下问题：
- 内容超出视口无法滚动（注册按钮不可达）
- 滚动条被隐藏导致用户不知道可以滚动
- 垂直居中布局在小屏上将内容推出视口
- `overflow-hidden` 阻止滚动

**Android 特有问题**：Android Chrome 中 `100vh`（Tailwind `h-screen` / `min-h-screen`）包含浏览器地址栏高度，导致页面容器比可见视口更高，底部内容被裁剪。需要使用 `100dvh`（动态视口高度）替代。

**根本原因**：`index.css` 中 `body { overflow: hidden; position: fixed }` 的全局 app-shell 模式要求每个页面自行处理滚动，但多个页面缺失或限制了滚动能力。

## 应用方式

```bash
# 在项目根目录按顺序执行
git apply docs/patches/ui-responsive-patch7.patch
git apply docs/patches/ui-responsive-patch8.patch
git apply docs/patches/ui-responsive-patch9.patch
git apply docs/patches/ui-responsive-patch10.patch
```

---

## Patch 7（Critical）：登录/注册页面滚动修复

**文件**：`ui-responsive-patch7.patch` / `ui-responsive-patch7.txt`

**修改文件**：
- `src/pages/Login.tsx` — 修复垂直居中导致小屏内容溢出
- `src/pages/Register.tsx` — 修复滚动条隐藏 + 间距过大

### Login.tsx 改动（4 处）

| 改动 | 原值 | 新值 | 说明 |
|------|------|------|------|
| 视口单位 | `min-h-screen` | `min-h-dvh` | Android Chrome 兼容 |
| 内容区布局 | `justify-center py-4` | `justify-start pt-6 py-4` | 从垂直居中改为顶部起始，内容可自然滚动 |
| 标题间距 | `mb-6` | `mb-3` | 缩减标题区域底部间距 |
| 猫咪图片 | `max-w-[240px] mb-8` | `max-w-[180px] mb-4` | 缩小图片 25%，减少下方间距 |

### Register.tsx 改动（4 处）

| 改动 | 原值 | 新值 | 说明 |
|------|------|------|------|
| 视口单位 | `min-h-screen` | `min-h-dvh` | Android Chrome 兼容 |
| 滚动条 | `overflow-y-auto no-scrollbar` | `overflow-y-auto` | 移除 `no-scrollbar`，显示滚动条提示用户 |
| header 间距 | `mb-12` | `mb-6` | 缩减 header 底部间距 |
| 返回按钮间距 | `mb-8` | `mb-4` | 缩减返回按钮到标题的间距 |

---

## Patch 8（High/Medium）：内容页面溢出修复

**文件**：`ui-responsive-patch8.patch` / `ui-responsive-patch8.txt`

**修改文件**：
- `src/pages/CreateCompanion.tsx` — 减少底部内边距 + dvh 修复
- `src/pages/EditProfile.tsx` — 修复 overflow-hidden 阻止滚动 + dvh 修复
- `src/pages/UploadMaterial.tsx` — 限制图片预览最大高度 + dvh 修复

### CreateCompanion.tsx 改动（2 处）

| 改动 | 原值 | 新值 | 说明 |
|------|------|------|------|
| 视口单位 | `h-screen` | `h-dvh` | Android Chrome 兼容（最关键 — 精确高度被裁剪） |
| 滚动区底部填充 | `pb-40`（160px） | `pb-32`（128px） | 减少固定按钮遮挡空间，仍有足够间距 |

### EditProfile.tsx 改动（2 处）

| 改动 | 原值 | 新值 | 说明 |
|------|------|------|------|
| 视口单位 | `min-h-screen` | `min-h-dvh` | Android Chrome 兼容 |
| 溢出处理 | `overflow-hidden` | `overflow-y-auto` | 允许内容超出时垂直滚动 |

### UploadMaterial.tsx 改动（2 处）

| 改动 | 原值 | 新值 | 说明 |
|------|------|------|------|
| 视口单位 | `min-h-screen` | `min-h-dvh` | Android Chrome 兼容 |
| 图片预览高度 | `w-full aspect-square` | `w-full max-h-[45dvh] aspect-square` | 限制图片最大高度为动态视口 45%，小屏自动缩放 |

---

## Patch 9（Android 兼容）：全局 `100vh` → `100dvh` 视口修复

**文件**：`ui-responsive-patch9.patch` / `ui-responsive-patch9.txt`

### 问题说明

Android Chrome 中 `100vh` 包含浏览器地址栏/导航栏的高度，导致：
- 页面容器实际高度 > 可见视口，底部内容被裁剪
- 模态框使用 `90vh` 时超出可见区域
- `position: fixed; inset: 0` 的根容器已正确限定可见区域，但子页面的 `min-h-screen`（100vh）会比容器更高

**解决方案**：`dvh`（Dynamic Viewport Height）— 动态视口高度，排除浏览器 UI 元素。支持 Chrome 108+、Safari 15.4+、Firefox 107+，覆盖所有现代移动设备。

### 修改文件（18 个）

**页面容器 `min-h-screen` → `min-h-dvh`（15 个页面）**

| 文件 | 说明 |
|------|------|
| `src/App.tsx` | Suspense 加载态容器 |
| `src/pages/AccompanyMilestonePage.tsx` | 陪伴里程碑页面 |
| `src/pages/AddFriendQR.tsx` | 加友二维码页面（2 处：错误态 + 空猫态） |
| `src/pages/CatHistory.tsx` | 猫咪历史页面 |
| `src/pages/ChangePassword.tsx` | 修改密码页面 |
| `src/pages/Download.tsx` | 下载页面 |
| `src/pages/EmptyCatPage.tsx` | 无猫引导页 |
| `src/pages/Feedback.tsx` | 反馈成功态 |
| `src/pages/GenerationProgress.tsx` | AI 生成进度页面 |
| `src/pages/JoinFriend.tsx` | 加入好友页面（2 处：错误态 + 主页面） |
| `src/pages/PrivacyPolicy.tsx` | 隐私政策页面 |
| `src/pages/PrivacySettings.tsx` | 隐私设置页面 |
| `src/pages/ResetPassword.tsx` | 重置密码页面 |
| `src/pages/SwitchCompanion.tsx` | 切换伴侣页面 |
| `src/pages/TermsOfService.tsx` | 服务条款页面 |
| `src/pages/Welcome.tsx` | 欢迎/领养入口页面 |

**模态框 `vh` → `dvh`（3 个组件）**

| 文件 | 原值 | 新值 | 说明 |
|------|------|------|------|
| `src/components/AdminPresetConfig.tsx` | `max-h-[80vh]` | `max-h-[80dvh]` | 管理预设弹窗 |
| `src/components/PrivateMessageShare.tsx` | `h-[90vh]` | `h-[90dvh]` | 私信分享弹窗 |
| `src/pages/Welcome.tsx` | `max-h-[90vh]` | `max-h-[90dvh]` | 调试配置弹窗 |

---

## Patch 10（全量修复）：独立页面滚动缺失

**文件**：`ui-responsive-patch10.patch` / `ui-responsive-patch10.txt`

### 问题说明

全部 29 个页面逐一审计后发现：所有非 MainLayout 子路由的页面均为**独立路由**，直接渲染在 `position: fixed; overflow: hidden` 的 `#root` 容器中。如果页面自身不声明 `overflow-y-auto`，内容超出视口时完全无法滚动。

Patch 7-9 修复了 Login、Register、CreateCompanion、EditProfile、UploadMaterial 5 个页面，但遗漏了以下 9 个独立页面。

### 全量审计结果

**29 个页面分类**：

| 类型 | 页面 | 滚动来源 | 数量 |
|------|------|---------|------|
| MainLayout Tab 页 | Home, Diary, TimeLetters, NotificationList, Points, Profile | MainLayout 提供 `overflow-y-auto` | 6 |
| 独立页面（已有滚动） | Login, Register, EditProfile, Download, Feedback, AddFriendQR, CreateCompanion, PrivacyPolicy, TermsOfService, Notifications | 自身 `overflow-y-auto` 或内部滚动容器 | 10 |
| 独立页面（设计无需滚动） | Home(全屏视频), CatPlayer(全屏视频), ScanFriend(全屏扫码), EmptyCatPage(居中内容) | `overflow-hidden` 合理 | 4 |
| **独立页面（缺失滚动）** | **以下 9 个** | **无** | **9** |

### 修改文件（9 个）

**Critical（内容明确超出视口）**

| 文件 | 原值 | 新值 | 说明 |
|------|------|------|------|
| `src/pages/ChangePassword.tsx` | `overflow-hidden` | `overflow-y-auto` | 3 个密码输入框 + 按钮，`overflow-hidden` 完全阻止滚动 |
| `src/pages/UploadMaterial.tsx` | 无 overflow | `overflow-y-auto` | 大图预览 + 输入框 + 按钮；同时缩减间距 `mb-10→mb-6`, `mt-12→mt-8` |

**High（内容随数据增长超出视口）**

| 文件 | 原值 | 新值 | 说明 |
|------|------|------|------|
| `src/pages/CatHistory.tsx` | 无 overflow | `overflow-y-auto` | 猫咪历史网格，3+ 只猫时超出 |
| `src/pages/SwitchCompanion.tsx` | 无 overflow | `overflow-y-auto` | 伴侣切换网格，同上 |
| `src/pages/ResetPassword.tsx` | 无 overflow | `overflow-y-auto` | 3 个输入框 + 按钮 |

**Medium（内容接近视口边界）**

| 文件 | 原值 | 新值 | 说明 |
|------|------|------|------|
| `src/pages/Welcome.tsx` | 无 overflow | `overflow-y-auto` | 两张大卡片 + 页脚 |
| `src/pages/AccompanyMilestonePage.tsx` | 无 overflow | `overflow-y-auto` | 里程碑卡片列表 |

**Low（防御性修复）**

| 文件 | 原值 | 新值 | 说明 |
|------|------|------|------|
| `src/pages/GenerationProgress.tsx` | 无 overflow | `overflow-y-auto` | 居中进度内容，防御未来扩展 |
| `src/pages/JoinFriend.tsx`（2 处） | 无 overflow | `overflow-y-auto` | 错误态 + 主页面，均为居中内容 |

---

## 验证方式

1. Chrome DevTools 模拟：iPhone SE (375×667) / iPhone 14 Pro Max (430×932)
2. **Android 验证**：Chrome DevTools → Pixel 7 (412×915) / Samsung Galaxy S21 (360×800)
3. **Register 页面**：三个输入框 + 复选框 + 注册按钮全部可见或可滚动到达，滚动条可见
4. **Login 页面**：猫咪图片 + 表单 + 登录/注册按钮均可访问
5. **CreateCompanion 页面**：品种选择可完整滚动，底部按钮完整可见
6. **EditProfile 页面**：所有表单项可滚动访问
7. **UploadMaterial 页面**：图片预览不超过视口一半，下方昵称输入框和生成按钮可滚动到达
8. **ChangePassword 页面**：3 个密码输入框 + 保存按钮全部可见或可滚动到达
9. **CatHistory / SwitchCompanion 页面**：多只猫咪时网格可完整滚动
10. **Android Chrome 地址栏**：收起/展开地址栏时页面高度自适应，无内容裁剪

---

## `dvh` 单位兼容性

| 浏览器 | 最低支持版本 | 发布日期 |
|--------|-------------|---------|
| Chrome (Android) | 108 | 2022-12 |
| Safari (iOS) | 15.4 | 2022-03 |
| Firefox (Android) | 107 | 2022-11 |
| Samsung Internet | 21.0 | 2023-09 |

**结论**：所有 2023 年后的移动设备均支持 `dvh`，无需 fallback。

---

## 修复覆盖更新（含 Patch 1-10）

| 风险 | Patch | 状态 |
|------|-------|------|
| 视频 URL 过期 | Patch 1 | 已解决 |
| pruneStorage 删猫 | Patch 2 | 已解决 |
| 播放失败误引导删除 | Patch 3 | 已缓解 |
| 浏览器清除数据 | Patch 4-6 | 已解决 |
| 跨设备不同步 | Patch 4-6 | 已解决 |
| 登录/注册页面小屏不可达 | Patch 7 | 已解决 |
| 内容页面溢出不可滚动 | Patch 8 | 已解决 |
| Android Chrome 100vh 视口溢出 | Patch 9 | 已解决 |
| 独立页面滚动缺失（全量修复） | **Patch 10** | **已解决** |
