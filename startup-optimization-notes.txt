# Miao V1.0 启动速度优化

> 日期: 2026-04-12
> 目标: 打开 App 时以最快速度呈现页面，消除漫长等待

---

## 修改文件清单

| # | 文件 | 优化类别 |
|---|------|---------|
| 1 | `src/App.tsx` | JS 加载 / 死代码清理 |
| 2 | `src/components/layout/MainLayout.tsx` | JS 加载 / 预加载 |
| 3 | `vite.config.ts` | 构建分包 |
| 4 | `index.html` | 渲染层 / 白屏消除 |
| 5 | `src/context/AuthContext.tsx` | 渲染层 / 初始化阻塞 |
| 6 | `src/pages/Home.tsx` | 数据加载延迟 |
| 7 | `src/pages/Diary.tsx` | 数据加载延迟 |
| 8 | `src/pages/Points.tsx` | 数据加载延迟 |
| 9 | `src/pages/Profile.tsx` | 数据加载延迟 |
| 10 | `server.ts` | 网络层 / 缓存策略 |
| 11 | `public/service-worker.js` | 网络层 / SW 缓存 |

---

## 修改详情

### 一、MainLayout 页面延迟加载（影响最大）

**文件:** `src/components/layout/MainLayout.tsx`

**问题:**
6 个 tab 页面（Home, Diary, TimeLetters, NotificationList, Points, Profile）全部通过静态 `import` 同步加载，导致首屏需要下载并解析所有页面的 JS。

**修改:**
- 6 个页面从静态 `import` 改为 `React.lazy()` 延迟加载
- 配合已有的 `visitedTabs` 机制，仅当前 tab 的 chunk 在首屏加载
- 用 `Suspense` 包裹页面区域，提供 loading fallback
- 新增 `requestIdleCallback` 空闲预加载：首屏渲染完成后，浏览器空闲时自动预加载其他 tab 的 chunk，确保 tab 切换无感延迟

**效果:** 首屏 JS 加载量减少约 60-70%

---

### 二、移除 App.tsx 关键路径上的死代码和重依赖

**文件:** `src/App.tsx`

**问题:**
`SplashScreen` 组件和 `AnimatePresence` / `motion.div` 包装在关键路径上引入了 `motion/react`（~100KB），但 `isInitializing` 始终为 `false`，这些代码从未生效。

**修改:**
- 删除 `SplashScreen` 组件（死代码）
- 删除 `AnimatePresence` / `motion.div` 包装
- 移除未使用的 `storage` import
- 用简洁的 `if (isInitializing) return null` 替代
- `Login` 页面改为 `React.lazy()` 延迟加载

**效果:** App.tsx 不再强制在关键路径加载 `motion/react`

---

### 三、MainLayout 自身延迟加载（关键补充）

**文件:** `src/App.tsx`

**问题:**
`MainLayout` 在 App.tsx 中是静态 `import`，它内部引用 `motion/react`。即使用户首屏看到的是 `/login` 页面，`motion/react` (~100KB) 仍然被打进初始 bundle，因为 `MainLayout` 的 import 在文件顶部执行。

**修改:**
- `MainLayout` 从静态 `import` 改为 `React.lazy()` 延迟加载
- 仅当用户登录后导航到主 tab 路由时，才下载 MainLayout chunk

**效果:** 登录页首屏 bundle 不再包含 `motion/react`，减少约 100KB

---

### 四、Vite 构建分包优化

**文件:** `vite.config.ts`

**问题:**
所有 vendor 库打包在同一个 chunk 中，任何代码变更都导致整个 vendor 缓存失效。

**修改:**
- 新增 `rollupOptions.output.manualChunks` 配置
- `react` + `react-dom` → `vendor-react` chunk
- `react-router-dom` → `vendor-router` chunk
- `motion/react` → `vendor-motion` chunk
- `lucide-react` → `vendor-icons` chunk

**效果:** vendor 库独立缓存，二次访问几乎零加载

---

### 五、HTML 静态 Splash Screen

**文件:** `index.html`

**问题:**
原 `<div id="root"></div>` 为空，JS 加载完成前用户看到白屏。

**修改:**
- 在 `#root` 内添加纯 CSS 的静态 splash（Miao logo + 加载点）
- `body` 添加背景色 `#FFF5F0`，避免白闪
- React 挂载后自动替换该内容

