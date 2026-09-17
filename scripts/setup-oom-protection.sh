#!/usr/bin/env bash
# ============================================================
# OJ 平台 - 关键服务 OOM 免疫（幂等）
#
# 作用：让内核在内存耗尽时「优先杀构建/应用进程」，而不是 sshd / nginx /
#       宝塔面板。否则一次构建内存峰值就会把 SSH 和面板一起杀掉，
#       表现为整机「假死」——只能去云控制台强制重启。
#
# 说明：
#   - 对 sshd / nginx / 宝塔面板 设置 OOMScoreAdjust=-500（越低越不容易被杀）
#   - 同时用 systemd drop-in 持久化（重启后仍生效）与「实时写入」立即生效
#   - 不动 docker/containerd：构建进程跑在 docker 里，保护它等于保护构建
#   - 不重启任何服务，避免中断当前会话与线上服务
#
# 用法：
#   sudo bash scripts/setup-oom-protection.sh             # 应用保护
#   sudo bash scripts/setup-oom-protection.sh --dry-run   # 只打印将执行的操作
#   sudo bash scripts/setup-oom-protection.sh --unprotect # 移除保护
#   sudo bash scripts/setup-oom-protection.sh --status    # 查看当前得分
# ============================================================
set -euo pipefail

RED='\033[0;31m' GREEN='\033[0;32m' CYAN='\033[0;36m' YELLOW='\033[1;33m'
NC='\033[0m' BOLD='\033[1m'

info() { echo -e "${GREEN}[✓]${NC} $1"; }
step() { echo -e "\n${BOLD}${CYAN}:: $1${NC}"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; }

OOM_ADJ=-500
DROPIN_NAME="10-dsoj-oom.conf"

# 关键服务单元（存在才处理）
UNITS=(sshd ssh nginx bt btpanel bt-panel)
# 实时进程匹配模式（pgrep -f）
LIVE_PATTERNS=('sshd' 'nginx' '/www/server/panel')

MARKER="由 scripts/setup-oom-protection.sh 生成"

MODE="protect"
DRY_RUN=0

usage() {
  cat <<USAGE
用法: sudo bash scripts/setup-oom-protection.sh [选项]

  （无参数）      应用 OOM 保护（可重复执行）
  --dry-run       只打印将要执行的操作，不改动系统
  --unprotect     移除本脚本添加的保护
  --status        查看关键进程当前 oom_score_adj
  -h, --help      显示帮助
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --unprotect) MODE="unprotect"; shift ;;
    --status) MODE="status"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) err "未知参数: $1"; usage; exit 1 ;;
  esac
done

if [[ "$DRY_RUN" -ne 1 && "${EUID:-$(id -u)}" -ne 0 ]]; then
  err "需要 root 权限：sudo bash scripts/setup-oom-protection.sh"
  exit 1
fi

if [[ "$MODE" == "status" ]]; then
  step "关键进程 oom_score_adj"
  printf '  %-8s %-8s %s\n' "PID" "SCORE" "COMMAND"
  for pat in "${LIVE_PATTERNS[@]}"; do
    while read -r pid; do
      [[ -n "$pid" ]] || continue
      score="$(cat "/proc/$pid/oom_score_adj" 2>/dev/null || echo '-')"
      comm="$(ps -p "$pid" -o comm= 2>/dev/null || echo '?')"
      printf '  %-8s %-8s %s\n' "$pid" "$score" "$comm"
    done < <(pgrep -f "$pat" 2>/dev/null || true)
  done
  echo ""
  echo "  参考: -1000 最不易被杀，0 为默认，1000 最易被杀"
  echo "  说明: 本脚本目标值为 ${OOM_ADJ}（仅对 sshd/nginx/宝塔面板）"
  exit 0
fi

write_dropin() {
  local unit="$1" dir file
  dir="/etc/systemd/system/${unit}.service.d"
  file="${dir}/${DROPIN_NAME}"
  local content="# ${MARKER}：内存极限时保护该服务不被 OOM killer 杀掉
[Service]
OOMScoreAdjust=${OOM_ADJ}"

  if [[ -f "$file" ]] && [[ "$(cat "$file" 2>/dev/null)" == "$content" ]]; then
    return 1 # 已是最新，无变更
  fi
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo -e "  ${CYAN}[dry-run]${NC} 写入 ${file} (OOMScoreAdjust=${OOM_ADJ})"
    return 0
  fi
  if ! mkdir -p "$dir" || ! printf '%s\n' "$content" > "$file"; then
    return 2 # 写入失败（只告警，不中断）
  fi
  return 0
}

