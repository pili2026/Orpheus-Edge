/**
 * i18n Composable
 * 提供國際化功能
 */
import { computed } from 'vue'
import { useUIStore } from '@/stores/ui'

export function useI18n() {
  const uiStore = useUIStore()

  return {
    t: computed(() => uiStore.t),
    locale: computed(() => uiStore.locale),
    setLocale: uiStore.setLocale,
    toggleLocale: uiStore.toggleLocale,
  }
}
