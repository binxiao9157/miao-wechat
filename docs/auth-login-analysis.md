# 手机号注册登录 & 账号密码登录 — 问题深度分析报告

**日期**: 2026-04-17
**分析范围**: `server.ts` 全部认证端点 + `AuthContext.tsx` + `Login.tsx` + `storage.ts` 数据迁移
**当前现象**: 账号密码登录提示「登录失败，服务器内部错误」

---

## 一、系统架构概览

```
前端                              后端 (server.ts)              数据库 (SQLite/Prisma)
Login.tsx                                                       User {
  ├─ 验证码模式 ──→ POST /api/auth/login (Mode A) ──→            id, username?, phone,
  └─ 密码模式   ──→ POST /api/auth/login (Mode B) ──→            password?, nickname?, avatar?
       ↓                                                        }
AuthContext.tsx
  └─ login() → saveUserInfo → rescueMyCat() → 数据迁移
```

**认证流程**:
1. 前端判断输入是手机号（11位数字）还是用户名
2. 后端查找用户（支持 username / phone / nickname 多途径匹配）
3. 验证身份（验证码 或 密码）
4. 签发 JWT token（30天有效期）
5. 前端保存凭证 + 触发旧账号数据迁移 (`rescueMyCat`)

---

## 二、Bug 清单与根因分析

### BUG #1（P0 致命）: 密码登录 — `bcrypt.compare` 对明文密码抛异常

**位置**: `server.ts` 登录端点 Mode B

**已提交代码（有 Bug）**:
```typescript
// Mode B: Password Login
const isMatch = await bcrypt.compare(password, user.password);
if (!isMatch) {
  return res.status(400).json({ error: "密码不正确" });
}
```

**问题**: 旧账号体系中密码以**明文**存储（如 `"admin123"`）。`bcrypt.compare(input, hash)` 要求第二个参数是合法的 bcrypt hash（以 `$2a$`/`$2b$` 开头），当传入明文字符串时，bcryptjs 抛出异常：
```
Error: Not a valid BCrypt hash.
```

**触发链路**:
```
用户输入密码 → 后端找到用户 → user.password = "admin123"（明文）
→ bcrypt.compare("admin123", "admin123") → 抛出异常
→ 被 catch 捕获 → 返回 500: "登录失败，服务器内部错误"
```

**影响范围**: 所有使用旧明文密码的账号**完全无法登录**。

**修复方案**: 先检测 `user.password` 是否以 `$2` 开头（bcrypt hash 标识），如果是明文则直接字符串比较，比对成功后自动迁移为 bcrypt hash。

---

### BUG #2（P1 高危）: 验证码登录缺少 `phone` 校验 → 潜在服务端崩溃

**位置**: `server.ts` 登录端点 Mode A

**已提交代码（有 Bug）**:
```typescript
if (code) {
  const cached = verificationCodes.get(phone); // phone 可能是 undefined
  // ...
  if (!user) {
    user = await prisma.user.create({
       {
        phone,                                  // undefined → DB 写入失败（NOT NULL 约束）
        nickname: `手机用户${phone.slice(-4)}`,  // TypeError: Cannot read properties of undefined
      }
    });
  }
}
```

**触发场景**: 用户以 `username` 字段 + 验证码方式请求登录（理论上不常见，但没有拦截）。

**修复方案**: 在 Mode A 入口添加 `if (!phone) return 400` 校验。

---

### BUG #3（P2 中危）: `change-password` 未兼容旧明文密码

**位置**: `server.ts` 修改密码端点

**已提交代码（有 Bug）**:
```typescript
const isMatch = await bcrypt.compare(currentPassword, user.password);
// 当 user.password 是明文 → bcrypt.compare 抛异常 → 500 错误
```

**影响**: 使用旧明文密码的用户无法通过「修改密码」功能。`bcrypt.compare(plaintext, plaintext)` 会抛出与 BUG #1 相同的异常。

**修复方案**: 与 login 保持一致的明文检测逻辑，先检查 `startsWith('$2')`。

---

### BUG #4（P3 低危）: `register` 测试码登录响应缺少 `username` 字段

**位置**: `server.ts:163-172`

**已提交代码（有 Bug）**:
```typescript
return res.json({
  message: "登录成功（通过测试码）",
  token,
  user: {
    id: user.id,
    phone: user.phone,
    nickname: user.nickname,
    avatar: user.avatar
    // ← 缺少 username 字段
  }
});
```

**影响**: 前端 `rescueMyCat()` 依赖 `userInfo.username` 进行精确匹配旧账号数据。缺少该字段时，数据迁移退化为「猫咪数最多的账号」这种模糊匹配，在多账号设备上可能迁移到错误数据。

**修复方案**: 补充 `username: user.username || null`。

---

### BUG #5（P4 改善）: catch 错误日志缺少关键信息

**位置**: 所有认证端点的 catch 块

