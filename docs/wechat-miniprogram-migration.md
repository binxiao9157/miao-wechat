# Miao 微信小程序迁移 — 技术方案分析

> 日期：2026-04-25
> 基于当前 React 19 + Vite 6 + TypeScript 工程分析

---

## 一、当前架构全景

| 层次 | 技术栈 | 规模 |
|------|--------|------|
| **前端框架** | React 19 + TypeScript + Vite 6 | 47 个组件，31 条路由 |
| **UI/样式** | Tailwind CSS 4 + Motion(Framer) + Lucide 图标 | 自定义设计系统，无 UI 库 |
| **状态管理** | Context API（AuthContext） | 无 Redux/Zustand |
| **存储** | localStorage（851 行封装）+ IndexedDB（媒体） | 多账户前缀隔离，滑动窗口清理 |
| **后端** | Express.js + 火山引擎 Ark API | AI 生图/生视频，CORS 代理 |
| **原生能力** | 纯 Web（html5-qrcode、html2canvas、react-easy-crop） | 无 Capacitor/Cordova |
| **离线** | Service Worker + PWA manifest | 视频/图片缓存，API 降级 |

### 源码规模

| 路径 | 用途 | 行数 |
|------|------|------|
| `src/App.tsx` | 路由配置 | 125 |
| `src/context/AuthContext.tsx` | 认证状态 | 116 |
| `src/services/storage.ts` | 存储层封装 | 851 |
| `src/services/volcanoService.ts` | AI 生成客户端 | 317 |
| `src/services/fileManager.ts` | 媒体文件管理 | 138 |
| `src/services/mediaStorage.ts` | IndexedDB 媒体 | 70 |
| `server.ts` | Express 后端 | 500 |
| `public/service-worker.js` | 离线支持 | 148 |
| `src/index.css` | Tailwind 主题定义 | 113 |

---

## 二、核心差异对比

| 维度 | 当前 React SPA | 微信小程序 | 迁移难度 |
|------|---------------|-----------|---------|
| **渲染引擎** | 浏览器 DOM | 双线程（逻辑层 JsCore + 渲染层 WebView） | **高** — 不能直接操作 DOM |
| **路由** | react-router SPA 单页 | 页面栈 `wx.navigateTo`，最多 10 层 | **高** — 31 条路由需重构为页面栈 |
| **样式** | Tailwind CSS 原子类 | WXSS（子集 CSS），不支持 `*` 选择器 | **中** — 需逐个转换，部分语法不兼容 |
| **动画** | Motion/Framer Motion | `wx.createAnimation` 或 CSS transition | **中** — 需逐个重写 |
| **存储** | localStorage 无限制 + IndexedDB | `wx.setStorage` 上限 10MB | **高** — 200 条日记 + 媒体必爆 |
| **网络** | Axios + fetch | `wx.request`（域名白名单） | **低** — 接口层替换 |
| **AI 生成** | 火山引擎 Ark（服务端代理） | 同样可调服务端 API | **低** — 后端不变，前端改调用方式 |
| **扫码** | html5-qrcode（Web Camera） | `wx.scanCode`（原生能力） | **低** — 反而更简单 |
| **图片裁剪** | react-easy-crop（Canvas） | `wx.cropImage` 或 canvas 组件 | **中** |
| **分享** | html2canvas 截图 → 保存 | `wx.shareAppMessage` 原生分享 | **低** — 原生体验更好 |
| **登录** | 自建用户名/密码 | `wx.login` → openid，一键授权 | **中** — 认证流程完全不同 |
| **支付/积分** | 本地模拟积分系统 | 微信支付 API | **中** — 如需真实支付 |

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
| **限制** | web-view 内无法使用小程序原生组件；体验偏 H5；审核可能被拒（微信对纯 WebView 壳审核严格） |
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
| **代码复用** | 60-70% — 业务逻辑/服务层可直接复用 |
| **框架选择** | **Taro 3.x**（React 语法，京东维护）或 **uni-app**（Vue 语法） |
| **为什么选 Taro** | 当前项目是 React + TS，Taro 支持 React DSL，组件写法几乎一致 |
| **样式迁移** | Tailwind → Taro 支持的原子类（`@taroify` 或 `NutUI`） |
| **存储迁移** | localStorage → `Taro.setStorage`，IndexedDB → 云开发数据库或服务端 |
| **路由迁移** | react-router → `Taro.navigateTo/switchTab`，31 页对应 pages 配置 |
| **动画迁移** | Motion → Taro 内 CSS transition + `createAnimation` |
| **后端** | 不变，`wx.request` 替换 Axios 调同一套 API |

#### Taro 迁移映射表

