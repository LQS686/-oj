#!/bin/bash
# 选手程序运行 wrapper（Linux only）
# 用法: runner.sh <memory_limit_mb> <cpu_time_limit_sec> <stack_mb> <executable> [args...]
#
# 环境变量（executor 统一读取）：
#   DSOJ_MEM_FILE   峰值内存（KB）—— RssAnon（堆/栈匿名页），不含共享库
#   DSOJ_TIME_FILE  "cpu_ms wall_ms"
#                   cpu = wait4 utime+stime（真实 CPU，微秒取整）
#                   wall = CLOCK_MONOTONIC 选手生命周期（真实墙钟）
#   DSOJ_STDIN_FILE / DSOJ_STDOUT_FILE / DSOJ_STDERR_FILE
#   DSOJ_OUTPUT_LIMIT_BYTES  OLE 上限
#   DSOJ_CPU_LIMIT_MS        CPU TLE（毫秒）
#   DSOJ_WALL_LIMIT_MS       墙钟 TLE（毫秒）
#   DSOJ_FORCE_ULIMIT_V=1    启用 ulimit -v
#
# 由 dsoj-watch（C）同步密采样；禁止 /usr/bin/time 总 RSS、禁止伪造 +1ms。
MEM_MB="$1"
CPU_SEC="$2"
STACK_MB="$3"
shift 3
EXIT_TLE=152
EXIT_OLE=153

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WATCH_BIN="${SCRIPT_DIR}/dsoj-watch"
WATCH_SRC="${SCRIPT_DIR}/dsoj-watch.c"

# 虚拟内存 ulimit -v 与 AddressSanitizer 不兼容。
if [[ "${DSOJ_FORCE_ULIMIT_V:-}" == "1" ]]; then
  ulimit -v $((MEM_MB * 1024)) 2>/dev/null
fi
ulimit -t "$CPU_SEC" 2>/dev/null
ulimit -s $((STACK_MB * 1024)) 2>/dev/null
ulimit -c 0 2>/dev/null
ulimit -u "${DSOJ_NPROC_LIMIT:-4096}" 2>/dev/null
ulimit -f 1048576 2>/dev/null
ulimit -n 1024 2>/dev/null

export ASAN_OPTIONS="${ASAN_OPTIONS:-}":halt_on_error=1:abort_on_error=1:detect_leaks=0:print_stacktrace=0:allocator_may_return_null=1
export UBSAN_OPTIONS="${UBSAN_OPTIONS:-}":halt_on_error=1:abort_on_error=1:print_stacktrace=0

ensure_watch_bin() {
  # 已存在且不比源码旧：直接用（启动时已预编译，并行测点不得再原地 cc -o）
  if [ -x "$WATCH_BIN" ] && [ ! "$WATCH_SRC" -nt "$WATCH_BIN" ]; then
    return 0
  fi
  if ! command -v cc >/dev/null 2>&1 && ! command -v gcc >/dev/null 2>&1; then
    return 1
  fi
  local CC TMP LOCK
  CC="$(command -v cc 2>/dev/null || command -v gcc)"
  TMP="${WATCH_BIN}.new.$$"
  LOCK="${WATCH_BIN}.lock"
  # flock 串行化；写到临时文件再 rename，避免截断正在 exec 的 ELF → SIGBUS/RE
  (
    if command -v flock >/dev/null 2>&1; then
      flock 9
    fi
    if [ -x "$WATCH_BIN" ] && [ ! "$WATCH_SRC" -nt "$WATCH_BIN" ]; then
      exit 0
    fi
    "$CC" -O2 -o "$TMP" "$WATCH_SRC" 2>/dev/null || exit 1
    chmod +x "$TMP" 2>/dev/null || true
    mv -f "$TMP" "$WATCH_BIN"
  ) 9>"$LOCK"
  rm -f "$TMP" 2>/dev/null || true
  [ -x "$WATCH_BIN" ]
}

