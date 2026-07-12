export interface TestCaseInput {
  input: string
  output: string
  isSample?: boolean
  score?: number
  timeLimit?: number | null
  memoryLimit?: number | null
}