**已提交代码**:
```typescript
catch (error) {
  console.error("Login error:", error);  // 缺少 error.message 和 stack trace
}
```

**影响**: 生产环境排查问题时，`error` 对象可能被 `console.error` 序列化为 `[Object object]`，丢失关键的错误消息和堆栈信息。

**修复方案**: 改为 `console.error("[AUTH] Login error:", error?.message || error, error?.stack)`，确保日志中有可读的错误信息。

---

## 三、前端逻辑审查

### Login.tsx — 无明显问题

```typescript
// 正确：11位纯数字 → phone，否则 → username
const isUsername = !id.match(/^\d{11}$/);
const payload = isUsername ? { username: id, password } : { phone: id, code, password };
```

- 密码模式下 `code = undefined`，验证码模式下 `password = undefined` → 逻辑正确
- 错误展示路径：后端 500 → `response.ok === false` → 显示 `data.error` → 用户看到「登录失败，服务器内部错误」

### AuthContext.tsx — 无明显问题

- 登录成功后正确保存 token + userInfo
- 正确调用 `storage.rescueMyCat()` 进行数据迁移
- 迁移结果通过 `migrated` 返回给 Login.tsx，触发 `location.replace` 强制刷新

### storage.ts (rescueMyCat) — 已修复

数据迁移逻辑在 commit `9eb56c0` 中已修复：
- 前缀计算 off-by-one 错误 ✓ 已修复
- 双重迁移防护 ✓ 已实现
- getLastCatImage 向后兼容 ✓ 已实现

---

## 四、数据迁移全链路

```
旧账号体系 (username + 明文 password)
    │
    ├─ 用户用密码登录
    │   ↓
    │   后端检测到非 bcrypt hash
    │   ↓
    │   明文比对通过 → 自动 hash 并更新数据库 ← BUG #1 在此处 500
    │   ↓
    │   返回 token + user info（含 username）
    │   ↓
    │   前端 AuthContext.login()
    │   ↓
    │   保存 userInfo（含 username）
    │   ↓
    │   调用 storage.rescueMyCat()
    │   ↓
    │   rescueMyCat 以 username 精确匹配 localStorage 中旧 key
    │   ↓
    │   将 u_{旧username}_* 搬迁到 u_{phone}_*
    │   ↓
    │   设置 __migrated_from_{identifier} 防重跑标志
    │
    └─ 如果 BUG #1 未修复：
        密码迁移失败 → 登录直接 500 →
        rescueMyCat 永远不被触发 →
        **双重迁移失败**（密码 + 数据都无法迁移）
```

**关键发现**: BUG #1 是阻断器，修复后密码自动迁移 + 数据自动搬迁才能同时生效。

---

## 五、修复方案总览

| Bug | 严重等级 | 修复方式 | 改动量 | 影响端点 |
|-----|---------|---------|--------|---------|
| #1 bcrypt.compare 明文异常 | P0 致命 | 添加 `startsWith('$2')` 明文检测 + 自动迁移 | 15 行 | `/api/auth/login` |
| #2 验证码登录 phone 校验 | P1 高危 | 添加 `!phone` 前置检查 | 3 行 | `/api/auth/login` |
| #3 change-password 明文兼容 | P2 中危 | 复用明文检测逻辑 | 12 行 | `/api/auth/change-password` |
| #4 register 测试码缺 username | P3 低危 | 补充 `username` 字段 | 1 行 | `/api/auth/register` |
| #5 catch 错误日志改善 | P4 改善 | 添加 error.message + stack | 5 处 | 全部认证端点 |

---

## 六、测试验证清单

- [ ] 旧明文密码账号 → 密码登录 → 成功登录 + 密码自动迁移为 bcrypt
- [ ] 已 bcrypt 的账号 → 密码登录 → 正常登录
- [ ] 错误密码 → 返回 400「密码不正确」（而非 500）
- [ ] 手机号 + 验证码登录 → 正常
- [ ] username + 验证码登录 → 返回 400「验证码登录需要提供手机号」
- [ ] 旧明文密码账号 → 修改密码 → 成功（兼容明文比对）
- [ ] 测试码注册已存在用户 → 响应包含 username 字段
- [ ] 服务端日志 → 异常时打印完整 error.message + stack trace
- [ ] 数据迁移：旧 username 账号登录后，localStorage 猫咪数据搬迁到新前缀

---

## 七、风险评估

| 项目 | 说明 |
|-----|------|
| 兼容性 | 修复后同时支持明文密码和 bcrypt 密码，首次明文登录后自动迁移为 bcrypt，不影响已迁移用户 |
| 安全性 | 明文密码仅在首次验证通过时存在于内存，立即被 bcrypt hash 替代，数据库中不再保留明文 |
| 回滚 | 如果需要回滚，已迁移为 bcrypt 的密码无法还原为明文，但不影响用户使用新密码登录 |
| 并发 | Prisma update 是原子操作，不存在并发写入风险 |
