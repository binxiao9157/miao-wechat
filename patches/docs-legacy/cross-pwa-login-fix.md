# Patch 15（Critical）：跨 PWA 实例登录失败修复

> 日期：2026-04-25
> 编号：Patch 15，承接 Patch 1-14

---

## 问题说明

用户在 Android 手机上将同一网站添加到桌面两次（两个独立 PWA 实例），在 PWA 1 注册账号并正常使用后，打开 PWA 2 用同一账号登录，提示"用户名或密码错误"。

## 根本原因

Android 系统为每个 PWA 实例分配**独立的 WebView 存储空间**（隔离的 localStorage），导致：

1. **PWA 1 注册** → 用户数据写入 PWA 1 的 localStorage + 异步发送到服务器 `/api/auth/register`
2. **PWA 2 登录** → `AuthContext.login()` 只查 PWA 2 的 localStorage（空的）→ 找不到用户 → 返回 `false`
3. **从未尝试服务器验证** → 服务器明明有这个用户，但客户端不去问

### 代码定位

**`src/context/AuthContext.tsx`** — `login()` 函数（修复前）：

```typescript
const login = (username: string, password: string): boolean => {
  const users = storage.getAllUsers();  // ← 只读本地 localStorage
  const savedUser = users.find(u => u.username === username && u.password === password);
  if (savedUser) {
    // ... 本地验证成功
    return true;
  }
  return false;  // ← 从不尝试服务器 API
};
```

而 `register()` 函数会同时写本地和服务器：
```typescript
const register = (info: UserInfo): void => {
  storage.saveUserInfo(info);              // 写 localStorage
  fetch('/api/auth/register', { ... });    // 也写服务器
};
```

**数据流向不对称**：注册时双写（本地+服务器），登录时单读（只读本地）。

## 修复方案

将 `login()` 改为**异步函数**，本地验证失败时回退到服务器 `/api/auth/login` 接口：

```
本地 localStorage 查找
  ├── 找到 → 直接登录（快速路径，无网络延迟）
  └── 未找到 → fetch('/api/auth/login')
                ├── 服务器验证成功 → 写入本地 localStorage + 登录
                └── 服务器验证失败/网络错误 → 返回失败
```

## 修改文件（2 个）

### `src/context/AuthContext.tsx`（3 处）

| 改动 | 原值 | 新值 | 说明 |
|------|------|------|------|
| 接口类型 | `login: (...) => boolean` | `login: (...) => Promise<boolean>` | 类型改为异步 |
| 函数签名 | `const login = (...)：boolean =>` | `const login = async (...): Promise<boolean> =>` | 改为 async |
| 服务器回退 | 无 | `fetch('/api/auth/login')` + 写入本地 | 本地查不到时请求服务器验证 |

**服务器回退逻辑详情**：
1. 发送 `POST /api/auth/login` 请求
2. 服务器返回 `{ username, nickname, avatar }` 表示验证成功
3. 构建 `UserInfo` 对象，调用 `storage.saveUserInfo()` 写入本地 localStorage（下次登录无需再请求服务器）
4. 设置 token、登录时间等
5. 触发 `syncFromServer()` 同步猫咪数据
6. 网络错误或 401 → 返回 `false`

### `src/pages/Login.tsx`（3 处）

| 改动 | 原值 | 新值 | 说明 |
|------|------|------|------|
| 登录函数 | `const performLogin = (...)` | `const performLogin = async (...)` | 改为 async，await login |
| 加载状态 | 无 | `isLoading` state + try/finally | 登录期间显示"登录中..."，防止重复点击 |
| 登录按钮 | `<button>登录</button>` | `disabled={isLoading}` + 条件文案 | 加载时禁用按钮 |

## 应用方式

```bash
git apply docs/patches/cross-pwa-login-patch15.patch
```

## 验证方式

1. **跨 PWA 登录**：Android 添加两个 PWA 到桌面 → PWA 1 注册账号 → PWA 2 用同一账号登录 → 成功（而非"用户名或密码错误"）
2. **本地登录不受影响**：已在同一 PWA 注册的账号，登录仍走快速本地路径（无网络延迟）
3. **离线降级**：服务器不可达时，本地有的账号正常登录，本地没有的账号提示错误
4. **猫咪数据同步**：跨 PWA 登录后，`syncFromServer()` 将服务器上的猫咪数据拉取到本地
5. **登录按钮状态**：点击登录后按钮显示"登录中..."且不可重复点击

## 技术原理

```
┌─ PWA 实例 1 ──────────────────────────────────────────┐
│                                                        │
│  register("user1", "pass123")                          │
│  ├── localStorage["miao_users"] = [{user1, pass123}]   │ ← 写入本地
│  └── POST /api/auth/register → server.json             │ ← 同步到服务器
│                                                        │
└────────────────────────────────────────────────────────┘

┌─ PWA 实例 2（独立 localStorage）──────────────────────┐
│                                                        │
│  login("user1", "pass123")                             │
│  ├── localStorage["miao_users"] = []  ← 空！           │
│  │                                                     │
│  │ 修复前：return false → "用户名或密码错误"            │
│  │                                                     │
│  │ 修复后：                                            │
│  ├── POST /api/auth/login("user1", "pass123")          │
│  │   └── server 返回 { username, nickname, avatar }    │
│  ├── storage.saveUserInfo(...)  ← 写入本地              │
│  └── return true → 登录成功 ✓                          │
│                                                        │
│  下次登录：localStorage 已有 user1 → 直接本地验证       │
└────────────────────────────────────────────────────────┘
```

## 修复覆盖更新（含 Patch 1-15）

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
| 独立页面滚动缺失（全量修复） | Patch 10 | 已解决 |
| `min-h-dvh` 滚动失效（根本修复） | Patch 11 | 已解决 |
| 页面 chunk 加载失败白屏 | Patch 12 | 已解决 |
| 全部页面 min-h-dvh → h-dvh | Patch 13 | 已解决 |
| 上传素材页嵌套 flex-grow 滚动失效 | Patch 14 | 已解决 |
| **跨 PWA 实例登录失败** | **Patch 15** | **已解决** |
