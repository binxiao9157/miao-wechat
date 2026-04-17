# Miao V1.0 手机号认证系统修复报告

> 修复日期: 2026-04-17
> 修复范围: 手机号注册登录 + 旧账号数据迁移 + 密码管理全链路
> 涉及文件: 6 个核心文件, 3 个 Patch, 共 1914 行 diff

---

## 一、问题背景

项目从"用户名 + 密码本地模拟认证"重构为"手机号 + 验证码后端真实认证"后, 认证链路和旧数据迁移存在 **10 个问题**, 涵盖数据损坏、安全漏洞、功能断裂三大类。

---

## 二、问题清单与修复方案

### Patch 1: 存储层数据迁移修复

**文件**: `src/services/storage.ts`
**Diff**: `patches/auth-fix-p1-storage.diff` (392 行)

#### P1 [致命] rescueMyCat prefix 截取偏移, 数据搬迁损坏

**根因**: `rescueMyCat()` 第 508 行计算旧数据前缀时:

```ts
// 错误代码
prefix = key.substring(0, key.length - catListSuffix.length + 1);
```

`catListSuffix = "_miao_cat_list"` (14字符), 对 key = `u_admin_miao_cat_list` (22字符):
- 截取 `substring(0, 22-14+1)` = `substring(0, 9)` = `"u_admin_m"` (多了一个 `m`)
- 后续 `replace("u_admin_m", "u_138xxx_")` 将 `u_admin_miao_diaries` 变成 `u_138xxx_iao_diaries`
- **所有搬迁的 key 都会被截断一个字符, 导致数据完全不可读**

**修复**:

```ts
// 修复后
identifier = key.slice(2, key.length - catListSuffix.length);
prefix = `u_${identifier}_`;
```

对同样的 key: `identifier = "admin"`, `prefix = "u_admin_"`, replace 结果正确。

---

#### P7 [中等] 搬迁后不删旧 key, 每次登录重复搜救

**根因**: `rescueMyCat()` 搬迁时只 `setItem` 新 key, 不 `removeItem` 旧 key。每次登录都会重新触发搜救, 且如果旧 key 被其他逻辑修改, 会产生新旧数据不一致。

**修复**:
1. 搬迁前检查 `__migrated_from_{identifier}` 标记, 已迁移则跳过
2. 搬迁完成后记录所有已搬迁的旧 key
3. 写入迁移标记 `localStorage.setItem(migratedFlag, timestamp)`
4. 批量删除旧 key

---

#### P8 [中等] getLastCatImage 旧 username 账号不兼容

**根因**: `getLastCatImage()` 硬编码 `u_${lastPhone}_` 前缀。旧 username 账号 `lastPhone` 为空, 拼出 `u__miao_cat_list`, 永远找不到数据。

**修复**: 三级回退策略:
1. 先用 phone 前缀精准查找
2. 找不到则遍历所有 `u_*_miao_cat_list` key, 返回第一个有猫咪的账号头像
3. 最后 fallback 到旧的全局缓存 `LAST_CAT_IMAGE`

---

### Patch 2: 后端接口修复

**文件**: `server.ts`
**Diff**: `patches/auth-fix-p2-server.diff` (375 行)

#### P2 [致命] login 不返回 username, 旧账号迁移精准匹配断裂

**根因**: 普通手机号登录的响应体:

```ts
// 错误: 缺少 username
user: { id, phone, nickname, avatar }
```

前端 `rescueMyCat()` 依赖 `currentUser.username` 做精准匹配:

```ts
const isUsernameMatch = !!(currentUsername && identifier === currentUsername);
```

username 为空时精准匹配永远失败, 退化为"猫咪数最多"的模糊匹配 -- 多旧账号设备上会迁错用户数据。

**修复**: login 和 register 响应统一返回 `username: user.username || null`。

---

#### P3 [严重] 无 reset-password 后端 API

**根因**: `ResetPassword.tsx` 只调 `storage.updatePassword()`, 仅修改 localStorage 中的明文密码。后端 DB 中的 bcrypt 哈希不更新, 用户改完密码后密码登录仍用旧密码。

**修复**: 新增 `POST /api/auth/reset-password` 接口:

```
请求: { phone, code, newPassword }
流程: 校验验证码 -> 查找用户 -> bcrypt.hash(newPassword, 10) -> prisma.user.update
响应: { message: "密码重置成功" }
```

同时新增 `POST /api/auth/change-password` (已登录用户修改密码):

```
请求: { phone, currentPassword, newPassword }
流程: 查找用户 -> bcrypt.compare(currentPassword) -> bcrypt.hash(newPassword) -> update
响应: { message: "密码修改成功" }
```

---

#### P9 [低] admin 硬编码后门

**根因**: login 接口中 admin 账号硬编码特殊处理, 使用假 phone `10000000000` 不符合 `1[3-9]\d{9}` 校验规则。

**修复**: 改为通用 username 查找:

```ts
user = await prisma.user.findUnique({ where: { username } });
if (!user) {
  user = await prisma.user.findFirst({
    where: { OR: [{ phone: username }, { nickname: username }] }
  });
}
```

密码校验统一走 bcrypt.compare, 不再硬编码。

---

#### P10 [低] mockCode 生产环境泄露

**根因**: send-code 接口无条件返回 `mockCode: "888888"`, 生产环境泄露万能验证码。

