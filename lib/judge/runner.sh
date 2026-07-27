#!/bin/bash
# 选手程序运行 wrapper，设置硬资源限制（参考 Project LemonLime 的 watcher_unix.cpp）
# 用法: runner.sh <memory_limit_mb> <cpu_time_limit_sec> <stack_mb> <executable> [args...]
#
# 环境变量（executor 统一读取）：
#   DSOJ_MEM_FILE   峰值 RSS（KB）—— /usr/bin/time %M 或 /proc VmHWM
#   DSOJ_TIME_FILE  选手 CPU 时间（ms）—— (%U+%S)*1000 或 /proc utime+stime
#   DSOJ_STDIN_FILE / DSOJ_STDOUT_FILE / DSOJ_STDERR_FILE
#       原生文件重定向（绕过 Node 管道，大 I/O 更接近洛谷）
#   DSOJ_OUTPUT_LIMIT_BYTES  stdout 文件大小上限；超限 kill 并以 153 退出（OLE）
#   DSOJ_CPU_LIMIT_MS        选手 CPU 毫秒上限；轮询 /proc 超限 kill 并以 152 退出（TLE）
#                            （ulimit -t 仅秒级；大输出题墙钟远大于 CPU 时靠此项尽快杀掉暴力解）
#   DSOJ_FORCE_ULIMIT_V=1    启用 ulimit -v（ASan 开启时不可用）
MEM_MB="$1"
CPU_SEC="$2"
STACK_MB="$3"
shift 3
EXIT_TLE=152
EXIT_OLE=153

# 虚拟内存 ulimit -v 与 AddressSanitizer 不兼容。
# 默认不设 -v；executor 在未启用 ASan 时传 DSOJ_FORCE_ULIMIT_V=1。
if [[ "${DSOJ_FORCE_ULIMIT_V:-}" == "1" ]]; then
  ulimit -v $((MEM_MB * 1024)) 2>/dev/null
fi
ulimit -t "$CPU_SEC" 2>/dev/null            # CPU 时间上限 (秒)
ulimit -s $((STACK_MB * 1024)) 2>/dev/null  # 栈大小上限 (KB)
ulimit -c 0 2>/dev/null                     # 禁用 core dump
# 进程数：Linux 的 RLIMIT_NPROC 按「同一真实用户」全局计数（含 Node 主进程线程）。
# 若设成 64，在 npm run dev 已占大量线程时 g++ 无法 vfork →
#   "cannot execute cc1plus: vfork: Resource temporarily unavailable"
# 4096 仍能抑制恶意 fork bomb，且不影响本机评测/编译。
ulimit -u "${DSOJ_NPROC_LIMIT:-4096}" 2>/dev/null
ulimit -f 1048576 2>/dev/null               # 文件大小上限 (1GB)
ulimit -n 1024 2>/dev/null                  # 文件描述符上限

# Sanitizer 运行时选项（仅在二进制启用 sanitizer 时生效，普通二进制忽略）
export ASAN_OPTIONS="${ASAN_OPTIONS:-}":halt_on_error=1:abort_on_error=1:detect_leaks=0:print_stacktrace=0:allocator_may_return_null=1
export UBSAN_OPTIONS="${UBSAN_OPTIONS:-}":halt_on_error=1:abort_on_error=1:print_stacktrace=0

write_peak_and_cpu() {
  local peak_kb="${1:-0}"
  local cpu_ms="${2:-0}"
  local wall_ms="${3:-}"
  if [ -n "${DSOJ_MEM_FILE:-}" ]; then
    printf '%s\n' "${peak_kb}" > "$DSOJ_MEM_FILE"
  fi
  if [ -n "${DSOJ_TIME_FILE:-}" ]; then
    if [ -n "${wall_ms}" ]; then
      # 两列：CPU ms + 子进程墙钟 ms（极短程序 CPU 常为 0，用墙钟展示真实耗时）
      printf '%s %s\n' "${cpu_ms}" "${wall_ms}" > "$DSOJ_TIME_FILE"
    else
      printf '%s\n' "${cpu_ms}" > "$DSOJ_TIME_FILE"
    fi
  fi
}

now_ns() {
  date +%s%N 2>/dev/null || echo 0
}

ns_to_ms() {
  local start_ns="$1"
  local end_ns="$2"
  awk -v s="$start_ns" -v e="$end_ns" 'BEGIN {
    if (s<=0 || e<=0 || e<s) { print 0; exit }
    printf "%d", (e-s)/1000000 + 0.5
  }'
}

