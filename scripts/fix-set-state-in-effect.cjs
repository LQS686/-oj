/**
 * Convert useEffect → useDeferredEffect at lines flagged by set-state-in-effect.
 * Usage: node scripts/fix-set-state-in-effect.cjs
 */
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

let raw
try {
  raw = execSync('npx eslint . -f json', {
    maxBuffer: 120 * 1024 * 1024,
    encoding: 'utf8',
  })
} catch (e) {
  raw = e.stdout
}

const report = JSON.parse(raw)
const byFile = new Map()

for (const f of report) {
  for (const m of f.messages) {
    if (m.ruleId !== 'react-hooks/set-state-in-effect') continue
    if (!byFile.has(f.filePath)) byFile.set(f.filePath, new Set())
    byFile.get(f.filePath).add(m.line)
  }
}

function findUseEffectStart(lines, targetLine1Based) {
  // Walk up from target line to find "useEffect(" (possibly with assignment)
  for (let i = targetLine1Based - 1; i >= 0; i--) {
    if (/\buseEffect\s*\(/.test(lines[i]) && !/\buseDeferredEffect\s*\(/.test(lines[i])) {
      return i
    }
  }
  return -1
}

let filesChanged = 0
let effectsConverted = 0

for (const [filePath, lineSet] of byFile) {
  const original = fs.readFileSync(filePath, 'utf8')
  const lines = original.split('\n')
  const starts = new Set()
  for (const line of lineSet) {
    const start = findUseEffectStart(lines, line)
    if (start >= 0) starts.add(start)
  }
  if (starts.size === 0) continue

  for (const start of starts) {
    lines[start] = lines[start].replace(/\buseEffect\s*\(/, 'useDeferredEffect(')
    effectsConverted++
  }

  let next = lines.join('\n')

  // Ensure import
  if (!next.includes("from '@/hooks/useDeferredEffect'") && !next.includes('from "@/hooks/useDeferredEffect"')) {
    // After first react import block line
    const reactImport = next.match(/^import\s+[^;]+from\s+['"]react['"]\s*;?\s*$/m)
    if (reactImport) {
      next = next.replace(
        reactImport[0],
        `${reactImport[0]}\nimport { useDeferredEffect } from '@/hooks/useDeferredEffect'`
      )
    } else {
      next = `import { useDeferredEffect } from '@/hooks/useDeferredEffect'\n` + next
    }
  }

  // Drop unused useEffect import if no longer referenced
  if (!/\buseEffect\b/.test(next.replace(/from ['"]react['"]/, ''))) {
    // careful: still in import from react
  }
  // Clean useEffect from react import if unused elsewhere
  const bodyWithoutImport = next.replace(/import\s+\{[^}]+\}\s+from\s+['"]react['"]\s*;?/, '')
  if (!/\buseEffect\b/.test(bodyWithoutImport)) {
    next = next.replace(/import\s+\{([^}]+)\}\s+from\s+['"]react['"]/, (_, inner) => {
      const parts = inner
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .filter((p) => p !== 'useEffect' && !p.startsWith('useEffect '))
      return `import { ${parts.join(', ')} } from 'react'`
    })
  }

  if (next !== original) {
    fs.writeFileSync(filePath, next)
    filesChanged++
    console.log('updated', path.relative(process.cwd(), filePath), 'effects=', starts.size)
  }
}

console.log(JSON.stringify({ filesChanged, effectsConverted }, null, 2))
