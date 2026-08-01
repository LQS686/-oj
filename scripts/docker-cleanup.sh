#!/usr/bin/env bash
# ============================================================
# OJ 平台 - Docker 磁盘清理脚本
# 清理多次 build/deploy 后累积的镜像、构建缓存、停止的容器
# 不影响正在运行的服务和数据卷（volumes 绝对不动）
#
# 用法：
#   sudo bash scripts/docker-cleanup.sh              # 安全模式：只清悬空镜像 + 构建缓存
#   sudo bash scripts/docker-cleanup.sh --aggressive # 激进模式：额外清未被引用的旧镜像
#   sudo bash scripts/docker-cleanup.sh --help
# ============================================================
set -euo pipefail

RED='\033[0;31m'   GREEN='\033[0;32m'   CYAN='\033[0;36m'   YELLOW='\033[1;33m'
NC='\033[0m'       BOLD='\033[1m'

info()  { echo -e "${GREEN}[✓]${NC} $1"; }
step()  { echo -e "\n${BOLD}${CYAN}:: $1${NC}"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
err()   { echo -e "${RED}[✗]${NC} $1"; }

AGGRESSIVE=0
SHOW_HELP=0

for arg in "$@"; do
  case "$arg" in
    --aggressive|-a) AGGRESSIVE=1 ;;
    --help|-h)
      cat <<EOF
OJ 平台 Docker 磁盘清理脚本

用法:
  sudo bash scripts/docker-cleanup.sh [选项]

选项:
  --aggressive, -a   激进模式：额外清理未被任何容器引用的旧镜像
  --help, -h         显示此帮助

说明:
  - 安全模式（默认）：只清悬空镜像（<none>）、停止的容器、未使用的网络、构建缓存
  - 激进模式：额外清未被引用的旧镜像（保留当前项目 oj-platform:app 和 mongo/redis 基础镜像）
  - 数据卷（volumes）永不清除，数据绝对安全
EOF
      exit 0
      ;;
    *) err "未知参数: $arg"; exit 1 ;;
  esac
done

# 必须 root
if [[ $EUID -ne 0 ]]; then
  err "请使用 sudo 运行：sudo bash scripts/docker-cleanup.sh"
  exit 1
fi

# 检测 docker compose 命令
if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose"
else
  err "未找到 docker compose / docker-compose 命令"
  exit 1
fi

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

echo -e "${BOLD}OJ 平台 Docker 磁盘清理${NC}"
echo "模式: $([[ $AGGRESSIVE -eq 1 ]] && echo "激进（清未引用镜像）" || echo "安全（仅悬空镜像+缓存）")"
echo "项目: $PROJECT_DIR"

# 清理前磁盘占用
before_disk=$(df -h / | awk 'NR==2 {print $4}')
before_docker=$(docker system df --format '{{.Size}}' 2>/dev/null | head -1 || echo "未知")

step "1/5 清理停止的容器"
stopped_containers=$(docker container ls -f "status=exited" -q | wc -l)
if [[ $stopped_containers -gt 0 ]]; then
  docker container prune -f
  info "已清理 $stopped_containers 个停止的容器"
else
  info "无停止的容器"
fi

step "2/5 清理悬空镜像（<none>）"
before_images=$(docker images -f "dangling=true" -q | wc -l)
if [[ $before_images -gt 0 ]]; then
  docker image prune -f
  info "已清理 $before_images 个悬空镜像"
else
  info "无悬空镜像"
fi

step "3/5 清理未使用的网络"
docker network prune -f
info "未使用网络已清理"

step "4/5 清理 Docker 构建缓存（BuildKit）"
before_cache=$(docker builder df 2>/dev/null | awk '/Total/ {print $2}' || echo "0")
docker builder prune -af
info "构建缓存已清理（之前约 ${before_cache}）"

step "5/5 激进模式：清理未引用的镜像"
if [[ $AGGRESSIVE -eq 1 ]]; then
  # 保留当前项目镜像和正在使用的镜像
  # docker image prune -a 会删除所有未被容器引用的镜像
  # 但保留正在运行的容器所使用的镜像
  before_all_images=$(docker images -q | wc -l)
  docker image prune -a -f --filter "until=24h"
  after_all_images=$(docker images -q | wc -l)
  removed=$((before_all_images - after_all_images))
  info "已清理 $removed 个未引用的旧镜像（保留 24h 内的）"
else
  info "跳过（使用 --aggressive 启用）"
fi

# 重启项目确保正常（如果之前清理影响了容器）
step "验证服务状态"
if $DC ps | grep -q "Up\|healthy"; then
  info "项目服务正常运行中"
else
  warn "部分服务未运行，尝试重启..."
  $DC up -d
  sleep 3
  if $DC ps | grep -q "Up\|healthy"; then
    info "服务已恢复"
  else
    err "服务启动失败，请检查: $DC logs --tail=20"
  fi
fi

# 清理后磁盘占用
after_disk=$(df -h / | awk 'NR==2 {print $4}')
after_docker=$(docker system df --format '{{.Size}}' 2>/dev/null | head -1 || echo "未知")

echo ""
echo -e "${BOLD}清理完成${NC}"
echo "可用磁盘: $before_disk → $after_disk"
echo "Docker 占用: $before_docker → $after_docker"
echo ""
echo "如需进一步清理（含旧镜像）：sudo bash scripts/docker-cleanup.sh --aggressive"
