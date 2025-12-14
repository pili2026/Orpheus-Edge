/**
 * i18n Composable
 * Supports internationalization features
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
