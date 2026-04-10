# Miao V1.0 第三轮修复方案

> 日期: 2026-04-10
> 修复范围: 第三轮审查中所有非安全类问题（约 35+ 项）
> 原则: 不引入新功能、不改变交互逻辑、不影响系统稳定性

## 修复概览

| 步骤 | 类别 | 项数 | 风险 | Diff 文件 |
|------|------|------|------|-----------|
| Step 1 | Critical 运行时崩溃 | 4 | 极低 | `step1-critical-runtime/01-critical-runtime-fixes.diff` |
| Step 2 | React Hook & 生命周期 | 7 | 低 | `step2-react-hooks/02-react-hooks-fixes.diff` |
| Step 3 | 资源与性能 | 6 | 低 | `step3-resource-performance/03-resource-performance-fixes.diff` |
| Step 4 | Service Worker | 3 | 低 | `step4-service-worker/04-service-worker-fixes.diff` |
| Step 5 | 构建与配置 | 3 | 极低 | `step5-build-config/05-build-config-cleanup.diff` |
| Step 6 | 死代码与日志清理 | 12+ | 极低 | `step6-dead-code-cleanup/06-dead-code-cleanup.diff` |

---

## Step 1: Critical — 运行时崩溃修复

### 1.1 AuthContext register() 添加时间戳
- `src/context/AuthContext.tsx` — 在 register() 中添加 `saveLoginTime` 和 `saveLastActiveTime`
- 修复新注册用户刷新即登出

### 1.2 Home.tsx 消除 Effect 循环
- `src/pages/Home.tsx` — 将 `startGreetingTimer` useCallback 改为一次性函数 `showGreetingOnce`，移除 useEffect 对 `startGreetingTimer` 的依赖
- 修复气泡变化导致主 Effect 循环重跑

### 1.3 DiaryCard prop 类型安全
- `src/components/DiaryCard.tsx` — `onDelete={onDeleteComment || (() => {})}`
- 修复 undefined 传入必选 prop 的 TypeError

### 1.4 ErrorBoundary 类型修复
- `src/components/ErrorBoundary.tsx` — `extends React.Component<Props, State>`，移除所有 `as` 强转
- 恢复完整 TypeScript 类型安全

---

## Step 2: React Hook & 生命周期修复

### 2.1 GenerationProgress 依赖数组补全
- 添加 `name` 到 useEffect 依赖

### 2.2 后台任务传入 AbortSignal
- `runBackgroundTasks` 接受 signal 参数，循环前检查 `aborted`

### 2.3 triggerPointToast 定时器清理
- 用 ref 存储 timer ID，在 cleanup 中 clearTimeout

### 2.4 actionRefs useMemo
- 包裹 `useMemo(() => ({...}), [])`

### 2.5 CommentItem clipboard await
- `handleCopy` 改为 `async`，添加 `await`

### 2.6 AuthContext value useMemo
- Provider value 用 `useMemo` 包裹，依赖 `[user, isAuthenticated, hasCat, catCount]`

### 2.7 AuthContext 移除无效 getActiveCat() 调用

---

## Step 3: 资源与性能修复

### 3.1 storage.ts 安全遍历
- 先收集所有 key 到数组，再遍历处理

### 3.2 storage.ts 安全写入包装
- `saveLoginTime` / `saveLastActiveTime` 改用 `storage.setItem()`

### 3.3 废弃 substr() 替换
- 全局 `substr(2, 5)` → `substring(2, 7)`

### 3.4 积分扣减时序修正
- 移到 `setPhase('success')` 之前

### 3.5 CommentItem 触摸防重
- 添加 `isTouchDevice` ref 防止 mouse+touch 双重触发

---

## Step 4: Service Worker 修复

### 4.1 CDN 媒体缓存域名限制
- 仅缓存外部域名的媒体资源

### 4.2 Fallback 仅限 GET
- 非 GET 请求不回退缓存

### 4.3 预缓存列表说明
- 添加注释说明 Vite 构建产物的缓存策略

---

## Step 5: 构建与配置清理

### 5.1 移除无用 loadEnv
### 5.2 修正注释乱码
### 5.3 移除 dependencies 中重复的 vite

---

## Step 6: 死代码与日志清理

### 6.1 移除未使用导入 (4 处)
### 6.2 移除死代码 (interactionBubble state, 注释代码块)
### 6.3 移除 [DEBUG] 系列调试日志 (27+ 处)
### 6.4 移除 volcanoService AccessKey/SecretKey 死代码

---

## 验证清单
- [ ] `npm run dev` 启动无报错
- [ ] `npm run lint` (tsc --noEmit) 无类型错误
- [ ] 新注册用户刷新后登录状态保持
- [ ] Home 页面正常交互、气泡正常显示
- [ ] 视频生成流程完整、积分正确扣减
- [ ] Service Worker 视频播放正常
- [ ] 组件卸载后无 "state update on unmounted" 警告
