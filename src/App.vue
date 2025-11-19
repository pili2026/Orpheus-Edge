<template>
  <div id="app">
    <!-- Header Navigation -->
    <div class="app-header">
      <div class="header-left">
        <h1>Modbus 監控系統</h1>
      </div>
      <div class="header-right">
        <!-- WiFi Selector -->
        <WiFiSelector />
        <!-- Language Switcher -->
        <LanguageSwitcher />
      </div>
    </div>

    <!-- 主要內容區域 -->
    <div class="app-content">
      <router-view />
    </div>
  </div>
</template>

<script setup lang="ts">
import LanguageSwitcher from '@/components/common/LanguageSwitcher.vue'
import WiFiSelector from '@/components/common/WiFiSelector.vue'
</script>

<style scoped>
.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.header-left h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #1f2937;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.app-content {
  padding: 24px;
}
</style>
