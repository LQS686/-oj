#!/usr/bin/env bash
# ============================================================
# OJ 平台 - 内存/磁盘自愈看门狗
#
# 作用：在内存或磁盘接近耗尽时提前自救（清构建缓存/悬空镜像/页缓存），
#       避免一步步发展到「整机假死」（网站+面板+SSH 全部无响应，只能重启）。
#
# 设计原则：
#   - 默认只做「安全清理」，不重启线上容器（容器恢复交给 compose restart: always）
#   - 检测到正在构建时不做破坏性清理，避免打断 build
#   - 每次运行都会记录内存 Top 进程，便于事后定位是谁吃爆了内存
#   - 日志自截断，不需要额外配 logrotate
#
# 用法：
#   sudo bash scripts/oj-watchdog.sh                # 检查并自愈一次（cron 调用）
#   sudo bash scripts/oj-watchdog.sh --install      # 安装 cron（每 3 分钟，幂等）
#   sudo bash scripts/oj-watchdog.sh --uninstall    # 卸载 cron
#   sudo bash scripts/oj-watchdog.sh --status       # 查看当前指标与 cron 状态
#   sudo bash scripts/oj-watchdog.sh --dry-run      # 只报告，不执行任何清理
#
# 阈值可用环境变量覆盖：
#   OJ_WATCHDOG_MEM_THRESHOLD=90      内存使用率阈值(%)
#   OJ_WATCHDOG_DISK_THRESHOLD=85     根分区使用率阈值(%)
#   OJ_WATCHDOG_CACHE_HOURS=24        构建缓存保留时长(小时)
# ============================================================
set -euo pipefail

RED='\033[0;31m' GREEN='\033[0;32m' CYAN='\033[0;36m' YELLOW='\033[1;33m'
NC='\033[0m' BOLD='\033[1m'

MEM_THRESHOLD="${OJ_WATCHDOG_MEM_THRESHOLD:-90}"
DISK_THRESHOLD="${OJ_WATCHDOG_DISK_THRESHOLD:-85}"
CACHE_HOURS="${OJ_WATCHDOG_CACHE_HOURS:-24}"

SCRIPT_PATH="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT_NAME="$(basename "$PROJECT_DIR" | tr '[:upper:]' '[:lower:]')"

LOG_FILE="${OJ_WATCHDOG_LOG:-/var/log/oj-watchdog.log}"
LOCK_FILE="/tmp/oj-watchdog.lock"
CRON_TAG="# dsoj-watchdog"
CRON_SCHEDULE="*/3 * * * *"

DRY_RUN=0
MODE="check"

usage() {
  cat <<USAGE
用法: sudo bash scripts/oj-watchdog.sh [选项]

  （无参数）      检查并自愈一次（供 cron 调用）
  --install       安装/更新 cron 任务（每 3 分钟执行一次，幂等）
  --uninstall     移除 cron 任务
  --status        查看内存/磁盘/swap 指标与 cron 安装状态
  --dry-run       只报告，不执行任何清理动作
  -h, --help      显示帮助

阈值（环境变量）:
  OJ_WATCHDOG_MEM_THRESHOLD=90   内存使用率阈值(%)
  OJ_WATCHDOG_DISK_THRESHOLD=85  根分区使用率阈值(%)
  OJ_WATCHDOG_CACHE_HOURS=24     构建缓存保留时长(小时)
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --install) MODE="install"; shift ;;
    --uninstall) MODE="uninstall"; shift ;;
    --status) MODE="status"; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "未知参数: $1" >&2; usage; exit 1 ;;
  esac
done

# ---------- 指标采集 ----------

mem_used_pct() {
  awk '
    /^MemTotal:/{t=$2}
    /^MemAvailable:/{a=$2}
    END{ if (t>0) printf "%d", (t-a)*100/t; else print 0 }
  ' /proc/meminfo
}

swap_used_pct() {
  awk '
    /^SwapTotal:/{t=$2}
    /^SwapFree:/{f=$2}
    END{ if (t>0) printf "%d", (t-f)*100/t; else print 0 }
  ' /proc/meminfo
}

swap_total_mb() { awk '/^SwapTotal:/{printf "%d", $2/1024}' /proc/meminfo; }
mem_total_mb()  { awk '/^MemTotal:/{printf "%d", $2/1024}' /proc/meminfo; }
mem_avail_mb()  { awk '/^MemAvailable:/{printf "%d", $2/1024}' /proc/meminfo; }

disk_used_pct() {
  df -P / 2>/dev/null | awk 'NR==2{ gsub("%","",$5); print $5+0 }'
}

build_running() {
  pgrep -f 'buildkitd|compose build|docker build' >/dev/null 2>&1
}