stdout_over_limit() {
  local limit="${DSOJ_OUTPUT_LIMIT_BYTES:-0}"
  local out="${DSOJ_STDOUT_FILE:-}"
  [ -z "$out" ] && return 1
  [ "$limit" -gt 0 ] 2>/dev/null || return 1
  [ -f "$out" ] || return 1
  local sz
  sz=$(stat -c%s "$out" 2>/dev/null || echo 0)
  [ "${sz:-0}" -gt "$limit" ] 2>/dev/null
}

# 读选手 PID 的 CPU ms（utime+stime，Linux jiffies≈10ms）
read_pid_cpu_ms() {
  local pid="$1"
  [ -r "/proc/$pid/stat" ] || return 1
  local rest ut st
  rest=$(sed 's/.*) //' "/proc/$pid/stat" 2>/dev/null || true)
  ut=$(echo "$rest" | awk '{print $12}')
  st=$(echo "$rest" | awk '{print $13}')
  [ -n "${ut:-}" ] && [ -n "${st:-}" ] || return 1
  awk -v u="$ut" -v s="$st" 'BEGIN { printf "%d", (u+s)*10 }'
}

# /usr/bin/time 包装时采样其子进程 CPU（time 自身几乎不占 CPU）
read_tree_cpu_ms() {
  local root="$1"
  local best=0 cms c
  cms=$(read_pid_cpu_ms "$root" 2>/dev/null || echo 0)
  best=${cms:-0}
  for c in $(pgrep -P "$root" 2>/dev/null || true); do
    cms=$(read_pid_cpu_ms "$c" 2>/dev/null || echo 0)
    if [ "${cms:-0}" -gt "$best" ] 2>/dev/null; then
      best=$cms
    fi
  done
  printf '%s\n' "$best"
}

# 杀掉进程树（先子后父）。非交互脚本无 job control 时 kill -PGID 无效，
# 只杀 /usr/bin/time 会留下选手孤儿进程继续占 CPU。
kill_tree() {
  local p="$1" c
  [ -n "$p" ] || return 0
  for c in $(pgrep -P "$p" 2>/dev/null || true); do
    kill_tree "$c"
  done
  kill -KILL "$p" 2>/dev/null || true
}

# 后台 OLE + CPU：不阻塞主路径 wait（避免 sleep 把小数据墙钟抬到 ~50ms+）
ole_watch_bg() {
  local pid="$1"
  local flag="$2"
  local cpu_flag="${3:-}"
  local cpu_limit="${DSOJ_CPU_LIMIT_MS:-0}"
  while kill -0 "$pid" 2>/dev/null; do
    if stdout_over_limit; then
      kill_tree "$pid"
      printf '1\n' > "$flag"
      return 0
    fi
    if [ "$cpu_limit" -gt 0 ] 2>/dev/null && [ -n "$cpu_flag" ]; then
      local cms
      cms=$(read_tree_cpu_ms "$pid" 2>/dev/null || echo 0)
      if [ "${cms:-0}" -gt "$cpu_limit" ] 2>/dev/null; then
        kill_tree "$pid"
        printf '%s\n' "$cms" > "$cpu_flag"
        return 0
      fi
    fi
    sleep 0.02
  done
}

# 带可选原生重定向启动选手程序，返回 PID（stdout 打印）
spawn_contestant() {
  if [ -n "${DSOJ_STDIN_FILE:-}" ] || [ -n "${DSOJ_STDOUT_FILE:-}" ] || [ -n "${DSOJ_STDERR_FILE:-}" ]; then
    local in="${DSOJ_STDIN_FILE:-/dev/null}"
    local out="${DSOJ_STDOUT_FILE:-/dev/null}"
    local err="${DSOJ_STDERR_FILE:-/dev/null}"
    "$@" <"$in" >"$out" 2>"$err" &
  else
    "$@" &
  fi
  echo $!
}

