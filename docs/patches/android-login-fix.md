# Patch 16: 安卓跨设备登录失败修复

> 日期: 2026-04-26
> Patch 文件: `android-login-fix-patch16.txt`

---

## 问题描述

不同苹果手机之间已能互相登录（Patch 15 修复），但安卓手机使用相同账号密码登录时始终提示「用户名或密码错误」。

## 根因分析

| 优先级 | 原因 | 影响 |
|--------|------|------|
| **P0** | Service Worker 拦截 POST 请求，Android Chrome 转发时 body 丢失 | 安卓全部用户登录/注册失败 |
| **P1** | 输入值无 trim，安卓键盘自动追加空格 | 安卓部分用户密码匹配失败 |
| **P2** | catch 不区分网络错误与认证错误，统一显示「密码错误」 | 所有用户误导排查 |
| **P3** | register() fire-and-forget，页面跳转取消 fetch | 服务端可能未存储用户，跨设备无法登录 |

### P0 详解：Service Worker POST body 丢失

`service-worker.js` 的 fetch handler 对所有 `/api/` 请求调用 `event.respondWith(networkFirst(request))`，包括 POST。

- **iOS Safari**：Service Worker 对 POST 的拦截不够激进，多数情况直接放行到网络
- **Android Chrome**：完整执行 SW 拦截，`event.respondWith()` 接管 POST 请求。在部分 Chrome 版本中，SW 内 `fetch(request)` 转发 POST 时 body stream 可能已被消费，导致服务端收到空 body → 返回 400

### P1 详解：安卓键盘尾部空格

整条链路（Login.tsx → AuthContext.tsx → server.ts）没有任何 `.trim()` 处理。安卓中文输入法（搜狗、Gboard 等）确认输入后常自动追加空格，导致 `"test "` ≠ `"test"` 匹配失败。

### P3 详解：注册 fire-and-forget

```typescript
// 修复前：fire-and-forget，页面跳转可能取消请求
register(info);  // → fetch(...).catch(() => {})
navigate("/empty-cat");  // 立即跳转，fetch 可能被取消
```

---

## 修复方案

### Fix 1: Service Worker 入口处放行非 GET 请求

**文件**: `public/service-worker.js`

在 fetch handler 最顶部加入非 GET 请求的早期返回，不调用 `event.respondWith()`，让浏览器原生处理 POST/PUT/DELETE。同时升级缓存版本号 `miao-v5` → `miao-v6` 强制客户端更新 SW。

```javascript
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return; // 不拦截，直接交给浏览器
  }
  // ...后续仅处理 GET 请求
});
```

### Fix 2: 前后端四处添加 trim

**文件**: `src/pages/Login.tsx`、`src/pages/Register.tsx`、`server.ts`

- 前端：`performLogin` / `handleRegister` 在提交前对 username/password 执行 `.trim()`
- 后端：`/api/auth/register` 和 `/api/auth/login` 对 `req.body` 字段执行 `.trim()`
- 双端 trim 形成防御性对齐，即使只有一端 trim 也能匹配

### Fix 3: login 返回结构化错误类型

**文件**: `src/context/AuthContext.tsx`、`src/pages/Login.tsx`

`login()` 返回类型从 `boolean` 改为 `{ success, error?: 'credentials' | 'network' }`：

- `resp.ok === false` → `error: 'credentials'` → 显示「用户名或密码错误」
- `fetch` 抛异常 → `error: 'network'` → 显示「网络连接失败，请检查网络后重试」

### Fix 4: register 改为 async 等待服务端确认

**文件**: `src/context/AuthContext.tsx`、`src/pages/Register.tsx`

- `register()` 改为 `async`，先 `await fetch('/api/auth/register')`
- 服务端 409 → 抛出「用户名已被注册」错误，UI 显示
- 网络异常 → 降级为本地注册（离线容错），打印警告
- Register.tsx 改为 `await register()`，成功后才执行 `navigate`
- 新增 `isLoading` 状态和「注册中...」按钮

---

## 修改文件清单

| 文件 | 改动 |
|------|------|
| `public/service-worker.js` | 入口处放行非 GET 请求，移除 networkFirst 中冗余 POST 判断，缓存版本升级 |
| `server.ts` | register/login 端点添加 trim |
| `src/context/AuthContext.tsx` | login 返回结构化错误，register 改 async 先写服务端 |
| `src/pages/Login.tsx` | 输入 trim + 区分网络/认证错误提示 |
| `src/pages/Register.tsx` | 输入 trim + await register + loading 状态 |

---

## 验证步骤

1. **安卓登录验证**: 安卓手机 → 输入已注册账号 → 应成功登录（不再报密码错误）
2. **空格容错验证**: 输入 `"test "` (带尾部空格) → 应能匹配 `"test"` 用户
3. **网络断开验证**: 断开网络 → 新设备登录 → 应提示「网络连接失败」而非「密码错误」
4. **注册同步验证**: 设备 A 注册 → 设备 B 登录同一账号 → 应成功
5. **离线注册验证**: 断网注册 → 应能本地注册成功 → 联网后其他设备仍无法登录（预期行为，console 有警告）
6. **重复注册验证**: 注册已存在的用户名 → 应提示「用户名已被注册」
7. **SW 更新验证**: 部署后刷新 → DevTools → Application → Service Workers → 确认版本为 `miao-v6`
