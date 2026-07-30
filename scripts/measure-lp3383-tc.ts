import { prisma } from '../lib/prisma'

async function main() {
  const p = await prisma.problem.findFirst({
    where: { OR: [{ problemNumber: 'LP3383' }, { id: '6a66d1b3bd02ba5bef2a7a74' }] },
    select: { id: true, problemNumber: true, title: true },
  })
  console.info('problem', p)
  if (!p) return

  const cases = await prisma.testCase.findMany({
    where: { problemId: p.id },
    select: { id: true, score: true, orderIndex: true, isSample: true },
    orderBy: { orderIndex: 'asc' },
  })
  console.info('count', cases.length)

  for (const c of cases) {
    const full = await prisma.testCase.findUnique({
      where: { id: c.id },
      select: { input: true, output: true },
    })
    const inB = Buffer.byteLength(full?.input ?? '', 'utf8')
    const outB = Buffer.byteLength(full?.output ?? '', 'utf8')
    console.info({
      order: c.orderIndex,
      sample: c.isSample,
      inputMB: +(inB / 1048576).toFixed(2),
      outputMB: +(outB / 1048576).toFixed(2),
      inChars: full?.input?.length ?? 0,
      outChars: full?.output?.length ?? 0,
    })
  }

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
