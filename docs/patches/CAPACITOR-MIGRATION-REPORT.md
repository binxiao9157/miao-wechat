# Capacitor 原生 App 迁移 — Patch 说明文档

> 生成日期: 2026-04-20
> 分支: `migration/capacitor`
> 迁移策略: 用 Capacitor 包装现有 PWA，95% 代码复用，快速上架应用商店

---

## Patch 文件清单

| 文件 | 对应提交 | 说明 |
|------|----------|------|
| `capacitor-phase1-scaffold-native.patch.txt` | `1f706ec` | Phase 1 — 项目脚手架 + 平台抽象层 + 原生能力集成 |
| `capacitor-phase2-native-storage-camera.patch.txt` | `81ba592` | Phase 2 — 原生存储持久化 + Camera 拍照/相册适配 |

---

## Phase 1: 项目脚手架 + 平台抽象层 + 原生能力集成

**提交**: `1f706ec` | **日期**: 2026-04-19 | **规模**: 89 文件, +3,037 / -30 行

### 核心变更

#### 1. Capacitor 初始化
- 包名 `tech.mmdd10.miao`，生成 `android/` 和 `ios/` 原生工程目录
- 新增 `capacitor.config.ts` 配置文件
- 安装 9 个 Capacitor 插件:
  - `@capacitor/camera` — 拍照 & 相册
  - `@capacitor/share` — 原生分享
  - `@capacitor/clipboard` — 剪贴板
  - `@capacitor/status-bar` — 状态栏控制
  - `@capacitor/splash-screen` — 启动屏
  - `@capacitor/app` — 应用生命周期
  - `@capacitor/haptics` — 触觉反馈
  - `@capacitor/keyboard` — 键盘管理
  - `@capacitor/preferences` — 原生 KV 存储

#### 2. 平台抽象层
- **`src/utils/platform.ts`** — 平台检测工具 (`isNative` / `isIOS` / `isAndroid`)
- **`src/config/api.ts`** — API 基础 URL 抽象，原生 App 指向远程服务器
- **`src/services/shareService.ts`** — 原生/Web 分享 & 剪贴板双路径适配
- **`src/services/cameraService.ts`** — Camera 插件封装
- **`src/services/scannerService.ts`** — 扫码服务初始化

#### 3. 原生能力集成
- **`src/utils/nativeInit.ts`** — 启动时初始化状态栏、启动屏
- **`src/hooks/useBackButton.ts`** — Android 物理返回键处理
- **`src/utils/deepLinks.ts`** — Deep Link 路由支持
- **`src/main.tsx`** — 条件注册 Service Worker（原生环境跳过）
- **`src/components/InstallPromptBanner.tsx`** — PWA 安装横幅在原生环境自动隐藏

#### 4. 服务端适配
- **`server.ts`** — 添加 CORS 支持 Capacitor 来源（`capacitor://localhost`）
- **`src/services/volcanoService.ts`** — 4 处 API 调用加 URL 前缀

#### 5. 原生工程文件（模板）
- `android/` — Android 工程完整目录（Gradle 构建、AndroidManifest、启动屏资源、图标）
- `ios/` — iOS 工程完整目录（Xcode 项目、AppDelegate、LaunchScreen、图标资源）

### 涉及文件列表

| 类别 | 文件 |
|------|------|
| 配置 | `capacitor.config.ts`, `package.json`, `.gitignore` |
| 平台工具 | `src/utils/platform.ts`, `src/config/api.ts` |
| 原生服务 | `src/services/cameraService.ts`, `src/services/scannerService.ts`, `src/services/shareService.ts` |
| 初始化 | `src/utils/nativeInit.ts`, `src/utils/deepLinks.ts`, `src/hooks/useBackButton.ts` |
| 应用入口 | `src/main.tsx`, `src/App.tsx`, `src/components/InstallPromptBanner.tsx` |
| 服务端 | `server.ts`, `src/services/volcanoService.ts` |
| Android 工程 | `android/**` (54 文件) |
| iOS 工程 | `ios/**` (16 文件) |

---

## Phase 2: 原生存储持久化 + Camera 拍照/相册适配

**提交**: `81ba592` | **日期**: 2026-04-20 | **规模**: 8 文件, +325 / -89 行

### 核心变更

#### 1. 原生存储持久化
- **`src/services/nativeStorage.ts`** (新增) — 封装 Capacitor Preferences API
  - `saveAuthToNative()` — 将 auth token、用户信息写入原生 KV 存储
  - `restoreAuthFromNative()` — 启动时从 Preferences 恢复到 localStorage
  - 解决 WebView 缓存被系统清理后登录状态丢失的问题
- **`src/services/storage.ts`** — 登录/登出时同步调用 nativeStorage
- **`src/utils/nativeInit.ts`** — 启动序列中加入 `restoreAuthFromNative()`

#### 2. 扫码功能重构
- **`src/services/scannerService.ts`** — 拆分为 camera / gallery 两入口
  - `scanFromCamera()` — 拍照后用 html5-qrcode 解码
  - `scanFromGallery()` — 从相册选图后解码
  - 原生端不再使用实时摄像头流（WebView 兼容性差）
- **`src/pages/ScanFriend.tsx`** — 大幅重构
  - 原生端: 显示"拍照扫码"/"相册选图"两个按钮，替代视频流
  - Web 端: 保持原有 html5-qrcode 实时扫描
  - 新增扫码结果展示和错误处理 UI

#### 3. 图片选择原生适配
- **`src/pages/Diary.tsx`** — 日记添加图片走 Capacitor Camera
- **`src/pages/EditProfile.tsx`** — 头像选择走 Capacitor Camera + 客户端压缩（400px / JPEG 0.7）
- **`src/pages/UploadMaterial.tsx`** — 素材上传走 Capacitor Camera

### 涉及文件列表

| 类别 | 文件 | 变更 |
|------|------|------|
| 新增服务 | `src/services/nativeStorage.ts` | +48 行，原生 KV 存储适配层 |
| 存储层 | `src/services/storage.ts` | +47/-1，登录登出同步原生存储 |
| 扫码服务 | `src/services/scannerService.ts` | +48/-6，拆分 camera/gallery |
| 扫码页面 | `src/pages/ScanFriend.tsx` | +176/-89，原生/Web 双路径 UI |
| 日记页面 | `src/pages/Diary.tsx` | +30/-7，原生图片选择 |
| 编辑资料 | `src/pages/EditProfile.tsx` | +48/-1，头像原生选择+压缩 |
| 素材上传 | `src/pages/UploadMaterial.tsx` | +13/-1，原生图片选择 |
| 初始化 | `src/utils/nativeInit.ts` | +4，启动恢复原生存储 |

---

## 应用方式

```bash
# 应用 Phase 1 patch
git apply docs/patches/capacitor-phase1-scaffold-native.patch.txt

# 应用 Phase 2 patch
git apply docs/patches/capacitor-phase2-native-storage-camera.patch.txt
```

> 注: patch 由 `git format-patch` 生成，包含完整的提交信息，也可用 `git am` 应用以保留 commit 记录。