remove_dropin() {
  local unit="$1" file
  file="/etc/systemd/system/${unit}.service.d/${DROPIN_NAME}"
  if [[ -f "$file" ]]; then
    if [[ "$DRY_RUN" -eq 1 ]]; then
      echo -e "  ${CYAN}[dry-run]${NC} 删除 ${file}"
    else
      rm -f "$file"
    fi
    return 0
  fi
  return 1
}

unit_exists() {
  systemctl cat "$1.service" >/dev/null 2>&1
}

apply_live() {
  local pattern="$1" count=0 pid
  while read -r pid; do
    [[ -n "$pid" ]] || continue
    [[ -w "/proc/$pid/oom_score_adj" ]] || continue
    if [[ "$DRY_RUN" -eq 1 ]]; then
      # 输出到 stderr：stdout 只保留计数，供调用方 $(...) 取用
      echo -e "  ${CYAN}[dry-run]${NC} echo ${OOM_ADJ} > /proc/${pid}/oom_score_adj ($(ps -p "$pid" -o comm= 2>/dev/null || echo '?'))" >&2
      count=$((count + 1))
      continue
    fi
    if echo "$OOM_ADJ" > "/proc/$pid/oom_score_adj" 2>/dev/null; then
      count=$((count + 1))
    fi
  done < <(pgrep -f "$pattern" 2>/dev/null || true)
  echo "$count"
}

if ! command -v systemctl >/dev/null 2>&1; then
  warn "未检测到 systemd，跳过持久化配置（仅做实时保护）"
fi

if [[ "$MODE" == "unprotect" ]]; then
  step "移除 OOM 保护"
  changed=0
  for unit in "${UNITS[@]}"; do
    if remove_dropin "$unit"; then
      info "已移除 ${unit}.service 的保护配置"
      changed=1
    fi
  done
  if [[ "$changed" -eq 0 ]]; then
    info "未发现本脚本添加的保护配置，无需变更"
  elif [[ "$DRY_RUN" -ne 1 ]] && command -v systemctl >/dev/null 2>&1; then
    systemctl daemon-reload
    info "已重载 systemd"
  fi
  echo ""
  warn "实时 oom_score_adj 会在相关服务下次重启后恢复默认"
  exit 0
fi

step "配置 systemd 持久化（重启后仍生效）"
changed=0
found_any=0
if command -v systemctl >/dev/null 2>&1; then
  for unit in "${UNITS[@]}"; do
    if unit_exists "$unit"; then
      found_any=1
      write_dropin "$unit" && rc=0 || rc=$?
      case "$rc" in
        0)
          info "已为 ${unit}.service 设置 OOMScoreAdjust=${OOM_ADJ}"
          changed=1
          ;;
        1) info "${unit}.service 已配置，无需变更" ;;
        *) warn "${unit}.service 配置写入失败（忽略，实时保护仍生效）" ;;
      esac
    fi
  done
  if [[ "$found_any" -eq 0 ]]; then
    warn "未找到 sshd/nginx/宝塔面板 的 systemd 单元，跳过持久化（实时保护仍会生效）"
  elif [[ "$changed" -eq 1 && "$DRY_RUN" -ne 1 ]]; then
    systemctl daemon-reload
    info "已重载 systemd（服务下次重启时读取新配置）"
  fi
fi

step "实时应用（不重启服务，立即生效）"
total=0
for pat in "${LIVE_PATTERNS[@]}"; do
  n="$(apply_live "$pat")"
  total=$((total + ${n:-0}))
done
if [[ "$total" -gt 0 ]]; then
  echo ""
  info "已对 ${total} 个关键进程实时设置 oom_score_adj=${OOM_ADJ}"
  echo -e "  验证: sudo bash scripts/setup-oom-protection.sh --status"
else
  warn "未匹配到正在运行的关键进程（可能进程名不同），请用 --status 核对"
fi

echo ""
info "OOM 保护配置完成：内存耗尽时优先杀构建进程，保留 SSH 与面板可登录"
