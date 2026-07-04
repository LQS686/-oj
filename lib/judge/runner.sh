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
exec "$@"