**修复**: 仅非生产环境返回:

```ts
if (process.env.NODE_ENV !== "production") {
  responseBody.mockCode = TEST_SMS_CODE;
}
```

---

#### 额外: 新增 bind-phone API

新增 `PUT /api/auth/bind-phone`:

```
请求: { userId, phone, code }
流程: 校验验证码 -> 检查 phone 是否被占用 -> prisma.user.update({  { phone } })
响应: { message: "手机号绑定成功", phone }
```

---

### Patch 3: 前端认证流程修复

**文件**: `src/pages/ResetPassword.tsx`, `src/pages/ChangePassword.tsx`, `src/pages/Profile.tsx`, `src/pages/Login.tsx`
**Diff**: `patches/auth-fix-p3-frontend.diff` (1147 行)

#### P4 [严重] ChangePassword 明文比对密码

**根因**:

```ts
// 错误: 直接比对 localStorage 中的 password 字段
const savedUser = storage.findUserByPhone(user.phone);
if (currentPassword !== savedUser.password) { ... }
```

后端存的是 bcrypt hash, localStorage 中 password 字段要么是明文(旧系统遗留), 要么不存在(新系统不存 password)。安全校验形同虚设。

**修复**: ChangePassword 改为调 `POST /api/auth/change-password`, 后端用 bcrypt.compare 校验。移除对 `storage` 的依赖。

---

#### P4 续: ResetPassword 不走后端

**修复**: 改为调 `POST /api/auth/reset-password`, 后端校验验证码并更新 DB 中的密码哈希。移除对 `storage.updatePassword` 的调用。

---

#### P5 [中等] Login 页 "登录/注册" 语义混淆

**根因**: 按钮文案 "登录 / 注册" 但实际只调 `login()`。验证码模式下后端自动注册, 用户以为在"登录"实际被静默注册。下方又有"创建新账号"按钮, 功能重叠。

**修复**: 按钮文案改为 "登录", 后端自动注册对用户透明。保留下方 "创建新账号" 入口供需要设置密码/昵称的用户使用。

---

#### P6 [中等] Profile 绑定手机号只改 localStorage

**根因**: `handleBindPhone` 验证码写死 `888888` 比对, 不调后端。`bindPhoneAndMigrateData` 只改 localStorage 中的 phone, 不通知后端更新 DB。下次用新手机号登录会找不到用户。

**修复**:
1. 新增 `handleSendBindCode` 调 `POST /api/auth/send-code` 真实发送验证码
2. `handleBindPhone` 改为调 `PUT /api/auth/bind-phone` 更新后端 DB
3. 后端成功后再调 `storage.bindPhoneAndMigrateData` 同步本地数据
4. 绑定弹窗中"发送"按钮增加倒计时功能

---

#### 清理

- 移除 Login.tsx 中的 DEBUG 日志 (`console.log("MIAO DEBUG: Old Usernames Found")`)
- 移除 ResetPassword.tsx 和 ChangePassword.tsx 中无用的 `storage` import

---

## 三、修改文件清单

| 文件 | Patch | 改动量 | 说明 |
|------|-------|--------|------|
| `src/services/storage.ts` | P1 | +44/-12 | rescueMyCat 修复 + getLastCatImage 兼容 |
| `server.ts` | P2 | +125/-28 | 3 个新 API + login/register 响应修复 + admin 通用化 |
| `src/pages/ResetPassword.tsx` | P3 | +16/-15 | 改为调后端 reset-password |
| `src/pages/ChangePassword.tsx` | P3 | +35/-12 | 改为调后端 change-password |
| `src/pages/Profile.tsx` | P3 | +62/-12 | bindPhone 走后端 + 发送验证码功能 |
| `src/pages/Login.tsx` | P3 | +3/-12 | 按钮语义 + 移除 DEBUG 日志 |

---

## 四、Patch 文件

| 文件名 | 行数 | 覆盖范围 |
|--------|------|----------|
| `patches/auth-fix-p1-storage.diff` (.txt) | 392 | P1, P7, P8 |
| `patches/auth-fix-p2-server.diff` (.txt) | 375 | P2, P3, P9, P10, bind-phone |
| `patches/auth-fix-p3-frontend.diff` (.txt) | 1147 | P4, P5, P6, 清理 |

每个 `.diff` 文件均有对应的 `.txt` 备份。

---

## 五、验证清单

- [ ] 新用户手机号 + 验证码登录 -> 自动注册 -> 数据 key 格式 `u_138xxx_miao_cat_list`
- [ ] 旧 username 账号 (如 admin) 密码登录 -> 后端 bcrypt 校验通过
- [ ] 登录后 rescueMyCat 精准匹配 username -> 搬迁正确的数据源
- [ ] 搬迁完成后旧 key 被清理, 再次登录不重复搜救
- [ ] 登录页能展示上次的猫咪图片 (phone 账号和 username 账号均可)
- [ ] 重置密码 -> 后端 DB hash 更新 -> 新密码可正常登录
- [ ] 修改密码 -> 后端校验旧密码 -> 更新成功
- [ ] Profile 绑定手机号 -> 后端 DB phone 更新 -> 可用新手机号登录
- [ ] 生产环境 send-code 不返回 mockCode
- [ ] Login 按钮显示 "登录" 而非 "登录 / 注册"
