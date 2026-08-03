#!/usr/bin/env bash
# 每日 Mongo 备份（mongodump + docker cp 到宿主机），保留 7 天
set -uo pipefail
APP_DIR="/www/wwwroot/dashan-oj"
BACKUP_DIR="/www/backup/oj"

mkdir -p "$BACKUP_DIR"
log() { echo "$(date '+%F %T') $*" >> "$BACKUP_DIR/backup.log"; }

# 项目目录不存在 / 无 compose 配置时直接失败（避免误备份到别的目录）
if [[ ! -f "$APP_DIR/docker-compose.yml" ]]; then
  log "ERROR: $APP_DIR/docker-compose.yml 不存在，请检查 APP_DIR"
  exit 1
fi
cd "$APP_DIR" || { log "ERROR: 无法进入 $APP_DIR"; exit 1; }

# 兼容 compose 插件 / 独立 docker-compose（与 bt-deploy.sh 一致）
DC=""
if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose"
else
  log "ERROR: 未找到 docker compose / docker-compose"
  exit 1
fi

# 动态获取 mongo 容器名：项目目录名 ≠ dashan-oj 时容器名不同（dashan-oj-mongo-1），
# 硬编码会导致备份失败；统一用 compose 解析实际容器。
MONGO_CID="$($DC ps -q mongo 2>/dev/null | head -1)"
if [[ -z "$MONGO_CID" ]]; then
  log "ERROR: mongo 容器未在运行（$DC ps -q mongo 无输出）"
  exit 1
fi
MONGO_NAME="$(docker inspect -f '{{.Name}}' "$MONGO_CID" 2>/dev/null | tr -d '/')"
[[ -n "$MONGO_NAME" ]] || MONGO_NAME="$MONGO_CID"

# mongodump 在 mongo 容器内输出到 /dump，再拷回宿主机，避免容器内无持久目录
# DATABASE_URL 中的 mongo:27017 在容器内可通过 compose 网络解析到自身
DB_URL="$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2-)"
if [[ -z "$DB_URL" ]]; then
  log "ERROR: .env 中 DATABASE_URL 为空"
  exit 1
fi

STAMP="$(date +%Y%m%d%H%M)"
if ! docker exec "$MONGO_NAME" mongodump --uri="$DB_URL" --out="/dump/$STAMP" --quiet 2>>"$BACKUP_DIR/backup.log"; then
  log "[$STAMP] mongodump FAILED (container=$MONGO_NAME)"
  exit 1
fi
docker cp "$MONGO_NAME:/dump/$STAMP" "$BACKUP_DIR/$STAMP" >>"$BACKUP_DIR/backup.log" 2>&1
docker exec "$MONGO_NAME" rm -rf "/dump/$STAMP"

# 保留 7 天
find "$BACKUP_DIR" -maxdepth 1 -type d -name "20*" -mtime +7 -exec rm -rf {} \; 2>/dev/null
log "[$STAMP] backup OK size=$(du -sh "$BACKUP_DIR/$STAMP" 2>/dev/null | cut -f1)"
