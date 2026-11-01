import { Client, Account, Databases, ID, Query, Permission, Role } from 'appwrite'

const endpoint = import.meta.env.VITE_APPWRITE_ENDPOINT
const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID
const databaseId = import.meta.env.VITE_APPWRITE_DATABASE_ID
const collectionId = import.meta.env.VITE_APPWRITE_TODO_COLLECTION_ID
const mahjongCollectionId = import.meta.env.VITE_APPWRITE_MAHJONG_COLLECTION_ID

if (!endpoint || !projectId) {
  console.error(
    '[appwrite] 缺少环境变量，请在 .env 中配置 VITE_APPWRITE_ENDPOINT 和 VITE_APPWRITE_PROJECT_ID'
  )
}

const client = new Client()
  .setEndpoint(endpoint)
  .setProject(projectId)

export const account = new Account(client)
export const databases = new Databases(client)

export { ID, Query, Permission, Role, databaseId, collectionId, mahjongCollectionId }
export default client
