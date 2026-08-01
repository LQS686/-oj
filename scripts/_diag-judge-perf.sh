#!/usr/bin/env bash
# 评测性能诊断脚本（在服务器项目目录运行：bash scripts/_diag-judge-perf.sh）
# 目的：区分大测点变慢的根因——缓存未生效 / 磁盘 I/O 慢 / CPU 性能差 / 内存换页。
set -uo pipefail
cd "$(dirname "$0")/.."

APP_CID="$(docker compose ps -q app 2>/dev/null | head -1 || true)"

echo "================ 1. 测点磁盘缓存是否生效 ================"
if [[ -n "$APP_CID" ]]; then
  docker compose exec -T app sh -c '
    echo "缓存测点目录数: $(ls /app/data/testdata 2>/dev/null | wc -l)"
    echo "缓存 input.txt 文件数: $(find /app/data/testdata -name input.txt 2>/dev/null | wc -l)"
    echo "--- 缓存目录内容（前 5 个）---"
    ls -la /app/data/testdata 2>/dev/null | head -6
    echo "--- 属主（应为 1001）---"
    stat -c "%U:%G %n" /app/data /app/data/testdata 2>/dev/null
  ' 2>/dev/null
  echo "（缓存目录数=0 → 缓存从未写入，仍每次回源 Mongo，这是最大嫌疑）"
else
  echo "app 容器未运行，跳过"
fi

echo ""
echo "================ 2. 磁盘写吞吐（评测临时目录 /app/temp）================"
if [[ -n "$APP_CID" ]]; then
  docker compose exec -T -u root app sh -c '
    dd if=/dev/zero of=/app/temp/.dtest bs=1M count=200 2>&1 | tail -1
    rm -f /app/temp/.dtest
  ' 2>/dev/null || echo "dd 失败"
  echo "（对比：本地 NVMe SSD 通常 >500MB/s；腾讯云普通云盘常 <200MB/s）"
fi

echo ""
echo "================ 3. 磁盘读吞吐（缓存目录 /app/data）================"
if [[ -n "$APP_CID" ]]; then
  docker compose exec -T -u root app sh -c '
    F=$(find /app/data/testdata -name input.txt 2>/dev/null | head -1)
    if [[ -n "$F" ]]; then
      dd if="$F" of=/dev/null bs=1M 2>&1 | tail -1
    else
      echo "无缓存文件，先写一个 100MB 测试文件"
      dd if=/dev/zero of=/app/data/.rtest bs=1M count=100 2>&1 | tail -1
      dd if=/app/data/.rtest of=/dev/null bs=1M 2>&1 | tail -1
      rm -f /app/data/.rtest
    fi
  ' 2>/dev/null || echo "dd 失败"
fi

echo ""
echo "================ 4. CPU 信息（容器视角）================"
if [[ -n "$APP_CID" ]]; then
  docker compose exec -T app sh -c '
    echo "可用核数: $(nproc)"
    grep -m1 "model name" /proc/cpuinfo
    grep -m1 "cpu MHz" /proc/cpuinfo
  ' 2>/dev/null || echo "无法读取"
  echo "--- 宿主 CPU（共享核/降频嫌疑）---"
  docker inspect "$APP_CID" -f 'NanoCpus(纳核,1e9=1核): {{.HostConfig.NanoCpus}}  Mem: {{.HostConfig.Memory}}' 2>/dev/null || true
fi

echo ""
echo "================ 5. 内存 / Swap（换页会让 I/O 评测雪上加霜）================"
free -h

echo ""
echo "================ 6. 最近一次评测耗时（区分 CPU 时间 vs 总耗时）================"
if [[ -n "$APP_CID" ]]; then
  docker compose logs app --tail=500 2>/dev/null | grep -E '评测耗时|duration|测试执行错误' | tail -5 || true
fi

echo ""
echo "================ 7. 启动横幅（确认 debian-slim/glibc 生效）================"
if [[ -n "$APP_CID" ]]; then
  docker compose logs app 2>/dev/null | grep -m1 'libc=' || true
fi

echo ""
echo "========== 诊断完成：请把以上输出完整贴给开发者 =========="
