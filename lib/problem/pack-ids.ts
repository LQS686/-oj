/**
 * dsoj-pack 题号约定（v2）
 * 洛谷 P1001 → 包内 pid/目录 LP1001；luogu_pid 为去掉一个前导 L 后的原题号
 */

/** 从包内 pid 推导洛谷原题号：LP1001 → P1001，LB3834 → B3834；非 L 前缀题号原样返回 */
export function deriveLuoguPid(packPid: string | null | undefined): string | undefined {
  const pid = (packPid || '').trim()
  if (!pid) return undefined
  // 仅对「L + 字母开头」的爬虫题号剥前缀；纯数字/短 hash 不当作 luogu_pid
  if (/^L[A-Za-z]/.test(pid)) return pid.slice(1)
  if (/^[A-Za-z]+\d/.test(pid)) return pid
  return undefined
}

/**
 * 导出目录名 / index.pid：优先使用题号；无题号时用 id 前 8 位
 * 不强制加 L 前缀，避免改写站内已有 Pxxxx 题号
 */
export function makePackDirName(problemNumber: string | null | undefined, id: string): string {
  const raw = (problemNumber || '').trim()
  if (raw) return raw
  return id.slice(0, 8).toLowerCase()
}
