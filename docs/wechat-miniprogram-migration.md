# Miao 微信小程序迁移 — 技术方案分析（v2）

> 日期：2026-04-25（更新版，基于 P0-P2 修复后的最新架构）
> 基于 React 19 + Vite 6 + TypeScript 5.8 工程分析

---

## 一、当前架构全景

| 层次 | 技术栈 | 规模 |
|------|--------|------|
| **前端框架** | React 19 + TypeScript 5.8 + Vite 6 | 29 页面，15 组件，26 条路由 |
| **UI/样式** | Tailwind CSS 4 + Motion 12 (Framer) + Lucide 图标 | 暖色自定义设计系统，37 处动画 |
| **状态管理** | Context API (AuthContext) + localStorage + 5 个 CustomEvent | 无 Redux/Zustand |
| **存储** | localStorage（用户前缀隔离）+ IndexedDB（日记媒体）+ 服务端 JSON 文件 DB | 双写策略，登录同步 |
| **后端** | Express.js + 火山引擎 Ark API + JSON 文件持久化 | 12 个 API 端点 |
| **视频** | 服务端持久化 `uploads/videos/` + 代理回退 | 4 层视频堆叠播放 |
| **原生能力** | html5-qrcode（扫码）、html2canvas（截图）、react-easy-crop（裁剪）、Canvas 2D | 纯 Web |

### 源码规模

| 路径 | 用途 | 行数 |
|------|------|------|
| `src/App.tsx` | 路由配置 | ~125 |
| `src/context/AuthContext.tsx` | 认证状态 + 服务端同步 | ~120 |
| `src/services/storage.ts` | 存储层封装 + 双写 + syncFromServer | ~900 |
| `src/services/volcanoService.ts` | AI 生成客户端 | ~317 |
| `src/services/fileManager.ts` | 视频持久化 + 媒体管理 | ~162 |
| `src/services/mediaStorage.ts` | IndexedDB 媒体 | ~70 |
| `server.ts` | Express 后端（12 端点） | ~540 |
| `src/index.css` | Tailwind 主题定义 | ~113 |

### 服务端 API 清单

| 接口 | 用途 | 小程序适配 |
|------|------|-----------|
| `POST /api/auth/register` | 注册 | `wx.request` 直接调用 |
| `POST /api/auth/login` | 登录 | 可扩展为 `wx.login` + openid |
| `GET /api/cats/:userId` | 获取猫咪列表 | 直接复用 |
| `POST /api/cats` | 保存/更新猫咪 | 直接复用 |
| `DELETE /api/cats/:userId/:catId` | 删除猫咪 | 直接复用 |
| `DELETE /api/cats/:userId` | 删除用户所有猫咪 | 直接复用 |
| `POST /api/generate-video` | AI 生视频 | 直接复用 |
| `GET /api/video-status/:taskId` | 轮询视频状态 | 直接复用 |
| `POST /api/generate-image` | AI 生图 | 直接复用 |
| `GET /api/image-status/:taskId` | 轮询图片状态 | 直接复用 |
| `POST /api/persist-video` | 视频下载持久化 | 直接复用 |
| `GET /api/proxy-video` | 视频 CORS 代理 | 小程序不需要（无 CORS） |

**结论：12 个端点中 11 个可直接复用，后端几乎不需要改动。**

---

## 二、核心差异对比

