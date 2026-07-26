#!/bin/bash
# 选手程序运行 wrapper，设置硬资源限制（参考 Project LemonLime 的 watcher_unix.cpp）
# 用法: runner.sh <memory_limit_mb> <cpu_time_limit_sec> <stack_mb> <executable> [args...]
#
# 环境变量（与 Windows win-runner 对齐，便于 executor 统一读取）：
#   DSOJ_MEM_FILE   峰值 RSS（KB）—— /usr/bin/time %M 或 /proc VmHWM
#   DSOJ_TIME_FILE  选手 CPU 时间（ms）—— (%U+%S)*1000 或 /proc utime+stime
MEM_MB="$1"
CPU_SEC="$2"
STACK_MB="$3"
shift 3
ulimit -v $((MEM_MB * 1024)) 2>/dev/null   # 虚拟内存上限 (KB) —— 硬限制，超限由内核处置
ulimit -t "$CPU_SEC" 2>/dev/null            # CPU 时间上限 (秒)
ulimit -s $((STACK_MB * 1024)) 2>/dev/null  # 栈大小上限 (KB)
ulimit -c 0 2>/dev/null                     # 禁用 core dump
ulimit -u 64 2>/dev/null                    # 进程数上限 (防 fork bomb)
ulimit -f 1048576 2>/dev/null               # 文件大小上限 (1GB)
ulimit -n 1024 2>/dev/null                  # 文件描述符上限

# Sanitizer 运行时选项（仅在二进制启用 sanitizer 时生效，普通二进制忽略）
export ASAN_OPTIONS="${ASAN_OPTIONS:-}":halt_on_error=1:abort_on_error=1:detect_leaks=0:print_stacktrace=0:allocator_may_return_null=1
export UBSAN_OPTIONS="${UBSAN_OPTIONS:-}":halt_on_error=1:abort_on_error=1:print_stacktrace=0

write_peak_and_cpu() {
  local peak_kb="${1:-0}"
  local cpu_ms="${2:-0}"
  if [ -n "${DSOJ_MEM_FILE:-}" ]; then
    printf '%s\n' "${peak_kb}" > "$DSOJ_MEM_FILE"
  fi
  if [ -n "${DSOJ_TIME_FILE:-}" ]; then
    printf '%s\n' "${cpu_ms}" > "$DSOJ_TIME_FILE"
  fi
}

# 无 GNU time 时：在选手真实 PID 上采样 VmHWM / CPU（Node 侧不再轮询 bash 包装进程）
run_with_proc_monitor() {
  "$@" &
  local pid=$!
  local peak=0
  local cpu_ms=0
  # CLK_TCK 在 Linux 上恒为 100
  while kill -0 "$pid" 2>/dev/null; do
    if [ -r "/proc/$pid/status" ]; then
      local hwm
      hwm=$(awk '/^VmHWM:/{print $2}' "/proc/$pid/status" 2>/dev/null || true)
      if [ -n "${hwm:-}" ] && [ "$hwm" -gt "$peak" ] 2>/dev/null; then
        peak=$hwm
      fi
    fi
    if [ -r "/proc/$pid/stat" ]; then
      # field 14/15 = utime/stime；comm 可能含空格，从最后一个 ')' 切开
      local rest ut st
      rest=$(sed 's/.*) //' "/proc/$pid/stat" 2>/dev/null || true)
      ut=$(echo "$rest" | awk '{print $12}')
      st=$(echo "$rest" | awk '{print $13}')
      if [ -n "${ut:-}" ] && [ -n "${st:-}" ]; then
        cpu_ms=$(awk -v u="$ut" -v s="$st" 'BEGIN { printf "%d", (u+s)*10 }')
      fi
    fi
    # 10ms：覆盖短程序峰值，且只在 wrapper 内针对选手 PID
    sleep 0.01
  done
  wait "$pid"
  local ec=$?
  write_peak_and_cpu "$peak" "$cpu_ms"
  return "$ec"
}

# 优先 GNU time（与洛谷/LemonLime 语义一致）；否则监控选手 PID
if { [ -n "${DSOJ_MEM_FILE:-}" ] || [ -n "${DSOJ_TIME_FILE:-}" ]; } && command -v /usr/bin/time >/dev/null 2>&1; then
  STAT_FILE="${DSOJ_MEM_FILE:-${DSOJ_TIME_FILE}}.stat"
  /usr/bin/time -f '%M %U %S' -o "$STAT_FILE" -- "$@"
  EXIT_CODE=$?
  if [ -f "$STAT_FILE" ]; then
    # shellcheck disable=SC2034
    read -r MEM_KB USER_S SYS_S < "$STAT_FILE" || true
    if [ -n "${DSOJ_MEM_FILE:-}" ] && [ -n "${MEM_KB:-}" ]; then
      printf '%s\n' "$MEM_KB" > "$DSOJ_MEM_FILE"
    fi
    if [ -n "${DSOJ_TIME_FILE:-}" ] && [ -n "${USER_S:-}" ]; then
      TIME_MS=$(awk -v u="${USER_S:-0}" -v s="${SYS_S:-0}" 'BEGIN { t=(u+s)*1000; if (t<0) t=0; printf "%d", t+0.5 }')
      printf '%s\n' "${TIME_MS:-0}" > "$DSOJ_TIME_FILE"
    fi
    rm -f "$STAT_FILE"
  fi
  exit $EXIT_CODE
fi

if [ -n "${DSOJ_MEM_FILE:-}" ] || [ -n "${DSOJ_TIME_FILE:-}" ]; then
  run_with_proc_monitor "$@"
  exit $?
fi

exec "$@"