docker_usable() {
  command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1
}

top_mem_procs() {
  ps -eo rss=,comm= --sort=-rss 2>/dev/null | head -5 | awk '{ printf "    %6.1f MB  %s\n", $1/1024, $2 }'
}

# ---------- 日志 ----------

ts() { date '+%Y-%m-%d %H:%M:%S'; }

log() {
  local line
  line="$(printf '%s' "$*")"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "$line"
    return 0
  fi
  mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true
  if [[ -w "$(dirname "$LOG_FILE")" ]]; then
    printf '%s\n' "$line" >> "$LOG_FILE"
  fi
  echo "$line"
}

rotate_log() {
  [[ "$DRY_RUN" -eq 1 ]] && return 0
  [[ -f "$LOG_FILE" ]] || return 0
  local size
  size="$(wc -c < "$LOG_FILE" 2>/dev/null || echo 0)"
  if [[ "$size" -gt 1048576 ]]; then
    tail -n 500 "$LOG_FILE" > "${LOG_FILE}.tmp" 2>/dev/null && mv "${LOG_FILE}.tmp" "$LOG_FILE" || true
  fi
}

# ---------- cron 管理 ----------

cron_cmd() {
  # 注意：不要在 cron 里再用 flock 包一层。脚本内部已用 flock 锁同一文件
  # （外层持锁会导致内层 -n 立即失败 → 看门狗被静默跳过，永远不执行）。
  printf 'bash %s >/dev/null 2>&1 %s' "$SCRIPT_PATH" "$CRON_TAG"
}

install_cron() {
  if ! command -v crontab >/dev/null 2>&1; then
    echo -e "${YELLOW}[!]${NC} 未找到 crontab，跳过安装（可改用宝塔「计划任务」添加）"
    echo "    需执行的命令: bash ${SCRIPT_PATH}"
    return 0
  fi
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    echo -e "${RED}[✗]${NC} 需要 root 权限安装 cron：sudo bash scripts/oj-watchdog.sh --install"
    exit 1
  fi

  local tmp
  tmp="$(mktemp)"
  crontab -l >"$tmp" 2>/dev/null || true
  # 移除旧条目（幂等：无论路径是否变化都先删再加）
  grep -vF "$CRON_TAG" "$tmp" >"${tmp}.new" 2>/dev/null || true
  printf '%s %s\n' "$CRON_SCHEDULE" "$(cron_cmd)" >>"${tmp}.new"
  crontab "${tmp}.new"
  rm -f "$tmp" "${tmp}.new"

  echo -e "${GREEN}[✓]${NC} 已安装看门狗 cron（每 3 分钟执行一次）"
  echo "    脚本: ${SCRIPT_PATH}"
  echo "    日志: ${LOG_FILE}"
  echo "    卸载: sudo bash scripts/oj-watchdog.sh --uninstall"
}

uninstall_cron() {
  if ! command -v crontab >/dev/null 2>&1; then
    echo -e "${YELLOW}[!]${NC} 未找到 crontab，无需卸载"
    return 0
  fi
  if ! crontab -l 2>/dev/null | grep -qF "$CRON_TAG"; then
    echo -e "${GREEN}[✓]${NC} 未发现看门狗 cron，无需变更"
    return 0
  fi
  local tmp
  tmp="$(mktemp)"
  crontab -l 2>/dev/null | grep -vF "$CRON_TAG" >"$tmp" || true
  crontab "$tmp"
  rm -f "$tmp"
  echo -e "${GREEN}[✓]${NC} 已移除看门狗 cron"
}

cron_installed() {
  command -v crontab >/dev/null 2>&1 && crontab -l 2>/dev/null | grep -qF "$CRON_TAG"
}

# ---------- 各模式 ----------

print_metrics() {
  local mem disk swap stotal mtotal mavail
  mem="$(mem_used_pct)"; disk="$(disk_used_pct)"; swap="$(swap_used_pct)"
  stotal="$(swap_total_mb)"; mtotal="$(mem_total_mb)"; mavail="$(mem_avail_mb)"
  echo "  内存:   ${mem}% 已用（总 ${mtotal} MB / 可用 ${mavail} MB）  阈值 ${MEM_THRESHOLD}%"
  echo "  Swap:   ${swap}% 已用（总 ${stotal} MB）"
  echo "  磁盘:   ${disk}% 已用（根分区）  阈值 ${DISK_THRESHOLD}%"
}

