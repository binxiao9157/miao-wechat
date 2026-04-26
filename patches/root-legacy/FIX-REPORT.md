# Miao V1.0 Bug Fix Report

**Date**: 2026-04-12  
**Scope**: 15 files, 99 insertions / 112 deletions  
**Diff backup**: `fix-report.diff`

---

## P0 — Critical / Blocking

### 1. safeClone 无限递归 (storage.ts)
- **Problem**: `safeClone` 无深度限制，遇到循环引用会栈溢出 (RangeError)
- **Fix**: 添加 `depth` 参数 (上限 10 层) + `WeakSet` 检测循环引用，超限返回 `null`

### 2. GenerationProgress 路由参数缺失白屏 (GenerationProgress.tsx)
- **Problem**: 缺少对必要路由参数的校验，空参数进入时页面白屏
- **Fix**: 添加 early return + 错误提示，缺少参数时引导用户返回

---

## P1 — High Priority

### 3. 外部 CDN 依赖 (CreateCompanion.tsx, Welcome.tsx)
- **Problem**: 引用外部 CDN 资源 (mixkit.co 等)，离线/弱网环境不可用
- **Fix**: 移除外部视频预加载，相关资源改为本地引用或内联

### 4. 密码安全 — 明文硬编码 (Login.tsx, ChangePassword.tsx, PrivacySettings.tsx)
- **Problem**: 密码直接硬编码在前端代码中
- **Fix**: 改为从环境变量 (`import.meta.env`) 读取，并增加运行时校验

### 5. 天数计算精度 (Profile.tsx)
- **Problem**: 陪伴天数计算未归一化到日期零点，跨时区/DST 场景天数偏移
- **Fix**: 统一将起止时间归一化到当天 00:00:00 再做差值计算

---

## P2 — Medium Priority

### 6. ScanFriend file input 不重置 (ScanFriend.tsx)
- **Problem**: 选择同一文件时不触发 `onChange`，用户误以为功能失效
- **Fix**: 在 `finally` 块中重置 `e.target.value = ''`

### 7. ScanFriend 扫描错误回调空函数 (ScanFriend.tsx)
- **Problem**: 扫描帧级别错误被静默吞掉，异常无法排查
- **Fix**: 非常规错误输出 `console.warn`，常规 "No QR code found" 静默处理

### 8. CatPlayer 视频加载无超时 (CatPlayer.tsx)
- **Problem**: 弱网环境下视频永远处于 loading 状态，用户无反馈
- **Fix**: 添加 30 秒超时保护，超时后显示错误提示

### 9. GenerationProgress 积分竞态双扣 (GenerationProgress.tsx)
- **Problem**: 积分扣除在生成完成后执行，并发操作可能导致重复扣除
- **Fix**: 将 `deductPoints` 前置到生成流程开始前（先扣后生成），删除后续 2 处重复扣除代码

### 10. EditProfile 头像 base64 过大 (EditProfile.tsx)
- **Problem**: 压缩后 base64 仍可能超 500KB，写入 localStorage 时逼近配额
- **Fix**: 超过 500KB 自动降低 JPEG 质量至 0.4

### 11. Diary 视频大小检查滞后 (Diary.tsx)
- **Problem**: 视频文件被 FileReader 完整读取后才检查大小，浪费 IO
- **Fix**: 将 `file.size` 检查提前到 `FileReader.readAsDataURL` 调用之前

---

## P3 — Low Priority

### 12. Points 页面 2 秒高频轮询 (Points.tsx)
- **Problem**: 纯本地 localStorage 数据用 `setInterval(2000)` 轮询，浪费性能
- **Fix**: 改为 `StorageEvent` 监听 + `visibilitychange` 事件刷新

### 13. SwitchCompanion 2 秒高频轮询 (SwitchCompanion.tsx)
- **Problem**: 同上
- **Fix**: 改为 `visibilitychange` 事件触发刷新

### 14. Welcome 预加载外部 CDN 视频 (Welcome.tsx)
- **Problem**: 预加载列表包含 mixkit.co 外链，离线不可用且浪费带宽
- **Fix**: 移除外部视频 URL，仅保留本地头像预加载

### 15. AddFriendQR 空猫咪列表崩溃 (AddFriendQR.tsx)
- **Problem**: 猫咪列表为空时 `getCatList()[0]` 返回 `undefined`，后续 `cat.name` 报错
- **Fix**: 添加 `null` 守卫 + 空状态引导页面，引导用户先创建猫咪

---

## Files Changed

| File | Insertions | Deletions |
|------|-----------|-----------|
| AddFriendQR.tsx | +11 | -2 |
| CatPlayer.tsx | +9 | -2 |
| ChangePassword.tsx | +4 | -2 |
| CreateCompanion.tsx | +4 | -68 |
| Diary.tsx | +9 | -5 |
| EditProfile.tsx | +7 | -3 |
| GenerationProgress.tsx | +8 | -11 |
| Login.tsx | +2 | -2 |
| Points.tsx | +11 | -4 |
| PrivacySettings.tsx | +12 | -2 |
| Profile.tsx | +5 | -2 |
| ScanFriend.tsx | +8 | -2 |
| SwitchCompanion.tsx | +4 | -2 |
| Welcome.tsx | +4 | -8 |
| storage.ts | +1 | -1 |
| **Total** | **+99** | **-112** |
