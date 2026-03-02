#!/usr/bin/env bash
# ============================================
# 共鸣 Project Resonance — APK 构建脚本
# 用法: bash scripts/build-apk.sh
# ============================================
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}🔧 共鸣 APK 构建脚本${NC}"
echo "──────────────────────────────"

# 1. 检查 .env 文件
if [ ! -f .env ]; then
  echo -e "${RED}❌ 错误: 项目根目录缺少 .env 文件${NC}"
  echo ""
  echo "请创建 .env 并填入以下内容:"
  echo "  VITE_SUPABASE_URL=https://lwusdbovydwbltxmpctr.supabase.co"
  echo "  VITE_SUPABASE_PUBLISHABLE_KEY=<your_anon_key>"
  echo "  VITE_SUPABASE_PROJECT_ID=lwusdbovydwbltxmpctr"
  exit 1
fi

# 检查必需变量
missing=()
for var in VITE_SUPABASE_URL VITE_SUPABASE_PUBLISHABLE_KEY; do
  if ! grep -q "^${var}=" .env; then
    missing+=("$var")
  fi
done

if [ ${#missing[@]} -gt 0 ]; then
  echo -e "${RED}❌ .env 缺少必需变量:${NC}"
  for v in "${missing[@]}"; do echo "   - $v"; done
  exit 1
fi

echo -e "${GREEN}✅ .env 检查通过${NC}"

# 2. 检查 capacitor.config.ts 中 server 配置是否被注释
if grep -E '^\s*server\s*:' capacitor.config.ts 2>/dev/null | grep -v '//' > /dev/null 2>&1; then
  echo -e "${YELLOW}⚠️  警告: capacitor.config.ts 中 server 配置未注释，APK 将连接远程服务器而非本地资源${NC}"
  read -p "是否继续? (y/N) " -n 1 -r
  echo
  [[ ! $REPLY =~ ^[Yy]$ ]] && exit 1
fi

# 3. 安装依赖
echo ""
echo -e "${GREEN}📦 安装依赖...${NC}"
npm install

# 4. 构建
echo ""
echo -e "${GREEN}🏗️  执行生产构建...${NC}"
npm run build

if [ ! -d dist ]; then
  echo -e "${RED}❌ 构建失败: dist 目录不存在${NC}"
  exit 1
fi

echo -e "${GREEN}✅ 构建完成 (dist/)${NC}"

# 5. Capacitor 同步
echo ""
echo -e "${GREEN}📱 同步到原生平台...${NC}"
npx cap sync

echo ""
echo "──────────────────────────────"
echo -e "${GREEN}🎉 构建完成！${NC}"
echo ""
echo "下一步:"
echo "  Android: npx cap run android"
echo "  iOS:     npx cap run ios"
echo ""
echo "或打开 IDE:"
echo "  npx cap open android"
echo "  npx cap open ios"
