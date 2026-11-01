import { ref } from 'vue'
import { account } from '../lib/appwrite'

// 模块级单例：所有组件共享同一份登录状态
const user = ref(null)
const loading = ref(false)
const error = ref(null)

export function useAuth() {
  // 初始化时尝试恢复已有会话
  async function init() {
    loading.value = true
    error.value = null
    try {
      user.value = await account.get()
    } catch {
      user.value = null
    } finally {
      loading.value = false
    }
  }

  // 匿名登录：无需邮箱密码，直接创建一个匿名会话
  async function loginAnonymously() {
    loading.value = true
    error.value = null
    try {
      await account.createAnonymousSession()
      user.value = await account.get()
    } catch (e) {
      error.value = e?.message || '匿名登录失败'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function logout() {
    error.value = null
    try {
      await account.deleteSession('current')
      user.value = null
    } catch (e) {
      error.value = e?.message || '退出失败'
    }
  }

  return { user, loading, error, init, loginAnonymously, logout }
}