| 维度 | 当前 React SPA | 微信小程序 | 迁移难度 |
|------|---------------|-----------|---------|
| **渲染引擎** | 浏览器 DOM | 双线程（逻辑层 JsCore + 渲染层 WebView） | **高** — 不能直接操作 DOM |
| **路由** | react-router 26 条路由 | 页面栈 `wx.navigateTo`，最多 10 层 | **高** — 需重构为页面栈 |
| **样式** | Tailwind CSS 4 原子类 | WXSS（子集 CSS），不支持 `*` 选择器 | **中** — 需逐个转换 |
| **动画** | Motion/Framer (37 处) | CSS transition + `wx.createAnimation` | **中** — 需逐个重写 |
| **视频播放** | `<video>` 4 层堆叠 + 手势切换 | `<video>` 原生组件（单层，层级最高） | **高** — 需重新设计交互方案 |
| **存储** | localStorage + IndexedDB + 服务端 JSON | `wx.setStorage` 10MB + **服务端已有** | **低** — P2 方案已解决 |
| **网络** | fetch / axios | `wx.request`（域名白名单，HTTPS） | **低** — 接口层替换 |
| **AI 生成** | 服务端代理 Ark API | 同样调服务端 API | **低** — 后端不变 |
| **扫码** | html5-qrcode (Web Camera) | `wx.scanCode`（原生能力） | **低** — 反而更简单 |
| **图片裁剪** | react-easy-crop (Canvas) | `wx.cropImage` 或 Canvas 组件 | **中** |
| **截图分享** | html2canvas → 下载 | Canvas + `wx.shareAppMessage` 原生分享 | **低** — 原生体验更好 |
| **登录** | 用户名/密码 + 服务端验证 | `wx.login` → openid，一键授权 | **中** — 认证流程不同 |
| **QR 码** | qrcode.react + Canvas 2D 手绘 | `wx.createQRCode` 或 Canvas | **低** |
| **离线** | Service Worker + PWA manifest | 小程序内置离线包机制 | **低** |

---

## 三、三种技术方案

### 方案 A：WebView 内嵌 H5（最快上线）

```
┌─────────────────────────┐
│   微信小程序外壳          │
│  ┌───────────────────┐  │
│  │  <web-view>       │  │
│  │  嵌入当前 React    │  │
│  │  SPA (H5 部署)     │  │
│  └───────────────────┘  │
│  + wx.miniProgram.      │
│    navigateTo/postMsg   │
└─────────────────────────┘
```

| 项目 | 详情 |
|------|------|
| **工作量** | 1-2 周 |
| **代码复用** | 95% — 只需部署 H5 + 写小程序壳 |
| **实现方式** | 小程序用 `<web-view src="https://your-domain.com">` 嵌入现有 SPA |
| **JS-SDK 桥接** | 分享、支付、扫码等通过 `wx.miniProgram.postMessage` 通信 |
| **优势** | 现有代码几乎不改，视频多层播放等复杂 UI 保持原样 |
| **劣势** | web-view 内无法使用小程序原生组件；体验偏 H5；审核可能被拒（纯壳） |
| **适用场景** | 快速上线验证，MVP 阶段 |

### 方案 B：Taro 3.x 跨端重写（推荐）

```
┌─────────────────────────────────────┐
│  Taro 3.x (React DSL)              │
│  ┌─────────┐  ┌─────────────────┐  │
│  │ 编译时   │→│ 微信小程序原生    │  │
│  │ JSX→WXML │  │ WXML + WXSS     │  │
│  └─────────┘  └─────────────────┘  │
│  ┌─────────┐  ┌─────────────────┐  │
│  │ 同一套   │→│ H5 / React Native│  │
│  │ 代码     │  │ 多端复用         │  │
│  └─────────┘  └─────────────────┘  │
└─────────────────────────────────────┘
```

| 项目 | 详情 |
|------|------|
| **工作量** | 4-6 周 |
| **代码复用** | 65-75% — 业务逻辑/服务层/服务端 API 直接复用 |
| **框架选择** | **Taro 3.x**（React 语法，京东维护）或 **uni-app**（Vue 语法） |
| **为什么选 Taro** | 当前项目是 React + TS，Taro 支持 React DSL，hooks 写法完全一致 |
| **核心优势** | P2 已实现服务端存储，存储层迁移量大幅降低 |
| **适用场景** | 正式上线运营 |

### 方案 C：微信原生小程序（性能最优）

| 项目 | 详情 |
|------|------|
| **工作量** | 8-12 周 |
| **代码复用** | 30-40% — 仅业务逻辑和 API 层 |
| **技术栈** | WXML + WXSS + JS/TS + 微信原生组件 |
| **优势** | 性能最好，体验最原生，审核最顺利 |
| **劣势** | 所有 JSX 需重写为 WXML 模板语法，无法复用 React 组件 |
| **适用场景** | 长期运营、对体验要求极高 |

---

## 四、推荐方案 B（Taro 3.x）— 详细迁移方案

### 4.1 代码层迁移映射

