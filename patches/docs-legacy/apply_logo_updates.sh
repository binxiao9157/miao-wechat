#!/bin/bash
#
# apply_logo_updates.sh
# 将 Logo 从 SVG 内联方案切换为 PNG 图片方案（不依赖 git）
#
# 使用方式:
#   cd <项目根目录>
#   bash docs/patches/apply_logo_updates.sh
#
# 变更清单:
#   1. PawLogo.tsx: SVG 内联绘制 → <img src="/logo.png">
#   2. Login.tsx:    PawLogo size 28 → 36
#   3. Register.tsx: PawLogo size 32 → 40
#   4. Download.tsx: PawLogo size 32 → 36
#   5. 二进制文件: logo.png 复制到 public/ 及各图标位置
#
# 前置条件:
#   - 项目根目录下需存在 logo.png（新 logo 源文件）
#

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$PROJECT_ROOT"

echo "========================================="
echo " Miao Logo 更新脚本"
echo " 工作目录: $PROJECT_ROOT"
echo "========================================="

# ---------- 前置检查 ----------
LOGO_SRC="logo.png"
if [ ! -f "$LOGO_SRC" ]; then
    echo "[ERROR] 未找到 $LOGO_SRC，请将新 logo 文件放在项目根目录后重试。"
    exit 1
fi

ERRORS=0
for f in src/components/PawLogo.tsx src/pages/Login.tsx src/pages/Register.tsx src/pages/Download.tsx; do
    if [ ! -f "$f" ]; then
        echo "[ERROR] 缺少文件: $f"
        ERRORS=1
    fi
done
[ "$ERRORS" -eq 1 ] && exit 1

echo ""
echo "[1/3] 覆写 src/components/PawLogo.tsx ..."

cat > src/components/PawLogo.tsx << 'PAWLOGO_EOF'
import React from "react";

interface PawLogoProps {
  size?: number;
  className?: string;
  id?: string;
}

export default function PawLogo({ size = 48, className = "", id }: PawLogoProps) {
  return (
    <img
      src="/logo.png"
      width={size}
      height={size}
      className={className}
      alt="logo"
    />
  );
}
PAWLOGO_EOF

echo "    done."

echo ""
echo "[2/3] 调整页面 Logo 尺寸 ..."

# Login.tsx: size={28} → size={36}
sed -i 's/<PawLogo className="-rotate-12 transition-transform group-hover:-rotate-6" size={28} \/>/<PawLogo className="-rotate-12 transition-transform group-hover:-rotate-6" size={36} \/>/' \
    src/pages/Login.tsx
echo "    Login.tsx:    28 → 36"

# Register.tsx: size={32} → size={40}
sed -i 's/<PawLogo className="-rotate-12 transition-transform group-hover:-rotate-6" size={32} \/>/<PawLogo className="-rotate-12 transition-transform group-hover:-rotate-6" size={40} \/>/' \
    src/pages/Register.tsx
echo "    Register.tsx: 32 → 40"

# Download.tsx: size={32} → size={36}
sed -i 's/<PawLogo className="-rotate-12" size={32} \/>/<PawLogo className="-rotate-12" size={36} \/>/' \
    src/pages/Download.tsx
echo "    Download.tsx: 32 → 36"

echo ""
echo "[3/3] 复制二进制 Logo 文件 ..."

mkdir -p public attached_assets

cp -f "$LOGO_SRC" public/logo.png
echo "    logo.png → public/logo.png"

cp -f "$LOGO_SRC" logo1.png
echo "    logo.png → logo1.png"

cp -f "$LOGO_SRC" logo2.png
echo "    logo.png → logo2.png"

cp -f "$LOGO_SRC" public/icon-180.png
echo "    logo.png → public/icon-180.png"

cp -f "$LOGO_SRC" public/icon-32.png
echo "    logo.png → public/icon-32.png"

if [ -f "$LOGO_SRC" ]; then
    cp -f "$LOGO_SRC" attached_assets/logio_1776997791947.png
    echo "    logo.png → attached_assets/logio_1776997791947.png"
fi

echo ""
echo "========================================="
echo " Logo 更新完成！"
echo ""
echo " 变更文件:"
echo "   - src/components/PawLogo.tsx  (重写)"
echo "   - src/pages/Login.tsx         (size 36)"
echo "   - src/pages/Register.tsx      (size 40)"
echo "   - src/pages/Download.tsx      (size 36)"
echo "   - public/logo.png"
echo "   - logo1.png, logo2.png"
echo "   - public/icon-180.png, public/icon-32.png"
echo "========================================="
