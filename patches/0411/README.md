# 0411 代码修复说明

> 日期: 2026-04-11  
> 范围: M 批次（中优先级）+ L 批次（低优先级）  
> 涉及文件: 8 个，82 行增 / 92 行删

---

## 修复总览

| 编号 | 优先级 | 问题描述 | 状态 |
|------|--------|----------|------|
| M1 | 中 | 前端通过 HTTP header 泄露 API Key 到服务端 | 已修复 |
| M2 | 中 | setTimeout 返回值未清理，组件卸载后触发 setState | 已修复 |
| M3 | 中 | catch 块静默吞错误，异常无日志输出 | 已修复 |
| M5 | 中 | localStorage 跨 tab 不同步，内存缓存过期 | 已修复 |
| M7 | 中 | action 视频 preload="auto" 浪费移动端带宽 | 已修复 |
| M8 | 中 | 关键交互按钮缺少 aria-label 无障碍标签 | 已修复 |
| L1/L5 | 低 | Welcome.tsx 引用已删除的 VolcanoConfig 字段导致运行时错误 | 已修复 |

---

## 分步骤修复方案

### Step 1: M1 — API Key 安全加固

**文件**: `server.ts`, `src/services/volcanoService.ts`, `src/pages/Welcome.tsx`  
**diff**: `step1-M1-api-key-security.diff`

**问题**: 前端将 API Key 存入 localStorage，通过 HTTP header（`X-Volc-API-Key`）发送到 server.ts 代理层。凭证在网络传输中以明文暴露，且 localStorage 可被 XSS 攻击读取。

**修复方案**:
1. **server.ts** — 移除所有 `req.headers['x-volc-api-key']` / `x-volc-model-id` 读取逻辑，全部改用服务端环境变量 `ARK_API_KEY` / `ARK_MODEL_ID`
2. **volcanoService.ts** — `buildHeaders()` 不再发送任何凭证 header，仅保留 `Content-Type`；`VolcanoConfig` 移除 `ApiKey`、`ModelId`、`T2IModelId` 字段
3. **Welcome.tsx** — 移除 `VolcanoConfig` import 及引用已删除字段的代码（`handleReset` 中的 `VolcanoConfig.ApiKey` 等）

**影响范围**: 4 个 API 端点（generate-image、image-status、generate-video、video-status）全部转为服务端凭证模式

---

### Step 2: M2 + M3 — setTimeout 清理 & 静默 catch 修复

**文件**: `src/pages/CatPlayer.tsx`, `src/pages/Diary.tsx`  
**diff**: `step2-M2M3-timer-cleanup-silent-catch.diff`

**问题**:
- CatPlayer.tsx `handleSaveToAlbum` 中 `setTimeout(() => setShowToast(null), 3000)` 未存储返回值，组件卸载后定时器仍执行导致 "setState on unmounted component" 警告
- CatPlayer.tsx useEffect cleanup 中 `catch(e) {}` 完全吞掉错误，排查时无任何日志
- Diary.tsx 评论滚动 setTimeout 未在 effect 清理中取消

**修复方案**:
1. CatPlayer — 新增 `toastTimerRef` 存储 setTimeout ID，`handleSaveToAlbum` 中先 clear 后 set，useEffect return 中清理
2. CatPlayer — `catch(e) {}` 改为 `catch(e) { console.warn("视频清理时出错:", e) }`
3. Diary — useEffect 中 `const timer = setTimeout(...)`，return `() => clearTimeout(timer)`

---

### Step 3: M5 — localStorage 跨 tab 同步

**文件**: `src/services/storage.ts`  
**diff**: `step3-M5-cross-tab-sync.diff`

**问题**: storage.ts 引入了 `memCache`（内存缓存）加速读取，但当用户在另一个 tab 修改数据时，当前 tab 的缓存不会失效，导致数据不一致。

**修复方案**:
- 添加 `window.addEventListener('storage', handler)` 监听
- 当其他 tab 修改某个 key 时，调用 `invalidateCache(e.key)` 清除对应缓存
- 当 `CURRENT_USER` key 变化时，同步重置 `cachedCurrentUserRaw` 并刷新用户前缀
- 当 `storage.clear()` 被调用时（`e.key === null`），清空全部缓存

---

### Step 4: M7 + M8 — 视频预加载优化 & 无障碍标签

**文件**: `src/pages/Home.tsx`  
**diff**: `step4-M7M8-preload-aria.diff`

**问题**:
- Home.tsx 中 action 视频（rubbing / petting / feeding / teasing）使用 `preload="auto"`，在移动网络下预加载 4 个完整视频浪费大量带宽
- `.play().catch(() => {})` 空 catch 无任何注释说明为何静默

**修复方案**:
1. action 视频 `preload="auto"` 改为 `preload="metadata"`（仅加载元数据），idle 视频保持 `auto`（首屏展示需要）
2. `.catch(() => {})` 添加注释 `/* autoplay may be blocked by browser */` 说明意图

---

### Step 5: M8 — PageHeader 返回按钮无障碍

**文件**: `src/components/PageHeader.tsx`  
**diff**: `step5-M8-pageheader-aria.diff`

**问题**: 全局复用的 PageHeader 组件中，返回按钮仅包含 `<ArrowLeft />` 图标，屏幕阅读器无法识别按钮用途。

**修复方案**: 添加 `aria-label="返回"`

---

## 文件清单

```
patches/0411/
  README.md                                   -- 本文档
  full-0411-all-fixes.diff                    -- 完整 diff（8 文件）
  full-0411-all-fixes.txt                     -- txt 备份
  step1-M1-api-key-security.diff              -- Step 1 diff
  step1-M1-api-key-security.txt               -- Step 1 txt 备份
  step2-M2M3-timer-cleanup-silent-catch.diff  -- Step 2 diff
  step2-M2M3-timer-cleanup-silent-catch.txt   -- Step 2 txt 备份
  step3-M5-cross-tab-sync.diff               -- Step 3 diff
  step3-M5-cross-tab-sync.txt                -- Step 3 txt 备份
  step4-M7M8-preload-aria.diff               -- Step 4 diff
  step4-M7M8-preload-aria.txt                -- Step 4 txt 备份
  step5-M8-pageheader-aria.diff              -- Step 5 diff
  step5-M8-pageheader-aria.txt               -- Step 5 txt 备份
```

## 未修复项（需后续处理）

| 编号 | 说明 | 原因 |
|------|------|------|
| M9 | 硬编码中文字符串（i18n） | 工作量大，需架构设计，建议单独迭代 |
| M8 补充 | 其余页面的 aria-label | 需逐页排查，建议结合 UI 审计统一处理 |