write_peak_and_cpu() {
  local peak_kb="${1:-0}"
  local cpu_ms="${2:-0}"
  local wall_ms="${3:-}"
  if [ -n "${DSOJ_MEM_FILE:-}" ]; then
    printf '%s\n' "${peak_kb}" > "$DSOJ_MEM_FILE"
  fi
  if [ -n "${DSOJ_TIME_FILE:-}" ]; then
    if [ -n "${wall_ms}" ]; then
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

read_pid_mem_kb() {
  local pid="$1"
  [ -r "/proc/$pid/status" ] || return 1
  local anon rss
  anon=$(awk '/^RssAnon:/{print $2; exit}' "/proc/$pid/status" 2>/dev/null || true)
  if [ -n "${anon:-}" ] && [ "$anon" -ge 0 ] 2>/dev/null; then
    printf '%s\n' "$anon"
    return 0
  fi
  rss=$(awk '/^VmRSS:/{print $2; exit}' "/proc/$pid/status" 2>/dev/null || true)
  if [ -n "${rss:-}" ] && [ "$rss" -ge 0 ] 2>/dev/null; then
    printf '%s\n' "$rss"
    return 0
  fi
  return 1
}

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

# 主路径：C 同步监视器（100µs 采样，无后台竞态，无共享库虚高）
run_with_dsoj_watch() {
  local mem_out="${DSOJ_MEM_FILE:-/dev/null}"
  local time_out="${DSOJ_TIME_FILE:-/dev/null}"
  local cpu_limit="${DSOJ_CPU_LIMIT_MS:-0}"
  local wall_limit="${DSOJ_WALL_LIMIT_MS:-0}"
  local ole_limit="${DSOJ_OUTPUT_LIMIT_BYTES:-0}"
  local stdout_path="${DSOJ_STDOUT_FILE:--}"

  local in="${DSOJ_STDIN_FILE:-/dev/null}"
  local out="${DSOJ_STDOUT_FILE:-/dev/null}"
  local err="${DSOJ_STDERR_FILE:-/dev/null}"

  # 重定向继承给 watch → fork 后的选手进程
  "$WATCH_BIN" "$mem_out" "$time_out" "$cpu_limit" "$wall_limit" "$ole_limit" "$stdout_path" -- "$@" \
    <"$in" >"$out" 2>"$err"
  return $?
}

# 兜底：无编译器时的 bash 同步密采样（仍不走 /usr/bin/time）
run_with_bash_sync() {
  local pid peak=0 cpu_ms=0 ole_hit=0 tle_hit=0
  local cpu_limit="${DSOJ_CPU_LIMIT_MS:-0}"
  local wall_limit="${DSOJ_WALL_LIMIT_MS:-0}"
  local in="${DSOJ_STDIN_FILE:-/dev/null}"
  local out="${DSOJ_STDOUT_FILE:-/dev/null}"
  local err="${DSOJ_STDERR_FILE:-/dev/null}"

  "$@" <"$in" >"$out" 2>"$err" &
  pid=$!

  local t0 t1 wall_ms ec
  t0=$(now_ns)

  # 同步循环：先采样再判断存活，避免后台 monitor 与 wait 竞态
  while kill -0 "$pid" 2>/dev/null; do
    m=$(read_pid_mem_kb "$pid" 2>/dev/null || echo 0)
    if [ "${m:-0}" -gt "$peak" ] 2>/dev/null; then
      peak=$m
    fi
    c=$(read_pid_cpu_ms "$pid" 2>/dev/null || echo 0)
    if [ "${c:-0}" -gt "$cpu_ms" ] 2>/dev/null; then
      cpu_ms=$c
    fi
    if [ "$cpu_limit" -gt 0 ] 2>/dev/null && [ "$cpu_ms" -gt "$cpu_limit" ] 2>/dev/null; then
      kill -KILL "$pid" 2>/dev/null || true
      tle_hit=1
      break
    fi
    if [ "$wall_limit" -gt 0 ] 2>/dev/null; then
      elapsed=$(ns_to_ms "$t0" "$(now_ns)")
      if [ "${elapsed:-0}" -gt "$wall_limit" ] 2>/dev/null; then
        kill -KILL "$pid" 2>/dev/null || true
        tle_hit=1
        break
      fi
    fi
    if stdout_over_limit; then
      kill -KILL "$pid" 2>/dev/null || true
      ole_hit=1
      break
    fi
    sleep 0.001
  done

  wait "$pid" 2>/dev/null
  ec=$?
  t1=$(now_ns)
  wall_ms=$(ns_to_ms "$t0" "$t1")

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

if [ -n "${DSOJ_MEM_FILE:-}" ] || [ -n "${DSOJ_TIME_FILE:-}" ]; then
  if ensure_watch_bin; then
    run_with_dsoj_watch "$@"
    exit $?
  fi
  run_with_bash_sync "$@"
  exit $?
fi

if [ -n "${DSOJ_STDIN_FILE:-}" ] || [ -n "${DSOJ_STDOUT_FILE:-}" ] || [ -n "${DSOJ_STDERR_FILE:-}" ]; then
  in="${DSOJ_STDIN_FILE:-/dev/null}"
  out="${DSOJ_STDOUT_FILE:-/dev/null}"
  err="${DSOJ_STDERR_FILE:-/dev/null}"
  exec "$@" <"$in" >"$out" 2>"$err"
fi

exec "$@"
