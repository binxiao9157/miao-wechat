# Miao PWA → 原生 App 架构迁移分析

---

## 一、当前架构概览

| 层级 | 技术方案 | 关键文件 |
|------|---------|---------|
| **前端框架** | React 19 + TypeScript + Vite 6 | `src/App.tsx` |
| **路由** | React Router v7 (29 个页面，懒加载) | `src/App.tsx` |
| **状态管理** | Context API (AuthContext) | `src/context/AuthContext.tsx` |
| **数据持久化** | localStorage + IndexedDB | `src/services/storage.ts` (851行) |
| **认证** | 纯本地认证，mock token，每次打开需重新登录 | `AuthContext.tsx` |
| **后端** | Express 静态服务 + 火山引擎 AI API 代理 | `server.ts` |
| **PWA** | Service Worker 离线缓存 + manifest | `public/service-worker.js` |
| **UI** | Tailwind CSS v4 + Lucide 图标 + Framer Motion | `src/index.css` |
| **原生能力** | 摄像头(QR扫码)、Web Share、AudioContext、Canvas | 各页面组件 |

---

## 二、技术路线选择

有三条主要路线，各有取舍：

### 方案 A：React Native（推荐）

**理由**：当前项目是 React + TypeScript，团队技能栈可直接复用。

| 维度 | 评估 |
|------|------|
| **代码复用率** | 业务逻辑层 ~70%，UI 层需全部重写 |
| **学习成本** | 低（已有 React 经验） |
| **原生能力** | react-native-camera、react-native-share 等生态成熟 |
| **性能** | 接近原生，视频播放/动画性能好 |
| **发布** | 支持 CodePush 热更新 |

### 方案 B：Flutter

| 维度 | 评估 |
|------|------|
| **代码复用率** | 仅业务逻辑思路可参考，代码需 Dart 重写 |
| **学习成本** | 高（Dart 语言 + Widget 体系） |
| **原生能力** | 插件生态完善 |
| **性能** | 自绘引擎，动画性能优秀 |
| **优势** | iOS/Android UI 一致性最好 |

### 方案 C：Capacitor / Ionic（渐进方案）

| 维度 | 评估 |
|------|------|
| **代码复用率** | ~90%+，现有 React 代码几乎直接运行 |
| **学习成本** | 最低 |
| **原生能力** | 通过 Capacitor 插件桥接 |
| **性能** | 本质仍是 WebView，复杂动画和视频体验不如原生 |
| **适用场景** | 快速上架，对性能要求不极端 |

---

## 三、按架构层级的具体调整

### 1. 数据存储层（影响最大）

当前方案：localStorage 存结构化数据（用户名空间 `u_{username}_{key}`），IndexedDB 存媒体文件。

**问题**：

- localStorage 有 5-10MB 限制，无法扩展
- 无加密，密码明文存储在 `miao_users` 中
- 无数据同步能力，换设备数据丢失

**需调整为**：

| 数据类型 | 原方案 | 原生方案 |
|---------|--------|---------|
| 用户凭证 | localStorage 明文 | iOS Keychain / Android EncryptedSharedPreferences |
| 结构化数据 | localStorage JSON | SQLite（推荐 WatermelonDB 或 Realm） |
| 媒体文件 | IndexedDB | 设备文件系统 + SQLite 元数据索引 |
| 缓存 | memCache Map | 原生内存缓存（LRU） |
| 跨 Tab 同步 | `storage` 事件监听 | 不需要（原生单实例） |

**迁移要点**：

- `storage.ts` 中的 851 行代码需要完全重构为 Repository 模式
- 当前的 `STORAGE_KEYS` / `USER_DATA_KEYS` 命名空间设计可映射为数据库表结构
- `pruneStorage()` 的配额管理逻辑在原生端仍需保留，但阈值可大幅提升

### 2. 认证与安全（需重建）

当前方案：纯本地验证，mock token，每次启动清除会话。

**问题**：

- 无真实后端认证，密码本地存储
- App Store 审核可能质疑无网络认证的安全性
- 无法支持多设备同步

**需调整为**：

```
注册/登录 → 后端认证服务 → JWT/Session Token → 安全存储
                ↓
         可选：第三方登录（微信/Apple ID）
```

| 环节 | 调整内容 |
|------|---------|
| 注册/登录 | 接入真实后端（Firebase Auth / 自建） |
| Token 存储 | Keychain (iOS) / EncryptedSharedPreferences (Android) |
| 会话管理 | Token 自动刷新 + 生物识别解锁（Face ID / 指纹） |
| Apple 要求 | 若提供第三方登录，**必须**支持 Sign in with Apple |

### 3. 网络与 API 层（中等改动）

当前方案：Express 做 API 代理（火山引擎视频/图片生成），前端 Axios 调用。

**需调整**：

| 项目 | 调整 |
|------|------|
| API 代理 | 保留后端代理架构（保护 API Key），但需独立部署为云服务 |
| HTTP 客户端 | Axios → 原生 HTTP 库（React Native 仍可用 Axios / fetch） |
| 离线处理 | Service Worker → 原生后台任务 + 请求队列 |
| 视频下载 | SW 缓存 → 后台下载任务（NSURLSession / WorkManager） |
| 超时/重试 | `volcanoService.ts` 的重试逻辑可直接复用 |

### 4. UI 与交互层（全部重写或适配）

#### React Native 路线

