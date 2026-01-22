/**
 * i18n Composable (clean)
 * - `t` is a reactive object (Pinia state)
 * - use as `t.xxx` everywhere (NO `t.value`)
 */
import { computed } from 'vue'
import { useUIStore } from '@/stores/ui'
import type { I18nMessages, Locale } from '@/types/i18n'

export function useI18n() {
  const uiStore = useUIStore()

  return {
    // IMPORTANT: expose the reactive object directly
    t: uiStore.t as I18nMessages,
    locale: computed<Locale>(() => uiStore.locale as Locale),
    setLocale: uiStore.setLocale,
    toggleLocale: uiStore.toggleLocale,
  }
}
