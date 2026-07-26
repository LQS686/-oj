import { describe, it, expect } from 'vitest'
import { parseBatchRegisterCSV } from '@/lib/user/batch'

describe('parseBatchRegisterCSV', () => {
  it('保留原始文件行号，空白行不计入 users', () => {
    const csv = [
      'username,password,role,email',
      'student1,Password123,STUDENT,a@example.com',
      '',
      'student2,Password456,STUDENT,',
    ].join('\n')

    const { users, parseErrors } = parseBatchRegisterCSV(csv)
    expect(parseErrors).toHaveLength(0)
    expect(users).toHaveLength(2)
    expect(users[0].row).toBe(2)
    expect(users[1].row).toBe(4)
    expect(users[1].email).toBeUndefined()
  })

  it('格式无效行记入 parseErrors 且带正确行号', () => {
    const csv = ['username,password,role', 'onlyusername'].join('\n')
    const { users, parseErrors } = parseBatchRegisterCSV(csv)
    expect(users).toHaveLength(0)
    expect(parseErrors).toHaveLength(1)
    expect(parseErrors[0].row).toBe(2)
  })

  it('缺少必填表头时抛错', () => {
    expect(() => parseBatchRegisterCSV('name,pass\na,b')).toThrow(/username/)
  })
})
