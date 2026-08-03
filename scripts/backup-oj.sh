#!/usr/bin/env bash
# 每日 Mongo 备份（mongodump + docker cp 到宿主机），保留 7 天
set -uo pipefail
APP_DIR="/www/wwwroot/dashan-oj"
BACKUP_DIR="/www/backup/oj"
DB_URL="$(grep -E '^DATABASE_URL=' "$APP_DIR/.env" | head -1 | cut -d= -f2-)"

STAMP="$(date +%Y%m%d%H%M)"
mkdir -p "$BACKUP_DIR"
# mongodump 在 mongo 容器内输出到 /dump，再拷回宿主机，避免容器内无持久目录
docker exec dashan-oj-mongo-1 mongodump --uri="$DB_URL" --out="/dump/$STAMP" --quiet 2>>"$BACKUP_DIR/backup.log" || { echo "[$STAMP] mongodump FAILED" >> "$BACKUP_DIR/backup.log"; exit 1; }
docker cp "dashan-oj-mongo-1:/dump/$STAMP" "$BACKUP_DIR/$STAMP" >>"$BACKUP_DIR/backup.log" 2>&1
docker exec dashan-oj-mongo-1 rm -rf "/dump/$STAMP"
# 保留 7 天
find "$BACKUP_DIR" -maxdepth 1 -type d -name "20*" -mtime +7 -exec rm -rf {} \; 2>/dev/null
echo "[$STAMP] backup OK size=$(du -sh "$BACKUP_DIR/$STAMP" 2>/dev/null | cut -f1)" >> "$BACKUP_DIR/backup.log"
