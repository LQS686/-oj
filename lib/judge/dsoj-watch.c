/**
 * dsoj-watch：同步监视选手进程，输出真实 CPU / 内存。
 *
 * 时间：wait4(rusage) 的 utime+stime（微秒级，非 /proc 10ms jiffies）
 * 内存：运行期密采样 RssAnon 峰值（匿名页；不含共享库虚高）
 * 墙钟：CLOCK_MONOTONIC 包住选手生命周期（仅作展示兜底 / sleep-TLE）
 *
 * 用法:
 *   dsoj-watch <mem_kb_out> <time_ms_out> <cpu_limit_ms> <wall_limit_ms> \
 *              <ole_limit_bytes> <stdout_path_or_-> -- <cmd> [args...]
 *
 * time 文件: "cpu_ms wall_ms"（均为真实测量，不做 +1 / 基线伪造）
 * 退出码: 选手码，或 152=TLE、153=OLE
 */
#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/resource.h>
#include <sys/time.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

#define EXIT_TLE 152
#define EXIT_OLE 153

/* 进程树容量上限：防 fork 炸弹导致的数组溢出（超出部分不计内存，TLE 强杀仍覆盖） */
#define MAX_TREE_PROCS 512

static long long now_ns(void) {
  struct timespec ts;
  if (clock_gettime(CLOCK_MONOTONIC, &ts) != 0) return 0;
  return (long long)ts.tv_sec * 1000000000LL + (long long)ts.tv_nsec;
}

/* ----------------------------------------------------------------------------
 * 进程树遍历（B-P2-6）：/proc/<pid>/task/<pid>/children 是 Linux 原生接口，
 * 无 pgrep 依赖，直接给出直接子进程 pid 列表。
 * -------------------------------------------------------------------------- */

/* 前置声明：read_cpu_tree_ms_approx 在 read_cpu_ms_approx 定义之前引用 */
static long read_cpu_ms_approx(pid_t pid);

/** 读取某个进程的直接子进程（返回数量，最多 cap 个） */
static int read_children(pid_t pid, pid_t *out, int cap) {
  char path[64];
  snprintf(path, sizeof(path), "/proc/%d/task/%d/children", (int)pid, (int)pid);
  FILE *f = fopen(path, "r");
  if (!f) return 0;
  char buf[4096];
  int n = 0;
  if (fgets(buf, sizeof(buf), f)) {
    char *tok = strtok(buf, " \n");
    while (tok && n < cap) {
      char *end = NULL;
      long v = strtol(tok, &end, 10);
      if (end && *end == '\0' && v > 0) out[n++] = (pid_t)v;
      tok = strtok(NULL, " \n");
    }
  }
  fclose(f);
  return n;
}

/** BFS 收集整棵进程树（含 root），返回进程总数（不超过 cap） */
static int collect_tree(pid_t root, pid_t *pids, int cap) {
  if (cap <= 0) return 0;
  int head = 0, tail = 1;
  pids[0] = root;
  while (head < tail && tail < cap) {
    pid_t cur = pids[head++];
    int n = read_children(cur, pids + tail, cap - tail);
    tail += n;
  }
  return tail;
}

/** 强杀整棵进程树（先子后父，减少僵尸窗口；pid 重用窗口内误杀风险可忽略） */
static void kill_tree(pid_t root) {
  pid_t pids[MAX_TREE_PROCS];
  int n = collect_tree(root, pids, MAX_TREE_PROCS);
  for (int i = n - 1; i >= 0; i--) {
    if (pids[i] > 0 && pids[i] != root) (void)kill(pids[i], SIGKILL);
  }
  (void)kill(root, SIGKILL);
}

/**
 * 一次 fopen 读取 status 的 RssAnon 与 VmHWM 两个字段。
 * - RssAnon 缺失（旧内核）回退 VmRSS
 * - VmHWM 缺失时退化为当前 anon（仅降级路径）
 * 返回 0 表示至少拿到一个字段。
 */