# 无 GNU time：前台 wait 立即返回；内存采样 + OLE/CPU 在后台
run_with_proc_monitor() {
  local pid
  pid=$(spawn_contestant "$@")
  local peak=0
  local cpu_ms=0
  local ole_hit=0
  local tle_hit=0
  local ole_flag="${DSOJ_MEM_FILE:-/tmp/dsoj_runner}.ole"
  local cpu_flag="${DSOJ_MEM_FILE:-/tmp/dsoj_runner}.cpu"
  local cpu_limit="${DSOJ_CPU_LIMIT_MS:-0}"
  rm -f "$ole_flag" "$cpu_flag"

  (
    while kill -0 "$pid" 2>/dev/null; do
      if [ -r "/proc/$pid/status" ]; then
        hwm=$(awk '/^VmHWM:/{print $2}' "/proc/$pid/status" 2>/dev/null || true)
        if [ -n "${hwm:-}" ] && [ "$hwm" -gt "$peak" ] 2>/dev/null; then
          peak=$hwm
          printf '%s\n' "$peak" > "${DSOJ_MEM_FILE:-/dev/null}.peak"
        fi
      fi
      if [ -r "/proc/$pid/stat" ]; then
        rest=$(sed 's/.*) //' "/proc/$pid/stat" 2>/dev/null || true)
        ut=$(echo "$rest" | awk '{print $12}')
        st=$(echo "$rest" | awk '{print $13}')
        if [ -n "${ut:-}" ] && [ -n "${st:-}" ]; then
          cpu_ms=$(awk -v u="$ut" -v s="$st" 'BEGIN { printf "%d", (u+s)*10 }')
          printf '%s\n' "$cpu_ms" > "${DSOJ_TIME_FILE:-/dev/null}.peak"
          if [ "$cpu_limit" -gt 0 ] 2>/dev/null && [ "$cpu_ms" -gt "$cpu_limit" ] 2>/dev/null; then
            kill -KILL "$pid" 2>/dev/null || true
            printf '%s\n' "$cpu_ms" > "$cpu_flag"
            break
          fi
        fi
      fi
      if stdout_over_limit; then
        kill -KILL "$pid" 2>/dev/null || true
        printf '1\n' > "$ole_flag"
        break
      fi
      sleep 0.01
    done
    if [ -r "/proc/$pid/status" ]; then
      hwm=$(awk '/^VmHWM:/{print $2}' "/proc/$pid/status" 2>/dev/null || true)
      if [ -n "${hwm:-}" ]; then
        printf '%s\n' "$hwm" > "${DSOJ_MEM_FILE:-/dev/null}.peak"
      fi
    fi
  ) &
  local mon_pid=$!

  local t0 t1 wall_ms
  t0=$(now_ns)
  wait "$pid"
  local ec=$?
  t1=$(now_ns)
  wall_ms=$(ns_to_ms "$t0" "$t1")

  # 尽快停监控，避免多余 sleep
  kill "$mon_pid" 2>/dev/null || true
  wait "$mon_pid" 2>/dev/null || true

  if [ -f "${DSOJ_MEM_FILE:-/dev/null}.peak" ]; then
    peak=$(cat "${DSOJ_MEM_FILE}.peak" 2>/dev/null || echo "$peak")
    rm -f "${DSOJ_MEM_FILE}.peak"
  fi
  if [ -f "${DSOJ_TIME_FILE:-/dev/null}.peak" ]; then
    cpu_ms=$(cat "${DSOJ_TIME_FILE}.peak" 2>/dev/null || echo "$cpu_ms")
    rm -f "${DSOJ_TIME_FILE}.peak"
  fi
  if [ -f "$ole_flag" ]; then
    ole_hit=1
    rm -f "$ole_flag"
  fi
  if [ -f "$cpu_flag" ]; then
    tle_hit=1
    cpu_ms=$(cat "$cpu_flag" 2>/dev/null || echo "$cpu_ms")
    rm -f "$cpu_flag"
  fi
  if [ "$ole_hit" -ne 1 ] && stdout_over_limit; then
    ole_hit=1
  fi

  write_peak_and_cpu "$peak" "$cpu_ms" "$wall_ms"
  if [ "$ole_hit" -eq 1 ]; then
    return "$EXIT_OLE"
  fi
  if [ "$tle_hit" -eq 1 ]; then
    return "$EXIT_TLE"
  fi
  return "$ec"
}

