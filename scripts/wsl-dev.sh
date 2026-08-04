#!/usr/bin/env bash
# WSL 内：同步 Windows 源码到 ~/dsoj，确保 Mongo/Redis，启动 npm run dev
# 一般由 scripts/wsl-dev.ps1 / wsl-dev.cmd 调用，也可在 Ubuntu 里直接跑：
#   bash scripts/wsl-dev.sh
#   bash scripts/wsl-dev.sh --full        # 同步后 npm install
#   bash scripts/wsl-dev.sh --sync-only   # 只同步不启动
set -euo pipefail

FULL=0
SYNC_ONLY=0
SRC=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --full) FULL=1; shift ;;
    --sync-only) SYNC_ONLY=1; shift ;;
    --src) SRC="${2:-}"; shift 2 ;;
    -h|--help)
      echo "用法: bash wsl-dev.sh [--full] [--sync-only] [--src /mnt/.../dsoj]"
      exit 0
      ;;
    *)
      echo "未知参数: $1"
      exit 1
      ;;
  esac
done

DST="${HOME}/dsoj"

if [[ -z "$SRC" ]]; then
  # 优先：本脚本所在仓库（经 /mnt 挂载或已在 ~/dsoj）
  HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  if [[ -f "$HERE/package.json" ]]; then
    SRC="$HERE"
  else
    SRC="/mnt/e/桌面/dsoj"
  fi
fi

if [[ ! -f "$SRC/package.json" ]]; then
  echo "找不到项目: $SRC/package.json"
  echo "请传 --src /mnt/<盘符>/.../dsoj"
  exit 1
fi

# 若源就是运行目录，跳过 rsync（避免 --delete 把自己搞乱）
SAME_DIR=0
if [[ "$(readlink -f "$SRC")" == "$(readlink -f "$DST" 2>/dev/null || echo "")" ]]; then
  SAME_DIR=1
fi

echo "==> 源: $SRC"
echo "==> 目标: $DST"

if [[ "$SAME_DIR" -eq 1 ]]; then
  echo "==> 源与 ~/dsoj 相同，跳过 rsync"
  cd "$DST"
else
  if ! command -v rsync >/dev/null 2>&1; then
    echo "未安装 rsync，正在尝试: sudo apt-get install -y rsync"
    sudo apt-get update -qq && sudo apt-get install -y rsync
  fi
  echo "==> rsync 同步（排除 node_modules / .next / temp / .git）..."
  mkdir -p "$DST"
  rsync -a --delete \
    --exclude node_modules \
    --exclude .next \
    --exclude temp \
    --exclude '.git' \
    "$SRC/" "$DST/"
  cd "$DST"
fi

patch_env() {
  if [[ ! -f .env ]]; then
    if [[ -f .env.example ]]; then
      cp .env.example .env
    else
      touch .env
    fi
  fi
  if grep -q '^DATABASE_URL=' .env; then
    sed -i 's|^DATABASE_URL=.*|DATABASE_URL=mongodb://127.0.0.1:27017/oj_platform?replicaSet=rs0\&directConnection=true|' .env
  else
    echo 'DATABASE_URL=mongodb://127.0.0.1:27017/oj_platform?replicaSet=rs0&directConnection=true' >> .env
  fi
  # 开发环境保存 SMTP 等设置需要 ENCRYPTION_KEY；空值会导致 PUT /api/admin/settings 500
  if ! grep -q '^ENCRYPTION_KEY=.' .env; then
    local key
    key="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")"
    if grep -q '^ENCRYPTION_KEY=' .env; then
      sed -i "s|^ENCRYPTION_KEY=.*|ENCRYPTION_KEY=${key}|" .env
    else
      printf '\nENCRYPTION_KEY=%s\n' "$key" >> .env
    fi
    echo "==> 已自动生成 ENCRYPTION_KEY（开发用）"
  fi
}

echo "==> 写入 WSL Mongo DATABASE_URL..."
patch_env

