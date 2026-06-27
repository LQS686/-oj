export interface ProblemPickItem {
  id: string
  problemNumber: string
  title: string
  difficulty: string
  tags?: string[]
}

/** 解析题号输入：P1001, P1002 或 1001,1002 */
export function parseProblemNumberTokens(raw: string): string[] {
  return raw
    .split(/[,，\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((token) => {
      const upper = token.toUpperCase()
      if (/^P\d+$/i.test(upper)) return upper
      if (/^\d+$/.test(token)) return `P${token}`
      return upper
    })
}

export function normalizeProblemNumber(num: string | undefined | null): string {
  if (!num) return ''
  const t = num.trim().toUpperCase()
  if (/^P\d+$/i.test(t)) return t
  if (/^\d+$/.test(t)) return `P${t}`
  return t
}

const byNumber = (problems: ProblemPickItem[]) => {
  const map = new Map<string, ProblemPickItem>()
  for (const p of problems) {
    const key = normalizeProblemNumber(p.problemNumber)
    if (key) map.set(key, p)
  }
  return map
}

/** 按输入题号顺序批量加入（已存在则跳过，保持原顺序） */
export function addProblemsByNumbers(
  orderedIds: string[],
  allProblems: ProblemPickItem[],
  input: string
): { ids: string[]; notFound: string[]; added: number } {
  const tokens = parseProblemNumberTokens(input)
  const map = byNumber(allProblems)
  const ids = [...orderedIds]
  const notFound: string[] = []
  let added = 0
  const idSet = new Set(ids)

  for (const token of tokens) {
    const problem = map.get(token)
    if (!problem) {
      notFound.push(token)
      continue
    }
    if (idSet.has(problem.id)) continue
    ids.push(problem.id)
    idSet.add(problem.id)
    added += 1
  }

  return { ids, notFound, added }
}

export function toggleProblemInOrder(orderedIds: string[], problemId: string, selected: boolean): string[] {
  if (selected) {
    if (orderedIds.includes(problemId)) return orderedIds
    return [...orderedIds, problemId]
  }
  return orderedIds.filter((id) => id !== problemId)
}

export function moveProblemInOrder(orderedIds: string[], index: number, direction: 'up' | 'down'): string[] {
  const next = [...orderedIds]
  const j = direction === 'up' ? index - 1 : index + 1
  if (j < 0 || j >= next.length) return orderedIds
  ;[next[index], next[j]] = [next[j], next[index]]
  return next
}

export function removeProblemFromOrder(orderedIds: string[], problemId: string): string[] {
  return orderedIds.filter((id) => id !== problemId)
}

export function orderProblemsByIds(
  allProblems: ProblemPickItem[],
  orderedIds: string[]
): ProblemPickItem[] {
  const map = new Map(allProblems.map((p) => [p.id, p]))
  return orderedIds.map((id) => map.get(id)).filter(Boolean) as ProblemPickItem[]
}