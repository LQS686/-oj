import { prisma } from '../lib/prisma'

async function main() {
  const cases = await prisma.testCase.findMany({
    where: { problemId: '6a66d1b3bd02ba5bef2a7a74' },
    select: { orderIndex: true, input: true, output: true },
    orderBy: { orderIndex: 'asc' },
  })
  for (const c of cases) {
    const inNl = (c.input.match(/\n/g) || []).length
    const outNl = (c.output.match(/\n/g) || []).length
    const inSample = JSON.stringify(c.input.slice(0, 60))
    const outSample = JSON.stringify(c.output.slice(0, 60))
    console.log({
      order: c.orderIndex,
      inLen: c.input.length,
      outLen: c.output.length,
      inNl,
      outNl,
      inSample,
      outSample,
    })
  }
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
