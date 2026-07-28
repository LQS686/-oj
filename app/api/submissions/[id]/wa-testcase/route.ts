/**
 * /api/submissions/[id]/wa-testcase
 * 下载该提交的第一个 WA 测试点（.in + .out ZIP）
 */
import AdmZip from 'adm-zip'
import { withApi, throw400 } from '@/lib/api/withApi'
import { getFirstWaTestCaseForDownload } from '@/lib/submission/service'
import { isObjectId } from '@/lib/api/validation'

export const GET = withApi.auth(async (_req, ctx, { user }) => {
  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的提交ID')

  const data = await getFirstWaTestCaseForDownload(id, user)
  const zip = new AdmZip()
  const base = `wa_${data.caseIndex}`
  zip.addFile(`${base}.in`, Buffer.from(data.input, 'utf8'))
  zip.addFile(`${base}.out`, Buffer.from(data.output, 'utf8'))

  const filename = data.problemNumber
    ? `${data.problemNumber}_wa${data.caseIndex}.zip`
    : `submission_${id}_wa${data.caseIndex}.zip`
  // RFC 5987：ASCII 回退名消毒，避免 Content-Disposition 注入
  const safeAscii = filename.replace(/[^\w.\-]+/g, '_').slice(0, 120) || 'wa.zip'
  const encoded = encodeURIComponent(filename).replace(/['()]/g, escape)

  const zipBlob = new Blob([new Uint8Array(zip.toBuffer())], { type: 'application/zip' })
  return new Response(zipBlob, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${safeAscii}"; filename*=UTF-8''${encoded}`,
      'Cache-Control': 'no-store',
    },
  })
})
