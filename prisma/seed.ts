import { MongoClient, ObjectId } from 'mongodb'
import bcrypt from 'bcryptjs'
import { logger } from '../lib/logger'

const url = process.env.DATABASE_URL || 'mongodb://localhost:27017/oj_platform'

async function main() {
  logger.info('开始填充种子数据...')
  
  const client = new MongoClient(url)
  
  try {
    await client.connect()
    logger.info('已连接到 MongoDB')
    
    const db = client.db()
    
    logger.info('清空现有数据...')
    await db.collection('User').deleteMany({})
    await db.collection('Problem').deleteMany({})
    await db.collection('TestCase').deleteMany({})
    await db.collection('Submission').deleteMany({})
    await db.collection('Contest').deleteMany({})
    await db.collection('ContestProblem').deleteMany({})
    await db.collection('ContestParticipant').deleteMany({})
    await db.collection('Post').deleteMany({})
    await db.collection('Comment').deleteMany({})
    await db.collection('Training').deleteMany({})
    await db.collection('TrainingProblem').deleteMany({})
    await db.collection('Achievement').deleteMany({})

    // 创建管理员用户
    const adminPassword = await bcrypt.hash('admin123', 10)
    const adminResult = await db.collection('User').insertOne({
      username: 'admin',
      email: 'admin@oj.com',
      password: adminPassword,
      nickname: '系统管理员',
      bio: '平台管理员账号',
      rating: 3000,
      rank: '传奇',
      color: '#dc2626',
      isAdmin: true,
      isBanned: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    const adminId = adminResult.insertedId

    logger.info('创建管理员用户: admin')

    // 创建测试用户
    const testUsers: any[] = []
    const ratings = [1200, 1400, 1600, 1900, 2100, 2400, 2600, 2800, 3000, 3200]
    const ranks = ['新手', '绿名', '蓝名', '黄名', '紫名', '红名', '红名', '红名', '传奇', '传奇']
    const colors = ['#808080', '#22c55e', '#3b82f6', '#f59e0b', '#9333ea', '#dc2626', '#dc2626', '#dc2626', '#dc2626', '#dc2626']

    for (let i = 1; i <= 10; i++) {
      const password = await bcrypt.hash('user123', 10)
      
      const result = await db.collection('User').insertOne({
        username: `user${i}`,
        email: `user${i}@oj.com`,
        password,
        nickname: `测试用户${i}`,
        bio: `这是测试用户${i}的个人简介`,
        rating: ratings[i - 1],
        rank: ranks[i - 1],
        color: colors[i - 1],
        isAdmin: false,
        isBanned: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      testUsers.push({ _id: result.insertedId, username: `user${i}` })
    }

    logger.info(`创建${testUsers.length}个测试用户`)

    // 创建题目
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
        authorId: adminId,
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
        authorId: adminId,
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
        authorId: adminId,
      },
      {
        title: '方格取数',
        description: '在一个 n×n 的方格棋盘上，每个方格中有一个数字。从左上角走到右下角，只能向右或向下走，求能取到的最大数字和。',
        input: '第一行一个整数 n，接下来 n 行每行 n 个整数。',
        output: '输出最大和。',
        samples: [
          { input: '3\n1 2 3\n4 5 6\n7 8 9', output: '29' },
        ],
        difficulty: '普及+',
        tags: ['动态规划', '递归'],
        timeLimit: 1000,
        memoryLimit: 128,
        isPublic: true,
        authorId: adminId,
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
        authorId: adminId,
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

    // 创建竞赛
    const contestResult = await db.collection('Contest').insertOne({
      title: '新手赛 2024.10',
      description: '适合新手参加的比赛，包含基础题目。',
      type: 'OI',
      startTime: new Date('2024-10-25T14:00:00'),
      endTime: new Date('2024-10-25T17:00:00'),
      duration: 180,
      isPublic: true,
      authorId: adminId,
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

    // 创建讨论帖子
    const posts = [
      {
        title: '新人报到，请多关照',
        content: '大家好，我是新来的，希望能在这里学到很多东西！',
        type: 'discussion',
        tags: ['灌水'],
        authorId: testUsers[0]._id,
        views: Math.floor(Math.random() * 5000),
        likes: Math.floor(Math.random() * 200),
        isPinned: false,
        isLocked: false,
      },
      {
        title: '关于动态规划的学习心得',
        content: '最近学习了动态规划，总结了一些心得，希望对大家有帮助...',
        type: 'discussion',
        tags: ['学习', '动态规划'],
        authorId: testUsers[1]._id,
        views: Math.floor(Math.random() * 5000),
        likes: Math.floor(Math.random() * 200),
        isPinned: true,
        isLocked: false,
      },
      {
        title: 'A+B Problem 题解',
        content: '这道题很简单，直接输入输出即可。',
        type: 'discussion',
        tags: ['题解'],
        authorId: adminId,
        views: Math.floor(Math.random() * 5000),
        likes: Math.floor(Math.random() * 200),
        isPinned: false,
        isLocked: false,
      },
    ]

    for (const post of posts) {
      await db.collection('Post').insertOne({
        ...post,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    }

    logger.info(`创建${posts.length}个讨论帖子`)

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

    logger.info('种子数据填充完成')
    logger.info('登录信息：')
    logger.info('管理员账号: admin / admin123')
    logger.info('测试账号: user1~user10 / user123')
    
  } catch (error) {
    logger.error('种子数据填充错误', error)
    process.exit(1)
  } finally {
    await client.close()
    logger.info('已断开 MongoDB 连接')
  }
}

main()