static int read_status_anon_hwm(pid_t pid, long *anon, long *hwm) {
  char path[64];
  snprintf(path, sizeof(path), "/proc/%d/status", (int)pid);
  FILE *f = fopen(path, "r");
  if (!f) return -1;
  char line[256];
  int found_anon = 0, found_hwm = 0;
  while (fgets(line, sizeof(line), f)) {
    if (!found_anon) {
      if (strncmp(line, "RssAnon:", 8) == 0) {
        if (sscanf(line + 8, "%ld", anon) == 1) found_anon = 1;
      } else if (strncmp(line, "VmRSS:", 6) == 0) {
        if (sscanf(line + 6, "%ld", anon) == 1) found_anon = 1;
      }
    } else if (!found_hwm && strncmp(line, "VmHWM:", 6) == 0) {
      if (sscanf(line + 6, "%ld", hwm) == 1) found_hwm = 1;
    }
    if (found_anon && found_hwm) break;
  }
  fclose(f);
  if (!found_hwm && found_anon) *hwm = *anon;
  return (found_anon || found_hwm) ? 0 : -1;
}

/**
 * 整棵进程树内存：sum(RssAnon) 与 sum(VmHWM)。
 * 已退出的进程读不到 status，直接跳过（其峰值在存活期间已计入 VmHWM 和）。
 */
static void read_mem_tree_kb(pid_t root, long *sum_anon, long *sum_hwm) {
  pid_t pids[MAX_TREE_PROCS];
  int n = collect_tree(root, pids, MAX_TREE_PROCS);
  long a = 0, h = 0;
  for (int i = 0; i < n; i++) {
    long an = 0, hw = 0;
    if (read_status_anon_hwm(pids[i], &an, &hw) != 0) continue;
    a += an;
    h += hw;
  }
  *sum_anon = a;
  *sum_hwm = h;
}

/** 整棵树运行中 CPU 粗测（含 fork 子进程；仍仅用于中途 TLE 强杀，最终以 wait4 为准） */
static long read_cpu_tree_ms_approx(pid_t root) {
  pid_t pids[MAX_TREE_PROCS];
  int n = collect_tree(root, pids, MAX_TREE_PROCS);
  long total = 0;
  for (int i = 0; i < n; i++) {
    long m = read_cpu_ms_approx(pids[i]);
    if (m > 0) total += m;
  }
  return total;
}

/** 运行中 CPU 粗测（jiffies，仅用于中途 TLE 强杀；最终以 wait4 为准） */
static long read_cpu_ms_approx(pid_t pid) {
  char path[64];
  snprintf(path, sizeof(path), "/proc/%d/stat", (int)pid);
  FILE *f = fopen(path, "r");
  if (!f) return -1;
  char buf[4096];
  if (!fgets(buf, sizeof(buf), f)) {
    fclose(f);
    return -1;
  }
  fclose(f);
  char *rparen = strrchr(buf, ')');
  if (!rparen) return -1;
  unsigned long ut = 0, st = 0;
  if (sscanf(rparen + 2,
             "%*c %*d %*d %*d %*d %*d %*u %*u %*u %*u %*u %lu %lu",
             &ut, &st) < 2) {
    return -1;
  }
  return (long)((ut + st) * 10UL);
}

static int stdout_over_limit(const char *path, long long limit) {
  if (!path || !path[0] || path[0] == '-' || limit <= 0) return 0;
  int fd = open(path, O_RDONLY);
  if (fd < 0) return 0;
  off_t sz = lseek(fd, 0, SEEK_END);
  close(fd);
  return (sz > 0 && (long long)sz > limit) ? 1 : 0;
}

static void write_long(const char *path, long v) {
  if (!path || !path[0] || path[0] == '-') return;
  FILE *f = fopen(path, "w");
  if (!f) return;
  fprintf(f, "%ld\n", v);
  fclose(f);
}

static void write_time_pair(const char *path, long cpu_ms, long wall_ms) {
  if (!path || !path[0] || path[0] == '-') return;
  FILE *f = fopen(path, "w");
  if (!f) return;
  fprintf(f, "%ld %ld\n", cpu_ms, wall_ms);
  fclose(f);
}

