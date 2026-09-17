#!/usr/bin/env bash
# ============================================================
# OJ 平台 - 一键配置 Swap（幂等）
#
# 作用：为「构建/升级」期的内存峰值提供兜底，避免内存耗尽触发
#       OOM killer 杀掉 nginx / 宝塔面板 / sshd，导致整机「假死」
#       （症状：网站打不开、面板打不开、SSH 连不上，但云控制台显示运行中）。
#
# 用法：
#   sudo bash scripts/setup-swap.sh              # 按物理内存自动定大小（推荐）
#   sudo bash scripts/setup-swap.sh --size 6     # 指定 6GB
#   sudo bash scripts/setup-swap.sh --dry-run    # 只打印将要执行的操作，不改动系统
#   sudo bash scripts/setup-swap.sh --help
#
# 说明：
#   - 幂等：已有可用 swap 时直接跳过，重复执行无副作用
#   - 自动大小：swap ≈ 物理内存，夹在 [2GB, 8GB]（4G 机器 → 4GB）
#   - 同时设置 vm.swappiness=10：降低换页倾向，够用又不明显拖慢 I/O
# ============================================================
set -euo pipefail

RED='\033[0;31m' GREEN='\033[0;32m' CYAN='\033[0;36m' YELLOW='\033[1;33m'
NC='\033[0m' BOLD='\033[1m'

info() { echo -e "${GREEN}[✓]${NC} $1"; }
step() { echo -e "\n${BOLD}${CYAN}:: $1${NC}"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; }

SWAPFILE="/swapfile"
FSTAB="/etc/fstab"
SYSCTL_CONF="/etc/sysctl.d/99-dsoj-swap.conf"
SWAPPINESS=10

SIZE_MB=""
DRY_RUN=0

usage() {
  cat <<USAGE
用法: sudo bash scripts/setup-swap.sh [选项]

  --size <GB>    指定 swap 大小（GB），默认按物理内存自动计算
  --dry-run      只打印将要执行的操作，不改动系统
  -h, --help     显示帮助

示例:
  sudo bash scripts/setup-swap.sh              # 自动（4G 内存 → 4G swap）
  sudo bash scripts/setup-swap.sh --size 6     # 指定 6G
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --size) SIZE_MB="${2:-}"; [[ "$SIZE_MB" =~ ^[0-9]+$ ]] || { err "--size 需要正整数（单位 GB）"; exit 1; }; SIZE_MB=$((SIZE_MB * 1024)); shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) err "未知参数: $1"; usage; exit 1 ;;
  esac
done

run() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo -e "  ${CYAN}[dry-run]${NC} $*"
  else
    "$@"
  fi
}

mem_total_mb() { awk '/^MemTotal:/{printf "%d", $2/1024}' /proc/meminfo; }

if [[ "$DRY_RUN" -ne 1 && "${EUID:-$(id -u)}" -ne 0 ]]; then
  err "需要 root 权限：sudo bash scripts/setup-swap.sh"
  exit 1
fi
if [[ "$DRY_RUN" -eq 1 && "${EUID:-$(id -u)}" -ne 0 ]]; then
  warn "非 root 运行 --dry-run：仅预览，实际操作需 sudo"
fi

step "检查 Swap 现状"

RAM_MB="$(mem_total_mb)"
echo "  物理内存: $((RAM_MB / 1024)) GB"

# 幂等：已有活动 swap 则跳过（避免重复创建/覆盖线上 swap 造成抖动）
if swapon --show --noheadings 2>/dev/null | grep -q .; then
  info "已存在活动的 swap，无需创建："
  swapon --show || true
  echo ""
  echo "  如需扩容，请先关闭旧 swap 并调整 ${SWAPFILE}（或使用 --size 前先 swapoff）"
  echo "  当前 swappiness: $(cat /proc/sys/vm/swappiness)"
  exit 0
fi
warn "未检测到活动 swap —— 这正是「构建期整机假死」的最常见根因"

