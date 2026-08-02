#!/usr/bin/env bash
# 安装 nginx 日志轮转配置（保留 >= 180 天）
# 安全合规整改：满足"网络日志留存时间不得少于 6 个月"
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONF_SRC="$SCRIPT_DIR/../nginx/logrotate.conf"
DEST="/etc/logrotate.d/oj-platform"

if [[ ! -f "$CONF_SRC" ]]; then
  echo "错误：未找到 $CONF_SRC" >&2
  exit 1
fi

if ! command -v logrotate >/dev/null 2>&1; then
  echo "错误：未检测到 logrotate，请先安装（yum install -y logrotate 或 apt-get install -y logrotate）" >&2
  exit 1
fi

if [[ "$(id -u)" -ne 0 ]]; then
  echo "请以 root 运行：sudo bash scripts/setup-logrotate.sh" >&2
  exit 1
fi

cp "$CONF_SRC" "$DEST"
echo "已安装日志轮转配置：$DEST"
echo ""

# 校验配置（-d 为 debug 模式，不实际执行）
if logrotate -d "$DEST" >/dev/null 2>&1; then
  echo "配置校验通过。日志将按日轮转，保留 180 天并压缩。"
else
  echo "警告：配置校验未通过，请检查 $DEST" >&2
  exit 1
fi

echo ""
echo "如需立即轮转（可选）：logrotate -f $DEST"
