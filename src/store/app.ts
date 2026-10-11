import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export type ThemeMode = 'light' | 'dark' | 'auto'

function getSystemTheme(): 'light' | 'dark' {
  // #ifdef H5
  if (window.matchMedia?.('(prefers-color-scheme: dark)').matches)
    return 'dark'
  return 'light'
  // #endif
  // #ifndef H5
  return (uni.getAppBaseInfo?.().theme as 'light' | 'dark') || 'light'
  // #endif
}

export const useAppStore = defineStore(
  'app',
  () => {
    const themeMode = ref<ThemeMode>('auto')
    const systemTheme = ref(getSystemTheme())

    const isDark = computed(() =>
      themeMode.value === 'auto' ? systemTheme.value === 'dark' : themeMode.value === 'dark',
    )

    function setThemeMode(mode: ThemeMode) {
      themeMode.value = mode
    }

    function toggleDark() {
      themeMode.value = isDark.value ? 'light' : 'dark'
    }

    function syncSystemTheme(theme?: 'light' | 'dark') {
      systemTheme.value = theme || getSystemTheme()
    }

    return { themeMode, isDark, setThemeMode, toggleDark, syncSystemTheme }
  },
  {
    persist: {
      paths: ['themeMode'],
    },
  },
)
