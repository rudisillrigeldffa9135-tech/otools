import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getTool } from '@/tools/registry'
import { currentUserTag } from '@/utils/user-storage'

const RECENT_LIMIT = 8

interface UserTools {
  favorites: string[]
  recents: string[]
}

/**
 * 收藏与最近使用，持久化到本地存储。
 * 按用户分开保存：同一台设备换账号登录时互不可见。
 */
export const useToolStore = defineStore(
  'tool',
  () => {
    const byUser = ref<Record<string, UserTools>>({})

    function bucket() {
      const tag = currentUserTag()
      if (!byUser.value[tag])
        byUser.value[tag] = { favorites: [], recents: [] }
      return byUser.value[tag]
    }

    const favoriteIds = computed(() => byUser.value[currentUserTag()]?.favorites ?? [])
    const recentIds = computed(() => byUser.value[currentUserTag()]?.recents ?? [])

    // 过滤掉已下线或当前平台不可用的工具
    const favorites = computed(() => favoriteIds.value.map(getTool).filter(t => !!t))
    const recents = computed(() => recentIds.value.map(getTool).filter(t => !!t))

    function isFavorite(id: string) {
      return favoriteIds.value.includes(id)
    }

    function toggleFavorite(id: string) {
      const b = bucket()
      b.favorites = isFavorite(id) ? b.favorites.filter(i => i !== id) : [id, ...b.favorites]
    }

    function addRecent(id: string) {
      const b = bucket()
      b.recents = [id, ...b.recents.filter(i => i !== id)].slice(0, RECENT_LIMIT)
    }

    function clearRecent() {
      bucket().recents = []
    }

    return { byUser, favoriteIds, recentIds, favorites, recents, isFavorite, toggleFavorite, addRecent, clearRecent }
  },
  {
    // 旧版本的 favoriteIds / recentIds 不区分用户，升级后不再读取
    persist: {
      paths: ['byUser'],
    },
  },
)