int main(int argc, char **argv) {
  if (argc < 8) {
    fprintf(stderr,
            "usage: dsoj-watch memfile timefile cpu_ms wall_ms ole_bytes stdout -- cmd...\n");
    return 1;
  }
  const char *mem_file = argv[1];
  const char *time_file = argv[2];
  long cpu_limit_ms = strtol(argv[3], NULL, 10);
  long wall_limit_ms = strtol(argv[4], NULL, 10);
  long long ole_limit = strtoll(argv[5], NULL, 10);
  const char *stdout_path = argv[6];
  if (strcmp(argv[7], "--") != 0) {
    fprintf(stderr, "dsoj-watch: expected -- before command\n");
    return 1;
  }
  char **cmd = &argv[8];
  if (!cmd[0]) {
    fprintf(stderr, "dsoj-watch: missing command\n");
    return 1;
  }

  pid_t pid = fork();
  if (pid < 0) {
    perror("fork");
    return 1;
  }
  if (pid == 0) {
    execvp(cmd[0], cmd);
    _exit(127);
  }

  long peak_mem = 0;
  int ole_hit = 0;
  int tle_hit = 0;
  int status = 0;
  int reaped = 0;
  struct rusage ru;
  memset(&ru, 0, sizeof(ru));
  long long t0 = now_ns();

  for (;;) {
    long elapsed_ms = (long)((now_ns() - t0) / 1000000LL);

    /* B-P2-6：进程树内存峰值。双口径取 max：
       - sum(RssAnon) 瞬时并发和（并发场景准确）
       - sum(VmHWM) 内核记录的各进程历史峰值和（无采样漏采；单进程时即真实峰值）
       fork 子进程的内存全部计入，不再只统计主进程。 */
    long sum_anon = 0, sum_hwm = 0;
    read_mem_tree_kb(pid, &sum_anon, &sum_hwm);
    long cur = sum_anon > sum_hwm ? sum_anon : sum_hwm;
    if (cur > peak_mem) peak_mem = cur;

    /* 中途 TLE：整棵树 jiffies 粗测（含 fork 子进程死循环）；最终时间仍用 wait4 */
    if (cpu_limit_ms > 0) {
      long approx = read_cpu_tree_ms_approx(pid);
      if (approx > cpu_limit_ms) {
        tle_hit = 1;
        kill_tree(pid);
        break;
      }
    }
    if (wall_limit_ms > 0) {
      if (elapsed_ms > wall_limit_ms) {
        tle_hit = 1;
        kill_tree(pid);
        break;
      }
    }
    if (stdout_over_limit(stdout_path, ole_limit)) {
      ole_hit = 1;
      kill_tree(pid);
      break;
    }

    memset(&ru, 0, sizeof(ru));
    pid_t w = wait4(pid, &status, WNOHANG, &ru);
    if (w == pid) {
      reaped = 1;
      break;
    }
    if (w < 0 && errno == ECHILD) {
      reaped = 1;
      break;
    }

    /* B-P2-7：VmHWM 为内核级历史峰值，峰值漏采已被根治，不再需要 100µs 密窗；
       统一 1ms 间隔，降低 /proc 读取与 lseek 系统调用对选手 CPU 的挤占 */
    struct timespec ts = { .tv_sec = 0, .tv_nsec = 1000000L }; /* 1ms */
    nanosleep(&ts, NULL);
  }

  if (!reaped) {
    memset(&ru, 0, sizeof(ru));
    (void)wait4(pid, &status, 0, &ru);
    reaped = 1;
  }

  long wall_ms = (long)((now_ns() - t0) / 1000000LL);
  if (wall_ms < 0) wall_ms = 0;

  /* 真实 CPU：wait4 微秒精度（ut+st 合并后再取整，避免分别四舍五入误差） */
  long long cpu_us =
    (long long)ru.ru_utime.tv_sec * 1000000LL + (long long)ru.ru_utime.tv_usec +
    (long long)ru.ru_stime.tv_sec * 1000000LL + (long long)ru.ru_stime.tv_usec;
  long cpu_ms = cpu_us <= 0 ? 0 : (long)((cpu_us + 500) / 1000);

  /* 内存：仅写采样到的 RssAnon 峰值；采不到就写 0，绝不填 ru_maxrss（含共享库） */
  write_long(mem_file, peak_mem > 0 ? peak_mem : 0);
  write_time_pair(time_file, cpu_ms, wall_ms);

  if (ole_hit) return EXIT_OLE;
  if (tle_hit) return EXIT_TLE;
  if (WIFEXITED(status)) return WEXITSTATUS(status);
  if (WIFSIGNALED(status)) {
    int sig = WTERMSIG(status);
    if (sig == SIGXCPU) return EXIT_TLE;
    return 128 + sig;
  }
  return 1;
}
