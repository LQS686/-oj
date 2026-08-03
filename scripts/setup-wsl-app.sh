#!/usr/bin/env bash
# 把项目同步到 WSL 家目录并安装依赖（避免 /mnt/e 上 node_modules 又慢又容易坏）
# 用法（在 Ubuntu 终端）：
#   bash /mnt/e/桌面/dsoj/scripts/setup-wsl-app.sh
set -euo pipefail

SRC="${1:-/mnt/e/桌面/dsoj}"
DST="${HOME}/dsoj"

if [[ ! -f "$SRC/package.json" ]]; then
  echo "找不到项目: $SRC/package.json"
  echo "用法: bash setup-wsl-app.sh /path/to/dsoj"
  exit 1
fi

echo "==> 同步项目到 $DST （排除 node_modules / .next）..."
mkdir -p "$DST"
rsync -a --delete \
  --exclude node_modules \
  --exclude .next \
  --exclude temp \
  --exclude '.git' \
  "$SRC/" "$DST/"

cd "$DST"

if [[ -f .env ]]; then
  echo "==> 已有 .env，备份为 .env.windows.bak 后写入 WSL 连接串"
  cp -n .env .env.windows.bak 2>/dev/null || cp .env .env.windows.bak
fi

# 基于现有 .env 或 example 生成/修补 DATABASE_URL
if [[ ! -f .env ]]; then
  if [[ -f .env.example ]]; then
    cp .env.example .env
  else
    touch .env
  fi
fi

# 写入 WSL Mongo
if grep -q '^DATABASE_URL=' .env; then
  sed -i 's|^DATABASE_URL=.*|DATABASE_URL=mongodb://127.0.0.1:27017/oj_platform?replicaSet=rs0\&directConnection=true|' .env
else
  echo 'DATABASE_URL=mongodb://127.0.0.1:27017/oj_platform?replicaSet=rs0&directConnection=true' >> .env
fi

echo "==> npm install..."
npm install

echo
echo "============================================"
echo " 应用目录: $DST"
echo " 启动前请确认 Mongo 已装好: bash scripts/setup-wsl-mongo.sh"
echo " 然后:"
echo "   cd $DST"
echo "   # 如库是空的: npx prisma db push"
echo "   npm run dev"
echo " 浏览器打开 http://localhost:3000"
echo "============================================"
