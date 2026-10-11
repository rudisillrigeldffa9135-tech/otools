import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getTool } from '@/tools/registry'

const RECENT_LIMIT = 8

/** 收藏与最近使用，持久化到本地存储 */
export const useToolStore = defineStore(
  'tool',
  () => {
    const favoriteIds = ref<string[]>([])
    const recentIds = ref<string[]>([])

    // 过滤掉已下线或当前平台不可用的工具
    const favorites = computed(() => favoriteIds.value.map(getTool).filter(t => !!t))
    const recents = computed(() => recentIds.value.map(getTool).filter(t => !!t))

    function isFavorite(id: string) {
      return favoriteIds.value.includes(id)
    }

    function toggleFavorite(id: string) {
      favoriteIds.value = isFavorite(id)
        ? favoriteIds.value.filter(i => i !== id)
        : [id, ...favoriteIds.value]
    }

    function addRecent(id: string) {
      recentIds.value = [id, ...recentIds.value.filter(i => i !== id)].slice(0, RECENT_LIMIT)
    }

    function clearRecent() {
      recentIds.value = []
    }

    return { favoriteIds, recentIds, favorites, recents, isFavorite, toggleFavorite, addRecent, clearRecent }
  },
  {
    persist: {
      paths: ['favoriteIds', 'recentIds'],
    },
  },
)
