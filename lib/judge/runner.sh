#!/bin/bash
# 选手程序运行 wrapper，设置硬资源限制（参考 Project LemonLime 的 watcher_unix.cpp）
# 用法: runner.sh <memory_limit_mb> <cpu_time_limit_sec> <stack_mb> <executable> [args...]
MEM_MB="$1"
CPU_SEC="$2"
STACK_MB="$3"
shift 3
ulimit -v $((MEM_MB * 1024)) 2>/dev/null   # 虚拟内存上限 (KB)
ulimit -t "$CPU_SEC" 2>/dev/null            # CPU 时间上限 (秒)
ulimit -s $((STACK_MB * 1024)) 2>/dev/null  # 栈大小上限 (KB)
ulimit -c 0 2>/dev/null                     # 禁用 core dump
ulimit -u 64 2>/dev/null                    # 进程数上限 (防 fork bomb)
ulimit -f 1048576 2>/dev/null               # 文件大小上限 (1GB)
ulimit -n 1024 2>/dev/null                  # 文件描述符上限

# Sanitizer 运行时选项（仅在二进制启用 sanitizer 时生效，普通二进制忽略）：
# - halt_on_error=1：第一个错误立即终止（默认行为，显式设置避免环境差异）
# - abort_on_error=1：用 abort() 退出（SIGABRT → 退出码 134），让 OJ 判 RE
# - detect_leaks=0：禁用 leak detection（OJ 不关心内存泄漏，且开销大）
# - print_stacktrace=0：禁用栈回溯打印，避免 stderr 污染输出文件
# - allocator_may_return_null=1：malloc 失败返回 NULL 而非 crash（容错）
# 这些选项对未启用 sanitizer 的普通二进制无副作用。
export ASAN_OPTIONS="${ASAN_OPTIONS:-}":halt_on_error=1:abort_on_error=1:detect_leaks=0:print_stacktrace=0:allocator_may_return_null=1
export UBSAN_OPTIONS="${UBSAN_OPTIONS:-}":halt_on_error=1:abort_on_error=1:print_stacktrace=0

exec "$@"
