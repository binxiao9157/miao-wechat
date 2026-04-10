# Miao V1.0 第三轮代码审查报告

> 审查日期: 2026-04-10
> 审查范围: 全量源代码（排除 node_modules、dist）
> 基准: main 分支最新提交

## 排除项（演示应用已知限制）
以下安全类问题经确认为调试/演示用途，本轮不修复：
- 明文密码存储（localStorage）
- API Key 客户端存储（localStorage）
- 无速率限制
- SSRF 无域名白名单
- server.ts 绑定 0.0.0.0
- server.ts 50MB body limit

---

## 问题汇总

| 严重级别 | 数量 |
|---------|------|
| Critical | 4 |
| High | 7 |
| Medium | 9 |
| Low | 15+ |
| **合计** | **35+** |

---

## Critical（4 项）

### C-01: AuthContext register() 缺少时间戳
- **文件**: `src/context/AuthContext.tsx:74-83`
- **问题**: 注册后未调用 `saveLoginTime` / `saveLastActiveTime`，新用户刷新页面因无时间戳被强制登出
- **影响**: 新注册用户无法保持登录状态

### C-02: Home.tsx startGreetingTimer 导致 Effect 循环
- **文件**: `src/pages/Home.tsx:72-87, 167`
- **问题**: `startGreetingTimer` 依赖 `[bubbleText]`，加入主 useEffect 依赖数组后，每次气泡变化触发 Effect 重跑（重建定时器、可能重复发放积分）
- **影响**: 性能退化、积分可能被重复发放

### C-03: DiaryCard 可选 prop 传给必选 prop
- **文件**: `src/components/DiaryCard.tsx:16, 131`
- **问题**: `onDeleteComment?`（可选）传给 `CommentItem.onDelete`（必选），undefined 时运行时 TypeError
- **影响**: 页面崩溃

### C-04: ErrorBoundary 类型擦除
- **文件**: `src/components/ErrorBoundary.tsx:13`
- **问题**: `extends (React.Component as any)` 丧失所有类型安全
- **影响**: TypeScript 类型检查无效

---

## High（7 项）

### H-01: GenerationProgress useEffect 缺少 name 依赖
- **文件**: `src/pages/GenerationProgress.tsx:275`
- **问题**: `name` 在回调中使用但不在依赖数组，导致闭包过期

### H-02: GenerationProgress 后台任务无 abort
- **文件**: `src/pages/GenerationProgress.tsx:132-152`
- **问题**: `runBackgroundTasks()` 不接受 abort signal，组件卸载后仍在轮询

### H-03: Home.tsx triggerPointToast 定时器泄漏
- **文件**: `src/pages/Home.tsx:225-228`
- **问题**: setTimeout 未存储 ID，组件卸载时无法清理

### H-04: Home.tsx actionRefs 每次渲染重建
- **文件**: `src/pages/Home.tsx:44-49`
- **问题**: 对象字面量每次渲染创建新引用

### H-05: CommentItem clipboard 未 await
- **文件**: `src/components/CommentItem.tsx:42-48`
- **问题**: `navigator.clipboard.writeText()` 返回 Promise 但未 await

### H-06: AuthContext context value 每次渲染重建
- **文件**: `src/context/AuthContext.tsx:107`
- **问题**: Provider value 对象字面量导致所有 consumer 每次都 re-render

### H-07: storage.ts pruneStorage 遍历时修改
- **文件**: `src/services/storage.ts:174`
- **问题**: for 循环中遍历 localStorage 同时 setItem，可能跳过元素

---

## Medium（9 项）

### M-01: storage.ts saveLoginTime/saveLastActiveTime 绕过安全写入
- **文件**: `src/services/storage.ts:320-336`

### M-02: GenerationProgress 积分扣减时序
- **文件**: `src/pages/GenerationProgress.tsx:159-162`
- **问题**: 积分在 UI 显示成功后才扣减

### M-03: CommentItem touch + mouse 双重触发
- **文件**: `src/components/CommentItem.tsx:25-40, 61-65`

### M-04: AuthContext storage.getActiveCat() 无效调用
- **文件**: `src/context/AuthContext.tsx:66`
- **问题**: 返回值未使用，调用无副作用

### M-05: Service Worker fallback 缓存所有请求
- **文件**: `public/service-worker.js:120-123`

### M-06: Service Worker CDN URL 匹配过于宽泛
- **文件**: `public/service-worker.js:109`

### M-07: vite.config.ts 无用 loadEnv 导入
- **文件**: `vite.config.ts:4, 7`

### M-08: vite.config.ts 注释乱码字符
- **文件**: `vite.config.ts:18`

### M-09: package.json 重复 vite 依赖
- **文件**: `package.json:30, 39`

---

## Low（15+ 项）

### L-01 ~ L-04: 未使用的导入
| 文件 | 移除项 |
|------|--------|
| `src/pages/Home.tsx` | `Settings` from lucide-react |
| `src/pages/Diary.tsx` | `MoreHorizontal` from lucide-react |
| `src/pages/EditProfile.tsx` | `Camera as CameraIcon` 别名 |
| `src/services/volcanoService.ts` | `AccessKey`, `SecretKey` 环境变量 |

### L-05 ~ L-06: 死代码
| 文件 | 移除项 |
|------|--------|
| `src/pages/Home.tsx:574-582` | 注释掉的隐藏按钮代码块 |
| `src/pages/Home.tsx:30` | `interactionBubble` state（从未被赋值） |

### L-07 ~ L-12: 废弃方法
| 文件 | 行号 | 问题 |
|------|------|------|
| `src/services/storage.ts` | 489, 513 | `substr()` 废弃 |
| `src/pages/Home.tsx` | 106, 146, 251 | `substr()` 废弃 |

### L-13+: 调试日志清理
以下文件中的 `[DEBUG]` / `[PRIORITY]` / `[BACKGROUND]` 前缀 console.log：
- `src/pages/GenerationProgress.tsx` — 14 处
- `src/pages/CatPlayer.tsx` — 7 处
- `src/pages/Login.tsx` — 1 处
- `src/pages/ResetPassword.tsx` — 1 处（含敏感验证码输出）
- `src/services/volcanoService.ts` — 3 处
- `src/components/CommentItem.tsx` — 1 处
