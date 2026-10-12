/**
 * 按用户隔离的本地存储：同一台设备换账号登录时，互相看不到对方在本机留下的数据。
 * 键名形如 `ot-notes-draft@u3`；未登录时使用 `@guest`。
 */
import { useUserStore } from '@/store/user'

/** 含个人内容、退出登录时要清掉的键 */
const SENSITIVE_KEYS = ['ot-notes-draft', 'ot-dns-history']
/** 只是偏好设置，按用户区分即可，退出登录时保留 */
const PREFERENCE_KEYS = ['ot-currency-favorites', 'ot-currency-base']

export function currentUserTag(userId = useUserStore().userInfo.userId) {
  return userId && userId > 0 ? `u${userId}` : 'guest'
}

export function userKey(key: string, userId?: number) {
  return `${key}@${currentUserTag(userId)}`
}

/**
 * 退出登录时调用：删除该用户在本机的个人内容（未保存的便签草稿、DNS 查询记录），
 * 以及旧版本留下的、没有按用户区分的数据
 */
export function clearUserLocalData(userId: number) {
  try {
    for (const key of SENSITIVE_KEYS) {
      uni.removeStorageSync(userKey(key, userId))
      uni.removeStorageSync(key)
    }
    for (const key of PREFERENCE_KEYS)
      uni.removeStorageSync(key)
  }
  catch {}
}
