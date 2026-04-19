# SMS 短信服务集成 — 修改报告

> 日期: 2026-04-17
> 分支: main
> 基线提交: 9eb56c0

## 概述

将验证码发送从"纯模拟 + 硬编码万能码"升级为**腾讯云 SMS 真实发送**，同时保留本地开发的模拟模式，通过 `SMS_ENABLED` 环境变量一键切换。

---

## Patch 清单

| # | 文件 | 范围 | 说明 |
|---|------|------|------|
| P1 | `sms-p1-backend.diff` | `server.ts` | 后端核心：腾讯云 SDK 集成 + 发送逻辑 + 万能码安全收紧 |
| P2 | `sms-p2-frontend.diff` | `Login.tsx`, `Register.tsx`, `ResetPassword.tsx` | 前端：移除 DEV alert 弹窗，模拟模式静默填充 |
| P3 | `sms-p3-config.diff` | `.env.example`, `package.json`, `package-lock.json` | 配置：新增环境变量模板 + 依赖 |

每个 `.diff` 均有 `.diff.txt` 纯文本备份，可直接在浏览器/编辑器中查看。

---

## P1: 后端 — server.ts

### 改动要点

1. **新增依赖导入**
   ```ts
   import * as tencentSms from "tencentcloud-sdk-nodejs-sms";
   ```

2. **SMS_ENABLED 开关**
   ```ts
   const SMS_ENABLED = process.env.SMS_ENABLED === "true";
   ```
   - `true` → 初始化腾讯云 `SmsClient`，真实发送短信
   - `false`（默认）→ 模拟模式，验证码仅打印到控制台

3. **send-code 路由改造**
   - `SMS_ENABLED=true`: 调用 `smsClient.SendSms()`，检查 `SendStatusSet[0].Code`，失败返回 500
   - `SMS_ENABLED=false`: 保持原有 console 打印行为，日志前缀改为 `[SMS-MOCK]`

4. **万能码安全收紧**（4处统一修改）
   ```ts
   // 旧：任何环境都可用
   const isTestCode = code === "888888";
   const isWhiteList = phone === "13800000000" && code === "123456";

   // 新：仅模拟模式可用，白名单已移除
   const isTestCode = !SMS_ENABLED && code === TEST_SMS_CODE;
   ```
   涉及路由: `/api/auth/register`, `/api/auth/login`, `/api/auth/reset-password`, `/api/auth/update-phone`

5. **mockCode 返回条件**
   ```ts
   // 旧：NODE_ENV !== "production" 时返回
   // 新：仅 SMS_ENABLED=false 时返回
   if (!SMS_ENABLED) {
     responseBody.mockCode = TEST_SMS_CODE;
   }
   ```

### 安全改进

- 移除硬编码 `"888888"` 和白名单 `13800000000/123456`
- 生产环境（`SMS_ENABLED=true`）下万能码完全失效
- SMS SDK 调用异常有 try/catch 兜底，返回友好错误信息

---

## P2: 前端 — Login / Register / ResetPassword

### 改动要点（三个页面一致）

```tsx
// 旧：每次都弹 alert，暴露验证码
const displayCode = result.mockCode || "888888";
alert(`测试环境验证码已发送: ${displayCode}\n(万能码: 888888)`);
setCode(displayCode);

// 新：仅在模拟模式下静默填充，无弹窗
if (result.mockCode) {
  setCode(result.mockCode);
}
```

- 移除 `alert()` 弹窗，不再在 UI 层暴露验证码
- 真实短信模式下后端不返回 `mockCode`，前端不做任何填充
- 模拟模式下后端返回 `mockCode`，前端自动填入输入框（方便开发调试）

---

## P3: 配置 — 环境变量 + 依赖

### .env.example 新增

```env
# ===== 短信服务（腾讯云 SMS）=====
SMS_ENABLED="false"
SMS_SECRET_ID="YOUR_SECRET_ID"
SMS_SECRET_KEY="YOUR_SECRET_KEY"
SMS_SDK_APP_ID="1400xxxxxx"
SMS_SIGN_NAME="Miao喵伴"
SMS_TEMPLATE_ID="12345678"
SMS_REGION="ap-guangzhou"
```

### package.json 新增依赖

```json
"tencentcloud-sdk-nodejs-sms": "^4.1.213"
```

---

## 部署指引

### 本地开发（无需短信账号）

无需任何额外配置，`SMS_ENABLED` 默认为 `false`：
- 验证码打印到服务端控制台
- 万能码 `888888` 可用
- 前端自动填充验证码

### 生产部署

1. 在腾讯云控制台创建 SMS 应用，获取以下信息：
   - SecretId / SecretKey（建议使用子账号 CAM 权限）
   - SdkAppId、签名名称、模板 ID

2. 配置环境变量：
   ```env
   SMS_ENABLED="true"
   SMS_SECRET_ID="真实的 SecretId"
   SMS_SECRET_KEY="真实的 SecretKey"
   SMS_SDK_APP_ID="真实的 SdkAppId"
   SMS_SIGN_NAME="已审核的签名"
   SMS_TEMPLATE_ID="已审核的模板ID"
   ```

3. 确认短信模板参数：模板需支持 `{1}=验证码` `{2}=有效期分钟数`

4. 部署后万能码自动失效，前端不再返回 mockCode

---

## 应用 Patch

```bash
# 按顺序应用
git apply patches/sms-p1-backend.diff
git apply patches/sms-p2-frontend.diff
git apply patches/sms-p3-config.diff

# 安装新依赖
npm install
```

## 回滚

```bash
git apply -R patches/sms-p3-config.diff
git apply -R patches/sms-p2-frontend.diff
git apply -R patches/sms-p1-backend.diff
npm install
```
