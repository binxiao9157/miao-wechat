# 稳定性 + 性能问题修复报告

> 日期: 2026-04-13
> 修复项: 7 个 MEDIUM 以上问题（3 HIGH + 4 MEDIUM）

---

## 问题总览

| 编号 | 问题 | 严重程度 | 文件 |
|------|------|----------|------|
| B1 | IndexedDB 不可用时无降级 | HIGH | `src/pages/Diary.tsx` |
| B2 | 后台视频生成部分失败无回滚 | HIGH | `src/pages/GenerationProgress.tsx` |
| P1 | localStorage 容量风险 | HIGH | `src/services/fileManager.ts` |
| B3 | 猫咪入库后激活缺校验 | MEDIUM | `src/pages/GenerationProgress.tsx` |
| B4 | 组件卸载后异步操作未完全中止 | MEDIUM | `src/pages/GenerationProgress.tsx` |
| P3 | MOCK_MODE 可被运行时切换 | MEDIUM | `src/services/volcanoService.ts` |
| P4 | 前端 console 未在生产构建剥离 | MEDIUM | `vite.config.ts` |

---

## 修复详情

### B1 — IndexedDB 降级（HIGH）

**根因:** `Diary.tsx` 中 `await mediaStorage.saveMedia()` 无 try-catch。隐私模式下 IndexedDB 不可用时，Promise 拒绝导致整个发布流程失败，用户只看到"发布失败"。

**修复:** 包裹 try-catch，失败时降级为 inline base64：

```diff
-        await mediaStorage.saveMedia(diaryId, base64);
-        mediaUrl = `indexeddb:${diaryId}`;
+        try {
+          await mediaStorage.saveMedia(diaryId, base64);
+          mediaUrl = `indexeddb:${diaryId}`;
+        } catch {
+          mediaUrl = base64;
+        }
```

**降级代价:** base64 直存 localStorage 可能更快触达配额限制，但至少保证功能可用。

---

### B2 — Promise.allSettled 替换 Promise.all（HIGH）

**根因:** `handleUnlockAll` 中 3 个二级视频（tail/rubbing/blink）通过 `Promise.all` 并行轮询。任一失败导致整个 Promise 拒绝，已成功保存的视频正常但 unlocking 标记清除逻辑走 catch 分支，无法区分"全部失败"与"部分成功"。

**修复:** 改用 `Promise.allSettled`，逐个检查结果：

```diff
-      await Promise.all(pollPromises);
-      await FileManager.updateCatVideos(newCatId, {}, false);
+      const results = await Promise.allSettled(pollPromises);
+      results.forEach((r, i) => {
+        if (r.status === 'rejected') console.error(`动作 ${secondaryActions[i]} 生成失败:`, r.reason);
+      });
+      await FileManager.updateCatVideos(newCatId, {}, false);
```

---

### P1 — 压缩缩略图降低 localStorage 占用（HIGH）

**根因:** `CatInfo` 中 `placeholderImage` 和 `anchorFrame` 存储完整 base64 图片（每张 200KB-1MB）。3+ 只猫咪即接近 5MB localStorage 上限。

**修复:** 在 `fileManager.ts` 添加 `compressForStorage()` 辅助函数，入库前压缩：
- `placeholderImage`: max 200px, quality 0.5（仅用于缩略占位，~5-10KB）
- `anchorFrame`: max 600px, quality 0.7（用于后续 API 提交的 fallback，需保留细节，~30-60KB）

单只猫咪 localStorage 占用从 ~1MB 降至 ~50KB。

---

### B3 — 入库校验（MEDIUM）

**根因:** `storage.setActiveCatId(newCatId)` 在 `FileManager.downloadVideos()` 之后执行，但无校验 cat 是否真正入库成功。若 `saveCatInfo` 因配额不足静默失败，会产生一个指向不存在猫咪的 activeCatId。

**修复:** 激活前校验：

```diff
+      const saved = storage.getCatById(newCatId);
+      if (!saved) throw new Error('猫咪数据保存失败');
       storage.setActiveCatId(newCatId);
```

---

### B4 — Abort Signal 完善（MEDIUM）

**根因:**
1. `startI2VPhase` 中图片优化（new Image() + Canvas resize）不检查 abort signal，卸载后仍在运行
2. cleanup 函数中 `i2vAbortRef.current` 未置 null

**修复:**
1. image.onload 回调开头加 `if (abortSignal.aborted) { resolve(img); return; }`
2. cleanup 中 `i2vAbortRef.current = null`

---

### P3 — MOCK_MODE 只读化（MEDIUM）

**根因:** `VolcanoConfig.MOCK_MODE` 是普通属性，用户可在浏览器控制台执行 `VolcanoConfig.MOCK_MODE = true` 切换为 mock 模式，绕过真实 API 调用。

**修复:** 改为 getter，生产环境恒返回 false：

```diff
-  MOCK_MODE: false,
+  get MOCK_MODE() { return import.meta.env.DEV && localStorage.getItem('VOLC_MOCK_MODE') === 'true'; },
```

`import.meta.env.DEV` 在生产构建时被 Vite tree-shake 为 `false`，整个 getter 返回 `false`。getter 属性不可通过赋值覆盖。

---

### P4 — 生产构建剥离 console（MEDIUM）

**根因:** 前端代码含 56 条 console.log/warn/error 语句，生产构建未配置剥离。

**修复:** vite.config.ts 增加 esbuild drop 配置：

```diff
-export default defineConfig(() => {
+export default defineConfig(({ mode }) => {
   return {
     plugins: [react(), tailwindcss()],
+    esbuild: {
+      drop: mode === 'production' ? ['console', 'debugger'] : [],
+    },
```

仅影响前端包（Vite 构建产物），server.ts 的服务端日志不受影响。

---

## 影响范围

| 文件 | 改动 |
|------|------|
| `vite.config.ts` | 新增 esbuild.drop 配置 |
| `src/services/volcanoService.ts` | MOCK_MODE 改为 getter |
| `src/pages/Diary.tsx` | mediaStorage.saveMedia 加 try-catch 降级 |
| `src/services/fileManager.ts` | 新增 compressForStorage 函数 + 入库前压缩 |
| `src/pages/GenerationProgress.tsx` | Promise.allSettled + 入库校验 + abort signal 完善 |

## Diff 备份

`patches/stability-perf-fix.diff.txt`