| React 当前代码 | Taro 对应方案 | 复用程度 |
|---------------|-------------|---------|
| `<div>` `<span>` `<img>` | `<View>` `<Text>` `<Image>` | 机械替换 |
| `react-router` `navigate()` | `Taro.navigateTo()` `Taro.switchTab()` | 重写路由调用 |
| `useState` `useEffect` `useContext` | 完全一致 | **100% 复用** |
| `AuthContext` 全局状态 | Taro Context 或 `useDidShow` 生命周期 | 90% 复用 |
| `localStorage.setItem()` | `Taro.setStorageSync()` | 接口替换 |
| `fetch('/api/...')` | `Taro.request({ url: BASE_URL + '/api/...' })` | 接口替换 |
| `IndexedDB` 媒体存储 | **可移除** — 小程序用 `wx.downloadFile` + 文件系统 | 重写 |
| `html5-qrcode` 扫码 | `Taro.scanCode()` | 更简单 |
| `html2canvas` 截图 | `Canvas` + `Taro.canvasToTempFilePath` | 重写 |
| `react-easy-crop` 裁剪 | `Taro.cropImage()` | 更简单 |
| `<input type="file">` 上传 | `Taro.chooseImage()` / `Taro.chooseMedia()` | 更简单 |
| Motion/Framer 动画 (37 处) | CSS `@keyframes` + `Taro.createAnimation` | 逐个重写 |
| `<video>` 多层堆叠 | 单 `<video>` + 预加载 src 切换 | **重点重设计** |
| `window.dispatchEvent` (5 个) | `Taro.eventCenter.trigger/on` | 接口替换 |
| `window.addEventListener('storage')` | `Taro.eventCenter` 或移除 | 简化 |
| Service Worker 离线 | 小程序内置离线包 | 移除 |
| `window.location` / URL 解析 | `Taro.getCurrentPages()` + 页面参数 | 重写 |

### 4.2 P2 方案带来的迁移优势

P2 修复已在服务端实现完整的猫咪 CRUD + 用户认证 API，这对小程序迁移意义重大：

| 对比维度 | P2 之前 | P2 之后 |
|---------|---------|---------|
| 数据源 | localStorage 唯一数据源 (851 行) | 服务端 JSON DB 为主，本地为缓存 |
| 存储迁移 | **高** — 需完全重建 | **低** — 小程序直接 `wx.request` 调 API |
| 用户认证 | 纯客户端 mock | 服务端 `/api/auth` 已就绪 |
| 猫咪管理 | localStorage 读写 | 服务端 `/api/cats` CRUD 已就绪 |
| 视频持久化 | 临时 URL 会过期 | `/uploads/videos/` 永久可访问 |
| 跨端同步 | 不可能 | 登录即同步 |

**结论：存储层迁移难度从"高"降为"低"，Taro 方案代码复用率从 60-70% 提升至 65-75%。**

### 4.3 页面路由映射

```
app.config.ts
├── tabBar (5 tabs)
│   ├── pages/home/index           ← / (首页视频互动)
│   ├── pages/diary/index          ← /diary (日记)
│   ├── pages/time-letters/index   ← /time-letters (时光信)
│   ├── pages/points/index         ← /points (积分)
│   └── pages/profile/index        ← /profile (个人中心)
│
├── pages/ (认证 3 页)
│   ├── login/index                ← /login
│   ├── register/index             ← /register
│   └── reset-password/index       ← /reset-password
│
├── pages/ (领养流程 5 页)
│   ├── empty-cat/index            ← /empty-cat
│   ├── welcome/index              ← /welcome
│   ├── upload-material/index      ← /upload-material
│   ├── create-companion/index     ← /create-companion
│   └── generation-progress/index  ← /generation-progress
│
├── pages/ (详情/子页面 11 页)
│   ├── cat-player/index           ← /cat-player/:id
│   ├── cat-history/index          ← /cat-history
│   ├── edit-profile/index         ← /edit-profile
│   ├── change-password/index      ← /change-password
│   ├── switch-companion/index     ← /switch-companion
│   ├── notification-list/index    ← /notifications
│   ├── notification-settings/index ← /notification-settings
│   ├── accompany-milestone/index  ← /accompany-milestone
│   ├── add-friend-qr/index       ← /add-friend-qr
│   ├── scan-friend/index          ← /scan-friend
│   └── feedback/index             ← /feedback
│
└── pages/ (静态页 2 页)
    ├── terms/index                ← /terms
    └── privacy-policy/index       ← /privacy-policy
```

**共 26 页面**（移除 download 页），5 个 tabBar。

---

## 五、关键风险点与解决方案