case "$MODE" in
  status)
    echo -e "${BOLD}看门狗状态${NC}"
    echo ""
    print_metrics
    echo ""
    if cron_installed; then
      echo -e "  cron:   ${GREEN}已安装${NC}（每 3 分钟）"
    else
      echo -e "  cron:   ${YELLOW}未安装${NC} —— 执行 sudo bash scripts/oj-watchdog.sh --install"
    fi
    if [[ -f "$LOG_FILE" ]]; then
      echo ""
      echo -e "  最近日志（${LOG_FILE}）:"
      tail -n 10 "$LOG_FILE" | sed 's/^/    /'
    else
      echo "  日志:   暂无（${LOG_FILE}）"
    fi
    exit 0
    ;;
  install)
    install_cron
    exit 0
    ;;
  uninstall)
    uninstall_cron
    exit 0
    ;;
esac

# ---------- check（默认）----------

if command -v flock >/dev/null 2>&1 && [[ "$DRY_RUN" -ne 1 ]]; then
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    exit 0 # 上一次仍在执行，跳过本轮
  fi
fi

rotate_log

MEM_PCT="$(mem_used_pct)"
DISK_PCT="$(disk_used_pct)"
SWAP_PCT="$(swap_used_pct)"
STOTAL="$(swap_total_mb)"

ACTIONS=()

if build_running; then
  log "[$(ts)] 检测到构建正在进行，跳过清理动作（内存 ${MEM_PCT}% / 磁盘 ${DISK_PCT}%）"
else
  if [[ "$MEM_PCT" -ge "$MEM_THRESHOLD" ]]; then
    log "[$(ts)] 内存告警 ${MEM_PCT}% ≥ ${MEM_THRESHOLD}%，开始自救"
    log "$(top_mem_procs)"
    if [[ "$DRY_RUN" -eq 1 ]]; then
      log "  [dry-run] sync && echo 3 > /proc/sys/vm/drop_caches"
      log "  [dry-run] docker builder prune -af --filter until=${CACHE_HOURS}h"
    else
      sync
      echo 3 > /proc/sys/vm/drop_caches 2>/dev/null || true
      if docker_usable; then
        docker builder prune -af --filter "until=${CACHE_HOURS}h" >/dev/null 2>&1 || true
      fi
      log "[$(ts)] 已释放页缓存并清理 ${CACHE_HOURS}h 前的构建缓存（内存 ${MEM_PCT}%）"
    fi
    ACTIONS+=("内存 ${MEM_PCT}%：释放页缓存 + 清理旧构建缓存")
  fi

  if [[ "$DISK_PCT" -ge "$DISK_THRESHOLD" ]]; then
    log "[$(ts)] 磁盘告警 ${DISK_PCT}% ≥ ${DISK_THRESHOLD}%，开始清理"
    if [[ "$DRY_RUN" -eq 1 ]]; then
      log "  [dry-run] docker image prune -f"
      log "  [dry-run] docker builder prune -af --filter until=${CACHE_HOURS}h"
      log "  [dry-run] docker container prune（仅本项目停止的容器）"
    elif docker_usable; then
      docker image prune -f >/dev/null 2>&1 || true
      docker builder prune -af --filter "until=${CACHE_HOURS}h" >/dev/null 2>&1 || true
      docker container prune -f --filter "label=com.docker.compose.project=${PROJECT_NAME}" >/dev/null 2>&1 || true
      log "[$(ts)] 已清理悬空镜像/旧构建缓存/停止容器"
    fi
    ACTIONS+=("磁盘 ${DISK_PCT}%：清理悬空镜像与旧构建缓存")
  fi

  # 极限状态：记录关键信息，便于事后定位（此时已无法安全自救）
  if [[ "$MEM_PCT" -ge 95 ]]; then
    log "[$(ts)] 严重：内存 ${MEM_PCT}%（可用 $(mem_avail_mb) MB），swap ${SWAP_PCT}%（总 ${STOTAL} MB）"
    log "$(top_mem_procs)"
    if [[ "$STOTAL" -eq 0 ]]; then
      log "[$(ts)] 建议：未配置 swap，执行 sudo bash scripts/setup-swap.sh 可显著降低整机假死风险"
    fi
  fi
fi

if [[ "${#ACTIONS[@]}" -eq 0 && "$MEM_PCT" -lt "$MEM_THRESHOLD" && "$DISK_PCT" -lt "$DISK_THRESHOLD" ]]; then
  exit 0 # 一切正常，保持静默（不写日志，避免刷屏）
fi

if [[ "${#ACTIONS[@]}" -gt 0 ]]; then
  log "[$(ts)] 自愈动作: ${ACTIONS[*]}"
fi

if [[ "$DRY_RUN" -eq 1 && "${#ACTIONS[@]}" -eq 0 ]]; then
  log "[$(ts)] dry-run 完成：内存 ${MEM_PCT}% / 磁盘 ${DISK_PCT}% / swap ${SWAP_PCT}%，未触发阈值"
fi

exit 0