| 当前技术 | 替换为 |
|---------|--------|
| Tailwind CSS | NativeWind（Tailwind for RN）或 StyleSheet |
| `<div>`, `<span>` | `<View>`, `<Text>` |
| Framer Motion (`motion.div`) | `react-native-reanimated` + `react-native-gesture-handler` |
| Lucide React | `lucide-react-native` |
| React Router | React Navigation (Stack + Bottom Tab) |
| `<video>` 标签 | `react-native-video`（AVPlayer/ExoPlayer） |
| CSS safe-area-inset | `react-native-safe-area-context` |
| 自定义 `.miao-card` 等 | 封装 RN 组件（`MiaoCard`, `MiaoInput`, `MiaoButton`） |

#### Capacitor 路线

| 当前技术 | 调整 |
|---------|------|
| Tailwind CSS | **保留**，无需修改 |
| Framer Motion | **保留** |
| React Router | **保留** |
| PWA meta 标签 | 移除，由 Capacitor 处理状态栏 |
| Service Worker | 禁用，由 Capacitor 处理离线 |

### 5. 原生能力映射

| 功能 | 当前 Web API | iOS 原生 | Android 原生 | RN 库 |
|------|-------------|---------|-------------|-------|
| 摄像头/QR扫码 | html5-qrcode + getUserMedia | AVCaptureSession | CameraX | `react-native-camera-kit` |
| 手电筒 | `track.applyConstraints({torch})` | AVCaptureDevice.torchMode | Camera2 API | 同上，内置 |
| 分享 | Web Share API | UIActivityViewController | ShareCompat.IntentBuilder | `react-native-share` |
| 剪贴板 | navigator.clipboard | UIPasteboard | ClipboardManager | `@react-native-clipboard` |
| 图片裁剪 | react-easy-crop (Canvas) | 系统相册裁剪 / TOCropViewController | uCrop | `react-native-image-crop-picker` |
| 图片压缩 | Canvas downscale → JPEG 0.5 | ImageIO / UIImage | BitmapFactory | `react-native-image-resizer` |
| 音频合成 | Web AudioContext (猫叫声) | AVAudioEngine | AudioTrack / Oboe | `react-native-audio-api` |
| 推送通知 | 设置项存在但未实现 | APNs | FCM | `react-native-push-notification` |
| 生物识别 | 无 | Face ID / Touch ID | 指纹 / 面部 | `react-native-biometrics` |
| 本地通知 | 无 | UNUserNotificationCenter | NotificationManager | `notifee` |

### 6. 离线与缓存策略

当前 Service Worker 策略需替换：

| SW 策略 | 原生替代 |
|--------|---------|
| 预缓存静态资源 | App Bundle 已包含 |
| 视频 Cache-first | 后台下载 + 本地文件缓存 |
| API Network-first | SQLite 缓存 + 网络同步 |
| 503 离线降级 | 原生网络状态监听 + 离线 UI |
| 自动更新检测 | App Store 更新 / CodePush |

### 7. 发布与分发

| 项目 | iOS | Android |
|------|-----|---------|
| 开发者账号 | Apple Developer Program ($99/年) | Google Play Console ($25 一次性) |
| 签名 | Provisioning Profile + Certificate | Keystore 签名 |
| 审核周期 | 1-3 天（首次可能更长） | 几小时到几天 |
| 热更新 | CodePush / OTA（注意 Apple 限制） | CodePush / 自更新 |
| 最低版本 | iOS 15+ (推荐) | Android 8.0+ / API 26+ |

---

## 四、需要新增的后端服务

当前后端（`server.ts`）仅是静态文件服务 + AI API 代理，转原生 App 后需要：

| 服务 | 必要性 | 说明 |
|------|-------|------|
| **用户认证服务** | 必须 | 注册/登录/Token 管理 |
| **数据同步 API** | 强烈建议 | 猫咪、日记、积分等云端同步 |
| **推送服务** | 建议 | APNs/FCM 集成 |
| **CDN / 对象存储** | 建议 | 用户上传的图片/视频（替代 localStorage） |
| **AI API 代理** | 保留 | 火山引擎代理（保护 API Key） |

可选方案：**Firebase**（Auth + Firestore + Storage + FCM）一站式解决，或 **Supabase** 开源替代。

---

## 五、推荐迁移路径

### 阶段一：快速上架（Capacitor，2-4 周）

```
当前 React PWA → Capacitor 包装 → iOS/Android App
```

- 代码改动最小，90%+ 复用
- 替换 html5-qrcode → Capacitor Camera 插件
- 替换 localStorage → Capacitor Preferences / SQLite 插件
- 适合验证市场需求

### 阶段二：体验升级（React Native 重写，2-3 月）

```
新建 React Native 项目 → 迁移业务逻辑 → 重写 UI 层 → 接入原生能力
```

- 业务逻辑（storage 命名空间、积分计算、信件逻辑）可移植
- UI 全部用 RN 组件重写
- 视频播放、动画体验大幅提升

### 阶段三：云端化（持续迭代）

```
搭建后端服务 → 数据云同步 → 多设备支持 → 推送通知
```

---

## 六、风险与注意事项

1. **Apple 审核**：纯本地认证 + 无网络功能的 App 可能被拒，需要有实质性的原生功能
2. **数据迁移**：如果已有 PWA 用户，需提供 localStorage 数据导出/导入机制
3. **视频生成**：火山引擎 API 调用需保留服务端代理，不能将 API Key 打包进客户端
4. **音频合成**：当前 Web AudioContext 生成猫叫声的方式在原生端需改用平台音频引擎
5. **存储安全**：密码不能再明文存储，必须后端哈希或使用系统 Keychain