# GNU time：前台 wait；重定向挂在 time 上（子进程继承，无需额外 sh -c）
run_with_gnu_time() {
  STAT_FILE="${DSOJ_MEM_FILE:-${DSOJ_TIME_FILE}}.stat"
  local ole_hit=0
  local tle_hit=0
  local timed_pid
  local ole_flag="${STAT_FILE}.ole"
  local cpu_flag="${STAT_FILE}.cpu"
  rm -f "$ole_flag" "$cpu_flag"

  if [ -n "${DSOJ_STDIN_FILE:-}" ] || [ -n "${DSOJ_STDOUT_FILE:-}" ] || [ -n "${DSOJ_STDERR_FILE:-}" ]; then
    local in="${DSOJ_STDIN_FILE:-/dev/null}"
    local out="${DSOJ_STDOUT_FILE:-/dev/null}"
    local err="${DSOJ_STDERR_FILE:-/dev/null}"
    # 重定向由 shell 施加到 time，子进程继承 —— 少一层 sh -c，小数据更准更快
    /usr/bin/time -f '%M %U %S' -o "$STAT_FILE" -- "$@" <"$in" >"$out" 2>"$err" &
    timed_pid=$!
  else
    /usr/bin/time -f '%M %U %S' -o "$STAT_FILE" -- "$@" &
    timed_pid=$!
  fi

  # 始终开监视：OLE + CPU 毫秒硬杀（大输出题暴力解不应拖满墙钟）
  ole_watch_bg "$timed_pid" "$ole_flag" "$cpu_flag" &
  local ole_pid=$!

  local t0 t1 wall_ms
  t0=$(now_ns)
  wait "$timed_pid"
  local EXIT_CODE=$?
  t1=$(now_ns)
  wall_ms=$(ns_to_ms "$t0" "$t1")

  if [ -n "${ole_pid:-}" ]; then
    kill "$ole_pid" 2>/dev/null || true
    wait "$ole_pid" 2>/dev/null || true
  fi
  if [ -f "$ole_flag" ]; then
    ole_hit=1
    rm -f "$ole_flag"
  fi
  if [ -f "$cpu_flag" ]; then
    tle_hit=1
    rm -f "$cpu_flag"
  fi
  if [ "$ole_hit" -ne 1 ] && stdout_over_limit; then
    ole_hit=1
  fi
  if [ "$ole_hit" -eq 1 ]; then
    EXIT_CODE=$EXIT_OLE
  elif [ "$tle_hit" -eq 1 ]; then
    EXIT_CODE=$EXIT_TLE
  fi

  if [ -f "$STAT_FILE" ]; then
    # shellcheck disable=SC2034
    read -r MEM_KB USER_S SYS_S < "$STAT_FILE" || true
    if [ -n "${DSOJ_MEM_FILE:-}" ] && [ -n "${MEM_KB:-}" ]; then
      printf '%s\n' "$MEM_KB" > "$DSOJ_MEM_FILE"
    fi
    if [ -n "${DSOJ_TIME_FILE:-}" ] && [ -n "${USER_S:-}" ]; then
      TIME_MS=$(awk -v u="${USER_S:-0}" -v s="${SYS_S:-0}" 'BEGIN { t=(u+s)*1000; if (t<0) t=0; printf "%d", t+0.5 }')
      # 第二列：子进程墙钟（含 time 自身极少开销），供 CPU=0 时展示真实耗时
      printf '%s %s\n' "${TIME_MS:-0}" "${wall_ms:-0}" > "$DSOJ_TIME_FILE"
    elif [ -n "${DSOJ_TIME_FILE:-}" ]; then
      printf '0 %s\n' "${wall_ms:-0}" > "$DSOJ_TIME_FILE"
    fi
    rm -f "$STAT_FILE"
  elif [ -n "${DSOJ_TIME_FILE:-}" ]; then
    printf '0 %s\n' "${wall_ms:-0}" > "$DSOJ_TIME_FILE"
  fi
  exit $EXIT_CODE
}

if { [ -n "${DSOJ_MEM_FILE:-}" ] || [ -n "${DSOJ_TIME_FILE:-}" ]; } && command -v /usr/bin/time >/dev/null 2>&1; then
  run_with_gnu_time "$@"
fi

if [ -n "${DSOJ_MEM_FILE:-}" ] || [ -n "${DSOJ_TIME_FILE:-}" ]; then
  run_with_proc_monitor "$@"
  exit $?
fi

if [ -n "${DSOJ_STDIN_FILE:-}" ] || [ -n "${DSOJ_STDOUT_FILE:-}" ] || [ -n "${DSOJ_STDERR_FILE:-}" ]; then
  in="${DSOJ_STDIN_FILE:-/dev/null}"
  out="${DSOJ_STDOUT_FILE:-/dev/null}"
  err="${DSOJ_STDERR_FILE:-/dev/null}"
  exec "$@" <"$in" >"$out" 2>"$err"
fi

exec "$@"
