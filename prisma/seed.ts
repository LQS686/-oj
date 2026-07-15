import { MongoClient } from 'mongodb'
import { logger } from '../lib/logger'

const url = process.env.DATABASE_URL || 'mongodb://localhost:27017/oj_platform'

/**
 * prisma/seed.ts
 * 种子数据填充（用于开发/演示环境）
 *
 * 重要原则：
 *   1. **不创建任何默认账户**（包括管理员/测试用户）
 *      真实部署的第一个用户应通过 /api/auth/register 自动成为 SYSTEM_ADMIN
 *      （见 app/api/auth/register/route.ts 的 isFirstUser 判定）。
 *   2. 仅填充非敏感内容：题目、测试样例、竞赛、训练计划、成就定义等。
 *   3. 若需演示用题目，请运行 `npm run db:seed` 后再手动通过注册接口创建管理员。
 *
 * 安全审计修复（2026-07）：
 *   之前 seed 创建 'admin / admin123' + 10 个 'user1~user10 / user123' 测试账户，
 *   凭据在 README/login 页可见，任何新部署都被攻击者直接登录管理后台。
 *   修复方案：完全移除账户创建，仅保留内容数据填充。
 */
async function main() {
  logger.info('开始填充种子数据...')

  const client = new MongoClient(url)

  try {
    await client.connect()
    logger.info('已连接到 MongoDB')

    const db = client.db()

    logger.info('清空现有内容数据（不动 User 表，避免误删真实账户）...')
    // P0 修复：删除 User 表清空逻辑，避免误删真实账户；
    //   之前 seed.ts 同时清空 User 表，会导致真实部署被覆盖为空。
    //   现在 User 表完全由 API 注册接口管理（首注册用户自动成为 SYSTEM_ADMIN）。
    await db.collection('Problem').deleteMany({})
    await db.collection('TestCase').deleteMany({})
    await db.collection('Submission').deleteMany({})
    await db.collection('Contest').deleteMany({})
    await db.collection('ContestProblem').deleteMany({})
    await db.collection('ContestParticipant').deleteMany({})
    await db.collection('Comment').deleteMany({})
    await db.collection('Training').deleteMany({})
    await db.collection('TrainingProblem').deleteMany({})
    await db.collection('Achievement').deleteMany({})

    // 创建题目（authorId 为可选，真实部署应关联注册后的首个管理员）
    //   P0 修复：不再创建 adminUser 记录；authorId 暂时置 null（admin 用户注册后可通过 API 关联）
    const problems = [
      {
        title: 'A+B Problem',
        description: '给定两个整数 A 和 B，输出它们的和。\n\n这是一道非常简单的题目，用于测试评测系统是否正常工作。',
        input: '输入包含两个整数 A 和 B，用空格分隔。',
        output: '输出一个整数，表示 A + B 的值。',
        samples: [
          { input: '1 2', output: '3', explanation: '1 + 2 = 3' },
          { input: '100 200', output: '300' },
        ],
        hint: '注意数据范围，可能需要使用 long long 类型。',
        difficulty: '入门',
        tags: ['模拟', '入门'],
        timeLimit: 1000,
        memoryLimit: 128,
        isPublic: true,
        authorId: null,
      },
      {
        title: '过河卒',
        description: '在中国象棋中，有一个卒要从 (0,0) 走到 (n,m)，卒只能向右或向下走。棋盘上有一个马在 (x,y)，马可以控制周围8个点。问有多少种走法。',
        input: '输入四个整数 n, m, x, y。',
        output: '输出方案数。',
        samples: [
          { input: '6 6 3 2', output: '17' },
        ],
        difficulty: '普及-',
        tags: ['动态规划', '递推'],
        timeLimit: 1000,
        memoryLimit: 128,
        isPublic: true,
        authorId: null,
      },
      {
        title: '铺地毯',
        description: '给定若干张地毯的信息，求某个点被哪些地毯覆盖。',
        input: '第一行一个整数 n，表示地毯数量。接下来 n 行每行四个整数。',
        output: '输出一个整数，表示最上层地毯的编号。',
        samples: [
          { input: '3\n1 0 2 3\n0 2 3 3\n2 1 3 3\n2 2', output: '3' },
        ],
        difficulty: '普及',
        tags: ['模拟', '枚举'],
        timeLimit: 1000,
        memoryLimit: 128,
        isPublic: true,
        authorId: null,
      },
      {
        title: '方格取数',
        description: '在一个 n×n 的方格棋盘上，每个方格中有一个数字。从左上角走到右下角，只能向右或向下走，求能取到的最大数字和。',
        input: '第一行一个整数 n，接下来 n 行每行 n 个整数。',
        output: '输出最大数字和。',
        samples: [
          { input: '3\n1 2 3\n4 5 6\n7 8 9', output: '29' },
        ],
        difficulty: '普及+',
        tags: ['动态规划', '递归'],
        timeLimit: 1000,
        memoryLimit: 128,
        isPublic: true,
        authorId: null,
      },
      {
        title: '最长上升子序列',
        description: '给定一个长度为 n 的序列，求最长上升子序列的长度。',
        input: '第一行一个整数 n，第二行 n 个整数。',
        output: '输出最长上升子序列的长度。',
        samples: [
          { input: '7\n1 7 3 5 9 4 8', output: '4' },
        ],
        difficulty: '提高',
        tags: ['动态规划', '二分'],
        timeLimit: 1000,
        memoryLimit: 128,
        isPublic: true,
        authorId: null,
      },
    ]

    const createdProblems: any[] = []
    for (let i = 0; i < problems.length; i++) {
      const result = await db.collection('Problem').insertOne({
        ...problems[i],
        totalSubmit: Math.floor(Math.random() * 100000) + 10000,
        totalAccepted: Math.floor(Math.random() * 50000) + 5000,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      createdProblems.push({ _id: result.insertedId, title: problems[i].title })

      // 为每个题目创建测试用例
      await db.collection('TestCase').insertOne({
        problemId: result.insertedId,
        input: '1 2',
        output: '3',
        isSample: true,
        score: 100,
        orderIndex: 1,
        createdAt: new Date(),
      })
    }

    logger.info(`创建${createdProblems.length}个题目`)

    // 创建竞赛（authorId 同样置 null，注册管理员后通过 API 关联）
    const contestResult = await db.collection('Contest').insertOne({
      title: '新手赛 2024.10',
      description: '适合新手参加的比赛，包含基础题目。',
      type: 'OI',
      startTime: new Date('2024-10-25T14:00:00'),
      endTime: new Date('2024-10-25T17:00:00'),
      duration: 180,
      isPublic: true,
      authorId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    const contestId = contestResult.insertedId

    // 添加题目到竞赛
    for (let i = 0; i < 3 && i < createdProblems.length; i++) {
      await db.collection('ContestProblem').insertOne({
        contestId: contestId,
        problemId: createdProblems[i]._id,
        orderIndex: i + 1,
        score: 100,
      })
    }

    logger.info('创建竞赛: 新手赛 2024.10')

    // 创建训练计划
    const trainings = [
      {
        title: '算法入门',
        description: '从零开始学习算法，适合初学者',
        difficulty: '入门',
        isPublic: true,
      },
      {
        title: '动态规划专题',
        description: '系统学习动态规划的各种类型和解题技巧',
        difficulty: '普及+',
        isPublic: true,
      },
    ]

    for (const training of trainings) {
      const result = await db.collection('Training').insertOne({
        ...training,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      // 添加题目到训练
      if (createdProblems.length > 0) {
        await db.collection('TrainingProblem').insertOne({
          trainingId: result.insertedId,
          problemId: createdProblems[0]._id,
          orderIndex: 1,
        })
      }
    }

    logger.info(`创建${trainings.length}个训练计划`)

    // 创建成就
    const achievements = [
      { name: '初来乍到', description: '注册账号', icon: '🎉', condition: 'register' },
      { name: '首次AC', description: '第一次通过题目', icon: '✅', condition: 'first_ac' },
      { name: '刷题狂魔', description: '解决100道题目', icon: '💪', condition: 'solve_100' },
      { name: '竞赛新星', description: '参加第一场比赛', icon: '⭐', condition: 'first_contest' },
    ]

    for (const achievement of achievements) {
      await db.collection('Achievement').insertOne(achievement)
    }

    logger.info(`创建${achievements.length}个成就`)

    logger.info('种子数据填充完成（仅内容数据，未创建任何账户）')
    logger.info('提示：')
    logger.info('  - 部署完成后，第一个访问 /api/auth/register 注册的用户将自动成为 SYSTEM_ADMIN')
    logger.info('  - 通过注册创建管理员后，可在后台将 seed 创建的题目/竞赛的 authorId 关联到该用户')

  } catch (error) {
    logger.error('种子数据填充错误', error)
    process.exit(1)
  } finally {
    await client.close()
    logger.info('已断开 MongoDB 连接')
  }
}

main()