| React 当前代码 | Taro 对应方案 |
|---------------|-------------|
| `<div>` `<span>` `<img>` | `<View>` `<Text>` `<Image>` |
| `react-router` `<Link>` `navigate()` | `Taro.navigateTo()` `Taro.switchTab()` |
| `useState` `useEffect` `useContext` | 完全一致，直接复用 |
| `localStorage.setItem()` | `Taro.setStorageSync()` |
| `IndexedDB` 媒体存储 | 微信云开发 CloudDB 或 COS 对象存储 |
| `axios.post('/api/...')` | `Taro.request({ url, method: 'POST' })` |
| `html5-qrcode` 扫码 | `Taro.scanCode()` |
| `html2canvas` 截图分享 | `Canvas` 组件 + `Taro.canvasToTempFilePath` |
| `react-easy-crop` 裁剪 | `Taro.cropImage()` 或 `Canvas` 手动实现 |
| `<input type="file">` 上传 | `Taro.chooseImage()` / `Taro.chooseMedia()` |
| Framer Motion 动画 | CSS `@keyframes` + `Taro.createAnimation` |
| Service Worker 离线 | 小程序内置离线包机制 |
| Context API | 完全一致，或用 Taro 的 `useDidShow` 生命周期 |

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

## 四、关键风险点

### 1. 存储 10MB 上限（最大风险）

当前 localStorage 存储了日记（200 条）、猫咪信息、积分历史、时光信件等，加上 IndexedDB 媒体，总量远超 10MB。

> **解决方案**：必须引入云端存储 — 微信云开发（CloudBase）或自建后端数据库。这是最大的架构变更。

### 2. AI 视频生成的交互适配

火山引擎生成视频需轮询 3-15 秒，小程序后台 5 秒限制。

> **解决方案**：服务端推送（WebSocket 或微信订阅消息），替代前端轮询。

### 3. 域名白名单与 HTTPS

小程序要求所有请求域名在管理后台配置白名单，且必须 HTTPS。

> **解决方案**：火山引擎 API 域名 `ark.cn-beijing.volces.com` 需加入白名单，或统一走自己的服务端代理（当前已有 `server.ts` 代理层，可直接复用）。

---

## 五、推荐方案：Taro 3.x（方案 B）

### 推荐理由

1. **React 语法一致性** — 当前团队无需学新框架，`useState/useEffect/useContext` 全部复用
2. **业务逻辑层**（storage.ts 851 行、volcanoService.ts 317 行）可抽取为跨端共享模块
3. **同时产出小程序 + H5**，保留现有 Web 版
4. **社区成熟**，NutUI/Taroify 可快速替代 Tailwind

### 最小可行迁移路径

```
第 1 周：Taro 脚手架 + 路由/页面映射 + 登录（wx.login）
第 2 周：存储层改造（Taro.storage + 云数据库）+ AuthContext 适配
第 3 周：核心页面 — 首页/日记/个人中心/猫咪播放器
第 4 周：AI 生成流程（生图/生视频）+ 轮询改 WebSocket
第 5 周：社交功能（扫码加友/分享/通知）+ 积分系统
第 6 周：样式打磨 + 边界测试 + 提审
```

### 页面路由映射

```
app.config.ts
├── pages/
│   ├── login/index          ← /login
│   ├── register/index       ← /register
│   ├── empty-cat/index      ← /empty-cat
│   ├── welcome/index        ← /welcome
│   ├── upload-material/index ← /upload-material
│   ├── create-companion/index ← /create-companion
│   ├── generation-progress/index ← /generation-progress
│   ├── cat-player/index     ← /cat-player/:id
│   ├── cat-history/index    ← /cat-history
│   ├── edit-profile/index   ← /edit-profile
│   ├── switch-companion/index ← /switch-companion
│   ├── feedback/index       ← /feedback
│   ├── ...
│   └── tabBar (5 tabs)
│       ├── home/index       ← /
│       ├── diary/index      ← /diary
│       ├── time-letters/index ← /time-letters
│       ├── points/index     ← /points
│       └── profile/index    ← /profile
```

---

## 六、方案对比总结

| 维度 | A. WebView H5 | B. Taro 跨端 | C. 原生小程序 |
|------|:---:|:---:|:---:|
| 工作量 | 1-2 周 | 4-6 周 | 8-12 周 |
| 代码复用率 | 95% | 60-70% | 30-40% |
| 用户体验 | 一般（H5 感） | 良好 | 最优 |
| 审核通过率 | 低（纯壳风险） | 高 | 最高 |
| 性能 | 受限于 WebView | 接近原生 | 原生 |
| 多端复用 | 仅 H5 | 小程序 + H5 + RN | 仅小程序 |
| 维护成本 | 低（共用一套） | 中（一套代码多端） | 高（独立维护） |
| **推荐度** | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
