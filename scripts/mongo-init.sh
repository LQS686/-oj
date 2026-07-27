#!/bin/bash
# MongoDB 容器 entrypoint wrapper
# 1. 准备 keyFile（优先使用宿主机挂载的 /tmp/mongo-keyfile）
# 2. 启动 mongod

KEYFILE_DIR="/etc/mongo"
KEYFILE="$KEYFILE_DIR/keyfile"
HOST_KEYFILE="/tmp/mongo-keyfile"

mkdir -p "$KEYFILE_DIR"

if [ -f "$HOST_KEYFILE" ]; then
  # 从只读挂载复制，保证 mongodb 用户可读且权限为 400
  cp "$HOST_KEYFILE" "$KEYFILE"
  chmod 400 "$KEYFILE"
  chown mongodb:mongodb "$KEYFILE" 2>/dev/null || true
  echo "Using host-mounted MongoDB replica set keyfile"
elif [ ! -f "$KEYFILE" ]; then
  echo "Generating MongoDB replica set keyfile..."
  openssl rand -base64 756 > "$KEYFILE"
  chmod 400 "$KEYFILE"
  chown mongodb:mongodb "$KEYFILE" 2>/dev/null || true
fi

exec docker-entrypoint.sh "$@"
