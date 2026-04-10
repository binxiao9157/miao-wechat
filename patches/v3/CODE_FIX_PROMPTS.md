# 代码工程修复提示词集合

> 适用于 AI 辅助修复场景，每步一条 prompt，可直接复制使用。
> 所有提示词均以"不改变现有功能、不引入新特性"为前提。

---

## Step 1: Critical 运行时崩溃修复

```
请修复以下 4 个导致页面崩溃或核心功能失效的问题，不改变现有功能逻辑：

1. src/context/AuthContext.tsx 的 register() 方法中缺少 storage.saveLoginTime(Date.now()) 和 storage.saveLastActiveTime(Date.now()) 调用，导致新注册用户刷新页面后因无时间戳被 5 分钟超时逻辑强制登出。请在 saveToken 之后添加这两行。

2. src/pages/Home.tsx 的 startGreetingTimer 使用 useCallback 依赖 [bubbleText]，被放入主 useEffect 依赖数组后导致每次气泡变化都重新执行 Effect（重建定时器、可能重复发放登录积分）。请将问候逻辑改为一次性函数（用 ref 标记是否已执行），从 useEffect 依赖中移除。

3. src/components/DiaryCard.tsx 的 onDeleteComment 是可选 prop（带 ?），但传给 CommentItem.onDelete 时未处理 undefined。请添加 fallback: onDelete={onDeleteComment || (() => {})}。

4. src/components/ErrorBoundary.tsx 使用 extends (React.Component as any) 完全丧失类型安全。请改为 extends React.Component<Props, State>，并移除所有 as State / as Props 强转。
```

---

## Step 2: React Hook & 生命周期修复

```
请修复以下 React Hook 规则违反和生命周期问题：

1. src/pages/GenerationProgress.tsx 的主 useEffect 依赖数组缺少 name（从 location.state 解构）。请添加 name 到依赖数组。

2. 同文件的 runBackgroundTasks() 异步函数不接受 AbortSignal，组件卸载后仍在轮询。请让它接受 signal 参数，每次循环前检查 signal.aborted，并传递给 pollTaskResult。

3. src/pages/Home.tsx 的 triggerPointToast 使用 setTimeout 但未存储 timer ID。请用 useRef 存储，并在组件 cleanup 函数中 clearTimeout。

4. 同文件的 actionRefs 对象字面量每次渲染重建。请用 useMemo 包裹，依赖数组为空。

5. src/components/CommentItem.tsx 的 handleCopy 中 navigator.clipboard.writeText() 未 await。请将函数改为 async 并添加 await。

6. src/context/AuthContext.tsx 的 Provider value 是对象字面量，每次渲染创建新引用导致所有 consumer re-render。请用 useMemo 包裹，依赖 [user, isAuthenticated, hasCat, catCount]。

7. 同文件 login() 中 storage.getActiveCat() 调用返回值未使用且无副作用，请移除该行。
```

---

## Step 3: 资源与性能修复

```
请修复以下资源泄漏和数据一致性问题：

1. src/services/storage.ts 的 pruneStorage() 中 for 循环通过索引遍历 localStorage 同时 setItem，可能跳过元素。请先将所有 key 收集到数组中，再遍历数组处理。

2. 同文件的 saveLoginTime() 和 saveLastActiveTime() 直接调用 localStorage.setItem()，绕过了 QuotaExceededError 处理。请改用 storage.setItem() 包装方法。

3. 同文件和 src/pages/Home.tsx 中所有 .substr(2, 5) 调用。substr() 已废弃，请替换为 .substring(2, 7)。

4. src/pages/GenerationProgress.tsx 中积分扣减在 setPhase('success') 之后执行。请将 storage.deductPoints 调用移到 setPhase('success') 之前。

5. src/components/CommentItem.tsx 同时绑定 onMouseDown 和 onTouchStart 导致触屏设备双重触发。请添加 isTouchDevice ref，在 touch 事件中标记，mouse 事件中检查并跳过。
```

---

## Step 4: Service Worker 修复

```
请修复 public/service-worker.js 中的以下问题：

1. fetch 事件中媒体资源匹配（第 109 行）仅检查文件扩展名，导致同域的非 CDN 请求也被缓存。请增加 hostname 检查，仅对外部域名（hostname !== self.location.hostname）的媒体资源使用缓存优先策略。

2. fallback handler（第 120-123 行）对所有失败请求都回退缓存，包括 POST 请求。请仅对 GET 请求回退缓存，非 GET 请求不拦截（直接 return）。

3. STATIC_ASSETS 预缓存列表仅 3 个文件。请添加注释说明 Vite 构建产物的哈希文件名由浏览器缓存策略处理，如需完整离线支持建议集成 vite-plugin-pwa。
```

---

## Step 5: 构建与配置清理

```
请清理以下构建配置问题：

1. vite.config.ts 中 loadEnv 被导入并赋值给 env 变量但从未使用。请移除 loadEnv 导入、({mode}) 参数和 env 变量声明。

2. 同文件第 18 行注释中包含乱码字符 "modifyâfile"，请修正为 "modify - file"。

3. package.json 中 vite 同时出现在 dependencies 和 devDependencies。请从 dependencies 中移除，仅保留 devDependencies。
```

---

## Step 6: 死代码与调试日志清理

```
请清理以下未使用的代码和调试日志：

1. 未使用的导入：
   - src/pages/Home.tsx: 移除 Settings（从 lucide-react）
   - src/pages/Diary.tsx: 移除 MoreHorizontal（从 lucide-react）
   - src/pages/EditProfile.tsx: 移除 Camera as CameraIcon 别名（保留 Camera）
   - src/services/volcanoService.ts: 移除 VolcanoConfig 中的 AccessKey 和 SecretKey 环境变量读取

2. 死代码：
   - src/pages/Home.tsx: 移除 interactionBubble state（从未被赋予真值）及其对应的 useEffect
   - src/pages/Home.tsx: 移除注释掉的隐藏按钮代码块（约 9 行）

3. 调试日志：批量移除以下文件中所有 [DEBUG]、[PRIORITY]、[BACKGROUND] 前缀的 console.log/warn/error：
   - src/pages/GenerationProgress.tsx（14 处）
   - src/pages/CatPlayer.tsx（7 处）
   - src/pages/Login.tsx（1 处）
   - src/pages/ResetPassword.tsx（1 处，含敏感验证码泄露）
   - src/services/volcanoService.ts（3 处）
   - src/components/CommentItem.tsx（1 处）
   注意：保留非 debug 前缀的合法错误处理日志。
```

---

## 通用注意事项

- 所有修复不引入新功能、不改变现有交互逻辑
- 修复后需验证: `npm run dev` 启动无报错、`npm run lint` 无类型错误
- 安全类问题（明文密码、API Key localStorage 等）为演示应用已知限制，不修复
