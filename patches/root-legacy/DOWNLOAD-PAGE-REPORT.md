# PWA 扫码下载落地页功能说明

## 背景

Miao 作为 PWA 应用部署到腾讯云服务器后，用户只能通过浏览器手动打开网址再"添加到主屏幕"来安装。为降低安装门槛，新增独立的下载落地页 `/download`，支持扫码访问并引导用户完成 PWA 安装。

## 改动概览

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/pages/Download.tsx` | 新建 | 下载落地页组件（约 200 行） |
| `src/App.tsx` | 修改 | 添加 lazy import + `/download` 公开路由 |
| `src/pages/Login.tsx` | 修改 | 登录页 footer 添加"扫码下载 App"入口 |

## 功能详情

### 1. 下载落地页 (`/download`)

**访问方式：** `https://你的域名/download`，无需登录即可访问。

**页面结构：**

- **品牌区域** — Miao logo + 标语"扫描二维码，开启与猫咪的治愈旅程"
- **QR 码卡片** — 二维码指向应用首页 URL，中心嵌入应用图标，下方显示完整 URL
- **一键安装按钮** — 仅在浏览器支持 `beforeinstallprompt` 时显示（主要是 Android Chrome），点击直接触发 PWA 安装
- **已安装检测** — 若已在 standalone 模式下运行，显示"已安装"提示
- **安装教程** — 分平台引导，自动高亮当前设备类型：
  - **iPhone / iPad:** Safari 打开 → 点击分享按钮 → 添加到主屏幕
  - **Android:** Chrome 打开 → 更多菜单 → 安装应用 / 添加到主屏幕
- **登录入口** — 底部"已有账号？去登录"链接

**技术实现：**
- 使用 `qrcode.react` 的 `QRCodeCanvas` 生成二维码（已有依赖）
- 通过 `navigator.userAgent` 检测 iOS / Android / Desktop
- 监听 `beforeinstallprompt` 事件实现一键安装（复用 `InstallPromptBanner` 的模式）
- 通过 `window.matchMedia("(display-mode: standalone)")` 检测已安装状态
- 复用项目现有 UI 风格：PawIcon、motion 动画、圆角卡片、品牌配色

### 2. 路由注册

在 `App.tsx` 中添加为公开路由，与 `/terms`、`/privacy-policy` 同级，不需要 `ProtectedRoute` 包裹。

### 3. 登录页入口

在登录页底部 footer 区域（版权信息上方）添加"扫码下载 App"按钮，点击跳转至 `/download` 页面。

## 使用场景

1. **线下推广** — 将 `https://域名/download` 生成二维码印刷在海报、名片、传单上
2. **社交分享** — 直接发送 `/download` 链接给朋友
3. **桌面端引导** — 在电脑上打开 `/download` 页面，用手机扫描页面上的二维码
4. **登录页引导** — 新用户在登录页即可发现扫码下载入口

## 相关文件

- 功能代码：`src/pages/Download.tsx`、`src/App.tsx`、`src/pages/Login.tsx`
- Diff 文件：`download-page.diff`
- Diff 备份：`download-page.diff.txt`
