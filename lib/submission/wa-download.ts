/**
 * 下载提交中第一个 WA 测试点（服务端打包 .in/.out）
 */
export async function downloadFirstWaTestCase(submissionId: string): Promise<void> {
  const res = await fetch(`/api/submissions/${submissionId}/wa-testcase`, {
    credentials: 'include',
  })
  if (!res.ok) {
    let message = '下载失败'
    try {
      const data = await res.json()
      message = data?.error?.message || data?.message || message
    } catch {
      // ignore non-json
    }
    throw new Error(message)
  }

  const blob = await res.blob()
  const disposition = res.headers.get('Content-Disposition') || ''
  const match = /filename="([^"]+)"/.exec(disposition)
  const filename = match?.[1] || `wa-testcase.zip`

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** 在 testResults 中定位第一个 WA 的下标；无则返回 -1 */
export function findFirstWaIndex(
  testResults: Array<{ status: string }> | null | undefined
): number {
  if (!testResults?.length) return -1
  return testResults.findIndex((r) => r.status === 'WA')
}
