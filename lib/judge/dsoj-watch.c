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

static long long now_ns(void) {
  struct timespec ts;
  if (clock_gettime(CLOCK_MONOTONIC, &ts) != 0) return 0;
  return (long long)ts.tv_sec * 1000000000LL + (long long)ts.tv_nsec;
}

static int read_status_kb(pid_t pid, const char *key, long *out) {
  char path[64];
  snprintf(path, sizeof(path), "/proc/%d/status", (int)pid);
  FILE *f = fopen(path, "r");
  if (!f) return -1;
  char line[256];
  size_t klen = strlen(key);
  int found = 0;
  while (fgets(line, sizeof(line), f)) {
    if (strncmp(line, key, klen) == 0 && line[klen] == ':') {
      long v = 0;
      if (sscanf(line + klen + 1, "%ld", &v) == 1) {
        *out = v;
        found = 1;
      }
      break;
    }
  }
  fclose(f);
  return found ? 0 : -1;
}

/** 选手自有内存：RssAnon；旧内核回退当前 VmRSS（仍优于含库的 maxrss） */
static long read_mem_kb(pid_t pid) {
  long v = 0;
  if (read_status_kb(pid, "RssAnon", &v) == 0) return v;
  if (read_status_kb(pid, "VmRSS", &v) == 0) return v;
  return -1;
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

    long m = read_mem_kb(pid);
    if (m > peak_mem) peak_mem = m;

    /* 中途 TLE：jiffies 粗测足够杀掉死循环；最终时间仍用 wait4 */
    if (cpu_limit_ms > 0) {
      long approx = read_cpu_ms_approx(pid);
      if (approx > cpu_limit_ms) {
        tle_hit = 1;
        kill(pid, SIGKILL);
        break;
      }
    }
    if (wall_limit_ms > 0) {
      if (elapsed_ms > wall_limit_ms) {
        tle_hit = 1;
        kill(pid, SIGKILL);
        break;
      }
    }
    if (stdout_over_limit(stdout_path, ole_limit)) {
      ole_hit = 1;
      kill(pid, SIGKILL);
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

    /* 自适应采样间隔（D+G 优化）：
     * - 前 300ms 用 100µs 密采样：捕获短程序内存峰值与 OLE
     * - 300ms 后降为 1ms：长测点减少 /proc 读取与 lseek 系统调用挤占选手 CPU
     *   3 路并发时系统调用 10.8 万/s → 1.08 万/s，降低 cache 抖动
     *   内存变化在 ms 级，1ms 采样精度足够；最终 CPU 用 wait4 不受影响 */
    long interval_ns = elapsed_ms < 300 ? 100000L : 1000000L; /* 100µs / 1ms */
    struct timespec ts = { .tv_sec = 0, .tv_nsec = interval_ns };
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
