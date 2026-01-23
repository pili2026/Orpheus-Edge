/**
 * i18n Composable (clean)
 * - `t` is a reactive object (Pinia state)
 * - use as `t.xxx` everywhere (NO `t.value`)
 */
import { useUIStore } from '@/stores/ui'
import { storeToRefs } from 'pinia'

export function useI18n() {
  const uiStore = useUIStore()
  const { t, locale } = storeToRefs(uiStore)

  return {
    // IMPORTANT: expose the reactive object directly
    t,
    locale,
    setLocale: uiStore.setLocale,
    toggleLocale: uiStore.toggleLocale,
  }
}
