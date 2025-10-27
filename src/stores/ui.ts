/**
 * UI Store - TypeScript 類型修正版
 * 管理 UI 狀態（語言、主題、i18n 等）
 */
import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { Language } from '@/types'

// Import 外部翻譯檔案
import zhTW from '@/locales/zh-TW'
import en from '@/locales/en'

// 從翻譯檔案推斷類型
type I18nMessages = typeof zhTW

export const useUIStore = defineStore('ui', () => {
  // ==================== State ====================

  const language = ref<Language>('zh-TW')
  const isMobile = ref<boolean>(false)
  const sidebarCollapsed = ref<boolean>(false)

  // 語言訊息對照表
  const messages: Record<Language, I18nMessages> = {
    'zh-TW': zhTW,
    en: en,
  }

  // ==================== Computed ====================

  const isSmallScreen = computed<boolean>(() => {
    return isMobile.value || window.innerWidth < 768
  })

  /**
   * 當前語言的翻譯訊息
   * 使用 as 斷言確保類型正確（language 永遠是 'zh-TW' | 'en'）
   */
  const t = computed(() => messages[language.value] as I18nMessages)

  /**
   * 當前 locale
   */
  const locale = computed(() => language.value)

  /**
   * 語言顯示名稱
   */
  const localeDisplayName = computed(() => {
    return language.value === 'zh-TW' ? '繁體中文' : 'English'
  })

  // ==================== Actions ====================

  /**
   * 設定語言
   */
  const setLanguage = (lang: Language): void => {
    if (lang === 'zh-TW' || lang === 'en') {
      language.value = lang
      localStorage.setItem('language', lang)
      document.documentElement.lang = lang
    }
  }

  /**
   * 設定 locale（i18n 用）
   */
  const setLocale = (newLocale: Language): void => {
    setLanguage(newLocale)
  }

  /**
   * 切換語言
   */
  const toggleLocale = (): void => {
    const nextLang: Language = language.value === 'zh-TW' ? 'en' : 'zh-TW'
    setLanguage(nextLang)
  }

  /**
   * 從 localStorage 載入語言
   */
  const loadLanguage = (): void => {
    const saved = localStorage.getItem('language') as Language | null
    if (saved && (saved === 'zh-TW' || saved === 'en')) {
      language.value = saved
    }
  }

  /**
   * 切換側邊欄
   */
  const toggleSidebar = (): void => {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  /**
   * 檢測設備
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
   * 重置狀態
   */
  const $reset = (): void => {
    language.value = 'zh-TW'
    isMobile.value = false
    sidebarCollapsed.value = false
  }

  // ==================== 監聽 ====================

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
