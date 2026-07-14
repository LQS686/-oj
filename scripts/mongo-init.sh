#!/bin/bash
# MongoDB 容器 entrypoint wrapper
# 1. 生成 keyFile 用于副本集认证通信
# 2. 启动 mongod

KEYFILE_DIR="/etc/mongo"
KEYFILE="$KEYFILE_DIR/keyfile"

mkdir -p "$KEYFILE_DIR"

if [ ! -f "$KEYFILE" ]; then
  echo "Generating MongoDB replica set keyfile..."
  openssl rand -base64 756 > "$KEYFILE"
  chmod 400 "$KEYFILE"
  chown mongodb:mongodb "$KEYFILE"
fi

exec docker-entrypoint.sh "$@"
