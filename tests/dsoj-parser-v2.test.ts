/**
 * DSOJ 题包解析器回归：对照参考资源 dsoj-pack.zip（v2）与 YAML 边界情况
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import AdmZip from 'adm-zip'
import { parseDsojZip, isDsojPack } from '@/lib/problem/import/dsoj-parser'

const REF_PACK = path.join(process.cwd(), '参考资源', 'dsoj-pack.zip')

describe('parseDsojZip v2', () => {
  it('识别参考题包为 dsoj-pack', () => {
    if (!fs.existsSync(REF_PACK)) return
    const buf = fs.readFileSync(REF_PACK)
    expect(isDsojPack(buf)).toBe(true)
  })

  it('按 index.json 顺序解析参考 dsoj-pack.zip，并导入题解、忽略 quality.json', () => {
    if (!fs.existsSync(REF_PACK)) return
    const buf = fs.readFileSync(REF_PACK)
    const problems = parseDsojZip(buf)

    expect(problems.length).toBeGreaterThanOrEqual(2)
    expect(problems[0].problemNumber).toBe('LB3834')
    expect(problems[0].externalId).toBe('B3834')
    expect(problems[0].visibility).toBe('public')
    expect(problems[0].title).toContain('长方形面积')
    expect(problems[0].testCases.length).toBeGreaterThanOrEqual(10)
    expect(problems[0].samples.length).toBeGreaterThanOrEqual(1)
    expect(problems[0].solutions?.length).toBeGreaterThanOrEqual(1)
    expect(problems[0].difficulty).toBe('入门')
    expect(problems[0].tags).toContain('GESP')

    const last = problems[problems.length - 1]
    expect(last.problemNumber).toBe('LP1003')
    expect(last.externalId).toBe('P1003')
    expect(last.samples.length).toBeGreaterThanOrEqual(1)
  })

  it('samples/ 与 testcases/ 严格分离：多样例不被吞并进评测点', () => {
    const zip = new AdmZip()
    zip.addFile(
      'pack.yaml',
      Buffer.from(
        `format: dsoj-pack\nversion: 2.0\nproblem_count: 1\nindex: index.json\n`,
        'utf-8'
      )
    )
    zip.addFile(
      'index.json',
      Buffer.from(
        JSON.stringify({
          schema_version: 2,
          problem_count: 1,
          problems: [{ order: 1, pid: 'P1', dir: 'P1', title: 'T' }],
        }),
        'utf-8'
      )
    )
    zip.addFile(
      'problems/P1/problem.yaml',
      Buffer.from(
        `title: Demo\nproblem_number: P1\ndifficulty: 入门\ntime_limit: 1000\nmemory_limit: 128\n`,
        'utf-8'
      )
    )
    zip.addFile('problems/P1/description.md', Buffer.from('# demo problem description here', 'utf-8'))
    // 两组展示样例（含 sampleN 命名，曾被严格正则丢掉）
    zip.addFile('problems/P1/samples/1.in', Buffer.from('sample-in-1\n', 'utf-8'))
    zip.addFile('problems/P1/samples/1.out', Buffer.from('sample-out-1\n', 'utf-8'))
    zip.addFile('problems/P1/samples/sample2.in', Buffer.from('sample-in-2\n', 'utf-8'))
    zip.addFile('problems/P1/samples/sample2.out', Buffer.from('sample-out-2\n', 'utf-8'))
    // 评测点（与样例内容不同）
    zip.addFile('problems/P1/testcases/1.in', Buffer.from('judge-in-1\n', 'utf-8'))
    zip.addFile('problems/P1/testcases/1.out', Buffer.from('judge-out-1\n', 'utf-8'))
    zip.addFile('problems/P1/testcases/2.in', Buffer.from('judge-in-2\n', 'utf-8'))
    zip.addFile('problems/P1/testcases/2.out', Buffer.from('judge-out-2\n', 'utf-8'))
    zip.addFile('problems/P1/testcases/3.in', Buffer.from('judge-in-3\n', 'utf-8'))
    zip.addFile('problems/P1/testcases/3.out', Buffer.from('judge-out-3\n', 'utf-8'))

    const [problem] = parseDsojZip(zip.toBuffer())
    expect(problem.samples).toHaveLength(2)
    expect(problem.samples[0].input).toContain('sample-in-1')
    expect(problem.samples[1].input).toContain('sample-in-2')
    expect(problem.testCases).toHaveLength(3)
    expect(problem.testCases.every((tc) => tc.input.startsWith('judge-'))).toBe(true)
    expect(problem.testCases.every((tc) => tc.isSample === false)).toBe(true)
  })

  it('兼容 Windows 反斜杠路径与一层嵌套 samples/1/in.txt', () => {
    const zip = new AdmZip()
    zip.addFile('pack.yaml', Buffer.from(`format: dsoj-pack\nversion: 2.0\n`, 'utf-8'))
    zip.addFile(
      'problems/P2/problem.yaml',
      Buffer.from(
        `title: Nested\nproblem_number: P2\ndifficulty: 入门\ntime_limit: 1000\nmemory_limit: 128\n`,
        'utf-8'
      )
    )
    zip.addFile('problems/P2/description.md', Buffer.from('# nested samples description ok', 'utf-8'))
    zip.addFile('problems\\P2\\samples\\1\\in.txt', Buffer.from('n1\n', 'utf-8'))
    zip.addFile('problems\\P2\\samples\\1\\out.txt', Buffer.from('n1o\n', 'utf-8'))
    zip.addFile('problems\\P2\\samples\\2\\input.txt', Buffer.from('n2\n', 'utf-8'))
    zip.addFile('problems\\P2\\samples\\2\\output.txt', Buffer.from('n2o\n', 'utf-8'))
    zip.addFile('problems\\P2\\testcases\\1.in', Buffer.from('t1\n', 'utf-8'))
    zip.addFile('problems\\P2\\testcases\\1.out', Buffer.from('t1o\n', 'utf-8'))

    const [problem] = parseDsojZip(zip.toBuffer())
    expect(problem.samples).toHaveLength(2)
    expect(problem.samples[0].input).toBe('n1\n')
    expect(problem.samples[1].output).toBe('n2o\n')
    expect(problem.testCases).toHaveLength(1)
  })

  it('存在 samples/ 时不把 testcases 前两项回填为题面样例', () => {
    const zip = new AdmZip()
    zip.addFile('pack.yaml', Buffer.from(`format: dsoj-pack\nversion: 2.0\n`, 'utf-8'))
    zip.addFile(
      'problems/P3/problem.yaml',
      Buffer.from(
        `title: OnlyOneSample\nproblem_number: P3\ndifficulty: 入门\ntime_limit: 1000\nmemory_limit: 128\n`,
        'utf-8'
      )
    )
    zip.addFile('problems/P3/description.md', Buffer.from('# only one sample description', 'utf-8'))
    zip.addFile('problems/P3/samples/1.in', Buffer.from('only-sample\n', 'utf-8'))
    zip.addFile('problems/P3/samples/1.out', Buffer.from('only-sample-out\n', 'utf-8'))
    zip.addFile('problems/P3/testcases/1.in', Buffer.from('tc1\n', 'utf-8'))
    zip.addFile('problems/P3/testcases/1.out', Buffer.from('tc1o\n', 'utf-8'))
    zip.addFile('problems/P3/testcases/2.in', Buffer.from('tc2\n', 'utf-8'))
    zip.addFile('problems/P3/testcases/2.out', Buffer.from('tc2o\n', 'utf-8'))

    const [problem] = parseDsojZip(zip.toBuffer())
    expect(problem.samples).toHaveLength(1)
    expect(problem.samples[0].input).toBe('only-sample\n')
    expect(problem.testCases).toHaveLength(2)
  })

  it('读取 problem.yaml 的 luogu_pid / visibility，并允许空 samples/.in', () => {
    const zip = new AdmZip()
    zip.addFile('pack.yaml', Buffer.from(`format: dsoj-pack\nversion: 2.0\n`, 'utf-8'))
    zip.addFile(
      'problems/LP9/problem.yaml',
      Buffer.from(
        `schema_version: 2\ntitle: EmptyIn\nproblem_number: LP9\nluogu_pid: P9\nvisibility: public\ndifficulty: 入门\ntime_limit: 1000\nmemory_limit: 128\n`,
        'utf-8'
      )
    )
    zip.addFile('problems/LP9/description.md', Buffer.from('# empty input sample description', 'utf-8'))
    zip.addFile('problems/LP9/samples/1.in', Buffer.from('', 'utf-8'))
    zip.addFile('problems/LP9/samples/1.out', Buffer.from('0\n', 'utf-8'))
    zip.addFile('problems/LP9/testcases/1.in', Buffer.from('', 'utf-8'))
    zip.addFile('problems/LP9/testcases/1.out', Buffer.from('0\n', 'utf-8'))
    zip.addFile('problems/LP9/testcases/1.score', Buffer.from('100', 'utf-8'))

    const [problem] = parseDsojZip(zip.toBuffer())
    expect(problem.problemNumber).toBe('LP9')
    expect(problem.externalId).toBe('P9')
    expect(problem.visibility).toBe('public')
    expect(problem.samples).toHaveLength(1)
    expect(problem.samples[0].input).toBe('')
    expect(problem.testCases[0].score).toBe(100)
  })

  it('兼容单层目录包裹的 ZIP', () => {
    if (!fs.existsSync(REF_PACK)) return
    const inner = new AdmZip(REF_PACK)
    const wrapped = new AdmZip()
    for (const e of inner.getEntries()) {
      if (e.isDirectory) continue
      wrapped.addFile(`dsoj-pack/${e.entryName}`, e.getData())
    }
    const problems = parseDsojZip(wrapped.toBuffer())
    expect(problems.length).toBeGreaterThanOrEqual(2)
    expect(problems[0].problemNumber).toBe('LB3834')
  })

  it('version: 2.0 不被 YAML 数字化误判为不支持', () => {
    const zip = new AdmZip()
    zip.addFile(
      'pack.yaml',
      Buffer.from(
        `format: dsoj-pack\nversion: 2.0\nproblem_count: 1\nindex: index.json\n`,
        'utf-8'
      )
    )
    zip.addFile(
      'index.json',
      Buffer.from(
        JSON.stringify({
          schema_version: 2,
          problem_count: 1,
          problems: [{ order: 1, pid: 'P1', dir: 'P1', title: 'T' }],
        }),
        'utf-8'
      )
    )
    zip.addFile(
      'problems/P1/problem.yaml',
      Buffer.from(
        `title: Demo\nproblem_number: P1\ndifficulty: 入门\ntime_limit: 1000\nmemory_limit: 128\n`,
        'utf-8'
      )
    )
    zip.addFile('problems/P1/description.md', Buffer.from('# demo problem description here', 'utf-8'))
    zip.addFile('problems/P1/testcases/1.in', Buffer.from('1\n', 'utf-8'))
    zip.addFile('problems/P1/testcases/1.out', Buffer.from('1\n', 'utf-8'))

    const problems = parseDsojZip(zip.toBuffer())
    expect(problems).toHaveLength(1)
    expect(problems[0].title).toBe('Demo')
  })
})
