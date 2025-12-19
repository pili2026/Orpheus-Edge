/**
 * UI Store - TypeScript Typing Revision
 * Manages UI state (language, theme, i18n, etc.)
 */
import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { Language } from '@/types'
import type { I18nMessages } from '@/types/i18n'

import zhTW from '@/locales/zh-TW'
import en from '@/locales/en'

export const useUIStore = defineStore('ui', () => {
  // ==================== State ====================

  const language = ref<Language>('zh-TW')
  const isMobile = ref<boolean>(false)
  const sidebarCollapsed = ref<boolean>(false)

  // Language message map
  const messages: Record<Language, I18nMessages> = {
    'zh-TW': zhTW,
    en: en,
  }

  // ==================== Computed ====================

  const isSmallScreen = computed<boolean>(() => {
    return isMobile.value || window.innerWidth < 768
  })

  /**
   * Translation messages for the current language
   * Use `as` assertion to ensure correct typing (language is always 'zh-TW' | 'en')
   */
  const t = computed(() => messages[language.value] as I18nMessages)

  /**
   * Current locale
   */
  const locale = computed(() => language.value)

  /**
   * Locale display name
   */
  const localeDisplayName = computed(() => {
    return language.value === 'zh-TW' ? 'Traditional Chinese' : 'English'
  })

  // ==================== Actions ====================

  /**
   * Set language
   */
  const setLanguage = (lang: Language): void => {
    if (lang === 'zh-TW' || lang === 'en') {
      language.value = lang
      localStorage.setItem('language', lang)
      document.documentElement.lang = lang
    }
  }

  /**
   * Set locale (for i18n)
   */
  const setLocale = (newLocale: Language): void => {
    setLanguage(newLocale)
  }

  /**
   * Toggle language
   */
  const toggleLocale = (): void => {
    const nextLang: Language = language.value === 'zh-TW' ? 'en' : 'zh-TW'
    setLanguage(nextLang)
  }

  /**
   * Load language from localStorage
   */
  const loadLanguage = (): void => {
    const saved = localStorage.getItem('language') as Language | null
    if (saved && (saved === 'zh-TW' || saved === 'en')) {
      language.value = saved
    }
  }

  /**
   * Toggle sidebar
   */
  const toggleSidebar = (): void => {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  /**
   * Detect device
   */
  const detectDevice = (): void => {
    isMobile.value = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent,
    )

    window.addEventListener('resize', () => {
      isMobile.value = window.innerWidth < 768
    })
  }

  /**
   * Reset state
   */
  const $reset = (): void => {
    language.value = 'zh-TW'
    isMobile.value = false
    sidebarCollapsed.value = false
  }

  // ==================== Watchers ====================

  watch(
    language,
    (newLang) => {
      document.documentElement.lang = newLang
    },
    { immediate: true },
  )

  // ==================== Return ====================

  return {
    // State
    language,
    isMobile,
    sidebarCollapsed,

    // Computed
    isSmallScreen,
    t,
    locale,
    localeDisplayName,

    // Actions
    setLanguage,
    setLocale,
    toggleLocale,
    loadLanguage,
    toggleSidebar,
    detectDevice,
    $reset,
  }
})
