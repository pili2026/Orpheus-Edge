<template>
  <div class="language-switcher">
    <el-dropdown trigger="click" @command="handleCommand">
      <el-button circle>
        <span class="flag">{{ currentFlag }}</span>
      </el-button>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item
            v-for="lang in languages"
            :key="lang.code"
            :command="lang.code"
            :class="{ active: uiStore.locale === lang.code }"
          >
            <span class="flag">{{ lang.flag }}</span>
            <span class="name">{{ lang.nativeName }}</span>
            <span v-if="uiStore.locale === lang.code" class="check-mark">✓</span>
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useUIStore } from '@/stores/ui'
import type { Language } from '@/types'

// ==================== Store ====================
const uiStore = useUIStore()

// ==================== 資料 ====================

interface LanguageOption {
  code: Language
  name: string
  nativeName: string
  flag: string
}

const languages: LanguageOption[] = [
  {
    code: 'zh-TW',
    name: 'Traditional Chinese',
    nativeName: '繁體中文',
    flag: '🇹🇼',
  },
  {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    flag: '🇺🇸',
  },
]

// ==================== Computed ====================

const currentFlag = computed(() => {
  const current = languages.find((lang) => lang.code === uiStore.locale)
  return current?.flag || '🌐'
})

// ==================== 方法 ====================

function handleCommand(command: Language) {
  uiStore.setLocale(command)
}
</script>

<style scoped>
.language-switcher .flag {
  font-size: 20px;
}

.language-switcher .name {
  font-size: 14px;
  margin-left: 8px;
}

.language-switcher .check-mark {
  margin-left: auto;
  color: var(--el-color-primary);
  font-weight: bold;
  font-size: 16px;
}

.language-switcher :deep(.el-dropdown-menu__item) {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  min-width: 150px;
}

.language-switcher :deep(.el-dropdown-menu__item.active) {
  background-color: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}

.language-switcher :deep(.el-dropdown-menu__item:hover) {
  background-color: var(--el-color-primary-light-8);
}

/* 按鈕樣式 */
.language-switcher :deep(.el-button) {
  border: none;
  background: transparent;
}

.language-switcher :deep(.el-button:hover) {
  background-color: var(--el-color-primary-light-9);
}
</style>