if [[ "$FULL" -eq 1 ]] || [[ ! -d node_modules ]]; then
  if [[ "$FULL" -eq 1 ]]; then
    echo "==> npm ci (--full，严格按 lock 文件安装)..."
  else
    echo "==> 无 node_modules，执行 npm ci..."
  fi
  # 必须用 npm ci 而非 npm install：
  #   npm install 会按 package.json 的 ^/~ 范围重新解析，可能拉取与
  #   package-lock.json 不同的版本（如 katex ^0.16.47 解析为 0.18.1），
  #   导致 WSL 与 Windows 环境依赖版本不一致（CSS 类名不匹配等难查 bug）。
  #   npm ci 严格按 package-lock.json 安装，保证两环境版本完全一致。
  npm ci
else
  # 日常同步：schema 可能新增字段（如 spjCode），须刷新 Client，否则运行时 Unknown argument
  echo "==> prisma generate（同步 schema → Client）..."
  npx prisma generate >/dev/null
fi

ensure_mongo() {
  if pgrep -x mongod >/dev/null 2>&1; then
    echo "==> MongoDB: 已在运行"
    return 0
  fi
  echo "==> MongoDB: 尝试启动..."
  if command -v service >/dev/null 2>&1; then
    sudo service mongod start 2>/dev/null || true
  fi
  if ! pgrep -x mongod >/dev/null 2>&1; then
    if [[ -f /etc/mongod.conf ]]; then
      mongod --config /etc/mongod.conf --fork 2>/dev/null || \
        sudo mongod --config /etc/mongod.conf --fork 2>/dev/null || true
    fi
  fi
  if pgrep -x mongod >/dev/null 2>&1; then
    echo "==> MongoDB: 已启动"
  else
    echo "!! MongoDB 未运行。请先执行: bash scripts/setup-wsl-mongo.sh"
    return 1
  fi
}

ensure_redis() {
  if pgrep -x redis-server >/dev/null 2>&1; then
    echo "==> Redis: 已在运行"
    return 0
  fi
  echo "==> Redis: 尝试启动..."
  if command -v service >/dev/null 2>&1; then
    sudo service redis-server start 2>/dev/null || true
  fi
  if ! pgrep -x redis-server >/dev/null 2>&1; then
    redis-server --daemonize yes 2>/dev/null || true
  fi
  if pgrep -x redis-server >/dev/null 2>&1; then
    echo "==> Redis: 已启动"
  else
    echo "!! Redis 未运行（可选）。安装: sudo apt-get install -y redis-server"
    return 1
  fi
}

ensure_mongo || true
ensure_redis || true

stop_old_dev() {
  echo "==> 停止旧的 ~/dsoj 开发进程（若有）..."
  local pid cwd
  for pid in $(pgrep -f 'tsx.*server\.ts|next dev' 2>/dev/null || true); do
    cwd="$(readlink -f "/proc/$pid/cwd" 2>/dev/null || true)"
    if [[ "$cwd" == "$DST" ]]; then
      echo "    kill $pid ($cwd)"
      kill "$pid" 2>/dev/null || true
    fi
  done
  # 等端口释放
  for _ in 1 2 3 4 5; do
    if ss -tln 2>/dev/null | grep -qE ':3000\s'; then
      sleep 0.4
    else
      break
    fi
  done
}

if [[ "$SYNC_ONLY" -eq 1 ]]; then
  echo
  echo "============================================"
  echo " 同步完成（--sync-only，未启动）"
  echo " 目录: $DST"
  echo "============================================"
  exit 0
fi

stop_old_dev

if ! command -v node >/dev/null 2>&1; then
  echo "未找到 node。请在 WSL 安装 Node.js 20+。"
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  echo "!! Node $(node -v) 过旧，需要 >= 20"
  exit 1
fi
if [[ "$NODE_MAJOR" -ge 24 ]]; then
  echo "==> 提示: 当前 Node $(node -v)。自定义 server 已内置 AsyncLocalStorage polyfill；若仍启动失败，建议改用 Node 22 LTS。"
fi

echo
echo "============================================"
echo " 启动: cd $DST && npm run dev"
echo " 浏览器: http://localhost:3000"
echo " Ctrl+C 停止"
echo "============================================"
echo

exec npm run dev