### 风险 1：视频多层堆叠播放（最高风险）

**现状**：Home.tsx 用 4 个 `<video>` 标签堆叠（idle + tail + rubbing + blink），通过 opacity 切换实现手势触发动画。

**问题**：小程序 `<video>` 是原生组件，层级最高，无法堆叠。

**解决方案**：单 `<video>` + src 动态切换

```
用户手势触发
  ↓
暂停 idle 视频，记录当前时间点
  ↓
切换 src 到 action 视频（tail/rubbing/blink）
  ↓
播放 action 视频（已通过 wx.downloadFile 预缓存）
  ↓
action 播放完毕 → 切回 idle src，恢复播放
```

利用 Patch 1 的服务端视频持久化，所有视频均为本服务器永久 URL，切换延迟可控。可配合 `wx.downloadFile` 预下载到本地临时文件进一步降低延迟。

### 风险 2：AI 视频生成轮询

**现状**：前端轮询 `/api/video-status/:taskId`，间隔 3-15 秒，总时长可达 5 分钟。

**问题**：小程序后台 5 秒限制可能中断轮询。

**解决方案**：
- 方案 A：页面保持前台 + `wx.setKeepScreenOn(true)` 避免息屏
- 方案 B：改为服务端 WebSocket 推送（server.ts 新增 ws 端点）
- 方案 C：微信订阅消息 — 生成完成后推送模板消息通知用户

### 风险 3：域名白名单与 HTTPS

**现状**：服务端已统一代理火山引擎 API。

**解决方案**：将自有域名（如 `www.mmdd10.tech`）加入小程序管理后台域名白名单。火山引擎域名无需配置，因请求走服务端代理。

### 风险 4：Tailwind CSS 兼容性

**现状**：37 个文件使用 Tailwind 原子类。

**问题**：小程序 WXSS 不支持 `*` 选择器、部分 CSS 属性、`env(safe-area-inset-*)`。

**解决方案**：
- Taro 搭配 `@taroify/core` 或 `NutUI-React` 组件库
- 使用 `postcss-px-to-rpx` 自动转换单位
- 手动替换 `env()` 为小程序 `getSystemInfoSync().safeArea`

---

## 六、最小可行迁移路径

```
第 1 周：Taro 脚手架 + 路由/页面映射 + 登录（wx.login + 现有 /api/auth）
第 2 周：存储层改造 — Taro.setStorage 作缓存 + 服务端 /api/cats 作数据源
第 3 周：核心页面 — 首页视频播放（单 video 切换方案）+ 日记 + 个人中心
第 4 周：AI 生成流程（生图/生视频）+ 轮询保活方案
第 5 周：社交功能（扫码加友/分享/通知）+ 积分系统
第 6 周：样式打磨（Motion→CSS 动画）+ 边界测试 + 提审
```

---

## 七、方案对比总结

| 维度 | A. WebView H5 | B. Taro 跨端 | C. 原生小程序 |
|------|:---:|:---:|:---:|
| 工作量 | 1-2 周 | 4-6 周 | 8-12 周 |
| 代码复用率 | 95% | 65-75% | 30-40% |
| 用户体验 | 一般（H5 感） | 良好 | 最优 |
| 审核通过率 | 低（纯壳风险） | 高 | 最高 |
| 性能 | 受限于 WebView | 接近原生 | 原生 |
| 多端复用 | 仅 H5 | 小程序 + H5 + RN | 仅小程序 |
| 维护成本 | 低（共用一套） | 中（一套代码多端） | 高（独立维护） |
| P2 API 利用度 | 全部 | 全部 | 全部 |
| **推荐度** | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |

---

## 八、相比 v1 分析的核心变化

| 变化点 | v1（2026-04-25 初版） | v2（P0-P2 修复后） |
|--------|---------------------|-------------------|
| 服务端 API | 仅 AI 生成 + 代理 (4 端点) | 完整 CRUD + 认证 (12 端点) |
| 数据持久化 | 纯 localStorage | 服务端 JSON DB + 双写 |
| 视频存储 | 临时 URL 会过期 | 服务端永久持久化 |
| 跨设备同步 | 不支持 | 登录即恢复 |
| 存储迁移难度 | **高** | **低** |
| Taro 复用率 | 60-70% | 65-75% |
| 总体迁移风险 | 中高 | **中低** |
