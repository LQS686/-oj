/**
 * 预编译 / 原子更新 dsoj-watch，避免并行测点同时 `cc -o` 截断正在 exec 的二进制 → 误报 RE。
 * WSL `npm run dev` 路径尤其需要：不像 Docker 镜像构建时已预编译。
 */
import { spawnSync } from 'child_process'
import { existsSync, chmodSync, statSync } from 'fs'
import { join } from 'path'
import { logger } from '@/lib/logger'

const JUDGE_DIR = join(process.cwd(), 'lib', 'judge')
export const DSOJ_WATCH_BIN = join(JUDGE_DIR, 'dsoj-watch')
const DSOJ_WATCH_SRC = join(JUDGE_DIR, 'dsoj-watch.c')
const DSOJ_WATCH_LOCK = join(JUDGE_DIR, 'dsoj-watch.lock')

function needsRebuild(): boolean {
  if (!existsSync(DSOJ_WATCH_SRC)) return false
  if (!existsSync(DSOJ_WATCH_BIN)) return true
  try {
    return statSync(DSOJ_WATCH_SRC).mtimeMs > statSync(DSOJ_WATCH_BIN).mtimeMs
  } catch {
    return true
  }
}

function findCc(): string | null {
  for (const c of ['cc', 'gcc']) {
    const r = spawnSync('which', [c], { encoding: 'utf8' })
    if (r.status === 0 && r.stdout?.trim()) return r.stdout.trim()
  }
  return null
}

/**
 * 确保 dsoj-watch 可执行且与源码一致。
 * 使用 flock + 临时文件 + mv，避免并行评测读到半截 ELF。
 */
export function ensureDsojWatchBinary(): boolean {
  if (process.platform === 'win32') return false
  if (!existsSync(DSOJ_WATCH_SRC)) {
    logger.warn('dsoj-watch.c 不存在，将回退 bash 监视')
    return false
  }
  if (!needsRebuild()) {
    return existsSync(DSOJ_WATCH_BIN)
  }

  const cc = findCc()
  if (!cc) {
    logger.warn('未找到 cc/gcc，无法编译 dsoj-watch')
    return false
  }

  // 与 runner.sh 共用同一 lock；flock 串行 + 写 .new.$$ 再 mv，避免半截 ELF
  const locked = spawnSync(
    'bash',
    [
      '-c',
      [
        `TMP="${DSOJ_WATCH_BIN}.new.$$"`,
        `(`,
        `  if command -v flock >/dev/null 2>&1; then flock 9; fi`,
        `  if [ -x "${DSOJ_WATCH_BIN}" ] && [ ! "${DSOJ_WATCH_SRC}" -nt "${DSOJ_WATCH_BIN}" ]; then exit 0; fi`,
        `  "${cc}" -O2 -o "$TMP" "${DSOJ_WATCH_SRC}" || exit 1`,
        `  chmod +x "$TMP" 2>/dev/null || true`,
        `  mv -f "$TMP" "${DSOJ_WATCH_BIN}"`,
        `) 9>"${DSOJ_WATCH_LOCK}"`,
        `rm -f "$TMP" 2>/dev/null || true`,
        `[ -x "${DSOJ_WATCH_BIN}" ]`,
      ].join('\n'),
    ],
    { encoding: 'utf8' },
  )

  if (locked.status !== 0) {
    logger.error('编译 dsoj-watch 失败', undefined, {
      stderr: locked.stderr?.slice(0, 500),
      status: locked.status,
    })
    return existsSync(DSOJ_WATCH_BIN)
  }

  try {
    chmodSync(DSOJ_WATCH_BIN, 0o755)
  } catch {
    /* ignore */
  }
  logger.info('dsoj-watch 已编译', { path: DSOJ_WATCH_BIN })
  return true
}
