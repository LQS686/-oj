// MongoDB 初始化脚本
// 创建数据库用户和初始数据
// 密码通过环境变量传入，无默认值

// ---------------------------------------------------------
// 副本集初始化（幂等）
// mongo 以 --replSet rs0 启动，但首次启动若不 initiate 会拒绝写入；
// 且项目多处依赖 prisma.$transaction，事务必须在副本集上运行。
// 重复执行不报错：已 initiate 时 rs.status() 直接成功。
// ---------------------------------------------------------
try {
  rs.status()
  print('[INFO] 副本集 rs0 已初始化')
} catch (e) {
  // 未初始化时 rs.status() 抛错（如 "not yet initialized" / "no replset config"）
  print('[INFO] 副本集尚未初始化，开始 rs.initiate...')
  rs.initiate({
    _id: 'rs0',
    members: [{ _id: 0, host: 'mongo:27017' }]
  })
  print('[INFO] rs.initiate 已发起，等待 PRIMARY...')
}

// 等待节点成为 PRIMARY（可写），否则后续 createUser/createCollection 会失败
let waited = 0
while (!db.hello().isWritablePrimary) {
  if (waited === 0) {
    print('[INFO] 等待节点升级为 PRIMARY...')
  }
  sleep(1000)
  waited++
  if (waited > 60) {
    throw new Error('等待副本集 PRIMARY 超时（60s），init-mongo.js 终止')
  }
}
print('[SUCCESS] 副本集已就绪，当前节点为 PRIMARY')

const dbName = 'oj_platform'

const db = db.getSiblingDB(dbName)

const rootUser = process.env.MONGO_INITDB_ROOT_USERNAME || 'admin'
const rootPwd = process.env.MONGO_INITDB_ROOT_PASSWORD
if (!rootPwd) {
  throw new Error('MONGO_INITDB_ROOT_PASSWORD 环境变量未设置')
}

const appUser = process.env.MONGO_APP_USER || 'ojuser'
const appPwd = process.env.MONGO_APP_PASSWORD
if (!appPwd) {
  throw new Error('MONGO_APP_PASSWORD 环境变量未设置')
}

try {
  db.createUser({
    user: appUser,
    pwd: appPwd,
    roles: [
      { role: 'readWrite', db: dbName }
    ]
  })
  print(`[SUCCESS] 数据库用户 '${appUser}' 创建成功`)
} catch (error) {
  if (error.code === 51003) {
    print(`[INFO] 数据库用户 '${appUser}' 已存在`)
  } else {
    print(`[ERROR] 创建数据库用户 '${appUser}' 失败: ${error}`)
  }
}

try {
  db.createCollection('User')
  db.createCollection('Problem')
  db.createCollection('Submission')
  db.createCollection('Contest')
  db.createCollection('Post')
  db.createCollection('Class')
  db.createCollection('ClassMember')
  db.createCollection('ClassAssignment')
  db.createCollection('ClassAssignmentSubmission')
  db.createCollection('SystemSettings')
  db.createCollection('AiGenerationLog')
  db.createCollection('AiModelConfig')
  db.createCollection('AiProvider')
  print('[SUCCESS] 数据库集合创建成功')
} catch (error) {
  print(`[ERROR] 创建集合失败: ${error}`)
}

db.User.createIndex({ email: 1 }, { unique: true, sparse: true })
db.User.createIndex({ username: 1 }, { unique: true })
db.Problem.createIndex({ problemNumber: 1 }, { unique: true })
db.Problem.createIndex({ tags: 1 })
db.Problem.createIndex({ difficulty: 1 })
db.Submission.createIndex({ userId: 1, problemId: 1 })
db.Submission.createIndex({ createdAt: -1 })
db.Contest.createIndex({ startTime: 1, endTime: 1 })
db.Contest.createIndex({ authorId: 1 })

print(`[SUCCESS] 数据库 '${dbName}' 初始化完成`)