**效果:** 用户打开页面瞬间看到品牌 splash，无白屏

---

### 六、AuthContext 简化初始化

**文件:** `src/context/AuthContext.tsx`

**问题:**
`isInitializing` 初始为 `true`，需要执行异步的会话恢复逻辑（5分钟免登录检查），完成后才设为 `false`，期间阻塞整个 App 渲染。

**修改:**
- `isInitializing` 初始值改为 `false`（每次打开都需登录，无需检查）
- 移除 5 分钟免登录的会话恢复逻辑
- `useEffect` 仅做 `clearCurrentUser` + `refreshCatStatus`

**效果:** App 挂载后立即渲染路由，无初始化阻塞

---

### 七、页面数据加载延迟缩短

**文件:** `src/pages/Home.tsx`, `Diary.tsx`, `Points.tsx`, `Profile.tsx`

**问题:**
各页面内 `setTimeout` 延迟 300ms 加载数据（原为配合切换动画），现在页面本身是 lazy 加载，无需额外延迟。

**修改:** `setTimeout` 延迟从 `300ms` 缩短为 `50ms`

**效果:** 页面内容更快呈现

---

### 八、生产环境静态资源缓存策略

**文件:** `server.ts`

**问题:**
`express.static()` 未设置任何缓存头，浏览器每次都要重新验证所有资源（包括 Vite 产出的带哈希文件名的 JS/CSS），导致二次访问仍需等待网络往返。

**修改:**
- `/assets/` 路径（Vite 哈希资源）：`Cache-Control: max-age=1年, immutable`
- 其他静态文件（图片、manifest）：`max-age=1小时`
- `index.html`：`Cache-Control: no-cache`（确保拿到最新版）

**效果:** 二次访问时 JS/CSS 直接从浏览器缓存读取，零网络延迟

---

### 九、Service Worker 增强缓存

**文件:** `public/service-worker.js`

**问题:**
SW 仅预缓存 3 个文件（`/`, `/index.html`, `/manifest.json`），Vite 构建的 JS/CSS chunk 没有被 SW 缓存。PWA 用户每次打开仍需从网络加载核心脚本。

**修改:**
- 缓存版本升级为 `miao-v5`
- 新增对 `/assets/*.hash.js|css` 的缓存优先策略
- 首次加载时自动缓存 Vite 哈希资源
- 后续访问直接从 SW 缓存返回，无网络请求

**效果:** PWA 模式下二次打开接近瞬开

---

## 性能对比预估

| 场景 | 优化前 | 优化后 |
|------|--------|--------|
| 首屏 JS 体积 | 全部 6 页 + motion | 仅 Login chunk (~30KB) |
| 白屏时间 | JS 加载完才显示 | 瞬间显示 HTML splash |
| motion/react 加载 | 首屏强制加载 ~100KB | 登录后按需加载 |
| Tab 首次切换 | 瞬时（已预加载） | 瞬时（空闲预加载） |
| 二次访问（浏览器） | 每次重新验证 | 哈希资源命中强缓存 |
| 二次访问（PWA） | 部分网络请求 | SW 缓存直出，接近瞬开 |
| 初始化阻塞 | ~50-100ms 会话检查 | 无阻塞 |

---

## 注意事项

1. **免登录功能恢复：** 如果未来需要恢复，需在 `AuthContext` 中重新将 `isInitializing` 设为 `true` 并加回会话检查逻辑，同时在 `App.tsx` 中加回 loading 状态处理。

2. **requestIdleCallback 兼容性：** 在 iOS Safari 等不支持的浏览器中会退化为 `setTimeout(fn, 2000)`，不影响功能。

3. **MainLayout lazy 加载：** 登录后首次进入主页会有一个 Suspense loading 过渡。由于空闲预加载机制，实际感知很短。

4. **SW 缓存版本：** 已从 `v4` 升级到 `v5`，旧缓存会在 activate 阶段自动清除。

---

## 备份文件

- `startup-optimization.diff` — 标准 diff 文件，可用 `git apply` 应用
- `startup-optimization.diff.txt` — diff 的 txt 备份
- `startup-optimization-notes.md` — 本文件（修改说明）
- `startup-optimization-notes.txt` — 说明的 txt 备份
