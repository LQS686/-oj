// 统计 app/api 下所有 route.ts 的行数
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'

const ROOT = 'e:/桌面/oj'
const BASE = join(ROOT, 'app/api')

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const s = statSync(p)
    if (s.isDirectory()) walk(p, out)
    else if (name === 'route.ts') out.push(p)
  }
  return out
}

const files = walk(BASE)
const stats = files
  .map((p) => {
    const lines = readFileSync(p, 'utf8').split('\n').length
    return { path: relative(ROOT, p).replace(/\\/g, '/'), lines }
  })
  .sort((a, b) => b.lines - a.lines)

console.log(`Total: ${stats.length}`)
console.log(`> 200 lines: ${stats.filter((s) => s.lines > 200).length}`)
console.log(`> 150 lines: ${stats.filter((s) => s.lines > 150).length}`)
console.log(`> 100 lines: ${stats.filter((s) => s.lines > 100).length}`)
console.log('---')
for (const s of stats) {
  if (s.lines >= 80) console.log(`${String(s.lines).padStart(4)}  ${s.path}`)
}