# 计算目标大小：swap ≈ RAM，夹在 [2GB, 8GB]
if [[ -z "$SIZE_MB" ]]; then
  SIZE_MB="$RAM_MB"
  (( SIZE_MB < 2048 )) && SIZE_MB=2048
  (( SIZE_MB > 8192 )) && SIZE_MB=8192
fi
SIZE_GB=$((SIZE_MB / 1024))
echo "  计划创建: ${SIZE_GB} GB (${SWAPFILE})"

# 磁盘空间预检：swap 文件 + 1GB 余量
AVAIL_MB="$(df -Pm / 2>/dev/null | awk 'NR==2{print $4}')"
if [[ -n "$AVAIL_MB" ]]; then
  echo "  根分区可用: $((AVAIL_MB / 1024)) GB"
  if (( AVAIL_MB < SIZE_MB + 1024 )); then
    err "磁盘空间不足：创建 ${SIZE_GB}GB swap 需至少 $((SIZE_GB + 1))GB 可用空间"
    echo "  可先清理: sudo bash scripts/docker-cleanup.sh"
    exit 1
  fi
fi

step "创建 Swap 文件"

if [[ -f "$SWAPFILE" ]]; then
  warn "${SWAPFILE} 已存在但未启用，将直接使用"
elif command -v fallocate >/dev/null 2>&1 && run fallocate -l "${SIZE_MB}M" "$SWAPFILE"; then
  info "已用 fallocate 分配 ${SIZE_GB} GB"
else
  warn "fallocate 不可用或失败，改用 dd 写入（较慢，请耐心等待）"
  run dd if=/dev/zero of="$SWAPFILE" bs=1M count="$SIZE_MB" status=none
fi

run chmod 600 "$SWAPFILE"

# mkswap：XFS/btrfs 上 fallocate 可能产生带空洞的稀疏文件导致失败，此时回退 dd 重写
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo -e "  ${CYAN}[dry-run]${NC} mkswap ${SWAPFILE} && swapon ${SWAPFILE}"
else
  if ! mkswap "$SWAPFILE" >/dev/null 2>&1; then
    warn "mkswap 失败（可能是稀疏文件），改用 dd 重写后重试"
    dd if=/dev/zero of="$SWAPFILE" bs=1M count="$SIZE_MB" status=none
    mkswap "$SWAPFILE" >/dev/null
  fi
  swapon "$SWAPFILE"
fi

step "持久化配置"

# fstab：仅当没有对应条目时追加
if grep -qE "^[[:space:]]*${SWAPFILE//\//\\/}[[:space:]]" "$FSTAB" 2>/dev/null; then
  info "fstab 已包含 swap 条目，无需变更"
else
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo -e "  ${CYAN}[dry-run]${NC} echo '${SWAPFILE} none swap sw 0 0' >> ${FSTAB}"
  else
    echo "${SWAPFILE} none swap sw 0 0" >> "$FSTAB"
  fi
  info "已写入 fstab（重启后自动启用）"
fi

# swappiness：写入独立 sysctl 文件，避免覆盖用户自定义
if [[ -f "$SYSCTL_CONF" ]] && grep -qE "^[[:space:]]*vm\.swappiness[[:space:]]*=[[:space:]]*${SWAPPINESS}$" "$SYSCTL_CONF"; then
  info "swappiness 已配置为 ${SWAPPINESS}，无需变更"
else
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo -e "  ${CYAN}[dry-run]${NC} echo 'vm.swappiness=${SWAPPINESS}' > ${SYSCTL_CONF}"
    echo -e "  ${CYAN}[dry-run]${NC} sysctl -w vm.swappiness=${SWAPPINESS}"
  else
    echo "vm.swappiness=${SWAPPINESS}" > "$SYSCTL_CONF"
    sysctl -w "vm.swappiness=${SWAPPINESS}" >/dev/null
  fi
  info "已设置 vm.swappiness=${SWAPPINESS}"
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
  step "dry-run 结束（未改动系统）"
  exit 0
fi

step "完成"
swapon --show || true
free -h || true
echo ""
info "Swap 已启用。构建/升级期的内存峰值将由 swap 兜底，避免整机假死"
echo "  提示: 若仍需更彻底的保护，可执行 sudo bash scripts/setup-oom-protection.sh"
