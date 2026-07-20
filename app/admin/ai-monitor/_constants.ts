export const PAGE_SIZE = 20

export const STATUS_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '', label: '全部' },
  { value: 'PENDING', label: 'PENDING' },
  { value: 'PROCESSING', label: 'PROCESSING' },
  { value: 'COMPLETED', label: 'COMPLETED' },
  { value: 'FAILED', label: 'FAILED' },
]
