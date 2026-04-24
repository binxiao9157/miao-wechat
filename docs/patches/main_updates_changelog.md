# Main 分支更新日志（dbf06c6 → 8c2cb57）

> 更新时间：2026-04-24  
> 提交数量：5 commits  
> 提交者：binxiao9157（via Replit Agent）

---

## 一、变更概览

| # | Commit | 说明 |
|---|--------|------|
| 1 | `b40cc58` | 服务端配置更新 + 项目文档新增 |
| 2 | `c838673` | 全项目 Logo 替换为新爪印图标 |
| 3 | `603f942` | PawLogo 组件由 SVG 改为 PNG 图片 |
| 4 | `03aa644` | Logo 更新为透明背景版本 |
| 5 | `8c2cb57` | 各页面 Logo 尺寸微调 |

---

## 二、详细变更

### 1. 服务端配置更新 + 项目文档新增（`b40cc58`）

**涉及文件：** `.replit`、`replit.md`、`server.ts`、`vite.config.ts`、`package-lock.json`

- **server.ts**：端口从硬编码 `3000` 改为读取环境变量 `PORT`，默认 `5000`
  ```diff
  - const PORT = 3000;
  + const PORT = parseInt(process.env.PORT || "5000", 10);
  ```

- **vite.config.ts**：新增 `host: '0.0.0.0'` 和 `allowedHosts: true`，允许外部访问开发服务器
  ```diff
  + host: '0.0.0.0',
  + allowedHosts: true,
  ```

- **新增 `.replit`**：Replit 平台运行配置（nodejs-20 模块、端口映射 5000、autoscale 部署）

- **新增 `replit.md`**：项目说明文档，包含技术栈、目录结构、环境变量、开发/部署命令

- **package-lock.json**：移除空的 `devDependencies: {}`

---

### 2. 全项目 Logo 替换为新爪印图标（`c838673`）

**涉及文件：** 6 个图片文件（二进制）

| 文件 | 变化 |
|------|------|
| `attached_assets/logio_1776997791947.png` | 新增（原始素材） |
| `logo1.png` | 1093KB → 541KB，替换为新爪印 |
| `logo2.png` | 1189KB → 541KB，替换为新爪印 |
| `public/icon-32.png` | 4KB → 541KB，替换为新爪印 |
| `public/icon-180.png` | 13KB → 541KB，替换为新爪印 |
| `public/og-image.jpg` | 74KB → 541KB，替换为新爪印 |

---

### 3. PawLogo 组件重构：SVG → PNG（`603f942`）

**涉及文件：** `src/components/PawLogo.tsx`、`public/logo.png`

- **新增 `public/logo.png`**：新爪印 Logo 静态资源
- **PawLogo.tsx**：删除约 90 行 SVG 手绘水彩滤镜代码，替换为简单的 `<img>` 标签
  ```tsx
  // 修改前：复杂的 SVG 组件（含水彩滤镜、渐变、噪点纹理）
  // 修改后：
  <img
    src="/logo.png"
    width={size}
    height={size}
    className={className}
    alt="logo"
  />
  ```

---

### 4. Logo 更新为透明背景版本（`03aa644`）

**涉及文件：** 6 个图片文件（二进制）

| 文件 | 变化 |
|------|------|
| `logo1.png` | 541KB → 545KB |
| `logo2.png` | 541KB → 545KB |
| `public/icon-180.png` | 541KB → 545KB |
| `public/icon-32.png` | 541KB → 545KB |
| `public/logo.png` | 541KB → 545KB |
| `public/og-image.jpg` | 541KB → 42KB（JPEG 格式，带背景色） |

所有 PNG Logo 统一替换为透明背景版本，OG 图片单独生成带应用背景色的 JPEG 版本。

---

### 5. 各页面 Logo 尺寸微调（`8c2cb57`）

**涉及文件：** `src/pages/Download.tsx`、`src/pages/Login.tsx`、`src/pages/Register.tsx`

| 页面 | 修改前 | 修改后 | 对齐目标 |
|------|--------|--------|----------|
| Download.tsx | `size={32}` | `size={36}` | `text-3xl` |
| Login.tsx | `size={28}` | `size={36}` | `text-3xl` |
| Register.tsx | `size={32}` | `size={40}` | `text-4xl` |

---

## 三、影响范围总结

| 类别 | 文件 |
|------|------|
| 新增文件 | `.replit`、`replit.md`、`public/logo.png`、`attached_assets/logio_1776997791947.png` |
| 修改文件 | `server.ts`、`vite.config.ts`、`package-lock.json`、`PawLogo.tsx`、`Download.tsx`、`Login.tsx`、`Register.tsx` |
| 图片替换 | `logo1.png`、`logo2.png`、`public/icon-32.png`、`public/icon-180.png`、`public/og-image.jpg` |

---

## 四、迁移注意事项

1. **端口变更**：服务端默认端口从 `3000` → `5000`，本地开发需注意端口冲突
2. **Vite 配置**：新增 `host: '0.0.0.0'` + `allowedHosts: true`，仅适用于 Replit 等云环境，本地开发注意安全性
3. **PawLogo 组件接口不变**：`size`、`className` props 保持兼容，`id` prop 不再使用
4. **Replit 专属文件**：`.replit` 和 `replit.md` 为 Replit 平台配置，其他环境可忽略
