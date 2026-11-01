import { ref } from 'vue'
import {
  account,
  databases,
  ID,
  Query,
  Permission,
  Role,
  databaseId,
  collectionId
} from '../lib/appwrite'

const todos = ref([])
const loading = ref(false)
const error = ref(null)

export function useTodos() {
  async function load() {
    loading.value = true
    error.value = null
    try {
      const me = await account.get()
      const res = await databases.listDocuments(databaseId, collectionId, [
        Query.equal('userId', me.$id),
        Query.orderDesc('$createdAt')
      ])
      todos.value = res.documents
    } catch (e) {
      error.value = e?.message || '加载失败'
    } finally {
      loading.value = false
    }
  }

  async function add(title) {
    const me = await account.get()
    const doc = await databases.createDocument(
      databaseId,
      collectionId,
      ID.unique(),
      { title, completed: false, userId: me.$id },
      [
        // 文档级权限：仅本人可读/改/删
        Permission.read(Role.user(me.$id)),
        Permission.update(Role.user(me.$id)),
        Permission.delete(Role.user(me.$id))
      ]
    )
    todos.value.unshift(doc)
    return doc
  }

  async function toggle(doc) {
    const updated = await databases.updateDocument(databaseId, collectionId, doc.$id, {
      completed: !doc.completed
    })
    const idx = todos.value.findIndex((t) => t.$id === doc.$id)
    if (idx !== -1) todos.value[idx] = updated
  }

  async function remove(docId) {
    await databases.deleteDocument(databaseId, collectionId, docId)
    todos.value = todos.value.filter((t) => t.$id !== docId)
  }

  return { todos, loading, error, load, add, toggle, remove }
}
