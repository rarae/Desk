// 一键在 Appwrite 中创建本项目所需的 Database 与 Collection。
// 需要带 databases.write 权限的 API Key（仅服务端使用，不要暴露到前端）。
//
// 运行方式：
//   Linux / macOS:
//     APPWRITE_API_KEY=your_api_key npm run setup
//   Windows PowerShell:
//     $env:APPWRITE_API_KEY="your_api_key"; npm run setup
//
// 说明：
//   - 本脚本使用 node-appwrite（Node 服务端 SDK），它提供 setKey 与数据库/集合管理 API。
//   - 前端的 appwrite（Web SDK）只暴露文档级方法，不用于本脚本。
//   - 若项目已达数据库额度上限，会自动复用第一个已存在的数据库，并在结尾提示其 ID。
//
// 可通过环境变量覆盖默认值：
//   APPWRITE_ENDPOINT / APPWRITE_PROJECT_ID / APPWRITE_DATABASE_ID / APPWRITE_COLLECTION_ID

import { Client, Databases, Permission, Role } from 'node-appwrite'

const endpoint = process.env.APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1'
const projectId = process.env.APPWRITE_PROJECT_ID || '6ae56fa7002810da5586'
const apiKey = process.env.APPWRITE_API_KEY
const databaseId = process.env.APPWRITE_DATABASE_ID || 'todos_db'
const collectionId = process.env.APPWRITE_COLLECTION_ID || 'todos'

if (!apiKey) {
  console.error('✗ 缺少 APPWRITE_API_KEY。请在 Appwrite 控制台 API Keys 中创建一个具备 databases.write 权限的密钥，并通过环境变量传入。')
  process.exit(1)
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
const databases = new Databases(client)

// 冲突（已存在）时静默跳过；其它错误抛出
const skipIfExists = (e, msg) => {
  if (e?.code === 409) console.log(`· ${msg}（已存在，跳过）`)
  else throw e
}

// 确保拿到一个可用的 databaseId：优先使用指定的 ID，不存在则创建；
// 若创建因额度受限失败，则复用第一个已存在的数据库。
async function ensureDatabase() {
  // 1) 指定的 ID 是否已存在
  try {
    await databases.get(databaseId)
    console.log('✓ 数据库已存在：', databaseId)
    return databaseId
  } catch (e) {
    if (e?.code !== 404) throw e
  }
  // 2) 尝试创建
  try {
    await databases.create(databaseId, 'Todo Database')
    console.log('✓ 数据库已创建：', databaseId)
    return databaseId
  } catch (e) {
    if (e?.code === 409) {
      console.log('· 数据库已存在，跳过')
      return databaseId
    }
    if (e?.message?.includes('maximum number')) {
      const list = await databases.list()
      const existing = list.databases[0]
      if (existing) {
        console.log('· 数据库额度已满，复用现有数据库：', existing.$id)
        return existing.$id
      }
    }
    throw e
  }
}

async function main() {
  const dbId = await ensureDatabase()

  try {
    await databases.getCollection(dbId, collectionId)
    console.log('✓ 集合已存在：', collectionId)
  } catch (e) {
    if (e?.code !== 404) throw e
    try {
      await databases.createCollection(dbId, collectionId, 'Todos', [
        Permission.create(Role.users()), // 匿名用户属 users，需此权限才能创建文档
      ])
      console.log('✓ 集合已创建：', collectionId)
    } catch (e2) {
      skipIfExists(e2, '集合')
    }
  }

  const attrs = [
    ['title', () => databases.createStringAttribute(dbId, collectionId, 'title', 256, true)],
    // 注意：required=true 的属性不能设置 default，否则 Appwrite 会拒绝
    ['completed', () => databases.createBooleanAttribute(dbId, collectionId, 'completed', true)],
    ['userId', () => databases.createStringAttribute(dbId, collectionId, 'userId', 64, true)],
  ]
  for (const [name, fn] of attrs) {
    try {
      await fn()
      console.log(`✓ 属性已添加：${name}`)
    } catch (e) {
      skipIfExists(e, `属性 ${name}`)
    }
  }

  try {
    await databases.createIndex(dbId, collectionId, 'userId', 'key', ['userId'])
    console.log('✓ 索引已添加：userId')
  } catch (e) {
    skipIfExists(e, '索引 userId')
  }

  // ---- 麻将计分记录集合 ----
  const mId = 'mahjong_rounds'
  try {
    await databases.getCollection(dbId, mId)
    console.log('✓ 集合已存在：', mId)
  } catch (e) {
    if (e?.code !== 404) throw e
    try {
      await databases.createCollection(dbId, mId, 'Mahjong Rounds', [
        Permission.read(Role.any()), // 任何人可查历史记录
        Permission.create(Role.any()), // 打开即用，无需登录即可记分
      ])
      console.log('✓ 集合已创建：', mId)
    } catch (e2) {
      skipIfExists(e2, '集合 ' + mId)
    }
  }
  const mAttrs = [
    ['gameId', () => databases.createStringAttribute(dbId, mId, 'gameId', 64, true)],
    ['roundNo', () => databases.createIntegerAttribute(dbId, mId, 'roundNo', true)],
    ['playerEast', () => databases.createStringAttribute(dbId, mId, 'playerEast', 64, true)],
    ['playerSouth', () => databases.createStringAttribute(dbId, mId, 'playerSouth', 64, true)],
    ['playerWest', () => databases.createStringAttribute(dbId, mId, 'playerWest', 64, true)],
    ['playerNorth', () => databases.createStringAttribute(dbId, mId, 'playerNorth', 64, true)],
    ['scoreEast', () => databases.createIntegerAttribute(dbId, mId, 'scoreEast', true)],
    ['scoreSouth', () => databases.createIntegerAttribute(dbId, mId, 'scoreSouth', true)],
    ['scoreWest', () => databases.createIntegerAttribute(dbId, mId, 'scoreWest', true)],
    ['scoreNorth', () => databases.createIntegerAttribute(dbId, mId, 'scoreNorth', true)],
  ]
  for (const [name, fn] of mAttrs) {
    try {
      await fn()
      console.log(`✓ 属性已添加：${name}`)
    } catch (e) {
      skipIfExists(e, `属性 ${name}`)
    }
  }

  console.log('\n✅ 初始化完成！现在可以运行：npm run dev')
  if (dbId !== databaseId) {
    console.log(`\n⚠ 注意：前端 .env 中的 VITE_APPWRITE_DATABASE_ID 当前为 "${databaseId}"，`)
    console.log(`   但实际使用的是 "${dbId}"。请把 .env 的该项改为 "${dbId}" 再启动前端。`)
  }
}

main().catch((e) => {
  console.error('✗ 出错了：', e?.message || e)
  process.exit(1)
})
